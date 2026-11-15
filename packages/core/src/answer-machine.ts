import { watchActor } from "@rat-stack/capability/actor-watch";
import {
  createEffectActor,
  createEffectLogic,
  join,
  setupEffect,
} from "@xstate/effect";
import { Context, Data, Effect, Ref, Schema } from "effect";
import { types } from "xstate";

import {
  ANSWER_FAILURE_MESSAGE,
  AnswerModel,
  type AnswerModelFailure,
  type AnswerRequest,
  AnswerRequestSchema,
  addTokenUsage,
  emptyUsage,
  fallbackAnswer,
  HAIKU_BUSY_MESSAGE,
  HAIKU_MODEL,
  HAIKU_RETRY,
  type SettledAnswer,
  settleAnswer,
  type TokenUsage,
} from "./answer-model.js";

type AnswerCallResult = Data.TaggedEnum<{
  Read: {
    readonly stopReason: string | null;
    readonly streamed: string;
    readonly thinkingTokens: number;
    readonly usage: TokenUsage;
  };
  Unavailable: {
    readonly streamed: string;
  };
}>;

const answerCallResult = Data.taggedEnum<AnswerCallResult>();

export type AnswerOutcome = Data.TaggedEnum<{
  Answered: {
    readonly cacheable: boolean;
    readonly streamed: string;
    readonly text: string;
    readonly usage: TokenUsage;
  };
  Busy: {
    readonly streamed: string;
    readonly text: typeof HAIKU_BUSY_MESSAGE;
    readonly usage: TokenUsage;
  };
  Failed: {
    readonly streamed: string;
    readonly text: typeof ANSWER_FAILURE_MESSAGE;
    readonly usage: TokenUsage;
  };
}>;

export const answerOutcome = Data.taggedEnum<AnswerOutcome>();

export class AnswerSink extends Context.Service<
  AnswerSink,
  { readonly write: (text: string) => Effect.Effect<void> }
>()("@rat-stack/core/AnswerSink") {}

const callWithRetry = Effect.fn("callWithRetry")(function* callWithRetry(
  request: AnswerRequest
) {
  const sink = yield* AnswerSink;
  const text = yield* Ref.make("");

  const write = (chunk: string) =>
    Ref.update(text, (current) => current + chunk).pipe(
      Effect.andThen(sink.write(chunk))
    );

  const streamed = Ref.get(text);

  const unavailable = Effect.gen(function* unavailableCall() {
    const shown = yield* streamed;

    return answerCallResult.Unavailable({ streamed: shown });
  });

  const shouldRetry = (failure: AnswerModelFailure) =>
    failure._tag === "RetryableAnswerFailure"
      ? streamed.pipe(Effect.map((emitted) => emitted === ""))
      : Effect.succeed(false);

  return yield* Effect.gen(function* readAnswer() {
    const read = yield* AnswerModel.use((model) =>
      model.stream(request, write)
    ).pipe(Effect.retry({ schedule: HAIKU_RETRY, while: shouldRetry }));

    return answerCallResult.Read({
      stopReason: read.stopReason,
      streamed: yield* streamed,
      thinkingTokens: read.thinkingTokens,
      usage: read.usage,
    });
  }).pipe(
    Effect.catchTags({
      AnswerRefused: () => unavailable,
      RetryableAnswerFailure: () => unavailable,
    })
  );
});

const streamAnswer = createEffectLogic({
  effect: ({ input }) => callWithRetry(input.request),
  schemas: { input: Schema.Struct({ request: AnswerRequestSchema }) },
});

interface AnswerContext {
  readonly calls: number;
  readonly request: AnswerRequest;
  readonly result: AnswerCallResult | undefined;
  readonly usage: TokenUsage;
}

const applyResult = (
  context: AnswerContext,
  result: AnswerCallResult
): AnswerContext => {
  const usage =
    result._tag === "Read"
      ? addTokenUsage(context.usage, result.usage)
      : context.usage;

  return { ...context, calls: context.calls + 1, result, usage };
};

const remainderOf = (streamed: string, settled: SettledAnswer): string =>
  streamed.trim() === ""
    ? settled.text
    : settled.text.slice(streamed.trim().length);

