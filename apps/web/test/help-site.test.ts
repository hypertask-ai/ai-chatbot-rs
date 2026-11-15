import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { handleRequest } from "foldkit/experimental/server";

import { renderPage } from "../src/entry.server.js";
import recordedAnswers from "./fixtures/help-site-answers.json";

const RecordedRow = Schema.Struct({
  body: Schema.String,
  headers: Schema.Record(Schema.String, Schema.String),
  id: Schema.String,
  method: Schema.String,
  origin: Schema.NullOr(Schema.String),
  path: Schema.String,
  requestMethod: Schema.NullOr(Schema.String),
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

const site = "https://help.hypertask.ai";

const hostAddedVaryFields = new Set(["accept", "sec-fetch-dest"]);

const varyFields = (value: string | null): readonly string[] =>
  (value ?? "")
    .split(",")
    .map((field) => field.trim().toLowerCase())
    .filter((field) => field !== "");

const requestFor = (row: typeof RecordedRow.Type): Request => {
  const headers = new Headers();

  if (row.origin !== null) {
    headers.set("origin", row.origin);
  }

  if (row.requestMethod !== null) {
    headers.set("access-control-request-method", row.requestMethod);
  }

  return new Request(`${site}${row.path}`, { headers, method: row.method });
};

const answer = (request: Request): Promise<Response> =>
  handleRequest(request, { renderDocument: () => "", renderPage });

describe("help site answers recorded from the old site", () => {
  for (const row of recorded.rows) {
    it.effect(`answers ${row.id} the way the old site does`, () =>
      Effect.gen(function* recordedRow() {
        const response = yield* Effect.promise(() => answer(requestFor(row)));

        expect(response.status, row.id).toBe(row.status);

        for (const name of recorded.comparedHeaders) {
          const expected = row.headers[name] ?? null;
          const actual = response.headers.get(name);

          if (name === "vary") {
            const kept = varyFields(expected);
            const answered = varyFields(actual);

            expect(
              kept.filter((field) => !answered.includes(field)),
              `${row.id} keeps ${expected}`
            ).toEqual([]);
            expect(
              answered.filter(
                (field) =>
                  !kept.includes(field) && !hostAddedVaryFields.has(field)
              ),
              `${row.id} adds no field beyond ${expected} and the page host`
            ).toEqual([]);

            continue;
          }

          expect(actual, `${row.id} ${name}`).toBe(expected);
        }

        expect(
          yield* Effect.promise(() => response.text()),
          `${row.id} body`
        ).toBe(row.body);
      })
    );
  }

  it.effect("answers a preflight before any route can refuse the path", () =>
    Effect.gen(function* preflightBeforeRouting() {
      const response = yield* Effect.promise(() =>
        answer(
          new Request(`${site}/nope`, {
            headers: {
              "access-control-request-method": "GET",
              origin: "https://hypertask.ai",
            },
            method: "OPTIONS",
          })
        )
      );

      expect(response.status).toBe(204);
      expect(response.headers.get("access-control-allow-origin")).toBe(
        "https://hypertask.ai"
      );
    })
  );

  it.effect("refuses an origin that is not on the allow list", () =>
    Effect.gen(function* refusedOrigin() {
      const response = yield* Effect.promise(() =>
        answer(
          new Request(`${site}/`, {
            headers: { origin: "https://docs.hypertask.ai.evil.example" },
          })
        )
      );

      expect(response.status).toBe(302);
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    })
  );

  it.effect(
    "lets the page host refuse a request that will not accept HTML",
    () =>
      Effect.gen(function* pageHostNegotiation() {
        const health = yield* Effect.promise(() =>
          answer(
            new Request(`${site}/health`, {
              headers: { accept: "application/json" },
            })
          )
        );

        const root = yield* Effect.promise(() =>
          answer(
            new Request(`${site}/`, {
              headers: { accept: "application/json" },
            })
          )
        );

        expect(health.status).toBe(404);
        expect(root.status).toBe(302);
      })
  );
});
