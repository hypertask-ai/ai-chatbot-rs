import { Option, Schema } from "effect";
import type { Update } from "foldkit";

import {
  answerActionsCopy,
  answerRowAfter,
} from "../../widget/answer-actions.js";
import type {
  ChatLineValue,
  ChatSessionValue,
} from "../../widget/chat-sessions.js";
import { widgetCopy } from "../../widget/copy.js";
import {
  emailCardCopy,
  emailProblem,
  emailSentMessage,
} from "../../widget/email-card.js";
import { sourceLineFor } from "../../widget/source-line.js";
import { starterSuggestions } from "../../widget/suggestions.js";
import {
  OpenCitedArticle,
  PublishSession,
  ReadAttachment,
  ReportEmailValidity,
  RequestHostClose,
  ScrollToLatest,
  StoreSession,
  SyncChrome,
} from "./command.js";
import { HostMessage, Message } from "./message.js";
import type { AppMessage, HostMessageValue } from "./message.js";
import { askOf } from "./model.js";
import type { AppModel, MenuValue, TranscriptEntryValue } from "./model.js";

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
      answerRowAfter: Option.none(),
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
  trustedParent: boolean,
  pageTitle: string | undefined,
  pageUrl: string | undefined
): UpdateReturn =>
  trustedParent
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
  trustedParent: boolean,
  host: BootMessage
): UpdateReturn => {
  if (!trustedParent) {
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
      StoreSession({ conversationId, visitorId }),
      ...syncChrome(next),
    ],
    model: next,
  };
};

