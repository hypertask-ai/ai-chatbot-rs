import { Context } from "effect";
import type { Effect } from "effect";

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
