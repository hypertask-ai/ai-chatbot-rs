import { Schema } from "effect";

export const HelpSearchArticle = Schema.Struct({
  content: Schema.String,
  id: Schema.String,
  slug: Schema.String,
  title: Schema.String,
  url: Schema.NullOr(Schema.String),
});

export type HelpSearchArticleValue = typeof HelpSearchArticle.Type;

export const HELP_RETRIEVAL_LIMIT = 8;

const RETRIEVAL_STOP_WORDS: ReadonlySet<string> = new Set([
  "the",
  "and",
  "for",
  "are",
  "but",
  "not",
  "you",
  "all",
  "can",
  "how",
  "does",
  "this",
  "that",
  "with",
  "from",
  "what",
  "have",
  "your",
  "there",
  "only",
  "some",
  "just",
]);

const SHORTEST_WORD = 3;

const BM25_K1 = 1.2;

const BM25_B = 0.75;

const TITLE_WEIGHT = 3;

const FUZZY_SHORTEST_WORD = 4;

const STEM_SHORTEST_WORD = 4;

const COMPOUND_SHORTEST_WORD = 6;

const FAR_FUZZY_SHORTEST_WORD = 8;

const MATCH_LIMIT = 10;

const MATCH_CANDIDATE_LIMIT = 30;

const ALIASES: ReadonlyMap<string, readonly string[]> = new Map([
  ["restriction", ["limit"]],
  ["restrictions", ["limit"]],
]);

const PHRASES: readonly {
  readonly add: readonly string[];
  readonly all: readonly string[];
}[] = [{ add: ["seat"], all: ["team", "size"] }];

const LIKE_WILDCARDS = /[.*+?^${}()|[\]\\]/gu;

export const HelpRetrievalArticle = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
});

// oxlint-disable-next-line sort-keys -- The old debug answer sends these fields in this order and the recorded answer compares the encoded body.
export const HelpRetrievalAnswer = Schema.Struct({
  query: Schema.String,
  count: Schema.Finite,
  articles: Schema.Array(HelpRetrievalArticle),
});

export type HelpRetrievalAnswerValue = typeof HelpRetrievalAnswer.Type;

interface IndexedArticle {
  readonly article: HelpSearchArticleValue;
  readonly bodyCounts: ReadonlyMap<string, number>;
  readonly bodyLength: number;
  readonly content: string;
  readonly title: string;
  readonly titleCounts: ReadonlyMap<string, number>;
  readonly titleLength: number;
}

interface CorpusIndex {
  readonly docs: readonly IndexedArticle[];
  readonly documentFrequency: ReadonlyMap<string, number>;
  readonly vocabulary: readonly string[];
  readonly words: ReadonlySet<string>;
}

interface FuzzyCandidate {
  readonly distance: number;
  readonly word: string;
}

interface Averages {
  readonly body: number;
  readonly title: number;
}

interface ScoredArticle {
  readonly article: HelpSearchArticleValue;
  score: number;
}

export const helpArticleTokens = (text: string): readonly string[] =>
  text
    .toLowerCase()
    .replaceAll(/[^\w\s]/gu, " ")
    .split(/\s+/u)
    .filter(
      (word) => word.length >= SHORTEST_WORD && !RETRIEVAL_STOP_WORDS.has(word)
    );

const STEM_SUFFIXES: readonly string[] = [
  "ing",
  "ed",
  "ation",
  "ion",
  "ate",
  "ment",
  "ness",
];

const INFLECTED_SUFFIXES: ReadonlySet<string> = new Set(["ing", "ed"]);

const RESTRICTED_STEMS: ReadonlySet<string> = new Set(["restric", "restrict"]);

const PLURAL_SHORTEST_STEM = 4;

const hasSuffix = (
  word: string,
  suffix: string,
  shortestStem: number
): boolean =>
  word.endsWith(suffix) && word.length - suffix.length >= shortestStem;

const withoutPlural = (word: string): string => {
  if (hasSuffix(word, "ies", SHORTEST_WORD)) {
    return `${word.slice(0, -3)}y`;
  }

  if (hasSuffix(word, "s", PLURAL_SHORTEST_STEM) && !word.endsWith("ss")) {
    return word.slice(0, -1);
  }

  return word;
};

const withoutInflection = (
  word: string
): { readonly inflected: boolean; readonly stemmed: string } => {
  for (const suffix of STEM_SUFFIXES) {
    if (hasSuffix(word, suffix, SHORTEST_WORD)) {
      return {
        inflected: INFLECTED_SUFFIXES.has(suffix),
        stemmed: word.slice(0, -suffix.length),
      };
    }
  }

  return { inflected: false, stemmed: word };
};

