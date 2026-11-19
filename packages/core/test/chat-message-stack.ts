import { NodeCrypto } from "@effect/platform-node";
import { toHttpApi } from "@rat-stack/capability/http-api";
import { Effect, Layer, Ref, Schema, FileSystem, Path } from "effect";
import type { Scope } from "effect";
import { Etag, HttpPlatform, HttpRouter } from "effect/http";
import type { HttpServerRequest } from "effect/http";
import { HttpApiBuilder } from "effect/http-api";

import {
  AnswerModel,
  answerModelFailure,
  emptyUsage,
} from "../src/answer-model.js";
import type {
  AnswerModelFailure,
  AnswerRequest,
  TokenUsage,
} from "../src/answer-model.js";
import { ChatAnswerCleanup } from "../src/chat-answer-cleanup.js";
import type { ChatAnswerCleanupOperations } from "../src/chat-answer-cleanup.js";
import { ChatArticleContext } from "../src/chat-article-context.js";
import type { ChatArticleContextOperations } from "../src/chat-article-context.js";
import { ChatCitations } from "../src/chat-citations.js";
import type {
  ChatCitation,
  ChatCitationsOperations,
} from "../src/chat-citations.js";
import { ChatClock } from "../src/chat-clock.js";
import { ChatConfig } from "../src/chat-config.js";
import {
  ChatConversationStore,
  memoryChatConversations,
} from "../src/chat-conversation-store.js";
import type {
  ChatConversation,
  ChatConversationOperations,
  ChatConversationSeed,
} from "../src/chat-conversation-store.js";
import {
  ChatMessageStore,
  memoryChatMessages,
} from "../src/chat-message-store.js";
import type {
  ChatMessage,
  ChatMessageOperations,
} from "../src/chat-message-store.js";
import {
  ChatMessageAnswerSchema,
  sendChatMessage,
} from "../src/chat-message.js";
import type { ChatMessageAnswer } from "../src/chat-message.js";
import { ChatRateLimits } from "../src/chat-rate-limits.js";
import type { ChatRateLimitOperations } from "../src/chat-rate-limits.js";
import { ChatRequestFacts } from "../src/chat-request-facts.js";
import { ChatRoom } from "../src/chat-room.js";
import type { ChatRoomMessage, ChatRoomOperations } from "../src/chat-room.js";
import { ChatVisitorAuth } from "../src/chat-visitor-auth.js";
import { CustomerAlerts } from "../src/customer-alerts.js";
import type {
  CustomerAlertOperations,
  HandoffAlert,
  NewConversationAlert,
  NewMessageAlert,
} from "../src/customer-alerts.js";
import { FirstAnswerCache } from "../src/first-answer-cache.js";
import type { FirstAnswerCacheOperations } from "../src/first-answer-cache.js";
import { CHAT_SECOND } from "./chat-http.js";

export { CHAT_SECOND } from "./chat-http.js";

export const ARTICLE_CONTEXT =
  "AVAILABLE ARTICLES (ONLY link to these - do NOT invent other URLs):\n---\nTitle: Pricing plans\nPro is $16 per user / month.";

export const CITATION: ChatCitation = {
  slug: "pricing-plans",
  title: "Pricing plans",
  url: "https://help.hypertask.ai/help/pricing-plans",
};

export interface ScriptedAnswer {
  readonly failure?: "refused" | "retryable" | undefined;
  readonly hold?: Effect.Effect<void> | undefined;
  readonly pieces: readonly string[];
  readonly stopReason?: string | null | undefined;
  readonly usage?: Partial<TokenUsage> | undefined;
  readonly viaDefect?: boolean | undefined;
}

