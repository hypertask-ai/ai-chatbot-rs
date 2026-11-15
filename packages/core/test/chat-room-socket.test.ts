import { describe, expect, it } from "@effect/vitest";
import { Effect, Ref } from "effect";

import { ChatRoomClock } from "../src/chat-room-clock.js";
import { chatRoomPingFrame } from "../src/chat-room-machine.js";
import {
  broadcastAnswerResponse,
  healthAnswerResponse,
  makeChatRoom,
} from "../src/chat-room-socket.js";
import type { RoomSocket } from "../src/chat-room-socket.js";

interface RoomMove {
  readonly code: number;
  readonly reason: string;
}

const testClock = (initial: number) =>
  Effect.gen(function* makeTestClock() {
    const at = yield* Ref.make(initial);

    return {
      advance: (millis: number) => Ref.set(at, millis),
      value: { now: Ref.get(at) },
    };
  });

const fakeSocket = () => {
  const closed: RoomMove[] = [];
  const frames: string[] = [];

  const socket: RoomSocket = {
    close: (code, reason) => {
      closed.push({ code, reason });
    },
    send: (frame) => {
      frames.push(frame);
    },
  };

  return { closed, frames, socket };
};

const brokenSocket = (): RoomSocket => ({
  close: () => undefined,
  send: () => {
    throw new Error("the socket is gone");
  },
});

const roomAt = (clock: {
  readonly value: { readonly now: Effect.Effect<number> };
}) => makeChatRoom.pipe(Effect.provideService(ChatRoomClock, clock.value));

describe("chat room sockets", () => {
  it.effect(
    "delivers a broadcast to every socket and answers the recipient count",
    () =>
      Effect.gen(function* deliverBroadcast() {
        const clock = yield* testClock(1000);
        const room = yield* roomAt(clock);

        const first = fakeSocket();
        const second = fakeSocket();

        yield* room.connect("session-a", first.socket);
        yield* room.connect("session-b", second.socket);

        const recipients = yield* room.broadcast("hello");

        expect(recipients).toBe(2);
        expect(first.frames).toEqual(["hello"]);
        expect(second.frames).toEqual(["hello"]);
      })
  );

  it.effect(
    "drops a socket whose send fails and leaves it out of the count",
    () =>
      Effect.gen(function* dropBrokenSocket() {
        const clock = yield* testClock(1000);
        const room = yield* roomAt(clock);

        const first = fakeSocket();

        yield* room.connect("session-a", first.socket);
        yield* room.connect("session-b", brokenSocket());

        const recipients = yield* room.broadcast("hello");

        expect(recipients).toBe(1);
        expect(first.frames).toEqual(["hello"]);

        const health = yield* room.health;

        expect(health.connections).toBe(1);
      })
  );

  it.effect("replays the queued frames to a socket that connects later", () =>
    Effect.gen(function* replayToLateJoiner() {
      const clock = yield* testClock(1000);
      const room = yield* roomAt(clock);

      yield* room.broadcast("first");
      yield* room.broadcast("second");

      const late = fakeSocket();

      yield* clock.advance(3000);
      yield* room.connect("session-b", late.socket);

      expect(late.frames).toEqual(["first", "second"]);
    })
  );

  it.effect(
    "closes a socket that never answers the ping and stops holding it",
    () =>
      Effect.gen(function* closeSilentSocket() {
        const clock = yield* testClock(0);
        const room = yield* roomAt(clock);
        const socket = fakeSocket();

        yield* room.connect("session-a", socket.socket);

        yield* clock.advance(30_000);
        yield* room.tick;

        expect(socket.frames).toEqual([chatRoomPingFrame(30_000)]);
        expect(socket.closed).toEqual([]);

        yield* clock.advance(60_000);
        yield* room.tick;

        expect(socket.closed).toEqual([
          { code: 1000, reason: "Connection timeout" },
        ]);

        const health = yield* room.health;

        expect(health.connections).toBe(0);
      })
  );

  it.effect("keeps a socket that answers the ping alive across the tick", () =>
    Effect.gen(function* keepAnsweredSocket() {
      const clock = yield* testClock(0);
      const room = yield* roomAt(clock);
      const socket = fakeSocket();

      yield* room.connect("session-a", socket.socket);

      yield* clock.advance(30_000);
      yield* room.tick;

      yield* clock.advance(31_000);
      yield* room.receive("session-a", "pong");

      yield* clock.advance(60_000);
      yield* room.tick;

      expect(socket.closed).toEqual([]);

      const health = yield* room.health;

      expect(health.connections).toBe(1);
    })
  );

  it.effect("answers the health body the old room answers", () =>
    Effect.gen(function* answerHealth() {
      const response = healthAnswerResponse({ connections: 2, queueSize: 3 });
      const body = yield* Effect.promise(() => response.text());

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/json");
      expect(body).toBe('{"connections":2,"queueSize":3}');
    })
  );

  it.effect("answers the broadcast body the old room answers", () =>
    Effect.gen(function* answerBroadcast() {
      const response = broadcastAnswerResponse(2);
      const body = yield* Effect.promise(() => response.text());

      expect(response.headers.get("content-type")).toBe("application/json");
      expect(body).toBe('{"success":true,"recipients":2}');
    })
  );
});
