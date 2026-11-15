import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";

import {
  AdminUsageReport,
  buildUsageReport,
  usageSince,
  usageWindowDays,
} from "../src/admin-usage.js";

const OLD_PRICE_BASIS =
  "Claude API global list prices effective 2026-10-07. Ephemeral cache_control is the 5-minute write price. A prompt over 100000 tokens (input + cache write + cache read) uses the higher tier for that message.";

const OTHER_MODEL_ROW = {
  cache_creation_input_tokens: 40,
  cache_creation_input_tokens_over_100k: 0,
  cache_read_input_tokens: 30,
  cache_read_input_tokens_over_100k: 0,
  day: "2026-11-01",
  input_tokens: 10,
  input_tokens_over_100k: 0,
  messages: 2,
  model: "other-model",
  output_tokens: 20,
  output_tokens_over_100k: 0,
};

const UNDER_TIER_ROW = {
  cache_creation_input_tokens: 0,
  cache_creation_input_tokens_over_100k: 0,
  cache_read_input_tokens: 0,
  cache_read_input_tokens_over_100k: 0,
  day: "2026-11-02",
  input_tokens: 10_000,
  input_tokens_over_100k: 0,
  messages: 1,
  model: "claude-haiku-5-5",
  output_tokens: 1000,
  output_tokens_over_100k: 0,
};

const OVER_TIER_ROW = {
  cache_creation_input_tokens: 0,
  cache_creation_input_tokens_over_100k: 0,
  cache_read_input_tokens: 0,
  cache_read_input_tokens_over_100k: 0,
  day: "2026-11-03",
  input_tokens: 200_000,
  input_tokens_over_100k: 200_000,
  messages: 1,
  model: "claude-haiku-5-5",
  output_tokens: 1000,
  output_tokens_over_100k: 1000,
};

const report = buildUsageReport(
  [OTHER_MODEL_ROW, UNDER_TIER_ROW, OVER_TIER_ROW],
  7
);

describe("the usage report", () => {
  it("bills each Haiku day by the price tier its prompt lands in", () => {
    expect(report.days).toEqual([
      {
        cache_creation_input_tokens: 40,
        cache_read_input_tokens: 30,
        cost_usd: null,
        day: "2026-11-01",
        input_tokens: 10,
        messages: 2,
        model: "other-model",
        output_tokens: 20,
      },
      {
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        cost_usd: 0.0015,
        day: "2026-11-02",
        input_tokens: 10_000,
        messages: 1,
        model: "claude-haiku-5-5",
        output_tokens: 1000,
      },
      {
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        cost_usd: 0.1025,
        day: "2026-11-03",
        input_tokens: 200_000,
        messages: 1,
        model: "claude-haiku-5-5",
        output_tokens: 1000,
      },
    ]);
  });

  it("totals every model and bills only the Haiku rows", () => {
    expect(report.totals).toEqual({
      cache_creation_input_tokens: 40,
      cache_read_input_tokens: 30,
      cost_usd: 0.104,
      input_tokens: 210_010,
      messages: 4,
      output_tokens: 2020,
    });
  });

  it("answers with the old model, currency, window and price basis", () => {
    expect({
      currency: report.currency,
      model: report.model,
      price_basis: report.price_basis,
      prices_per_mtok: report.prices_per_mtok,
      window_days: report.window_days,
    }).toEqual({
      currency: "USD",
      model: "claude-haiku-5-5",
      price_basis: OLD_PRICE_BASIS,
      prices_per_mtok: {
        over_100k: {
          cache_creation: 0.625,
          cache_read: 0.05,
          input: 0.5,
          output: 2.5,
        },
        up_to_100k: {
          cache_creation: 0.125,
          cache_read: 0.01,
          input: 0.1,
          output: 0.5,
        },
      },
      window_days: 7,
    });
  });

  it("answers a value the contract output schema round trips", () => {
    const encoded = Schema.encodeSync(AdminUsageReport)(report);

    expect(Schema.decodeUnknownSync(AdminUsageReport)(encoded)).toEqual(report);
  });
});

describe("the usage window", () => {
  it("keeps the old default when the days are missing or not a number", () => {
    expect([usageWindowDays(undefined), usageWindowDays("abc")]).toEqual([
      30, 30,
    ]);
  });

  it("clamps the days to one day and to 366 days", () => {
    expect([
      usageWindowDays("0"),
      usageWindowDays("-4"),
      usageWindowDays("400"),
    ]).toEqual([1, 1, 366]);
  });

  it("drops the fraction and keeps a whole day count", () => {
    expect([usageWindowDays("2.7"), usageWindowDays("30")]).toEqual([2, 30]);
  });

  it("counts back from the clock second in whole days", () => {
    expect([usageSince(86_405, 1), usageSince(100_000, 30)]).toEqual([
      5,
      100_000 - 30 * 86_400,
    ]);
  });
});
