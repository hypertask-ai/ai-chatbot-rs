import { Match } from "effect";
import { Rendered, Responded } from "foldkit/experimental/server";
import type { EntryResult } from "foldkit/experimental/server";

import { siteRobotsTag, withSiteNoindex } from "../site-base.js";

const noindexHeaders = (headers: HeadersInit | undefined): Headers => {
  const marked = new Headers(headers);

  marked.set("x-robots-tag", siteRobotsTag);

  return marked;
};

export const withSiteNoindexResult = (
  basePath: string,
  result: EntryResult
): EntryResult => {
  if (basePath === "") {
    return result;
  }

  return Match.value(result).pipe(
    Match.tag("Responded", (responded) =>
      Responded(withSiteNoindex(basePath, responded.response))
    ),
    Match.tag("Rendered", (rendered) =>
      rendered.status === undefined
        ? Rendered(rendered.application, {
            headers: noindexHeaders(rendered.headers),
          })
        : Rendered(rendered.application, {
            headers: noindexHeaders(rendered.headers),
            status: rendered.status,
          })
    ),
    Match.exhaustive
  );
};
