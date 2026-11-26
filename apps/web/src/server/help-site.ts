import { Effect } from "effect";

import { sitePath, stripBasePath } from "../site-base-path.js";
import { withCors } from "./embed-cors.js";
import { answerHelpApi, isHelpApiRoute } from "./help-api.js";

const helpCenter = "/help";

const adminEntry = "/admin";

const accessTeamDomain = "hypertask.cloudflareaccess.com";

const routeOf = (pathname: string): string =>
  stripBasePath(pathname) ?? pathname;

const redirectsFrom = (route: string): boolean =>
  route === "/en" || route.startsWith("/en/");

const isAdminRoute = (route: string): boolean =>
  route === adminEntry || route.startsWith(`${adminEntry}/`);

const accessLoginUrl = (request: Request, route: string): string => {
  const { hostname } = new URL(request.url);

  return `https://${accessTeamDomain}/cdn-cgi/access/login/${hostname}?redirect_url=${encodeURIComponent(route)}`;
};

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

const answerAdminLogin = (request: Request, route: string): Response =>
  withCors(
    request,
    new Response(null, {
      headers: { location: accessLoginUrl(request, route) },
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

    if (answersPage && isHelpApiRoute(route)) {
      return yield* answerHelpApi(request, route);
    }

    if (answersPage && isAdminRoute(route)) {
      return answerAdminLogin(request, route);
    }

    if (answersPage && redirectsFrom(route)) {
      return answerRedirect(request);
    }

    return null;
  }
);
