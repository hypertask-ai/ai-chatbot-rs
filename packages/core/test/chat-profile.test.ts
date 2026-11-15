import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

import {
  CHAT_SECOND,
  chatConversationRow,
  chatConversationSeed,
  chatStack,
  postChat,
} from "./chat-http.js";

const PROFILE_PATH = "/api/chat/profile";

it.effect("saves a name and leaves the profile incomplete", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack([chatConversationSeed({ id: "c1" })]);

    const answer = yield* postChat(stack.handler, {
      body: { conversationId: "c1", name: "Ada" },
      path: PROFILE_PATH,
    });

    expect(answer).toEqual({
      body: {
        autoPopulated: {},
        profile: {
          email: null,
          hasAccount: "unknown",
          name: "Ada",
          profileCompleted: false,
        },
        returningCustomer: false,
        success: true,
      },
      status: 200,
    });
    expect(yield* stack.conversations.conversations).toEqual([
      chatConversationRow({ id: "c1", name: "Ada", updatedAt: CHAT_SECOND }),
    ]);
  }).pipe(Effect.scoped)
);

it.effect("trims and lowercases an email and leaves the name empty", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack([chatConversationSeed({ id: "c1" })]);

    const answer = yield* postChat(stack.handler, {
      body: { conversationId: "c1", email: " Ada@Example.COM " },
      path: PROFILE_PATH,
    });

    expect(answer).toEqual({
      body: {
        autoPopulated: {},
        profile: {
          email: "ada@example.com",
          hasAccount: "unknown",
          name: null,
          profileCompleted: false,
        },
        returningCustomer: false,
        success: true,
      },
      status: 200,
    });
    expect(yield* stack.conversations.conversations).toEqual([
      chatConversationRow({
        email: "ada@example.com",
        id: "c1",
        updatedAt: CHAT_SECOND,
      }),
    ]);
  }).pipe(Effect.scoped)
);

it.effect(
  "marks the profile complete when a name and an email are present",
  () =>
    Effect.gen(function* runScenario() {
      const stack = yield* chatStack([chatConversationSeed({ id: "c1" })]);

      const answer = yield* postChat(stack.handler, {
        body: { conversationId: "c1", email: "ada@example.com", name: "Ada" },
        path: PROFILE_PATH,
      });

      expect(answer).toEqual({
        body: {
          autoPopulated: {},
          profile: {
            email: "ada@example.com",
            hasAccount: "unknown",
            name: "Ada",
            profileCompleted: true,
          },
          returningCustomer: false,
          success: true,
        },
        status: 200,
      });
      expect(yield* stack.conversations.conversations).toEqual([
        chatConversationRow({
          email: "ada@example.com",
          id: "c1",
          name: "Ada",
          profileCompleted: true,
          updatedAt: CHAT_SECOND,
        }),
      ]);
    }).pipe(Effect.scoped)
);

it.effect("saves the account type the visitor gives", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack([chatConversationSeed({ id: "c1" })]);

    const answer = yield* postChat(stack.handler, {
      body: { conversationId: "c1", hasAccount: "paid" },
      path: PROFILE_PATH,
    });

    expect(answer).toEqual({
      body: {
        autoPopulated: {},
        profile: {
          email: null,
          hasAccount: "paid",
          name: null,
          profileCompleted: false,
        },
        returningCustomer: false,
        success: true,
      },
      status: 200,
    });
    expect(yield* stack.conversations.conversations).toEqual([
      chatConversationRow({
        hasAccount: "paid",
        id: "c1",
        updatedAt: CHAT_SECOND,
      }),
    ]);
  }).pipe(Effect.scoped)
);

it.effect(
  "refuses an account type outside the four values and writes nothing",
  () =>
    Effect.gen(function* runScenario() {
      const stack = yield* chatStack([chatConversationSeed({ id: "c1" })]);

      const answer = yield* postChat(stack.handler, {
        body: { conversationId: "c1", hasAccount: "partner" },
        path: PROFILE_PATH,
      });

      expect(answer).toEqual({
        body: {
          error: "hasAccount must be one of: unknown, none, free, paid",
        },
        status: 400,
      });
      expect(yield* stack.conversations.conversations).toEqual([
        chatConversationRow({ id: "c1" }),
      ]);
    }).pipe(Effect.scoped)
);

it.effect("validates the account before it reads the conversation", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack([]);

    const answer = yield* postChat(stack.handler, {
      body: { conversationId: "missing", hasAccount: "partner" },
      path: PROFILE_PATH,
    });

    expect(answer).toEqual({
      body: {
        error: "hasAccount must be one of: unknown, none, free, paid",
      },
      status: 400,
    });
  }).pipe(Effect.scoped)
);

