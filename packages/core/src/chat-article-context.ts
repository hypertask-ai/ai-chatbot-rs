import { Context } from "effect";
import type { Effect } from "effect";

export interface ChatArticleContextOperations {
  readonly forQuestion: (question: string) => Effect.Effect<string>;
}

export class ChatArticleContext extends Context.Service<
  ChatArticleContext,
  ChatArticleContextOperations
>()("@rat-stack/core/ChatArticleContext") {}