const scriptedAnswerModel = (script: readonly ScriptedAnswer[]) =>
  Effect.gen(function* buildScriptedAnswerModel() {
    const calls = yield* Ref.make(0);
    const remaining = yield* Ref.make(script);
    const requests = yield* Ref.make<readonly AnswerRequest[]>([]);

    const stream = (
      request: AnswerRequest,
      onText: (text: string) => Effect.Effect<void>
    ): Effect.Effect<
      { stopReason: string | null; thinkingTokens: number; usage: TokenUsage },
      AnswerModelFailure
    > =>
      Effect.gen(function* streamScriptedAnswer() {
        const [answer, ...rest] = yield* Ref.get(remaining);

        yield* Ref.set(remaining, rest);
        yield* Ref.update(calls, (held) => held + 1);
        yield* Ref.update(requests, (held) => [...held, request]);

        if (answer === undefined) {
          return yield* Effect.fail(
            answerModelFailure.AnswerRefused({ detail: "no script", status: 0 })
          );
        }

        for (const piece of answer.pieces) {
          yield* onText(piece);
        }

        if (answer.hold !== undefined) {
          yield* answer.hold;
        }

        if (answer.failure === "retryable") {
          return yield* Effect.fail(
            answerModelFailure.RetryableAnswerFailure({
              detail: "overloaded",
              status: 529,
            })
          );
        }

        if (answer.viaDefect === true) {
          return yield* Effect.die(new Error("the answer stream broke"));
        }

        if (answer.failure === "refused") {
          return yield* Effect.fail(
            answerModelFailure.AnswerRefused({
              detail: "overloaded",
              status: 500,
            })
          );
        }

        return {
          stopReason: answer.stopReason ?? "end_turn",
          thinkingTokens: 0,
          usage: { ...emptyUsage(), ...answer.usage },
        };
      });

    return {
      calls: Ref.get(calls),
      operations: { stream },
      requests: Ref.get(requests),
    };
  });

export interface ChatMessageStackInput {
  readonly answers?: readonly ScriptedAnswer[] | undefined;
  readonly cached?: readonly (readonly [string, string])[] | undefined;
  readonly chats?: readonly ChatConversationSeed[] | undefined;
  readonly cleanup?: ((text: string) => string) | undefined;
  readonly evalSecret?: string | undefined;
  readonly limitChat?: boolean | undefined;
  readonly limitNewConversation?: boolean | undefined;
  readonly messages?: readonly ChatMessage[] | undefined;
}

const visitorAuthFromRequest = {
  failure: Schema.Never,
  from: (request: HttpServerRequest.HttpServerRequest) =>
    Effect.succeed({ authorization: request.headers.authorization }),
  tag: ChatVisitorAuth,
};

const requestFactsFromRequest = {
  failure: Schema.Never,
  from: (request: HttpServerRequest.HttpServerRequest) =>
    Effect.succeed({
      clientKey:
        request.headers["cf-connecting-ip"] ??
        request.headers["x-forwarded-for"]?.split(",")[0]?.trim() ??
        "unknown",
      evalToken: request.headers["x-eval-token"],
    }),
  tag: ChatRequestFacts,
};

export const chatMessageApi = toHttpApi("ChatMessageApi", [sendChatMessage], {
  provide: [visitorAuthFromRequest, requestFactsFromRequest],
});

const TestServices = Layer.mergeAll(
  Path.layer,
  Etag.layerWeak,
  HttpPlatform.layer
).pipe(Layer.provideMerge(FileSystem.layerNoop({})));

export interface ChatMessageStack {
  readonly answer: {
    readonly articles: ChatArticleContextOperations;
    readonly cache: FirstAnswerCacheOperations;
    readonly citations: ChatCitationsOperations;
    readonly cleanup: ChatAnswerCleanupOperations;
    readonly clock: { readonly now: Effect.Effect<number> };
    readonly conversations: ChatConversationOperations;
    readonly messages: ChatMessageOperations;
    readonly model: AnswerModel["Service"];
  };
  readonly alert: {
    readonly handoffs: Effect.Effect<readonly HandoffAlert[]>;
    readonly newConversations: Effect.Effect<readonly NewConversationAlert[]>;
    readonly newMessages: Effect.Effect<readonly NewMessageAlert[]>;
  };
  readonly ask: {
    readonly articles: Effect.Effect<readonly string[]>;
  };
  readonly cache: {
    readonly looked: Effect.Effect<readonly string[]>;
    readonly saved: Effect.Effect<
      readonly { readonly question: string; readonly response: string }[]
    >;
    readonly stored: Effect.Effect<ReadonlyMap<string, string>>;
  };
  readonly charged: Effect.Effect<readonly string[]>;
  readonly clean: Effect.Effect<
    readonly { readonly conversationId: string; readonly text: string }[]
  >;
  readonly cited: Effect.Effect<readonly string[]>;
  readonly conversations: Effect.Effect<readonly ChatConversation[]>;
  readonly handler: (request: Request) => Promise<Response>;
  readonly messages: Effect.Effect<readonly ChatMessage[]>;
  readonly modelCalls: Effect.Effect<number>;
  readonly modelRequests: Effect.Effect<readonly AnswerRequest[]>;
  readonly room: Effect.Effect<readonly ChatRoomMessage[]>;
}

