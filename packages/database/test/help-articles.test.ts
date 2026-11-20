// @effect-diagnostics nodeBuiltinImport:off -- This test reads the answers recorded from the old site, which the web suite keeps beside its own tests.
import { readFileSync } from "node:fs";

import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { toHttpApi } from "@rat-stack/capability/http-api";
import { HelpArticle, HelpArticleSummary } from "@rat-stack/core/contracts";
import type { HelpArticleMatchValue } from "@rat-stack/core/help-article-store";
import {
  helpArticleCapabilities,
  helpSearchKeywords,
} from "@rat-stack/core/help-articles";
import { asc, eq, sql } from "drizzle-orm";
import { drizzle as drizzleSqlite } from "drizzle-orm/sql-js";
import { Effect, FileSystem, Layer, Path, Schema } from "effect";
import { Etag, HttpPlatform, HttpRouter } from "effect/http";
import { HttpApiBuilder } from "effect/http-api";
import initSqlJs from "sql.js";

import { helpArticleLayer } from "../src/help-article.js";
import { DatabaseError } from "../src/index.js";
import type { DatabaseOperation } from "../src/index.js";
import { databaseMigrationDirectory } from "../src/migrations.js";
import { Articles } from "../src/schema/d1.js";

const SITE = "https://help.hypertask.ai";

const CANDIDATE_LIMIT = 30;

const DISPLAYED_MATCHES = 10;

const TITLE_WEIGHT = 3;

const CONTENT_WEIGHT = 1;

const INSERT_ARTICLE =
  "INSERT INTO articles (id, title, slug, content, excerpt, category, url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";

const COMPARISON_MODEL_SEARCHES = ["board", "voice"];

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

const recorded = Schema.decodeUnknownSync(RecordedAnswers)(
  JSON.parse(
    readFileSync(
      new URL(
        "../../../apps/web/test/fixtures/help-article-answers.json",
        import.meta.url
      ),
      "utf-8"
    )
  )
);

const rowOf = (id: string) => {
  const row = recorded.rows.find((candidate) => candidate.id === id);

  if (row === undefined) {
    throw new Error(`The recorded answers hold no row ${id}`);
  }

  return row;
};

const decodeSummaries = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Array(HelpArticleSummary))
);

const decodeArticle = Schema.decodeUnknownSync(
  Schema.fromJsonString(HelpArticle)
);

const articleRows = recorded.rows.filter(
  (row) =>
    row.path.startsWith("/api/articles/") &&
    !row.path.startsWith("/api/articles/search/") &&
    row.status === 200
);

const articlesBySlug = new Map(
  articleRows.map((row) => {
    const article = decodeArticle(row.body);

    return [article.slug, article];
  })
);

interface SeedArticle {
  readonly category: string | null;
  readonly content: string;
  readonly createdAt: string | number;
  readonly excerpt: string | null;
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly updatedAt: string | number;
  readonly url: string | null;
}

const seedArticles = decodeSummaries(rowOf("articles-list").body).map(
  (summary): SeedArticle => {
    const article = articlesBySlug.get(summary.slug);

    return {
      category: summary.category,
      content: article?.content ?? "",
      createdAt: summary.created_at,
      excerpt: summary.excerpt,
      id: summary.id,
      slug: summary.slug,
      title: summary.title,
      updatedAt: article?.updated_at ?? summary.created_at,
      url: article?.url ?? null,
    };
  }
);

const searchModelOnly = new Set(["search-board", "search-voice"]);

const byteComparedRows = recorded.rows.filter(
  (row) => !searchModelOnly.has(row.id)
);

interface ScoredSeed {
  readonly row: HelpArticleMatchValue;
  readonly score: number;
}

// oxlint-disable-next-line sort-keys -- The old keyword search sends these fields in this order and the recorded answer compares the encoded body.
const matchOf = (article: SeedArticle): HelpArticleMatchValue => ({
  id: article.id,
  title: article.title,
  slug: article.slug,
  excerpt: article.excerpt,
  category: article.category,
});

