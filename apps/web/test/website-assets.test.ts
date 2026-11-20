import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { renderToString, toResponse } from "foldkit/experimental/server";

import { Flags, initialModel } from "../src/client/help/index.js";
import { pageUnder, renderDocument, renderPage } from "../src/entry.server.js";
import {
  articleTitleSuffix,
  helpCenterTitle,
} from "../src/features/help/copy.js";
import { view } from "../src/features/help/index.js";
import { helpPageFlags } from "../src/server/help-pages.js";
import {
  recordedHelpArticleRows,
  recordedHelpArticles,
} from "../src/server/recorded-help-articles.js";
import { websiteAssets } from "../src/website.js";

const assets = {
  entryScript: "/assets/entry.js",
  modulePreloads: [],
  stylesheets: ["/assets/site.css"],
};

const patterns = {
  title: /<title>(?<title>[\s\S]*?)<\/title>/u,
};

const articleSlugs = ["docs-features-boards", "pricing-plans"] as const;

type PublishedPage = NonNullable<ReturnType<typeof pageUnder>>;

const articleAt = (slug: string) => {
  const article = recordedHelpArticleRows.find((row) => row.slug === slug);

  if (article === undefined) {
    throw new Error(
      `The recorded help answers hold no article ${slug}. Fix: record it again with a GET to help.hypertask.ai.`
    );
  }

  return article;
};

const titleOf = (html: string): string =>
  patterns.title.exec(html)?.groups?.title ?? "";

const escapedTitle = (title: string): string => title.replaceAll("&", "&amp;");

const requirePublishedAssets = (): void => {
  const htmlHandling: string = websiteAssets.htmlHandling;

  if (htmlHandling !== "none") {
    throw new Error(
      `The asset layer answers a page address before the Worker does. Cloudflare turns /help/<slug> into a redirect to /help/<slug>/ while htmlHandling is "${htmlHandling}", and the live site answers the slash form with 404. Fix: keep htmlHandling "none" in apps/web/src/website.ts so the Worker answers every page address.`
    );
  }
};

const publishedPageAt = (pathname: string): PublishedPage => {
  requirePublishedAssets();

  const page = pageUnder(pathname);

  if (page === null) {
    throw new Error(
      `${pathname} answers not found. Fix: the Worker answers a page address only without a trailing slash, so the address published for the page must be the slashless one.`
    );
  }

  return page;
};

const notFoundAt = (pathname: string): void => {
  requirePublishedAssets();

  if (pageUnder(pathname) !== null) {
    throw new Error(
      `${pathname} answers a page. The live site answers the slash form with 404. Fix: the page address stays slashless and the Worker answers every page address.`
    );
  }
};

const pageHtmlAt = (page: PublishedPage) =>
  Effect.gen(function* readPage() {
    const flags = yield* helpPageFlags(page.route).pipe(
      Effect.provide(recordedHelpArticles)
    );

    if (flags === null) {
      throw new Error(
        `No help page answers ${page.route.slug ?? "the help centre"}. Fix: the recorded help articles hold every slug the site publishes.`
      );
    }

    const application = yield* renderToString(
      { Flags, init: (model) => ({ model: initialModel(model) }), view },
      { flags, isHydratable: false }
    );

    return renderDocument(application, assets);
  });

const liveNotFoundAt = (pathname: string) =>
  Effect.gen(function* readNotFound() {
    const result = yield* Effect.promise(() =>
      renderPage(new Request(`https://help.hypertask.ai${pathname}`))
    );

    return toResponse(
      (application) => renderDocument(application, assets),
      result
    );
  });

describe("the published article addresses", () => {
  for (const slug of articleSlugs) {
    it.effect(`answers /ratstack/help/${slug} with the article`, () =>
      Effect.gen(function* slashlessArticle() {
        const page = publishedPageAt(`/ratstack/help/${slug}`);

        expect(page.route.slug).toBe(slug);

        const html = yield* pageHtmlAt(page);

        expect(titleOf(html)).toBe(
          escapedTitle(`${articleAt(slug).title} - ${articleTitleSuffix}`)
        );
      })
    );

    it.effect(`answers /ratstack/help/${slug}/ like the live site`, () =>
      Effect.gen(function* trailingSlashArticle() {
        notFoundAt(`/ratstack/help/${slug}/`);

        const response = yield* liveNotFoundAt(`/ratstack/help/${slug}/`);

        expect(response.status).toBe(404);

        const body = yield* Effect.promise(() => response.text());

        expect(body).toBe("404 Not Found");
      })
    );
  }
});

describe("the published help centre addresses", () => {
  it.effect("answers /ratstack/help with the help centre", () =>
    Effect.gen(function* slashlessHelpCentre() {
      const page = publishedPageAt("/ratstack/help");

      expect(page.route.slug).toBeNull();

      const html = yield* pageHtmlAt(page);

      expect(titleOf(html)).toBe(helpCenterTitle);
    })
  );

  it.effect("answers /ratstack/help/ like the live site", () =>
    Effect.gen(function* trailingSlashHelpCentre() {
      notFoundAt("/ratstack/help/");

      const response = yield* liveNotFoundAt("/ratstack/help/");

      expect(response.status).toBe(404);

      const body = yield* Effect.promise(() => response.text());

      expect(body).toBe("404 Not Found");
    })
  );
});
