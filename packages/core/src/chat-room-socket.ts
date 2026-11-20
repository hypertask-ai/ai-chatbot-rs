import { Effect, Ref, Schema } from "effect";

import { ChatRoomClock } from "./chat-room-clock.js";
import {
  chatRoomHealth,
  startChatRoom,
  stepChatRoom,
} from "./chat-room-machine.js";
import type {
  ChatRoomEvent,
  ChatRoomHealth,
  ChatRoomStep,
  ChatRoomState,
} from "./chat-room-machine.js";

export interface RoomSocket {
  readonly close: (code: number, reason: string) => void;
  readonly send: (frame: string) => void;
}

export interface ChatRoomLive {
  readonly broadcast: (frame: string) => Effect.Effect<number>;
  readonly connect: (
    sessionId: string,
    socket: RoomSocket
  ) => Effect.Effect<void>;
  readonly disconnect: (sessionId: string) => Effect.Effect<void>;
  readonly health: Effect.Effect<ChatRoomHealth>;
  readonly receive: (sessionId: string, data: string) => Effect.Effect<void>;
  readonly state: Effect.Effect<ChatRoomState>;
  readonly tick: Effect.Effect<void>;
}

export const ChatRoomBroadcastAnswerSchema = Schema.Struct({
  recipients: Schema.Natural,
  success: Schema.Boolean,
});

export type ChatRoomBroadcastAnswer = typeof ChatRoomBroadcastAnswerSchema.Type;

export const broadcastAnswerResponse = (recipients: number): Response =>
  Response.json({ recipients, success: true });

export const healthAnswerResponse = (health: ChatRoomHealth): Response =>
  Response.json({
    connections: health.connections,
    queueSize: health.queueSize,
  });

const withoutSession = (
  held: ReadonlyMap<string, RoomSocket>,
  sessionId: string
): ReadonlyMap<string, RoomSocket> => {
  const next = new Map(held);

  next.delete(sessionId);

  return next;
};

const attempt = (act: () => void): boolean => {
  try {
    act();

    return true;
  } catch {
    return false;
  }
};

export const makeChatRoom = Effect.gen(function* makeChatRoomLive() {
  const clock = yield* ChatRoomClock;
  const state = yield* Ref.make(startChatRoom());
  const sockets = yield* Ref.make<ReadonlyMap<string, RoomSocket>>(new Map());

  const forget = (sessionId: string) =>
    Ref.update(sockets, (held) => withoutSession(held, sessionId));

  const deliver = ({ closes, sends }: ChatRoomStep) =>
    Effect.gen(function* deliverEffects() {
      const held = yield* Ref.get(sockets);
      const failed: string[] = [];

      for (const send of sends) {
        const socket = held.get(send.sessionId);

        if (
          socket !== undefined &&
          !attempt(() => {
            socket.send(send.frame);
          })
        ) {
          failed.push(send.sessionId);
        }
      }

      for (const close of closes) {
        const socket = held.get(close.sessionId);

        if (socket !== undefined) {
          attempt(() => {
            socket.close(close.code, close.reason);
          });
        }

        yield* forget(close.sessionId);
      }

      return failed;
    });

  const apply = (event: ChatRoomEvent) =>
    Effect.gen(function* applyEvent() {
      const current = yield* Ref.get(state);
      const next = stepChatRoom(current, event);

      yield* Ref.set(state, next.state);

      return yield* deliver(next);
    });

  const dropFailed = (sessionIds: readonly string[], at: number) =>
    Effect.gen(function* dropFailedSessions() {
      for (const sessionId of sessionIds) {
        yield* forget(sessionId);
        yield* apply({ at, sessionId, type: "DISCONNECT" });
      }
    });

  const connect = (sessionId: string, socket: RoomSocket) =>
    Effect.gen(function* connectSession() {
      const at = yield* clock.now;

      yield* Ref.update(sockets, (held) =>
        new Map(held).set(sessionId, socket)
      );
      yield* apply({ at, sessionId, type: "CONNECT" });
    });

  const disconnect = (sessionId: string) =>
    Effect.gen(function* disconnectSession() {
      const at = yield* clock.now;

      yield* forget(sessionId);
      yield* apply({ at, sessionId, type: "DISCONNECT" });
    });

  const receive = (sessionId: string, data: string) =>
    Effect.gen(function* receiveMessage() {
      const at = yield* clock.now;

      yield* apply({ at, data, sessionId, type: "MESSAGE" });
    });

  const tick = Effect.gen(function* tickRoom() {
    const at = yield* clock.now;

    yield* apply({ at, type: "TIMEOUT" });

    const failed = yield* apply({ at, type: "PING" });

    yield* dropFailed(failed, at);
  });

  const broadcast = (frame: string) =>
    Effect.gen(function* broadcastFrame() {
      const at = yield* clock.now;
      const failed = yield* apply({ at, frame, type: "BROADCAST" });

      yield* dropFailed(failed, at);

      const settled = yield* Ref.get(state);

      return settled.sessions.length;
    });

  const health = Effect.gen(function* readHealth() {
    const current = yield* Ref.get(state);

    return chatRoomHealth(current);
  });

  const operations: ChatRoomLive = {
    broadcast,
    connect,
    disconnect,
    health,
    receive,
    state: Ref.get(state),
    tick,
  };

  return operations;
});
