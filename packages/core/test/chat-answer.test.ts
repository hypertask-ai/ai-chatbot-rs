// @effect-diagnostics nodeBuiltinImport:off -- This test compares the streamed frames with the record taken from the old route.
import { readFileSync } from "node:fs";

import { expect, it } from "@effect/vitest";
import { Deferred, Effect, Fiber, Layer, Predicate, Stream } from "effect";
import { TestClock } from "effect/testing";

import {
  chatAnswerFrames,
  connectedEvent,
  encodeChatStream,
  encodeChatStreamEvent,
  HISTORY_MESSAGE_LIMIT,
} from "../src/index.js";
import type { ChatAnswerInput } from "../src/index.js";
import { CHAT_SECOND } from "./chat-http.js";
import {
  CITATION,
  answerLayer,
  chatMessageRow,
  chatMessageStack,
  storedMessage,
} from "./chat-message-stack.js";
import type { ChatMessageStack } from "./chat-message-stack.js";

const recorded = (name: string): string =>
  readFileSync(new URL(`fixtures/${name}`, import.meta.url), "utf-8");

const collect = (stack: ChatMessageStack, asked: ChatAnswerInput) =>
  Effect.provide(
    Stream.runCollect(chatAnswerFrames(asked)),
    answerLayer(stack)
  );

const input = (overrides: Partial<ChatAnswerInput> = {}): ChatAnswerInput => ({
  answerMessageId: "msg-1",
  body: { message: "How much is Pro?", visitorId: "visitor-1" },
  conversationId: "conv-1",
  visitorMessageId: "msg-0",
  ...overrides,
});

const seeded = () => ({
  chats: [chatMessageRow({ id: "conv-1" })],
  messages: [
    storedMessage({
      content: "How much is Pro?",
      conversationId: "conv-1",
      createdAt: CHAT_SECOND - 50,
      id: "msg-0",
    }),
  ],
});

const readParts = (readable: ReadableStream<Uint8Array>) =>
  Effect.gen(function* readStreamParts() {
    const reader = readable.getReader();
    const parts: Uint8Array[] = [];
    let finished = false;

    while (!finished) {
      const result = yield* Effect.promise(() => reader.read());

      if (result.done) {
        finished = true;
      } else {
        parts.push(result.value);
      }
    }

    return parts;
  });

const collectWithClock = <A, E>(
  effect: Effect.Effect<A, E>,
  wait: "400 millis"
) =>
  Effect.gen(function* runWithTestClock() {
    const fiber = yield* Effect.forkChild(effect);

    yield* TestClock.adjust("0 millis");
    yield* TestClock.adjust(wait);

    return yield* Fiber.join(fiber);
  });

it.effect("streams the recorded answer to the client in several parts", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatMessageStack({
      ...seeded(),
      answers: [{ pieces: ["Pro is ", "$16 per ", "user."] }],
    });

    const context = yield* Layer.build(answerLayer(stack));

    const readable = Stream.toReadableStreamWith(
      Stream.map(chatAnswerFrames(input()), (event) =>
        new TextEncoder().encode(encodeChatStreamEvent(event))
      ),
      context
    );

    const parts = yield* readParts(readable);
    const decoder = new TextDecoder("utf-8");

    expect(parts.length).toBeGreaterThan(1);
    expect(decoder.decode(parts[0])).toBe(
      encodeChatStreamEvent(
        connectedEvent({ conversationId: "conv-1", messageId: "msg-1" })
      )
    );
    expect(parts.map((part) => decoder.decode(part)).join("")).toBe(
      recorded("chat-stream-answer.txt")
    );
    expect(
      (yield* stack.messages).map((message) => [message.role, message.content])
    ).toEqual([
      ["user", "How much is Pro?"],
      ["bot", "Pro is $16 per user."],
    ]);
  }).pipe(Effect.scoped)
);

it.effect("keeps a multi-byte answer whole across chunk boundaries", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatMessageStack({
      ...seeded(),
      answers: [{ pieces: ["Prix : 16 € ", "café ", "— fin, naïve."] }],
    });

    const frames = yield* collect(
      stack,
      input({
        answerMessageId: "msg-2",
        conversationId: "conv-2",
        visitorMessageId: "msg-0b",
        visitorSecret: "secret-2",
      })
    );

    expect(encodeChatStream(frames)).toBe(
      recorded("chat-stream-multibyte.txt")
    );
  }).pipe(Effect.scoped)
);

