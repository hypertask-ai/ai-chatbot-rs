import { expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Ref, Schema } from "effect";

import { memoryChatConversations } from "../src/chat-conversation-store.js";
import type {
  ChatConversationOperations,
  ChatConversationSeed,
} from "../src/chat-conversation-store.js";
import { memoryChatMessages } from "../src/chat-message-store.js";
import type { ChatMessage } from "../src/chat-message-store.js";
import { hashVisitorSecret } from "../src/chat-visitor-auth.js";
import {
  CHAT_SECOND,
  chatConversationSeed,
  chatMessageSeed,
  chatStack,
  getChat,
  recordingChatAlerts,
  recordingTeamEmail,
  serveChat,
} from "./chat-http.js";

const OWNER_SECRET = "owner-secret-value";

const OWNER_HASH =
  "98a9428b61fd0fb3663f75f1297b6d59fc60c5c49fbaa9a61e494c9acd77dcca";

const OTHER_SECRET = "other-visitor-secret";

const ADMIN_PASSWORD = "admin-test-password";

const VISITOR_ID = "visitor-1";

const OWNED_ID = "conv-owned";

const LEGACY_ID = "conv-legacy";

const OWNER_AUTHORIZATION = `Bearer ${OWNER_SECRET}`;

const ADMIN_AUTHORIZATION = `Bearer ${ADMIN_PASSWORD}`;

const historyPath = (conversationId: string) =>
  `/api/chat/history/${conversationId}`;

const sessionsPath = (visitorId: string) => `/api/chat/sessions/${visitorId}`;

const owned = (
  id: string,
  overrides: Partial<ChatConversationSeed> = {}
): ChatConversationSeed =>
  chatConversationSeed({
    createdAt: CHAT_SECOND - 300,
    id,
    updatedAt: CHAT_SECOND - 200,
    visitorId: VISITOR_ID,
    visitorSecretHash: OWNER_HASH,
    ...overrides,
  });

const legacy = chatConversationSeed({
  createdAt: CHAT_SECOND - 400,
  id: LEGACY_ID,
  updatedAt: CHAT_SECOND - 300,
  visitorId: VISITOR_ID,
});

const OWNER_TRANSCRIPT: readonly ChatMessage[] = [
  chatMessageSeed({
    content: "first question",
    conversationId: OWNED_ID,
    createdAt: CHAT_SECOND - 60,
  }),
  chatMessageSeed({
    content: "An answer.",
    conversationId: OWNED_ID,
    createdAt: CHAT_SECOND - 50,
    role: "bot",
  }),
];

const LEGACY_TRANSCRIPT: readonly ChatMessage[] = [
  chatMessageSeed({
    content: "legacy leaked note",
    conversationId: LEGACY_ID,
    createdAt: CHAT_SECOND - 380,
  }),
];

const ownerHistory = {
  messages: [
    {
      content: "first question",
      created_at: CHAT_SECOND - 60,
      id: `conv-owned:user:first question`,
      role: "user",
    },
    {
      content: "An answer.",
      created_at: CHAT_SECOND - 50,
      id: `conv-owned:bot:An answer.`,
      role: "bot",
    },
  ],
  status: "bot",
};

const FORBIDDEN = { body: { error: "Forbidden" }, status: 403 };

const UNAUTHORIZED = { body: { error: "Unauthorized" }, status: 401 };

interface RecordedOwnership {
  readonly hashes: Effect.Effect<readonly string[]>;
  readonly operations: ChatConversationOperations;
}

const recordingOwnership = (
  held: ChatConversationOperations
): Effect.Effect<RecordedOwnership> =>
  Effect.gen(function* recordOwnership() {
    const hashes = yield* Ref.make<readonly string[]>([]);

    const record = (secretHash: string) =>
      Ref.update(hashes, (seen) => [...seen, secretHash]);

    return {
      hashes: Ref.get(hashes),
      operations: {
        ...held,
        readAsVisitor: (query) =>
          record(query.secretHash).pipe(
            Effect.andThen(held.readAsVisitor(query))
          ),
        visitorOwnsSecret: (query) =>
          record(query.secretHash).pipe(
            Effect.andThen(held.visitorOwnsSecret(query))
          ),
      },
    };
  });

const recordedStack = (seed: readonly ChatConversationSeed[]) =>
  Effect.gen(function* buildRecordedStack() {
    const conversations = yield* memoryChatConversations(seed);
    const transcript = yield* memoryChatMessages();
    const alerts = yield* recordingChatAlerts();
    const teamEmail = yield* recordingTeamEmail(true);
    const recorded = yield* recordingOwnership(conversations.operations);

    const handler = yield* serveChat(
      recorded.operations,
      transcript.operations,
      alerts.operations,
      teamEmail.operations,
      ADMIN_PASSWORD
    );

    return { handler, hashes: recorded.hashes };
  });