export const chatMessageStack = (
  input: ChatMessageStackInput = {}
): Effect.Effect<ChatMessageStack, never, Scope.Scope> =>
  Effect.gen(function* buildChatMessageStack() {
    const conversations = yield* memoryChatConversations(input.chats ?? []);
    const transcript = yield* memoryChatMessages(input.messages ?? []);

    const model = yield* scriptedAnswerModel(
      input.answers ?? [{ pieces: ["An answer."] }]
    );

    const handoffs = yield* Ref.make<readonly HandoffAlert[]>([]);

    const newConversations = yield* Ref.make<readonly NewConversationAlert[]>(
      []
    );

    const newMessages = yield* Ref.make<readonly NewMessageAlert[]>([]);
    const room = yield* Ref.make<readonly ChatRoomMessage[]>([]);
    const charged = yield* Ref.make<readonly string[]>([]);
    const looked = yield* Ref.make<readonly string[]>([]);

    const saved = yield* Ref.make<
      readonly { readonly question: string; readonly response: string }[]
    >([]);

    const cached = yield* Ref.make<ReadonlyMap<string, string>>(
      new Map(input.cached)
    );

    const cleaned = yield* Ref.make<
      readonly { readonly conversationId: string; readonly text: string }[]
    >([]);

    const asked = yield* Ref.make<readonly string[]>([]);
    const cited = yield* Ref.make<readonly string[]>([]);
    const clock = { now: Effect.succeed(CHAT_SECOND) };

    const alerts: CustomerAlertOperations = {
      handoffRequested: (alert: HandoffAlert) =>
        Ref.update(handoffs, (held) => [...held, alert]).pipe(
          Effect.as(!alert.isEval)
        ),
      newConversation: (alert: NewConversationAlert) =>
        Ref.update(newConversations, (held) => [...held, alert]).pipe(
          Effect.as(!alert.isEval)
        ),
      newMessage: (alert: NewMessageAlert) =>
        Ref.update(newMessages, (held) => [...held, alert]).pipe(
          Effect.as(!alert.isEval)
        ),
    };

    const roomOperations: ChatRoomOperations = {
      visitorMessage: (message: ChatRoomMessage) =>
        Ref.update(room, (held) => [...held, message]),
    };

    const rateLimits: ChatRateLimitOperations = {
      limitChat: (key: string) =>
        Ref.update(charged, (held) => [...held, `chat:${key}`]).pipe(
          Effect.as({ success: input.limitChat ?? true })
        ),
      limitNewConversation: (key: string) =>
        Ref.update(charged, (held) => [...held, `new:${key}`]).pipe(
          Effect.as({ success: input.limitNewConversation ?? true })
        ),
    };

    const cache: FirstAnswerCacheOperations = {
      lookup: (question: string) =>
        Ref.update(looked, (held) => [...held, question]).pipe(
          Effect.andThen(
            Ref.get(cached).pipe(Effect.map((held) => held.get(question)))
          )
        ),
      save: (question: string, response: string) =>
        Ref.update(saved, (held) => [...held, { question, response }]).pipe(
          Effect.andThen(
            Ref.update(cached, (held) => new Map(held).set(question, response))
          )
        ),
    };

    const articles: ChatArticleContextOperations = {
      forQuestion: (question: string) =>
        Ref.update(asked, (held) => [...held, question]).pipe(
          Effect.as(ARTICLE_CONTEXT)
        ),
    };

    const cleanup: ChatAnswerCleanupOperations = {
      clean: (value: { conversationId: string; text: string }) =>
        Ref.update(cleaned, (held) => [...held, value]).pipe(
          Effect.as(
            input.cleanup === undefined ? value.text : input.cleanup(value.text)
          )
        ),
    };

    const citations: ChatCitationsOperations = {
      sourcesFor: (answer: string) =>
        Ref.update(cited, (held) => [...held, answer]).pipe(
          Effect.as([CITATION])
        ),
    };

    const services = Layer.mergeAll(
      Layer.succeed(ChatConversationStore, conversations.operations),
      Layer.succeed(ChatMessageStore, transcript.operations),
      Layer.succeed(AnswerModel, model.operations),
      Layer.succeed(ChatClock, clock),
      Layer.succeed(ChatRoom, roomOperations),
      Layer.succeed(ChatRateLimits, rateLimits),
      Layer.succeed(FirstAnswerCache, cache),
      Layer.succeed(ChatArticleContext, articles),
      Layer.succeed(ChatAnswerCleanup, cleanup),
      Layer.succeed(ChatCitations, citations),
      Layer.succeed(CustomerAlerts, alerts),
      ChatConfig.configLayer({ evalIngestSecret: input.evalSecret ?? "" }),
      NodeCrypto.layer
    );

    const app = HttpApiBuilder.layer(chatMessageApi.api).pipe(
      Layer.provide(chatMessageApi.layer),
      Layer.provide(Layer.mergeAll(services, TestServices))
    );

    const { dispose, handler } = HttpRouter.toWebHandler(app, {
      disableLogger: true,
    });

    yield* Effect.addFinalizer(() => Effect.promise(dispose));

    return {
      alert: {
        handoffs: Ref.get(handoffs),
        newConversations: Ref.get(newConversations),
        newMessages: Ref.get(newMessages),
      },
      answer: {
        articles,
        cache,
        citations,
        cleanup,
        clock,
        conversations: conversations.operations,
        messages: transcript.operations,
        model: model.operations,
      },
      ask: { articles: Ref.get(asked) },
      cache: {
        looked: Ref.get(looked),
        saved: Ref.get(saved),
        stored: Ref.get(cached),
      },
      charged: Ref.get(charged),
      cited: Ref.get(cited),
      clean: Ref.get(cleaned),
      conversations: conversations.conversations,
      handler,
      messages: transcript.messages,
      modelCalls: model.calls,
      modelRequests: model.requests,
      room: Ref.get(room),
    };
  });

