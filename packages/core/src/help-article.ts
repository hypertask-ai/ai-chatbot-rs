import { Schema } from "effect";

export const HelpArticleTimestamp = Schema.Union([
  Schema.String,
  Schema.Finite,
]);

// oxlint-disable-next-line sort-keys -- The old article list sends these fields in this order and the recorded answer compares the encoded body.
export const HelpArticleSummary = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  slug: Schema.String,
  excerpt: Schema.NullOr(Schema.String),
  category: Schema.NullOr(Schema.String),
  created_at: HelpArticleTimestamp,
});

// oxlint-disable-next-line sort-keys -- The old keyword search sends these fields in this order and the recorded answer compares the encoded body.
export const HelpArticleMatch = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  slug: Schema.String,
  excerpt: Schema.NullOr(Schema.String),
  category: Schema.NullOr(Schema.String),
});

// oxlint-disable-next-line sort-keys -- The old article row sends these fields in this order and the recorded answer compares the encoded body.
export const HelpArticle = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  slug: Schema.String,
  content: Schema.String,
  excerpt: Schema.NullOr(Schema.String),
  category: Schema.NullOr(Schema.String),
  created_at: HelpArticleTimestamp,
  updated_at: HelpArticleTimestamp,
  url: Schema.NullOr(Schema.String),
});

// oxlint-disable-next-line sort-keys -- The old reading pane sends these fields in this order and the recorded answer compares the encoded body.
export const HelpArticlePane = Schema.Struct({
  title: Schema.String,
  slug: Schema.String,
  excerpt: Schema.String,
  category: Schema.String,
  html: Schema.String,
  plansHtml: Schema.String,
});
