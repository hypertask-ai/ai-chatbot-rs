import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

import type {
  ChatConversationOperations,
  ChatConversationSeed,
} from "../src/chat-conversation-store.js";
import { memoryChatConversations } from "../src/chat-conversation-store.js";
import { memoryChatMessages } from "../src/chat-message-store.js";
import { customerAlertText } from "../src/customer-alert-text.js";
import {
  CHAT_SECOND,
  chatConversationRow,
  chatConversationSeed,
  chatMessageSeed,
  chatStack,
  failingChatAlerts,
  postChat,
  recordingChatAlerts,
  recordingTeamEmail,
  serveChat,
} from "./chat-http.js";

const HANDOFF_PATH = "/api/chat/handoff";

const EMAIL_PATH = "/api/chat/handoff-email";

const VISITOR_SECRET = "test-secret";

const VISITOR_HASH =
  "9caf06bb4436cdbfa20af9121a626bc1093c4f54b31c0fa937957856135345b6";

const AUTHORIZATION = `Bearer ${VISITOR_SECRET}`;

const owned = (
  id: string,
  {
    visitorSecretHash = VISITOR_HASH,
    ...overrides
  }: Partial<Omit<ChatConversationSeed, "id">> = {}
): ChatConversationSeed => ({
  archived: false,
  email: "ada@example.com",
  hasAccount: "unknown",
  id,
  isEval: false,
  name: "Ada",
  profileCompleted: false,
  status: "bot",
  updatedAt: CHAT_SECOND - 100,
  visitorSecretHash,
  ...overrides,
});

const written = (
  messages: readonly { readonly content: string; readonly role: string }[]
) => messages.map((message) => [message.role, message.content]);

it.effect("refuses a profile with no name or email and writes nothing", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack([chatConversationSeed({ id: "c1" })]);

    const answer = yield* postChat(stack.handler, {
      body: { conversationId: "c1" },
      path: HANDOFF_PATH,
    });

    expect(answer).toEqual({
      body: {
        error: "profile_incomplete",
        message:
          "Please provide your information before connecting with our team.",
        missing: ["name", "email"],
        requiresProfile: true,
      },
      status: 400,
    });
    expect(yield* stack.conversations.conversations).toEqual([
      chatConversationRow({ id: "c1" }),
    ]);
    expect(yield* stack.transcript.messages).toEqual([]);
    expect(yield* stack.alerts.alerts).toEqual([]);
  }).pipe(Effect.scoped)
);

it.effect("names the email as the one missing field", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack([
      chatConversationSeed({ id: "c1", name: "Ada" }),
    ]);

    const answer = yield* postChat(stack.handler, {
      body: { conversationId: "c1" },
      path: HANDOFF_PATH,
    });

    expect(answer).toEqual({
      body: {
        error: "profile_incomplete",
        message:
          "Please provide your information before connecting with our team.",
        missing: ["email"],
        requiresProfile: true,
      },
      status: 400,
    });
  }).pipe(Effect.scoped)
);

it.effect("names the name as the one missing field", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack([
      chatConversationSeed({ email: "ada@example.com", id: "c1" }),
    ]);

    const answer = yield* postChat(stack.handler, {
      body: { conversationId: "c1" },
      path: HANDOFF_PATH,
    });

    expect(answer).toEqual({
      body: {
        error: "profile_incomplete",
        message:
          "Please provide your information before connecting with our team.",
        missing: ["name"],
        requiresProfile: true,
      },
      status: 400,
    });
  }).pipe(Effect.scoped)
);

it.effect("answers 404 for a conversation that does not exist", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack([]);

    const answer = yield* postChat(stack.handler, {
      body: { conversationId: "missing" },
      path: HANDOFF_PATH,
    });

    expect(answer).toEqual({
      body: { error: "Conversation not found" },
      status: 404,
    });
  }).pipe(Effect.scoped)
);

it.effect("ignores the stored profile_completed flag", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack([
      chatConversationSeed({
        email: "ada@example.com",
        id: "c1",
        name: "Ada",
        profileCompleted: false,
      }),
    ]);

    const answer = yield* postChat(stack.handler, {
      body: { conversationId: "c1" },
      path: HANDOFF_PATH,
    });

    expect(answer).toEqual({
      body: { status: "handoff_requested" },
      status: 200,
    });
  }).pipe(Effect.scoped)
);

