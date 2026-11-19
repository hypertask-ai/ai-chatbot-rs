import { HelpArticle, HelpArticleSummary } from "@rat-stack/core/contracts";
import { HelpArticleStore } from "@rat-stack/core/help-article-store";
import { Schema } from "effect";

import recordedAnswers from "../../test/fixtures/help-article-answers.json";

const RecordedRow = Schema.Struct({
  body: Schema.String,
  id: Schema.String,
  path: Schema.String,
  status: Schema.Finite,
});

const RecordedAnswers = Schema.Struct({
  rows: Schema.Array(RecordedRow),
});

const decodeSummaries = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Array(HelpArticleSummary))
);

const decodeArticle = Schema.decodeUnknownSync(
  Schema.fromJsonString(HelpArticle)
);

const recorded = Schema.decodeSync(RecordedAnswers)(recordedAnswers);

const rowWithId = (id: string) => {
  const row = recorded.rows.find((candidate) => candidate.id === id);

  if (row === undefined) {
    throw new Error(
      `The recorded help answers hold no row ${id}. Fix: record the answer again with a GET to help.hypertask.ai.`
    );
  }

  return row;
};

const ARTICLE_ROW_PREFIX = "/api/articles/";

const isArticleRow = (path: string, status: number): boolean =>
  path.startsWith(ARTICLE_ROW_PREFIX) &&
  !path.startsWith(`${ARTICLE_ROW_PREFIX}search/`) &&
  status === 200;

export const recordedArticlePaths: readonly string[] = recorded.rows
  .filter((row) => isArticleRow(row.path, row.status))
  .map((row) => `/help/${row.path.slice(ARTICLE_ROW_PREFIX.length)}`);

export const recordedHelpArticles = HelpArticleStore.layer({
  articles: recorded.rows
    .filter((row) => isArticleRow(row.path, row.status))
    .map((row) => decodeArticle(row.body)),
  list: decodeSummaries(rowWithId("articles-list").body),
  searches: [],
});
