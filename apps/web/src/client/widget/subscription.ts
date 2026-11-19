import { Subscription } from "foldkit";
import { streamFromEvent } from "foldkit/dom";
import type { TypedEventTarget } from "foldkit/dom";

import { Message } from "./message.js";
import type { AppMessage } from "./message.js";
import type { AppModel } from "./model.js";
import { isTrustedParentOrigin } from "./parent-origin.js";

export const widgetMenuEvent = "hypertask-widget-show-menu";

type PageEvents = TypedEventTarget<{ "hypertask-widget-show-menu": Event }>;

const pageEvents = (): PageEvents => window;

const hostMessages = streamFromEvent({
  mapEvent: (event) =>
    Message.ReceivedHostMessage({
      data: event.data,
      sameOrigin: event.origin === window.location.origin,
      trustedParent:
        event.source === window.parent &&
        isTrustedParentOrigin(event.origin, window.location.origin),
    }),
  target: () => window,
  type: "message",
});

const menuRequests = streamFromEvent({
  mapEvent: () => Message.OpenedMenu(),
  target: pageEvents,
  type: widgetMenuEvent,
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
    menuRequests: entry(
      {},
      {
        dependenciesToStream: () => menuRequests,
        modelToDependencies: () => ({}),
      }
    ),
  })
);
