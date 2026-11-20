import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { toResponse } from "foldkit/experimental/server";

import { renderDocument, renderPage } from "../src/entry.server.js";
import {
  articleTitleSuffix,
  helpCenterTitle,
} from "../src/features/help/copy.js";
import { recordedHelpArticleRows } from "../src/server/recorded-help-articles.js";
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

const requirePublishedAddress = (): void => {
  const htmlHandling: string = websiteAssets.htmlHandling;

  if (htmlHandling !== "none") {
    throw new Error(
      `The asset layer answers a page address before the Worker does. Cloudflare turns /help/<slug> into a redirect to /help/<slug>/ while htmlHandling is "${htmlHandling}", and the live site answers the slash form with 404. Fix: keep htmlHandling "none" in apps/web/src/website.ts so the Worker answers every page address.`
    );
  }
};

const publishedResponseAt = (path: string) =>
  Effect.gen(function* answerPublishedAddress() {
    requirePublishedAddress();

    const result = yield* Effect.promise(() =>
      renderPage(new Request(`https://help.hypertask.ai${path}`))
    );

    return toResponse(
      (application) => renderDocument(application, assets),
      result
    );
  });

const pageAt = (path: string) =>
  Effect.gen(function* readPage() {
    const response = yield* publishedResponseAt(path);
    const body = yield* Effect.promise(() => response.text());

    expect(
      response.status,
      `${path} answered ${response.status} ${response.statusText}: ${body.slice(0, 600)}`
    ).toBe(200);
    expect(response.headers.get("content-type")?.toLowerCase()).toBe(
      "text/html; charset=utf-8"
    );

    return { body, title: titleOf(body) };
  });

describe("the published article addresses", () => {
  for (const slug of articleSlugs) {
    it.effect(`answers /ratstack/help/${slug} with the article`, () =>
      Effect.gen(function* slashlessArticle() {
        const page = yield* pageAt(`/ratstack/help/${slug}`);

        expect(page.title).toBe(
          escapedTitle(`${articleAt(slug).title} - ${articleTitleSuffix}`)
        );
      })
    );

    it.effect(`answers /ratstack/help/${slug}/ like the live site`, () =>
      Effect.gen(function* trailingSlashArticle() {
        const response = yield* publishedResponseAt(`/ratstack/help/${slug}/`);

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
      const page = yield* pageAt("/ratstack/help");

      expect(page.title).toBe(helpCenterTitle);
    })
  );

  it.effect("answers /ratstack/help/ like the live site", () =>
    Effect.gen(function* trailingSlashHelpCentre() {
      const response = yield* publishedResponseAt("/ratstack/help/");

      expect(response.status).toBe(404);

      const body = yield* Effect.promise(() => response.text());

      expect(body).toBe("404 Not Found");
    })
  );
});
