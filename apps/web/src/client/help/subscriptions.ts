import { Duration, Effect, Option, Schema, Stream } from "effect";
import { Subscription } from "foldkit";
import {
  streamFromEvent,
  streamFromEventFilterMap,
  streamFromEventFilterMapPreventDefault,
} from "foldkit/dom";

import { chatArticleSlugOf } from "./chat-link.js";
import { Message } from "./message.js";
import type { AppMessage } from "./message.js";
import type { AppModel } from "./model.js";
import { helpArticleSlugOf } from "./reader-link.js";

const settleDelay = Duration.millis(100);

const READER_PANE_MIN_WIDTH = 900;

const READER_AREAS = "#helpMain, #reader";

const settleAfter = (query: string) =>
  Effect.sleep(settleDelay).pipe(
    Effect.as(Message.SearchSettled({ value: query }))
  );

const addressChanges = streamFromEvent({
  mapEvent: () => Message.AddressChanged({ hash: window.location.hash }),
  target: () => window,
  type: "hashchange",
});

const wideNow = (): boolean => window.innerWidth >= READER_PANE_MIN_WIDTH;

const articleSlugAt = (target: EventTarget | null): Option.Option<string> =>
  target instanceof Element
    ? Option.flatMap(Option.fromNullishOr(target.closest("a")), (anchor) =>
        Option.isNone(Option.fromNullishOr(anchor.closest(READER_AREAS)))
          ? Option.none()
          : helpArticleSlugOf(
              {
                href: anchor.getAttribute("href"),
                target: anchor.getAttribute("target"),
              },
              window.location.origin
            )
      )
    : Option.none();

const articleClicks = streamFromEventFilterMapPreventDefault({
  filterMapEvent: (event) =>
    Option.map(articleSlugAt(event.target), (slug) =>
      Message.ReaderOpened({ slug, wide: wideNow() })
    ),
  target: () => document,
  type: "click",
});

const escapePresses = streamFromEventFilterMap({
  filterMapEvent: (event) =>
    event.key === "Escape"
      ? Option.some(Message.ReaderClosed())
      : Option.none(),
  target: () => document,
  type: "keydown",
});

const chatLinks = streamFromEventFilterMap({
  filterMapEvent: (event) =>
    Option.map(chatArticleSlugOf(event, window.location.origin), (slug) =>
      Message.ReaderOpened({ slug, wide: wideNow() })
    ),
  target: () => window,
  type: "message",
});

const viewportChanges = streamFromEvent({
  mapEvent: () => Message.ReaderViewportChanged({ wide: wideNow() }),
  target: () => window,
  type: "resize",
});

export const subscriptions = Subscription.make<AppModel, AppMessage>()(
  (entry) => ({
    addressChanged: entry(
      {},
      {
        dependenciesToStream: () => addressChanges,
        modelToDependencies: () => ({}),
      }
    ),
    articleClicks: entry(
      {},
      {
        dependenciesToStream: () => articleClicks,
        modelToDependencies: () => ({}),
      }
    ),
    chatLinks: entry(
      {},
      {
        dependenciesToStream: () => chatLinks,
        modelToDependencies: () => ({}),
      }
    ),
    escapePresses: entry(
      {},
      {
        dependenciesToStream: () => escapePresses,
        modelToDependencies: () => ({}),
      }
    ),
    searchSettled: entry(
      { query: Schema.String },
      {
        dependenciesToStream: ({ query }) =>
          Stream.fromIterable([query]).pipe(Stream.mapEffect(settleAfter)),
        modelToDependencies: (model) => ({ query: model.search.input }),
      }
    ),
    viewportChanges: entry(
      {},
      {
        dependenciesToStream: () => viewportChanges,
        modelToDependencies: () => ({}),
      }
    ),
  })
);
