import { answerModelFailure } from "@rat-stack/core";
import type { AnswerModelFailure } from "@rat-stack/core";

const RETRYABLE_FAILURE_PATTERN =
  /overloaded|rate_limit|api_error|unavailable|timeout/iu;

export const isRetryableAnthropicFailure = (
  status: number,
  body: string
): boolean =>
  status === 429 ||
  status === 529 ||
  status >= 500 ||
  RETRYABLE_FAILURE_PATTERN.test(body);

export const retryableAnswerFailure = (
  detail: string,
  status: number
): AnswerModelFailure =>
  answerModelFailure.RetryableAnswerFailure({ detail, status });

export const refusedAnswerFailure = (
  detail: string,
  status: number
): AnswerModelFailure => answerModelFailure.AnswerRefused({ detail, status });
