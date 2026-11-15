import { expect, it } from "@effect/vitest";
import { Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  replayVerdict,
  scoreReplay,
} from "../../../scripts/replay-retrieval-score.js";

const listings = [
  { id: "a1", slug: "one" },
  { id: "a2", slug: "two" },
  { id: "a3", slug: "three" },
] as const;

const slugById = new Map<string, string>([
  ["a1", "one"],
  ["a2", "two"],
  ["a3", "three"],
]);

const retrievalRow = Schema.Struct({
  acceptable: Schema.Array(Schema.Literals(["a1", "a2", "a3", "zz"])),
  retrieved: Schema.Array(Schema.Literals(["a1", "a2", "a3"])),
});

it.prop(
  "a case counts as a hit only when a retrieved article is one of its accepted slugs",
  {
    baseline: Arbitrary.schema(Schema.Int),
    rows: Arbitrary.schema(Schema.Array(retrievalRow)),
  },
  ({ baseline, rows }) => {
    const cases = rows.map((row, index) => ({
      acceptable_slugs: [...row.acceptable],
      id: `c${index}`,
      question: `question ${index}`,
    }));
    const readings = rows.map((row, index) => ({
      articleIds: [...row.retrieved],
      caseId: `c${index}`,
    }));
    const expectedHits = rows.map((row) => {
      const acceptable = new Set<string>(row.acceptable);
      return row.retrieved.some((id) => acceptable.has(slugById.get(id) ?? id));
    });
    const expectedCount = expectedHits.filter((hit) => hit).length;

    const score = scoreReplay({ cases, listings, readings });
    const verdict = replayVerdict({ baseline, score });

    expect(score.total).toBe(rows.length);
    expect(score.rows.map((row) => row.caseId)).toEqual(
      cases.map((item) => item.id)
    );
    expect(score.rows.map((row) => row.hit)).toEqual(expectedHits);
    expect(score.hits).toBe(expectedCount);
    expect(verdict.passed).toBe(expectedCount >= baseline);
    expect(verdict.hits).toBe(expectedCount);
  }
);

it("refuses a retrieved article that the public index does not hold", () => {
  expect(() =>
    scoreReplay({
      cases: [{ acceptable_slugs: ["one"], id: "c0", question: "q" }],
      listings,
      readings: [{ articleIds: ["a9"], caseId: "c0" }],
    })
  ).toThrow(/not in the public article index/u);
});

it("refuses a case that holds no retrieval reading", () => {
  expect(() =>
    scoreReplay({
      cases: [{ acceptable_slugs: ["one"], id: "c0", question: "q" }],
      listings,
      readings: [],
    })
  ).toThrow(/holds no retrieval reading/u);
});
