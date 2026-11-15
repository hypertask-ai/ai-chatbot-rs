import { Context, Effect, Schedule, Schema } from "effect";

export const HAIKU_MODEL = "claude-haiku-5-5";

export const HAIKU_BUSY_MESSAGE =
  "Sorry, I'm having trouble responding right now. Please try again in a moment.";

export const ANSWER_FAILURE_MESSAGE =
  "Sorry, something went wrong. Please try again.";

export const EMPTY_ANSWER_MESSAGE =
  "I couldn't finish that answer. Please ask again.";

export const TRUNCATED_ANSWER_CLOSE =
  "\n\nI had to stop there. Ask again if you want the rest.";

export const HAIKU_RETRY_LIMIT = 1;

export const HAIKU_RETRY_WAIT = "400 millis";

export const HAIKU_RETRY = Schedule.max([
  Schedule.recurs(HAIKU_RETRY_LIMIT),
  Schedule.spaced(HAIKU_RETRY_WAIT),
]);

export const TokenUsageSchema = Schema.Struct({
  cache_creation_input_tokens: Schema.Int,
  cache_read_input_tokens: Schema.Int,
  input_tokens: Schema.Int,
  output_tokens: Schema.Int,
});

export type TokenUsage = typeof TokenUsageSchema.Type;

export const emptyUsage = (): TokenUsage => ({
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
  input_tokens: 0,
  output_tokens: 0,
});

export const addTokenUsage = (
  left: TokenUsage,
  right: TokenUsage
): TokenUsage => ({
  cache_creation_input_tokens:
    left.cache_creation_input_tokens + right.cache_creation_input_tokens,
  cache_read_input_tokens:
    left.cache_read_input_tokens + right.cache_read_input_tokens,
  input_tokens: left.input_tokens + right.input_tokens,
  output_tokens: left.output_tokens + right.output_tokens,
});

export const AnswerTextBlockSchema = Schema.Struct({
  cache_control: Schema.optionalKey(
    Schema.Struct({ type: Schema.Literal("ephemeral") })
  ),
  text: Schema.String,
  type: Schema.Literal("text"),
});

export const AnswerImageBlockSchema = Schema.Struct({
  source: Schema.Struct({
    data: Schema.String,
    media_type: Schema.String,
    type: Schema.Literal("base64"),
  }),
  type: Schema.Literal("image"),
});

export const AnswerContentSchema = Schema.Union([
  Schema.String,
  Schema.Array(Schema.Union([AnswerImageBlockSchema, AnswerTextBlockSchema])),
]);

export const AnswerMessageSchema = Schema.Struct({
  content: AnswerContentSchema,
  role: Schema.Literals(["assistant", "user"]),
});

export const AnswerRequestSchema = Schema.Struct({
  max_tokens: Schema.Int,
  messages: Schema.Array(AnswerMessageSchema),
  model: Schema.String,
  stream: Schema.Literal(true),
  system: Schema.Array(AnswerTextBlockSchema),
  thinking: Schema.Struct({ type: Schema.Literal("disabled") }),
});

export type AnswerRequest = typeof AnswerRequestSchema.Type;

export type AnswerTextBlock = typeof AnswerTextBlockSchema.Type;

export type AnswerImageBlock = typeof AnswerImageBlockSchema.Type;

export type AnswerMessage = typeof AnswerMessageSchema.Type;

export class RetryableAnswerFailure extends Schema.TaggedError<
  RetryableAnswerFailure,
  { readonly brand: unique symbol }
>()("RetryableAnswerFailure", {
  detail: Schema.String,
  status: Schema.Int,
}) {}

export class AnswerRefused extends Schema.TaggedError<
  AnswerRefused,
  { readonly brand: unique symbol }
>()("AnswerRefused", {
  detail: Schema.String,
  status: Schema.Int,
}) {}

export type AnswerModelFailure = AnswerRefused | RetryableAnswerFailure;

export interface AnswerStreamRead {
  readonly stopReason: string | null;
  readonly thinkingTokens: number;
  readonly usage: TokenUsage;
}

export class AnswerModel extends Context.Service<
  AnswerModel,
  {
    readonly stream: (
      request: AnswerRequest,
      onText: (text: string) => Effect.Effect<void>
    ) => Effect.Effect<AnswerStreamRead, AnswerModelFailure>;
  }
>()("@rat-stack/core/AnswerModel") {}

export interface SettledAnswer {
  readonly cacheable: boolean;
  readonly retry: boolean;
  readonly text: string;
}

export const fallbackAnswer = (): SettledAnswer => ({
  cacheable: false,
  retry: false,
  text: EMPTY_ANSWER_MESSAGE,
});

export const settleAnswer = (
  text: string,
  stopReason: string | null
): SettledAnswer => {
  const trimmed = text.trim();

  if (trimmed === "") {
    return { cacheable: false, retry: true, text: "" };
  }

  if (stopReason === "max_tokens") {
    return {
      cacheable: false,
      retry: false,
      text: `${trimmed}${TRUNCATED_ANSWER_CLOSE}`,
    };
  }

  return { cacheable: true, retry: false, text: trimmed };
};
