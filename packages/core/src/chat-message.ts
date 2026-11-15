import { defineContract } from "@rat-stack/capability/contract";
import { implement } from "@rat-stack/capability/implement";
import { Effect, Schema } from "effect";
import * as SecureRandom from "effect/crypto/SecureRandom";

import { ChatClock } from "./chat-clock.js";
import {
  ConversationNotFound,
  conversationNotFoundFailure,
} from "./chat-contracts.js";
import {
  ChatConversationStore,
  conversationStateOf,
} from "./chat-conversation-store.js";
import type { ChatConversation } from "./chat-conversation-store.js";
import {
  ChatConfig,
  ChatRateLimits,
  ChatRequestFacts,
  ChatRoom,
} from "./chat-message-ports.js";
import { ChatMessageStore } from "./chat-message-store.js";
import {
  ChatVisitorAuth,
  hashVisitorSecret,
  readBearerToken,
} from "./chat-visitor-auth.js";
import { startConversation, stepConversation } from "./conversation-machine.js";
import type {
  ConversationState,
  VisitorAccount,
} from "./conversation-machine.js";
import { CustomerAlerts } from "./customer-alerts.js";

export const UNKNOWN_CLIENT = "unknown";

export const chatMessageRequiredFailure = {
  error: "Message or image is required",
} as const;

export const chatRateLimitedFailure = {
  error: "Too many requests. Please slow down.",
} as const;

export const newConversationRateLimitedFailure = {
  error: "Too many new conversations. Please try again later.",
} as const;

const ChatMessageRequired = Schema.Struct({
  error: Schema.Literal("Message or image is required"),
}).annotate({ httpApiStatus: 400 });

const ChatRateLimited = Schema.Struct({
  error: Schema.Literal("Too many requests. Please slow down."),
}).annotate({ httpApiStatus: 429 });

const NewConversationRateLimited = Schema.Struct({
  error: Schema.Literal("Too many new conversations. Please try again later."),
}).annotate({ httpApiStatus: 429 });

export const chatMessageBodySchema = Schema.Struct({
  conversationId: Schema.optionalKey(Schema.String),
  imageUrl: Schema.optionalKey(Schema.String),
  message: Schema.optionalKey(Schema.String),
  pageTitle: Schema.optionalKey(Schema.String),
  pageUrl: Schema.optionalKey(Schema.String),
  visitorId: Schema.optionalKey(Schema.String),
});

export type ChatMessageBody = typeof chatMessageBodySchema.Type;

export const ChatMessageSentSchema = Schema.Struct({
  conversationId: Schema.String,
  message: Schema.Literal("Message sent"),
  status: Schema.Literals(["handoff_requested", "human"]),
  visitorSecret: Schema.optionalKey(Schema.String),
});

export type ChatMessageSent = typeof ChatMessageSentSchema.Type;

export const ChatMessageStreamedSchema = Schema.Struct({
  conversationId: Schema.String,
  messageId: Schema.String,
  status: Schema.Literal("bot"),
  userMessageId: Schema.String,
  visitorSecret: Schema.optionalKey(Schema.String),
});

export type ChatMessageStreamed = typeof ChatMessageStreamedSchema.Type;

export const ChatMessageAnswerSchema = Schema.Union([
  ChatMessageSentSchema,
  ChatMessageStreamedSchema,
]);

export type ChatMessageAnswer = typeof ChatMessageAnswerSchema.Type;

export const sendChatMessageContract = defineContract("sendChatMessage", {
  description:
    "Accept a visitor chat message: rate limit it, store it once, answer a conversation a person owns, or hand back the ids the answer stream needs.",
  failure: Schema.Union([
    ChatMessageRequired,
    ChatRateLimited,
    NewConversationRateLimited,
    ConversationNotFound,
  ]),
  http: { method: "POST", path: "/api/chat/message" },
  input: chatMessageBodySchema,
  output: ChatMessageAnswerSchema,
});

export interface ChatPageContext {
  readonly title: string;
  readonly url: string;
}

export interface ChatRequestTurn {
  readonly hasImage: boolean;
  readonly imageUrl: string | undefined;
  readonly page: ChatPageContext | null;
  readonly question: string;
  readonly storedContent: string;
}

