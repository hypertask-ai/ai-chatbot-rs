import { Option, Schema } from "effect";
import type { Update } from "foldkit";

import type {
  ChatLineValue,
  ChatSessionValue,
} from "../../widget/chat-sessions.js";
import { widgetCopy } from "../../widget/copy.js";
import { starterSuggestions } from "../../widget/suggestions.js";
import {
  PublishSession,
  ReadAttachment,
  RequestHostClose,
  ScrollToLatest,
  StoreSession,
  SyncChrome,
} from "./command.js";
import { HostMessage, Message } from "./message.js";
import type { AppMessage, HostMessageValue } from "./message.js";
import { askOf } from "./model.js";
import type { AppModel, MenuValue } from "./model.js";

type UpdateReturn = Update.Return<AppModel, AppMessage>;

type BootMessage = Extract<HostMessageValue, { type: "chat-widget-boot" }>;

const syncChrome = (model: AppModel) => [
  SyncChrome({
    docked: model.docked,
    pinned: model.pinned,
    sheet: model.sheet,
  }),
];

const withSheet = (
  model: AppModel,
  pinned: boolean,
  docked: boolean,
  isMobile: boolean
): AppModel => ({
  ...model,
  docked,
  pinned,
  sheet: isMobile && !pinned && !docked,
});

const appendBot = (model: AppModel, content: string): UpdateReturn => ({
  model: {
    ...model,
    messages: [
      ...model.messages,
      { content, imageUrl: Option.none(), role: "bot" },
    ],
  },
});

const submit = (model: AppModel, text: string): UpdateReturn => {
  const message = text.trim();

  if (message === "" && Option.isNone(model.attachment)) {
    return { model };
  }

  return {
    commands: [ScrollToLatest()],
    model: {
      ...model,
      attachment: Option.none(),
      input: "",
      messages: [
        ...model.messages,
        { content: message, imageUrl: model.attachment, role: "user" },
      ],
      pendingQuestion: Option.some(askOf(model, message)),
      suggestionsHidden: true,
    },
  };
};

const onOpened = (
  model: AppModel,
  isMobile: boolean | undefined
): UpdateReturn => {
  const next = withSheet(model, model.pinned, model.docked, isMobile ?? false);

  return { commands: syncChrome(next), model: next };
};

const onPinned = (
  model: AppModel,
  isMobile: boolean | undefined,
  pinned: boolean | undefined,
  docked: boolean | undefined
): UpdateReturn => {
  const next = withSheet(
    model,
    pinned ?? model.pinned,
    docked ?? model.docked,
    isMobile ?? false
  );

  return { commands: syncChrome(next), model: next };
};

const onDocked = (
  model: AppModel,
  isMobile: boolean | undefined,
  docked: boolean | undefined
): UpdateReturn => {
  const next = withSheet(
    model,
    model.pinned,
    docked ?? model.docked,
    isMobile ?? false
  );

  return { commands: syncChrome(next), model: next };
};

const onMobile = (
  model: AppModel,
  isMobile: boolean | undefined
): UpdateReturn => {
  const next = withSheet(model, model.pinned, model.docked, isMobile ?? false);

  return { commands: syncChrome(next), model: next };
};

const onPage = (
  model: AppModel,
  fromParent: boolean,
  pageTitle: string | undefined,
  pageUrl: string | undefined
): UpdateReturn =>
  fromParent
    ? {
        model: {
          ...model,
          pageTitle: (pageTitle ?? "").slice(0, 200),
          pageUrl: (pageUrl ?? "").slice(0, 500),
        },
      }
    : { model };

const onBoot = (
  model: AppModel,
  fromParent: boolean,
  host: BootMessage
): UpdateReturn => {
  if (!fromParent) {
    return { model };
  }

  const conversationId =
    model.conversationId === ""
      ? (host.conversationId ?? "")
      : model.conversationId;

  const visitorId =
    model.visitorId === "" ? (host.visitorId ?? "") : model.visitorId;

  const visitorSecret =
    model.visitorSecret === ""
      ? (host.visitorSecret ?? "")
      : model.visitorSecret;

  const docked = host.docked ?? model.docked;
  const described = host.pageUrl !== undefined && host.pageUrl !== "";
  const pageUrl = described ? host.pageUrl.slice(0, 500) : model.pageUrl;

  const pageTitle = described
    ? (host.pageTitle ?? "").slice(0, 200)
    : model.pageTitle;

  const next = {
    ...withSheet(model, model.pinned, docked, host.isMobile ?? false),
    conversationId,
    pageTitle,
    pageUrl,
    visitorId,
    visitorSecret,
  };

  return {
    commands: [
      StoreSession({ conversationId, visitorId, visitorSecret }),
      ...syncChrome(next),
    ],
    model: next,
  };
};

const onAttachment = (
  model: AppModel,
  fromParent: boolean,
  sameOrigin: boolean,
  dataUrl: string | undefined
): UpdateReturn =>
  fromParent &&
  sameOrigin &&
  dataUrl !== undefined &&
  dataUrl.startsWith("data:image/")
    ? { model: { ...model, attachment: Option.some(dataUrl) } }
    : { model };

const onViewportFit = (model: AppModel): UpdateReturn => ({
  commands: syncChrome(model),
  model,
});

const openedMenu = (model: AppModel): UpdateReturn => ({
  model: {
    ...model,
    menu: { ...model.menu, kind: "loading" },
  },
});

const menuReadKind = (model: AppModel, kind: MenuValue["kind"]) =>
  model.menu.kind === "closed" ? "closed" : kind;

const loadedMenuSessions = (
  model: AppModel,
  sessions: readonly ChatSessionValue[],
  nowMillis: number
): UpdateReturn => ({
  model: {
    ...model,
    menu: {
      kind: menuReadKind(model, "ready"),
      now: nowMillis,
      rows: sessions,
    },
  },
});

