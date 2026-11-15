import { Effect } from "effect";
import {
  Rendered,
  Responded,
  renderToString,
} from "foldkit/experimental/server";

import { initialModel } from "./client/home/index.js";
import {
  Flags as WidgetFlags,
  initialModel as initialWidgetModel,
} from "./client/widget/index.js";
import { view } from "./features/home/index.js";
import { view as widgetView } from "./features/widget/index.js";
import {
  widgetChatHeaders,
  widgetChatPath,
  widgetScriptHeaders,
  widgetScriptPath,
} from "./widget/embed.js";
import { widgetLoaderScript } from "./widget/loader.js";
import { widgetPageFlags } from "./widget/params.js";

export { renderDocument } from "foldkit/experimental/server";

export const prerenderPaths = ["/"];

const widgetRoutes = Effect.fn("site.widgetRoutes")(function* widgetRoutes(
  request: Request,
  origin: string
) {
  const { pathname } = new URL(request.url);

  if (pathname === widgetScriptPath) {
    return Responded(
      new Response(
        request.method === "HEAD" ? null : widgetLoaderScript(origin),
        {
          headers: widgetScriptHeaders,
          status: 200,
        }
      )
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

  return Rendered(application, { headers: widgetChatHeaders, status: 200 });
});

const renderRoute = Effect.fn("site.renderRoute")(function* renderRoute(
  request: Request
) {
  const { origin, pathname } = new URL(request.url);

  if (request.method !== "GET" && request.method !== "HEAD") {
    return Responded(
      new Response("Unsupported method", {
        headers: { Allow: "GET, HEAD" },
        status: 405,
      })
    );
  }

  if (pathname === widgetScriptPath || pathname === widgetChatPath) {
    return yield* widgetRoutes(request, origin);
  }

  if (pathname !== "/") {
    return Responded(new Response("Not found", { status: 404 }));
  }

  const application = yield* renderToString({
    init: () => ({ model: initialModel }),
    view,
  });

  return Rendered(application);
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