const decodeBody = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Schema.Json)
);

const decodeAnswer = Schema.decodeUnknownEffect(ChatMessageAnswerSchema);

export interface ChatMessageRequest {
  readonly authorization?: string | undefined;
  readonly body: Schema.Json;
  readonly clientKey?: string | undefined;
  readonly evalToken?: string | undefined;
}

export const postChatMessage = (
  handler: (request: Request) => Promise<Response>,
  request: ChatMessageRequest
) =>
  Effect.gen(function* postChatMessageRequest() {
    const headers = new Headers({ "content-type": "application/json" });

    if (request.authorization !== undefined) {
      headers.set("authorization", request.authorization);
    }

    if (request.evalToken !== undefined) {
      headers.set("x-eval-token", request.evalToken);
    }

    headers.set("cf-connecting-ip", request.clientKey ?? "203.0.113.7");

    const response = yield* Effect.promise(() =>
      handler(
        new Request("http://localhost/api/chat/message", {
          body: JSON.stringify(request.body),
          headers,
          method: "POST",
        })
      )
    );

    const body = yield* Effect.promise(() => response.text());

    const decoded: Schema.Json | undefined =
      body === "" ? undefined : yield* decodeBody(body);

    const answer: ChatMessageAnswer | undefined =
      response.status === 200 && decoded !== undefined
        ? yield* decodeAnswer(decoded)
        : undefined;

    return { answer, body: decoded, status: response.status };
  });

export const answerLayer = (stack: ChatMessageStack) =>
  Layer.mergeAll(
    Layer.succeed(ChatConversationStore, stack.answer.conversations),
    Layer.succeed(ChatMessageStore, stack.answer.messages),
    Layer.succeed(FirstAnswerCache, stack.answer.cache),
    Layer.succeed(ChatArticleContext, stack.answer.articles),
    Layer.succeed(ChatAnswerCleanup, stack.answer.cleanup),
    Layer.succeed(ChatCitations, stack.answer.citations),
    Layer.succeed(ChatClock, stack.answer.clock),
    Layer.succeed(AnswerModel, stack.answer.model)
  );

export const chatMessageRow = (
  overrides: Partial<ChatConversationSeed> & { readonly id: string }
): ChatConversationSeed => {
  const { id, ...rest } = overrides;

  return {
    archived: false,
    email: undefined,
    hasAccount: "unknown",
    id,
    isEval: false,
    name: undefined,
    profileCompleted: false,
    status: "bot",
    updatedAt: CHAT_SECOND - 100,
    visitorId: "visitor-1",
    visitorSecretHash: undefined,
    ...rest,
  };
};

export const storedMessage = (input: {
  readonly content: string;
  readonly conversationId: string;
  readonly createdAt?: number | undefined;
  readonly id: string;
  readonly role?: "admin" | "bot" | "user" | undefined;
}): ChatMessage => ({
  content: input.content,
  conversationId: input.conversationId,
  createdAt: input.createdAt ?? CHAT_SECOND,
  id: input.id,
  role: input.role ?? "user",
});
