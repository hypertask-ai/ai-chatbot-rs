import { Context, Effect, Layer, Option } from "effect";

import type {
  HelpArticle,
  HelpArticleMatch,
  HelpArticleSummary,
} from "./help-article.js";

export type HelpArticleSummaryValue = typeof HelpArticleSummary.Type;

export type HelpArticleMatchValue = typeof HelpArticleMatch.Type;

export type HelpArticleValue = typeof HelpArticle.Type;

export interface HelpArticleSearch {
  readonly keywords: string;
  readonly matches: readonly HelpArticleMatchValue[];
}

export interface HelpArticleMemory {
  readonly articles: readonly HelpArticleValue[];
  readonly list: readonly HelpArticleSummaryValue[];
  readonly searches: readonly HelpArticleSearch[];
}

const matchesFor = (
  searches: readonly HelpArticleSearch[],
  keywords: readonly string[]
): readonly HelpArticleMatchValue[] =>
  searches.find((entry) => entry.keywords === keywords.join(" "))?.matches ??
  [];

export class HelpArticleStore extends Context.Service<
  HelpArticleStore,
  {
    readonly list: Effect.Effect<readonly HelpArticleSummaryValue[]>;
    readonly read: (
      slug: string
    ) => Effect.Effect<Option.Option<HelpArticleValue>>;
    readonly search: (
      keywords: readonly string[]
    ) => Effect.Effect<readonly HelpArticleMatchValue[]>;
  }
>()("@rat-stack/core/HelpArticleStore") {
  static readonly layer = (memory: HelpArticleMemory) =>
    Layer.succeed(HelpArticleStore, {
      list: Effect.succeed(memory.list),
      read: (slug) =>
        Effect.succeed(
          Option.fromUndefinedOr(
            memory.articles.find((article) => article.slug === slug)
          )
        ),
      search: (keywords) =>
        Effect.succeed(matchesFor(memory.searches, keywords)),
    });
}
