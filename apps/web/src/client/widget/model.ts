import { Option, Schema } from "effect";

import { VisitorQuestionSchema } from "../../widget/answer-seam.js";
import type { VisitorQuestion } from "../../widget/answer-seam.js";
import { ChatSession } from "../../widget/chat-sessions.js";
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

export const Menu = Schema.Struct({
  kind: Schema.Literals(["closed", "failed", "loading", "ready"]),
  now: Schema.Number,
  rows: Schema.Array(ChatSession),
});

export type MenuValue = typeof Menu.Type;

export const PastChatPick = Schema.Struct({
  sessionId: Schema.String,
  status: Schema.String,
});

export type PastChatPickValue = typeof PastChatPick.Type;

export const Model = Schema.Struct({
  attachment: Schema.Option(Schema.String),
  conversationId: Schema.String,
  docked: Schema.Boolean,
  input: Schema.String,
  lightbox: Schema.Option(Schema.String),
  menu: Menu,
  messages: Schema.Array(TranscriptEntry),
  pageTitle: Schema.String,
  pageUrl: Schema.String,
  pastChat: Schema.Boolean,
  pendingQuestion: Schema.Option(VisitorQuestionSchema),
  pinned: Schema.Boolean,
  readOnly: Schema.Boolean,
  selection: Schema.Option(PastChatPick),
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
  menu: { kind: "closed", now: 0, rows: [] },
  messages: [],
  pageTitle: flags.pageTitle,
  pageUrl: flags.pageUrl,
  pastChat: false,
  pendingQuestion: Option.none(),
  pinned: flags.pinned,
  readOnly: false,
  selection: Option.none(),
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
