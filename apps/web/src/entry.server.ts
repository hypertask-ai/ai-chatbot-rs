import { Effect } from "effect";
import {
  Rendered,
  Responded,
  renderDocument as renderFoldkitDocument,
  renderToString,
} from "foldkit/experimental/server";
import type { RenderedApplication } from "foldkit/experimental/server";

import { Flags, initialModel } from "./client/help/index.js";
import type { HelpPageValue } from "./client/help/index.js";
import { view } from "./features/help/index.js";
import {
  helpDescriptionOf,
  helpPageFlags,
  helpRouteOf,
} from "./server/help-pages.js";
import { recordedHelpArticles } from "./server/recorded-help-articles.js";

const headMarkup = [
  '<link rel="icon" type="image/png" href="/glyph-white.png">',
  '<script src="https://cdn.usefathom.com/script.js" data-site="SSBYTYUQ" defer></script>',
].join("");

type DescribedApplication = RenderedApplication & {
  readonly description?: string;
};

const escapedAttribute = (text: string): string =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");

const descriptionTagOf = (application: DescribedApplication): string =>
  application.description === undefined || application.description === ""
    ? ""
    : `<meta name="description" content="${escapedAttribute(application.description)}">`;

export const renderDocument = (
  application: DescribedApplication,
  assets: Parameters<typeof renderFoldkitDocument>[1]
): string =>
  renderFoldkitDocument(application, assets, {
    head: `${descriptionTagOf(application)}${headMarkup}`,
  });

export const prerenderPaths: readonly string[] = [];

const described = (
  application: RenderedApplication,
  page: HelpPageValue
): DescribedApplication => {
  const description = helpDescriptionOf(page);

  return description === "" ? application : { ...application, description };
};

const articleNotFound = () =>
  Responded(
    new Response("<h1>Article not found</h1>", {
      headers: { "content-type": "text/html; charset=UTF-8" },
      status: 404,
    })
  );

const renderHelpPage = Effect.fn("site.renderHelpPage")(
  function* renderHelpPage(request: Request, slug: string | null) {
    const flags = yield* helpPageFlags({ slug }).pipe(
      Effect.provide(recordedHelpArticles)
    );

    if (flags === null) {
      return articleNotFound();
    }

    const application = yield* renderToString(
      { Flags, init: (page) => ({ model: initialModel(page) }), view },
      { flags }
    );

    return Rendered(described(application, flags));
  }
);

const renderRoute = Effect.fn("site.renderRoute")(function* renderRoute(
  request: Request
) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return Responded(
      new Response("Unsupported method", {
        headers: { Allow: "GET, HEAD" },
        status: 405,
      })
    );
  }

  const { pathname } = new URL(request.url);
  const route = helpRouteOf(pathname);

  if (route === null) {
    return Responded(new Response("Not found", { status: 404 }));
  }

  return yield* renderHelpPage(request, route.slug);
});

export const renderPage = (request: Request) =>
  Effect.runPromise(
    renderRoute(request).pipe(
      Effect.catchCause((cause) =>
        Effect.succeed(
          Responded(
            new Response("The page could not be rendered", {
              status: 500,
              statusText: cause.toString(),
            })
          )
        )
      )
    )
  );
