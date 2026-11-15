import { setupEffect } from "@xstate/effect";
import { Data, Schema } from "effect";
import { initialTransition, transition, types } from "xstate";
import type { EventFromLogic, SnapshotFrom } from "xstate";

export const CHAT_ROOM_QUEUE_SIZE = 50;

export const CHAT_ROOM_RETENTION_MS = 60_000;

export const CHAT_ROOM_REPLAY_MS = 5000;

export const CHAT_ROOM_PING_INTERVAL_MS = 30_000;

export const CHAT_ROOM_CLOSE_CODE = 1000;

export const CHAT_ROOM_CLOSE_REASON = "Connection timeout";

export const CHAT_ROOM_PONG = "pong";

export const ChatRoomFrameSchema = Schema.Struct({
  at: Schema.Natural,
  frame: Schema.String,
});

export type ChatRoomFrame = typeof ChatRoomFrameSchema.Type;

export const ChatRoomSessionSchema = Schema.Struct({
  connectedAt: Schema.Natural,
  id: Schema.String,
  isAlive: Schema.Boolean,
  lastPing: Schema.Natural,
});

export type ChatRoomSession = typeof ChatRoomSessionSchema.Type;

export const ChatRoomStatusSchema = Schema.Literals(["empty", "live"]);

export type ChatRoomStatus = typeof ChatRoomStatusSchema.Type;

export const ChatRoomStateSchema = Schema.Struct({
  queue: Schema.Array(ChatRoomFrameSchema),
  sessions: Schema.Array(ChatRoomSessionSchema),
  status: ChatRoomStatusSchema,
});

export type ChatRoomState = typeof ChatRoomStateSchema.Type;

export const ChatRoomHealthSchema = Schema.Struct({
  connections: Schema.Natural,
  queueSize: Schema.Natural,
});

export type ChatRoomHealth = typeof ChatRoomHealthSchema.Type;

export type ChatRoomEffect = Data.TaggedEnum<{
  Close: {
    readonly code: number;
    readonly reason: string;
    readonly sessionId: string;
  };
  Send: { readonly frame: string; readonly sessionId: string };
}>;

export const chatRoomEffect = Data.taggedEnum<ChatRoomEffect>();

export interface ChatRoomStep {
  readonly effects: readonly ChatRoomEffect[];
  readonly state: ChatRoomState;
}

export const ChatRoomEventsSchema = {
  BROADCAST: Schema.Struct({ at: Schema.Natural, frame: Schema.String }),
  CONNECT: Schema.Struct({ at: Schema.Natural, sessionId: Schema.String }),
  DISCONNECT: Schema.Struct({ at: Schema.Natural, sessionId: Schema.String }),
  MESSAGE: Schema.Struct({
    at: Schema.Natural,
    data: Schema.String,
    sessionId: Schema.String,
  }),
  PING: Schema.Struct({ at: Schema.Natural }),
  TIMEOUT: Schema.Struct({ at: Schema.Natural }),
};

interface ChatRoomContext {
  readonly effects: readonly ChatRoomEffect[] | undefined;
  readonly queue: readonly ChatRoomFrame[];
  readonly sessions: readonly ChatRoomSession[];
}

export const chatRoomPingFrame = (at: number): string =>
  JSON.stringify({ type: "ping", timestamp: at });

export const visitorRoomFrame = (input: {
  readonly at: number;
  readonly content: string;
  readonly messageId: string;
}): string =>
  JSON.stringify({
    role: "user",
    content: input.content,
    id: input.messageId,
    timestamp: input.at,
  });

export const adminRoomFrame = (input: {
  readonly content: string;
  readonly messageId: string;
}): string =>
  JSON.stringify({
    role: "admin",
    content: input.content,
    id: input.messageId,
  });

export const chatRoomHealth = (state: ChatRoomState): ChatRoomHealth => ({
  connections: state.sessions.length,
  queueSize: state.queue.length,
});

const replayEffects = (
  context: ChatRoomContext,
  sessionId: string,
  at: number
): readonly ChatRoomEffect[] =>
  context.queue
    .filter((entry) => entry.at > at - CHAT_ROOM_REPLAY_MS)
    .map((entry) => chatRoomEffect.Send({ frame: entry.frame, sessionId }));

