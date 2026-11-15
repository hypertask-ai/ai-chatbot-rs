import type { HelpArticleSummaryValue } from "./help-article-store.js";

export interface HelpRelatedArticle {
  readonly slug: string;
  readonly title: string;
}

export interface HelpRelatedFocus {
  readonly category: string | null;
  readonly slug: string;
  readonly title: string;
}

export interface HelpRelatedInput {
  readonly article: HelpRelatedFocus;
  readonly list: readonly HelpArticleSummaryValue[];
}

const SAME_CATEGORY_LIMIT = 3;

const OTHER_CATEGORY_LIMIT = 2;

const KEYWORD_LIMIT = 3;

const STOP_WORDS: readonly string[] = [
  "the",
  "a",
  "an",
  "to",
  "how",
  "what",
  "why",
  "when",
  "is",
  "are",
  "and",
  "or",
  "in",
  "on",
  "for",
  "with",
  "your",
  "you",
  "can",
  "this",
  "that",
];

const PATTERN_METACHARACTERS = ".*+?^${}()|[]\\";

const LIKE_WILDCARDS = new Map<string, string>([
  ["%", ".*"],
  ["_", "."],
]);

const asciiLower = (text: string): string =>
  text.replaceAll(/[A-Z]/gu, (letter) => letter.toLowerCase());

const patternCharacterOf = (character: string): string =>
  LIKE_WILDCARDS.get(character) ??
  (PATTERN_METACHARACTERS.includes(character) ? `\\${character}` : character);

const likeMatcher = (keyword: string): RegExp =>
  new RegExp(`^${[...`%${keyword}%`].map(patternCharacterOf).join("")}$`, "su");

const keywordsOf = (title: string): readonly string[] =>
  title
    .toLowerCase()
    .split(/\s+/u)
    .filter((word) => word.length > 2 && !STOP_WORDS.includes(word))
    .slice(0, KEYWORD_LIMIT);

const codePointsOf = (text: string): readonly number[] =>
  [...text].map((character) => character.codePointAt(0) ?? 0);

const compareByTitle = (
  left: HelpRelatedArticle,
  right: HelpRelatedArticle
) => {
  const leftPoints = codePointsOf(left.title);
  const rightPoints = codePointsOf(right.title);
  const shortest = Math.min(leftPoints.length, rightPoints.length);

  for (let index = 0; index < shortest; index += 1) {
    const difference = (leftPoints[index] ?? 0) - (rightPoints[index] ?? 0);

    if (difference !== 0) {
      return difference;
    }
  }

  return leftPoints.length - rightPoints.length;
};

const linkOf = (article: HelpRelatedFocus): HelpRelatedArticle => ({
  slug: article.slug,
  title: article.title,
});

const matchesAnyKeyword = (
  matchers: readonly RegExp[],
  title: string
): boolean => {
  const lowered = asciiLower(title);

  return matchers.some((matcher) => matcher.test(lowered));
};

export const relatedHelpArticles = ({
  article,
  list,
}: HelpRelatedInput): readonly HelpRelatedArticle[] => {
  if (article.category === null) {
    return [];
  }

  const others = list.filter((entry) => entry.slug !== article.slug);

  const sameCategory = others
    .filter((entry) => entry.category === article.category)
    .toSorted(compareByTitle)
    .slice(0, SAME_CATEGORY_LIMIT);

  const matchers = keywordsOf(article.title).map(likeMatcher);
  const otherCategory =
    matchers.length === 0
      ? []
      : others
          .filter(
            (entry) =>
              entry.category !== article.category &&
              matchesAnyKeyword(matchers, entry.title)
          )
          .toSorted(compareByTitle)
          .slice(0, OTHER_CATEGORY_LIMIT);

  return [...sameCategory, ...otherCategory].map(linkOf);
};