it.effect(
  "moves the conversation to a person, replies and raises the alert",
  () =>
    Effect.gen(function* runScenario() {
      const stack = yield* chatStack([
        chatConversationSeed({
          email: "ada@example.com",
          id: "c1",
          name: "Ada",
        }),
      ]);

      const answer = yield* postChat(stack.handler, {
        body: { conversationId: "c1" },
        path: HANDOFF_PATH,
      });

      expect(answer).toEqual({
        body: { status: "handoff_requested" },
        status: 200,
      });
      expect(yield* stack.conversations.conversations).toEqual([
        chatConversationRow({
          email: "ada@example.com",
          id: "c1",
          name: "Ada",
          status: "handoff_requested",
          updatedAt: CHAT_SECOND,
        }),
      ]);
      expect(written(yield* stack.transcript.messages)).toEqual([
        [
          "bot",
          "I'll connect you with a human. They'll respond as soon as possible.",
        ],
      ]);
      expect(yield* stack.alerts.alerts).toEqual([
        {
          conversationId: "c1",
          isEval: false,
          visitorEmail: "ada@example.com",
          visitorName: "Ada",
        },
      ]);
    }).pipe(Effect.scoped)
);

it.effect("reopens a closed conversation to a handoff", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack([
      chatConversationSeed({
        email: "ada@example.com",
        id: "c1",
        name: "Ada",
        status: "closed",
      }),
    ]);

    const answer = yield* postChat(stack.handler, {
      body: { conversationId: "c1" },
      path: HANDOFF_PATH,
    });

    expect(answer).toEqual({
      body: { status: "handoff_requested" },
      status: 200,
    });
    expect(yield* stack.conversations.conversations).toEqual([
      chatConversationRow({
        email: "ada@example.com",
        id: "c1",
        name: "Ada",
        status: "handoff_requested",
        updatedAt: CHAT_SECOND,
      }),
    ]);
  }).pipe(Effect.scoped)
);

it.effect("moves a human conversation back to a handoff request", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack([
      chatConversationSeed({
        email: "ada@example.com",
        id: "c1",
        name: "Ada",
        status: "human",
      }),
    ]);

    const answer = yield* postChat(stack.handler, {
      body: { conversationId: "c1" },
      path: HANDOFF_PATH,
    });

    expect(answer).toEqual({
      body: { status: "handoff_requested" },
      status: 200,
    });
  }).pipe(Effect.scoped)
);

it.effect("does not gate a second handoff request", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack([
      chatConversationSeed({
        email: "ada@example.com",
        id: "c1",
        name: "Ada",
        status: "handoff_requested",
        updatedAt: CHAT_SECOND - 1,
      }),
    ]);

    const answer = yield* postChat(stack.handler, {
      body: { conversationId: "c1" },
      path: HANDOFF_PATH,
    });

    expect(answer).toEqual({
      body: { status: "handoff_requested" },
      status: 200,
    });
    expect(written(yield* stack.transcript.messages)).toEqual([
      [
        "bot",
        "I'll connect you with a human. They'll respond as soon as possible.",
      ],
    ]);
    expect(yield* stack.alerts.alerts).toEqual([
      {
        conversationId: "c1",
        isEval: false,
        visitorEmail: "ada@example.com",
        visitorName: "Ada",
      },
    ]);
  }).pipe(Effect.scoped)
);

it.effect("alerts with the eval flag on an eval conversation", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack([
      chatConversationSeed({
        email: "ada@example.com",
        id: "c1",
        isEval: true,
        name: "Ada",
      }),
    ]);

    const answer = yield* postChat(stack.handler, {
      body: { conversationId: "c1" },
      path: HANDOFF_PATH,
    });

    expect(answer).toEqual({
      body: { status: "handoff_requested" },
      status: 200,
    });
    expect(yield* stack.alerts.alerts).toEqual([
      {
        conversationId: "c1",
        isEval: true,
        visitorEmail: "ada@example.com",
        visitorName: "Ada",
      },
    ]);
  }).pipe(Effect.scoped)
);

