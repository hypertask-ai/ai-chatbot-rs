import { describe, expect, it } from "@effect/vitest";
import { HelpArticleStore } from "@rat-stack/core/help-article-store";
import { relatedHelpArticles } from "@rat-stack/core/help-related-articles";
import { Effect } from "effect";
import { renderToString } from "foldkit/experimental/server";

import { Flags, initialModel } from "../src/client/help/index.js";
import { renderDocument } from "../src/entry.server.js";
import { view } from "../src/features/help/index.js";
import { helpPageFlags } from "../src/server/help-pages.js";
import {
  recordedHelpArticleList,
  recordedHelpArticleRows,
} from "../src/server/recorded-help-articles.js";
import recording from "./fixtures/help-related-articles.json";

const assets = {
  entryScript: "/assets/entry.js",
  modulePreloads: [],
  stylesheets: ["/assets/site.css"],
};

const articleIn = (slug: string) => {
  const row = recordedHelpArticleRows.find((article) => article.slug === slug);

  if (row === undefined) {
    throw new Error(
      `The recorded help answers hold no article ${slug}. Fix: record the answer again with a GET to help.hypertask.ai.`
    );
  }

  return row;
};

const relatedFor = (
  slug: string
): readonly { readonly slug: string; readonly title: string }[] =>
  relatedHelpArticles({
    article: articleIn(slug),
    list: recordedHelpArticleList,
  });

describe("help related articles", () => {
  it("keeps the same related articles as the hand run of the old rule for every recorded article", () => {
    for (const entry of recording.articles) {
      expect(relatedFor(entry.slug), entry.slug).toEqual(entry.rule);
    }
  });

  it("keeps the same related articles as the live article page for every recorded article", () => {
    for (const entry of recording.articles) {
      expect(relatedFor(entry.slug), entry.slug).toEqual(entry.live);
    }
  });

  it.effect("shows no related block when no other article matches", () =>
    Effect.gen(function* alone() {
      const slug = "pricing-plans";
      const row = articleIn(slug);

      const summary = recordedHelpArticleList.find(
        (entry) => entry.slug === slug
      );

      if (summary === undefined) {
        throw new Error(`The recorded article list holds no article ${slug}.`);
      }

      const layer = HelpArticleStore.layer({
        articles: [row],
        list: [summary],
        searches: [],
      });

      const flags = yield* helpPageFlags({ slug }).pipe(Effect.provide(layer));

      if (flags === null || flags.page !== "article") {
        throw new Error(`No article page answers ${slug}.`);
      }

      expect(flags.related).toEqual([]);

      const application = yield* renderToString(
        { Flags, init: (page) => ({ model: initialModel(page) }), view },
        { flags, isHydratable: false }
      );

      expect(renderDocument(application, assets)).not.toContain(
        ">Related Articles<"
      );
    })
  );
});