const withoutAt = (word: string): string =>
  hasSuffix(word, "at", SHORTEST_WORD) ? word.slice(0, -2) : word;

export const helpArticleStem = (word: string): string => {
  const { inflected, stemmed } = withoutInflection(withoutPlural(word));
  const trimmedAt = inflected ? withoutAt(stemmed) : stemmed;

  const trimmed = hasSuffix(trimmedAt, "e", SHORTEST_WORD)
    ? trimmedAt.slice(0, -1)
    : trimmedAt;

  return RESTRICTED_STEMS.has(trimmed) ? "limit" : trimmed;
};

const stemCounts = (text: string): ReadonlyMap<string, number> => {
  const counts = new Map<string, number>();

  for (const token of helpArticleTokens(text)) {
    const stemmed = helpArticleStem(token);
    counts.set(stemmed, (counts.get(stemmed) ?? 0) + 1);
  }

  return counts;
};

const totalOf = (counts: ReadonlyMap<string, number>): number => {
  let total = 0;

  for (const count of counts.values()) {
    total += count;
  }

  return total;
};

const buildIndex = (
  articles: readonly HelpSearchArticleValue[]
): CorpusIndex => {
  const docs: IndexedArticle[] = [];
  const documentFrequency = new Map<string, number>();
  const words = new Set<string>();

  for (const article of articles) {
    const title = article.title.toLowerCase();
    const content = article.content.toLowerCase();
    const titleCounts = stemCounts(title);
    const bodyCounts = stemCounts(content);

    docs.push({
      article,
      bodyCounts,
      bodyLength: totalOf(bodyCounts),
      content,
      title,
      titleCounts,
      titleLength: totalOf(titleCounts),
    });

    for (const word of new Set([
      ...helpArticleTokens(title),
      ...helpArticleTokens(content),
    ])) {
      words.add(word);
      documentFrequency.set(word, (documentFrequency.get(word) ?? 0) + 1);
    }
  }

  return { docs, documentFrequency, vocabulary: [...words], words };
};

const hasSubstring = (
  docs: readonly IndexedArticle[],
  term: string
): boolean => {
  for (const doc of docs) {
    if (doc.title.includes(term) || doc.content.includes(term)) {
      return true;
    }
  }

  return false;
};

const numberOf = (values: readonly number[], index: number): number =>
  values.at(index) ?? 0;

const letterAt = (value: string, index: number): string =>
  value.at(index) ?? "";

const editDistance = (left: string, right: string, maximum: number): number => {
  if (left === right) {
    return 0;
  }

  const leftLength = left.length;
  const rightLength = right.length;

  if (Math.abs(leftLength - rightLength) > maximum) {
    return maximum + 1;
  }

  let beforePrevious: readonly number[] | null = null;

  let previous: readonly number[] = Array.from(
    { length: rightLength + 1 },
    (_unused, index) => index
  );

  for (let row = 1; row <= leftLength; row += 1) {
    const current = Array.from({ length: rightLength + 1 }, () => 0);
    current[0] = row;
    let rowMinimum = row;

    for (let column = 1; column <= rightLength; column += 1) {
      const cost =
        letterAt(left, row - 1) === letterAt(right, column - 1) ? 0 : 1;

      let value = Math.min(
        numberOf(previous, column) + 1,
        numberOf(current, column - 1) + 1,
        numberOf(previous, column - 1) + cost
      );

      if (
        row > 1 &&
        column > 1 &&
        letterAt(left, row - 1) === letterAt(right, column - 2) &&
        letterAt(left, row - 2) === letterAt(right, column - 1) &&
        beforePrevious !== null
      ) {
        value = Math.min(value, numberOf(beforePrevious, column - 2) + 1);
      }

      current[column] = value;

      if (value < rowMinimum) {
        rowMinimum = value;
      }
    }

    if (rowMinimum > maximum) {
      return maximum + 1;
    }

    beforePrevious = previous;
    previous = current;
  }

  return numberOf(previous, rightLength);
};

const sameLetters = (left: string, right: string): boolean => {
  if (left.length !== right.length) {
    return false;
  }

  return (
    left.split("").toSorted().join("") === right.split("").toSorted().join("")
  );
};

const bigramOverlap = (left: string, right: string): number => {
  const grams = new Map<string, number>();

  for (let index = 0; index < left.length - 1; index += 1) {
    const gram = left.slice(index, index + 2);
    grams.set(gram, (grams.get(gram) ?? 0) + 1);
  }

  let shared = 0;

  for (let index = 0; index < right.length - 1; index += 1) {
    const gram = right.slice(index, index + 2);
    const count = grams.get(gram) ?? 0;

    if (count > 0) {
      shared += 1;
      grams.set(gram, count - 1);
    }
  }

  return shared;
};

