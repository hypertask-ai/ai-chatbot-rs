import {
  HelpArticleNotFound,
  HelpArticlePane,
} from "@rat-stack/core/contracts";
import { HelpArticleStore } from "@rat-stack/core/help-article-store";
import { readHelpArticlePane } from "@rat-stack/core/help-articles";
import { Effect, Option, Schema } from "effect";

import { decodeSlug } from "./help-pages.js";

const READER_PATH = "/api/help-reader/";

const encodePane = Schema.encodeSync(HelpArticlePane);

const encodeNotFound = Schema.encodeSync(HelpArticleNotFound);

const jsonResponse = (status: number, body: string): Response =>
  new Response(body, {
    headers: { "content-type": "application/json" },
    status,
  });

export const helpReaderSlugOf = (pathname: string): Option.Option<string> => {
  if (!pathname.startsWith(READER_PATH)) {
    return Option.none();
  }

  const segment = pathname.slice(READER_PATH.length);

  return segment === "" || segment.includes("/")
    ? Option.none()
    : Option.some(decodeSlug(segment));
};

export const helpReaderResponse = (
  slug: string
): Effect.Effect<Response, never, HelpArticleStore> =>
  readHelpArticlePane.handler({ slug }).pipe(
    Effect.match({
      onFailure: () =>
        jsonResponse(
          404,
          JSON.stringify(encodeNotFound({ error: "Article not found" }))
        ),
      onSuccess: (pane) => jsonResponse(200, JSON.stringify(encodePane(pane))),
    })
  );
