import { Option } from "effect";

export interface HelpArticleLink {
  readonly href: string | null;
  readonly target: string | null;
}

const ARTICLE_PATH = /^\/help\/(?<slug>[^/]+)\/?$/u;

const parsedUrl = (href: string, origin: string): Option.Option<URL> => {
  try {
    return Option.some(new URL(href, origin));
  } catch {
    return Option.none();
  }
};

const decodedSegment = (segment: string): Option.Option<string> => {
  try {
    return Option.some(decodeURIComponent(segment));
  } catch {
    return Option.none();
  }
};

export const helpArticleSlugOf = (
  link: HelpArticleLink,
  origin: string
): Option.Option<string> =>
  link.target === "_blank"
    ? Option.none()
    : Option.flatMap(parsedUrl(link.href ?? "", origin), (url) =>
        url.origin === origin
          ? Option.flatMap(
              Option.fromUndefinedOr(
                ARTICLE_PATH.exec(url.pathname)?.groups?.slug
              ),
              decodedSegment
            )
          : Option.none()
      );
