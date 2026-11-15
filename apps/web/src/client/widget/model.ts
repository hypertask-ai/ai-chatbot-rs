import { Option, Schema } from "effect";

import { VisitorQuestionSchema } from "../../widget/answer-seam.js";
import type { VisitorQuestion } from "../../widget/answer-seam.js";
import { starterSuggestions } from "../../widget/suggestions.js";

export const SourceLineSchema = Schema.Struct({
  href: Schema.String,
  label: Schema.String,
  slug: Schema.String,
});

export const TranscriptEntry = Schema.Struct({
  content: Schema.String,
  imageUrl: Schema.Option(Schema.String),
  role: Schema.Literals(["admin", "bot", "user"]),
  sourceLine: Schema.optionalKey(SourceLineSchema),
});

export type TranscriptEntryValue = typeof TranscriptEntry.Type;

export const Flags = Schema.Struct({
  docked: Schema.Boolean,
  onHelpPage: Schema.Boolean,
  pageTitle: Schema.String,
  pageUrl: Schema.String,
  pinned: Schema.Boolean,
});

export type WidgetFlags = typeof Flags.Type;

export const HandoffEmailCardSchema = Schema.Struct({
  email: Schema.String,
});

export type HandoffEmailCardValue = typeof HandoffEmailCardSchema.Type;

export const HandoffEmailRequestSchema = Schema.Struct({
  conversationId: Schema.String,
  email: Schema.String,
});

export type HandoffEmailRequest = typeof HandoffEmailRequestSchema.Type;

export const Model = Schema.Struct({
  answerRowAfter: Schema.Option(Schema.Number),
  attachment: Schema.Option(Schema.String),
  conversationId: Schema.String,
  docked: Schema.Boolean,
  handoffEmailCard: Schema.Option(HandoffEmailCardSchema),
  handoffEmailError: Schema.Option(Schema.String),
  input: Schema.String,
  lightbox: Schema.Option(Schema.String),
  messages: Schema.Array(TranscriptEntry),
  onHelpPage: Schema.Boolean,
  pageTitle: Schema.String,
  pageUrl: Schema.String,
  pendingHandoffEmail: Schema.Option(HandoffEmailRequestSchema),
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
  answerRowAfter: Option.none(),
  attachment: Option.none(),
  conversationId: "",
  docked: flags.docked,
  handoffEmailCard: Option.none(),
  handoffEmailError: Option.none(),
  input: "",
  lightbox: Option.none(),
  messages: [],
  onHelpPage: flags.onHelpPage,
  pageTitle: flags.pageTitle,
  pageUrl: flags.pageUrl,
  pendingHandoffEmail: Option.none(),
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
