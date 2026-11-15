import { readFileSync } from "node:fs";

import { describe, expect, it } from "@effect/vitest";
import {
  AnswerModel,
  buildAnswerRequest,
  toAnswerUserContent,
  type AnswerStreamRead,
  type ChatTurn,
} from "@rat-stack/core";
import { Effect, Layer, Predicate, Redacted, Ref } from "effect";
import { HttpClient, HttpClientResponse } from "effect/http";

import {
  ANTHROPIC_MESSAGES_URL,
  AnthropicConfig,
  answerModelLayer,
} from "../src/index.js";

interface Captured {
  readonly body: string;
  readonly header: Record<string, string>;
  readonly method: string;
  readonly url: string;
}

interface AnswerRun {
  readonly captured: readonly Captured[];
  readonly read: AnswerStreamRead;
  readonly text: string;
}

const fixtureText = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

const fixtureBytes = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));

const splitBytes = (bytes: Uint8Array, at: number): readonly Uint8Array[] => [
  bytes.slice(0, at),
  bytes.slice(at),
];

const responseOf = (chunks: readonly Uint8Array[], status = 200): Response => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }

      controller.close();
    },
  });

  return new Response(body, {
    headers: { "content-type": "text/event-stream" },
    status,
  });
};

const clientOf = (
  response: Response,
  captured: Ref.Ref<readonly Captured[]>
): HttpClient.HttpClient =>
  HttpClient.make((request) =>
    Effect.gen(function* captureAnthropicRequest() {
      const body = request.body;
      const bytes = Predicate.isTagged(body, "Uint8Array")
        ? body.body
        : new Uint8Array();

      yield* Ref.update(captured, (all) => [
        ...all,
        {
          body: new TextDecoder().decode(bytes),
          header: request.headers,
          method: request.method,
          url: request.url,
        },
      ]);

      return HttpClientResponse.fromWeb(request, response);
    })
  );

const turn = (index: number): ChatTurn => ({
  content: `turn-${index}`,
  role: index % 2 === 0 ? "user" : "assistant",
});

const answerRequest = buildAnswerRequest({
  articleContext: fixtureText("article-context.txt"),
  history: Array.from({ length: 12 }, (_unused, index) => turn(index)),
  page: {
    title: "Install the CLI",
    url: "https://docs.hypertask.ai/cli/install",
  },
  profile: {
    has_hypertask_account: "unknown",
    visitor_email: null,
    visitor_name: "Ada",
  },
  userContent: toAnswerUserContent(
    "What is this error?",
    "data:image/png;base64,iVBORw0KGgo=\nAAA"
  ),
});

const collect = (chunks: readonly Uint8Array[], status = 200) =>
  Effect.gen(function* collectAnswer() {
    const captured = yield* Ref.make<readonly Captured[]>([]);
    const text = yield* Ref.make("");

    const layer = answerModelLayer.pipe(
      Layer.provide(
        Layer.merge(
          AnthropicConfig.configLayer({ apiKey: Redacted.make("test-key") }),
          Layer.succeed(
            HttpClient.HttpClient,
            clientOf(responseOf(chunks, status), captured)
          )
        )
      )
    );

    const read = yield* AnswerModel.use((model) =>
      model.stream(answerRequest, (piece) =>
        Ref.update(text, (current) => current + piece)
      )
    ).pipe(Effect.provide(layer));

    return {
      captured: yield* Ref.get(captured),
      read,
      text: yield* Ref.get(text),
    };
  });

describe("help answer model over the Cloudflare AI Gateway", () => {
  it.effect("sends the recorded request body and headers", () =>
    Effect.gen(function* sendRecordedRequest() {
      const run = yield* collect([fixtureBytes("answer.sse")]);
      const request = run.captured[0];

      expect(request?.url).toBe(ANTHROPIC_MESSAGES_URL);
      expect(request?.method).toBe("POST");
      expect(request?.header["x-api-key"]).toBe("test-key");
      expect(request?.header["anthropic-version"]).toBe("2023-06-01");
      expect(request?.header.accept).toBe("text/event-stream");
      expect(request?.header["content-type"]).toBe("application/json");
      expect(request?.header["cf-aig-metadata"]).toBe(
        '{"worker":"ai-chatbot","client":"hypertask"}'
      );
      expect(request?.body).toBe(fixtureText("answer-request.json"));
    })
  );

  it.effect("joins the text pieces and records usage and the stop reason", () =>
    Effect.gen(function* readNormalAnswer() {
      const run = yield* collect([fixtureBytes("answer.sse")]);

      expect(run.text).toBe("Hello there");
      expect(run.read.stopReason).toBe("end_turn");
      expect(run.read.thinkingTokens).toBe(0);
      expect(run.read.usage).toEqual({
        cache_creation_input_tokens: 400,
        cache_read_input_tokens: 800,
        input_tokens: 120,
        output_tokens: 9,
      });
    })
  );

  it.effect("reads an answer split in the middle of an event", () =>
    Effect.gen(function* readSplitEvent() {
      const bytes = fixtureBytes("answer.sse");
      const at = fixtureText("answer.sse").indexOf('"text":"Hello"') + 8;
      const run = yield* collect(splitBytes(bytes, at));

      expect(run.text).toBe("Hello there");
      expect(run.read.stopReason).toBe("end_turn");
      expect(run.read.usage.output_tokens).toBe(9);
    })
  );

  it.effect(
    "reads an answer split in the middle of a multi-byte character",
    () =>
      Effect.gen(function* readSplitCharacter() {
        const text = fixtureText("answer-multibyte.sse");
        const at =
          new TextEncoder().encode(text.slice(0, text.indexOf("é"))).length + 1;
        const chunks = splitBytes(fixtureBytes("answer-multibyte.sse"), at);
        const run = yield* collect(chunks);

        expect(run.text).toBe("café — done");
        expect(run.read.stopReason).toBe("end_turn");
      })
  );
});

