import { describe, expect, it } from "@effect/vitest";

import {
  CHAT_ROOM_PING_INTERVAL_MS,
  CHAT_ROOM_QUEUE_SIZE,
  CHAT_ROOM_RETENTION_MS,
  adminRoomFrame,
  chatRoomPingFrame,
  startChatRoom,
  stepChatRoom,
  visitorRoomFrame,
} from "../src/chat-room-machine.js";
import type { ChatRoomState, ChatRoomStep } from "../src/chat-room-machine.js";

const connect = (state: ChatRoomState, sessionId: string, at: number) =>
  stepChatRoom(state, { at, sessionId, type: "CONNECT" });

const disconnect = (state: ChatRoomState, sessionId: string, at: number) =>
  stepChatRoom(state, { at, sessionId, type: "DISCONNECT" });

const broadcast = (state: ChatRoomState, frame: string, at: number) =>
  stepChatRoom(state, { at, frame, type: "BROADCAST" });

const message = (
  state: ChatRoomState,
  sessionId: string,
  data: string,
  at: number
) => stepChatRoom(state, { at, data, sessionId, type: "MESSAGE" });

const ping = (state: ChatRoomState, at: number) =>
  stepChatRoom(state, { at, type: "PING" });

const timeout = (state: ChatRoomState, at: number) =>
  stepChatRoom(state, { at, type: "TIMEOUT" });

const broadcastAll = (
  state: ChatRoomState,
  frames: readonly string[]
): ChatRoomState => {
  let held = state;

  for (const [index, frame] of frames.entries()) {
    ({ state: held } = broadcast(held, frame, index + 1));
  }

  return held;
};

const framesSentTo = (
  step: ChatRoomStep,
  sessionId: string
): readonly string[] =>
  step.sends.flatMap((send) =>
    send.sessionId === sessionId ? [send.frame] : []
  );

