import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

import type {
  ChatMessageAnswer,
  ChatMessageStreamed,
} from "../src/chat-message.js";
import { hashVisitorSecret } from "../src/chat-visitor-auth.js";
import {
  CHAT_SECOND,
  chatMessageRow,
  chatMessageStack,
  postChatMessage,
  storedMessage,
} from "./chat-message-stack.js";

const planOf = (answer: ChatMessageAnswer | undefined): ChatMessageStreamed => {
  if (answer === undefined || answer.status !== "bot") {
    throw new Error(
      `expected a streamed answer, got ${String(answer?.status)}`
    );
  }

  return answer;
};

it.effect("refuses a blank message and an image that is not a data url", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatMessageStack();
    const blank = yield* postChatMessage(stack.handler, {
      body: { message: "   " },
    });
    const remote = yield* postChatMessage(stack.handler, {
      body: { imageUrl: "https://example.com/shot.png" },
    });

    expect({ body: blank.body, status: blank.status }).toEqual({
      body: { error: "Message or image is required" },
      status: 400,
    });
    expect({ body: remote.body, status: remote.status }).toEqual({
      body: { error: "Message or image is required" },
      status: 400,
    });
    expect(yield* stack.conversations).toEqual([]);
    expect(yield* stack.messages).toEqual([]);
  }).pipe(Effect.scoped)
);

it.effect("stores the trimmed message once and hands back the answer ids", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatMessageStack();
    const response = yield* postChatMessage(stack.handler, {
      body: { message: "  How much is Pro?  ", visitorId: "visitor-1" },
    });
    const plan = planOf(response.answer);
    const rows = yield* stack.conversations;
    const stored = yield* stack.messages;

    expect(response.status).toBe(200);
    expect(plan.status).toBe("bot");
    expect(plan.messageId).not.toBe(plan.userMessageId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      archived: false,
      hasAccount: "unknown",
      id: plan.conversationId,
      isEval: false,
      profileCompleted: false,
      status: "bot",
      updatedAt: CHAT_SECOND,
      visitorId: "visitor-1",
    });
    expect(stored).toEqual([
      storedMessage({
        content: "How much is Pro?",
        conversationId: plan.conversationId,
        id: plan.userMessageId,
      }),
    ]);
    expect(yield* stack.alert.newConversations).toEqual([
      {
        conversationId: plan.conversationId,
        isEval: false,
        message: "  How much is Pro?  ",
      },
    ]);
    expect(yield* stack.charged).toEqual([
      "chat:203.0.113.7",
      "new:203.0.113.7",
    ]);
  }).pipe(Effect.scoped)
);

it.effect(
  "issues one visitor secret for a new conversation and stores its hash",
  () =>
    Effect.gen(function* runScenario() {
      const stack = yield* chatMessageStack();
      const response = yield* postChatMessage(stack.handler, {
        body: { message: "Hello", visitorId: "visitor-1" },
      });
      const plan = planOf(response.answer);
      const secret = plan.visitorSecret ?? "";
      const rows = yield* stack.conversations;
      const expectedHash = yield* hashVisitorSecret(secret);

      expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/u);
      expect(rows[0]?.visitorSecretHash).toBe(expectedHash);
    }).pipe(Effect.scoped)
);

it.effect("keeps a presented secret that already belongs to the visitor", () =>
  Effect.gen(function* runScenario() {
    const presented = yield* hashVisitorSecret("presented-secret");
    const stack = yield* chatMessageStack({
      chats: [
        chatMessageRow({
          id: "old",
          visitorId: "visitor-1",
          visitorSecretHash: presented,
        }),
      ],
    });
    const response = yield* postChatMessage(stack.handler, {
      authorization: "Bearer presented-secret",
      body: { message: "Hello again", visitorId: "visitor-1" },
    });
    const plan = planOf(response.answer);
    const rows = yield* stack.conversations;

    expect(plan.visitorSecret).toBeUndefined();
    expect(rows[1]?.visitorSecretHash).toBe(presented);
  }).pipe(Effect.scoped)
);

