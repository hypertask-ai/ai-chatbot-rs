import { Config, Context, Schema } from "effect";
import type { Effect } from "effect";

import { ConfigService } from "./config-service.js";

export interface ChatRequestFactsValue {
  readonly clientKey: string;
  readonly evalToken: string | undefined;
}

export const ChatRequestFacts = Context.Reference<ChatRequestFactsValue>(
  "@rat-stack/core/ChatRequestFacts",
  { defaultValue: () => ({ clientKey: "unknown", evalToken: undefined }) }
);

export interface ChatRateLimitAnswer {
  readonly success: boolean;
}

export interface ChatRateLimitOperations {
  readonly limitChat: (key: string) => Effect.Effect<ChatRateLimitAnswer>;
  readonly limitNewConversation: (
    key: string
  ) => Effect.Effect<ChatRateLimitAnswer>;
}

export class ChatRateLimits extends Context.Service<
  ChatRateLimits,
  ChatRateLimitOperations
>()("@rat-stack/core/ChatRateLimits") {}

export const ChatRoomMessageSchema = Schema.Struct({
  content: Schema.String,
  conversationId: Schema.String,
  messageId: Schema.String,
});

export type ChatRoomMessage = typeof ChatRoomMessageSchema.Type;

export interface ChatRoomOperations {
  readonly visitorMessage: (message: ChatRoomMessage) => Effect.Effect<void>;
}

export class ChatRoom extends Context.Service<ChatRoom, ChatRoomOperations>()(
  "@rat-stack/core/ChatRoom"
) {}

export interface FirstAnswerCacheOperations {
  readonly lookup: (question: string) => Effect.Effect<string | undefined>;
  readonly save: (question: string, response: string) => Effect.Effect<void>;
}

export class FirstAnswerCache extends Context.Service<
  FirstAnswerCache,
  FirstAnswerCacheOperations
>()("@rat-stack/core/FirstAnswerCache") {}

export interface ChatArticleContextOperations {
  readonly forQuestion: (question: string) => Effect.Effect<string>;
}

export class ChatArticleContext extends Context.Service<
  ChatArticleContext,
  ChatArticleContextOperations
>()("@rat-stack/core/ChatArticleContext") {}

export interface ChatAnswerCleanupOperations {
  readonly clean: (input: {
    readonly conversationId: string;
    readonly text: string;
  }) => Effect.Effect<string>;
}

export class ChatAnswerCleanup extends Context.Service<
  ChatAnswerCleanup,
  ChatAnswerCleanupOperations
>()("@rat-stack/core/ChatAnswerCleanup") {}

export const ChatCitationSchema = Schema.Struct({
  slug: Schema.String,
  title: Schema.String,
  url: Schema.String,
});

export type ChatCitation = typeof ChatCitationSchema.Type;

export interface ChatCitationsOperations {
  readonly sourcesFor: (
    answer: string
  ) => Effect.Effect<readonly ChatCitation[]>;
}

export class ChatCitations extends Context.Service<
  ChatCitations,
  ChatCitationOperations
>()("@rat-stack/core/ChatCitations") {}

export class ChatConfig extends ConfigService.Service<ChatConfig>()(
  "@rat-stack/core/ChatConfig",
  {
    evalIngestSecret: Config.String("EVAL_INGEST_SECRET").pipe(
      Config.withDefault("")
    ),
  }
) {}
