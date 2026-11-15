import { toHttpApi } from "@rat-stack/capability/http-api";
import { health } from "@rat-stack/core/health";
import * as AlchemyHttp from "alchemy/Http";
import { Effect, Layer } from "effect";
import { HttpRouter } from "effect/http";
import { HttpApiBuilder } from "effect/http-api";

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

const redirectsFrom = (pathname: string): boolean =>
  pathname === "/" || pathname === "/en" || pathname.startsWith("/en/");

const answerHealth = Effect.fn("helpSite.health")(function* answerHealth(
  request: Request
) {
  const answered = yield* Effect.promise(() =>
    healthAnswers.handler(new Request(request.url, { method: "GET" }))
  );

  return withCors(request, answered);
});

const answerPreflight = (request: Request): Response =>
  withCors(request, new Response(null, { status: 204 }));

const answerRedirect = (request: Request): Response =>
  withCors(
    request,
    new Response(null, { headers: { location: helpCenter }, status: 302 })
  );

export const answerHelpSite = Effect.fn("helpSite.answer")(
  function* answerHelpSite(request: Request) {
    const { pathname } = new URL(request.url);

    if (request.method === "OPTIONS") {
      return answerPreflight(request);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return undefined;
    }

    if (pathname === "/health") {
      return yield* answerHealth(request);
    }

    if (redirectsFrom(pathname)) {
      return answerRedirect(request);
    }

    return undefined;
  }
);
