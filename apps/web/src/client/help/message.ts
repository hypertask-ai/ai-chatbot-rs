import { Schema } from "effect";
import { defineMessageUnion } from "foldkit/message";

export const Message = defineMessageUnion({
  ArticleFeedbackGiven: { sentiment: Schema.Literals(["yes", "no"]) },
});

export type AppMessage = typeof Message.Type;