it.effect("reads a conversation's messages and status for its owner", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack([owned(OWNED_ID)], OWNER_TRANSCRIPT);

    const answer = yield* getChat(stack.handler, {
      authorization: OWNER_AUTHORIZATION,
      path: historyPath(OWNED_ID),
    });

    expect(answer).toEqual({ body: ownerHistory, status: 200 });
    expect(JSON.stringify(answer.body).includes(OWNER_HASH)).toBe(false);
  }).pipe(Effect.scoped)
);

it.effect("orders the messages by their created second", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack(
      [owned(OWNED_ID)],
      OWNER_TRANSCRIPT.toReversed()
    );

    const answer = yield* getChat(stack.handler, {
      authorization: OWNER_AUTHORIZATION,
      path: historyPath(OWNED_ID),
    });

    expect(answer).toEqual({ body: ownerHistory, status: 200 });
  }).pipe(Effect.scoped)
);

it.effect("reads a closed conversation for its owner", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack(
      [owned(OWNED_ID, { status: "closed" })],
      OWNER_TRANSCRIPT
    );

    const answer = yield* getChat(stack.handler, {
      authorization: OWNER_AUTHORIZATION,
      path: historyPath(OWNED_ID),
    });

    expect(answer).toEqual({
      body: { ...ownerHistory, status: "closed" },
      status: 200,
    });
  }).pipe(Effect.scoped)
);

it.effect("reads the visitor's sessions newest first for its owner", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack(
      [owned(OWNED_ID, { updatedAt: CHAT_SECOND - 200 }), legacy],
      [...OWNER_TRANSCRIPT, ...LEGACY_TRANSCRIPT]
    );

    const answer = yield* getChat(stack.handler, {
      authorization: OWNER_AUTHORIZATION,
      path: sessionsPath(VISITOR_ID),
    });

    expect(answer).toEqual({
      body: {
        sessions: [
          {
            created_at: CHAT_SECOND - 300,
            id: OWNED_ID,
            last_message: "An answer.",
            status: "bot",
            updated_at: CHAT_SECOND - 200,
          },
        ],
      },
      status: 200,
    });
  }).pipe(Effect.scoped)
);

it.effect(
  "leaves a conversation with no message with a null last message",
  () =>
    Effect.gen(function* runScenario() {
      const stack = yield* chatStack([owned(OWNED_ID)]);

      const answer = yield* getChat(stack.handler, {
        authorization: OWNER_AUTHORIZATION,
        path: sessionsPath(VISITOR_ID),
      });

      expect(answer).toEqual({
        body: {
          sessions: [
            {
              created_at: CHAT_SECOND - 300,
              id: OWNED_ID,
              last_message: null,
              status: "bot",
              updated_at: CHAT_SECOND - 200,
            },
          ],
        },
        status: 200,
      });
    }).pipe(Effect.scoped)
);

it.effect("lists at most twenty sessions, newest first", () =>
  Effect.gen(function* runScenario() {
    const seed = Array.from({ length: 25 }, (_, index) =>
      owned(`conv-${index}`, {
        createdAt: CHAT_SECOND - 100,
        updatedAt: CHAT_SECOND - 100 + index,
      })
    );

    const stack = yield* chatStack(seed);

    const answer = yield* getChat(stack.handler, {
      authorization: OWNER_AUTHORIZATION,
      path: sessionsPath(VISITOR_ID),
    });

    const sessions = yield* Schema.decodeUnknownEffect(
      Schema.Struct({
        sessions: Schema.Array(
          Schema.Struct({
            id: Schema.String,
            last_message: Schema.NullOr(Schema.String),
          })
        ),
      })
    )(answer.body);

    expect(answer.status).toBe(200);
    expect(sessions.sessions).toHaveLength(20);
    expect(sessions.sessions[0]?.id).toBe("conv-24");
    expect(sessions.sessions[19]?.id).toBe("conv-5");
  }).pipe(Effect.scoped)
);

it.effect("refuses another visitor's conversation and sessions", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack([owned(OWNED_ID)], OWNER_TRANSCRIPT);
    const authorization = `Bearer ${OTHER_SECRET}`;

    const conversation = yield* getChat(stack.handler, {
      authorization,
      path: historyPath(OWNED_ID),
    });

    const sessions = yield* getChat(stack.handler, {
      authorization,
      path: sessionsPath(VISITOR_ID),
    });

    expect(conversation).toEqual(FORBIDDEN);
    expect(sessions).toEqual(FORBIDDEN);
    expect(JSON.stringify(conversation.body).includes("first question")).toBe(
      false
    );
  }).pipe(Effect.scoped)
);

