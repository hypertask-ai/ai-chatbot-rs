import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { renderToString } from "foldkit/experimental/server";

import type { HelpAddress } from "../src/client/help/index.js";
import { Flags, initialModelAtAddress } from "../src/client/help/index.js";
import { renderDocument } from "../src/entry.server.js";
import { styleClass } from "../src/features/help/class-names.js";
import { view } from "../src/features/help/index.js";
import { helpCenter } from "../src/features/help/styles.stylex.js";
import {
  helpDescriptionOf,
  helpPageFlags,
  helpRouteOf,
} from "../src/server/help-pages.js";
import { recordedHelpArticles } from "../src/server/recorded-help-articles.js";
import searchRowsJson from "./fixtures/help-search-rows.json";
import visitorJson from "./fixtures/help-visitor-search.json";
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
  card: /<a\b[^>]*\bhref="\/help\/(?<slug>[^"]+)"[^>]*\bdata-category="(?<category>[^"]*)"[^>]*>/gu,
  description: /<meta name="description" content="(?<content>[^"]*)">/u,
  href: /\bhref="(?<href>[^"]*)"/u,
  mark: /<mark\b[^>]*>[\s\S]*?<\/mark>/gu,
  markClose: /<\/mark>/gu,
  markOpen: /<mark\b[^>]*>/gu,
  space: /\s+/gu,
  tag: /<[^>]*>/gu,
  topic: /<a\b(?=[^>]*\bhref="\?category=)[^>]*>[\s\S]*?<\/a>/gu,
  topicBody: /<p[^>]*>(?<body>[\s\S]*?)<\/p>/u,
  topicHref: /href="\?category=(?<category>[^"#]*)#all"/u,
  topicTitle: /<strong[^>]*>(?<title>[\s\S]*?)<\/strong>/u,
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

const markOpen = "\u00AB";

const markClose = "\u00BB";

const decodeEntities = (text: string): string => {
  let decoded = text;

  for (const [entity, character] of entities) {
    decoded = decoded.replaceAll(entity, character);
  }

  return decoded;
};

const textOf = (html: string): string =>
  decodeEntities(html.replaceAll(patterns.tag, " "))
    .replaceAll(patterns.space, " ")
    .trim();

const markedTextOf = (html: string): string =>
  decodeEntities(
    html
      .replaceAll(patterns.markOpen, markOpen)
      .replaceAll(patterns.markClose, markClose)
      .replaceAll(patterns.tag, " ")
  )
    .replaceAll(patterns.space, " ")
    .trim();

const markedOf = (marked: string): string =>
  marked
    .replaceAll("<mark>", markOpen)
    .replaceAll("</mark>", markClose)
    .replaceAll(patterns.space, " ")
    .trim();

const between = (html: string, from: string, to: string): string => {
  const start = html.indexOf(from);

  if (start === -1) {
    return "";
  }

  const end = html.indexOf(to, start);

  return end === -1 ? "" : html.slice(start, end);
};

const resultsRegionOf = (html: string): string =>
  between(html, 'id="liveSearchResults"', 'id="categoriesContainer"');

const browserTitleOf = (html: string): string =>
  textOf(between(html, 'id="browserTitle"', 'id="searchInput"'));

type ResultRow = Readonly<{
  href: string;
  html: string;
}>;

const resultRowsOf = (region: string): readonly ResultRow[] =>
  region
    .split("<a ")
    .slice(1)
    .map((row) => ({
      href: patterns.href.exec(row)?.groups?.href ?? "",
      html: row.slice(row.indexOf(">") + 1, row.indexOf("</a>")),
    }));

const slugsOf = (rows: readonly ResultRow[]): readonly string[] =>
  rows.map((row) => row.href.replace("/help/", ""));

type Card = Readonly<{
  category: string;
  slug: string;
}>;

const cardsOf = (html: string): readonly Card[] =>
  [...html.matchAll(patterns.card)].map((match) => ({
    category: decodeEntities(match.groups?.category ?? ""),
    slug: match.groups?.slug ?? "",
  }));

type Topic = Readonly<{
  body: string;
  category: string;
  title: string;
}>;

const topicsOf = (html: string): readonly Topic[] =>
  [...html.matchAll(patterns.topic)].map((match) => ({
    body: textOf(patterns.topicBody.exec(match[0])?.groups?.body ?? ""),
    category: decodeURIComponent(
      decodeEntities(patterns.topicHref.exec(match[0])?.groups?.category ?? "")
    ),
    title: textOf(patterns.topicTitle.exec(match[0])?.groups?.title ?? ""),
  }));

const descriptionOf = (html: string): string =>
  patterns.description.exec(html)?.groups?.content ?? "";

const openTagOf = (html: string, id: string): string =>
  new RegExp(`<[a-z]+\\b[^>]*\\bid="${id}"[^>]*>`, "u").exec(html)?.[0] ?? "";

const marksIn = (html: string): readonly string[] =>
  [...html.matchAll(patterns.mark)].map((match) => textOf(match[0]));

const helpCenterAt = (address: HelpAddress) =>
  Effect.gen(function* servedHelpCenter() {
    const route = helpRouteOf("/help");

    if (route === null) {
      throw new Error("The help center route is missing.");
    }

    const flags = yield* helpPageFlags(route).pipe(
      Effect.provide(recordedHelpArticles)
    );

    if (flags === null) {
      throw new Error("The help center has no flags.");
    }

    const application = yield* renderToString(
      {
        Flags,
        init: (page) => ({ model: initialModelAtAddress(page, address) }),
        view,
      },
      { flags, isHydratable: false }
    );

    return renderDocument(application, assets);
  });

const searchAddressOf = (query: string): HelpAddress =>
  query === ""
    ? { hash: "#all", search: "" }
    : { hash: "#all", search: `?q=${encodeURIComponent(query)}` };

const watchedQueries = 15;

const closedAddress: HelpAddress = { hash: "", search: "" };

describe("help center search box", () => {
  it.effect(
    "answers the recorded queries with the same articles in order",
    () =>
      Effect.gen(function* recordedQueries() {
        expect(visitorJson.queries.length).toBeGreaterThanOrEqual(
          watchedQueries
        );

        for (const recorded of visitorJson.queries) {
          const served = yield* helpCenterAt(searchAddressOf(recorded.query));
          const region = resultsRegionOf(served);
          const rows = resultRowsOf(region);

          expect(
            slugsOf(rows),
            `${recorded.query} showed ${recorded.shown}`
          ).toEqual(recorded.slugs);

          if (recorded.shown === "results") {
            const count = recorded.slugs.length;

            expect(textOf(region.split("<a ")[0] ?? ""), recorded.query).toBe(
              `${count} ${count === 1 ? "article" : "articles"} found`
            );
          } else if (recorded.shown === "no-results") {
            expect(textOf(region), recorded.query).toBe(
              `${searchRowsJson.empty.heading} ${searchRowsJson.empty.body}`
            );
          } else {
            expect(textOf(region), recorded.query).toBe("");
          }
        }
      })
  );

  it.effect("stops filtering the article cards and shows them again", () =>
    Effect.gen(function* clearedQuery() {
      const searching = yield* helpCenterAt(searchAddressOf("board"));
      const cleared = yield* helpCenterAt({ hash: "#all", search: "" });
      const searchingClass = styleClass(helpCenter.articlesRegionSearching);

      expect(openTagOf(searching, "categoriesContainer")).toContain(
        searchingClass
      );
      expect(openTagOf(cleared, "categoriesContainer")).not.toContain(
        searchingClass
      );
      expect(openTagOf(searching, "liveSearchResults")).toContain(
        styleClass(helpCenter.liveResultsShown)
      );
      expect(openTagOf(cleared, "liveSearchResults")).toContain(
        styleClass(helpCenter.liveResultsHidden)
      );
    })
  );

  it.effect("renders the result rows the old page rendered", () =>
    Effect.gen(function* resultRows() {
      for (const expected of searchRowsJson.rows) {
        const served = yield* helpCenterAt(searchAddressOf(expected.query));

        const row = resultRowsOf(resultsRegionOf(served)).find(
          (candidate) => candidate.href === `/help/${expected.slug}`
        );

        if (row === undefined) {
          throw new Error(`No result row answers ${expected.slug}`);
        }

        expect(markedTextOf(row.html), expected.slug).toBe(
          [
            markedOf(expected.markedTitle),
            expected.category,
            expected.excerpt,
          ].join(" ")
        );
      }
    })
  );

  it.effect("marks only the title, at every place the query appears", () =>
    Effect.gen(function* markedExcerpt() {
      const served = yield* helpCenterAt(searchAddressOf("board"));

      const row = resultRowsOf(resultsRegionOf(served)).find(
        (candidate) =>
          candidate.href === "/help/docs-features-chat-board-filter"
      );

      expect(marksIn(row?.html ?? "")).toEqual(["Board"]);
    })
  );
});

describe("help center topics", () => {
  it.effect(
    "renders the same eight topic cards, in order, as the live page",
    () =>
      Effect.gen(function* topicCards() {
        const served = yield* helpCenterAt({ hash: "", search: "" });
        const live = topicsOf(liveHelpCenter.body);

        expect(live.length).toBe(8);
        expect(topicsOf(served)).toEqual(live);
      })
  );

  it.effect("shows the same articles under each topic, in the same order", () =>
    Effect.gen(function* topicArticles() {
      const liveCards = cardsOf(liveHelpCenter.body);

      expect(liveCards.length).toBe(97);

      for (const topic of topicsOf(liveHelpCenter.body)) {
        const served = yield* helpCenterAt({
          hash: "#all",
          search: `?category=${encodeURIComponent(topic.category)}`,
        });

        expect(browserTitleOf(served), topic.category).toBe(topic.category);
        expect(cardsOf(served), topic.category).toEqual(
          liveCards.filter((card) => card.category === topic.category)
        );
      }
    })
  );

  it.effect("keeps every article and adds no show more control", () =>
    Effect.gen(function* everyArticle() {
      const served = yield* helpCenterAt({ hash: "#all", search: "" });

      expect(cardsOf(served).length).toBe(97);
      expect(served.toLowerCase()).not.toContain("show more");
    })
  );

  it.effect("searches when a topic in the address matches no article", () =>
    Effect.gen(function* unknownTopic() {
      const served = yield* helpCenterAt({
        hash: "#all",
        search: "?category=Nothing%20Here",
      });

      const region = resultsRegionOf(served);

      expect(browserTitleOf(served)).toBe("Nothing Here");
      expect(textOf(region)).toBe(
        `${searchRowsJson.empty.heading} ${searchRowsJson.empty.body}`
      );
    })
  );

  it.effect("opens the article list only where the old page opened it", () =>
    Effect.gen(function* openedAddresses() {
      const closed = yield* helpCenterAt({ hash: "", search: "" });
      const hash = yield* helpCenterAt({ hash: "#all", search: "" });
      const query = yield* helpCenterAt(searchAddressOf("board"));

      const category = yield* helpCenterAt({
        hash: "#all",
        search: "?category=Agents",
      });

      expect(openTagOf(closed, "all")).toContain("hidden");
      expect(openTagOf(hash, "all")).not.toContain("hidden");
      expect(openTagOf(query, "all")).not.toContain("hidden");
      expect(browserTitleOf(query)).toBe("All articles");
      expect(browserTitleOf(category)).toBe("Agents");
    })
  );
});

describe("help page description tag", () => {
  const recordedArticles = [
    {
      live: liveArticleAiFeatures.body,
      slug: "docs-features-ai-features",
    },
    {
      live: liveArticlePricing.body,
      slug: "pricing-plans",
    },
    {
      live: liveArticleTaskWriter.body,
      slug: "using-the-ai-task-writer-in-hypertasks-ctrlj-cmdj",
    },
    {
      live: liveArticleVoice.body,
      slug: "voice-dictation-meets-ai-speak-your-way-to-perfect-comments",
    },
  ];

  it.effect("sends the description the live article pages send", () =>
    Effect.gen(function* articleDescriptions() {
      for (const article of recordedArticles) {
        const flags = yield* helpPageFlags({ slug: article.slug }).pipe(
          Effect.provide(recordedHelpArticles)
        );

        if (flags === null) {
          throw new Error(`No article answers ${article.slug}`);
        }

        expect(helpDescriptionOf(flags), article.slug).toBe(
          decodeEntities(descriptionOf(article.live))
        );
      }
    })
  );

  it.effect(
    "sends no description on the help center, as the live page sends none",
    () =>
      Effect.gen(function* helpCenterDescription() {
        const flags = yield* helpPageFlags({ slug: null }).pipe(
          Effect.provide(recordedHelpArticles)
        );

        if (flags === null) {
          throw new Error("The help center has no flags.");
        }

        expect(descriptionOf(liveHelpCenter.body)).toBe("");
        expect(helpDescriptionOf(flags)).toBe("");
      })
  );

  it.effect("adds the description tag in the document layer", () =>
    Effect.gen(function* documentLayer() {
      const flags = yield* helpPageFlags({ slug: "pricing-plans" }).pipe(
        Effect.provide(recordedHelpArticles)
      );

      if (flags === null) {
        throw new Error("No article answers pricing-plans");
      }

      const application = yield* renderToString(
        {
          Flags,
          init: (page) => ({
            model: initialModelAtAddress(page, closedAddress),
          }),
          view,
        },
        { flags, isHydratable: false }
      );

      expect(renderDocument(application, assets)).not.toContain(
        '<meta name="description"'
      );
      expect(
        renderDocument(
          { ...application, description: helpDescriptionOf(flags) },
          assets
        )
      ).toContain(
        `<meta name="description" content="${descriptionOf(liveArticlePricing.body)}">`
      );
      expect(
        renderDocument(
          { ...application, description: 'Say "hi" & bye' },
          assets
        )
      ).toContain(
        '<meta name="description" content="Say &quot;hi&quot; &amp; bye">'
      );
    })
  );
});