it.effect(
  "issues a new secret when the presented one belongs to someone else",
  () =>
    Effect.gen(function* runScenario() {
      const other = yield* hashVisitorSecret("presented-secret");
      const stack = yield* chatMessageStack({
        chats: [
          chatMessageRow({
            id: "old",
            visitorId: "visitor-2",
            visitorSecretHash: other,
          }),
        ],
      });
      const response = yield* postChatMessage(stack.handler, {
        authorization: "Bearer presented-secret",
        body: { message: "Hello", visitorId: "visitor-1" },
      });
      const plan = planOf(response.answer);
      const rows = yield* stack.conversations;

      expect(plan.visitorSecret).toMatch(/^[A-Za-z0-9_-]{43}$/u);
      expect(rows[1]?.visitorSecretHash).not.toBe(other);
    }).pipe(Effect.scoped)
);

it.effect(
  "marks a new conversation as eval only when the token matches the secret",
  () =>
    Effect.gen(function* runScenario() {
      const marked = yield* chatMessageStack({ evalSecret: "eval-secret" });
      const response = yield* postChatMessage(marked.handler, {
        body: { message: "Replay this", visitorId: "visitor-1" },
        evalToken: "eval-secret",
      });
      const plan = planOf(response.answer);

      expect(yield* marked.conversations).toMatchObject([{ isEval: true }]);
      expect(yield* marked.alert.newConversations).toEqual([
        {
          conversationId: plan.conversationId,
          isEval: true,
          message: "Replay this",
        },
      ]);

      const unmarked = yield* chatMessageStack({ evalSecret: "eval-secret" });

      yield* postChatMessage(unmarked.handler, {
        body: { message: "Replay this" },
        evalToken: "wrong",
      });

      expect(yield* unmarked.conversations).toMatchObject([{ isEval: false }]);
    }).pipe(Effect.scoped)
);

it.effect("never flips the eval flag on a later message", () =>
  Effect.gen(function* runScenario() {
    const real = yield* chatMessageStack({
      chats: [chatMessageRow({ id: "c1", isEval: false })],
      evalSecret: "eval-secret",
    });

    yield* postChatMessage(real.handler, {
      body: { conversationId: "c1", message: "Later" },
      evalToken: "eval-secret",
    });

    expect(yield* real.conversations).toMatchObject([{ isEval: false }]);

    const replay = yield* chatMessageStack({
      chats: [chatMessageRow({ id: "c1", isEval: true })],
      evalSecret: "eval-secret",
    });

    yield* postChatMessage(replay.handler, {
      body: { conversationId: "c1", message: "Later" },
    });

    expect(yield* replay.conversations).toMatchObject([{ isEval: true }]);
  }).pipe(Effect.scoped)
);

it.effect("stores an attached image as a line under the text", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatMessageStack();
    const response = yield* postChatMessage(stack.handler, {
      body: {
        imageUrl: "data:image/png;base64,AAAA",
        message: "hello",
        visitorId: "visitor-1",
      },
    });
    const plan = planOf(response.answer);

    expect(yield* stack.messages).toEqual([
      storedMessage({
        content: "hello\n[Image attached]",
        conversationId: plan.conversationId,
        id: plan.userMessageId,
      }),
    ]);
  }).pipe(Effect.scoped)
);

it.effect("answers 404 for a conversation that does not exist", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatMessageStack();
    const response = yield* postChatMessage(stack.handler, {
      body: { conversationId: "missing", message: "Hello" },
    });

    expect({ body: response.body, status: response.status }).toEqual({
      body: { error: "Conversation not found" },
      status: 404,
    });
    expect(yield* stack.messages).toEqual([]);
  }).pipe(Effect.scoped)
);

it.effect("answers 429 when the chat limit is spent, before any read", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatMessageStack({ limitChat: false });
    const response = yield* postChatMessage(stack.handler, {
      body: { conversationId: "missing", message: "Hello" },
    });

    expect({ body: response.body, status: response.status }).toEqual({
      body: { error: "Too many requests. Please slow down." },
      status: 429,
    });
    expect(yield* stack.conversations).toEqual([]);
    expect(yield* stack.messages).toEqual([]);
  }).pipe(Effect.scoped)
);

