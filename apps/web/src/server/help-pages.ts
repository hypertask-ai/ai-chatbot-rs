import { helpArticlePane } from "@rat-stack/core/help-article-pane";
import { HelpArticleStore } from "@rat-stack/core/help-article-store";
import type {
  HelpArticleSummaryValue,
  HelpArticleValue,
} from "@rat-stack/core/help-article-store";
import { helpCategoryName } from "@rat-stack/core/help-category";
import { Effect, Option } from "effect";

import type { HelpPageValue } from "../client/help/model.js";

const RELATED_LIMIT = 3;

const HELP_CENTER_PATH = "/help";

export interface HelpRoute {
  readonly slug: string | null;
}

const decodeSlug = (raw: string): string => {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

export const helpRouteOf = (pathname: string): HelpRoute | null => {
  if (pathname === HELP_CENTER_PATH || pathname === `${HELP_CENTER_PATH}/`) {
    return { slug: null };
  }

  if (pathname.startsWith(`${HELP_CENTER_PATH}/`)) {
    return { slug: decodeSlug(pathname.slice(HELP_CENTER_PATH.length + 1)) };
  }

  return null;
};

const cardOf = (article: HelpArticleSummaryValue) => ({
  category: helpCategoryName(article.category),
  excerpt: article.excerpt ?? "",
  slug: article.slug,
  title: article.title,
});

const pageOf = (article: HelpArticleValue) => {
  const pane = helpArticlePane(article);

  return { ...pane, category: helpCategoryName(pane.category) };
};

const relatedTo = (
  list: readonly HelpArticleSummaryValue[],
  article: HelpArticleValue
) =>
  list
    .filter(
      (entry) =>
        entry.slug !== article.slug && entry.category === article.category
    )
    .toSorted((left, right) => left.title.localeCompare(right.title))
    .slice(0, RELATED_LIMIT)
    .map((entry) => ({ slug: entry.slug, title: entry.title }));

const helpCenterFlags = Effect.fn("helpPages.helpCenterFlags")(
  function* helpCenterFlags() {
    const store = yield* HelpArticleStore;
    const list = yield* store.list;

    return {
      articles: list.map(cardOf),
      page: "home",
    } as const;
  }
);

const helpArticleFlags = Effect.fn("helpPages.helpArticleFlags")(
  function* helpArticleFlags(slug: string) {
    const store = yield* HelpArticleStore;
    const found = yield* store.read(slug);

    if (Option.isNone(found)) {
      return null;
    }

    const list = yield* store.list;

    return {
      article: pageOf(found.value),
      page: "article",
      related: relatedTo(list, found.value),
    } as const;
  }
);

export const helpPageFlags = (
  route: HelpRoute
): Effect.Effect<HelpPageValue | null, never, HelpArticleStore> =>
  route.slug === null ? helpCenterFlags() : helpArticleFlags(route.slug);

export const helpDescriptionOf = (page: HelpPageValue): string =>
  page.page === "article" ? page.article.excerpt : "";
