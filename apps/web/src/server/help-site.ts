import { toHttpApi } from "@rat-stack/capability/http-api";
import { health } from "@rat-stack/core/health";
import * as AlchemyHttp from "alchemy/Http";
import { Effect, Layer } from "effect";
import { HttpRouter } from "effect/http";
import { HttpApiBuilder } from "effect/http-api";

import { sitePath, stripBasePath } from "../site-base-path.js";
import { withCors } from "./embed-cors.js";

const healthApi = toHttpApi("help.hypertask.ai", [health]);

const healthRoutes = HttpApiBuilder.layer(healthApi.api).pipe(
  Layer.provide(healthApi.layer),
  Layer.provide(AlchemyHttp.Platform)
);

const healthAnswers = HttpRouter.toWebHandler(healthRoutes, {
  disableLogger: true,
});

const helpCenter = "/help";

const healthPath = "/health";

const routeOf = (pathname: string): string =>
  stripBasePath(pathname) ?? pathname;

const redirectsFrom = (route: string): boolean =>
  route === "/en" || route.startsWith("/en/");

const answerHealth = Effect.fn("helpSite.health")(function* answerHealth(
  request: Request
) {
  const routed = new URL(request.url);
  routed.pathname = healthPath;

  const answered = yield* Effect.promise(() =>
    healthAnswers.handler(new Request(routed, { method: "GET" }))
  );

  return withCors(request, answered);
});

const answerPreflight = (request: Request): Response =>
  withCors(request, new Response(null, { status: 204 }));

const answerRedirect = (request: Request): Response =>
  withCors(
    request,
    new Response(null, {
      headers: { location: sitePath(helpCenter) },
      status: 302,
    })
  );

export const answerHelpSite = Effect.fn("helpSite.answer")(
  function* answerHelpSite(request: Request) {
    const { pathname } = new URL(request.url);
    const route = routeOf(pathname);
    const answersPage = request.method === "GET" || request.method === "HEAD";

    if (request.method === "OPTIONS") {
      return answerPreflight(request);
    }

    if (answersPage && route === healthPath) {
      return yield* answerHealth(request);
    }

    if (answersPage && redirectsFrom(route)) {
      return answerRedirect(request);
    }

    return null;
  }
);
