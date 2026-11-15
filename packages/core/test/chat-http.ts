import { NodeCrypto } from "@effect/platform-node";
import { toHttpApi } from "@rat-stack/capability/http-api";
import { Effect, FileSystem, Layer, Path, Ref, Schema } from "effect";
import { Etag, HttpPlatform, HttpRouter } from "effect/http";
import type { HttpServerRequest } from "effect/http";
import { HttpApiBuilder } from "effect/http-api";

import {
  ChatConversationStore,
  memoryChatConversations,
} from "../src/chat-conversation-store.js";
import type {
  ChatConversation,
  ChatConversationOperations,
  ChatConversationSeed,
} from "../src/chat-conversation-store.js";
import { leaveHandoffEmail, requestHandoff } from "../src/chat-handoff.js";
import {
  ChatMessageStore,
  memoryChatMessages,
} from "../src/chat-message-store.js";
import type {
  ChatMessage,
  ChatMessageOperations,
  ChatMessageRole,
} from "../src/chat-message-store.js";
import { saveVisitorProfile } from "../src/chat-profile.js";
import { ChatVisitorAuth } from "../src/chat-visitor-auth.js";
import { CustomerAlerts } from "../src/customer-alerts.js";
import type {
  CustomerAlertOperations,
  HandoffAlert,
} from "../src/customer-alerts.js";
import { HandoffEmail } from "../src/handoff-email.js";
import type {
  HandoffEmailMessage,
  HandoffEmailOperations,
} from "../src/handoff-email.js";

export const CHAT_SECOND = 1_700_000_000;

const visitorAuthFromRequest = {
  failure: Schema.Never,
  from: (request: HttpServerRequest.HttpServerRequest) =>
    Effect.succeed({ authorization: request.headers.authorization }),
  tag: ChatVisitorAuth,
};

export const chatApi = toHttpApi(
  "ChatApi",
  [saveVisitorProfile, requestHandoff, leaveHandoffEmail],
  { provide: [visitorAuthFromRequest] }
);

const TestServices = Layer.mergeAll(
  Path.layer,
  Etag.layerWeak,
  HttpPlatform.layer
).pipe(Layer.provideMerge(FileSystem.layerNoop({})));

export const serveChat = (
  conversations: ChatConversationOperations,
  messages: ChatMessageOperations,
  alerts: CustomerAlertOperations,
  teamEmail: HandoffEmailOperations
) =>
  Effect.gen(function* serveChatApi() {
    const services = Layer.mergeAll(
      Layer.succeed(ChatConversationStore, conversations),
      Layer.succeed(ChatMessageStore, messages),
      Layer.succeed(CustomerAlerts, alerts),
      Layer.succeed(HandoffEmail, teamEmail),
      NodeCrypto.layer,
      TestServices
    );

    const app = HttpApiBuilder.layer(chatApi.api).pipe(
      Layer.provide(chatApi.layer),
      Layer.provide(services)
    );

    const { dispose, handler } = HttpRouter.toWebHandler(app, {
      disableLogger: true,
    });

    yield* Effect.addFinalizer(() => Effect.promise(dispose));

    return handler;
  });

const decodeBody = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Schema.Json)
);

export interface ChatRequest {
  readonly authorization?: string | undefined;
  readonly body: Schema.Json;
  readonly path: string;
}

export const postChat = (
  handler: (request: Request) => Promise<Response>,
  request: ChatRequest
) =>
  Effect.gen(function* postChatRequest() {
    const headers = new Headers({ "content-type": "application/json" });

    if (request.authorization !== undefined) {
      headers.set("authorization", request.authorization);
    }

    const response = yield* Effect.promise(() =>
      handler(
        new Request(`http://localhost${request.path}`, {
          body: JSON.stringify(request.body),
          headers,
          method: "POST",
        })
      )
    );

    const text = yield* Effect.promise(() => response.text());

    return {
      body: text === "" ? undefined : yield* decodeBody(text),
      status: response.status,
    };
  });

export const chatConversationSeed = ({
  id,
  ...overrides
}: Partial<ChatConversationSeed> & {
  readonly id: string;
}): ChatConversationSeed => ({
  archived: false,
  email: undefined,
  hasAccount: "unknown",
  id,
  isEval: false,
  name: undefined,
  profileCompleted: false,
  status: "bot",
  updatedAt: CHAT_SECOND - 100,
  visitorSecretHash: undefined,
  ...overrides,
});

export const chatConversationRow = (
  overrides: Partial<ChatConversationSeed> & { readonly id: string }
): ChatConversation => {
  const seed = chatConversationSeed(overrides);

  return {
    archived: seed.archived,
    email: seed.email,
    hasAccount: seed.hasAccount,
    id: seed.id,
    isEval: seed.isEval,
    name: seed.name,
    profileCompleted: seed.profileCompleted,
    status: seed.status,
    updatedAt: seed.updatedAt,
  };
};

export interface ChatMessageSeed {
  readonly content: string;
  readonly conversationId: string;
  readonly role?: ChatMessageRole | undefined;
}

export const chatMessageSeed = (seed: ChatMessageSeed): ChatMessage => {
  const role = seed.role ?? "user";

  return {
    content: seed.content,
    conversationId: seed.conversationId,
    createdAt: CHAT_SECOND - 50,
    id: `${seed.conversationId}:${role}:${seed.content}`,
    role,
  };
};

export const recordingChatAlerts = () =>
  Effect.gen(function* recordChatAlerts() {
    const seen = yield* Ref.make<readonly HandoffAlert[]>([]);

    return {
      alerts: Ref.get(seen),
      operations: {
        handoffRequested: (alert: HandoffAlert) =>
          Ref.update(seen, (held) => [...held, alert]).pipe(Effect.as(true)),
      } satisfies CustomerAlertOperations,
    };
  });

export const recordingTeamEmail = (outcome: boolean) =>
  Effect.gen(function* recordTeamEmail() {
    const sent = yield* Ref.make<readonly HandoffEmailMessage[]>([]);

    return {
      deliveries: Ref.get(sent),
      operations: {
        deliver: (message: HandoffEmailMessage) =>
          Ref.update(sent, (held) => [...held, message]).pipe(
            Effect.as(outcome)
          ),
      } satisfies HandoffEmailOperations,
    };
  });

export const chatStack = (
  seed: readonly ChatConversationSeed[],
  seededMessages: readonly ChatMessage[] = []
) =>
  Effect.gen(function* buildChatStack() {
    const conversations = yield* memoryChatConversations(seed);
    const transcript = yield* memoryChatMessages(seededMessages);
    const alerts = yield* recordingChatAlerts();
    const teamEmail = yield* recordingTeamEmail(true);

    const handler = yield* serveChat(
      conversations.operations,
      transcript.operations,
      alerts.operations,
      teamEmail.operations
    );

    return { alerts, conversations, handler, teamEmail, transcript };
  });
