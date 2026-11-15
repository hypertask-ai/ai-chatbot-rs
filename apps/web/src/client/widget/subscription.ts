import { Subscription } from "foldkit";
import { streamFromEvent } from "foldkit/dom";

import { isTrustedParentOrigin } from "../../widget/parent-origin.js";
import { Message } from "./message.js";
import type { AppMessage } from "./message.js";
import type { AppModel } from "./model.js";

const hostMessages = streamFromEvent({
  mapEvent: (event) =>
    Message.ReceivedHostMessage({
      data: event.data,
      trustedParent:
        event.source === window.parent &&
        isTrustedParentOrigin(event.origin, window.location.origin),
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
