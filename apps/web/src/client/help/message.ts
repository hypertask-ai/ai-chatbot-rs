import { Schema } from "effect";
import { defineMessageUnion } from "foldkit/message";

import { readerMessageCases } from "./reader.js";

export const Message = defineMessageUnion({
  ArticleFeedbackGiven: { sentiment: Schema.Literals(["yes", "no"]) },
  ...readerMessageCases,
});

export type AppMessage = typeof Message.Type;