const sendEffects = (
  sessions: readonly ChatRoomSession[],
  frame: string
): readonly ChatRoomEffect[] =>
  sessions.map((session) =>
    chatRoomEffect.Send({ frame, sessionId: session.id })
  );

const closeEffects = (
  sessions: readonly ChatRoomSession[]
): readonly ChatRoomEffect[] =>
  sessions.map((session) =>
    chatRoomEffect.Close({
      code: CHAT_ROOM_CLOSE_CODE,
      reason: CHAT_ROOM_CLOSE_REASON,
      sessionId: session.id,
    })
  );

export const chatRoomMachine = setupEffect({
  schemas: {
    context: types<ChatRoomContext>(),
    events: ChatRoomEventsSchema,
    input: Schema.Struct({}),
  },
}).createMachine({
  context: () => ({ effects: undefined, queue: [], sessions: [] }),
  initial: "empty",
  on: {
    BROADCAST: ({ context, event }) => ({
      context: {
        ...context,
        effects: sendEffects(context.sessions, event.frame),
        queue: [...context.queue, { at: event.at, frame: event.frame }].slice(
          -CHAT_ROOM_QUEUE_SIZE
        ),
      },
    }),
    CONNECT: ({ context, event }) => ({
      context: {
        ...context,
        effects: replayEffects(context, event.sessionId, event.at),
        sessions: [
          ...context.sessions,
          {
            connectedAt: event.at,
            id: event.sessionId,
            isAlive: true,
            lastPing: event.at,
          },
        ],
      },
      target: ".live",
    }),
    DISCONNECT: ({ context, event }) => {
      const sessions = context.sessions.filter(
        (session) => session.id !== event.sessionId
      );

      return {
        context: { ...context, effects: [], sessions },
        target: sessions.length === 0 ? ".empty" : ".live",
      };
    },
    MESSAGE: ({ context, event }) => ({
      context: {
        ...context,
        effects: [],
        sessions:
          event.data === CHAT_ROOM_PONG
            ? context.sessions.map((session) =>
                session.id === event.sessionId
                  ? { ...session, isAlive: true, lastPing: event.at }
                  : session
              )
            : context.sessions,
      },
    }),
  },
  states: {
    empty: {},
    live: {
      on: {
        PING: ({ context, event }) => ({
          context: {
            ...context,
            effects: sendEffects(context.sessions, chatRoomPingFrame(event.at)),
            sessions: context.sessions.map((session) => ({
              ...session,
              isAlive: false,
            })),
          },
        }),
        TIMEOUT: ({ context, event }) => {
          const silent = context.sessions.filter((session) => !session.isAlive);
          const sessions = context.sessions.filter(
            (session) => session.isAlive
          );
          const cutoff = event.at - CHAT_ROOM_RETENTION_MS;

          return {
            context: {
              ...context,
              effects: closeEffects(silent),
              queue: context.queue.filter((entry) => entry.at > cutoff),
              sessions,
            },
            target: sessions.length === 0 ? ".empty" : ".live",
          };
        },
      },
    },
  },
});

export type ChatRoomSnapshot = SnapshotFrom<typeof chatRoomMachine>;

export type ChatRoomEvent = EventFromLogic<typeof chatRoomMachine>;

const decodeStatus = Schema.decodeUnknownSync(ChatRoomStatusSchema);

const chatRoomState = (snapshot: ChatRoomSnapshot): ChatRoomState => ({
  queue: snapshot.context.queue,
  sessions: snapshot.context.sessions,
  status: decodeStatus(snapshot.value),
});

export const startChatRoom = (): ChatRoomState =>
  chatRoomState(initialTransition(chatRoomMachine, {})[0]);

export const stepChatRoom = (
  state: ChatRoomState,
  event: ChatRoomEvent
): ChatRoomStep => {
  const snapshot = chatRoomMachine.resolveState({
    context: {
      effects: undefined,
      queue: state.queue,
      sessions: state.sessions,
    },
    value: state.status,
  });

  const [next] = transition(chatRoomMachine, snapshot, event);

  return { effects: next.context.effects ?? [], state: chatRoomState(next) };
};
