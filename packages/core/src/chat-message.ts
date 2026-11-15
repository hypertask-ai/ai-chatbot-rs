import { defineContract } from "@rat-stack/capability/contract";
import { implement } from "@rat-stack/capability/implement";
import { Effect, Schema } from "effect";
import * as SecureRandom from "effect/crypto/SecureRandom";

import { ChatClock } from "./chat-clock.js";
import { ChatConfig } from "./chat-config.js";
import {
  ConversationNotFound,
  conversationNotFoundFailure,
} from "./chat-contracts.js";
import {
  ChatConversationStore,
  conversationStateOf,
} from "./chat-conversation-store.js";
import type {
  ChatConversation,
  ChatConversationOperations,
} from "./chat-conversation-store.js";
import { ChatMessageStore } from "./chat-message-store.js";
import type { ChatMessageOperations } from "./chat-message-store.js";
import { ChatRateLimits } from "./chat-rate-limits.js";
import type { ChatRateLimitOperations } from "./chat-rate-limits.js";
import { ChatRequestFacts } from "./chat-request-facts.js";
import { ChatRoom } from "./chat-room.js";
import {
  ChatVisitorAuth,
  hashVisitorSecret,
  readBearerToken,
} from "./chat-visitor-auth.js";
import { startConversation, stepConversation } from "./conversation-machine.js";
import type { ConversationState } from "./conversation-machine.js";
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
          // oxlint-disable-next-line no-control-regex -- The old route replaces every control character in the page title, so the range is the point.
          .replaceAll(/[\u0000-\u001F\u007F]/gu, " ")
          .replaceAll(/\s+/gu, " ")
          .trim()
          .slice(0, 200);

  return { title: cleanTitle, url: parsed.toString().slice(0, 500) };
};

export const chatTurnOf = (
  body: ChatMessageBody
): ChatRequestTurn | undefined => {
  const { imageUrl, message } = body;
  const text = message ?? "";
  const hasMessage = text.trim() !== "";

  const hasImage = imageUrl !== undefined && imageUrl.startsWith("data:image/");

  if (!hasMessage && !hasImage) {
    return undefined;
  }

  const question = hasMessage ? text.trim() : "";

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

    encoded += alphabetAt(Math.floor(first / 4));
    encoded += alphabetAt((first % 4) * 16 + Math.floor((second ?? 0) / 16));

    if (second === undefined) {
      break;
    }

    encoded += alphabetAt((second % 16) * 4 + Math.floor((third ?? 0) / 64));

    if (third === undefined) {
      break;
    }

    encoded += alphabetAt(third % 64);
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
    const left = provided[index] ?? 0;
    const right = expected[index] ?? 0;

    difference = difference === 0 && left === right ? 0 : 1;
  }

  return difference === 0;
};

export interface ChatMessageIds {
  readonly answerMessageId: string;
  readonly conversationId: string;
  readonly isNew: boolean;
  readonly visitorId: string;
  readonly visitorMessageId: string;
}

const chatIdsOf = (
  body: ChatMessageBody,
  random: SecureRandom.SecureRandom["Service"]
): Effect.Effect<ChatMessageIds> =>
  Effect.gen(function* chatMessageIds() {
    const requestedId = body.conversationId;
    const isNew = requestedId === undefined || requestedId === "";
    const conversationId = isNew ? yield* random.uuidV4() : requestedId;
    const requestedVisitor = body.visitorId;

    const visitorId =
      requestedVisitor === undefined || requestedVisitor === ""
        ? yield* random.uuidV4()
        : requestedVisitor;

    return {
      answerMessageId: yield* random.uuidV4(),
      conversationId,
      isNew,
      visitorId,
      visitorMessageId: yield* random.uuidV4(),
    };
  });

const chatLimitFailure = (
  limits: ChatRateLimitOperations,
  clientKey: string,
  isNew: boolean
): Effect.Effect<
  | typeof chatRateLimitedFailure
  | typeof newConversationRateLimitedFailure
  | undefined
> =>
  Effect.gen(function* chatRateLimiCheck() {
    const general = yield* limits.limitChat(clientKey);

    const fresh = isNew
      ? yield* limits.limitNewConversation(clientKey)
      : { success: true };

    if (!general.success) {
      return chatRateLimitedFailure;
    }

    return fresh.success ? undefined : newConversationRateLimitedFailure;
  });

export interface VisitorSecretChoice {
  readonly visitorSecret?: string;
  readonly visitorSecretHash: string | undefined;
}

const boundVisitorSecret = (
  conversations: ChatConversationOperations,
  random: SecureRandom.SecureRandom["Service"],
  presented: string | undefined,
  visitorId: string
): Effect.Effect<VisitorSecretChoice> =>
  Effect.gen(function* bindVisibleVisitorSecret() {
    const presentedHash =
      presented === undefined ? undefined : yield* hashVisitorSecret(presented);

    if (presentedHash !== undefined) {
      const owned = yield* conversations.visitorOwnsSecret({
        secretHash: presentedHash,
        visitorId,
      });

      if (owned) {
        return { visitorSecretHash: presentedHash };
      }
    }

    const issued = visitorSecretOf(yield* random.randomBytes(32));

    return {
      visitorSecret: issued,
      visitorSecretHash: yield* hashVisitorSecret(issued),
    };
  });

