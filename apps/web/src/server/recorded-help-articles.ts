import {
  HelpArticle,
  HelpArticleMatch,
  HelpArticleSummary,
} from "@rat-stack/core/contracts";
import { HelpArticleStore } from "@rat-stack/core/help-article-store";
import type {
  HelpArticleSearch,
  HelpArticleSummaryValue,
  HelpArticleValue,
} from "@rat-stack/core/help-article-store";
import { helpSearchKeywords } from "@rat-stack/core/help-articles";
import { Schema } from "effect";

import recordedAnswers from "../../test/fixtures/help-article-answers.json";
import { decodeSlug } from "./help-pages.js";

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

const decodeMatches = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Array(HelpArticleMatch))
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

const SEARCH_ROW_PREFIX = `${ARTICLE_ROW_PREFIX}search/`;

const isArticleRow = (path: string, status: number): boolean =>
  path.startsWith(ARTICLE_ROW_PREFIX) &&
  !path.startsWith(SEARCH_ROW_PREFIX) &&
  status === 200;

const searchQueryOf = (path: string): string | undefined =>
  path.startsWith(SEARCH_ROW_PREFIX)
    ? decodeSlug(path.slice(SEARCH_ROW_PREFIX.length))
    : undefined;

export const recordedHelpArticleRows: readonly HelpArticleValue[] =
  recorded.rows
    .filter((row) => isArticleRow(row.path, row.status))
    .map((row) => decodeArticle(row.body));

export const recordedArticlePaths: readonly string[] = recorded.rows
  .filter((row) => isArticleRow(row.path, row.status))
  .map((row) => `/help/${row.path.slice(ARTICLE_ROW_PREFIX.length)}`);

export const recordedHelpArticleList: readonly HelpArticleSummaryValue[] =
  decodeSummaries(rowWithId("articles-list").body);

export const recordedHelpArticleSearches: readonly HelpArticleSearch[] =
  recorded.rows.flatMap((row) => {
    const query = searchQueryOf(row.path);

    return query === undefined
      ? []
      : [
          {
            keywords: helpSearchKeywords(query).join(" "),
            matches: decodeMatches(row.body),
          },
        ];
  });

export const recordedHelpArticles = HelpArticleStore.layer({
  articles: recordedHelpArticleRows,
  list: recordedHelpArticleList,
  searches: recordedHelpArticleSearches,
});
