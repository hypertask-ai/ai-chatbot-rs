import { describe, expect, it } from "@effect/vitest";
import { HelpArticlePane } from "@rat-stack/core/contracts";
import {
  FREE_BOARD_CAP,
  PAID_SEAT_CAP,
  TRIAL_DAYS,
  YEARLY_SAVE_PERCENT,
  helpPlans,
  helpPlansHtml,
  helpSeatRate,
} from "@rat-stack/core/help-plans";
import { Schema } from "effect";

import recordedAnswers from "./fixtures/help-article-answers.json";

const RecordedRow = Schema.Struct({
  body: Schema.String,
  headers: Schema.Record(Schema.String, Schema.String),
  id: Schema.String,
  method: Schema.String,
  path: Schema.String,
  status: Schema.Finite,
});

const RecordedAnswers = Schema.Struct({
  comparedHeaders: Schema.Array(Schema.String),
  method: Schema.String,
  recorded: Schema.String,
  rows: Schema.Array(RecordedRow),
  source: Schema.String,
});

const recorded = Schema.decodeUnknownSync(RecordedAnswers)(recordedAnswers);

const decodePane = Schema.decodeUnknownSync(
  Schema.fromJsonString(HelpArticlePane)
);

const recordedRow = (id: string) => {
  const row = recorded.rows.find((candidate) => candidate.id === id);

  if (row === undefined) {
    throw new Error(`The recorded answers hold no row ${id}`);
  }

  return row;
};

const recordedPane = decodePane(recordedRow("reader-pricing-plans").body);

describe("pricing plans block", () => {
  it("answers the recorded pricing plans block byte for byte", () => {
    expect(helpPlansHtml("pricing-plans")).toBe(recordedPane.plansHtml);
  });

  it("keeps the three plans in the old order and at the old prices", () => {
    expect(helpPlans.map((plan) => plan.id)).toEqual(["free", "byok", "pro"]);
    expect(helpPlans.map((plan) => plan.monthlyPerSeatUsd)).toEqual([
      0, 10, 20,
    ]);
  });

  it("keeps the seat figures the old plans publish", () => {
    expect(PAID_SEAT_CAP).toBe(50);
    expect(TRIAL_DAYS).toBe(14);
    expect(YEARLY_SAVE_PERCENT).toBe(20);
    expect(FREE_BOARD_CAP).toBe(3);
    expect(helpSeatRate(10)).toEqual({
      monthlyPerSeatUsd: 10,
      yearlyPerSeatUsd: 8,
      yearlyTotalPerSeatUsd: 96,
    });
    expect(helpSeatRate(20)).toEqual({
      monthlyPerSeatUsd: 20,
      yearlyPerSeatUsd: 16,
      yearlyTotalPerSeatUsd: 192,
    });
  });

  it("publishes the free board limit, the trial and the seat cap", () => {
    const html = helpPlansHtml("pricing-plans");

    expect(html).toContain("Own up to 3 boards (archived boards do not count)");
    expect(html).toContain("14-day trial");
    expect(html).toContain("For more than 50 seats");
    expect(html).toContain("save 20%");
  });

  it("answers no plans block for any other article", () => {
    expect(helpPlansHtml("getting-started")).toBe("");
  });
});
