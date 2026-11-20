import { Option } from "effect";
import type { Update } from "foldkit";

import {
  BlurSearchInput,
  FocusSearchInput,
  LoadHelpArticle,
  ShowAllArticles,
} from "./command.js";
import { Message } from "./message.js";
import type { AppMessage } from "./message.js";
import type { AppModel } from "./model.js";
import { emptySearch } from "./model.js";
import { readerStep } from "./reader.js";
import type { ReaderEventValue } from "./reader.js";

type UpdateReturn = Update.Return<AppModel, AppMessage>;

const allArticlesShown = (model: AppModel): AppModel => ({
  ...model,
  browser: { category: Option.none(), open: true },
  search: emptySearch,
});

const searchCleared = (model: AppModel): AppModel => ({
  ...model,
  search: emptySearch,
});

const escapePressed = (model: AppModel): UpdateReturn =>
  model.search.input === ""
    ? { commands: [BlurSearchInput()], model }
    : { commands: [FocusSearchInput()], model: searchCleared(model) };

const openedAtHash = (model: AppModel, hash: string): AppModel =>
  hash === "#all"
    ? { ...model, browser: { ...model.browser, open: true } }
    : model;

const settled = (model: AppModel, value: string): UpdateReturn =>
  model.search.query === value
    ? { model }
    : { model: { ...model, search: { ...model.search, query: value } } };

const feedbackGiven = (
  model: AppModel,
  sentiment: "no" | "yes"
): UpdateReturn => {
  const isNo = sentiment === "no";

  return {
    model: {
      ...model,
      feedback: {
        no: model.feedback.no || isNo,
        yes: model.feedback.yes || !isNo,
      },
    },
  };
};

const readerChanged = (
  model: AppModel,
  readerEvent: ReaderEventValue
): UpdateReturn => {
  const step = readerStep(model.reader, readerEvent);
  const next = { ...model, reader: step.phase };
  const { reads } = step;

  return reads === undefined
    ? { model: next }
    : { commands: reads.map((slug) => LoadHelpArticle({ slug })), model: next };
};

export const update = (model: AppModel, message: AppMessage): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    AddressChanged: ({ hash }) => ({ model: openedAtHash(model, hash) }),
    AddressReplaced: () => ({ model }),
    AllArticlesChosen: () => ({
      commands: [ShowAllArticles()],
      model: allArticlesShown(model),
    }),
    ArticleFeedbackGiven: ({ sentiment }) => feedbackGiven(model, sentiment),
    ReaderClosed: (readerEvent) => readerChanged(model, readerEvent),
    ReaderFailed: (readerEvent) => readerChanged(model, readerEvent),
    ReaderLoaded: (readerEvent) => readerChanged(model, readerEvent),
    ReaderOpened: (readerEvent) => readerChanged(model, readerEvent),
    ReaderViewportChanged: (readerEvent) => readerChanged(model, readerEvent),
    SearchCleared: () => ({
      commands: [FocusSearchInput()],
      model: searchCleared(model),
    }),
    SearchEdited: ({ value }) => ({
      model: { ...model, search: { ...model.search, input: value } },
    }),
    SearchInputBlurred: () => ({ model }),
    SearchInputFocused: () => ({ model }),
    SearchKeyPressed: ({ key }) =>
      key === "Escape" ? escapePressed(model) : { model },
    SearchSettled: ({ value }) => settled(model, value),
  });
