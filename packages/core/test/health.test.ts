import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import { health } from "../src/health.js";

describe("health capability", () => {
  it.effect("reports the service as ok", () =>
    Effect.gen(function* healthAnswer() {
      const answer = yield* health.handler({});
      const encoded = yield* Schema.encodeEffect(health.contract.output)(
        answer
      );

      expect(JSON.stringify(encoded)).toBe(
        '{"status":"ok","service":"ai-chatbot"}'
      );
    })
  );

  it("is a read-only GET at /health", () => {
    expect(health.contract.http).toEqual({ method: "GET", path: "/health" });
    expect(health.contract.annotations).toMatchObject({
      destructive: false,
      idempotent: true,
      readOnly: true,
    });
  });
});
