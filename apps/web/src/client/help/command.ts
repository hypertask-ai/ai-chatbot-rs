import { Effect, Schema } from "effect";
import { Command } from "foldkit";

import { Message } from "./message.js";
import { HelpArticlePage } from "./model.js";

const READER_PATH = "/api/help-reader/";

class HelpArticleUnavailable extends Schema.TaggedError<
  HelpArticleUnavailable,
  { readonly brand: unique symbol }
>()("HelpArticleUnavailable", {
  slug: Schema.String,
}) {}

const readHelpArticlePane = (slug: string) =>
  Effect.tryPromise({
    catch: () => new HelpArticleUnavailable({ slug }),
    try: () => fetch(`${READER_PATH}${encodeURIComponent(slug)}`),
  }).pipe(
    Effect.flatMap((response) =>
      response.ok
        ? Effect.tryPromise({
            catch: () => new HelpArticleUnavailable({ slug }),
            try: () => response.json(),
          })
        : Effect.fail(new HelpArticleUnavailable({ slug }))
    ),
    Effect.flatMap(Schema.decodeUnknownEffect(HelpArticlePage))
  );

export const LoadHelpArticle = Command.define("LoadHelpArticle", {
  args: { slug: Schema.String },
  execute: ({ slug }) =>
    Effect.sync(() => {
      document.querySelector("#reader")?.scrollTo({ top: 0 });
    }).pipe(
      Effect.andThen(readHelpArticlePane(slug)),
      Effect.match({
        onFailure: () => Message.ReaderFailed({ slug }),
        onSuccess: (article) => Message.ReaderLoaded({ article, slug }),
      })
    ),
  messages: [Message.ReaderFailed, Message.ReaderLoaded],
});