it.effect("refuses an empty email", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack([owned("c1")]);

    const answer = yield* postChat(stack.handler, {
      authorization: AUTHORIZATION,
      body: { conversationId: "c1" },
      path: EMAIL_PATH,
    });

    expect(answer).toEqual({
      body: { error: "Invalid conversation or email" },
      status: 400,
    });
    expect(yield* stack.conversations.conversations).toEqual([
      chatConversationRow({ email: "ada@example.com", id: "c1", name: "Ada" }),
    ]);
  }).pipe(Effect.scoped)
);

it.effect("refuses an email that is not shaped like an email", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack([owned("c1")]);

    const answer = yield* postChat(stack.handler, {
      authorization: AUTHORIZATION,
      body: { conversationId: "c1", email: "ada" },
      path: EMAIL_PATH,
    });

    expect(answer).toEqual({
      body: { error: "Invalid conversation or email" },
      status: 400,
    });
  }).pipe(Effect.scoped)
);

it.effect("refuses an email longer than 254 characters", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack([owned("c1")]);

    const answer = yield* postChat(stack.handler, {
      authorization: AUTHORIZATION,
      body: { conversationId: "c1", email: `${"a".repeat(243)}@example.com` },
      path: EMAIL_PATH,
    });

    expect(answer).toEqual({
      body: { error: "Invalid conversation or email" },
      status: 400,
    });
  }).pipe(Effect.scoped)
);

it.effect("accepts an email of exactly 254 characters", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack([owned("c1")]);
    const email = `${"a".repeat(242)}@example.com`;

    const answer = yield* postChat(stack.handler, {
      authorization: AUTHORIZATION,
      body: { conversationId: "c1", email },
      path: EMAIL_PATH,
    });

    expect(email).toHaveLength(254);
    expect(answer).toEqual({
      body: { emailed: true, status: "handoff_requested" },
      status: 200,
    });
  }).pipe(Effect.scoped)
);

it.effect("refuses a missing conversation id", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack([owned("c1")]);

    const answer = yield* postChat(stack.handler, {
      authorization: AUTHORIZATION,
      body: { email: "ada@example.com" },
      path: EMAIL_PATH,
    });

    expect(answer).toEqual({
      body: { error: "Invalid conversation or email" },
      status: 400,
    });
  }).pipe(Effect.scoped)
);

it.effect("answers 401 without a bearer token", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack([owned("c1")]);

    const answer = yield* postChat(stack.handler, {
      body: { conversationId: "c1", email: "ada@example.com" },
      path: EMAIL_PATH,
    });

    expect(answer).toEqual({
      body: { error: "Unauthorized" },
      status: 401,
    });
  }).pipe(Effect.scoped)
);

it.effect("answers 401 for a token longer than 512 characters", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack([owned("c1")]);

    const answer = yield* postChat(stack.handler, {
      authorization: `Bearer ${"a".repeat(513)}`,
      body: { conversationId: "c1", email: "ada@example.com" },
      path: EMAIL_PATH,
    });

    expect(answer).toEqual({
      body: { error: "Unauthorized" },
      status: 401,
    });
  }).pipe(Effect.scoped)
);

it.effect(
  "answers 401 for an authorization header that is not a bearer token",
  () =>
    Effect.gen(function* runScenario() {
      const stack = yield* chatStack([owned("c1")]);

      const basic = yield* postChat(stack.handler, {
        authorization: "Basic abc",
        body: { conversationId: "c1", email: "ada@example.com" },
        path: EMAIL_PATH,
      });

      const empty = yield* postChat(stack.handler, {
        authorization: "Bearer",
        body: { conversationId: "c1", email: "ada@example.com" },
        path: EMAIL_PATH,
      });

      expect(basic).toEqual({ body: { error: "Unauthorized" }, status: 401 });
      expect(empty).toEqual({ body: { error: "Unauthorized" }, status: 401 });
    }).pipe(Effect.scoped)
);

