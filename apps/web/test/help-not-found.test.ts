import { describe, expect, it } from "@effect/vitest";
import { HelpArticleStore } from "@rat-stack/core/help-article-store";
import { Effect } from "effect";
import { toResponse } from "foldkit/experimental/server";

import { renderDocument, renderPage } from "../src/entry.server.js";
import { helpPageFlags } from "../src/server/help-pages.js";
import {
  recordedHelpArticleList,
  recordedHelpArticleRows,
} from "../src/server/recorded-help-articles.js";
import liveNotFound from "./fixtures/live/help-not-found.json";

const assets = {
  entryScript: "/assets/entry.js",
  modulePreloads: [],
  stylesheets: ["/assets/site.css"],
};

const responseAt = (path: string) =>
  Effect.gen(function* respond() {
    const result = yield* Effect.promise(() =>
      renderPage(new Request(`https://help.hypertask.ai${path}`))
    );

    return toResponse(
      (application) => renderDocument(application, assets),
      result
    );
  });

describe("help addresses the live site does not answer", () => {
  for (const row of liveNotFound.rows) {
    it.effect(`answers ${row.path} like the live site`, () =>
      Effect.gen(function* address() {
        const response = yield* responseAt(row.path);

        expect(response.status, row.path).toBe(row.status);
        expect(
          response.headers.get("content-type")?.toLowerCase(),
          row.path
        ).toBe(row.headers["content-type"].toLowerCase());

        const body = yield* Effect.promise(() => response.text());

        if (row.body === null) {
          expect(body, row.path).toContain(`<title>${row.title}</title>`);
        } else {
          expect(body, row.path).toBe(row.body);
        }
      })
    );
  }

  it.effect("answers a removed article like an unknown address", () =>
    Effect.gen(function* removed() {
      const slug = "pricing-plans";

      const row = recordedHelpArticleRows.find(
        (article) => article.slug === slug
      );

      if (row === undefined) {
        throw new Error(`The recorded help answers hold no article ${slug}.`);
      }

      const layer = HelpArticleStore.layer({
        articles: recordedHelpArticleRows.filter(
          (article) => article.slug !== slug
        ),
        list: recordedHelpArticleList,
        searches: [],
      });

      const flags = yield* helpPageFlags({ slug }).pipe(Effect.provide(layer));

      expect(flags, slug).toBeNull();
    })
  );
});