const rememberSeedMatches = (
  matches: Map<string, ScoredSeed>,
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

const modelMatches = (query: string): readonly HelpArticleMatchValue[] => {
  const matches = new Map<string, ScoredSeed>();

  for (const keyword of helpSearchKeywords(query)) {
    const titleRows = seedArticles
      .filter((article) => article.title.toLowerCase().includes(keyword))
      .slice(0, CANDIDATE_LIMIT);

    rememberSeedMatches(matches, titleRows.map(matchOf), TITLE_WEIGHT);

    const contentRows = seedArticles
      .filter((article) => article.content.toLowerCase().includes(keyword))
      .slice(0, CANDIDATE_LIMIT);

    rememberSeedMatches(matches, contentRows.map(matchOf), CONTENT_WEIGHT);
  }

  return [...matches.values()]
    .toSorted((left, right) => right.score - left.score)
    .slice(0, DISPLAYED_MATCHES)
    .map((match) => match.row);
};

const toDatabaseError =
  (operation: DatabaseOperation) =>
  (cause: unknown): DatabaseError =>
    new DatabaseError({ cause, operation });

const queryRows = (
  operation: DatabaseOperation,
  run: () => Promise<readonly unknown[]>
) => Effect.tryPromise({ catch: toDatabaseError(operation), try: run });

const matchColumns = {
  category: Articles.category,
  excerpt: Articles.excerpt,
  id: Articles.id,
  slug: Articles.slug,
  title: Articles.title,
};

const listColumns = {
  category: Articles.category,
  created_at: Articles.createdAt,
  excerpt: Articles.excerpt,
  id: Articles.id,
  slug: Articles.slug,
  title: Articles.title,
};

const articleColumns = {
  category: Articles.category,
  content: Articles.content,
  created_at: Articles.createdAt,
  excerpt: Articles.excerpt,
  id: Articles.id,
  slug: Articles.slug,
  title: Articles.title,
  updated_at: Articles.updatedAt,
  url: Articles.url,
};

const TestServices = Layer.mergeAll(
  Path.layer,
  Etag.layerWeak,
  HttpPlatform.layer
).pipe(Layer.provideMerge(FileSystem.layerNoop({})));

const routes = toHttpApi(SITE, helpArticleCapabilities);

interface Answered {
  readonly body: string;
  readonly headers: Headers;
  readonly status: number;
}

const answer = (request: Request) =>
  Effect.gen(function* answerFromSeededStore() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const SQL = yield* Effect.promise(() => initSqlJs());

    const database = yield* Effect.acquireRelease(
      Effect.sync(() => new SQL.Database()),
      (connection) =>
        Effect.sync(() => {
          connection.close();
        })
    );

    const migrationRoot = databaseMigrationDirectory("d1");

    const migrationDirectories = (yield* fileSystem.readDirectory(
      migrationRoot
    )).toSorted();

    for (const directory of migrationDirectories) {
      const migration = yield* fileSystem.readFileString(
        path.resolve(migrationRoot, directory, "migration.sql")
      );

      yield* Effect.sync(() => database.exec(migration));
    }

    yield* Effect.sync(() => {
      for (const article of seedArticles) {
        database.run(INSERT_ARTICLE, [
          article.id,
          article.title,
          article.slug,
          article.content,
          article.excerpt,
          article.category,
          article.url,
          article.createdAt,
          article.updatedAt,
        ]);
      }
    });

    const db = drizzleSqlite(database);

    const site = HttpApiBuilder.layer(routes.api).pipe(
      Layer.provide(routes.layer),
      Layer.provide(
        helpArticleLayer(
          Effect.succeed({
            contentMatches: (pattern) =>
              queryRows("searchHelpArticles", () =>
                db
                  .select(matchColumns)
                  .from(Articles)
                  .where(sql`LOWER(${Articles.content}) LIKE ${pattern}`)
                  .limit(CANDIDATE_LIMIT)
              ),
            listRows: queryRows("listHelpArticles", () =>
              db
                .select(listColumns)
                .from(Articles)
                .orderBy(asc(Articles.category), asc(Articles.title))
            ),
            readRow: (slug) =>
              queryRows("readHelpArticle", () =>
                db
                  .select(articleColumns)
                  .from(Articles)
                  .where(eq(Articles.slug, slug))
                  .limit(1)
              ),
            titleMatches: (pattern) =>
              queryRows("searchHelpArticles", () =>
                db
                  .select(matchColumns)
                  .from(Articles)
                  .where(sql`LOWER(${Articles.title}) LIKE ${pattern}`)
                  .limit(CANDIDATE_LIMIT)
              ),
          })
        )
      ),
      Layer.provide(TestServices)
    );

    const served = HttpRouter.toWebHandler(site, { disableLogger: true });

    yield* Effect.addFinalizer(() => Effect.promise(() => served.dispose()));

    const response = yield* Effect.promise(() => served.handler(request));

    return {
      body: yield* Effect.promise(() => response.text()),
      headers: response.headers,
      status: response.status,
    } satisfies Answered;
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer));

describe("help articles read from a local D1 database", () => {
  for (const row of byteComparedRows) {
    it.effect(`answers ${row.id} the way the old site does`, () =>
      Effect.gen(function* recordedRow() {
        const answered = yield* answer(
          new Request(`${SITE}${row.path}`, { method: row.method })
        );

        expect(answered.status, row.id).toBe(row.status);

        for (const name of recorded.comparedHeaders) {
          expect(answered.headers.get(name), `${row.id} ${name}`).toBe(
            row.headers[name] ?? null
          );
        }

        expect(answered.body, `${row.id} body`).toBe(row.body);
      })
    );
  }

  for (const query of COMPARISON_MODEL_SEARCHES) {
    it.effect(`ranks ${query} like the old SQL over the recorded rows`, () =>
      Effect.gen(function* recordedSearch() {
        const answered = yield* answer(
          new Request(`${SITE}/api/articles/search/${query}`, { method: "GET" })
        );

        expect(answered.status, query).toBe(200);
        expect(answered.body, query).toBe(JSON.stringify(modelMatches(query)));
      })
    );
  }
});
