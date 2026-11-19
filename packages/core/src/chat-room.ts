import { Context, Schema } from "effect";
import type { Effect } from "effect";

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
