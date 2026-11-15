import { renderDocument as renderFoldkitDocument } from "foldkit/experimental/server";
import type { DocumentRenderer } from "foldkit/experimental/server";

import { siteBasePath, siteRobotsTag } from "../site-base.js";

const robotsMeta = `<meta name="robots" content="${siteRobotsTag}">`;

export const siteDocumentRenderer =
  (basePath: string): DocumentRenderer =>
  (application, assets, options) =>
    renderFoldkitDocument(
      application,
      assets,
      basePath === ""
        ? options
        : { ...options, head: `${robotsMeta}${options?.head ?? ""}` }
    );

export const renderSiteDocument = siteDocumentRenderer(siteBasePath);
