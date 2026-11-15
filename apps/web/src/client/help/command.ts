import { Effect, Schema } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "effect/http";
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

const HelpArticleAnswer = Schema.Struct({
  body: HelpArticlePage,
  status: Schema.Number,
});

const readAnswer = HttpClientResponse.schemaJson(HelpArticleAnswer);

const readHelpArticlePane = (slug: string) =>
  Effect.gen(function* pane() {
    const client = yield* HttpClient;

    const response = yield* client.execute(
      HttpClientRequest.get(`${READER_PATH}${encodeURIComponent(slug)}`)
    );

    const answer = yield* readAnswer(response);

    return answer.status === 200
      ? answer.body
      : yield* new HelpArticleUnavailable({ slug });
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
