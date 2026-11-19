import { Option, Schema } from "effect";

import { VisitorQuestionSchema } from "../../widget/answer-seam.js";
import type { VisitorQuestion } from "../../widget/answer-seam.js";
import { starterSuggestions } from "../../widget/suggestions.js";

export const TranscriptEntry = Schema.Struct({
  content: Schema.String,
  imageUrl: Schema.Option(Schema.String),
  role: Schema.Literals(["admin", "bot", "user"]),
});

export type TranscriptEntryValue = typeof TranscriptEntry.Type;

export const Flags = Schema.Struct({
  docked: Schema.Boolean,
  pageTitle: Schema.String,
  pageUrl: Schema.String,
  pinned: Schema.Boolean,
});

export type WidgetFlags = typeof Flags.Type;

export const Model = Schema.Struct({
  attachment: Schema.Option(Schema.String),
  conversationId: Schema.String,
  docked: Schema.Boolean,
  input: Schema.String,
  lightbox: Schema.Option(Schema.String),
  messages: Schema.Array(TranscriptEntry),
  pageTitle: Schema.String,
  pageUrl: Schema.String,
  pendingQuestion: Schema.Option(VisitorQuestionSchema),
  pinned: Schema.Boolean,
  sheet: Schema.Boolean,
  suggestions: Schema.Array(Schema.String),
  suggestionsHidden: Schema.Boolean,
  visitorId: Schema.String,
  visitorSecret: Schema.String,
});

export type AppModel = typeof Model.Type;

export const initialModel = (flags: WidgetFlags): AppModel => ({
  attachment: Option.none(),
  conversationId: "",
  docked: flags.docked,
  input: "",
  lightbox: Option.none(),
  messages: [],
  pageTitle: flags.pageTitle,
  pageUrl: flags.pageUrl,
  pendingQuestion: Option.none(),
  pinned: flags.pinned,
  sheet: false,
  suggestions: [...starterSuggestions],
  suggestionsHidden: false,
  visitorId: "",
  visitorSecret: "",
});

export const askOf = (model: AppModel, message: string): VisitorQuestion => {
  const question = {
    conversationId: model.conversationId === "" ? null : model.conversationId,
    message,
    visitorId: model.visitorId,
  };

  return model.pageUrl === ""
    ? question
    : {
        ...question,
        pageTitle: model.pageTitle,
        pageUrl: model.pageUrl,
      };
};
