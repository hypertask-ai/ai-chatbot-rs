import { Schema } from "effect";
import { defineTaggedUnion } from "foldkit/schema";

export const HelpArticleCard = Schema.Struct({
  category: Schema.String,
  excerpt: Schema.String,
  slug: Schema.String,
  title: Schema.String,
});

export const HelpArticlePage = Schema.Struct({
  category: Schema.String,
  excerpt: Schema.String,
  html: Schema.String,
  plansHtml: Schema.String,
  slug: Schema.String,
  title: Schema.String,
});

export const HelpRelatedLink = Schema.Struct({
  slug: Schema.String,
  title: Schema.String,
});

export const HelpPage = Schema.Union([
  Schema.Struct({
    articles: Schema.Array(HelpArticleCard),
    page: Schema.Literal("home"),
  }),
  Schema.Struct({
    article: HelpArticlePage,
    page: Schema.Literal("article"),
    related: Schema.Array(HelpRelatedLink),
  }),
]);

export const Flags = HelpPage;

export const ReaderPhase = defineTaggedUnion({
  Closed: {},
  Failed: { wide: Schema.Boolean },
  Loading: { slug: Schema.String, wide: Schema.Boolean },
  Open: { article: HelpArticlePage, wide: Schema.Boolean },
});

export const Model = Schema.Struct({
  feedback: Schema.Struct({
    no: Schema.Boolean,
    yes: Schema.Boolean,
  }),
  page: HelpPage,
  reader: ReaderPhase,
});

export type AppModel = typeof Model.Type;

export type HelpPageValue = typeof HelpPage.Type;

export type ReaderPhaseValue = typeof ReaderPhase.Type;

export const initialModel = (flags: typeof Flags.Type): AppModel => ({
  feedback: { no: false, yes: false },
  page: flags,
  reader: ReaderPhase.Closed(),
});
