import { Effect, Schema } from "effect";
import { uuidV4Unsafe } from "effect/crypto/SecureRandom";
import { Command } from "foldkit";
import { File, readAsDataUrl } from "foldkit/file";

import { parentOrigin } from "../../widget/parent-origin.js";
import { frameStorageKeys } from "../../widget/storage.js";
import { Message } from "./message.js";

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

const postToParent = (body: Record<string, string>): void => {
  const target = parentOrigin();

  if (window.parent === window || target === undefined) {
    return;
  }

  window.parent.postMessage(body, target);
};

const sessionMessage = (input: {
  conversationId: string;
  visitorId: string;
  visitorSecret?: string;
}): Record<string, string> => {
  const body: Record<string, string> = {
    conversationId: input.conversationId,
    type: "chat-widget-session",
    visitorId: input.visitorId,
  };

  if (input.visitorSecret !== undefined && input.visitorSecret !== "") {
    body.visitorSecret = input.visitorSecret;
  }

  return body;
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
