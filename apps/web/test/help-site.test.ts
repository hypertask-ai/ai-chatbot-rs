import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { handleRequest } from "foldkit/experimental/server";

import { renderPage } from "../src/entry.server.js";
import { answerHelpSiteAt } from "../src/server/help-site.js";
import {
  addSiteBasePath,
  isWithinSiteBasePath,
} from "../src/site-base-path.js";
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

const testBasePath = "/ratstack";

const hostAddedVaryFields = new Set(["accept", "sec-fetch-dest"]);

const varyFields = (value: string | null): readonly string[] =>
  (value ?? "")
    .split(",")
    .map((field) => field.trim().toLowerCase())
    .filter((field) => field !== "");

const pathAtTestAddress = (path: string): string => {
  const [route = "", ...query] = path.split("?");
  const mounted = addSiteBasePath(testBasePath, route);

  return query.length === 0 ? mounted : `${mounted}?${query.join("?")}`;
};

const requestAt = (path: string, row: typeof RecordedRow.Type): Request => {
  const headers = new Headers();

  if (row.origin !== null) {
    headers.set("origin", row.origin);
  }

  if (row.requestMethod !== null) {
    headers.set("access-control-request-method", row.requestMethod);
  }

  return new Request(`${site}${path}`, { headers, method: row.method });
};

const answer = (request: Request): Promise<Response> =>
  handleRequest(request, { renderDocument: () => "", renderPage });

const answerMounted = (request: Request) =>
  answerHelpSiteAt(testBasePath)(request).pipe(
    Effect.flatMap((answered) =>
      answered === null
        ? Effect.die(new Error(`The help site did not answer ${request.url}`))
        : Effect.succeed(answered)
    )
  );

describe("help site answers recorded from the old site", () => {
  for (const row of recorded.rows) {
    it.effect(`answers ${row.id} the way the old site does`, () =>
      Effect.gen(function* recordedRow() {
        const response = yield* Effect.promise(() =>
          answer(requestAt(row.path, row))
        );

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

        expect(response.headers.get("x-robots-tag"), row.id).toBeNull();
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

describe("the help site mounted under the test address", () => {
  for (const row of recorded.rows) {
    it.effect(`answers ${row.id} under ${testBasePath}`, () =>
      Effect.gen(function* mountedRow() {
        const response = yield* answerMounted(
          requestAt(pathAtTestAddress(row.path), row)
        );

        expect(response.status, row.id).toBe(row.status);
        expect(response.headers.get("x-robots-tag"), row.id).toBe(
          "noindex, nofollow"
        );

        for (const name of recorded.comparedHeaders) {
          const stored = row.headers[name] ?? null;

          const expected =
            name === "location" && stored !== null
              ? addSiteBasePath(testBasePath, stored)
              : stored;

          expect(response.headers.get(name), `${row.id} ${name}`).toBe(
            expected
          );
        }

        if (row.method !== "HEAD") {
          expect(
            yield* Effect.promise(() => response.text()),
            `${row.id} body`
          ).toBe(row.body);
        }
      })
    );
  }

  it.effect("answers the health check under the test address", () =>
    Effect.gen(function* mountedHealth() {
      const response = yield* answerMounted(
        new Request(`${site}${testBasePath}/health`)
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/json");
      expect(yield* Effect.promise(() => response.text())).toBe(
        '{"status":"ok","service":"ai-chatbot"}'
      );
    })
  );

  it.effect(
    "sends the root and the old English addresses to the help center inside the test address",
    () =>
      Effect.gen(function* mountedRedirects() {
        for (const path of ["/", "/en", "/en/", "/en/foo", "/en/foo/bar"]) {
          const response = yield* answerMounted(
            new Request(`${site}${addSiteBasePath(testBasePath, path)}`)
          );

          expect(response.status, path).toBe(302);
          expect(response.headers.get("location"), path).toBe(
            `${testBasePath}/help`
          );
        }
      })
  );

  it.effect(
    "answers an unknown path inside the test address with the CORS headers",
    () =>
      Effect.gen(function* mountedNotFound() {
        const response = yield* answerMounted(
          new Request(`${site}${testBasePath}/nope`, {
            headers: { origin: "https://docs.hypertask.ai" },
          })
        );

        expect(response.status).toBe(404);
        expect(response.headers.get("access-control-allow-origin")).toBe(
          "https://docs.hypertask.ai"
        );
        expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
      })
  );

  it.effect(
    "leaves the addresses the old site keeps outside the test address",
    () =>
      Effect.gen(function* outsideTestAddress() {
        for (const path of ["/health", "/", "/help", "/en/foo"]) {
          const response = yield* answerMounted(new Request(`${site}${path}`));

          expect(response.status, path).toBe(404);
        }
      })
  );

  it.effect(
    "answers a preflight under the test address with the same CORS headers",
    () =>
      Effect.gen(function* mountedPreflight() {
        const response = yield* answerMounted(
          new Request(`${site}${testBasePath}/api/chat/message`, {
            headers: {
              "access-control-request-method": "POST",
              origin: "https://docs.hypertask.ai",
            },
            method: "OPTIONS",
          })
        );

        expect(response.status).toBe(204);
        expect(response.headers.get("access-control-allow-origin")).toBe(
          "https://docs.hypertask.ai"
        );
        expect(response.headers.get("access-control-allow-methods")).toBe(
          "GET,POST,OPTIONS"
        );
        expect(response.headers.get("access-control-allow-headers")).toBe(
          "Content-Type,Authorization"
        );
      })
  );
});

const internalAddresses = (html: string): readonly string[] =>
  [...html.matchAll(/\s(?:href|src)="(?<value>[^"]*)"/gu)].flatMap((match) => {
    const value = match.groups?.value ?? "";

    return value.startsWith("/") ? [value] : [];
  });

describe("a crawl of the test address", () => {
  it.effect(
    "follows every internal address without leaving the test address",
    () =>
      Effect.gen(function* crawlTestAddress() {
        const seen = new Set<string>([
          `${testBasePath}/`,
          `${testBasePath}/health`,
          `${testBasePath}/en`,
          `${testBasePath}/en/foo`,
        ]);

        const queue = [...seen];

        while (queue.length > 0) {
          const path = queue.shift() ?? testBasePath;

          const response = yield* answerMounted(new Request(`${site}${path}`));

          const location = response.headers.get("location");
          const body = yield* Effect.promise(() => response.text());

          const found =
            location === null
              ? internalAddresses(body)
              : [location, ...internalAddresses(body)];

          for (const address of found) {
            expect(isWithinSiteBasePath(testBasePath, address), address).toBe(
              true
            );

            if (!seen.has(address)) {
              seen.add(address);
              queue.push(address);
            }
          }
        }

        expect(seen.has(`${testBasePath}/help`)).toBe(true);
      })
  );
});
