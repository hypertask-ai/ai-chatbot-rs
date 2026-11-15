import { runInNewContext } from "node:vm";

export interface FakeEvent {
  readonly data?: unknown;
  readonly origin?: string;
  readonly stopPropagation?: () => void;
}

type Listener = (event: FakeEvent) => void;

type HistoryState = Readonly<Record<string, string>>;

export type PostedMessage = Readonly<{
  conversationId?: string;
  dataUrl?: string;
  docked?: boolean;
  expanded?: boolean;
  isMobile?: boolean;
  message?: string;
  pageTitle?: string;
  pageUrl?: string;
  pinned?: boolean;
  type?: string;
  visitorId?: string;
  visitorSecret?: string;
}>;

interface FakeStyle {
  background?: string;
  boxShadow?: string;
  color?: string;
  cssText?: string;
  display?: string;
  height?: string;
  left?: string;
  overflow?: string;
  position?: string;
  right?: string;
  setProperty?: (name: string, value: string) => void;
  top?: string;
  transform?: string;
  width?: string;
}

export interface FakeElement {
  addEventListener: (type: string, listener: Listener) => void;
  appendChild: (child: FakeElement) => void;
  attributes: Map<string, string>;
  children: FakeElement[];
  classes: Set<string>;
  classList: {
    add: (name: string) => void;
    contains: (name: string) => boolean;
    remove: (name: string) => void;
    toggle: (name: string, force?: boolean) => void;
  };
  contentWindow?: {
    postMessage: (message: PostedMessage) => void;
  };
  getAttribute: (name: string) => string | null;
  handlers: Map<string, Listener>;
  id: string;
  innerHTML: string;
  messages: PostedMessage[];
  parentElement: FakeElement | null;
  querySelector: (selector: string) => FakeElement;
  removeChild: (child: FakeElement) => void;
  selectors: Map<string, FakeElement>;
  setAttribute: (name: string, value: string) => void;
  src?: string;
  style: FakeStyle;
  tag: string;
  variables: Map<string, string>;
}

export type LoaderRun = Readonly<{
  document: {
    body: FakeElement;
    documentElement: FakeElement;
    head: FakeElement;
  };
  elements: Map<string, FakeElement>;
  events: Map<string, Listener[]>;
  frames: FakeElement[];
  history: {
    calls: string[];
    pushState: (state: HistoryState, title: string, url: string) => void;
    replaceState: (state: HistoryState, title: string, url: string) => void;
  };
  mount: FakeElement | null;
  scrolls: [number, number][];
  storage: Map<string, string>;
  storageCalls: [string, string][];
  timers: (() => void)[];
}>;

export type LoaderOptions = Readonly<{
  article?: boolean;
  dock?: boolean;
  height?: number;
  pinned?: boolean;
  stored?: Readonly<Record<string, string>>;
  width?: number;
}>;

const makeElement = (tag: string, elements: Map<string, FakeElement>) => {
  const element: FakeElement = {
    addEventListener(type, listener) {
      element.handlers.set(type, listener);
    },
    appendChild(child) {
      if (child.parentElement !== null) {
        const { children: siblings } = child.parentElement;
        siblings.splice(siblings.indexOf(child), 1);
      }

      element.children.push(child);
      child.parentElement = element;

      if (child.id !== "") {
        elements.set(child.id, child);
      }
    },
    attributes: new Map(),
    children: [],
    classList: {
      add: (name) => element.classes.add(name),
      contains: (name) => element.classes.has(name),
      remove: (name) => element.classes.delete(name),
      toggle: (name, force) => {
        const next = force ?? !element.classes.has(name);

        if (next) {
          element.classes.add(name);
        } else {
          element.classes.delete(name);
        }
      },
    },
    classes: new Set(),
    getAttribute: (name) => element.attributes.get(name) ?? null,
    handlers: new Map(),
    id: "",
    innerHTML: "",
    messages: [],
    parentElement: null,
    querySelector: (selector) => {
      const existing = element.selectors.get(selector);

      if (existing !== undefined) {
        return existing;
      }

      const created = makeElement("button", elements);
      element.selectors.set(selector, created);

      return created;
    },
    removeChild(child) {
      const index = element.children.indexOf(child);

      if (index !== -1) {
        element.children.splice(index, 1);
      }

      child.parentElement = null;

      if (child.id !== "") {
        elements.delete(child.id);
      }
    },
    selectors: new Map(),
    setAttribute(name, value) {
      element.attributes.set(name, value);
    },
    style: {},
    tag,
    variables: new Map(),
  };

  Object.defineProperty(element, "id", {
    get: () => element.attributes.get("id") ?? "",
    set: (value: string) => {
      element.attributes.set("id", value);
      elements.set(value, element);
    },
  });

  for (const type of ["click", "load", "mouseout", "mouseover"]) {
    Object.defineProperty(element, `on${type}`, {
      get: () => element.handlers.get(type),
      set(listener: Listener) {
        element.handlers.set(type, listener);
      },
    });
  }

  if (tag === "iframe") {
    element.contentWindow = {
      postMessage(message) {
        element.messages.push(message);
      },
    };
  }

  if (tag === "html") {
    element.style.setProperty = (name, value) => {
      element.variables.set(name, value);
    };
  }

  return element;
};

