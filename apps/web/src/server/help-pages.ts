import { helpArticlePane } from "@rat-stack/core/help-article-pane";
import { HelpArticleStore } from "@rat-stack/core/help-article-store";
import type {
  HelpArticleSummaryValue,
  HelpArticleValue,
} from "@rat-stack/core/help-article-store";
import { helpCategoryName } from "@rat-stack/core/help-category";
import { relatedHelpArticles } from "@rat-stack/core/help-related-articles";
import { Effect, Option } from "effect";

import type { HelpPageValue } from "../client/help/model.js";

const HELP_CENTER_PATH = "/help";

const ARTICLE_PREFIX = `${HELP_CENTER_PATH}/`;

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
  if (pathname === HELP_CENTER_PATH) {
    return { slug: null };
  }

  if (!pathname.startsWith(ARTICLE_PREFIX)) {
    return null;
  }

  const raw = pathname.slice(ARTICLE_PREFIX.length);

  if (raw === "" || raw.includes("/")) {
    return null;
  }

  return { slug: decodeSlug(raw) };
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
      related: relatedHelpArticles({ article: found.value, list }),
    } as const;
  }
);

export const helpPageFlags = (
  route: HelpRoute
): Effect.Effect<HelpPageValue | null, never, HelpArticleStore> =>
  route.slug === null ? helpCenterFlags() : helpArticleFlags(route.slug);