it.effect("refuses a body with no profile fields", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack([chatConversationSeed({ id: "c1" })]);

    const answer = yield* postChat(stack.handler, {
      body: { conversationId: "c1" },
      path: PROFILE_PATH,
    });

    expect(answer).toEqual({
      body: { error: "No profile fields provided" },
      status: 400,
    });
    expect(yield* stack.conversations.conversations).toEqual([
      chatConversationRow({ id: "c1" }),
    ]);
  }).pipe(Effect.scoped)
);

it.effect(
  "refuses a missing or empty conversation id before anything else",
  () =>
    Effect.gen(function* runScenario() {
      const stack = yield* chatStack([chatConversationSeed({ id: "c1" })]);

      const missing = yield* postChat(stack.handler, {
        body: { hasAccount: "partner" },
        path: PROFILE_PATH,
      });

      const empty = yield* postChat(stack.handler, {
        body: { conversationId: "", name: "Ada" },
        path: PROFILE_PATH,
      });

      expect(missing).toEqual({
        body: { error: "conversationId is required" },
        status: 400,
      });
      expect(empty).toEqual({
        body: { error: "conversationId is required" },
        status: 400,
      });
    }).pipe(Effect.scoped)
);

it.effect("answers 404 for a conversation that does not exist", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack([]);

    const answer = yield* postChat(stack.handler, {
      body: { conversationId: "missing", name: "Ada" },
      path: PROFILE_PATH,
    });

    expect(answer).toEqual({
      body: { error: "Conversation not found" },
      status: 404,
    });
  }).pipe(Effect.scoped)
);

it.effect("fills a name and an account from a returning customer", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack([
      chatConversationSeed({ id: "c1" }),
      chatConversationSeed({
        email: "ada@example.com",
        hasAccount: "paid",
        id: "c2",
        name: "Ada",
        updatedAt: CHAT_SECOND - 200,
      }),
    ]);

    const answer = yield* postChat(stack.handler, {
      body: { conversationId: "c1", email: " ADA@Example.com " },
      path: PROFILE_PATH,
    });

    expect(answer).toEqual({
      body: {
        autoPopulated: { account: "paid", name: "Ada" },
        profile: {
          email: "ada@example.com",
          hasAccount: "paid",
          name: "Ada",
          profileCompleted: true,
        },
        returningCustomer: true,
        success: true,
      },
      status: 200,
    });
    expect(yield* stack.conversations.conversations).toEqual([
      chatConversationRow({
        email: "ada@example.com",
        hasAccount: "paid",
        id: "c1",
        name: "Ada",
        profileCompleted: true,
        updatedAt: CHAT_SECOND,
      }),
      chatConversationRow({
        email: "ada@example.com",
        hasAccount: "paid",
        id: "c2",
        name: "Ada",
        updatedAt: CHAT_SECOND - 200,
      }),
    ]);
  }).pipe(Effect.scoped)
);

it.effect("does not fill an account the returning customer never set", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack([
      chatConversationSeed({ id: "c1" }),
      chatConversationSeed({
        email: "ada@example.com",
        id: "c2",
        name: "Ada",
        updatedAt: CHAT_SECOND - 200,
      }),
    ]);

    const answer = yield* postChat(stack.handler, {
      body: { conversationId: "c1", email: "ada@example.com" },
      path: PROFILE_PATH,
    });

    expect(answer).toEqual({
      body: {
        autoPopulated: { name: "Ada" },
        profile: {
          email: "ada@example.com",
          hasAccount: "unknown",
          name: "Ada",
          profileCompleted: true,
        },
        returningCustomer: true,
        success: true,
      },
      status: 200,
    });
  }).pipe(Effect.scoped)
);

it.effect(
  "ignores an eval conversation when it looks for a returning customer",
  () =>
    Effect.gen(function* runScenario() {
      const stack = yield* chatStack([
        chatConversationSeed({ id: "c1" }),
        chatConversationSeed({
          email: "ada@example.com",
          id: "c2",
          isEval: true,
          name: "Ada",
          updatedAt: CHAT_SECOND - 200,
        }),
      ]);

      const answer = yield* postChat(stack.handler, {
        body: { conversationId: "c1", email: "ada@example.com" },
        path: PROFILE_PATH,
      });

      expect(answer).toEqual({
        body: {
          autoPopulated: {},
          profile: {
            email: "ada@example.com",
            hasAccount: "unknown",
            name: null,
            profileCompleted: false,
          },
          returningCustomer: false,
          success: true,
        },
        status: 200,
      });
    }).pipe(Effect.scoped)
);

