import {
  AnswerModel,
  answerModelFailure,
  type AnswerModelFailure,
  type AnswerRequest,
  type AnswerStreamRead,
} from "@rat-stack/core";
import { Effect, Layer, Predicate, Redacted } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";

import { AnthropicConfig } from "./anthropic-config.js";
import { readAnthropicStream } from "./anthropic-stream.js";

export const ANTHROPIC_MESSAGES_URL =
  "https://gateway.ai.cloudflare.com/v1/6031a7dff0d4a6469414cfa8a6dedddf/hypertask-ai/anthropic/v1/messages";

const RETRYABLE_FAILURE_PATTERN =
  /overloaded|rate_limit|api_error|unavailable|timeout/iu;

const gatewayMetadata = (): string => {
  // oxlint-disable-next-line sort-keys -- The old request sends the worker before the client and the recorded request compares the header.
  return JSON.stringify({ worker: "ai-chatbot", client: "hypertask" });
};

const requestHeaders = (apiKey: string): Record<string, string> => ({
  accept: "text/event-stream",
  "anthropic-version": "2023-06-01",
  "cf-aig-metadata": gatewayMetadata(),
  "content-type": "application/json",
  "x-api-key": apiKey,
});

export const isRetryableAnthropicFailure = (
  status: number,
  body: string
): boolean =>
  status === 429 ||
  status === 529 ||
  status >= 500 ||
  RETRYABLE_FAILURE_PATTERN.test(body);

const retryableFailure = (detail: string, status: number): AnswerModelFailure =>
  answerModelFailure.RetryableAnswerFailure({ detail, status });

const refusedFailure = (detail: string, status: number): AnswerModelFailure =>
  answerModelFailure.AnswerRefused({ detail, status });

export const answerModelLayer = Layer.effect(
  AnswerModel,
  Effect.gen(function* buildAnswerModel() {
    const config = yield* AnthropicConfig;
    const client = yield* HttpClient.HttpClient;
    const apiKey = Redacted.value(config.apiKey);

    const stream = Effect.fn("haikuAnswerStream")(function* haikuAnswerStream(
      request: AnswerRequest,
      onText: (text: string) => Effect.Effect<void>
    ) {
      const httpRequest = HttpClientRequest.post(ANTHROPIC_MESSAGES_URL).pipe(
        HttpClientRequest.setHeaders(requestHeaders(apiKey)),
        HttpClientRequest.bodyText(JSON.stringify(request), "application/json")
      );

      const response = yield* client
        .execute(httpRequest)
        .pipe(
          Effect.mapError((error) =>
            Predicate.isTagged(error.reason, "TransportError")
              ? retryableFailure(error.message, 0)
              : refusedFailure(error.message, 0)
          )
        );

      if (response.status < 200 || response.status > 299) {
        const body = yield* response.text.pipe(Effect.orElseSucceed(() => ""));
        const detail = `Anthropic ${response.status}`;

        yield* Effect.logError(
          `[Chat] Anthropic error ${response.status} ${body.slice(0, 300)}`
        );

        return yield* isRetryableAnthropicFailure(response.status, body)
          ? retryableFailure(detail, response.status)
          : refusedFailure(detail, response.status);
      }

      const read: AnswerStreamRead = yield* readAnthropicStream(
        response.stream,
        onText
      );

      if (read.thinkingTokens > 0) {
        yield* Effect.log(
          `[Chat] thinking_tokens=${read.thinkingTokens} output_tokens=${read.usage.output_tokens} stop=${read.stopReason ?? ""}`
        );
      }

      return read;
    });

    return { stream };
  })
);