const onAttachment = (
  model: AppModel,
  trustedParent: boolean,
  sameOrigin: boolean,
  dataUrl: string | undefined
): UpdateReturn =>
  trustedParent &&
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
            }),
          ]
        : []),
      ...(messages.length > 0 ? [ScrollToLatest()] : []),
    ],
    model: {
      ...model,
      answerRowAfter: Option.none(),
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
    }),
  ],
  model: {
    ...model,
    answerRowAfter: Option.none(),
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
  trustedParent: boolean,
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
      return onPage(model, trustedParent, host.pageTitle, host.pageUrl);
    }

    case "chat-widget-boot": {
      return onBoot(model, trustedParent, host);
    }

    case "chat-viewport-fit": {
      return onViewportFit(model);
    }

    case "help-attachment": {
      return onAttachment(model, trustedParent, sameOrigin, host.dataUrl);
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
    AcceptedAnswer: () => {
      const thanks: AppModel = {
        ...model,
        answerRowAfter: Option.none(),
        messages: [
          ...model.messages,
          {
            content: answerActionsCopy.thanks,
            imageUrl: Option.none(),
            role: "bot",
          },
        ],
      };

      return { commands: [ScrollToLatest()], model: thanks };
    },
    AskedForPerson: () => {
      const cleared = { ...model, answerRowAfter: Option.none() };

      if (model.conversationId === "") {
        return { model: cleared };
      }

      const next: AppModel = {
        ...cleared,
        handoffEmailCard: Option.some({ email: "" }),
        messages: [
          ...model.messages,
          {
            content: answerActionsCopy.person,
            imageUrl: Option.none(),
            role: "user",
          },
          {
            content: answerActionsCopy.handoffIntro,
            imageUrl: Option.none(),
            role: "bot",
          },
        ],
      };

      return { commands: [ScrollToLatest()], model: next };
    },
    AttachedImage: ({ dataUrl }) => ({
      model: { ...model, attachment: Option.some(dataUrl) },
    }),
    ChangedHandoffEmail: ({ value }) =>
      Option.isNone(model.handoffEmailCard)
        ? { model }
        : {
            commands: [ReportEmailValidity({ problem: Option.none() })],
            model: {
              ...model,
              handoffEmailCard: Option.some({ email: value }),
            },
          },
    ChangedInput: ({ value }) => ({ model: { ...model, input: value } }),
    ClosedLightbox: () => ({ model: { ...model, lightbox: Option.none() } }),
    ClosedPanel: () => ({ commands: [RequestHostClose()], model }),
    CompletedEmailValidityCheck: () => ({ model }),
    CompletedHostClose: () => ({ model }),
    CompletedOpenCitedArticle: () => ({ model }),
    CompletedPublishSession: () => ({ model }),
    CompletedScrollToLatest: () => ({ model }),
    CompletedStoreSession: () => ({ model }),
    CompletedSyncChrome: () => ({ model }),
    HandoffEmailFailed: () => ({
      model: {
        ...model,
        handoffEmailError: Option.some(emailCardCopy.failed),
        pendingHandoffEmail: Option.none(),
      },
    }),
    HandoffEmailSent: ({ emailed }) =>
      Option.match(model.handoffEmailCard, {
        onNone: () => ({ model }),
        onSome: (card) => {
          const messages: readonly TranscriptEntryValue[] = [
            ...model.messages,
            {
              content: emailSentMessage(card.email.trim(), emailed),
              imageUrl: Option.none(),
              role: "bot",
            },
          ];

          return {
            commands: [ScrollToLatest()],
            model: {
              ...model,
              handoffEmailCard: Option.none(),
              handoffEmailError: Option.none(),
              messages,
              pendingHandoffEmail: Option.none(),
            },
          };
        },
      }),
    LoadedMenuSessions: ({ now, sessions }) =>
      loadedMenuSessions(model, sessions, now),
    LoadedPastChat: ({ messages }) => loadedPastChat(model, messages),
    LoadedSession: ({ conversationId, sheet, visitorId }) => {
      const next = {
        ...model,
        conversationId,
        sheet,
        visitorId,
      };

      return {
        commands: [
          PublishSession({ conversationId, visitorId }),
          ...syncChrome(next),
        ],
        model: next,
      };
    },
    OpenedCitedArticle: ({ slug }) => ({
      commands: [
        OpenCitedArticle({ onHelpPage: model.onHelpPage, slug }),
        ...(model.onHelpPage && !model.pinned ? [RequestHostClose()] : []),
      ],
      model,
    }),
    OpenedLightbox: ({ dataUrl }) => ({
      model: { ...model, lightbox: Option.some(dataUrl) },
    }),
    OpenedMenu: () => openedMenu(model),
    PickedMenuSession: ({ sessionId, status }) =>
      pickedMenuSession(model, sessionId, status),
    PickedSuggestion: ({ text }) => submit({ ...model, input: text }, text),
    ReceivedAnswer: ({ answer, sources }) => {
      if (answer.trim() === "") {
        return { model };
      }

      const sourceLine = sourceLineFor(answer, sources);

      const entry: TranscriptEntryValue = {
        content: answer,
        imageUrl: Option.none(),
        role: "bot",
      };

      const messages: readonly TranscriptEntryValue[] = [
        ...model.messages,
        sourceLine === undefined ? entry : { ...entry, sourceLine },
      ];

      const placement = answerRowAfter(messages.length);

      return {
        commands: [ScrollToLatest()],
        model: {
          ...model,
          answerRowAfter:
            placement === null ? Option.none() : Option.some(placement),
          messages,
        },
      };
    },
    ReceivedHostMessage: ({ data, trustedParent, sameOrigin }) => {
      const host = Schema.decodeUnknownOption(HostMessage)(data);

      return Option.isNone(host)
        ? { model }
        : hostUpdate(model, host.value, trustedParent, sameOrigin);
    },
    RejectedAttachment: () => appendBot(model, widgetCopy.attachmentRejected),
    RejectedMenuSessions: () => rejectedMenuSessions(model),
    RemovedAttachment: () => ({
      model: { ...model, attachment: Option.none() },
    }),
    StartedNewConversation: () => startedNewConversation(model),
    Submitted: () => submit(model, model.input),
    SubmittedHandoffEmail: () =>
      Option.match(model.handoffEmailCard, {
        onNone: () => ({ model }),
        onSome: (card) => {
          const email = card.email.trim();
          const problem = emailProblem(email);

          if (problem !== null) {
            return {
              commands: [
                ReportEmailValidity({ problem: Option.some(problem) }),
              ],
              model,
            };
          }

          return Option.isSome(model.pendingHandoffEmail)
            ? { model }
            : {
                model: {
                  ...model,
                  pendingHandoffEmail: Option.some({
                    conversationId: model.conversationId,
                    email,
                  }),
                },
              };
        },
      }),
    TookFile: ({ file }) =>
      file.type.startsWith("image/")
        ? { commands: [ReadAttachment({ file })], model }
        : appendBot(model, widgetCopy.attachmentRejected),
  });
