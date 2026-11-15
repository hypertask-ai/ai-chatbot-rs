import { Effect } from "effect";
import { Responded } from "foldkit/experimental/server";

import { withCors } from "./server/embed-cors.js";
import { answerHelpSite } from "./server/help-site.js";

export { renderDocument } from "foldkit/experimental/server";

export const prerenderPaths: readonly string[] = [];

const renderRoute = Effect.fn("site.renderRoute")(function* renderRoute(
  request: Request
) {
  const answered = yield* Effect.promise(() => answerHelpSite(request));

  if (answered !== undefined) {
    return Responded(answered);
  }

  return Responded(
    withCors(request, new Response("Not found", { status: 404 }))
  );
});

export const renderPage = (request: Request) =>
  Effect.runPromise(
    renderRoute(request).pipe(
      Effect.catchCause((cause) =>
        Effect.succeed(
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
  );
