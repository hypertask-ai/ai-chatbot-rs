import { toHttpApi } from "@rat-stack/capability/http-api";
import { health } from "@rat-stack/core/health";
import * as AlchemyHttp from "alchemy/Http";
import { Effect, Layer } from "effect";
import { HttpRouter } from "effect/http";
import { HttpApiBuilder } from "effect/http-api";

import {
  addSiteBasePath,
  isWithinSiteBasePath,
  removeSiteBasePath,
} from "../site-base-path.js";
import { siteBasePath, withSiteNoindex } from "../site-base.js";
import { withCors } from "./embed-cors.js";
import {
  separateTestStoreBindingNames,
  workerBindingNames,
} from "./site-bindings.js";
import { assertTestAddressIsolated } from "./site-isolation.js";

const healthApi = toHttpApi("help.hypertask.ai", [health]);

const healthRoutes = HttpApiBuilder.layer(healthApi.api).pipe(
  Layer.provide(healthApi.layer),
  Layer.provide(AlchemyHttp.Platform)
);

const healthAnswers = HttpRouter.toWebHandler(healthRoutes, {
  disableLogger: true,
});

const helpCenter = "/help";

const redirectsFrom = (pathname: string): boolean =>
  pathname === "/" || pathname === "/en" || pathname.startsWith("/en/");

const routedRequest = (basePath: string, request: Request): Request => {
  if (basePath === "") {
    return request;
  }

  const { pathname, search } = new URL(request.url);
  const route = removeSiteBasePath(basePath, pathname);

  return new Request(new URL(`${route}${search}`, request.url), request);
};

const answerHealth = Effect.fn("helpSite.health")(function* answerHealth(
  basePath: string,
  request: Request
) {
  const routed = routedRequest(basePath, request);
  const answered = yield* Effect.promise(() =>
    healthAnswers.handler(new Request(routed.url, { method: "GET" }))
  );

  return withCors(request, answered);
});

const answerPreflight = (request: Request): Response =>
  withCors(request, new Response(null, { status: 204 }));

const answerRedirect = (basePath: string, request: Request): Response =>
  withCors(
    request,
    new Response(null, {
      headers: { location: addSiteBasePath(basePath, helpCenter) },
      status: 302,
    })
  );

const answerOutsideTestAddress = (request: Request): Response =>
  withCors(request, new Response("Not found", { status: 404 }));

export const answerHelpSiteAt = (basePath: string) => {
  assertTestAddressIsolated(
    basePath,
    workerBindingNames,
    separateTestStoreBindingNames
  );

  return Effect.fn("helpSite.answer")(function* answerHelpSite(
    request: Request
  ) {
    const { pathname } = new URL(request.url);
    const answersPage = request.method === "GET" || request.method === "HEAD";

    if (request.method === "OPTIONS") {
      return withSiteNoindex(basePath, answerPreflight(request));
    }

    if (!isWithinSiteBasePath(basePath, pathname)) {
      return withSiteNoindex(basePath, answerOutsideTestAddress(request));
    }

    const route = removeSiteBasePath(basePath, pathname);

    if (answersPage && route === "/health") {
      const answered = yield* answerHealth(basePath, request);

      return withSiteNoindex(basePath, answered);
    }

    if (answersPage && redirectsFrom(route)) {
      return withSiteNoindex(basePath, answerRedirect(basePath, request));
    }

    return null;
  });
};

export const answerHelpSite = answerHelpSiteAt(siteBasePath);