describe("chat room machine", () => {
  it("sends the queued frames to a late joiner in arrival order", () => {
    let queued = broadcast(startChatRoom(), "first", 1000);

    queued = broadcast(queued.state, "second", 2000);

    const joined = connect(queued.state, "session-b", 3000);

    expect(framesSentTo(joined, "session-b")).toEqual(["first", "second"]);
    expect(joined.state.queue.map((entry) => entry.frame)).toEqual([
      "first",
      "second",
    ]);
    expect(joined.state.sessions.map((session) => session.id)).toEqual([
      "session-b",
    ]);
  });

  it("replays only the frames younger than five seconds", () => {
    let queued = broadcast(startChatRoom(), "stale", 1000);

    queued = broadcast(queued.state, "fresh", 7000);

    const joined = connect(queued.state, "session-b", 9000);

    expect(framesSentTo(joined, "session-b")).toEqual(["fresh"]);
    expect(joined.state.queue.map((entry) => entry.frame)).toEqual([
      "stale",
      "fresh",
    ]);
  });

  it("keeps fifty frames and drops the oldest when the fifty first arrives", () => {
    const frames = Array.from(
      { length: CHAT_ROOM_QUEUE_SIZE + 1 },
      (_, index) => `frame-${index}`
    );

    const state = broadcastAll(startChatRoom(), frames);

    expect(state.queue).toHaveLength(CHAT_ROOM_QUEUE_SIZE);
    expect(state.queue[0]?.frame).toBe("frame-1");
    expect(state.queue.at(-1)?.frame).toBe(`frame-${CHAT_ROOM_QUEUE_SIZE}`);
  });

  it("drops a queued frame older than one minute on the tick", () => {
    let held = connect(startChatRoom(), "session-a", 0);

    held = broadcast(held.state, "old", 0);
    held = broadcast(held.state, "young", 1000);

    const swept = timeout(held.state, CHAT_ROOM_RETENTION_MS);

    expect(swept.state.queue.map((entry) => entry.frame)).toEqual(["young"]);
  });

  it("pings every connection and marks it silent on the tick", () => {
    const connected = connect(startChatRoom(), "session-a", 0);
    const swept = ping(connected.state, CHAT_ROOM_PING_INTERVAL_MS);

    expect(framesSentTo(swept, "session-a")).toEqual([
      chatRoomPingFrame(CHAT_ROOM_PING_INTERVAL_MS),
    ]);
    expect(swept.state.sessions[0]?.isAlive).toBe(false);
  });

  it("closes a silent connection on the next tick with the old code and reason", () => {
    let held = connect(startChatRoom(), "session-a", 0);

    held = ping(held.state, 30_000);

    const swept = timeout(held.state, 60_000);

    expect(swept.closes).toEqual([
      { code: 1000, reason: "Connection timeout", sessionId: "session-a" },
    ]);
    expect(swept.state.sessions).toEqual([]);
    expect(swept.state.status).toBe("empty");
  });

  it("keeps a connection that answers the ping", () => {
    let held = connect(startChatRoom(), "session-a", 0);

    held = ping(held.state, 30_000);

    const answered = message(held.state, "session-a", "pong", 31_000);

    expect(answered.state.sessions[0]).toEqual({
      connectedAt: 0,
      id: "session-a",
      isAlive: true,
      lastPing: 31_000,
    });

    const swept = timeout(answered.state, 60_000);

    expect(swept.closes).toEqual([]);
    expect(swept.state.sessions.map((session) => session.id)).toEqual([
      "session-a",
    ]);
  });

  it("ignores an inbound message that is not the pong", () => {
    const connected = connect(startChatRoom(), "session-a", 0);
    const answered = message(connected.state, "session-a", "hello", 1000);

    expect(answered.sends).toEqual([]);
    expect(answered.state.sessions).toEqual(connected.state.sessions);
  });

  it("removes a connection when its socket closes and empties the room at the last one", () => {
    let held = connect(startChatRoom(), "session-a", 0);

    held = connect(held.state, "session-b", 1000);

    const one = disconnect(held.state, "session-a", 2000);

    expect(one.state.sessions.map((session) => session.id)).toEqual([
      "session-b",
    ]);
    expect(one.state.status).toBe("live");

    const none = disconnect(one.state, "session-b", 3000);

    expect(none.state.sessions).toEqual([]);
    expect(none.state.status).toBe("empty");
  });

  it("sends a broadcast frame to every connection and queues it once", () => {
    let held = connect(startChatRoom(), "session-a", 1000);

    held = connect(held.state, "session-b", 1000);

    const sent = broadcast(held.state, "hello", 2000);

    expect(framesSentTo(sent, "session-a")).toEqual(["hello"]);
    expect(framesSentTo(sent, "session-b")).toEqual(["hello"]);
    expect(sent.state.queue.map((entry) => entry.frame)).toEqual(["hello"]);
  });

  it("does not clean the queue while the room holds no connection", () => {
    const queued = broadcast(startChatRoom(), "old", 0);
    const swept = timeout(queued.state, 120_000);

    expect(swept.closes).toEqual([]);
    expect(swept.state.queue.map((entry) => entry.frame)).toEqual(["old"]);
  });

  it("starts every room empty so a restart forgets the connections and the queue", () => {
    expect(startChatRoom()).toEqual({
      queue: [],
      sessions: [],
      status: "empty",
    });

    const joined = connect(startChatRoom(), "session-a", 0);

    expect(joined.sends).toEqual([]);
    expect(joined.state.queue).toEqual([]);
  });

  it("writes the visitor frame in the old key order", () => {
    expect(
      visitorRoomFrame({
        at: 1_700_000_000_000,
        content: "Hi",
        messageId: "msg-1",
      })
    ).toBe(
      '{"role":"user","content":"Hi","id":"msg-1","timestamp":1700000000000}'
    );
  });

  it("writes the admin frame without a timestamp", () => {
    expect(adminRoomFrame({ content: "Hello", messageId: "msg-2" })).toBe(
      '{"role":"admin","content":"Hello","id":"msg-2"}'
    );
  });

  it("writes the ping frame the old room writes", () => {
    expect(chatRoomPingFrame(30_000)).toBe('{"type":"ping","timestamp":30000}');
  });
});