it.effect("answers 404 when the secret does not own the conversation", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack([
      owned("c1", {
        visitorSecretHash:
          "b4a3cd9e6956708494054b1944f040a9fb006df2f4b8b32cc94159f0a5ad8cb8",
      }),
    ]);

    const answer = yield* postChat(stack.handler, {
      authorization: AUTHORIZATION,
      body: { conversationId: "c1", email: "ada@example.com" },
      path: EMAIL_PATH,
    });

    expect(answer).toEqual({
      body: { error: "Conversation not found" },
      status: 404,
    });
  }).pipe(Effect.scoped)
);

it.effect("answers 404 for a conversation that does not exist", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack([]);

    const answer = yield* postChat(stack.handler, {
      authorization: AUTHORIZATION,
      body: { conversationId: "missing", email: "ada@example.com" },
      path: EMAIL_PATH,
    });

    expect(answer).toEqual({
      body: { error: "Conversation not found" },
      status: 404,
    });
  }).pipe(Effect.scoped)
);

it.effect(
  "leaves the email, moves to a person, replies and emails the team",
  () =>
    Effect.gen(function* runScenario() {
      const stack = yield* chatStack(
        [
          owned("c1", {
            name: "Ada",
            updatedAt: CHAT_SECOND - 100,
          }),
        ],
        [
          chatMessageSeed({
            content: "How do I create a task?",
            conversationId: "c1",
          }),
          chatMessageSeed({
            content: "Open a board and press N.",
            conversationId: "c1",
            role: "bot",
          }),
        ]
      );

      const answer = yield* postChat(stack.handler, {
        authorization: AUTHORIZATION,
        body: { conversationId: "c1", email: " Ada@Example.COM " },
        path: EMAIL_PATH,
      });

      expect(answer).toEqual({
        body: { emailed: true, status: "handoff_requested" },
        status: 200,
      });
      expect(yield* stack.conversations.conversations).toEqual([
        chatConversationRow({
          email: "ada@example.com",
          id: "c1",
          name: "Ada",
          status: "handoff_requested",
          updatedAt: CHAT_SECOND,
        }),
      ]);
      expect(written(yield* stack.transcript.messages)).toEqual([
        ["user", "How do I create a task?"],
        ["bot", "Open a board and press N."],
        ["user", "Talk to a person"],
        [
          "bot",
          "Sure. A person from our team replies by email within one working day. They see this chat, so you don't need to repeat yourself.",
        ],
      ]);
      expect(yield* stack.alerts.alerts).toEqual([
        {
          conversationId: "c1",
          isEval: false,
          visitorEmail: "ada@example.com",
          visitorName: "Ada",
        },
      ]);
      expect(yield* stack.teamEmail.deliveries).toEqual([
        {
          conversationId: "c1",
          from: "Hypertask Help <help@hypertask.ai>",
          replyTo: "ada@example.com",
          subject: "Help chat: ada@example.com - How do I create a task?",
          text: [
            "Visitor email: ada@example.com",
            "Conversation id: c1",
            "https://help.hypertask.ai/admin#conv=c1",
            "",
            "user: How do I create a task?",
            "",
            "bot: Open a board and press N.",
            "",
            "user: Talk to a person",
            "",
            "bot: Sure. A person from our team replies by email within one working day. They see this chat, so you don't need to repeat yourself.",
          ].join("\n"),
          to: "help@hypertask.ai",
        },
      ]);
    }).pipe(Effect.scoped)
);

it.effect("uses the inserted visitor message as the first question", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack([owned("c1")]);

    const answer = yield* postChat(stack.handler, {
      authorization: AUTHORIZATION,
      body: { conversationId: "c1", email: "ada@example.com" },
      path: EMAIL_PATH,
    });

    expect(answer).toEqual({
      body: { emailed: true, status: "handoff_requested" },
      status: 200,
    });
    expect((yield* stack.teamEmail.deliveries)[0]?.subject).toBe(
      "Help chat: ada@example.com - Talk to a person"
    );
  }).pipe(Effect.scoped)
);