const stopReasons = [
  "end_turn",
  "max_tokens",
  "stop_sequence",
  "tool_use",
  "pause_turn",
  "refusal",
] as const;

describe("help answer stop reasons", () => {
  it.effect.each(stopReasons)("records stop reason %s", (stopReason) =>
    Effect.gen(function* readStopReason() {
      const run = yield* collect([fixtureBytes(`stop-${stopReason}.sse`)]);

      expect(run.text).toBe("Half an ans");
      expect(run.read.stopReason).toBe(stopReason);
    })
  );
});

describe("help answer failures", () => {
  it.effect(
    "stops with the busy failure when an error event arrives mid stream",
    () =>
      Effect.gen(function* readErrorMidStream() {
        const failure = yield* Effect.flip(
          collect([fixtureBytes("error-mid-stream.sse")])
        );

        expect(Predicate.isTagged(failure, "AnswerRefused")).toBe(true);
        expect(failure.detail).toBe("overloaded_error Overloaded");
      })
  );

  it.effect("retries an overloaded answer that never showed text", () =>
    Effect.gen(function* readOverloadedAnswer() {
      const failure = yield* Effect.flip(
        collect([fixtureBytes("overloaded.sse")])
      );

      expect(Predicate.isTagged(failure, "RetryableAnswerFailure")).toBe(true);
      expect(failure.detail).toBe("overloaded_error Overloaded");
    })
  );

  it.effect("ignores a malformed event and keeps reading", () =>
    Effect.gen(function* readMalformedEvent() {
      const run = yield* collect([fixtureBytes("malformed-event.sse")]);

      expect(run.text).toBe("Still here");
      expect(run.read.stopReason).toBe("end_turn");
    })
  );

  it.effect("hides reasoning deltas and records the thinking tokens", () =>
    Effect.gen(function* readThinkingAnswer() {
      const run = yield* collect([fixtureBytes("thinking.sse")]);

      expect(run.text).toBe("Visible");
      expect(run.read.thinkingTokens).toBe(12);
      expect(run.read.usage.output_tokens).toBe(14);
    })
  );

  it.effect("retries a 529 and a 500", () =>
    Effect.gen(function* readRetryableStatus() {
      const overloaded = yield* Effect.flip(
        collect(
          [new TextEncoder().encode(fixtureText("overloaded-status.json"))],
          529
        )
      );
      const serverError = yield* Effect.flip(
        collect([new TextEncoder().encode("")], 500)
      );

      expect(Predicate.isTagged(overloaded, "RetryableAnswerFailure")).toBe(
        true
      );
      expect(overloaded.status).toBe(529);
      expect(Predicate.isTagged(serverError, "RetryableAnswerFailure")).toBe(
        true
      );
      expect(serverError.status).toBe(500);
    })
  );

  it.effect("refuses a 400", () =>
    Effect.gen(function* readRefusedStatus() {
      const invalid = yield* Effect.flip(
        collect(
          [new TextEncoder().encode(fixtureText("invalid-request.json"))],
          400
        )
      );

      expect(Predicate.isTagged(invalid, "AnswerRefused")).toBe(true);
      expect(invalid.status).toBe(400);
    })
  );

  it.effect("returns no text for an empty stream", () =>
    Effect.gen(function* readEmptyStream() {
      const run = yield* collect([new Uint8Array()]);

      expect(run.text).toBe("");
      expect(run.read.stopReason).toBe(null);
      expect(run.read.usage).toEqual({
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        input_tokens: 0,
        output_tokens: 0,
      });
    })
  );
});