export interface ChatClientHeaders {
  readonly cfConnectingIp: string | undefined;
  readonly forwardedFor: string | undefined;
}

const present = (value: string | undefined): string | undefined =>
  value === undefined || value === "" ? undefined : value;

export const clientKeyOf = (headers: ChatClientHeaders): string =>
  present(headers.cfConnectingIp) ??
  present(headers.forwardedFor?.split(",")[0]?.trim()) ??
  UNKNOWN_CLIENT;

const parsedUrl = (value: string): URL | undefined => {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
};

export const sanitizePageContext = (
  url: string | undefined,
  title: string | undefined
): ChatPageContext | null => {
  if (url === undefined || url === "" || url.length > 2000) {
    return null;
  }

  const parsed = parsedUrl(url);

  if (parsed === undefined) {
    return null;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return null;
  }

  if (parsed.username !== "" || parsed.password !== "") {
    return null;
  }

  const cleanTitle =
    title === undefined
      ? ""
      : title
          .replaceAll(/[\u0000-\u001F\u007F]/gu, " ")
          .replaceAll(/\s+/gu, " ")
          .trim()
          .slice(0, 200);

  return { title: cleanTitle, url: parsed.toString().slice(0, 500) };
};

export const chatTurnOf = (
  body: ChatMessageBody
): ChatRequestTurn | undefined => {
  const message = body.message ?? "";
  const imageUrl = body.imageUrl;
  const hasMessage = message.trim() !== "";
  const hasImage = imageUrl !== undefined && imageUrl.startsWith("data:image/");

  if (!hasMessage && !hasImage) {
    return undefined;
  }

  const question = hasMessage ? message.trim() : "";

  return {
    hasImage,
    imageUrl: hasImage ? imageUrl : undefined,
    page: sanitizePageContext(body.pageUrl, body.pageTitle),
    question,
    storedContent: hasImage
      ? `${question}${question === "" ? "" : "\n"}[Image attached]`
      : question,
  };
};

const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const alphabetAt = (index: number): string =>
  BASE64_ALPHABET.slice(index, index + 1);

export const visitorSecretOf = (bytes: Uint8Array): string => {
  let encoded = "";

  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    const third = bytes[index + 2];

    encoded += alphabetAt(first >> 2);
    encoded += alphabetAt(((first & 3) << 4) | ((second ?? 0) >> 4));

    if (second === undefined) {
      break;
    }

    encoded += alphabetAt(((second & 15) << 2) | ((third ?? 0) >> 6));

    if (third === undefined) {
      break;
    }

    encoded += alphabetAt(third & 63);
  }

  return encoded.replaceAll("+", "-").replaceAll("/", "_");
};

export const isVerifiedEvalRequest = (
  token: string | undefined,
  secret: string | undefined
): boolean => {
  if (
    token === undefined ||
    token === "" ||
    secret === undefined ||
    secret === ""
  ) {
    return false;
  }

  const provided = new TextEncoder().encode(token);
  const expected = new TextEncoder().encode(secret);
  let difference = provided.length === expected.length ? 0 : 1;
  const length = Math.max(provided.length, expected.length);

  for (let index = 0; index < length; index += 1) {
    difference |= (provided[index] ?? 0) ^ (expected[index] ?? 0);
  }

  return difference === 0;
};

const visitorSecretAnswer = (
  visitorSecret: string | undefined
): { readonly visitorSecret?: string } =>
  visitorSecret === undefined ? {} : { visitorSecret };

const newConversationProfile: {
  readonly account: VisitorAccount;
  readonly email: string | undefined;
  readonly name: string | undefined;
} = { account: "unknown", email: undefined, name: undefined };

