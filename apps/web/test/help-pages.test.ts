import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { renderToString } from "foldkit/experimental/server";

import { Flags, initialModel } from "../src/client/help/index.js";
import { renderDocument } from "../src/entry.server.js";
import { view } from "../src/features/help/index.js";
import { helpPageFlags, helpRouteOf } from "../src/server/help-pages.js";
import { recordedHelpArticles } from "../src/server/recorded-help-articles.js";
import liveArticleAiFeatures from "./fixtures/live/help-article-docs-features-ai-features.json";
import liveArticlePricing from "./fixtures/live/help-article-pricing-plans.json";
import liveArticleTaskWriter from "./fixtures/live/help-article-using-the-ai-task-writer-in-hypertasks-ctrlj-cmdj.json";
import liveArticleVoice from "./fixtures/live/help-article-voice-dictation-meets-ai-speak-your-way-to-perfect-comments.json";
import liveHelpCenter from "./fixtures/live/help-center.json";

const assets = {
  entryScript: "/assets/entry.js",
  modulePreloads: [],
  stylesheets: ["/assets/site.css"],
};

const patterns = {
  body: /<body[^>]*>/u,
  heading: /<(?<tag>h[1-6])\b[^>]*>(?<heading>[\s\S]*?)<\/\k<tag>>/gu,
  href: /\bhref="(?<href>[^"]*)"/gu,
  image: /<img\b[^>]*\bsrc="(?<src>[^"]*)"/gu,
  script: /<script\b[\s\S]*?<\/script>/gu,
  space: /\s+/gu,
  style: /<style\b[\s\S]*?<\/style>/gu,
  tag: /<[^>]*>/gu,
  title: /<title>(?<title>[\s\S]*?)<\/title>/u,
};

const entities = [
  ["&nbsp;", " "],
  ["&quot;", '"'],
  ["&apos;", "'"],
  ["&#39;", "'"],
  ["&lt;", "<"],
  ["&gt;", ">"],
  ["&amp;", "&"],
] as const;

const selfHostedImages = new Map([
  ["https://hypertask.ai/glyph-white.png", "/glyph-white.png"],
  ["https://hypertask.ai/hypertask_white.png", "/hypertask_white.png"],
]);

const bodyOf = (html: string): string => {
  const bodyAt = html.search(patterns.body);

  return bodyAt === -1 ? html : html.slice(bodyAt);
};

const titleOf = (html: string): string =>
  patterns.title.exec(html)?.groups?.title ?? "";

const withoutCode = (html: string): string =>
  html.replaceAll(patterns.script, " ").replaceAll(patterns.style, " ");

const decodeEntities = (text: string): string => {
  let decoded = text;

  for (const [entity, character] of entities) {
    decoded = decoded.replaceAll(entity, character);
  }

  return decoded;
};

const textOf = (html: string): string =>
  decodeEntities(withoutCode(html).replaceAll(patterns.tag, " "))
    .replaceAll(patterns.space, " ")
    .trim();

const valuesOf = (
  html: string,
  pattern: RegExp,
  group: string
): readonly string[] =>
  [...html.matchAll(pattern)].map((match) => match.groups?.[group] ?? "");

const headingsOf = (html: string): readonly string[] =>
  valuesOf(withoutCode(html), patterns.heading, "heading").map(textOf);

const hrefsOf = (html: string): readonly string[] =>
  valuesOf(html, patterns.href, "href").map(decodeEntities);

const sourcesOf = (html: string): readonly string[] =>
  valuesOf(html, patterns.image, "src")
    .map(decodeEntities)
    .map((source) => selfHostedImages.get(source) ?? source);

const pageAt = (pathname: string) =>
  Effect.gen(function* buildPage() {
    const route = helpRouteOf(pathname);

    if (route === null) {
      throw new Error(`No help route answers ${pathname}`);
    }

    const flags = yield* helpPageFlags(route).pipe(
      Effect.provide(recordedHelpArticles)
    );

    if (flags === null) {
      throw new Error(`No article answers ${pathname}`);
    }

    const application = yield* renderToString(
      { Flags, init: (page) => ({ model: initialModel(page) }), view },
      { flags, isHydratable: false }
    );

    return renderDocument(application, assets);
  });

const expectSamePage = (served: string, live: string): void => {
  const servedBody = withoutCode(bodyOf(served));
  const liveBody = withoutCode(bodyOf(live));

  expect(titleOf(served)).toBe(titleOf(live));
  expect(textOf(servedBody)).toBe(textOf(liveBody));
  expect(headingsOf(servedBody)).toEqual(headingsOf(liveBody));
  expect(hrefsOf(servedBody)).toEqual(hrefsOf(liveBody));
  expect(sourcesOf(servedBody)).toEqual(sourcesOf(liveBody));
};

const recordedArticles = [
  {
    label: "the article with an image",
    live: liveArticleTaskWriter.body,
    slug: "using-the-ai-task-writer-in-hypertasks-ctrlj-cmdj",
  },
  {
    label: "the article with code",
    live: liveArticleVoice.body,
    slug: "voice-dictation-meets-ai-speak-your-way-to-perfect-comments",
  },
  {
    label: "the long article",
    live: liveArticleAiFeatures.body,
    slug: "docs-features-ai-features",
  },
  {
    label: "the article with the plans block",
    live: liveArticlePricing.body,
    slug: "pricing-plans",
  },
];

const fathomTag =
  '<script src="https://cdn.usefathom.com/script.js" data-site="SSBYTYUQ" defer></script>';

describe("help pages recorded from the old site", () => {
  it.effect("answers the help center like the live page", () =>
    Effect.gen(function* helpCenter() {
      const served = yield* pageAt("/help");

      expectSamePage(served, liveHelpCenter.body);
    })
  );

  for (const article of recordedArticles) {
    it.effect(`answers ${article.label} like the live page`, () =>
      Effect.gen(function* helpArticle() {
        const served = yield* pageAt(`/help/${article.slug}`);

        expectSamePage(served, article.live);
      })
    );
  }

  it.effect("serves the fonts and images from this site", () =>
    Effect.gen(function* selfHosted() {
      const served = yield* pageAt("/help/pricing-plans");

      expect(served).not.toContain("fonts.googleapis.com");
      expect(served).not.toContain("fonts.gstatic.com");
      expect(served).not.toContain("hypertask.ai/glyph-white.png");
      expect(served).toContain('href="/glyph-white.png"');
      expect(served).toContain('src="/hypertask_white.png"');
    })
  );

  it.effect("keeps Fathom on the public help pages", () =>
    Effect.gen(function* fathom() {
      for (const pathname of ["/help", "/help/pricing-plans"]) {
        const served = yield* pageAt(pathname);

        expect(served, pathname).toContain(fathomTag);
      }
    })
  );
});
