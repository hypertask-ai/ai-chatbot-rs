import { Effect } from "effect";
import type { Cause } from "effect/Cause";
import {
  Rendered,
  Responded,
  renderDocument as renderFoldkitDocument,
  renderToString,
} from "foldkit/experimental/server";

import { initialModel } from "./client/home/index.js";
import { view } from "./features/home/index.js";
import {
  siteNoindexValue,
  siteRobotsMeta,
  stripBasePath,
} from "./site-base-path.js";

export const prerenderPaths = ["/"];

const noindexHeaders = (): Headers => {
  const headers = new Headers();
  const value = siteNoindexValue();

  if (value !== undefined) {
    headers.set("X-Robots-Tag", value);
  }

  return headers;
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

const renderFailure = (cause: Cause.Cause<never>) =>
  Effect.succeed(
    Responded(
      new Response("The page could not be rendered", {
        headers: noindexHeaders(),
        status: 500,
        statusText: cause.toString(),
      })
    )
  );

const routePath = (pathname: string): string | undefined =>
  pathname === "/" ? "/" : stripBasePath(pathname);

export const renderDocument: typeof renderFoldkitDocument = (
  application,
  assets,
  options = {}
) =>
  renderFoldkitDocument(application, assets, {
    ...options,
    head: `${options.head ?? ""}${siteRobotsMeta()}`,
  });

const renderRoute = Effect.fn("site.renderRoute")(function* renderRoute(
  request: Request
) {
  const { pathname } = new URL(request.url);

  if (routePath(pathname) !== "/") {
    return notFound();
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return unsupportedMethod();
  }

  const application = yield* renderToString({
    init: () => ({ model: initialModel }),
    view,
  });

  return pathname === "/"
    ? Rendered(application)
    : Rendered(application, { headers: noindexHeaders() });
});

export const renderPage = (request: Request) =>
  Effect.runPromise(
    renderRoute(request).pipe(Effect.catchCause(renderFailure))
  );
