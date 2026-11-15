import { Effect } from "effect";
import { Command } from "foldkit";

import { Message } from "./message.js";

export const BlurSearchInput = Command.define("BlurSearchInput", {
  execute: Effect.sync(() => {
    document.querySelector<HTMLElement>("#searchInput")?.blur();

    return Message.SearchInputBlurred();
  }),
  messages: [Message.SearchInputBlurred],
});

export const FocusSearchInput = Command.define("FocusSearchInput", {
  execute: Effect.sync(() => {
    document.querySelector<HTMLElement>("#searchInput")?.focus();

    return Message.SearchInputFocused();
  }),
  messages: [Message.SearchInputFocused],
});

export const ShowAllArticles = Command.define("ShowAllArticles", {
  execute: Effect.sync(() => {
    window.history.replaceState(null, "", `${window.location.pathname}#all`);

    return Message.AddressReplaced();
  }),
  messages: [Message.AddressReplaced],
});
