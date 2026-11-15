import { implement } from "@rat-stack/capability/implement";
import { Context, Effect, Layer, Option } from "effect";

import { debugHelpRetrievalContract } from "./contracts.js";
import { HelpArticleStore } from "./help-article-store.js";
import {
  HELP_RETRIEVAL_LIMIT,
  rankHelpArticles,
  type HelpSearchArticleValue,
} from "./help-search.js";

export const DEBUG_RETRIEVAL_DEFAULT_QUERY = "how do i create a task";

export class HelpArticleCorpus extends Context.Service<
  HelpArticleCorpus,
  {
    readonly articles: Effect.Effect<readonly HelpSearchArticleValue[]>;
  }
>()("@rat-stack/core/HelpArticleCorpus") {
  static readonly layer = (articles: readonly HelpSearchArticleValue[]) =>
    Layer.succeed(this, { articles: Effect.succeed(articles) });

  static readonly layerFromStore = Layer.effect(
    this,
    Effect.gen(function* readCorpusFromStore() {
      const store = yield* HelpArticleStore;

      return {
        articles: store.list.pipe(
          Effect.flatMap((summaries) =>
            Effect.forEach(summaries, (summary) => store.read(summary.slug))
          ),
          Effect.map((found) => found.flatMap(Option.toArray))
        ),
      };
    })
  );
}

export const findHelpArticles = (query: string, limit = HELP_RETRIEVAL_LIMIT) =>
  HelpArticleCorpus.use((corpus) =>
    corpus.articles.pipe(
      Effect.map((articles) => rankHelpArticles(articles, query, limit))
    )
  );

export const debugHelpRetrieval = implement(
  debugHelpRetrievalContract,
  ({ q }) =>
    Effect.gen(function* answerDebugRetrieval() {
      const query =
        q === undefined || q === "" ? DEBUG_RETRIEVAL_DEFAULT_QUERY : q;
      const articles = yield* findHelpArticles(query);

      return {
        articles: articles.map((article) => ({
          id: article.id,
          title: article.title,
        })),
        count: articles.length,
        query,
      };
    })
);

export const helpRetrievalCapabilities = [debugHelpRetrieval] as const;
