import { Runtime } from "foldkit";

import { view } from "../features/home/index.js";
import { view as widgetView } from "../features/widget/index.js";
import { widgetChatPath } from "../widget/embed.js";
import { Message, initialModel, Model, update } from "./home/index.js";
import { LoadSession } from "./widget/command.js";
import {
  Flags as WidgetFlags,
  Message as WidgetMessage,
  Model as WidgetModel,
  initialModel as initialWidgetModel,
  subscriptions as widgetSubscriptions,
  update as updateWidget,
} from "./widget/index.js";

import "../features/widget/widget.css";
import "./site.css";

const container = document.querySelector("#root");

const siteApplication = Runtime.makeApplication({
  Model,
  container,
  devTools: import.meta.env.DEV ? { Message } : false,
  init: () => ({ model: initialModel }),
  update,
  view,
});

const widgetApplication = Runtime.makeApplication({
  Flags: WidgetFlags,
  Model: WidgetModel,
  container,
  devTools: import.meta.env.DEV ? { Message: WidgetMessage } : false,
  init: (flags) => ({
    commands: [LoadSession()],
    model: initialWidgetModel(flags),
  }),
  subscriptions: widgetSubscriptions,
  update: updateWidget,
  view: widgetView,
});

if (new URL(window.location.href).pathname === widgetChatPath) {
  Runtime.hydrate(widgetApplication);
} else {
  Runtime.hydrate(siteApplication);
}
