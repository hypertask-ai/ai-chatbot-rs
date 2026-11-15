import { Option } from "effect";
import type { Update } from "foldkit";

import {
  BlurSearchInput,
  FocusSearchInput,
  ShowAllArticles,
} from "./command.js";
import { Message } from "./message.js";
import type { AppMessage } from "./message.js";
import type { AppModel } from "./model.js";
import { emptySearch } from "./model.js";

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

export const update = (model: AppModel, message: AppMessage): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    AddressChanged: ({ hash }) => ({ model: openedAtHash(model, hash) }),
    AddressReplaced: () => ({ model }),
    AllArticlesChosen: () => ({
      commands: [ShowAllArticles()],
      model: allArticlesShown(model),
    }),
    ArticleFeedbackGiven: ({ sentiment }) => {
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
    },
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
