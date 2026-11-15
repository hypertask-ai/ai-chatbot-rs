import { expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import {
  HelpArticleCorpus,
  debugHelpRetrieval,
} from "../src/help-retrieval.js";
import { HelpRetrievalAnswer, HelpSearchArticle } from "../src/help-search.js";
import articlesJson from "./fixtures/help-articles.json";
import bodiesJson from "./fixtures/help-retrieval-bodies.json";

const corpus = Schema.decodeUnknownSync(Schema.Array(HelpSearchArticle))(
  articlesJson
);

const bodies = Schema.decodeUnknownSync(
  Schema.Struct({
    rows: Schema.Array(
      Schema.Struct({ body: Schema.String, path: Schema.String })
    ),
  })
)(bodiesJson);

const inputOf = (path: string) => {
  const q = new URL(path, "https://help.hypertask.ai").searchParams.get("q");

  return q === null ? {} : { q };
};

it.layer(HelpArticleCorpus.layer(corpus))(
  "the debug retrieval view",
  (test) => {
    test.effect("answers every recorded debug path byte for byte", () =>
      Effect.forEach(bodies.rows, (row) =>
        Effect.gen(function* answersRecordedPath() {
          const answer = yield* debugHelpRetrieval.handler(inputOf(row.path));
          const encoded =
            yield* Schema.encodeEffect(HelpRetrievalAnswer)(answer);

          expect(JSON.stringify(encoded), row.path).toBe(row.body);
        })
      )
    );

    test.effect("answers the old debug address", () =>
      Effect.sync(() => {
        expect(debugHelpRetrieval.contract.http).toEqual({
          method: "GET",
          path: "/api/chat/debug-rag",
        });
      })
    );
  }
);