const isCloserMatch = (
  token: string,
  word: string,
  best: FuzzyCandidate,
  index: CorpusIndex,
  distance: number
): boolean => {
  if (distance !== best.distance) {
    return distance < best.distance;
  }

  const wordAnagram = sameLetters(token, word);
  const bestAnagram = sameLetters(token, best.word);

  if (wordAnagram !== bestAnagram) {
    return wordAnagram;
  }

  const wordBigrams = bigramOverlap(token, word);
  const bestBigrams = bigramOverlap(token, best.word);

  if (wordBigrams !== bestBigrams) {
    return wordBigrams > bestBigrams;
  }

  const wordFrequency = index.documentFrequency.get(word) ?? 0;
  const bestFrequency = index.documentFrequency.get(best.word) ?? 0;

  if (wordFrequency !== bestFrequency) {
    return wordFrequency > bestFrequency;
  }

  return word < best.word;
};

const bestFuzzy = (
  token: string,
  index: CorpusIndex,
  maximum: number
): string | null => {
  if (token.length < FUZZY_SHORTEST_WORD) {
    return null;
  }

  const opening = token.charAt(0);
  let best: FuzzyCandidate | null = null;

  for (const word of index.vocabulary) {
    if (word.length < FUZZY_SHORTEST_WORD || !word.startsWith(opening)) {
      continue;
    }

    if (Math.abs(word.length - token.length) > maximum) {
      continue;
    }

    const distance = editDistance(token, word, maximum);

    if (distance <= 0 || distance > maximum) {
      continue;
    }

    if (best === null || isCloserMatch(token, word, best, index, distance)) {
      best = { distance, word };
    }
  }

  return best?.word ?? null;
};

const compoundSplit = (
  token: string,
  index: CorpusIndex
): readonly string[] | null => {
  if (token.length < COMPOUND_SHORTEST_WORD) {
    return null;
  }

  for (let cursor = 3; cursor <= token.length - 3; cursor += 1) {
    const left = token.slice(0, cursor);
    const right = token.slice(cursor);

    if (index.words.has(left) && index.words.has(right)) {
      return [left, right];
    }
  }

  return null;
};

const expandToken = (token: string, index: CorpusIndex): readonly string[] => {
  if (hasSubstring(index.docs, token)) {
    return [token];
  }

  const near = bestFuzzy(token, index, 1);

  if (near !== null) {
    return [near];
  }

  const split = compoundSplit(token, index);

  if (split !== null) {
    return split;
  }

  if (token.length >= FAR_FUZZY_SHORTEST_WORD) {
    const far = bestFuzzy(token, index, 2);

    if (far !== null) {
      return [far];
    }
  }

  const stemmed = helpArticleStem(token);

  if (
    stemmed !== token &&
    stemmed.length >= STEM_SHORTEST_WORD &&
    hasSubstring(index.docs, stemmed)
  ) {
    return [stemmed];
  }

  return [];
};

const searchTerms = (query: string, index: CorpusIndex): readonly string[] => {
  const tokens = helpArticleTokens(query);
  const terms: string[] = [];
  const seen = new Set<string>();
  const add = (term: string): void => {
    if (seen.has(term)) {
      return;
    }

    seen.add(term);
    terms.push(term);
  };

  for (const token of tokens) {
    for (const term of expandToken(token, index)) {
      add(term);
    }

    for (const extra of ALIASES.get(token) ?? []) {
      add(extra);
    }
  }

  for (const phrase of PHRASES) {
    if (phrase.all.every((word) => tokens.includes(word))) {
      for (const extra of phrase.add) {
        add(extra);
      }
    }
  }

  return terms;
};

export const expandedHelpQueryTerms = (
  articles: readonly HelpSearchArticleValue[],
  query: string
): readonly string[] =>
  query.trim() === "" ? [] : searchTerms(query, buildIndex(articles));

const atLeastOne = (length: number): number => (length === 0 ? 1 : length);

const bm25 = (
  termFrequency: number,
  documentsWithTerm: number,
  documentLength: number,
  averageLength: number,
  documents: number
): number => {
  const idf = Math.log(
    1 + (documents - documentsWithTerm + 0.5) / (documentsWithTerm + 0.5)
  );

  const denominator =
    termFrequency +
    BM25_K1 * (1 - BM25_B + (BM25_B * documentLength) / averageLength);

  return (idf * (termFrequency * (BM25_K1 + 1))) / denominator;
};