it.effect("sends the busy frame when the model never answers", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatMessageStack({
      ...seeded(),
      answers: [{ failure: "retryable", pieces: [] }],
    });

    const frames = yield* collectWithClock(
      collect(
        stack,
        input({
          answerMessageId: "msg-3",
          conversationId: "conv-3",
          visitorMessageId: "msg-0c",
        })
      ),
      "400 millis"
    );

    expect(encodeChatStream(frames)).toBe(recorded("chat-stream-busy.txt"));
    expect(
      (yield* stack.messages).filter((message) => message.role === "bot")
    ).toEqual([]);
  }).pipe(Effect.scoped)
);

it.effect(
  "sends the busy frame after the text already shown and keeps it",
  () =>
    Effect.gen(function* runScenario() {
      const stack = yield* chatMessageStack({
        ...seeded(),
        answers: [{ failure: "refused", pieces: ["Partial "] }],
      });

      const frames = yield* collect(
        stack,
        input({
          answerMessageId: "msg-4",
          conversationId: "conv-4",
          visitorMessageId: "msg-0d",
        })
      );

      expect(encodeChatStream(frames)).toBe(recorded("chat-stream-error.txt"));
      expect(
        (yield* stack.messages)
          .filter((message) => message.role === "bot")
          .map((message) => message.content)
      ).toEqual(["Partial  [interrupted]"]);
    }).pipe(Effect.scoped)
);

it.effect("sends the failure frame when the answer breaks", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatMessageStack({
      ...seeded(),
      answers: [{ pieces: ["Half an "], viaDefect: true }],
    });

    const frames = yield* collect(
      stack,
      input({
        answerMessageId: "msg-5",
        conversationId: "conv-5",
        visitorMessageId: "msg-0e",
      })
    );

    expect(encodeChatStream(frames)).toBe(recorded("chat-stream-failure.txt"));
    expect(
      (yield* stack.messages)
        .filter((message) => message.role === "bot")
        .map((message) => message.content)
    ).toEqual(["Half an  [interrupted]"]);
  }).pipe(Effect.scoped)
);

it.effect("stores the partial answer when the visitor disconnects", () =>
  Effect.gen(function* runScenario() {
    const hold = yield* Deferred.make<true>();

    const stack = yield* chatMessageStack({
      ...seeded(),
      answers: [{ hold: Deferred.await(hold), pieces: ["Only half "] }],
    });

    const asked = input({
      answerMessageId: "msg-6",
      conversationId: "conv-6",
      visitorMessageId: "msg-0f",
    });

    const frames = yield* Effect.provide(
      Stream.runCollect(Stream.take(chatAnswerFrames(asked), 2)),
      answerLayer(stack)
    );

    expect(frames).toHaveLength(2);
    expect(
      (yield* stack.messages)
        .filter((message) => message.role === "bot")
        .map((message) => message.content)
    ).toEqual(["Only half  [interrupted]"]);
    expect(
      (yield* stack.messages).filter((message) => message.role === "user")
    ).toHaveLength(1);
  }).pipe(Effect.scoped)
);

it.effect("answers the first question from the cache without the model", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatMessageStack({
      cached: [["How much is Pro?", "Cached answer."]],
      ...seeded(),
    });

    const frames = yield* collect(stack, input());

    expect(frames.map((frame) => frame.type)).toEqual([
      "connected",
      "chunk",
      "done",
    ]);
    expect(frames[1]).toEqual({
      content: "Cached answer.",
      conversationId: "conv-1",
      type: "chunk",
    });
    expect(yield* stack.modelCalls).toBe(0);
    expect(
      (yield* stack.messages)
        .filter((message) => message.role === "bot")
        .map((message) => [message.content, message.model])
    ).toEqual([["Cached answer.", "claude-haiku-5-5"]]);
  }).pipe(Effect.scoped)
);

it.effect("saves a cacheable first answer for the next visitor", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatMessageStack({
      ...seeded(),
      answers: [{ pieces: ["Fresh answer."] }],
    });

    yield* collect(stack, input());

    expect(yield* stack.cache.saved).toEqual([
      { question: "How much is Pro?", response: "Fresh answer." },
    ]);
  }).pipe(Effect.scoped)
);

it.effect("never saves an answer that hit the output cap", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatMessageStack({
      ...seeded(),
      answers: [{ pieces: ["A cut off ans"], stopReason: "max_tokens" }],
    });

    const frames = yield* collect(stack, input());
    const done = frames.at(-1);

    expect(yield* stack.cache.saved).toEqual([]);
    expect(done?.type).toBe("done");
    expect(done?.type === "done" ? done.fullContent : "").toBe(
      "A cut off ans\n\nI had to stop there. Ask again if you want the rest."
    );
  }).pipe(Effect.scoped)
);