const outcomeOf = (context: AnswerContext): AnswerOutcome | undefined => {
  const { result, usage } = context;

  if (result === undefined) {
    return undefined;
  }

  if (result._tag === "Unavailable") {
    return answerOutcome.Busy({
      streamed: result.streamed,
      text: HAIKU_BUSY_MESSAGE,
      usage,
    });
  }

  const settled = settleAnswer(result.streamed, result.stopReason);
  const answer = settled.retry ? fallbackAnswer() : settled;

  return answerOutcome.Answered({
    cacheable: answer.cacheable,
    streamed: result.streamed,
    text: `${result.streamed}${remainderOf(result.streamed, answer)}`,
    usage,
  });
};

export const answerMachine = setupEffect({
  actors: { streamAnswer },
  schemas: {
    context: types<AnswerContext>(),
    input: Schema.Struct({ request: AnswerRequestSchema }),
  },
}).createMachine({
  context: ({ input }) => ({
    calls: 0,
    request: input.request,
    result: undefined,
    usage: emptyUsage(),
  }),
  initial: "calling",
  output: ({ context }) => outcomeOf(context),
  states: {
    answered: { type: "final" },
    busy: { type: "final" },
    calling: {
      invoke: {
        input: ({ context }) => ({ request: context.request }),
        onDone: {
          context: ({ context, event }) => applyResult(context, event.output),
          target: "judging",
        },
        src: "streamAnswer",
      },
    },
    judging: {
      always: ({ context }) => {
        const { result } = context;

        if (result === undefined || result._tag === "Unavailable") {
          return { target: "busy" };
        }

        const settled = settleAnswer(result.streamed, result.stopReason);

        if (settled.retry && context.calls === 1) {
          return { target: "retrying" };
        }

        return { target: "answered" };
      },
    },
    retrying: {
      invoke: {
        input: ({ context }) => ({ request: context.request }),
        onDone: {
          context: ({ context, event }) => applyResult(context, event.output),
          target: "judging",
        },
        src: "streamAnswer",
      },
    },
  },
});

const writeRemainder = Effect.fn("writeRemainder")(function* writeRemainder(
  streamed: string,
  text: string
) {
  const sink = yield* AnswerSink;
  const remainder = text.slice(streamed.length);

  if (remainder !== "") {
    yield* sink.write(remainder);
  }
});

const runAnswerMachine = Effect.fn("runAnswerMachine")(
  function* runAnswerMachine(request: AnswerRequest) {
    const actor = yield* createEffectActor(answerMachine, {
      input: { request },
    });

    yield* watchActor("answerMachine", actor);

    // @effect-diagnostics-next-line anyUnknownInErrorContext:off -- A machine-level error or an early stop is a programming error here: the answer outcome travels through the final states, not the actor. A machine's ErrorFrom is unknown by design (statelyai/xstate#5725), so the unknown-error diagnostic is off for this one call and orDie closes it.
    const outcome = yield* join(actor).pipe(Effect.orDie);

    if (outcome === undefined) {
      return yield* Effect.die(
        new Error("answerMachine completed without an outcome")
      );
    }

    return outcome;
  },
  Effect.scoped
);

export const runAnswer = Effect.fn("runAnswer")(function* runAnswer(input: {
  readonly onText?: (text: string) => Effect.Effect<void>;
  readonly request: AnswerRequest;
}) {
  const write = (text: string): Effect.Effect<void> =>
    input.onText === undefined ? Effect.void : input.onText(text);

  return yield* Effect.gen(function* answer() {
    if (input.request.model !== HAIKU_MODEL) {
      return answerOutcome.Failed({
        streamed: "",
        text: ANSWER_FAILURE_MESSAGE,
        usage: emptyUsage(),
      });
    }

    const outcome = yield* runAnswerMachine(input.request);

    return yield* answerOutcome.$match(outcome, {
      Answered: ({ streamed, text }) =>
        writeRemainder(streamed, text).pipe(Effect.as(outcome)),
      Busy: () => Effect.succeed(outcome),
      Failed: () => Effect.succeed(outcome),
    });
  }).pipe(Effect.provideService(AnswerSink, { write }));
});