const rejectedMenuSessions = (model: AppModel): UpdateReturn => ({
  model: {
    ...model,
    menu: { ...model.menu, kind: menuReadKind(model, "failed") },
  },
});

const pickedMenuSession = (
  model: AppModel,
  sessionId: string,
  status: string
): UpdateReturn => ({
  model: {
    ...model,
    selection: Option.some({ sessionId, status }),
  },
});

const loadedPastChat = (
  model: AppModel,
  messages: readonly ChatLineValue[]
): UpdateReturn => {
  if (Option.isNone(model.selection)) {
    return { model };
  }

  const { sessionId, status } = model.selection.value;
  const isCurrent = model.conversationId === sessionId;
  const resuming = !isCurrent && status !== "closed";
  const conversationId = resuming ? sessionId : model.conversationId;

  return {
    commands: [
      ...(resuming
        ? [
            StoreSession({
              conversationId,
              visitorId: model.visitorId,
              visitorSecret: model.visitorSecret,
            }),
          ]
        : []),
      ...(messages.length > 0 ? [ScrollToLatest()] : []),
    ],
    model: {
      ...model,
      conversationId,
      menu: { ...model.menu, kind: "closed" },
      messages: messages.map((line) => ({
        content: line.content,
        imageUrl: Option.none(),
        role: line.role,
      })),
      pastChat: true,
      readOnly: status === "closed",
      selection: Option.none(),
      suggestionsHidden: model.suggestionsHidden || messages.length > 0,
    },
  };
};

const startedNewConversation = (model: AppModel): UpdateReturn => ({
  commands: [
    StoreSession({
      conversationId: "",
      visitorId: model.visitorId,
      visitorSecret: model.visitorSecret,
    }),
  ],
  model: {
    ...model,
    attachment: Option.none(),
    conversationId: "",
    menu: { ...model.menu, kind: "closed" },
    messages: [],
    pastChat: false,
    pendingQuestion: Option.none(),
    readOnly: false,
    selection: Option.none(),
    suggestions: [...starterSuggestions],
    suggestionsHidden: false,
  },
});

const hostUpdate = (
  model: AppModel,
  host: HostMessageValue,
  fromParent: boolean,
  sameOrigin: boolean
): UpdateReturn => {
  switch (host.type) {
    case "chat-widget-opened": {
      return onOpened(model, host.isMobile);
    }

    case "chat-widget-pinned": {
      return onPinned(model, host.isMobile, host.pinned, host.docked);
    }

    case "chat-widget-docked": {
      return onDocked(model, host.isMobile, host.docked);
    }

    case "chat-widget-mobile-changed": {
      return onMobile(model, host.isMobile);
    }

    case "chat-widget-page": {
      return onPage(model, fromParent, host.pageTitle, host.pageUrl);
    }

    case "chat-widget-boot": {
      return onBoot(model, fromParent, host);
    }

    case "chat-viewport-fit": {
      return onViewportFit(model);
    }

    case "help-attachment": {
      return onAttachment(model, fromParent, sameOrigin, host.dataUrl);
    }

    case "send-suggestion": {
      return host.message === undefined || host.message === ""
        ? { model }
        : submit(model, host.message);
    }

    default: {
      return { model };
    }
  }
};

export const update = (model: AppModel, message: AppMessage): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    AttachedImage: ({ dataUrl }) => ({
      model: { ...model, attachment: Option.some(dataUrl) },
    }),
    ChangedInput: ({ value }) => ({ model: { ...model, input: value } }),
    ClosedLightbox: () => ({ model: { ...model, lightbox: Option.none() } }),
    ClosedPanel: () => ({ commands: [RequestHostClose()], model }),
    CompletedHostClose: () => ({ model }),
    CompletedPublishSession: () => ({ model }),
    CompletedScrollToLatest: () => ({ model }),
    CompletedStoreSession: () => ({ model }),
    CompletedSyncChrome: () => ({ model }),
    LoadedMenuSessions: ({ now, sessions }) =>
      loadedMenuSessions(model, sessions, now),
    LoadedPastChat: ({ messages }) => loadedPastChat(model, messages),
    LoadedSession: ({ conversationId, sheet, visitorId, visitorSecret }) => {
      const next = {
        ...model,
        conversationId,
        sheet,
        visitorId,
        visitorSecret,
      };

      return {
        commands: [
          PublishSession({ conversationId, visitorId, visitorSecret }),
          ...syncChrome(next),
        ],
        model: next,
      };
    },
    OpenedLightbox: ({ dataUrl }) => ({
      model: { ...model, lightbox: Option.some(dataUrl) },
    }),
    OpenedMenu: () => openedMenu(model),
    PickedMenuSession: ({ sessionId, status }) =>
      pickedMenuSession(model, sessionId, status),
    PickedSuggestion: ({ text }) => submit({ ...model, input: text }, text),
    ReceivedHostMessage: ({ data, fromParent, sameOrigin }) => {
      const host = Schema.decodeUnknownOption(HostMessage)(data);

      return Option.isNone(host)
        ? { model }
        : hostUpdate(model, host.value, fromParent, sameOrigin);
    },
    RejectedAttachment: () => appendBot(model, widgetCopy.attachmentRejected),
    RejectedMenuSessions: () => rejectedMenuSessions(model),
    RemovedAttachment: () => ({
      model: { ...model, attachment: Option.none() },
    }),
    StartedNewConversation: () => startedNewConversation(model),
    Submitted: () => submit(model, model.input),
    TookFile: ({ file }) =>
      file.type.startsWith("image/")
        ? { commands: [ReadAttachment({ file })], model }
        : appendBot(model, widgetCopy.attachmentRejected),
  });
