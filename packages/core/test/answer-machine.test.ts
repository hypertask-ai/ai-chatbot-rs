import { expect, it } from "@effect/vitest";
import { createEffectActor, join } from "@xstate/effect";
import { Effect, Fiber, Ref } from "effect";
import type { Duration } from "effect";
import { TestClock } from "effect/testing";

import {
  AnswerSink,
  answerMachine,
  answerOutcome,
  runAnswer,
} from "../src/answer-machine.js";
import {
  AnswerModel,
  answerModelFailure,
  EMPTY_ANSWER_MESSAGE,
  emptyUsage,
  HAIKU_BUSY_MESSAGE,
  HAIKU_MODEL,
  HAIKU_RETRY_WAIT,
  TRUNCATED_ANSWER_CLOSE,
} from "../src/answer-model.js";
import type { AnswerRequest, TokenUsage } from "../src/answer-model.js";

type FakeCall =
  | {
      readonly chunks?: readonly string[];
      readonly kind: "refused";
      readonly status: number;
    }
  | {
      readonly chunks?: readonly string[];
      readonly kind: "retryable";
      readonly status: number;
    }
  | {
      readonly chunks: readonly string[];
      readonly kind: "read";
      readonly stopReason?: string | null;
      readonly usage?: TokenUsage;
    };

const usage = (input: number, output: number): TokenUsage => ({
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
  input_tokens: input,
  output_tokens: output,
});

const request = (overrides: Partial<AnswerRequest> = {}): AnswerRequest => ({
  max_tokens: 800,
  messages: [{ content: "How do I create a task?", role: "user" }],
  model: HAIKU_MODEL,
  stream: true,
  system: [
    {
      cache_control: { type: "ephemeral" },
      text: "You answer help questions.",
      type: "text",
    },
  ],
  thinking: { type: "disabled" },
  ...overrides,
});

const fakeModel = (script: readonly FakeCall[]) =>
  Effect.gen(function* scriptedModel() {
    const calls = yield* Ref.make(0);
    const requests = yield* Ref.make<readonly AnswerRequest[]>([]);

    const model: AnswerModel["Service"] = {
      stream: (called, onText) =>
        Effect.gen(function* stream() {
          yield* Ref.update(requests, (seen) => [...seen, called]);

          const index = yield* Ref.getAndUpdate(calls, (count) => count + 1);
          const call = script[index] ?? script.at(-1);

          if (call === undefined) {
            return yield* Effect.die(
              new Error("the fake model ran out of scripted calls")
            );
          }

          yield* Effect.forEach(call.chunks ?? [], (chunk) => onText(chunk), {
            discard: true,
          });

          if (call.kind === "read") {
            return {
              stopReason: call.stopReason ?? null,
              thinkingTokens: 0,
              usage: call.usage ?? emptyUsage(),
            };
          }

          if (call.kind === "retryable") {
            return yield* Effect.fail(
              answerModelFailure.RetryableAnswerFailure({
                detail: "overloaded",
                status: call.status,
              })
            );
          }

          return yield* Effect.fail(
            answerModelFailure.AnswerRefused({
              detail: "bad request",
              status: call.status,
            })
          );
        }),
    };

    return { calls, model, requests };
  });

const answer = (model: AnswerModel["Service"], asked: AnswerRequest) =>
  runAnswer({ onText: () => Effect.void, request: asked }).pipe(
    Effect.provideService(AnswerModel, model)
  );

const answerInto = (model: AnswerModel["Service"], asked: AnswerRequest) =>
  Effect.gen(function* collectedAnswer() {
    const chunks = yield* Ref.make<readonly string[]>([]);

    const outcome = yield* runAnswer({
      onText: (chunk) => Ref.update(chunks, (seen) => [...seen, chunk]),
      request: asked,
    }).pipe(Effect.provideService(AnswerModel, model));

    return { chunks: yield* Ref.get(chunks), outcome };
  });

const advance = <A, E>(effect: Effect.Effect<A, E>, wait: Duration.Input) =>
  Effect.gen(function* clocked() {
    const fiber = yield* Effect.forkChild(effect);

    yield* TestClock.adjust("0 millis");
    yield* TestClock.adjust(wait);

    return yield* Fiber.join(fiber);
  });

const runMachine = (model: AnswerModel["Service"], asked: AnswerRequest) =>
  Effect.gen(function* machineOnce() {
    const actor = yield* createEffectActor(answerMachine, {
      input: { request: asked },
    });

    // @effect-diagnostics-next-line anyUnknownInErrorContext:off -- A machine-level error here is a test failure, not a case under test; the unknown-error diagnostic covers the machine's ErrorFrom only.
    const outcome = yield* join(actor).pipe(Effect.orDie);

    return { outcome, state: actor.getSnapshot().value };
  }).pipe(
    Effect.provideService(AnswerModel, model),
    Effect.provideService(AnswerSink, { write: () => Effect.void })
  );

it.effect(
  "retries once after four hundred milliseconds and answers on the second attempt",
  () =>
    Effect.gen(function* retriesOnce() {
      const { calls, model, requests } = yield* fakeModel([
        { kind: "retryable", status: 529 },
        {
          chunks: ["Hello there."],
          kind: "read",
          stopReason: "end_turn",
          usage: usage(1, 7),
        },
      ]);

      const asked = request();
      const fiber = yield* Effect.forkChild(answer(model, asked));

      yield* TestClock.adjust("0 millis");
      yield* TestClock.adjust("399 millis");

      expect(yield* Ref.get(calls)).toBe(1);

      yield* TestClock.adjust("1 millis");

      const outcome = yield* Fiber.join(fiber);

      expect(yield* Ref.get(calls)).toBe(2);
      expect(yield* Ref.get(requests)).toEqual([asked, asked]);

      expect(outcome).toEqual(
        answerOutcome.Answered({
          cacheable: true,
          streamed: "Hello there.",
          text: "Hello there.",
          usage: usage(1, 7),
        })
      );
    })
);

