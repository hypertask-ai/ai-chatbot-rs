import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Schema } from "effect";

import {
  EVAL_HEADER,
  EXCLUDE_EVAL_SQL,
  isEvalConversation,
  isVerifiedEvalRequest,
} from "../src/eval-traffic.js";

const SECRET = "eval-secret";

describe("test traffic marker", () => {
  it("reads the header the replay harness sends", () => {
    expect(EVAL_HEADER).toBe("x-eval-token");
  });

  it("keeps the admin inbox predicate identical", () => {
    expect(EXCLUDE_EVAL_SQL).toBe("COALESCE(c.is_eval, 0) = 0");
  });

  it("matches the header only against the worker secret", () => {
    expect(isVerifiedEvalRequest(SECRET, SECRET)).toBe(true);
    expect(isVerifiedEvalRequest("eval-secret-extra", SECRET)).toBe(false);
    expect(isVerifiedEvalRequest("eval-secre", SECRET)).toBe(false);
    expect(isVerifiedEvalRequest("1", SECRET)).toBe(false);
    expect(isVerifiedEvalRequest("eval-secret", undefined)).toBe(false);
    expect(isVerifiedEvalRequest(undefined, SECRET)).toBe(false);
    expect(isVerifiedEvalRequest("", SECRET)).toBe(false);
    expect(isVerifiedEvalRequest(SECRET, "")).toBe(false);
  });

  it.prop(
    "matches a header equal to the secret and nothing else",
    [Arbitrary.schema(Schema.String)],
    ([secret]) => {
      expect(isVerifiedEvalRequest(secret, secret)).toBe(secret !== "");
      expect(isVerifiedEvalRequest(`${secret}x`, secret)).toBe(false);
      expect(isVerifiedEvalRequest(secret.slice(1), secret)).toBe(false);
    }
  );

  it("reads the three stored forms of an eval flag", () => {
    expect(isEvalConversation(1)).toBe(true);
    expect(isEvalConversation(true)).toBe(true);
    expect(isEvalConversation("1")).toBe(true);
    expect(isEvalConversation(0)).toBe(false);
    expect(isEvalConversation(false)).toBe(false);
    expect(isEvalConversation("0")).toBe(false);
    expect(isEvalConversation(null)).toBe(false);
    expect(isEvalConversation(undefined)).toBe(false);
    expect(isEvalConversation("eval-customer")).toBe(false);
  });
});
