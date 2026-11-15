import { Runtime } from "foldkit";

import { view } from "../features/help/index.js";
import {
  Flags,
  Message,
  Model,
  initialModelAtAddress,
  subscriptions,
  update,
} from "./help/index.js";

import "../features/help/help.css";
import "./site.css";

const application = Runtime.makeApplication({
  Flags,
  Model,
  container: document.querySelector("#root"),
  devTools: import.meta.env.DEV ? { Message } : false,
  init: (flags) => ({
    model: initialModelAtAddress(flags, {
      hash: window.location.hash,
      search: window.location.search,
    }),
  }),
  subscriptions,
  update,
  view,
});

Runtime.hydrate(application);
