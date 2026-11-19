import { Context } from "effect";
import type { Effect } from "effect";

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