it.effect(
  "does not treat an empty name on another conversation as a returning customer",
  () =>
    Effect.gen(function* runScenario() {
      const stack = yield* chatStack([
        chatConversationSeed({ id: "c1" }),
        chatConversationSeed({
          email: "ada@example.com",
          hasAccount: "paid",
          id: "c2",
          name: "",
          updatedAt: CHAT_SECOND - 200,
        }),
      ]);

      const answer = yield* postChat(stack.handler, {
        body: { conversationId: "c1", email: "ada@example.com" },
        path: PROFILE_PATH,
      });

      expect(answer).toEqual({
        body: {
          autoPopulated: {},
          profile: {
            email: "ada@example.com",
            hasAccount: "unknown",
            name: null,
            profileCompleted: false,
          },
          returningCustomer: false,
          success: true,
        },
        status: 200,
      });
    }).pipe(Effect.scoped)
);

it.effect("stores an email that is not shaped like an email", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack([chatConversationSeed({ id: "c1" })]);

    const answer = yield* postChat(stack.handler, {
      body: { conversationId: "c1", email: "not-an-email" },
      path: PROFILE_PATH,
    });

    expect(answer).toEqual({
      body: {
        autoPopulated: {},
        profile: {
          email: "not-an-email",
          hasAccount: "unknown",
          name: null,
          profileCompleted: false,
        },
        returningCustomer: false,
        success: true,
      },
      status: 200,
    });
    expect(yield* stack.conversations.conversations).toEqual([
      chatConversationRow({
        email: "not-an-email",
        id: "c1",
        updatedAt: CHAT_SECOND,
      }),
    ]);
  }).pipe(Effect.scoped)
);

it.effect("stores a name exactly as sent", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack([chatConversationSeed({ id: "c1" })]);

    const answer = yield* postChat(stack.handler, {
      body: { conversationId: "c1", name: "  Ada  " },
      path: PROFILE_PATH,
    });

    expect(answer).toEqual({
      body: {
        autoPopulated: {},
        profile: {
          email: null,
          hasAccount: "unknown",
          name: "  Ada  ",
          profileCompleted: false,
        },
        returningCustomer: false,
        success: true,
      },
      status: 200,
    });
    expect(yield* stack.conversations.conversations).toEqual([
      chatConversationRow({
        id: "c1",
        name: "  Ada  ",
        updatedAt: CHAT_SECOND,
      }),
    ]);
  }).pipe(Effect.scoped)
);

it.effect(
  "keeps the account from a returning customer when the name is given",
  () =>
    Effect.gen(function* runScenario() {
      const stack = yield* chatStack([
        chatConversationSeed({ id: "c1" }),
        chatConversationSeed({
          email: "ada@example.com",
          hasAccount: "paid",
          id: "c2",
          name: "Ada",
          updatedAt: CHAT_SECOND - 200,
        }),
      ]);

      const answer = yield* postChat(stack.handler, {
        body: {
          conversationId: "c1",
          email: "ada@example.com",
          name: "Grace",
        },
        path: PROFILE_PATH,
      });

      expect(answer).toEqual({
        body: {
          autoPopulated: { account: "paid" },
          profile: {
            email: "ada@example.com",
            hasAccount: "paid",
            name: "Grace",
            profileCompleted: true,
          },
          returningCustomer: true,
          success: true,
        },
        status: 200,
      });
    }).pipe(Effect.scoped)
);

it.effect("keeps a profile complete when the row already holds an email", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatStack([
      chatConversationSeed({
        email: "ada@example.com",
        id: "c1",
        profileCompleted: true,
        updatedAt: CHAT_SECOND - 300,
      }),
    ]);

    const answer = yield* postChat(stack.handler, {
      body: { conversationId: "c1", name: "Ada" },
      path: PROFILE_PATH,
    });

    expect(answer).toEqual({
      body: {
        autoPopulated: {},
        profile: {
          email: "ada@example.com",
          hasAccount: "unknown",
          name: "Ada",
          profileCompleted: true,
        },
        returningCustomer: false,
        success: true,
      },
      status: 200,
    });
    expect(yield* stack.conversations.conversations).toEqual([
      chatConversationRow({
        email: "ada@example.com",
        id: "c1",
        name: "Ada",
        profileCompleted: true,
        updatedAt: CHAT_SECOND,
      }),
    ]);
  }).pipe(Effect.scoped)
);
