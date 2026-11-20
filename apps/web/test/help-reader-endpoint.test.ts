import { describe, expect, it } from "@effect/vitest";
import { plainTextOf } from "@rat-stack/core";
import { HelpArticlePane } from "@rat-stack/core/contracts";
import { Effect, Option, Schema } from "effect";
import { renderToString, toResponse } from "foldkit/experimental/server";

import {
  Flags,
  Message,
  ReaderPhase,
  initialModel,
} from "../src/client/help/index.js";
import { readerStep } from "../src/client/help/reader.js";
import { renderDocument, renderPage } from "../src/entry.server.js";
import { view } from "../src/features/help/index.js";
import { helpPageFlags } from "../src/server/help-pages.js";
import { helpReaderSlugOf } from "../src/server/help-reader.js";
import { recordedHelpArticles } from "../src/server/recorded-help-articles.js";
import { sitePath } from "../src/site-base-path.js";
import recordedAnswers from "./fixtures/help-article-answers.json";
import liveArticleAiFeatures from "./fixtures/live/help-article-docs-features-ai-features.json";
import liveArticlePricing from "./fixtures/live/help-article-pricing-plans.json";
import liveArticleVoice from "./fixtures/live/help-article-voice-dictation-meets-ai-speak-your-way-to-perfect-comments.json";

const assets = {
  entryScript: "/assets/entry.js",
  modulePreloads: [],
  stylesheets: ["/assets/site.css"],
};

const READER_PATH = "/api/help-reader/";

const readerRows = recordedAnswers.rows.filter((row) =>
  row.path.startsWith(READER_PATH)
);

const responseAt = (path: string, method = "GET") =>
  Effect.gen(function* respond() {
    const result = yield* Effect.promise(() =>
      renderPage(
        new Request(`https://help.hypertask.ai${sitePath(path)}`, { method })
      )
    );

    return toResponse(
      (application) => renderDocument(application, assets),
      result
    );
  });

const textAt = (path: string) =>
  Effect.gen(function* body() {
    const response = yield* responseAt(path);

    return yield* Effect.promise(() => response.text());
  });

const decodePane = Schema.decodeUnknownSync(
  Schema.fromJsonString(HelpArticlePane)
);

const paneAt = (path: string) =>
  Effect.map(textAt(path), (body) => decodePane(body));

const patterns = {
  body: /<body[^>]*>/u,
  heading: /<h(?<rank>[1-6])\b[^>]*>(?<heading>[\s\S]*?)<\/h\k<rank>>/gu,
  space: /\s+/gu,
};

const entities = [
  ["&nbsp;", " "],
  ["&quot;", '"'],
  ["&#39;", "'"],
  ["&lt;", "<"],
  ["&gt;", ">"],
  ["&amp;", "&"],
] as const;

const textOf = (html: string): string => {
  let decoded = plainTextOf(html, " ");

  for (const [entity, character] of entities) {
    decoded = decoded.replaceAll(entity, character);
  }

  return decoded.replaceAll(patterns.space, " ").trim();
};

const headingsOf = (html: string): readonly string[] =>
  [...html.matchAll(patterns.heading)].map((match) =>
    textOf(match.groups?.heading ?? "")
  );

const bodyOf = (html: string): string => {
  const at = html.search(patterns.body);

  return at === -1 ? html : html.slice(at);
};

const beforeRelated = (html: string): string => {
  const at = html.indexOf('<div class="related-articles">');

  return at === -1 ? html : html.slice(0, at);
};

const paneRegionOf = (html: string): string => {
  const at = html.indexOf('id="readerBody"');

  return at === -1 ? "" : html.slice(at);
};

const openedAt = (
  flags: Parameters<typeof initialModel>[0],
  article: typeof HelpArticlePane.Type,
  wide: boolean
) => {
  const requested = readerStep(
    ReaderPhase.Closed(),
    Message.ReaderOpened({ slug: article.slug, wide })
  ).phase;

  return {
    ...initialModel(flags),
    reader: readerStep(
      requested,
      Message.ReaderLoaded({ article, slug: article.slug })
    ).phase,
  };
};

