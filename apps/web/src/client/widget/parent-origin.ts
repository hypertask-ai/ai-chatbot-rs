import { widgetEmbedOrigins } from "../../widget/embed.js";

const trustedParentOrigins = new Set<string>(widgetEmbedOrigins);

const originOf = (url: string): string | undefined => {
  try {
    const { origin } = new URL(url);

    return origin === "null" ? undefined : origin;
  } catch {
    return undefined;
  }
};

export const isTrustedParentOrigin = (
  origin: string,
  selfOrigin: string
): boolean => origin === selfOrigin || trustedParentOrigins.has(origin);

const trustedCandidate = (
  candidate: string | null | undefined,
  selfOrigin: string
): candidate is string =>
  candidate !== null &&
  candidate !== undefined &&
  isTrustedParentOrigin(candidate, selfOrigin);

export const trustedParentOrigin = (
  candidates: readonly (string | null | undefined)[],
  selfOrigin: string
): string | undefined =>
  candidates.find((candidate) => trustedCandidate(candidate, selfOrigin));

export const parentOrigin = (): string | undefined =>
  trustedParentOrigin(
    [window.location.ancestorOrigins.item(0), originOf(document.referrer)],
    window.location.origin
  );
