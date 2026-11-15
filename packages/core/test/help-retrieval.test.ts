import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";

import {
  HelpSearchArticle,
  expandedHelpQueryTerms,
  helpArticleStem,
  rankHelpArticles,
} from "../src/help-search.js";
import type { HelpSearchArticleValue } from "../src/help-search.js";
import articlesJson from "./fixtures/help-articles.json" with { type: "json" };
import answersJson from "./fixtures/help-retrieval-answers.json" with { type: "json" };
import typosJson from "./fixtures/help-retrieval-typos.json" with { type: "json" };

const corpus = Schema.decodeUnknownSync(Schema.Array(HelpSearchArticle))(
  articlesJson
);

const answers = Schema.decodeUnknownSync(
  Schema.Struct({
    defaultIds: Schema.Array(Schema.String),
    defaultQuery: Schema.String,
    method: Schema.String,
    questions: Schema.Array(
      Schema.Struct({
        ids: Schema.Array(Schema.String),
        query: Schema.String,
      })
    ),
    recorded: Schema.String,
    source: Schema.String,
  })
)(answersJson);

const typos = Schema.decodeUnknownSync(
  Schema.Struct({
    rows: Schema.Array(
      Schema.Struct({
        acceptable_slugs: Schema.Array(Schema.String),
        id: Schema.String,
        note: Schema.String,
        question: Schema.String,
      })
    ),
    source: Schema.String,
  })
)(typosJson);

const slugsOf = (
  articles: readonly HelpSearchArticleValue[]
): readonly string[] => articles.map((article) => article.slug);

const idsOf = (
  articles: readonly HelpSearchArticleValue[]
): readonly string[] => articles.map((article) => article.id);

describe("help chat retrieval", () => {
  it("answers every recorded question with the same articles in the same order", () => {
    expect(answers.questions.length).toBeGreaterThan(24);

    for (const question of answers.questions) {
      expect(
        idsOf(rankHelpArticles(corpus, question.query)),
        question.query
      ).toEqual(question.ids);
    }
  });

  it("answers the default question the old debug view falls back to", () => {
    expect(idsOf(rankHelpArticles(corpus, answers.defaultQuery))).toEqual(
      answers.defaultIds
    );
  });

  it("reaches an accepted article for every recorded typo", () => {
    for (const row of typos.rows) {
      const slugs = slugsOf(rankHelpArticles(corpus, row.question, 5));

      expect(
        slugs.some((slug) => row.acceptable_slugs.includes(slug)),
        `${row.id} ${row.question} answered ${slugs.join(",")}`
      ).toBe(true);
    }
  });

  it("reads a transposed word as the word it meant", () => {
    expect(slugsOf(rankHelpArticles(corpus, "tiem trackng", 3))[0]).toBe(
      "docs-features-time-tracking"
    );
    expect(slugsOf(rankHelpArticles(corpus, "slak", 3))[0]).toBe(
      "docs-features-slack"
    );
  });

  it("joins the inflected forms of one word on one stem", () => {
    const groups = [
      [
        "connect",
        "connects",
        "connected",
        "connecting",
        "connection",
        "connections",
      ],
      [
        "integrate",
        "integrates",
        "integrated",
        "integrating",
        "integration",
        "integrations",
      ],
      [
        "configure",
        "configures",
        "configured",
        "configuring",
        "configuration",
        "configurations",
      ],
      [
        "install",
        "installs",
        "installed",
        "installing",
        "installation",
        "installations",
      ],
    ];

    for (const words of groups) {
      const stems = new Set<string>();

      for (const word of words) {
        stems.add(helpArticleStem(word));
      }

      expect(
        stems.size,
        `${words.join(" ")} gave ${[...stems].join(" ")}`
      ).toBe(1);
    }

    expect(helpArticleStem("limitations")).toBe("limit");
    expect(helpArticleStem("restrictions")).toBe("limit");
  });

  it("reads the plan words as the words the pricing article holds", () => {
    expect(expandedHelpQueryTerms(corpus, "team size")).toEqual([
      "team",
      "size",
      "seat",
    ]);
    expect(expandedHelpQueryTerms(corpus, "restrictions")).toEqual([
      "restrictions",
      "limit",
    ]);
    expect(expandedHelpQueryTerms(corpus, "slak")).toEqual(["slack"]);
    expect(expandedHelpQueryTerms(corpus, "")).toEqual([]);
  });

  it("finds nothing for a query with no word to look for", () => {
    expect(rankHelpArticles(corpus, "")).toEqual([]);
    expect(rankHelpArticles(corpus, "   ")).toEqual([]);
    expect(rankHelpArticles(corpus, "how do i do it")).toEqual([]);
    expect(rankHelpArticles(corpus, "a")).toEqual([]);
  });

  it("finds nothing for a word no article holds", () => {
    expect(rankHelpArticles(corpus, "zzzqx")).toEqual([]);
    expect(rankHelpArticles(corpus, "qwertyuiopasdfgh")).toEqual([]);
  });

  it("keeps a long question inside the eight article cap", () => {
    const long =
      "how do i connect my coding agent to a board and get it to pick up tickets automatically without asking me every time please explain the whole setup step by step including the settings i need";

    expect(rankHelpArticles(corpus, long).length).toBe(8);
    expect(slugsOf(rankHelpArticles(corpus, long))[0]).toBe(
      "docs-connect-an-agent"
    );
  });

  it("reads a capitalised or accented query the way the old tokenizer does", () => {
    expect(slugsOf(rankHelpArticles(corpus, "BOARD"))).toEqual(
      slugsOf(rankHelpArticles(corpus, "board"))
    );
    expect(slugsOf(rankHelpArticles(corpus, "café board"))).toEqual(
      slugsOf(rankHelpArticles(corpus, "board"))
    );
    expect(slugsOf(rankHelpArticles(corpus, "pricing-plans?"))[0]).toBe(
      "pricing-plans"
    );
  });
});
