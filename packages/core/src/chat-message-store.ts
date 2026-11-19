import { Context, Effect, Ref, Schema } from "effect";

export const ChatMessageRoleSchema = Schema.Literals(["user", "bot", "admin"]);

export type ChatMessageRole = typeof ChatMessageRoleSchema.Type;

export const ChatMessageSchema = Schema.Struct({
  content: Schema.String,
  conversationId: Schema.String,
  createdAt: Schema.Natural,
  id: Schema.String,
  role: ChatMessageRoleSchema,
});

export type ChatMessage = typeof ChatMessageSchema.Type;

export interface ChatMessageOperations {
  readonly append: (messages: readonly ChatMessage[]) => Effect.Effect<void>;
  readonly list: (
    conversationId: string
  ) => Effect.Effect<readonly ChatMessage[]>;
}

export class ChatMessageStore extends Context.Service<
  ChatMessageStore,
  ChatMessageOperations
>()("@rat-stack/core/ChatMessageStore") {}

export const memoryChatMessages = (seed: readonly ChatMessage[] = []) =>
  Effect.gen(function* makeMemoryChatMessages() {
    const stored = yield* Ref.make<readonly ChatMessage[]>(seed);

    const operations: ChatMessageOperations = {
      append: (messages) =>
        Ref.update(stored, (held) => [...held, ...messages]),
      list: (conversationId) =>
        Ref.get(stored).pipe(
          Effect.map((held) =>
            held.filter((message) => message.conversationId === conversationId)
          )
        ),
    };

    return { messages: Ref.get(stored), operations };
  });
