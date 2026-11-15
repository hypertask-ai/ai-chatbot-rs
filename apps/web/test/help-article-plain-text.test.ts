import { describe, expect, it } from "@effect/vitest";
import { plainTextOf } from "@rat-stack/core";
import { HelpArticle } from "@rat-stack/core/contracts";
import { Option, Schema } from "effect";

import recordedAnswers from "./fixtures/help-article-answers.json";
import recordedPlainText from "./fixtures/help-article-plain-text.json";

const RecordedRow = Schema.Struct({
  body: Schema.String,
  id: Schema.String,
});

const RecordedAnswers = Schema.Struct({
  rows: Schema.Array(RecordedRow),
});

const recorded = Schema.decodeUnknownSync(RecordedAnswers)(recordedAnswers);

const plainText = Schema.decodeUnknownSync(
  Schema.Record(Schema.String, Schema.String)
)(recordedPlainText);

const articleOf = Schema.decodeUnknownOption(
  Schema.fromJsonString(HelpArticle)
);

const articles = recorded.rows.flatMap((row) => {
  const decoded = articleOf(row.body);

  return Option.isSome(decoded) ? [decoded.value] : [];
});

describe("plain text of every recorded help article", () => {
  it("reads every article the fixture holds", () => {
    expect(articles.map((article) => article.slug).toSorted()).toEqual(
      Object.keys(plainText).toSorted()
    );
  });

  it("matches the strip the old site ran, byte for byte", () => {
    for (const article of articles) {
      expect(plainTextOf(article.content), article.slug).toBe(
        plainText[article.slug]
      );
    }
  });
});
