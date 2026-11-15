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
