// @effect-diagnostics nodeBuiltinImport:off -- This Node CLI reads the replay fixture from disk.
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { Schema } from "effect";

import {
  replayCaseSchema,
  replayVerdict,
  scoreReplay,
} from "./replay-retrieval-score.ts";
import type {
  ArticleListing,
  ReplayCase,
  ReplayReading,
} from "./replay-retrieval-score.ts";

const articleId = Schema.Union([Schema.Finite, Schema.String]);

const decodeCase = Schema.decodeUnknownSync(
  Schema.fromJsonString(replayCaseSchema)
);

const decodeListings = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Array(Schema.Struct({ id: articleId, slug: Schema.String }))
  )
);

const decodeRetrieval = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      articles: Schema.Array(Schema.Struct({ id: articleId })),
    })
  )
);

const required = (
  value: string | undefined,
  name: string,
  example: string
): string => {
  if (value === undefined) {
    throw new Error(`The --${name} setting is required. Fix: pass ${example}.`);
  }
  return value;
};

const readCases = (file: string): readonly ReplayCase[] =>
  readFileSync(file, "utf-8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => decodeCase(line));

const count = (
  value: string | undefined,
  name: string,
  example: string
): number => {
  const parsed = Number(required(value, name, example));
  if (!Number.isFinite(parsed)) {
    throw new Error(
      `The --${name} setting takes a number. Fix: pass ${example}.`
    );
  }
  return parsed;
};

// @effect-diagnostics-next-line asyncFunction:off -- This Node CLI reads a public route with native Promise I/O outside an Effect runtime.
const readJson = async (url: URL): Promise<string> => {
  // @effect-diagnostics-next-line globalFetch:off -- This Node CLI reads a public route outside an Effect runtime.
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new Error(
      `GET ${url.href} answered ${String(response.status)}. Fix: check that the site is up and that the route answers.`
    );
  }
  return response.text();
};

// @effect-diagnostics-next-line asyncFunction:off -- This Node CLI reads a public route with native Promise I/O outside an Effect runtime.
const readReplay = async (
  origin: URL,
  item: ReplayCase
): Promise<ReplayReading> => {
  const url = new URL(
    `/api/chat/debug-rag?q=${encodeURIComponent(item.question)}`,
    origin
  );
  const body = decodeRetrieval(await readJson(url));
  return {
    articleIds: body.articles.map((article) => article.id),
    caseId: item.id,
  };
};

const { values } = parseArgs({
  options: {
    baseline: { type: "string" },
    cases: { type: "string", default: "eval/replay-v0.jsonl" },
    origin: { type: "string" },
  },
});

const origin = new URL(
  required(values.origin, "origin", "--origin https://help.hypertask.ai")
);
const baseline = count(values.baseline, "baseline", "--baseline 10");
const cases = readCases(values.cases);

const listings: readonly ArticleListing[] = decodeListings(
  await readJson(new URL("/api/articles", origin))
);
const readings = await Promise.all(
  cases.map((item) => readReplay(origin, item))
);

const score = scoreReplay({ cases, listings, readings });
const verdict = replayVerdict({ baseline, score });

process.stdout.write(
  `${[
    `Source ${origin.href}`,
    ...score.rows.map(
      (row) =>
        `${row.caseId} ${row.hit ? "hit" : "miss"} expected=${row.expectedSlugs.join(",")} got=${row.retrievedSlugs.join(",")}`
    ),
    `${String(score.hits)}/${String(score.total)}`,
    `Threshold ${String(verdict.baseline)}/${String(verdict.total)}`,
  ].join("\n")}\n`
);

if (!verdict.passed) {
  process.stderr.write(
    `Retrieval answered ${String(score.hits)}/${String(score.total)}, below the baseline of ${String(verdict.baseline)}. Fix: read the miss lines above before changing the ranking.\n`
  );
  process.exitCode = 1;
}
