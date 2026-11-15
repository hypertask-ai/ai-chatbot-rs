import { Subscription } from "foldkit";
import { streamFromEvent } from "foldkit/dom";

import { Message } from "./message.js";
import type { AppMessage } from "./message.js";
import type { AppModel } from "./model.js";

const hostMessages = streamFromEvent({
  mapEvent: (event) =>
    Message.ReceivedHostMessage({
      data: event.data,
      fromParent: event.source === window.parent,
      sameOrigin: event.origin === window.location.origin,
    }),
  target: () => window,
  type: "message",
});

export const subscriptions = Subscription.make<AppModel, AppMessage>()(
  (entry) => ({
    hostMessages: entry(
      {},
      {
        dependenciesToStream: () => hostMessages,
        modelToDependencies: () => ({}),
      }
    ),
  })
);
