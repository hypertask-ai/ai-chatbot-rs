import { describe, expect, it } from "@effect/vitest";
import { toHttpApi } from "@rat-stack/capability/http-api";
import {
  HelpArticle,
  HelpArticleMatch,
  HelpArticlePane,
  HelpArticleSummary,
} from "@rat-stack/core/contracts";
import { HelpArticleStore } from "@rat-stack/core/help-article-store";
import { helpArticleCapabilities } from "@rat-stack/core/help-articles";
import { Effect, FileSystem, Layer, Path, Schema } from "effect";
import { Etag, HttpPlatform, HttpRouter } from "effect/http";
import { HttpApiBuilder } from "effect/http-api";

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

const articleSlugs = [
  "docs-features-chat-board-filter",
  "docs-features-ai-features",
  "pricing-plans",
  "using-the-ai-task-writer-in-hypertasks-ctrlj-cmdj",
  "voice-dictation-meets-ai-speak-your-way-to-perfect-comments",
];

const searchQueries = ["board", "voice", "zzzqx"];

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

const decodeMatches = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Array(HelpArticleMatch))
);

const decodePane = Schema.decodeUnknownSync(
  Schema.fromJsonString(HelpArticlePane)
);

const memory = {
  articles: articleSlugs.map((slug) =>
    decodeArticle(rowOf(`article-${slug}`).body)
  ),
  list: decodeSummaries(rowOf("articles-list").body),
  searches: searchQueries.map((keywords) => ({
    keywords,
    matches: decodeMatches(rowOf(`search-${keywords}`).body),
  })),
};

const site = "https://help.hypertask.ai";

const TestServices = Layer.mergeAll(
  Path.layer,
  Etag.layerWeak,
  HttpPlatform.layer
).pipe(Layer.provideMerge(FileSystem.layerNoop({})));

const routes = toHttpApi("help.hypertask.ai", helpArticleCapabilities);

const siteLayer = HttpApiBuilder.layer(routes.api).pipe(
  Layer.provide(routes.layer),
  Layer.provide(HelpArticleStore.layer(memory)),
  Layer.provide(TestServices)
);

const answer = Effect.fn("helpArticles.answer")(function* answer(
  request: Request
) {
  const served = HttpRouter.toWebHandler(siteLayer, { disableLogger: true });

  yield* Effect.addFinalizer(() => Effect.promise(() => served.dispose()));

  const response = yield* Effect.promise(() => served.handler(request));

  return {
    body: yield* Effect.promise(() => response.text()),
    headers: response.headers,
    status: response.status,
  };
});

describe("help article answers recorded from the old site", () => {
  for (const row of recorded.rows) {
    it.effect(`answers ${row.id} the way the old site does`, () =>
      Effect.gen(function* recordedRow() {
        const answered = yield* answer(
          new Request(`${site}${row.path}`, { method: row.method })
        );

        expect(answered.status, row.id).toBe(row.status);

        for (const name of recorded.comparedHeaders) {
          expect(answered.headers.get(name), `${row.id} ${name}`).toBe(
            row.headers[name] ?? null
          );
        }

        expect(answered.body, `${row.id} body`).toBe(row.body);
      }).pipe(Effect.scoped)
    );
  }

  it.effect("finds the same articles when the query holds stop words", () =>
    Effect.gen(function* stopWords() {
      const answered = yield* answer(
        new Request(`${site}/api/articles/search/The%20Board`, {
          method: "GET",
        })
      );

      expect(answered.status).toBe(200);
      expect(answered.body).toBe(rowOf("search-board").body);
    }).pipe(Effect.scoped)
  );

  it.effect("answers a slug that no article holds with the old refusal", () =>
    Effect.gen(function* refusal() {
      for (const path of [
        "/api/articles/no-such-article",
        "/api/help-reader/no-such-article",
      ]) {
        const answered = yield* answer(
          new Request(`${site}${path}`, { method: "GET" })
        );

        expect(answered.status, path).toBe(404);
        expect(answered.headers.get("content-type"), path).toBe(
          "application/json"
        );
        expect(answered.body, path).toBe('{"error":"Article not found"}');
      }
    }).pipe(Effect.scoped)
  );

  it.effect("keeps the pricing plans block off every other article", () =>
    Effect.gen(function* plansOnlyOnPricing() {
      const pricing = yield* answer(
        new Request(`${site}/api/help-reader/pricing-plans`, { method: "GET" })
      );

      const other = yield* answer(
        new Request(`${site}/api/help-reader/docs-features-ai-features`, {
          method: "GET",
        })
      );

      expect(decodePane(pricing.body).plansHtml).toContain(
        '<section class="plan-board"'
      );
      expect(decodePane(other.body).plansHtml).toBe("");
    }).pipe(Effect.scoped)
  );
});
