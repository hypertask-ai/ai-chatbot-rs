import { describe, expect, it } from "@effect/vitest";
import { Effect, Ref } from "effect";

import { ChatRoomClock } from "../src/chat-room-clock.js";
import { visitorRoomFrame } from "../src/chat-room-machine.js";
import {
  CHAT_ROOM_BROADCAST_URL,
  CHAT_ROOM_PATH_PATTERN,
  ChatRoomNamespace,
  broadcastChatRoom,
  chatRoomLayer,
  chatRoomNameFromPath,
  connectChatRoom,
} from "../src/chat-room-route.js";
import type { ChatRoomStubOperations } from "../src/chat-room-route.js";
import { broadcastAnswerResponse } from "../src/chat-room-socket.js";
import { ChatRoom } from "../src/chat-room.js";

interface RoomCall {
  readonly body: string;
  readonly method: string;
  readonly path: string;
  readonly room: string;
}

const fakeNamespace = (answer: (call: RoomCall) => Response) =>
  Effect.gen(function* makeFakeNamespace() {
    const calls = yield* Ref.make<readonly RoomCall[]>([]);

    const stub = (room: string): ChatRoomStubOperations => ({
      fetch: (request: Request) =>
        Effect.gen(function* fetchRoom() {
          const body = yield* Effect.promise(() => request.text());

          const call = {
            body,
            method: request.method,
            path: new URL(request.url).pathname,
            room,
          };

          yield* Ref.update(calls, (held) => [...held, call]);

          return answer(call);
        }),
    });

    return { calls: Ref.get(calls), operations: { room: stub } };
  });

describe("chat room connection route", () => {
  it("names the room from the old websocket path and nothing else", () => {
    expect(chatRoomNameFromPath("/api/chat/ws/conversation-1")).toBe(
      "conversation-1"
    );
    expect(chatRoomNameFromPath("/api/chat/ws/")).toBeUndefined();
    expect(chatRoomNameFromPath("/api/chat/ws/a/b")).toBeUndefined();
    expect(chatRoomNameFromPath("/api/chat/ws")).toBeUndefined();
    expect(CHAT_ROOM_PATH_PATTERN.test("/api/chat/ws/conversation-1")).toBe(
      true
    );
  });

  it.effect(
    "refuses a connection request that names no room and reaches no room",
    () =>
      Effect.gen(function* refuseUnnamedRoom() {
        const namespace = yield* fakeNamespace(() => new Response("upgraded"));

        const refused = yield* connectChatRoom(
          new Request("http://localhost/api/chat/ws/")
        ).pipe(Effect.provideService(ChatRoomNamespace, namespace.operations));

        expect(refused.status).toBe(404);

        const body = yield* Effect.promise(() => refused.text());

        expect(body).toBe("404 Not Found");

        const deeper = yield* connectChatRoom(
          new Request("http://localhost/api/chat/ws/a/b")
        ).pipe(Effect.provideService(ChatRoomNamespace, namespace.operations));

        expect(deeper.status).toBe(404);
        expect(yield* namespace.calls).toEqual([]);
      })
  );

  it.effect("refuses a request that is not a GET and reaches no room", () =>
    Effect.gen(function* refusePostedUpgrade() {
      const namespace = yield* fakeNamespace(() => new Response("upgraded"));

      const refused = yield* connectChatRoom(
        new Request("http://localhost/api/chat/ws/conversation-1", {
          method: "POST",
        })
      ).pipe(Effect.provideService(ChatRoomNamespace, namespace.operations));

      expect(refused.status).toBe(404);
      expect(yield* namespace.calls).toEqual([]);
    })
  );

  it.effect(
    "connects the allowed caller to the named room and returns the room answer",
    () =>
      Effect.gen(function* connectAllowedCaller() {
        const answer = new Response("upgraded");
        const namespace = yield* fakeNamespace(() => answer);

        const connected = yield* connectChatRoom(
          new Request("http://localhost/api/chat/ws/conversation-1", {
            headers: { upgrade: "websocket" },
          })
        ).pipe(Effect.provideService(ChatRoomNamespace, namespace.operations));

        expect(connected).toBe(answer);

        const calls = yield* namespace.calls;

        expect(calls.map((call) => call.room)).toEqual(["conversation-1"]);
        expect(calls[0]?.method).toBe("GET");
      })
  );

  it.effect(
    "broadcasts the frame to the named room and reads the recipient count",
    () =>
      Effect.gen(function* broadcastToRoom() {
        const namespace = yield* fakeNamespace(() =>
          broadcastAnswerResponse(2)
        );

        const frame = visitorRoomFrame({
          at: 1000,
          content: "Hi",
          messageId: "msg-1",
        });

        const answer = yield* broadcastChatRoom("conversation-1", frame).pipe(
          Effect.provideService(ChatRoomNamespace, namespace.operations)
        );

        expect(answer).toEqual({ recipients: 2, success: true });
        expect(yield* namespace.calls).toEqual([
          {
            body: frame,
            method: "POST",
            path: "/broadcast",
            room: "conversation-1",
          },
        ]);
        expect(CHAT_ROOM_BROADCAST_URL).toBe("http://internal/broadcast");
      })
  );

  it.effect("sends the visitor broadcast to the conversation's own room", () =>
    Effect.gen(function* broadcastVisitorMessage() {
      const namespace = yield* fakeNamespace(() => broadcastAnswerResponse(0));

      const room = yield* ChatRoom.pipe(
        Effect.provide(chatRoomLayer(namespace.operations)),
        Effect.provideService(ChatRoomClock, { now: Effect.succeed(1000) })
      );

      yield* room.visitorMessage({
        content: "Hi",
        conversationId: "conversation-9",
        messageId: "msg-1",
      });

      const calls = yield* namespace.calls;

      expect(calls.map((call) => call.room)).toEqual(["conversation-9"]);
      expect(calls[0]?.body).toBe(
        visitorRoomFrame({ at: 1000, content: "Hi", messageId: "msg-1" })
      );
    })
  );
});
