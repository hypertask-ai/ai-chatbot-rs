import { describe, expect, it } from "@effect/vitest";
import { Option } from "effect";
import { Command, given, message, model, story } from "foldkit/story";

import {
  ScrollToLatest,
  StoreSession,
  SyncChrome,
} from "../src/client/widget/command.js";
import { Message } from "../src/client/widget/message.js";
import { initialModel } from "../src/client/widget/model.js";
import type { WidgetFlags } from "../src/client/widget/model.js";
import { update } from "../src/client/widget/update.js";

const flags: WidgetFlags = {
  docked: false,
  pageTitle: "Boards & Sections",
  pageUrl: "https://hypertask.ai/help/boards-sections",
  pinned: false,
};

const blankPage: WidgetFlags = {
  docked: false,
  pageTitle: "",
  pageUrl: "",
  pinned: false,
};

const booted = Message.ReceivedHostMessage({
  data: {
    conversationId: "conv-9",
    type: "chat-widget-boot",
    visitorId: "visitor-from-host",
    visitorSecret: "secret-9",
  },
  fromParent: true,
  sameOrigin: true,
});

describe("chat widget state", () => {
  it("records the question the answer step will send, in the body the old widget posted", () => {
    story(
      update,
      given(initialModel(flags)),
      message(Message.ChangedInput({ value: "  How do I export tasks?  " })),
      message(Message.Submitted()),
      model((next) => {
        expect(next.pendingQuestion).toEqual(
          Option.some({
            conversationId: null,
            message: "How do I export tasks?",
            pageTitle: "Boards & Sections",
            pageUrl: "https://hypertask.ai/help/boards-sections",
            visitorId: "",
          })
        );
        expect(next.input).toBe("");
        expect(next.suggestionsHidden).toBe(true);
        expect(next.messages).toEqual([
          {
            content: "How do I export tasks?",
            imageUrl: Option.none(),
            role: "user",
          },
        ]);
      }),
      Command.expectExact(ScrollToLatest()),
      Command.resolve(ScrollToLatest(), Message.CompletedScrollToLatest()),
      Command.expectNone()
    );
  });

  it("leaves the page fields out of the question on a page with no title or url", () => {
    story(
      update,
      given(initialModel(blankPage)),
      message(Message.ChangedInput({ value: "Hello" })),
      message(Message.Submitted()),
      model((next) => {
        expect(Object.hasOwn(next.pendingQuestion ?? {}, "pageUrl")).toBe(
          false
        );
        expect(Object.hasOwn(next.pendingQuestion ?? {}, "pageTitle")).toBe(
          false
        );
      }),
      Command.resolve(ScrollToLatest(), Message.CompletedScrollToLatest())
    );
  });

  it("ignores a blank send with no attachment", () => {
    story(
      update,
      given(initialModel(flags)),
      message(Message.ChangedInput({ value: "   " })),
      message(Message.Submitted()),
      model((next) => {
        expect(next.messages).toEqual([]);
        expect(next.pendingQuestion).toEqual(Option.none());
      }),
      Command.expectNone()
    );
  });

  it("adopts the ids the host boots with and asks the next question with them", () => {
    story(
      update,
      given(initialModel(flags)),
      message(booted),
      model((next) => {
        expect(next.conversationId).toBe("conv-9");
        expect(next.visitorId).toBe("visitor-from-host");
        expect(next.visitorSecret).toBe("secret-9");
      }),
      Command.expectExact(
        StoreSession({
          conversationId: "conv-9",
          visitorId: "visitor-from-host",
          visitorSecret: "secret-9",
        }),
        SyncChrome({ docked: false, pinned: false, sheet: false })
      ),
      Command.resolve(
        StoreSession({
          conversationId: "conv-9",
          visitorId: "visitor-from-host",
          visitorSecret: "secret-9",
        }),
        Message.CompletedStoreSession()
      ),
      Command.resolve(
        SyncChrome({ docked: false, pinned: false, sheet: false }),
        Message.CompletedSyncChrome()
      ),
      message(Message.ChangedInput({ value: "Hello" })),
      message(Message.Submitted()),
      model((next) => {
        const question = Option.getOrThrow(next.pendingQuestion);

        expect(question.conversationId).toBe("conv-9");
        expect(question.visitorId).toBe("visitor-from-host");
      }),
      Command.resolve(ScrollToLatest(), Message.CompletedScrollToLatest()),
      Command.expectNone()
    );
  });

  it("marks the panel docked and out of sheet mode when the host docks it", () => {
    story(
      update,
      given(initialModel(flags)),
      message(
        Message.ReceivedHostMessage({
          data: { docked: true, isMobile: true, type: "chat-widget-docked" },
          fromParent: true,
          sameOrigin: true,
        })
      ),
      model((next) => {
        expect(next.docked).toBe(true);
        expect(next.sheet).toBe(false);
      }),
      Command.expectExact(
        SyncChrome({ docked: true, pinned: false, sheet: false })
      ),
      Command.resolve(
        SyncChrome({ docked: true, pinned: false, sheet: false }),
        Message.CompletedSyncChrome()
      )
    );
  });
});
