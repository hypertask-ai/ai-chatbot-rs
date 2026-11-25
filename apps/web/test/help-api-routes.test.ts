import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { handleRequest } from "foldkit/experimental/server";

import { renderPage } from "../src/entry.server.js";
import { sitePath } from "../src/site-base-path.js";
import apiAnswers from "./fixtures/help-api-answers.json";
import articleAnswers from "./fixtures/help-article-answers.json";

const ApiRow = Schema.Struct({
  body: Schema.String,
  headers: Schema.Record(Schema.String, Schema.String),
  id: Schema.String,
  method: Schema.String,
  path: Schema.String,
  status: Schema.Finite,
});

const ApiAnswers = Schema.Struct({
  comparedHeaders: Schema.Array(Schema.String),
  method: Schema.String,
  recorded: Schema.String,
  rows: Schema.Array(ApiRow),
  source: Schema.String,
});

const ArticleRow = Schema.Struct({
  body: Schema.String,
  id: Schema.String,
  method: Schema.String,
  path: Schema.String,
  status: Schema.Finite,
});

const ArticleAnswers = Schema.Struct({
  rows: Schema.Array(ArticleRow),
});

const recordedApi = Schema.decodeSync(ApiAnswers)(apiAnswers);

const recordedArticles = Schema.decodeSync(ArticleAnswers)(articleAnswers);

const articleRowIds = [
  "articles-list",
  "article-pricing-plans",
  "article-missing",
  "search-board",
  "search-invite",
  "search-zzzqx",
];

const articleRows = articleRowIds.map((id) => {
  const row = recordedArticles.rows.find((candidate) => candidate.id === id);

  if (row === undefined) {
    throw new Error(`The recorded article answers hold no row ${id}`);
  }

  return row;
});

const site = "https://help.hypertask.ai";

const adminConversations = "hypertask.cloudflareaccess.com";

const varyFields = (value: string | null): readonly string[] =>
  (value ?? "")
    .split(",")
    .map((field) => field.trim().toLowerCase())
    .filter((field) => field !== "");

const answer = (request: Request): Promise<Response> =>
  handleRequest(request, { renderDocument: () => "", renderPage });

const getAt = (path: string, headers: Readonly<Record<string, string>> = {}) =>
  Effect.gen(function* getRequest() {
    const request = new Request(`${site}${sitePath(path)}`, { headers });

    const response = yield* Effect.promise(() => answer(request));

    return {
      body: yield* Effect.promise(() => response.text()),
      headers: response.headers,
      status: response.status,
    };
  });

describe("the API addresses the help site answers", () => {
  for (const row of recordedApi.rows) {
    it.effect(`answers ${row.id} the way the live site does`, () =>
      Effect.gen(function* recordedRoute() {
        const answered = yield* getAt(row.path);

        expect(answered.status, row.id).toBe(row.status);

        for (const name of recordedApi.comparedHeaders) {
          expect(answered.headers.get(name), `${row.id} ${name}`).toBe(
            row.headers[name] ?? null
          );
        }

        expect(varyFields(answered.headers.get("vary")), row.id).toContain(
          "origin"
        );

        expect(answered.body, `${row.id} body`).toBe(row.body);
      })
    );
  }

  for (const row of articleRows) {
    it.effect(`answers ${row.id} the way the live site does`, () =>
      Effect.gen(function* recordedArticle() {
        const answered = yield* getAt(row.path);

        expect(answered.status, row.id).toBe(row.status);
        expect(answered.headers.get("content-type"), row.id).toBe(
          "application/json"
        );
        expect(answered.body, `${row.id} body`).toBe(row.body);
      })
    );
  }

  it.effect(
    "keeps a transcript behind the secret of the visitor who owns it",
    () =>
      Effect.gen(function* transcriptGate() {
        const refused = yield* getAt(
          "/api/chat/history/parity-missing-conversation",
          { authorization: "Bearer a-visitor-secret" }
        );

        expect(refused.status).toBe(403);
        expect(refused.headers.get("content-type")).toContain(
          "application/json"
        );
        expect(refused.body).toBe('{"error":"Forbidden"}');
      })
  );

  it.effect("sends the admin entry to the Cloudflare login", () =>
    Effect.gen(function* adminEntry() {
      const answered = yield* getAt("/admin");

      expect(answered.status).toBe(302);

      const location = answered.headers.get("location");

      expect(location).toBe(
        `https://${adminConversations}/cdn-cgi/access/login/help.hypertask.ai?redirect_url=${encodeURIComponent("/admin")}`
      );
      expect(answered.body).not.toContain("Conversations");
    })
  );

  it.effect("keeps every address below the admin entry closed", () =>
    Effect.gen(function* adminBelow() {
      const answered = yield* getAt("/admin/api/conversations");

      expect(answered.status).toBe(302);
      expect(answered.headers.get("location")).toContain(
        encodeURIComponent("/admin/api/conversations")
      );
      expect(answered.body).toBe("");
    })
  );
});
