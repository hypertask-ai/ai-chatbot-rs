import { implement } from "@rat-stack/capability/implement";
import { Effect } from "effect";

import {
  listHelpArticlesContract,
  readHelpArticleContract,
  readHelpArticlePaneContract,
  searchHelpArticlesContract,
} from "./contracts.js";
import { formatHelpArticleContent } from "./help-article-html.js";
import { HelpArticleStore } from "./help-article-store.js";
import type { HelpArticleValue } from "./help-article-store.js";
import { helpPlansHtml } from "./help-plans.js";

const SEARCH_KEYWORD_LIMIT = 5;

const SHORTEST_KEYWORD_LENGTH = 3;

const STOP_WORDS: ReadonlySet<string> = new Set([
  "all",
  "and",
  "are",
  "but",
  "can",
  "does",
  "for",
  "from",
  "have",
  "how",
  "not",
  "that",
  "the",
  "this",
  "what",
  "with",
  "you",
  "your",
]);

export const helpSearchKeywords = (query: string): readonly string[] =>
  query
    .toLowerCase()
    .replaceAll(/[^\w\s]/gu, " ")
    .split(/\s+/u)
    .filter((word) => word.length >= SHORTEST_KEYWORD_LENGTH)
    .filter((word) => !STOP_WORDS.has(word))
    .slice(0, SEARCH_KEYWORD_LIMIT);

const paneOf = (article: HelpArticleValue) => ({
  category: article.category ?? "",
  excerpt: article.excerpt ?? "",
  html: formatHelpArticleContent(article.content),
  plansHtml: helpPlansHtml(article.slug),
  slug: article.slug,
  title: article.title,
});

const articleAt = (slug: string) =>
  HelpArticleStore.use((store) => store.read(slug)).pipe(
    Effect.flatMap((found) =>
      Effect.fromOption(found).pipe(
        Effect.mapError(() => ({ error: "Article not found" as const }))
      )
    )
  );

export const listHelpArticles = implement(listHelpArticlesContract, () =>
  HelpArticleStore.use((store) => store.list)
);

export const readHelpArticle = implement(readHelpArticleContract, ({ slug }) =>
  articleAt(slug)
);

export const readHelpArticlePane = implement(
  readHelpArticlePaneContract,
  ({ slug }) => articleAt(slug).pipe(Effect.map(paneOf))
);

export const searchHelpArticles = implement(
  searchHelpArticlesContract,
  ({ query }) => {
    const keywords = helpSearchKeywords(query);

    return keywords.length === 0
      ? Effect.succeed([])
      : HelpArticleStore.use((store) => store.search(keywords));
  }
);

export const helpArticleCapabilities = [
  listHelpArticles,
  readHelpArticle,
  readHelpArticlePane,
  searchHelpArticles,
] as const;