it.effect("keeps the first question to 60 characters and one line", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack(
      [owned("c1")],
      [
        chatMessageSeed({
          content:
            "First line\nsecond line and then a long tail of words past sixty characters",
          conversationId: "c1",
        }),
      ]
    );

    const answer = yield* postChat(stack.handler, {
      authorization: AUTHORIZATION,
      body: { conversationId: "c1", email: "ada@example.com" },
      path: EMAIL_PATH,
    });

    expect(answer.status).toBe(200);
    expect((yield* stack.teamEmail.deliveries)[0]?.subject).toBe(
      "Help chat: ada@example.com - First line second line and then a long tail of words past si"
    );
  }).pipe(Effect.scoped)
);

it.effect("refuses a second request inside the 60 second window", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack([
      owned("c1", {
        status: "handoff_requested",
        updatedAt: CHAT_SECOND - 59,
      }),
    ]);

    const answer = yield* postChat(stack.handler, {
      authorization: AUTHORIZATION,
      body: { conversationId: "c1", email: "grace@example.com" },
      path: EMAIL_PATH,
    });

    expect(answer).toEqual({
      body: { error: "Please wait before trying again" },
      status: 429,
    });
    expect(yield* stack.conversations.conversations).toEqual([
      chatConversationRow({
        email: "ada@example.com",
        id: "c1",
        name: "Ada",
        status: "handoff_requested",
        updatedAt: CHAT_SECOND - 59,
      }),
    ]);
    expect(yield* stack.transcript.messages).toEqual([]);
    expect(yield* stack.alerts.alerts).toEqual([]);
    expect(yield* stack.teamEmail.deliveries).toEqual([]);
  }).pipe(Effect.scoped)
);

it.effect("accepts a second request at exactly 60 seconds", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack([
      owned("c1", {
        status: "handoff_requested",
        updatedAt: CHAT_SECOND - 60,
      }),
    ]);

    const answer = yield* postChat(stack.handler, {
      authorization: AUTHORIZATION,
      body: { conversationId: "c1", email: "grace@example.com" },
      path: EMAIL_PATH,
    });

    expect(answer).toEqual({
      body: { emailed: true, status: "handoff_requested" },
      status: 200,
    });
    expect((yield* stack.conversations.conversations)[0]?.email).toBe(
      "grace@example.com"
    );
  }).pipe(Effect.scoped)
);

it.effect("moves a closed conversation to a handoff request", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack([owned("c1", { status: "closed" })]);

    const answer = yield* postChat(stack.handler, {
      authorization: AUTHORIZATION,
      body: { conversationId: "c1", email: "ada@example.com" },
      path: EMAIL_PATH,
    });

    expect(answer).toEqual({
      body: { emailed: true, status: "handoff_requested" },
      status: 200,
    });
    expect((yield* stack.conversations.conversations)[0]?.status).toBe(
      "handoff_requested"
    );
  }).pipe(Effect.scoped)
);

it.effect("skips the team email on an eval conversation", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack([owned("c1", { isEval: true })]);

    const answer = yield* postChat(stack.handler, {
      authorization: AUTHORIZATION,
      body: { conversationId: "c1", email: "ada@example.com" },
      path: EMAIL_PATH,
    });

    expect(answer).toEqual({
      body: { emailed: false, status: "handoff_requested" },
      status: 200,
    });
    expect(yield* stack.teamEmail.deliveries).toEqual([]);
    expect(yield* stack.alerts.alerts).toEqual([
      {
        conversationId: "c1",
        isEval: true,
        visitorEmail: "ada@example.com",
        visitorName: "Ada",
      },
    ]);
  }).pipe(Effect.scoped)
);

it.effect("reports unsent when the email provider answers false", () =>
  Effect.gen(function* runScenario() {
    const conversations = yield* memoryChatConversations([owned("c1")]);
    const transcript = yield* memoryChatMessages();
    const alerts = yield* recordingChatAlerts();
    const teamEmail = yield* recordingTeamEmail(false);

    const handler = yield* serveChat(
      conversations.operations,
      transcript.operations,
      alerts.operations,
      teamEmail.operations
    );

    const answer = yield* postChat(handler, {
      authorization: AUTHORIZATION,
      body: { conversationId: "c1", email: "ada@example.com" },
      path: EMAIL_PATH,
    });

    expect(answer).toEqual({
      body: { emailed: false, status: "handoff_requested" },
      status: 200,
    });
    expect(yield* teamEmail.deliveries).toHaveLength(1);
  }).pipe(Effect.scoped)
);

