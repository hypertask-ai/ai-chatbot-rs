import {
  HelpArticle,
  HelpArticleMatch,
  HelpArticleSummary,
} from "@rat-stack/core/contracts";
import { HelpArticleStore } from "@rat-stack/core/help-article-store";
import type {
  HelpArticleMatchValue,
  HelpArticleValue,
} from "@rat-stack/core/help-article-store";
import { Effect, Layer, Option, Schema } from "effect";

import { DatabaseError } from "./model.js";
import type { DatabaseOperation } from "./model.js";

export const MATCH_CANDIDATE_LIMIT = 30;

const SEARCH_RESULT_LIMIT = 10;

const TITLE_WEIGHT = 3;

const CONTENT_WEIGHT = 1;

export interface HelpArticleOperations {
  readonly contentMatches: (
    pattern: string
  ) => Effect.Effect<readonly unknown[], DatabaseError>;
  readonly listRows: Effect.Effect<readonly unknown[], DatabaseError>;
  readonly readRow: (
    slug: string
  ) => Effect.Effect<readonly unknown[], DatabaseError>;
  readonly titleMatches: (
    pattern: string
  ) => Effect.Effect<readonly unknown[], DatabaseError>;
}

interface ScoredMatch {
  readonly row: HelpArticleMatchValue;
  readonly score: number;
}

export const queryFailure =
  (operation: DatabaseOperation) =>
  (cause: unknown): DatabaseError =>
    new DatabaseError({ cause, operation });

const rememberMatches = (
  matches: Map<string, ScoredMatch>,
  rows: readonly HelpArticleMatchValue[],
  weight: number
) => {
  for (const row of rows) {
    const existing = matches.get(row.id);

    matches.set(row.id, {
      row: existing?.row ?? row,
      score: (existing?.score ?? 0) + weight,
    });
  }
};

const rankMatches = (matches: Map<string, ScoredMatch>) =>
  [...matches.values()]
    .toSorted((left, right) => right.score - left.score)
    .slice(0, SEARCH_RESULT_LIMIT)
    .map((match) => match.row);

const loadSummaries = (source: HelpArticleOperations) =>
  Effect.gen(function* listHelpArticles() {
    const rows = yield* source.listRows;

    // oxlint-disable-next-line unicorn/no-array-method-this-argument -- Effect.forEach is not Array#forEach; the callback is an effectful mapper.
    return yield* Effect.forEach(rows, (row) =>
      Schema.decodeUnknownEffect(HelpArticleSummary)(row).pipe(
        Effect.mapError(queryFailure("listHelpArticles"))
      )
    );
  }).pipe(Effect.orDie);

const loadArticle = (source: HelpArticleOperations, slug: string) =>
  Effect.gen(function* readHelpArticle() {
    const rows = yield* source.readRow(slug);
    const [row] = rows;

    if (row === undefined) {
      return Option.none<HelpArticleValue>();
    }

    const article = yield* Schema.decodeUnknownEffect(HelpArticle)(row).pipe(
      Effect.mapError(queryFailure("readHelpArticle"))
    );

    return Option.some(article);
  }).pipe(Effect.orDie);

const loadMatches = (
  source: HelpArticleOperations,
  keywords: readonly string[]
) =>
  Effect.gen(function* searchHelpArticles() {
    const matches = new Map<string, ScoredMatch>();

    for (const keyword of keywords) {
      const pattern = `%${keyword}%`;

      const titleRows = yield* source.titleMatches(pattern);

      // oxlint-disable-next-line unicorn/no-array-method-this-argument -- Effect.forEach is not Array#forEach; the callback is an effectful mapper.
      const titles = yield* Effect.forEach(titleRows, (row) =>
        Schema.decodeUnknownEffect(HelpArticleMatch)(row).pipe(
          Effect.mapError(queryFailure("searchHelpArticles"))
        )
      );

      rememberMatches(matches, titles, TITLE_WEIGHT);

      const contentRows = yield* source.contentMatches(pattern);

      // oxlint-disable-next-line unicorn/no-array-method-this-argument -- Effect.forEach is not Array#forEach; the callback is an effectful mapper.
      const contents = yield* Effect.forEach(contentRows, (row) =>
        Schema.decodeUnknownEffect(HelpArticleMatch)(row).pipe(
          Effect.mapError(queryFailure("searchHelpArticles"))
        )
      );

      rememberMatches(matches, contents, CONTENT_WEIGHT);
    }

    return rankMatches(matches);
  }).pipe(Effect.orDie);

export const helpArticleLayer = <E, R>(
  operations: Effect.Effect<HelpArticleOperations, E, R>
) =>
  Layer.effect(
    HelpArticleStore,
    Effect.gen(function* buildHelpArticleLayer() {
      const source = yield* operations;

      return HelpArticleStore.of({
        list: loadSummaries(source),
        read: (slug) => loadArticle(source, slug),
        search: (keywords) => loadMatches(source, keywords),
      });
    })
  );
