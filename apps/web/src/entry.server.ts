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
import {
  Flags as WidgetFlags,
  initialModel as initialWidgetModel,
} from "./client/widget/index.js";
import { view } from "./features/help/index.js";
import { view as widgetView } from "./features/widget/index.js";
import { withCors } from "./server/embed-cors.js";
import type { HelpRoute } from "./server/help-pages.js";
import {
  helpDescriptionOf,
  helpPageFlags,
  helpRouteOf,
} from "./server/help-pages.js";
import { answerHelpSite } from "./server/help-site.js";
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
import {
  widgetChatHeaders,
  widgetChatPath,
  widgetScriptHeaders,
  widgetScriptPath,
} from "./widget/embed.js";
import { widgetLoaderScript } from "./widget/loader.js";
import { widgetPageFlags } from "./widget/params.js";

const headMarkup = [
  `<link rel="icon" type="image/png" href="${siteBasePath}/glyph-white.png">`,
  '<script src="https://cdn.usefathom.com/script.js" data-site="SSBYTYUQ" defer></script>',
].join("");

type DescribedApplication = RenderedApplication & {
  readonly description?: string;
};

type DocumentOptions = NonNullable<Parameters<typeof renderFoldkitDocument>[2]>;

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
  assets: Parameters<typeof renderFoldkitDocument>[1],
  options: DocumentOptions = {}
): string =>
  renderFoldkitDocument(application, assets, {
    ...options,
    head: `${descriptionTagOf(application)}${options.head ?? ""}${headMarkup}${siteRobotsMeta()}`,
  });

export const prerenderPaths: readonly string[] = [
  "/",
  "/help",
  ...recordedArticlePaths,
];

const described = (
  application: RenderedApplication,
  page: HelpPageValue
): DescribedApplication => {
  const description = helpDescriptionOf(page);

  return description === "" ? application : { ...application, description };
};

const noindexHeaders = (): Headers => {
  const headers = new Headers();
  const value = siteNoindexValue();

  if (value !== undefined) {
    headers.set("X-Robots-Tag", value);
  }

  return headers;
};

const articleNotFound = (noindex: boolean): Response => {
  const headers = noindex ? noindexHeaders() : new Headers();
  headers.set("content-type", "text/html; charset=UTF-8");

  return new Response("<h1>Article not found</h1>", { headers, status: 404 });
};

const notFound = (): Response =>
  new Response("Not found", { headers: noindexHeaders(), status: 404 });

const unsupportedMethod = (): Response => {
  const headers = noindexHeaders();
  headers.set("Allow", "GET, HEAD");

  return new Response("Unsupported method", { headers, status: 405 });
};

const withWidgetChatHeaders = (): Headers => {
  const headers = noindexHeaders();

  for (const [name, value] of Object.entries(widgetChatHeaders)) {
    headers.set(name, value);
  }

  return headers;
};

const routePath = (pathname: string): string | undefined =>
  pathname === "/" ? "/" : stripBasePath(pathname);

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
  function* renderHelpPage(
    request: Request,
    noindex: boolean,
    route: HelpRoute
  ) {
    const flags = yield* helpPageFlags(route).pipe(
      Effect.provide(recordedHelpArticles)
    );

    if (flags === null) {
      return Responded(withCors(request, articleNotFound(noindex)));
    }

    const application = yield* renderToString(
      { Flags, init: (page) => ({ model: initialModel(page) }), view },
      { flags }
    );

    const page = described(application, flags);

    return noindex
      ? Rendered(page, { headers: noindexHeaders() })
      : Rendered(page);
  }
);

const widgetRoutes = Effect.fn("site.widgetRoutes")(function* widgetRoutes(
  request: Request,
  pathname: string
) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return Responded(withCors(request, unsupportedMethod()));
  }

  if (pathname === widgetScriptPath) {
    return Responded(
      new Response(request.method === "HEAD" ? null : widgetLoaderScript(), {
        headers: widgetScriptHeaders,
        status: 200,
      })
    );
  }

  const flags = widgetPageFlags(new URL(request.url).search);

  const application = yield* renderToString(
    {
      Flags: WidgetFlags,
      init: (page) => ({ model: initialWidgetModel(page) }),
      view: widgetView,
    },
    { flags }
  );

  return Rendered(application, {
    headers: withWidgetChatHeaders(),
    status: 200,
  });
});

const renderRoute = Effect.fn("site.renderRoute")(function* renderRoute(
  request: Request
) {
  const answered = yield* answerHelpSite(request);

  if (answered !== null) {
    return Responded(answered);
  }

  const { pathname } = new URL(request.url);
  const route = routePath(pathname);

  if (route === widgetScriptPath || route === widgetChatPath) {
    return yield* widgetRoutes(request, route);
  }

  const page = pageUnder(pathname);

  if (page === null) {
    return Responded(withCors(request, notFound()));
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return Responded(withCors(request, unsupportedMethod()));
  }

  return yield* renderHelpPage(request, page.noindex, page.route);
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
                headers: noindexHeaders(),
                status: 500,
                statusText: cause.toString(),
              })
            )
          )
        )
      )
    )
  );
