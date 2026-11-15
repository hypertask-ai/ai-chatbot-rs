import { renderDocument as renderFoldkitDocument } from "foldkit/experimental/server";
import type {
  DocumentAssets,
  DocumentOptions,
  DocumentRenderer,
  RenderedApplication,
} from "foldkit/experimental/server";

import { siteBasePath, siteRobotsTag } from "../site-base.js";

const robotsMeta = `<meta name="robots" content="${siteRobotsTag}">`;

export const siteDocumentRenderer =
  (basePath: string): DocumentRenderer =>
  (
    application: RenderedApplication,
    assets: DocumentAssets,
    options?: DocumentOptions
  ) =>
    renderFoldkitDocument(
      application,
      assets,
      basePath === ""
        ? options
        : { ...options, head: `${robotsMeta}${options?.head ?? ""}` }
    );

export const renderSiteDocument = siteDocumentRenderer(siteBasePath);
