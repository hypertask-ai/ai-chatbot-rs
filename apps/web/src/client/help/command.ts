import { Effect, Schema } from "effect";
import { FetchHttpClient, HttpClient, HttpClientResponse } from "effect/http";
import { Command } from "foldkit";

import { sitePath } from "../../site-base-path.js";
import { Message } from "./message.js";
import { HelpArticlePage } from "./model.js";

const READER_PATH = "/api/help-reader/";

class HelpArticleUnavailable extends Schema.TaggedError<
  HelpArticleUnavailable,
  { readonly brand: unique symbol }
>()("HelpArticleUnavailable", {
  slug: Schema.String,
}) {}

const HelpArticleAnswer = Schema.Struct({
  body: HelpArticlePage,
  status: Schema.Finite,
});

const readAnswer = HttpClientResponse.schemaJson(HelpArticleAnswer);

const readHelpArticlePane = (slug: string) =>
  Effect.gen(function* pane() {
    const response = yield* HttpClient.get(
      sitePath(`${READER_PATH}${encodeURIComponent(slug)}`)
    );

    const answer = yield* readAnswer(response);

    return answer.status === 200
      ? answer.body
      : yield* new HelpArticleUnavailable({ slug });
  });

export const BlurSearchInput = Command.define("BlurSearchInput", {
  execute: Effect.sync(() => {
    document.querySelector<HTMLElement>("#searchInput")?.blur();

    return Message.SearchInputBlurred();
  }),
  messages: [Message.SearchInputBlurred],
});

export const FocusSearchInput = Command.define("FocusSearchInput", {
  execute: Effect.sync(() => {
    document.querySelector<HTMLElement>("#searchInput")?.focus();

    return Message.SearchInputFocused();
  }),
  messages: [Message.SearchInputFocused],
});

export const LoadHelpArticle = Command.define("LoadHelpArticle", {
  args: { slug: Schema.String },
  execute: ({ slug }) =>
    Effect.sync(() => {
      document.querySelector("#reader")?.scrollTo({ top: 0 });
    }).pipe(
      Effect.andThen(
        readHelpArticlePane(slug).pipe(Effect.provide(FetchHttpClient.layer))
      ),
      Effect.match({
        onFailure: () => Message.ReaderFailed({ slug }),
        onSuccess: (article) => Message.ReaderLoaded({ article, slug }),
      })
    ),
  messages: [Message.ReaderFailed, Message.ReaderLoaded],
});

export const ShowAllArticles = Command.define("ShowAllArticles", {
  execute: Effect.sync(() => {
    window.history.replaceState(null, "", `${window.location.pathname}#all`);

    return Message.AddressReplaced();
  }),
  messages: [Message.AddressReplaced],
});
