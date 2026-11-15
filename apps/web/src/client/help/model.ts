import { Option, Schema } from "effect";

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

export const HelpBrowser = Schema.Struct({
  category: Schema.Option(Schema.String),
  open: Schema.Boolean,
});

export const HelpSearch = Schema.Struct({
  input: Schema.String,
  query: Schema.String,
});

export const Model = Schema.Struct({
  browser: HelpBrowser,
  feedback: Schema.Struct({
    no: Schema.Boolean,
    yes: Schema.Boolean,
  }),
  page: HelpPage,
  search: HelpSearch,
});

export type AppModel = typeof Model.Type;

export type HelpArticleCardValue = typeof HelpArticleCard.Type;

export type HelpPageValue = typeof HelpPage.Type;

export type HelpBrowserValue = typeof HelpBrowser.Type;

export type HelpSearchValue = typeof HelpSearch.Type;

export const closedBrowser: HelpBrowserValue = {
  category: Option.none(),
  open: false,
};

export const emptySearch: HelpSearchValue = { input: "", query: "" };

export const initialModel = (flags: typeof Flags.Type): AppModel => ({
  browser: closedBrowser,
  feedback: { no: false, yes: false },
  page: flags,
  search: emptySearch,
});
