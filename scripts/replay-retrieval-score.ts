import { Schema } from "effect";

export const replayCaseSchema = Schema.Struct({
  acceptable_slugs: Schema.Array(Schema.String),
  id: Schema.String,
  question: Schema.String,
});

export type ReplayCase = typeof replayCaseSchema.Type;

export interface ArticleListing {
  readonly id: number | string;
  readonly slug: string;
}

export interface ReplayReading {
  readonly articleIds: readonly (number | string)[];
  readonly caseId: string;
}

export interface ReplayRow {
  readonly caseId: string;
  readonly expectedSlugs: readonly string[];
  readonly hit: boolean;
  readonly retrievedSlugs: readonly string[];
}

export interface ReplayScore {
  readonly hits: number;
  readonly rows: readonly ReplayRow[];
  readonly total: number;
}

export interface ReplayVerdict {
  readonly baseline: number;
  readonly hits: number;
  readonly passed: boolean;
  readonly total: number;
}

export interface ReplayInput {
  readonly cases: readonly ReplayCase[];
  readonly listings: readonly ArticleListing[];
  readonly readings: readonly ReplayReading[];
}

const slugIndex = (
  listings: readonly ArticleListing[]
): ReadonlyMap<string, string> =>
  new Map(listings.map((listing) => [String(listing.id), listing.slug]));

const slugsFor = (
  slugs: ReadonlyMap<string, string>,
  reading: ReplayReading
): readonly string[] =>
  reading.articleIds.map((id) => {
    const slug = slugs.get(String(id));

    if (slug === undefined) {
      throw new Error(
        `Case ${reading.caseId} retrieved article ${String(id)}, which is not in the public article index. Fix: check that the article list and the retrieval route read the same article table.`
      );
    }

    return slug;
  });

export const scoreReplay = ({
  cases,
  listings,
  readings,
}: ReplayInput): ReplayScore => {
  const slugs = slugIndex(listings);

  const readingByCase = new Map(
    readings.map((reading) => [reading.caseId, reading])
  );

  const rows = cases.map((item) => {
    const reading = readingByCase.get(item.id);

    if (reading === undefined) {
      throw new Error(
        `Case ${item.id} holds no retrieval reading. Fix: read every case in the fixture before scoring.`
      );
    }

    const retrievedSlugs = slugsFor(slugs, reading);

    return {
      caseId: item.id,
      expectedSlugs: item.acceptable_slugs,
      hit: retrievedSlugs.some((slug) => item.acceptable_slugs.includes(slug)),
      retrievedSlugs,
    };
  });

  return {
    hits: rows.filter((row) => row.hit).length,
    rows,
    total: rows.length,
  };
};

export const replayVerdict = ({
  baseline,
  score,
}: {
  readonly baseline: number;
  readonly score: ReplayScore;
}): ReplayVerdict => ({
  baseline,
  hits: score.hits,
  passed: score.hits >= baseline,
  total: score.total,
});