it.effect("refuses with 429 when the store's window guard loses the race", () =>
  Effect.gen(function* runScenario() {
    const memory = yield* memoryChatConversations([owned("c1")]);
    const transcript = yield* memoryChatMessages();
    const alerts = yield* recordingChatAlerts();
    const teamEmail = yield* recordingTeamEmail(true);

    const conversations: ChatConversationOperations = {
      ...memory.operations,
      requestHandoffEmail: () => Effect.succeed("too_soon"),
    };

    const handler = yield* serveChat(
      conversations,
      transcript.operations,
      alerts.operations,
      teamEmail.operations
    );

    const answer = yield* postChat(handler, {
      authorization: AUTHORIZATION,
      body: { conversationId: "c1", email: "ada@example.com" },
      path: EMAIL_PATH,
    });

    expect(answer).toEqual({
      body: { error: "Please wait before trying again" },
      status: 429,
    });
  }).pipe(Effect.scoped)
);

it.effect("answers 404 when the store loses the conversation", () =>
  Effect.gen(function* runScenario() {
    const memory = yield* memoryChatConversations([owned("c1")]);
    const transcript = yield* memoryChatMessages();
    const alerts = yield* recordingChatAlerts();
    const teamEmail = yield* recordingTeamEmail(true);

    const conversations: ChatConversationOperations = {
      ...memory.operations,
      requestHandoffEmail: () => Effect.succeed("not_found"),
    };

    const handler = yield* serveChat(
      conversations,
      transcript.operations,
      alerts.operations,
      teamEmail.operations
    );

    const answer = yield* postChat(handler, {
      authorization: AUTHORIZATION,
      body: { conversationId: "c1", email: "ada@example.com" },
      path: EMAIL_PATH,
    });

    expect(answer).toEqual({
      body: { error: "Conversation not found" },
      status: 404,
    });
  }).pipe(Effect.scoped)
);

it.effect("carries the chat the team opens in the alert", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack([
      chatConversationSeed({ email: "ada@example.com", id: "c1", name: "Ada" }),
    ]);

    yield* postChat(stack.handler, {
      body: { conversationId: "c1" },
      path: HANDOFF_PATH,
    });

    const alerts = yield* stack.alerts.alerts;

    expect(
      alerts.map((alert) =>
        customerAlertText({ alert, type: "handoff_requested" })
      )
    ).toEqual([
      '<b>Handoff Requested</b>\n\nCustomer: Ada\nEmail: ada@example.com\n\n<a href="https://help.hypertask.ai/admin#conv=c1">Accept Handoff</a>',
    ]);
  }).pipe(Effect.scoped)
);

it.effect("answers the handoff when the alert sender fails", () =>
  Effect.gen(function* runScenario() {
    const conversations = yield* memoryChatConversations([
      chatConversationSeed({ email: "ada@example.com", id: "c1", name: "Ada" }),
    ]);
    const transcript = yield* memoryChatMessages();
    const teamEmail = yield* recordingTeamEmail(true);

    const handler = yield* serveChat(
      conversations.operations,
      transcript.operations,
      failingChatAlerts(),
      teamEmail.operations
    );

    const answer = yield* postChat(handler, {
      body: { conversationId: "c1" },
      path: HANDOFF_PATH,
    });

    expect(answer).toEqual({
      body: { status: "handoff_requested" },
      status: 200,
    });
    expect(written(yield* transcript.messages)).toEqual([
      [
        "bot",
        "I'll connect you with a human. They'll respond as soon as possible.",
      ],
    ]);
    expect(yield* conversations.conversations).toEqual([
      chatConversationRow({
        email: "ada@example.com",
        id: "c1",
        name: "Ada",
        status: "handoff_requested",
        updatedAt: CHAT_SECOND,
      }),
    ]);
  }).pipe(Effect.scoped)
);