it.effect("answers the busy message after the retry also fails", () =>
  Effect.gen(function* bothAttemptsFail() {
    const { calls, model } = yield* fakeModel([
      { kind: "retryable", status: 429 },
      { kind: "retryable", status: 500 },
    ]);

    const outcome = yield* advance(answer(model, request()), HAIKU_RETRY_WAIT);

    expect(yield* Ref.get(calls)).toBe(2);

    expect(outcome).toEqual(
      answerOutcome.Busy({
        streamed: "",
        text: "Sorry, I'm having trouble responding right now. Please try again in a moment.",
        usage: emptyUsage(),
      })
    );
  })
);

it.effect("does not retry a refusal", () =>
  Effect.gen(function* refuses() {
    const { calls, model } = yield* fakeModel([
      { kind: "refused", status: 400 },
    ]);

    const outcome = yield* answer(model, request());

    expect(yield* Ref.get(calls)).toBe(1);

    expect(outcome).toEqual(
      answerOutcome.Busy({
        streamed: "",
        text: HAIKU_BUSY_MESSAGE,
        usage: emptyUsage(),
      })
    );
  })
);

it.effect("keeps the text already shown when the stream breaks", () =>
  Effect.gen(function* breaksMidStream() {
    const { calls, model } = yield* fakeModel([
      { chunks: ["Partial "], kind: "retryable", status: 529 },
    ]);

    const { chunks, outcome } = yield* answerInto(model, request());

    expect(yield* Ref.get(calls)).toBe(1);
    expect(chunks).toEqual(["Partial "]);

    expect(outcome).toEqual(
      answerOutcome.Busy({
        streamed: "Partial ",
        text: HAIKU_BUSY_MESSAGE,
        usage: emptyUsage(),
      })
    );
  })
);

it.effect("adds the stop line when the answer hits the output cap", () =>
  Effect.gen(function* truncated() {
    const { model } = yield* fakeModel([
      { chunks: ["Half an ans"], kind: "read", stopReason: "max_tokens" },
    ]);

    const { chunks, outcome } = yield* answerInto(model, request());

    expect(chunks).toEqual(["Half an ans", TRUNCATED_ANSWER_CLOSE]);

    expect(outcome).toEqual(
      answerOutcome.Answered({
        cacheable: false,
        streamed: "Half an ans",
        text: "Half an ans\n\nI had to stop there. Ask again if you want the rest.",
        usage: emptyUsage(),
      })
    );
  })
);

it.effect("asks a second time when the first answer is empty", () =>
  Effect.gen(function* secondAnswer() {
    const { calls, model } = yield* fakeModel([
      { chunks: [], kind: "read", usage: usage(1, 5) },
      { chunks: ["Second time."], kind: "read", usage: usage(1, 7) },
    ]);

    const outcome = yield* answer(model, request());

    expect(yield* Ref.get(calls)).toBe(2);

    expect(outcome).toEqual(
      answerOutcome.Answered({
        cacheable: true,
        streamed: "Second time.",
        text: "Second time.",
        usage: usage(2, 12),
      })
    );
  })
);

it.effect("shows the short fallback when both answers come back empty", () =>
  Effect.gen(function* twiceEmpty() {
    const { model } = yield* fakeModel([
      { chunks: ["  "], kind: "read" },
      { chunks: [], kind: "read" },
    ]);

    const { chunks, outcome } = yield* answerInto(model, request());

    expect(chunks).toEqual(["  ", EMPTY_ANSWER_MESSAGE]);

    expect(outcome).toEqual(
      answerOutcome.Answered({
        cacheable: false,
        streamed: "",
        text: "I couldn't finish that answer. Please ask again.",
        usage: emptyUsage(),
      })
    );
  })
);

it.effect("keeps the first answer's usage when the second call is busy", () =>
  Effect.gen(function* secondCallBusy() {
    const { model } = yield* fakeModel([
      { chunks: [], kind: "read", usage: usage(1, 5) },
      { kind: "retryable", status: 529 },
    ]);

    const outcome = yield* advance(answer(model, request()), HAIKU_RETRY_WAIT);

    expect(outcome).toEqual(
      answerOutcome.Busy({
        streamed: "",
        text: HAIKU_BUSY_MESSAGE,
        usage: usage(1, 5),
      })
    );
  })
);

it.effect("refuses any model other than the help chat model", () =>
  Effect.gen(function* wrongModel() {
    const { calls, model } = yield* fakeModel([]);

    const outcome = yield* answer(
      model,
      request({ model: "claude-sonnet-4-5" })
    );

    expect(yield* Ref.get(calls)).toBe(0);

    expect(outcome).toEqual(
      answerOutcome.Failed({
        streamed: "",
        text: "Sorry, something went wrong. Please try again.",
        usage: emptyUsage(),
      })
    );
  })
);

it.effect("moves the answer lifecycle from calling to answered or busy", () =>
  Effect.gen(function* lifecycleStates() {
    const answered = yield* fakeModel([{ chunks: ["Yes."], kind: "read" }]);
    const settled = yield* runMachine(answered.model, request());

    expect(settled.state).toBe("answered");

    const busy = yield* fakeModel([{ kind: "refused", status: 400 }]);
    const refused = yield* runMachine(busy.model, request());

    expect(refused.state).toBe("busy");
  })
);
