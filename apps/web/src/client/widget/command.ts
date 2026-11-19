import { Effect, Option, Schema } from "effect";
import { uuidV4Unsafe } from "effect/crypto/SecureRandom";
import { Command } from "foldkit";
import { File, readAsDataUrl } from "foldkit/file";

import { helpArticleUrl } from "../../widget/source-line.js";
import { frameStorageKeys } from "../../widget/storage.js";
import { Message } from "./message.js";
import { parentOrigin } from "./parent-origin.js";

const read = (key: string): string => {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
};

const write = (key: string, value: string): void => {
  try {
    if (value === "") {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch {
    return undefined;
  }
};

interface ParentCloseMessage {
  readonly type: "chat-widget-close";
}

interface ParentSessionMessage {
  readonly conversationId: string;
  readonly type: "chat-widget-session";
  readonly visitorId: string;
  readonly visitorSecret?: string;
}

type ParentMessage = ParentCloseMessage | ParentSessionMessage;

interface SessionInput {
  readonly conversationId: string;
  readonly visitorId: string;
  readonly visitorSecret?: string;
}

const postToParent = (body: ParentMessage): void => {
  const target = parentOrigin();

  if (window.parent === window || target === undefined) {
    return;
  }

  window.parent.postMessage(body, target);
};

const sessionMessage = (input: SessionInput): ParentSessionMessage =>
  input.visitorSecret === undefined || input.visitorSecret === ""
    ? {
        conversationId: input.conversationId,
        type: "chat-widget-session",
        visitorId: input.visitorId,
      }
    : {
        conversationId: input.conversationId,
        type: "chat-widget-session",
        visitorId: input.visitorId,
        visitorSecret: input.visitorSecret,
      };

export const LoadSession = Command.define("LoadSession", {
  execute: Effect.sync(() => {
    const storedVisitor = read(frameStorageKeys.visitor);
    const visitorId = storedVisitor === "" ? uuidV4Unsafe() : storedVisitor;
    write(frameStorageKeys.visitor, visitorId);

    return Message.LoadedSession({
      conversationId: read(frameStorageKeys.conversation),
      sheet: window.parent === window && window.innerWidth <= 900,
      visitorId,
    });
  }),
  messages: [Message.LoadedSession],
});

export const PublishSession = Command.define("PublishSession", {
  args: {
    conversationId: Schema.String,
    visitorId: Schema.String,
    visitorSecret: Schema.optionalKey(Schema.String),
  },
  execute: ({ conversationId, visitorId, visitorSecret }) =>
    Effect.sync(() => {
      postToParent(
        visitorSecret === undefined
          ? sessionMessage({ conversationId, visitorId })
          : sessionMessage({ conversationId, visitorId, visitorSecret })
      );

      return Message.CompletedPublishSession();
    }),
  messages: [Message.CompletedPublishSession],
});

export const StoreSession = Command.define("StoreSession", {
  args: {
    conversationId: Schema.String,
    visitorId: Schema.String,
  },
  execute: ({ conversationId, visitorId }) =>
    Effect.sync(() => {
      write(frameStorageKeys.conversation, conversationId);
      write(frameStorageKeys.visitor, visitorId);

      if (conversationId !== "" || visitorId !== "") {
        postToParent(sessionMessage({ conversationId, visitorId }));
      }

      return Message.CompletedStoreSession();
    }),
  messages: [Message.CompletedStoreSession],
});

export const RequestHostClose = Command.define("RequestHostClose", {
  execute: Effect.sync(() => {
    postToParent({ type: "chat-widget-close" });

    return Message.CompletedHostClose();
  }),
  messages: [Message.CompletedHostClose],
});

export const OpenCitedArticle = Command.define("OpenCitedArticle", {
  args: { onHelpPage: Schema.Boolean, slug: Schema.String },
  execute: ({ onHelpPage, slug }) =>
    Effect.sync(() => {
      if (onHelpPage) {
        postToParent({ slug, type: "help-open-article" });
      } else {
        window.open(helpArticleUrl(slug), "_blank", "noopener,noreferrer");
      }

      return Message.CompletedOpenCitedArticle();
    }),
  messages: [Message.CompletedOpenCitedArticle],
});

export const ReportEmailValidity = Command.define("ReportEmailValidity", {
  args: { problem: Schema.Option(Schema.String) },
  execute: ({ problem }) =>
    Effect.sync(() => {
      const input = document.querySelector<HTMLInputElement>("#handoffEmail");

      if (input !== null) {
        input.setCustomValidity(Option.getOrElse(problem, () => ""));

        if (Option.isSome(problem)) {
          input.reportValidity();
        }
      }

      return Message.CompletedEmailValidityCheck();
    }),
  messages: [Message.CompletedEmailValidityCheck],
});

export const ReadAttachment = Command.define("ReadAttachment", {
  args: { file: File },
  execute: ({ file }) =>
    readAsDataUrl(file).pipe(
      Effect.match({
        onFailure: () => Message.RejectedAttachment(),
        onSuccess: (dataUrl) => Message.AttachedImage({ dataUrl }),
      })
    ),
  messages: [Message.AttachedImage, Message.RejectedAttachment],
});

export const ScrollToLatest = Command.define("ScrollToLatest", {
  execute: Effect.sync(() => {
    document.querySelector("#chat-messages-end")?.scrollIntoView({
      block: "end",
    });

    return Message.CompletedScrollToLatest();
  }),
  messages: [Message.CompletedScrollToLatest],
});

export const SyncChrome = Command.define("SyncChrome", {
  args: {
    docked: Schema.Boolean,
    pinned: Schema.Boolean,
    sheet: Schema.Boolean,
  },
  execute: ({ docked, pinned, sheet }) =>
    Effect.sync(() => {
      document.body.classList.toggle("pinned", pinned);
      document.body.classList.toggle("docked", docked);

      const styles = document.body.style;
      const viewport = window.visualViewport;
      const fit = sheet && !pinned;

      styles.position = fit ? "fixed" : "";
      styles.left = fit ? "0" : "";
      styles.right = fit ? "0" : "";
      styles.width = fit ? "100%" : "";
      styles.top = fit ? `${viewport?.offsetTop ?? 0}px` : "";
      styles.height = fit ? `${viewport?.height ?? window.innerHeight}px` : "";

      if (fit) {
        document
          .querySelector<HTMLElement>("#messages")
          ?.scrollTo({ top: 9_999_999 });
      }

      return Message.CompletedSyncChrome();
    }),
  messages: [Message.CompletedSyncChrome],
});