it.effect("answers 429 when the new conversation limit is spent", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatMessageStack({ limitNewConversation: false });
    const response = yield* postChatMessage(stack.handler, {
      body: { message: "Hello" },
    });

    expect({ body: response.body, status: response.status }).toEqual({
      body: { error: "Too many new conversations. Please try again later." },
      status: 429,
    });
    expect(yield* stack.conversations).toEqual([]);
  }).pipe(Effect.scoped)
);

it.effect("does not charge the new conversation limit to a later message", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatMessageStack({
      chats: [chatMessageRow({ id: "c1" })],
      limitNewConversation: false,
    });
    const response = yield* postChatMessage(stack.handler, {
      body: { conversationId: "c1", message: "Hello" },
    });

    expect(response.status).toBe(200);
    expect(planOf(response.answer).conversationId).toBe("c1");
    expect(yield* stack.charged).toEqual(["chat:203.0.113.7"]);
  }).pipe(Effect.scoped)
);

it.effect(
  "answers a conversation a person owns without calling the model",
  () =>
    Effect.gen(function* runScenario() {
      const stack = yield* chatMessageStack({
        chats: [
          chatMessageRow({
            email: "ada@example.com",
            id: "c1",
            name: "Ada",
            status: "human",
          }),
        ],
      });
      const response = yield* postChatMessage(stack.handler, {
        body: { conversationId: "c1", message: "  Are you there?  " },
      });
      const stored = yield* stack.messages;

      expect({ body: response.body, status: response.status }).toEqual({
        body: {
          conversationId: "c1",
          message: "Message sent",
          status: "human",
        },
        status: 200,
      });
      expect(yield* stack.modelCalls).toBe(0);
      expect(yield* stack.room).toEqual([
        {
          content: "Are you there?",
          conversationId: "c1",
          messageId: stored[0]?.id,
        },
      ]);
      expect(yield* stack.alert.newMessages).toEqual([
        {
          conversationId: "c1",
          isEval: false,
          message: "Are you there?",
          visitorEmail: "ada@example.com",
          visitorName: "Ada",
        },
      ]);
      expect(yield* stack.alert.newConversations).toEqual([]);
      expect(yield* stack.conversations).toMatchObject([
        { id: "c1", status: "human", updatedAt: CHAT_SECOND },
      ]);
    }).pipe(Effect.scoped)
);

it.effect("answers a handoff requested conversation the same way", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatMessageStack({
      chats: [chatMessageRow({ id: "c1", status: "handoff_requested" })],
    });
    const response = yield* postChatMessage(stack.handler, {
      body: { conversationId: "c1", message: "Anyone?" },
    });

    expect({ body: response.body, status: response.status }).toEqual({
      body: {
        conversationId: "c1",
        message: "Message sent",
        status: "handoff_requested",
      },
      status: 200,
    });
    expect(yield* stack.modelCalls).toBe(0);
  }).pipe(Effect.scoped)
);

it.effect("hands a closed conversation to the answer stream", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatMessageStack({
      chats: [chatMessageRow({ id: "c1", status: "closed" })],
    });
    const response = yield* postChatMessage(stack.handler, {
      body: { conversationId: "c1", message: "One more" },
    });

    expect(planOf(response.answer).conversationId).toBe("c1");
    expect(yield* stack.conversations).toMatchObject([
      { id: "c1", status: "closed" },
    ]);
  }).pipe(Effect.scoped)
);

it.effect("stores one visitor message per request, as the old route does", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatMessageStack({
      chats: [chatMessageRow({ id: "c1" })],
    });

    yield* postChatMessage(stack.handler, {
      body: { conversationId: "c1", message: "Same words" },
    });
    yield* postChatMessage(stack.handler, {
      body: { conversationId: "c1", message: "Same words" },
    });

    expect(
      (yield* stack.messages).map((message) => [message.role, message.content])
    ).toEqual([
      ["user", "Same words"],
      ["user", "Same words"],
    ]);
  }).pipe(Effect.scoped)
);
