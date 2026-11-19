import * as Cloudflare from "@alchemy.run/cloudflare";

import {
  siteAssetHeaders,
  siteAssetRedirects,
  siteBasePath,
} from "./site-base-path.js";
import { widgetScriptAssetHeaders } from "./widget/embed.js";

export const publishHostname = "help.hypertask.ai";

export const publishRoutePattern = `${publishHostname}${siteBasePath}*`;

export const publishWorkerName = "help-hypertask-ratstack";

const previewWorker = {
  name: publishWorkerName,
  rootDir: "../web",
  routes: [{ pattern: publishRoutePattern, zoneName: "hypertask.ai" }],
};

const headers = `${siteAssetHeaders() ?? ""}${widgetScriptAssetHeaders}`;

const redirects = siteAssetRedirects();

export class Website extends Cloudflare.Website.Foldkit<Website>()("Website", {
  ...previewWorker,
  assets: { headers, redirects },
}) {}