export interface OpenedConversation {
  readonly existing: ChatConversation | undefined;
  readonly state: ConversationState;
}

const openConversation = (
  conversations: ChatConversationOperations,
  ids: ChatMessageIds,
  at: number
): Effect.Effect<OpenedConversation, typeof conversationNotFoundFailure> =>
  Effect.gen(function* openConversationState() {
    if (ids.isNew) {
      return {
        existing: undefined,
        state: startConversation({
          now: at,
          profile: { account: "unknown", email: undefined, name: undefined },
        }),
      };
    }

    const existing = yield* conversations.read(ids.conversationId);

    if (existing === undefined) {
      return yield* Effect.fail(conversationNotFoundFailure);
    }

    return {
      existing,
      state: stepConversation(conversationStateOf(existing), {
        at,
        type: "VISITOR_MESSAGE",
      }).state,
    };
  });

const newConversationRow = (
  ids: ChatMessageIds,
  state: ConversationState,
  isEval: boolean,
  secretHash: string | undefined
) => ({
  archived: state.archived,
  createdAt: state.updatedAt,
  email: state.profile.email,
  hasAccount: state.profile.account,
  id: ids.conversationId,
  isEval,
  name: state.profile.name,
  profileCompleted: false,
  status: state.status,
  updatedAt: state.updatedAt,
  visitorId: ids.visitorId,
  visitorSecretHash: secretHash,
});

const recordVisitorMessage = (
  conversations: ChatConversationOperations,
  messages: ChatMessageOperations,
  ids: ChatMessageIds,
  turn: ChatRequestTurn,
  at: number
): Effect.Effect<void> =>
  Effect.gen(function* recordVisitorMessageRow() {
    yield* messages.append([
      {
        content: turn.storedContent,
        conversationId: ids.conversationId,
        createdAt: at,
        id: ids.visitorMessageId,
        role: "user",
      },
    ]);

    if (!ids.isNew) {
      yield* conversations.touch({ at, id: ids.conversationId });
    }
  });

const sentToPerson = (
  ids: ChatMessageIds,
  status: ChatMessageSent["status"],
  visitorSecret: string | undefined
): ChatMessageSent => {
  const base = {
    conversationId: ids.conversationId,
    message: "Message sent",
    status,
  } as const;

  return visitorSecret === undefined ? base : { ...base, visitorSecret };
};

const streamedAnswer = (
  ids: ChatMessageIds,
  visitorSecret: string | undefined
): ChatMessageStreamed => {
  const base = {
    conversationId: ids.conversationId,
    messageId: ids.answerMessageId,
    status: "bot",
    userMessageId: ids.visitorMessageId,
  } as const;

  return visitorSecret === undefined ? base : { ...base, visitorSecret };
};

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

    const ids = yield* chatIdsOf(input, random);

    const limitFailure = yield* chatLimitFailure(
      limits,
      facts.clientKey,
      ids.isNew
    );

    if (limitFailure !== undefined) {
      return yield* Effect.fail(limitFailure);
    }

    const at = yield* clock.now;
    const opened = yield* openConversation(conversations, ids, at);

    const isEval = ids.isNew
      ? isVerifiedEvalRequest(facts.evalToken, config.evalIngestSecret)
      : opened.existing?.isEval === true;

    const secret = ids.isNew
      ? yield* boundVisitorSecret(
          conversations,
          random,
          readBearerToken(auth.authorization),
          ids.visitorId
        )
      : { visitorSecretHash: undefined };

    if (ids.isNew) {
      yield* conversations.create(
        newConversationRow(ids, opened.state, isEval, secret.visitorSecretHash)
      );
    }

    yield* recordVisitorMessage(
      conversations,
      messages,
      ids,
      turn,
      opened.state.updatedAt
    );

    if (ids.isNew) {
      yield* alerts.newConversation({
        conversationId: ids.conversationId,
        isEval,
        message: input.message,
      });
    }

    const personOwned =
      opened.state.status === "human" ||
      opened.state.status === "handoff_requested";

    if (!personOwned) {
      return streamedAnswer(ids, secret.visitorSecret);
    }

    yield* room.visitorMessage({
      content: turn.storedContent,
      conversationId: ids.conversationId,
      messageId: ids.visitorMessageId,
    });

    yield* alerts.newMessage({
      conversationId: ids.conversationId,
      isEval,
      message: turn.storedContent,
      visitorEmail: opened.existing?.email ?? null,
      visitorName: opened.existing?.name ?? null,
    });

    return sentToPerson(ids, opened.state.status, secret.visitorSecret);
  })
);
