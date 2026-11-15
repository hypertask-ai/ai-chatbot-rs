import { Schema } from "effect";

export const HAIKU_MODEL = "claude-haiku-5-5";

const NANO_PER_MTOK_UNIT = 1000;

const DEFAULT_WINDOW_DAYS = 30;

const LONGEST_WINDOW_DAYS = 366;

const SECONDS_PER_DAY = 86_400;

const PRICE_BASIS =
  "Claude API global list prices effective 2026-10-07. Ephemeral cache_control is the 5-minute write price. A prompt over 100000 tokens (input + cache write + cache read) uses the higher tier for that message.";

export const HAIKU_PRICES_PER_MTOK = {
  over_100k: {
    cache_creation: 0.625,
    cache_read: 0.05,
    input: 0.5,
    output: 2.5,
  },
  up_to_100k: {
    cache_creation: 0.125,
    cache_read: 0.01,
    input: 0.1,
    output: 0.5,
  },
} as const;

export const UsageTokenPrices = Schema.Struct({
  cache_creation: Schema.Finite,
  cache_read: Schema.Finite,
  input: Schema.Finite,
  output: Schema.Finite,
});

export const UsagePricesPerMtok = Schema.Struct({
  over_100k: UsageTokenPrices,
  up_to_100k: UsageTokenPrices,
});

export const UsageDayRow = Schema.Struct({
  cache_creation_input_tokens: Schema.Finite,
  cache_creation_input_tokens_over_100k: Schema.Finite,
  cache_read_input_tokens: Schema.Finite,
  cache_read_input_tokens_over_100k: Schema.Finite,
  day: Schema.String,
  input_tokens: Schema.Finite,
  input_tokens_over_100k: Schema.Finite,
  messages: Schema.Finite,
  model: Schema.String,
  output_tokens: Schema.Finite,
  output_tokens_over_100k: Schema.Finite,
});

export type UsageDayRowValue = typeof UsageDayRow.Type;

export const UsageDayReport = Schema.Struct({
  cache_creation_input_tokens: Schema.Finite,
  cache_read_input_tokens: Schema.Finite,
  cost_usd: Schema.NullOr(Schema.Finite),
  day: Schema.String,
  input_tokens: Schema.Finite,
  messages: Schema.Finite,
  model: Schema.String,
  output_tokens: Schema.Finite,
});

export type UsageDayReportValue = typeof UsageDayReport.Type;

export const UsageTotals = Schema.Struct({
  cache_creation_input_tokens: Schema.Finite,
  cache_read_input_tokens: Schema.Finite,
  cost_usd: Schema.Finite,
  input_tokens: Schema.Finite,
  messages: Schema.Finite,
  output_tokens: Schema.Finite,
});

export const AdminUsageReport = Schema.Struct({
  currency: Schema.Literal("USD"),
  days: Schema.Array(UsageDayReport),
  model: Schema.Literal(HAIKU_MODEL),
  price_basis: Schema.String,
  prices_per_mtok: UsagePricesPerMtok,
  totals: UsageTotals,
  window_days: Schema.Finite,
});

export type AdminUsageReportValue = typeof AdminUsageReport.Type;

interface TokenUsage {
  readonly cache_creation_input_tokens: number;
  readonly cache_read_input_tokens: number;
  readonly input_tokens: number;
  readonly output_tokens: number;
}

interface NanoRates {
  readonly cacheRead: number;
  readonly cacheWrite: number;
  readonly input: number;
  readonly output: number;
}

const rates = (over: boolean): NanoRates => {
  const row = over
    ? HAIKU_PRICES_PER_MTOK.over_100k
    : HAIKU_PRICES_PER_MTOK.up_to_100k;

  return {
    cacheRead: row.cache_read * NANO_PER_MTOK_UNIT,
    cacheWrite: row.cache_creation * NANO_PER_MTOK_UNIT,
    input: row.input * NANO_PER_MTOK_UNIT,
    output: row.output * NANO_PER_MTOK_UNIT,
  };
};

export const usageCostNanos = (usage: TokenUsage, over: boolean): number => {
  const price = rates(over);

  return (
    usage.input_tokens * price.input +
    usage.output_tokens * price.output +
    usage.cache_creation_input_tokens * price.cacheWrite +
    usage.cache_read_input_tokens * price.cacheRead
  );
};

export const nanosToUsd = (nanos: number): number =>
  Math.round(nanos / 1000) / 1_000_000;

const underAndOver = (row: UsageDayRowValue) => {
  const over: TokenUsage = {
    cache_creation_input_tokens: row.cache_creation_input_tokens_over_100k,
    cache_read_input_tokens: row.cache_read_input_tokens_over_100k,
    input_tokens: row.input_tokens_over_100k,
    output_tokens: row.output_tokens_over_100k,
  };

  return {
    over,
    under: {
      cache_creation_input_tokens:
        row.cache_creation_input_tokens - over.cache_creation_input_tokens,
      cache_read_input_tokens:
        row.cache_read_input_tokens - over.cache_read_input_tokens,
      input_tokens: row.input_tokens - over.input_tokens,
      output_tokens: row.output_tokens - over.output_tokens,
    },
  };
};

const dayCostUsd = (row: UsageDayRowValue): number | null => {
  if (row.model !== HAIKU_MODEL) {
    return null;
  }

  const { over, under } = underAndOver(row);

  return nanosToUsd(usageCostNanos(under, false) + usageCostNanos(over, true));
};

export const usageWindowDays = (requested?: string): number => {
  const days = Number(requested);

  return Number.isFinite(days)
    ? Math.min(LONGEST_WINDOW_DAYS, Math.max(1, Math.floor(days)))
    : DEFAULT_WINDOW_DAYS;
};

export const usageSince = (now: number, days: number): number =>
  now - days * SECONDS_PER_DAY;

export const buildUsageReport = (
  rows: readonly UsageDayRowValue[],
  windowDays: number
): AdminUsageReportValue => {
  let totalNanos = 0;

  const days: UsageDayReportValue[] = [];

  const totals = {
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    cost_usd: 0,
    input_tokens: 0,
    messages: 0,
    output_tokens: 0,
  };

  for (const row of rows) {
    const cost = dayCostUsd(row);

    if (row.model === HAIKU_MODEL) {
      const { over, under } = underAndOver(row);

      totalNanos += usageCostNanos(under, false) + usageCostNanos(over, true);
    }

    days.push({
      cache_creation_input_tokens: row.cache_creation_input_tokens,
      cache_read_input_tokens: row.cache_read_input_tokens,
      cost_usd: cost,
      day: row.day,
      input_tokens: row.input_tokens,
      messages: row.messages,
      model: row.model,
      output_tokens: row.output_tokens,
    });

    totals.messages += row.messages;
    totals.input_tokens += row.input_tokens;
    totals.output_tokens += row.output_tokens;
    totals.cache_read_input_tokens += row.cache_read_input_tokens;
    totals.cache_creation_input_tokens += row.cache_creation_input_tokens;
  }

  totals.cost_usd = nanosToUsd(totalNanos);

  return {
    currency: "USD",
    days,
    model: HAIKU_MODEL,
    price_basis: PRICE_BASIS,
    prices_per_mtok: HAIKU_PRICES_PER_MTOK,
    totals,
    window_days: windowDays,
  };
};