const averageLength = (
  docs: readonly IndexedArticle[],
  lengthOf: (doc: IndexedArticle) => number
): number => {
  let total = 0;

  for (const doc of docs) {
    total += lengthOf(doc);
  }

  if (docs.length === 0 || total === 0) {
    return 1;
  }

  return total / docs.length;
};

const distinctStems = (terms: readonly string[]): readonly string[] => {
  const stems: string[] = [];
  const seen = new Set<string>();

  for (const term of terms) {
    const stemmed = helpArticleStem(term);

    if (seen.has(stemmed)) {
      continue;
    }

    seen.add(stemmed);
    stems.push(stemmed);
  }

  return stems;
};

const documentsHolding = (
  docs: readonly IndexedArticle[],
  stems: readonly string[]
): ReadonlyMap<string, number> => {
  const holding = new Map<string, number>();

  for (const stemmed of stems) {
    let containing = 0;

    for (const doc of docs) {
      const titleTerms = doc.titleCounts.get(stemmed) ?? 0;
      const bodyTerms = doc.bodyCounts.get(stemmed) ?? 0;

      if (titleTerms + bodyTerms > 0) {
        containing += 1;
      }
    }

    holding.set(stemmed, containing);
  }

  return holding;
};

const documentScore = (
  doc: IndexedArticle,
  stems: readonly string[],
  holding: ReadonlyMap<string, number>,
  averages: Averages,
  documents: number
): number => {
  let score = 0;

  for (const stemmed of stems) {
    const titleTerms = doc.titleCounts.get(stemmed) ?? 0;
    const bodyTerms = doc.bodyCounts.get(stemmed) ?? 0;

    if (titleTerms === 0 && bodyTerms === 0) {
      continue;
    }

    const containing = holding.get(stemmed) ?? 0;

    if (titleTerms > 0) {
      score +=
        TITLE_WEIGHT *
        bm25(
          titleTerms,
          containing,
          atLeastOne(doc.titleLength),
          averages.title,
          documents
        );
    }

    if (bodyTerms > 0) {
      score += bm25(
        bodyTerms,
        containing,
        atLeastOne(doc.bodyLength),
        averages.body,
        documents
      );
    }
  }

  return score;
};

export const rankHelpArticles = (
  articles: readonly HelpSearchArticleValue[],
  query: string,
  limit = HELP_RETRIEVAL_LIMIT
): readonly HelpSearchArticleValue[] => {
  const index = buildIndex(articles);

  if (helpArticleTokens(query).length === 0) {
    return [];
  }

  const terms = searchTerms(query, index);

  if (terms.length === 0) {
    return [];
  }

  const stems = distinctStems(terms);
  const documents = index.docs.length;
  const averages = {
    body: averageLength(index.docs, (doc) => doc.bodyLength),
    title: averageLength(index.docs, (doc) => doc.titleLength),
  };
  const holding = documentsHolding(index.docs, stems);
  const scored: ScoredArticle[] = [];

  for (const doc of index.docs) {
    const score = documentScore(doc, stems, holding, averages, documents);

    if (score > 0) {
      scored.push({ article: doc.article, score });
    }
  }

  scored.sort((left, right) => right.score - left.score);

  return scored.slice(0, limit).map((row) => row.article);
};

const likePattern = (keyword: string): RegExp =>
  new RegExp(
    keyword.replaceAll(LIKE_WILDCARDS, "\\$&").replaceAll("_", "."),
    "u"
  );

export const scoreHelpSearchMatches = (
  articles: readonly HelpSearchArticleValue[],
  keywords: readonly string[],
  limit = MATCH_LIMIT
): readonly HelpSearchArticleValue[] => {
  const candidates = new Map<string, ScoredArticle>();
  const add = (article: HelpSearchArticleValue, weight: number): void => {
    const existing = candidates.get(article.id);

    if (existing === undefined) {
      candidates.set(article.id, { article, score: weight });

      return;
    }

    existing.score += weight;
  };

  for (const keyword of keywords) {
    const pattern = likePattern(keyword);
    let titleHits = 0;

    for (const article of articles) {
      if (titleHits >= MATCH_CANDIDATE_LIMIT) {
        break;
      }

      if (pattern.test(article.title.toLowerCase())) {
        add(article, TITLE_WEIGHT);
        titleHits += 1;
      }
    }

    let bodyHits = 0;

    for (const article of articles) {
      if (bodyHits >= MATCH_CANDIDATE_LIMIT) {
        break;
      }

      if (pattern.test(article.content.toLowerCase())) {
        add(article, 1);
        bodyHits += 1;
      }
    }
  }

  const ranked = [...candidates.values()].toSorted(
    (left, right) => right.score - left.score
  );

  return ranked.slice(0, limit).map((candidate) => candidate.article);
};
