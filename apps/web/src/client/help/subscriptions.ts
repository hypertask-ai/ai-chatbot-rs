import { Duration, Effect, Schema, Stream } from "effect";
import { Subscription } from "foldkit";
import { streamFromEvent } from "foldkit/dom";

import { Message } from "./message.js";
import type { AppMessage } from "./message.js";
import type { AppModel } from "./model.js";

const settleDelay = Duration.millis(100);

const settleAfter = (query: string) =>
  Effect.sleep(settleDelay).pipe(
    Effect.as(Message.SearchSettled({ value: query }))
  );

const addressChanges = streamFromEvent({
  mapEvent: () => Message.AddressChanged({ hash: window.location.hash }),
  target: () => window,
  type: "hashchange",
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
    searchSettled: entry(
      { query: Schema.String },
      {
        dependenciesToStream: ({ query }) =>
          Stream.fromIterable([query]).pipe(Stream.mapEffect(settleAfter)),
        modelToDependencies: (model) => ({ query: model.search.input }),
      }
    ),
  })
);
