import { Effect } from "effect";
import {
  Rendered,
  Responded,
  renderDocument as renderFoldkitDocument,
  renderToString,
} from "foldkit/experimental/server";

import { Flags, initialModel } from "./client/help/index.js";
import { view } from "./features/help/index.js";
import type { HelpRoute } from "./server/help-pages.js";
import { helpPageFlags, helpRouteOf } from "./server/help-pages.js";
import {
  recordedArticlePaths,
  recordedHelpArticles,
} from "./server/recorded-help-articles.js";
import {
  siteBasePath,
  siteNoindexValue,
  siteRobotsMeta,
  stripBasePath,
} from "./site-base-path.js";

const headMarkup = [
  `<link rel="icon" type="image/png" href="${siteBasePath}/glyph-white.png">`,
  '<script src="https://cdn.usefathom.com/script.js" data-site="SSBYTYUQ" defer></script>',
].join("");

export const renderDocument: typeof renderFoldkitDocument = (
  application,
  assets,
  options = {}
) =>
  renderFoldkitDocument(application, assets, {
    ...options,
    head: `${options.head ?? ""}${headMarkup}${siteRobotsMeta()}`,
  });

export const prerenderPaths: readonly string[] = [
  "/",
  "/help",
  ...recordedArticlePaths,
];

const noindexHeaders = (): Headers => {
  const headers = new Headers();
  const value = siteNoindexValue();

  if (value !== undefined) {
    headers.set("X-Robots-Tag", value);
  }

  return headers;
};

const articleNotFound = (noindex: boolean) => {
  const headers = noindex ? noindexHeaders() : new Headers();
  headers.set("content-type", "text/html; charset=UTF-8");

  return Responded(
    new Response("<h1>Article not found</h1>", { headers, status: 404 })
  );
};

const notFound = () =>
  Responded(
    new Response("Not found", { headers: noindexHeaders(), status: 404 })
  );

const unsupportedMethod = () => {
  const headers = noindexHeaders();
  headers.set("Allow", "GET, HEAD");

  return Responded(
    new Response("Unsupported method", { headers, status: 405 })
  );
};

const underBasePath = (pathname: string): boolean =>
  siteBasePath !== "" &&
  (pathname === siteBasePath || pathname.startsWith(`${siteBasePath}/`));

const pageUnder = (
  pathname: string
): { readonly noindex: boolean; readonly route: HelpRoute } | null => {
  const noindex = underBasePath(pathname);
  const path = noindex ? stripBasePath(pathname) : pathname;

  if (path === undefined) {
    return null;
  }

  const route = path === "/" ? { slug: null } : helpRouteOf(path);

  return route === null ? null : { noindex, route };
};

const renderHelpPage = Effect.fn("site.renderHelpPage")(
  function* renderHelpPage(noindex: boolean, route: HelpRoute) {
    const flags = yield* helpPageFlags(route).pipe(
      Effect.provide(recordedHelpArticles)
    );

    if (flags === null) {
      return articleNotFound(noindex);
    }

    const application = yield* renderToString(
      { Flags, init: (page) => ({ model: initialModel(page) }), view },
      { flags }
    );

    return noindex
      ? Rendered(application, { headers: noindexHeaders() })
      : Rendered(application);
  }
);

const renderRoute = Effect.fn("site.renderRoute")(function* renderRoute(
  request: Request
) {
  const { pathname } = new URL(request.url);
  const page = pageUnder(pathname);

  if (page === null) {
    return notFound();
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return unsupportedMethod();
  }

  return yield* renderHelpPage(page.noindex, page.route);
});

export const renderPage = (request: Request) =>
  Effect.runPromise(
    renderRoute(request).pipe(
      Effect.catchCause((cause) =>
        Effect.succeed(
          Responded(
            new Response("The page could not be rendered", {
              headers: noindexHeaders(),
              status: 500,
              statusText: cause.toString(),
            })
          )
        )
      )
    )
  );
