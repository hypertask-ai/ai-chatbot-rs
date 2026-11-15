import { Context, Effect, Layer, Schema } from "effect";

import { ChatRoomClock } from "./chat-room-clock.js";
import { visitorRoomFrame } from "./chat-room-machine.js";
import { ChatRoomBroadcastAnswerSchema } from "./chat-room-socket.js";
import type { ChatRoomBroadcastAnswer } from "./chat-room-socket.js";
import { ChatRoom } from "./chat-room.js";
import type { ChatRoomMessage } from "./chat-room.js";

export const CHAT_ROOM_PATH_PATTERN = /^\/api\/chat\/ws\/(?<room>[^/]+)$/u;

export const CHAT_ROOM_BROADCAST_URL = "http://internal/broadcast";

export const chatRoomNotFound = (): Response =>
  new Response("404 Not Found", { status: 404 });

export const chatRoomNameFromPath = (pathname: string): string | undefined => {
  const name = CHAT_ROOM_PATH_PATTERN.exec(pathname)?.groups?.room;

  return name === undefined || name === "" ? undefined : name;
};

export interface ChatRoomStubOperations {
  readonly fetch: (request: Request) => Effect.Effect<Response>;
}

export interface ChatRoomNamespaceOperations {
  readonly room: (name: string) => ChatRoomStubOperations;
}

export class ChatRoomNamespace extends Context.Service<
  ChatRoomNamespace,
  ChatRoomNamespaceOperations
>()("@rat-stack/core/ChatRoomNamespace") {}

const decodeBroadcastAnswer = Schema.decodeUnknownEffect(
  Schema.fromJsonString(ChatRoomBroadcastAnswerSchema)
);

export const connectChatRoom = (
  request: Request
): Effect.Effect<Response, never, ChatRoomNamespace> =>
  Effect.gen(function* connectChatRoomRequest() {
    const name = chatRoomNameFromPath(new URL(request.url).pathname);

    if (request.method !== "GET" || name === undefined) {
      return chatRoomNotFound();
    }

    const namespace = yield* ChatRoomNamespace;

    return yield* namespace.room(name).fetch(request);
  });

export const broadcastChatRoom = (
  name: string,
  frame: string
): Effect.Effect<ChatRoomBroadcastAnswer, never, ChatRoomNamespace> =>
  Effect.gen(function* broadcastChatRoomFrame() {
    const namespace = yield* ChatRoomNamespace;

    const response = yield* namespace
      .room(name)
      .fetch(
        new Request(CHAT_ROOM_BROADCAST_URL, { body: frame, method: "POST" })
      );

    const body = yield* Effect.promise(() => response.text());

    return yield* decodeBroadcastAnswer(body).pipe(Effect.orDie);
  });

export const chatRoomLayer = Layer.unwrap(
  Effect.gen(function* bindChatRoom() {
    const clock = yield* ChatRoomClock;

    return Layer.succeed(ChatRoom, {
      visitorMessage: (message: ChatRoomMessage) =>
        Effect.gen(function* broadcastVisitorMessage() {
          const at = yield* clock.now;

          yield* broadcastChatRoom(
            message.conversationId,
            visitorRoomFrame({
              at,
              content: message.content,
              messageId: message.messageId,
            })
          );
        }),
    });
  })
);
