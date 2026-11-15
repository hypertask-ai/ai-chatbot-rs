import { Schema } from "effect";
import { defineMessageUnion } from "foldkit/message";

export const Message = defineMessageUnion({
  AddressChanged: { hash: Schema.String },
  AddressReplaced: {},
  AllArticlesChosen: {},
  ArticleFeedbackGiven: { sentiment: Schema.Literals(["yes", "no"]) },
  SearchCleared: {},
  SearchEdited: { value: Schema.String },
  SearchInputBlurred: {},
  SearchInputFocused: {},
  SearchKeyPressed: { key: Schema.String },
  SearchSettled: { value: Schema.String },
});

export type AppMessage = typeof Message.Type;
