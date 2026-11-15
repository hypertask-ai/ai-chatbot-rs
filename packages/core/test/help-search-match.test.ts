import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";

import { helpSearchKeywords } from "../src/help-articles.js";
import {
  HelpSearchArticle,
  scoreHelpSearchMatches,
} from "../src/help-search.js";
import type { HelpSearchArticleValue } from "../src/help-search.js";
import articlesJson from "./fixtures/help-articles.json";
import answersJson from "./fixtures/help-search-answers.json";

const corpus = Schema.decodeUnknownSync(Schema.Array(HelpSearchArticle))(
  articlesJson
);

const answers = Schema.decodeUnknownSync(
  Schema.Struct({
    queries: Schema.Array(
      Schema.Struct({
        matches: Schema.Array(
          Schema.Struct({
            category: Schema.NullOr(Schema.String),
            excerpt: Schema.NullOr(Schema.String),
            id: Schema.String,
            slug: Schema.String,
            title: Schema.String,
          })
        ),
        query: Schema.String,
      })
    ),
  })
)(answersJson);

const article = (
  id: string,
  title: string,
  content: string
): HelpSearchArticleValue => ({
  content,
  id,
  slug: id,
  title,
  url: null,
});

const slugsOf = (
  articles: readonly HelpSearchArticleValue[]
): readonly string[] => articles.map((row) => row.slug);

describe("help article keyword search", () => {
  it("finds the same articles the old site finds", () => {
    for (const row of answers.queries) {
      const slugs = slugsOf(
        scoreHelpSearchMatches(corpus, helpSearchKeywords(row.query))
      );

      expect(slugs.toSorted(), row.query).toEqual(
        row.matches.map((match) => match.slug).toSorted()
      );
      expect(slugs.at(0) ?? null, row.query).toBe(
        row.matches.at(0)?.slug ?? null
      );
    }
  });

  it("weighs a title hit three times a body hit", () => {
    const ranked = scoreHelpSearchMatches(
      [
        article("body-only", "Notes", "the board is here"),
        article("title-and-body", "Board notes", "board board"),
        article("title-only", "Board settings", "nothing else"),
      ],
      ["board"]
    );

    expect(slugsOf(ranked)).toEqual([
      "title-and-body",
      "title-only",
      "body-only",
    ]);
  });

  it("keeps the corpus order when two articles score the same", () => {
    const first = article("first", "Notes", "a board");
    const second = article("second", "More notes", "the board");

    expect(slugsOf(scoreHelpSearchMatches([first, second], ["board"]))).toEqual(
      ["first", "second"]
    );
    expect(slugsOf(scoreHelpSearchMatches([second, first], ["board"]))).toEqual(
      ["second", "first"]
    );
  });

  it("adds up the keywords a title and a body each match", () => {
    const ranked = scoreHelpSearchMatches(
      [
        article("one-word", "Anything", "a board"),
        article("two-words", "Anything", "a board and a ticket"),
        article("title-and-body", "Board", "a ticket"),
      ],
      ["board", "ticket"]
    );

    expect(slugsOf(ranked)).toEqual([
      "title-and-body",
      "two-words",
      "one-word",
    ]);
  });

  it("keeps the ten best matches", () => {
    const many = Array.from({ length: 12 }, (_unused, index) =>
      article(`article-${index}`, `Board ${index}`, "the board")
    );

    expect(scoreHelpSearchMatches(many, ["board"]).length).toBe(10);
  });

  it("reads an underscore in a keyword as the single character the old LIKE reads", () => {
    const ranked = scoreHelpSearchMatches(
      [article("shortcuts", "Keyboard Shortcuts", "press a key")],
      helpSearchKeywords("keyboard_shortcuts")
    );

    expect(helpSearchKeywords("keyboard_shortcuts")).toEqual([
      "keyboard_shortcuts",
    ]);
    expect(slugsOf(ranked)).toEqual(["shortcuts"]);
  });

  it("finds nothing when no keyword survives the query", () => {
    expect(scoreHelpSearchMatches(corpus, helpSearchKeywords("q"))).toEqual([]);
    expect(
      scoreHelpSearchMatches(corpus, helpSearchKeywords("the and"))
    ).toEqual([]);
    expect(scoreHelpSearchMatches(corpus, [])).toEqual([]);
  });
});