export const sendChatMessage = implement(sendChatMessageContract, (input) =>
  Effect.gen(function* sendChatMessageEffect() {
    const turn = chatTurnOf(input);

    if (turn === undefined) {
      return yield* Effect.fail(chatMessageRequiredFailure);
    }

    const facts = yield* ChatRequestFacts;
    const limits = yield* ChatRateLimits;
    const conversations = yield* ChatConversationStore;
    const messages = yield* ChatMessageStore;
    const alerts = yield* CustomerAlerts;
    const room = yield* ChatRoom;
    const auth = yield* ChatVisitorAuth;
    const clock = yield* ChatClock;
    const config = yield* ChatConfig;
    const random = yield* SecureRandom.SecureRandom;

    const requestedId = input.conversationId;
    const isNew = requestedId === undefined || requestedId === "";
    const conversationId =
      requestedId === undefined || requestedId === ""
        ? yield* random.uuidV4()
        : requestedId;
    const requestedVisitor = input.visitorId;
    const visitorId =
      requestedVisitor === undefined || requestedVisitor === ""
        ? yield* random.uuidV4()
        : requestedVisitor;
    const visitorMessageId = yield* random.uuidV4();
    const answerMessageId = yield* random.uuidV4();
    const at = yield* clock.now;

    const general = yield* limits.limitChat(facts.clientKey);
    const fresh = isNew
      ? yield* limits.limitNewConversation(facts.clientKey)
      : { success: true };

    if (!general.success) {
      return yield* Effect.fail(chatRateLimitedFailure);
    }

    if (!fresh.success) {
      return yield* Effect.fail(newConversationRateLimitedFailure);
    }

    let existing: ChatConversation | undefined;

    if (!isNew) {
      existing = yield* conversations.read(conversationId);

      if (existing === undefined) {
        return yield* Effect.fail(conversationNotFoundFailure);
      }
    }

    const isEval = isNew
      ? isVerifiedEvalRequest(facts.evalToken, config.evalIngestSecret)
      : existing?.isEval === true;

    let visitorSecret: string | undefined;
    let visitorSecretHash: string | undefined;

    if (isNew) {
      const presented = readBearerToken(auth.authorization);
      const presentedHash =
        presented === undefined
          ? undefined
          : yield* hashVisitorSecret(presented);
      const owned =
        presentedHash === undefined
          ? false
          : yield* conversations.visitorOwnsSecret({
              secretHash: presentedHash,
              visitorId,
            });

      if (presentedHash !== undefined && owned) {
        visitorSecretHash = presentedHash;
      } else {
        const issued = visitorSecretOf(yield* random.randomBytes(32));
        visitorSecret = issued;
        visitorSecretHash = yield* hashVisitorSecret(issued);
      }
    }

    const state: ConversationState =
      existing === undefined
        ? startConversation({ now: at, profile: newConversationProfile })
        : stepConversation(conversationStateOf(existing), {
            at,
            type: "VISITOR_MESSAGE",
          }).state;

    if (isNew) {
      yield* conversations.create({
        archived: state.archived,
        email: state.profile.email,
        hasAccount: state.profile.account,
        id: conversationId,
        isEval,
        name: state.profile.name,
        profileCompleted: false,
        status: state.status,
        updatedAt: state.updatedAt,
        visitorId,
        visitorSecretHash,
      });
    }

    yield* messages.append([
      {
        content: turn.storedContent,
        conversationId,
        createdAt: state.updatedAt,
        id: visitorMessageId,
        role: "user",
      },
    ]);

    if (!isNew) {
      yield* conversations.touch({ at: state.updatedAt, id: conversationId });
    }

    if (isNew) {
      yield* alerts.newConversation({
        conversationId,
        isEval,
        message: input.message,
      });
    }

    if (state.status === "human" || state.status === "handoff_requested") {
      yield* room.visitorMessage({
        content: turn.storedContent,
        conversationId,
        messageId: visitorMessageId,
      });

      yield* alerts.newMessage({
        conversationId,
        isEval,
        message: turn.storedContent,
        visitorEmail: existing?.email ?? null,
        visitorName: existing?.name ?? null,
      });

      const sent: ChatMessageAnswer = {
        conversationId,
        message: "Message sent",
        status: state.status,
        ...visitorSecretAnswer(visitorSecret),
      };

      return sent;
    }

    const streamed: ChatMessageAnswer = {
      conversationId,
      messageId: answerMessageId,
      status: "bot",
      userMessageId: visitorMessageId,
      ...visitorSecretAnswer(visitorSecret),
    };

    return streamed;
  })
);
