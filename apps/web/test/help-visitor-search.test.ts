import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";

import {
  filterHelpArticles,
  helpSearchHits,
  helpVisitorQuery,
} from "../src/client/help/search.js";
import visitorJson from "./fixtures/help-visitor-search.json";

const HelpVisitorCard = Schema.Struct({
  category: Schema.String,
  excerpt: Schema.String,
  slug: Schema.String,
  title: Schema.String,
});

const visitor = Schema.decodeUnknownSync(
  Schema.Struct({
    cards: Schema.Array(HelpVisitorCard),
    queries: Schema.Array(
      Schema.Struct({
        query: Schema.String,
        shown: Schema.Literals(["categories", "no-results", "results"]),
        slugs: Schema.Array(Schema.String),
      })
    ),
    recorded: Schema.String,
    rule: Schema.String,
    source: Schema.String,
  })
)(visitorJson);

const slugsOf = (
  cards: readonly { readonly slug: string }[]
): readonly string[] => cards.map((card) => card.slug);

describe("help center search box", () => {
  it("filters the article cards the way the old page filters them", () => {
    expect(visitor.queries.length).toBeGreaterThan(24);

    for (const row of visitor.queries) {
      expect(
        slugsOf(filterHelpArticles(visitor.cards, row.query)),
        row.query
      ).toEqual(row.slugs);
    }
  });

  it("shows the categories again when the box is empty", () => {
    const empty = visitor.queries.filter((row) => row.shown === "categories");

    expect(empty.length).toBeGreaterThan(0);

    for (const row of empty) {
      expect(helpVisitorQuery(row.query), row.query).toBe("");
      expect(filterHelpArticles(visitor.cards, row.query)).toEqual([]);
    }
  });

  it("keeps the order the article list arrives in", () => {
    const board = slugsOf(filterHelpArticles(visitor.cards, "board"));

    expect(board.length).toBeGreaterThan(1);
    expect(board).toEqual(
      slugsOf(visitor.cards.filter((card) => board.includes(card.slug)))
    );
  });

  it("reads punctuation in the query as the literal character it is", () => {
    expect(filterHelpArticles(visitor.cards, "pricing-plans?").length).toBe(0);
    expect(slugsOf(filterHelpArticles(visitor.cards, "custom fields"))).toEqual(
      ["docs-features-custom-fields"]
    );
  });

  it("marks each place the query appears in a title", () => {
    expect(helpSearchHits("Using Board Views", "board")).toEqual([
      { end: 11, start: 6 },
    ]);
    expect(helpSearchHits("Board and board", "BOARD")).toEqual([
      { end: 5, start: 0 },
      { end: 15, start: 10 },
    ]);
    expect(helpSearchHits("What is (Hypertask)?", "(hypertask)?")).toEqual([
      { end: 20, start: 8 },
    ]);
    expect(helpSearchHits("Using Board Views", "")).toEqual([]);
  });
});