it.effect(
  "skips the cache once the visitor is known or the chat has history",
  () =>
    Effect.gen(function* runScenario() {
      const known = yield* chatMessageStack({
        cached: [["How much is Pro?", "Cached answer."]],
        chats: [chatMessageRow({ email: "ada@example.com", id: "conv-1" })],
        messages: seeded().messages,
      });

      yield* collect(known, input());

      expect(yield* known.modelCalls).toBe(1);
      expect(yield* known.cache.looked).toEqual([]);

      const withHistory = yield* chatMessageStack({
        cached: [["How much is Pro?", "Cached answer."]],
        chats: [chatMessageRow({ id: "conv-1" })],
        messages: [
          ...seeded().messages,
          storedMessage({
            content: "Earlier question",
            conversationId: "conv-1",
            createdAt: CHAT_SECOND - 40,
            id: "older",
          }),
        ],
      });

      yield* collect(withHistory, input());

      expect(yield* withHistory.modelCalls).toBe(1);
      expect(yield* withHistory.cache.looked).toEqual([]);
    }).pipe(Effect.scoped)
);

it.effect(
  "cleans the answer before the done frame and stores the cleaned text",
  () =>
    Effect.gen(function* runScenario() {
      const stack = yield* chatMessageStack({
        ...seeded(),
        answers: [{ pieces: ["Pro is $16. [PROFILE_ACCOUNT: paid]"] }],
        cleanup: (text) =>
          text.replaceAll("[PROFILE_ACCOUNT: paid]", "").trim(),
      });

      const frames = yield* collect(stack, input());
      const done = frames.at(-1);

      expect(done?.type === "done" ? done.fullContent : "").toBe("Pro is $16.");
      expect(
        (yield* stack.messages)
          .filter((message) => message.role === "bot")
          .map((message) => message.content)
      ).toEqual(["Pro is $16."]);
    }).pipe(Effect.scoped)
);

it.effect("carries the cited sources in the done frame", () =>
  Effect.gen(function* runScenario() {
    const stack = yield* chatMessageStack({
      ...seeded(),
      answers: [{ pieces: ["See the pricing plans."] }],
    });

    const frames = yield* collect(stack, input());
    const done = frames.at(-1);

    expect(done?.type === "done" ? done.sources : []).toEqual([CITATION]);
  }).pipe(Effect.scoped)
);

it.effect("reads the last twenty messages and leaves the new one out", () =>
  Effect.gen(function* runScenario() {
    const history = Array.from(
      { length: HISTORY_MESSAGE_LIMIT + 5 },
      (_unused, index) =>
        storedMessage({
          content: `earlier-${index}`,
          conversationId: "conv-1",
          createdAt: CHAT_SECOND - 200 + index,
          id: `earlier-${index}`,
          role: index % 2 === 0 ? "user" : "bot",
        })
    );

    const stack = yield* chatMessageStack({
      chats: [chatMessageRow({ id: "conv-1" })],
      messages: [
        ...history,
        storedMessage({
          content: "How much is Pro?",
          conversationId: "conv-1",
          createdAt: CHAT_SECOND - 1,
          id: "msg-0",
        }),
      ],
    });

    yield* collect(stack, input());

    const [request] = yield* stack.modelRequests;

    const joined = (request?.messages ?? [])
      .map((message) =>
        Predicate.isString(message.content)
          ? message.content
          : message.content
              .map((block) => ("text" in block ? block.text : ""))
              .join("")
      )
      .join("\n");

    expect(joined).toContain("earlier-5");
    expect(joined).not.toContain("earlier-4");
    expect(joined.match(/How much is Pro\?/gu) ?? []).toHaveLength(1);
  }).pipe(Effect.scoped)
);

it.effect(
  "retries the model once and stores one visitor message and one answer",
  () =>
    Effect.gen(function* runScenario() {
      const stack = yield* chatMessageStack({
        ...seeded(),
        answers: [
          { failure: "retryable", pieces: [] },
          { pieces: ["Pro is $16."] },
        ],
      });

      const frames = yield* collectWithClock(
        collect(stack, input()),
        "400 millis"
      );

      expect(yield* stack.modelCalls).toBe(2);
      expect(
        (yield* stack.messages).map((message) => [
          message.role,
          message.content,
        ])
      ).toEqual([
        ["user", "How much is Pro?"],
        ["bot", "Pro is $16."],
      ]);
      expect(frames.map((frame) => frame.type)).toEqual([
        "connected",
        "chunk",
        "done",
      ]);
    }).pipe(Effect.scoped)
);
