import { Effect } from "effect";
import { Responded } from "foldkit/experimental/server";
import type { DocumentRenderer } from "foldkit/experimental/server";

import { withCors } from "./server/embed-cors.js";
import { answerHelpSite } from "./server/help-site.js";
import { withSiteNoindexResult } from "./server/site-answer.js";
import { renderSiteDocument } from "./server/site-document.js";
import { siteBasePath, withSiteBasePath } from "./site-base.js";

export const renderDocument: DocumentRenderer = renderSiteDocument;

const pagePaths: readonly string[] = [];

export const prerenderPaths = pagePaths.map(withSiteBasePath);

const renderRoute = Effect.fn("site.renderRoute")(function* renderRoute(
  request: Request
) {
  const answered = yield* answerHelpSite(request);

  const result =
    answered === null
      ? Responded(withCors(request, new Response("Not found", { status: 404 })))
      : Responded(answered);

  return withSiteNoindexResult(siteBasePath, result);
});

export const renderPage = (request: Request) =>
  Effect.runPromise(
    renderRoute(request).pipe(
      Effect.catchCause((cause) =>
        Effect.succeed(
          withSiteNoindexResult(
            siteBasePath,
            Responded(
              withCors(
                request,
                new Response("The page could not be rendered", {
                  status: 500,
                  statusText: cause.toString(),
                })
              )
            )
          )
        )
      )
    )
  );
