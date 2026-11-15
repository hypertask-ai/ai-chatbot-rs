import { Schema } from "effect";

export const HelpArticleNotFound = Schema.Struct({
  error: Schema.Literal("Article not found"),
}).annotate({ httpApiStatus: 404 });
