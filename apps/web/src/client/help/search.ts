export interface HelpVisitorArticle {
  readonly category: string;
  readonly excerpt: string;
  readonly slug: string;
  readonly title: string;
}

export interface HelpVisitorHit {
  readonly end: number;
  readonly start: number;
}

const PATTERN_CHARACTERS = /[.*+?^${}()|[\]\\]/gu;

export const helpVisitorQuery = (query: string): string =>
  query.toLowerCase().trim();

export const filterHelpArticles = <Article extends HelpVisitorArticle>(
  articles: readonly Article[],
  query: string
): readonly Article[] => {
  const needle = helpVisitorQuery(query);

  if (needle === "") {
    return [];
  }

  return articles.filter(
    (article) =>
      article.title.toLowerCase().includes(needle) ||
      article.excerpt.toLowerCase().includes(needle)
  );
};

export const helpSearchHits = (
  text: string,
  query: string
): readonly HelpVisitorHit[] => {
  const needle = helpVisitorQuery(query);

  if (needle === "") {
    return [];
  }

  const pattern = new RegExp(
    needle.replaceAll(PATTERN_CHARACTERS, "\\$&"),
    "giu"
  );
  const hits: HelpVisitorHit[] = [];

  for (const match of text.matchAll(pattern)) {
    hits.push({ end: match.index + match[0].length, start: match.index });
  }

  return hits;
};
