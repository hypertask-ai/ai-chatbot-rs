import { Schema } from "effect";

export const VisitorQuestionSchema = Schema.Struct({
  conversationId: Schema.NullOr(Schema.String),
  message: Schema.String,
  pageTitle: Schema.optionalKey(Schema.String),
  pageUrl: Schema.optionalKey(Schema.String),
  visitorId: Schema.String,
});

export type VisitorQuestion = typeof VisitorQuestionSchema.Type;
