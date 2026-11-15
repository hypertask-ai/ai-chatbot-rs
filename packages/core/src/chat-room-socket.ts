import { Effect, Ref, Schema } from "effect";

import { ChatRoomClock } from "./chat-room-clock.js";
import { startChatRoom, stepChatRoom } from "./chat-room-machine.js";
import type {
  ChatRoomEffect,
  ChatRoomEvent,
  ChatRoomHealth,
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

const jsonHeaders = { "Content-Type": "application/json" } as const;

export const broadcastAnswerResponse = (recipients: number): Response =>
  new Response(JSON.stringify({ success: true, recipients }), {
    headers: jsonHeaders,
  });

export const healthAnswerResponse = (health: ChatRoomHealth): Response =>
  new Response(
    JSON.stringify({
      connections: health.connections,
      queueSize: health.queueSize,
    }),
    { headers: jsonHeaders }
  );

const withoutSession = (
  held: ReadonlyMap<string, RoomSocket>,
  sessionId: string
): ReadonlyMap<string, RoomSocket> => {
  const next = new Map(held);

  next.delete(sessionId);

  return next;
};

const sendTo = (socket: RoomSocket, frame: string): boolean => {
  try {
    socket.send(frame);
    return true;
  } catch {
    return false;
  }
};

const closeSocket = (
  socket: RoomSocket,
  code: number,
  reason: string
): void => {
  try {
    socket.close(code, reason);
  } catch {
    return;
  }
};

export const makeChatRoom = Effect.gen(function* makeChatRoomLive() {
  const clock = yield* ChatRoomClock;
  const state = yield* Ref.make(startChatRoom());
  const sockets = yield* Ref.make<ReadonlyMap<string, RoomSocket>>(new Map());

  const forget = (sessionId: string) =>
    Ref.update(sockets, (held) => withoutSession(held, sessionId));

  const deliver = (effects: readonly ChatRoomEffect[]) =>
    Effect.gen(function* deliverEffects() {
      const held = yield* Ref.get(sockets);
      const failed: string[] = [];

      for (const effect of effects) {
        const socket = held.get(effect.sessionId);

        if (socket === undefined) {
          continue;
        }

        if (effect._tag === "Send") {
          if (!sendTo(socket, effect.frame)) {
            failed.push(effect.sessionId);
          }
        } else {
          closeSocket(socket, effect.code, effect.reason);
          yield* forget(effect.sessionId);
        }
      }

      return failed;
    });

  const apply = (event: ChatRoomEvent) =>
    Effect.gen(function* applyEvent() {
      const current = yield* Ref.get(state);
      const next = stepChatRoom(current, event);

      yield* Ref.set(state, next.state);

      return yield* deliver(next.effects);
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

    return {
      connections: current.sessions.length,
      queueSize: current.queue.length,
    };
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
