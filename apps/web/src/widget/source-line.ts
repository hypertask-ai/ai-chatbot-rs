export type CitedSource = Readonly<{
  slug: string;
  title?: string | null;
}>;

export type SourceLine = Readonly<{
  href: string;
  label: string;
  slug: string;
}>;

export const helpArticleUrl = (slug: string): string =>
  `https://help.hypertask.ai/help/${encodeURIComponent(slug)}`;

export const sourceLinePrefix = "From: ";

const titleOf = (source: Readonly<{ slug: string; title?: string | null }>) =>
  source.title === undefined || source.title === null || source.title === ""
    ? source.slug
    : source.title;

const linkedArticle = (
  text: string
): Readonly<{ slug: string; title: string }> | undefined => {
  const linked =
    /\[(?<title>[^\]]+)\]\((?:https?:\/\/[^)\s]+)?\/help\/(?<slug>[a-z0-9-]+)/iu.exec(
      text
    );

  if (linked?.groups === undefined) {
    return undefined;
  }

  return {
    slug: linked.groups.slug ?? "",
    title: linked.groups.title ?? "",
  };
};

const bareArticle = (
  text: string
): Readonly<{ slug: string; title: string }> | undefined => {
  const bare = /\/help\/(?<slug>[a-z0-9-]+)/iu.exec(text);

  if (bare?.groups === undefined) {
    return undefined;
  }

  const slug = bare.groups.slug ?? "";

  return { slug, title: slug };
};

export const citedArticle = (
  text: string | null,
  sources: readonly CitedSource[]
): Readonly<{ slug: string; title: string }> | undefined => {
  const source = sources.find((item) => item.slug !== "");

  if (source !== undefined) {
    return { slug: source.slug, title: titleOf(source) };
  }

  if (text === null || text === "") {
    return undefined;
  }

  return linkedArticle(text) ?? bareArticle(text);
};

export const sourceLineFor = (
  text: string | null,
  sources: readonly CitedSource[]
): SourceLine | undefined => {
  const article = citedArticle(text, sources);

  if (article === undefined) {
    return undefined;
  }

  return {
    href: helpArticleUrl(article.slug),
    label: `${sourceLinePrefix}${article.title}`,
    slug: article.slug,
  };
};
