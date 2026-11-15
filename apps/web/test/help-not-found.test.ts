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

const responseAt = async (path: string): Promise<Response> => {
  const result = await renderPage(
    new Request(`https://help.hypertask.ai${path}`)
  );

  return toResponse(
    (application) => renderDocument(application, assets),
    result
  );
};

describe("help addresses the live site does not answer", () => {
  for (const row of liveNotFound.rows) {
    it(`answers ${row.path} like the live site`, async () => {
      const response = await responseAt(row.path);

      expect(response.status, row.path).toBe(row.status);
      expect(
        response.headers.get("content-type")?.toLowerCase(),
        row.path
      ).toBe(row.headers["content-type"].toLowerCase());

      if (row.body === null) {
        expect(await response.text(), row.path).toContain(
          `<title>${row.title}</title>`
        );
      } else {
        expect(await response.text(), row.path).toBe(row.body);
      }
    });
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
