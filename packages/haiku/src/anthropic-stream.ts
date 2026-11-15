import { answerModelFailure, emptyUsage } from "@rat-stack/core";
import type {
  AnswerModelFailure,
  AnswerStreamRead,
  TokenUsage,
} from "@rat-stack/core";
import { Effect, Option, Predicate, Ref, Schema, Stream } from "effect";
import type { HttpClientError } from "effect/http";

import { isRetryableAnthropicFailure } from "./anthropic-failure.js";

const AnthropicUsageSchema = Schema.Struct({
  cache_creation_input_tokens: Schema.optionalKey(Schema.Number),
  cache_read_input_tokens: Schema.optionalKey(Schema.Number),
  input_tokens: Schema.optionalKey(Schema.Number),
  output_tokens: Schema.optionalKey(Schema.Number),
  output_tokens_details: Schema.optionalKey(
    Schema.Struct({ thinking_tokens: Schema.optionalKey(Schema.Number) })
  ),
});

const AnthropicEventSchema = Schema.Struct({
  delta: Schema.optionalKey(
    Schema.Struct({
      stop_reason: Schema.optionalKey(Schema.NullOr(Schema.String)),
      text: Schema.optionalKey(Schema.String),
      type: Schema.optionalKey(Schema.String),
    })
  ),
  error: Schema.optionalKey(
    Schema.Struct({
      message: Schema.optionalKey(Schema.String),
      type: Schema.optionalKey(Schema.String),
    })
  ),
  message: Schema.optionalKey(
    Schema.Struct({ usage: Schema.optionalKey(AnthropicUsageSchema) })
  ),
  type: Schema.optionalKey(Schema.String),
  usage: Schema.optionalKey(AnthropicUsageSchema),
});

type AnthropicUsage = typeof AnthropicUsageSchema.Type;

type AnthropicEvent = typeof AnthropicEventSchema.Type;

interface ReadState {
  readonly emitted: boolean;
  readonly stopReason: string | null;
  readonly thinkingTokens: number;
  readonly usage: TokenUsage;
}

const initialState = (): ReadState => ({
  emitted: false,
  stopReason: null,
  thinkingTokens: 0,
  usage: emptyUsage(),
});

const applyUsage = (
  usage: TokenUsage,
  raw: AnthropicUsage | undefined
): TokenUsage => {
  if (raw === undefined) {
    return usage;
  }

  return {
    cache_creation_input_tokens:
      raw.cache_creation_input_tokens ?? usage.cache_creation_input_tokens,
    cache_read_input_tokens:
      raw.cache_read_input_tokens ?? usage.cache_read_input_tokens,
    input_tokens: raw.input_tokens ?? usage.input_tokens,
    output_tokens: raw.output_tokens ?? usage.output_tokens,
  };
};

const usageOf = (event: AnthropicEvent): AnthropicUsage | undefined => {
  if (event.type === "message_start") {
    return event.message?.usage;
  }

  if (event.type === "message_delta") {
    return event.usage;
  }

  return undefined;
};

const stopReasonOf = (
  event: AnthropicEvent,
  current: string | null
): string | null => {
  if (event.type !== "message_delta") {
    return current;
  }

  return event.delta?.stop_reason ?? current;
};

const thinkingTokensOf = (event: AnthropicEvent, current: number): number => {
  if (event.type !== "message_delta") {
    return current;
  }

  return event.usage?.output_tokens_details?.thinking_tokens ?? current;
};

const textOf = (event: AnthropicEvent): string | undefined => {
  if (
    event.type !== "content_block_delta" ||
    event.delta?.type !== "text_delta"
  ) {
    return undefined;
  }

  const { text } = event.delta;

  return text === undefined || text === "" ? undefined : text;
};

const errorDetailOf = (event: AnthropicEvent): string =>
  `${event.error?.type ?? ""} ${event.error?.message ?? ""}`.trim();

const failureOf = (
  detail: string,
  emitted: boolean,
  retryable: boolean
): AnswerModelFailure =>
  emitted || !retryable
    ? answerModelFailure.AnswerRefused({ detail, status: 0 })
    : answerModelFailure.RetryableAnswerFailure({ detail, status: 0 });

const applyEvent = (
  state: Ref.Ref<ReadState>,
  event: AnthropicEvent,
  onText: (text: string) => Effect.Effect<void>
): Effect.Effect<void, AnswerModelFailure> =>
  Effect.gen(function* applyAnthropicEvent() {
    const current = yield* Ref.get(state);
    const text = textOf(event);
    const detail = event.type === "error" ? errorDetailOf(event) : "";

    yield* Ref.set(state, {
      emitted: current.emitted || text !== undefined,
      stopReason: stopReasonOf(event, current.stopReason),
      thinkingTokens: thinkingTokensOf(event, current.thinkingTokens),
      usage: applyUsage(current.usage, usageOf(event)),
    });

    if (text !== undefined) {
      yield* onText(text);
    }

    if (event.type === "error") {
      return yield* Effect.fail(
        failureOf(
          detail,
          current.emitted,
          isRetryableAnthropicFailure(0, detail)
        )
      );
    }

    return yield* Effect.void;
  });

const consumeLine = (
  state: Ref.Ref<ReadState>,
  line: string,
  onText: (text: string) => Effect.Effect<void>
): Effect.Effect<void, AnswerModelFailure> => {
  if (!line.startsWith("data:")) {
    return Effect.void;
  }

  const data = line.slice(5).trim();

  if (data === "" || data === "[DONE]") {
    return Effect.void;
  }

  const event = Schema.decodeUnknownOption(
    Schema.fromJsonString(AnthropicEventSchema)
  )(data);

  return Option.match(event, {
    onNone: () => Effect.void,
    onSome: (value) => applyEvent(state, value, onText),
  });
};

const streamFailure = (
  error: HttpClientError.HttpClientError
): AnswerModelFailure =>
  Predicate.isTagged(error.reason, "EmptyBodyError")
    ? answerModelFailure.AnswerRefused({ detail: error.message, status: 0 })
    : answerModelFailure.RetryableAnswerFailure({
        detail: error.message,
        status: 0,
      });

const toRead = (state: ReadState): AnswerStreamRead => ({
  stopReason: state.stopReason,
  thinkingTokens: state.thinkingTokens,
  usage: state.usage,
});

export const readAnthropicStream = (
  body: Stream.Stream<Uint8Array, HttpClientError.HttpClientError>,
  onText: (text: string) => Effect.Effect<void>
): Effect.Effect<AnswerStreamRead, AnswerModelFailure> =>
  Effect.gen(function* readAnthropicAnswerStream() {
    const state = yield* Ref.make(initialState());

    yield* body.pipe(
      Stream.decodeText(),
      Stream.splitLines,
      Stream.mapError(streamFailure),
      Stream.runForEach((line) => consumeLine(state, line, onText))
    );

    return toRead(yield* Ref.get(state));
  });