it.effect("refuses a visitor id the secret has no conversation with", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack([owned(OWNED_ID)], OWNER_TRANSCRIPT);

    const answer = yield* getChat(stack.handler, {
      authorization: OWNER_AUTHORIZATION,
      path: sessionsPath("someone-else"),
    });

    expect(answer).toEqual(FORBIDDEN);
  }).pipe(Effect.scoped)
);

it.effect(
  "refuses an unknown conversation and the visitor id as a secret",
  () =>
    Effect.gen(function* runScenario() {
      const stack = yield* chatStack([owned(OWNED_ID)], OWNER_TRANSCRIPT);

      const unknown = yield* getChat(stack.handler, {
        authorization: OWNER_AUTHORIZATION,
        path: historyPath("conv-unknown"),
      });

      const asSecret = yield* getChat(stack.handler, {
        authorization: `Bearer ${VISITOR_ID}`,
        path: historyPath(OWNED_ID),
      });

      expect(unknown).toEqual(FORBIDDEN);
      expect(asSecret).toEqual(FORBIDDEN);
    }).pipe(Effect.scoped)
);

it.effect("refuses a legacy conversation that stores no secret", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack([legacy], LEGACY_TRANSCRIPT);

    const owner = yield* getChat(stack.handler, {
      authorization: OWNER_AUTHORIZATION,
      path: historyPath(LEGACY_ID),
    });

    const other = yield* getChat(stack.handler, {
      authorization: `Bearer ${OTHER_SECRET}`,
      path: historyPath(LEGACY_ID),
    });

    expect(owner).toEqual(FORBIDDEN);
    expect(other).toEqual(FORBIDDEN);
  }).pipe(Effect.scoped)
);

it.effect("refuses a read with no identity", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack(
      [owned(OWNED_ID), legacy],
      [...OWNER_TRANSCRIPT, ...LEGACY_TRANSCRIPT]
    );

    const conversation = yield* getChat(stack.handler, {
      path: historyPath(OWNED_ID),
    });

    const sessions = yield* getChat(stack.handler, {
      path: sessionsPath(VISITOR_ID),
    });

    const legacyConversation = yield* getChat(stack.handler, {
      path: historyPath(LEGACY_ID),
    });

    expect(conversation).toEqual(UNAUTHORIZED);
    expect(sessions).toEqual(UNAUTHORIZED);
    expect(legacyConversation).toEqual(UNAUTHORIZED);
  }).pipe(Effect.scoped)
);

it.effect("refuses a forged Cloudflare Access email header", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack([owned(OWNED_ID)], OWNER_TRANSCRIPT);

    const answer = yield* getChat(stack.handler, {
      headers: { "cf-access-authenticated-user-email": "admin@hypertask.ai" },
      path: historyPath(OWNED_ID),
    });

    expect(answer).toEqual(UNAUTHORIZED);
  }).pipe(Effect.scoped)
);

it.effect("reads any conversation and every session for the admin", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack(
      [owned(OWNED_ID), legacy],
      [...OWNER_TRANSCRIPT, ...LEGACY_TRANSCRIPT],
      ADMIN_PASSWORD
    );

    const conversation = yield* getChat(stack.handler, {
      authorization: ADMIN_AUTHORIZATION,
      path: historyPath(LEGACY_ID),
    });

    const sessions = yield* getChat(stack.handler, {
      authorization: ADMIN_AUTHORIZATION,
      path: sessionsPath(VISITOR_ID),
    });

    expect(conversation).toEqual({
      body: {
        messages: [
          {
            content: "legacy leaked note",
            created_at: CHAT_SECOND - 380,
            id: `conv-legacy:user:legacy leaked note`,
            role: "user",
          },
        ],
        status: "bot",
      },
      status: 200,
    });

    expect(sessions).toEqual({
      body: {
        sessions: [
          {
            created_at: CHAT_SECOND - 300,
            id: OWNED_ID,
            last_message: "An answer.",
            status: "bot",
            updated_at: CHAT_SECOND - 200,
          },
          {
            created_at: CHAT_SECOND - 400,
            id: LEGACY_ID,
            last_message: "legacy leaked note",
            status: "bot",
            updated_at: CHAT_SECOND - 300,
          },
        ],
      },
      status: 200,
    });
  }).pipe(Effect.scoped)
);