export const runWidgetLoader = (
  script: string,
  options: LoaderOptions = {}
): LoaderRun => {
  const elements = new Map<string, FakeElement>();
  const storage = new Map(Object.entries(options.stored ?? {}));
  const storageCalls: [string, string][] = [];
  const events = new Map<string, Listener[]>();
  const frames: FakeElement[] = [];
  const timers: (() => void)[] = [];
  const scrolls: [number, number][] = [];
  const historyCalls: string[] = [];
  const body = makeElement("body", elements);
  const head = makeElement("head", elements);
  const documentElement = makeElement("html", elements);
  const mount = options.pinned === true ? makeElement("div", elements) : null;

  const location = {
    href: "https://host.test/",
    pathname:
      options.article === true
        ? "/help/troubleshooting-email-login-magic-link"
        : "/",
  };

  const window = {
    addEventListener(type: string, listener: Listener) {
      const existing = events.get(type) ?? [];
      events.set(type, [...existing, listener]);
    },
    innerHeight: options.height ?? 900,
    innerWidth: options.width ?? 1280,
    location,
    pageYOffset: 0,
    scrollTo(x: number, y: number) {
      scrolls.push([x, y]);
    },
  };

  const document = {
    body,
    createElement(tag: string) {
      const element = makeElement(tag, elements);

      if (tag === "iframe") {
        frames.push(element);
      }

      return element;
    },
    currentScript: {
      getAttribute: () => (options.dock === true ? "docked" : null),
    },
    documentElement,
    getElementById: (id: string) =>
      id === "help-chat-mount" ? mount : (elements.get(id) ?? null),
    head,
    title: "Host page",
  };

  const localStorage = {
    getItem: (key: string) => {
      storageCalls.push(["getItem", key]);

      return storage.get(key) ?? null;
    },
    removeItem: (key: string) => {
      storageCalls.push(["removeItem", key]);
      storage.delete(key);
    },
    setItem: (key: string, value: string) => {
      storageCalls.push(["setItem", key]);
      storage.set(key, value);
    },
  };

  const history = {
    calls: historyCalls,
    pushState(_state: HistoryState, _title: string, url: string) {
      historyCalls.push(url);
    },
    replaceState(_state: HistoryState, _title: string, url: string) {
      historyCalls.push(url);
    },
  };

  runInNewContext(script, {
    document,
    encodeURIComponent,
    history,
    localStorage,
    location,
    setTimeout: (listener: () => void) => {
      timers.push(listener);

      return timers.length;
    },
    window,
  });

  return {
    document: { body, documentElement, head },
    elements,
    events,
    frames,
    history,
    mount,
    scrolls,
    storage,
    storageCalls,
    timers,
  };
};

export const displayOf = (element: FakeElement): string | undefined => {
  const direct = element.style.display;

  if (direct !== undefined) {
    return direct;
  }

  const { cssText } = element.style;

  if (cssText === undefined) {
    return undefined;
  }

  return /display:(?<value>[^;]+);?/u.exec(cssText)?.groups?.["value"];
};

export const handler = (
  element: FakeElement,
  type: string
): ((event?: FakeEvent) => void) => {
  const listener = element.handlers.get(type);

  if (listener === undefined) {
    throw new Error(`the loader did not register an ${type} handler`);
  }

  return (event?: FakeEvent): void => {
    listener(event ?? {});
  };
};

export const postToHost = (run: LoaderRun, event: FakeEvent): void => {
  for (const listener of run.events.get("message") ?? []) {
    listener(event);
  }
};