const pageWithPane = (path: string, wide: boolean) =>
  Effect.gen(function* withPane() {
    const article = yield* paneAt(path);

    const flags = yield* helpPageFlags({ slug: null }).pipe(
      Effect.provide(recordedHelpArticles)
    );

    if (flags === null) {
      throw new Error("The help center flags are missing.");
    }

    const application = yield* renderToString(
      { Flags, init: () => ({ model: openedAt(flags, article, wide) }), view },
      { flags, isHydratable: false }
    );

    return renderDocument(application, assets);
  });

describe("the reading pane answer, recorded from the old site", () => {
  for (const row of readerRows) {
    it.effect(`answers ${row.path} like the live site`, () =>
      Effect.gen(function* answer() {
        const response = yield* responseAt(row.path);

        expect(response.status, row.path).toBe(row.status);
        expect(response.headers.get("content-type"), row.path).toBe(
          row.headers["content-type"]
        );

        const body = yield* Effect.promise(() => response.text());

        expect(body, row.path).toBe(row.body);
      })
    );
  }

  it("reads one article segment and nothing else from the address", () => {
    expect(helpReaderSlugOf(`${READER_PATH}pricing-plans`)).toEqual(
      Option.some("pricing-plans")
    );
    expect(helpReaderSlugOf(`${READER_PATH}pricing%2Dplans`)).toEqual(
      Option.some("pricing-plans")
    );
    expect(helpReaderSlugOf(READER_PATH)).toEqual(Option.none());
    expect(helpReaderSlugOf(`${READER_PATH}pricing-plans/`)).toEqual(
      Option.none()
    );
    expect(helpReaderSlugOf(`${READER_PATH}a/pricing-plans`)).toEqual(
      Option.none()
    );
    expect(helpReaderSlugOf("/help/pricing-plans")).toEqual(Option.none());
  });

  it.effect("answers a method other than GET with 405", () =>
    Effect.gen(function* method() {
      const response = yield* responseAt(`${READER_PATH}pricing-plans`, "POST");

      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET, HEAD");
    })
  );
});

describe("the pane the browser opens", () => {
  const recorded = [
    {
      label: "the article with the plans block",
      live: liveArticlePricing.body,
      path: `${READER_PATH}pricing-plans`,
    },
    {
      label: "the long article",
      live: liveArticleAiFeatures.body,
      path: `${READER_PATH}docs-features-ai-features`,
    },
    {
      label: "the article with code",
      live: liveArticleVoice.body,
      path: `${READER_PATH}voice-dictation-meets-ai-speak-your-way-to-perfect-comments`,
    },
  ];

  for (const entry of recorded) {
    it.effect(`shows the headings of ${entry.label}`, () =>
      Effect.gen(function* headings() {
        const html = yield* pageWithPane(entry.path, true);

        const pane = headingsOf(paneRegionOf(html));
        const live = headingsOf(beforeRelated(bodyOf(entry.live)));

        expect(pane.length).toBeGreaterThan(0);
        expect(pane).toEqual(live);
      })
    );
  }

  it.effect("shows the article in the pane and nowhere else", () =>
    Effect.gen(function* somewhere() {
      const html = yield* pageWithPane(`${READER_PATH}pricing-plans`, true);
      const pane = paneRegionOf(html);

      expect(pane).toContain(
        "Hypertask pricing, free trial and Free plan limits"
      );
      expect(html).toMatch(/<div id="libraryView"[^>]*hidden/u);
      expect(headingsOf(pane)[0]).toBe(
        "Hypertask pricing, free trial and Free plan limits"
      );
    })
  );

  it.effect("keeps the library rendered on a narrow screen", () =>
    Effect.gen(function* narrow() {
      const html = yield* pageWithPane(`${READER_PATH}pricing-plans`, false);

      expect(html).toMatch(/<div id="libraryView">/u);
      expect(paneRegionOf(html)).toContain(
        "Hypertask pricing, free trial and Free plan limits"
      );
    })
  );
});