it.effect("answers an unknown conversation to the admin with no status", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack(
      [owned(OWNED_ID)],
      OWNER_TRANSCRIPT,
      ADMIN_PASSWORD
    );

    const answer = yield* getChat(stack.handler, {
      authorization: ADMIN_AUTHORIZATION,
      path: historyPath("conv-unknown"),
    });

    expect(answer).toEqual({ body: { messages: [] }, status: 200 });
  }).pipe(Effect.scoped)
);

it.effect("treats the admin password only as the exact admin bearer", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack(
      [owned(OWNED_ID)],
      OWNER_TRANSCRIPT,
      ADMIN_PASSWORD
    );

    const extended = yield* getChat(stack.handler, {
      authorization: `Bearer ${ADMIN_PASSWORD}extra`,
      path: historyPath(OWNED_ID),
    });

    const lowerCaseScheme = yield* getChat(stack.handler, {
      authorization: `bearer ${ADMIN_PASSWORD}`,
      path: historyPath(OWNED_ID),
    });

    const barePassword = yield* getChat(stack.handler, {
      authorization: ADMIN_PASSWORD,
      path: historyPath(OWNED_ID),
    });

    expect(extended).toEqual(FORBIDDEN);
    expect(lowerCaseScheme).toEqual(UNAUTHORIZED);
    expect(barePassword).toEqual(UNAUTHORIZED);
  }).pipe(Effect.scoped)
);

it.effect(
  "hashes the presented secret with SHA-256 before asking the store",
  () =>
    Effect.gen(function* runScenario() {
      const stack = yield* recordedStack([owned(OWNED_ID)]);

      const answer = yield* getChat(stack.handler, {
        authorization: OWNER_AUTHORIZATION,
        path: historyPath(OWNED_ID),
      });

      const hashes = yield* stack.hashes;

      expect(answer.status).toBe(200);
      expect(hashes).toEqual([OWNER_HASH]);
      expect(hashes.includes(OWNER_SECRET)).toBe(false);
    }).pipe(Effect.scoped)
);

it.effect("refuses a secret longer than 512 characters before any lookup", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* recordedStack([owned(OWNED_ID)]);

    const answer = yield* getChat(stack.handler, {
      authorization: `Bearer ${"a".repeat(513)}`,
      path: historyPath(OWNED_ID),
    });

    expect(answer).toEqual(FORBIDDEN);
    expect(yield* stack.hashes).toEqual([]);
  }).pipe(Effect.scoped)
);

it.effect("refuses when the ownership read fails", () =>
  Effect.gen(function* runScenario() {
    const conversations = yield* memoryChatConversations([owned(OWNED_ID)]);
    const transcript = yield* memoryChatMessages(OWNER_TRANSCRIPT);
    const alerts = yield* recordingChatAlerts();
    const teamEmail = yield* recordingTeamEmail(true);

    const handler = yield* serveChat(
      {
        ...conversations.operations,
        readAsVisitor: () => Effect.die(new Error("the store is down")),
      },
      transcript.operations,
      alerts.operations,
      teamEmail.operations
    );

    const answer = yield* getChat(handler, {
      authorization: OWNER_AUTHORIZATION,
      path: historyPath(OWNED_ID),
    });

    expect(answer).toEqual(FORBIDDEN);
  }).pipe(Effect.scoped)
);

const secretText = Arbitrary.schema(Schema.String);

const headerSafeSecret = (value: string): string =>
  value.replaceAll(/[^\w.-]/gu, "").slice(0, 200);

it.effect.prop(
  "grants the conversation only to the secret whose hash it stores",
  { other: secretText, owner: secretText },
  ({ other, owner }) =>
    Effect.gen(function* runScenario() {
      const ownerSecret = headerSafeSecret(owner);
      const otherSecret = headerSafeSecret(other);

      if (
        ownerSecret !== "" &&
        otherSecret !== "" &&
        ownerSecret !== otherSecret
      ) {
        const ownerHash = yield* hashVisitorSecret(ownerSecret);

        const stack = yield* chatStack(
          [owned(OWNED_ID, { visitorSecretHash: ownerHash })],
          OWNER_TRANSCRIPT
        );

        const allowed = yield* getChat(stack.handler, {
          authorization: `Bearer ${ownerSecret}`,
          path: historyPath(OWNED_ID),
        });

        const refused = yield* getChat(stack.handler, {
          authorization: `Bearer ${otherSecret}`,
          path: historyPath(OWNED_ID),
        });

        expect(allowed.status).toBe(200);
        expect(refused).toEqual(FORBIDDEN);
      }
    }).pipe(Effect.scoped),
  { arbitrary: { runs: 25 } }
);
