import { describe, expect, it } from "@effect/vitest";
import { Option } from "effect";
import { Command, given, message, model, story } from "foldkit/story";

import { ScrollToLatest, StoreSession } from "../src/client/widget/command.js";
import { Message } from "../src/client/widget/message.js";
import { initialModel } from "../src/client/widget/model.js";
import type { WidgetFlags } from "../src/client/widget/model.js";
import { update } from "../src/client/widget/update.js";
import { fakePastChats } from "./past-chats-fake.js";
import { sessionMenuNow } from "./session-menu-fixture.js";

const flags: WidgetFlags = {
  docked: false,
  pageTitle: "Boards & Sections",
  pageUrl: "https://hypertask.ai/help/boards-sections",
  pinned: false,
};

const home = initialModel(flags);

const built = fakePastChats(20, sessionMenuNow);

const loaded = built.loadedMenu;

const lines = built.lines;

describe("chat widget menu state", () => {
  it("marks the menu open and loading when the page asks for it", () => {
    story(
      update,
      given(home),
      message(Message.OpenedMenu()),
      model((next) => {
        expect(next.menu.kind).toBe("loading");
        expect(next.menu.rows).toEqual([]);
      }),
      Command.expectNone()
    );
  });

  it("stores the rows and the read clock the read returned", () => {
    story(
      update,
      given(home),
      message(Message.OpenedMenu()),
      message(loaded),
      model((next) => {
        expect(next.menu.kind).toBe("ready");
        expect(next.menu.now).toBe(sessionMenuNow);
        expect(next.menu.rows.map((session) => session.id)).toEqual(
          built.sessions.map((session) => session.id)
        );
      }),
      Command.expectNone()
    );
  });

  it("stores the rows the read returns without opening a closed menu", () => {
    story(
      update,
      given(home),
      message(loaded),
      model((next) => {
        expect(next.menu.kind).toBe("closed");
        expect(next.menu.rows).toHaveLength(20);
        expect(next.menu.now).toBe(sessionMenuNow);
      }),
      Command.expectNone()
    );
  });

  it("keeps the rows it had when the read fails", () => {
    story(
      update,
      given(home),
      message(Message.OpenedMenu()),
      message(loaded),
      message(Message.RejectedMenuSessions()),
      model((next) => {
        expect(next.menu.kind).toBe("failed");
        expect(next.menu.rows).toHaveLength(20);
        expect(next.menu.now).toBe(sessionMenuNow);
      }),
      Command.expectNone()
    );
  });

  it("remembers which chat the visitor picked and changes nothing else", () => {
    story(
      update,
      given(home),
      message(loaded),
      message(
        Message.PickedMenuSession({ sessionId: "conv-2", status: "bot" })
      ),
      model((next) => {
        expect(next.selection).toEqual(
          Option.some({ sessionId: "conv-2", status: "bot" })
        );
        expect(next.menu.rows).toHaveLength(20);
        expect(next.readOnly).toBe(false);
        expect(next.messages).toEqual([]);
      }),
      Command.expectNone()
    );
  });

  it("views a closed chat read only without making it the active one", () => {
    story(
      update,
      given({ ...home, conversationId: "conv-9" }),
      message(
        Message.PickedMenuSession({ sessionId: "conv-2", status: "closed" })
      ),
      message(Message.LoadedPastChat({ messages: lines })),
      model((next) => {
        expect(next.readOnly).toBe(true);
        expect(next.pastChat).toBe(true);
        expect(next.conversationId).toBe("conv-9");
        expect(next.menu.kind).toBe("closed");
        expect(next.messages.map((entry) => entry.role)).toEqual([
          "user",
          "bot",
        ]);
        expect(next.selection).toEqual(Option.none());
      }),
      Command.expectExact(ScrollToLatest()),
      Command.resolve(ScrollToLatest(), Message.CompletedScrollToLatest()),
      Command.expectNone()
    );
  });

  it("resumes an open chat and hands the new id to the host", () => {
    story(
      update,
      given({ ...home, conversationId: "conv-9", visitorId: "visitor-1" }),
      message(
        Message.PickedMenuSession({ sessionId: "conv-2", status: "bot" })
      ),
      message(Message.LoadedPastChat({ messages: lines })),
      model((next) => {
        expect(next.conversationId).toBe("conv-2");
        expect(next.readOnly).toBe(false);
        expect(next.visitorId).toBe("visitor-1");
        expect(next.messages).toHaveLength(2);
      }),
      Command.expectExact(
        StoreSession({
          conversationId: "conv-2",
          visitorId: "visitor-1",
          visitorSecret: "",
        }),
        ScrollToLatest()
      ),
      Command.resolve(
        StoreSession({
          conversationId: "conv-2",
          visitorId: "visitor-1",
          visitorSecret: "",
        }),
        Message.CompletedStoreSession()
      ),
      Command.resolve(ScrollToLatest(), Message.CompletedScrollToLatest()),
      Command.expectNone()
    );
  });

  it("opens the chat the visitor is already in read write with no new id", () => {
    story(
      update,
      given({ ...home, conversationId: "conv-2" }),
      message(
        Message.PickedMenuSession({ sessionId: "conv-2", status: "bot" })
      ),
      message(Message.LoadedPastChat({ messages: lines })),
      model((next) => {
        expect(next.conversationId).toBe("conv-2");
        expect(next.readOnly).toBe(false);
        expect(next.pastChat).toBe(true);
      }),
      Command.expectExact(ScrollToLatest()),
      Command.resolve(ScrollToLatest(), Message.CompletedScrollToLatest()),
      Command.expectNone()
    );
  });

  it("shows a chat with no messages without asking the page to scroll", () => {
    story(
      update,
      given(home),
      message(
        Message.PickedMenuSession({ sessionId: "conv-2", status: "closed" })
      ),
      message(Message.LoadedPastChat({ messages: [] })),
      model((next) => {
        expect(next.messages).toEqual([]);
        expect(next.pastChat).toBe(true);
        expect(next.readOnly).toBe(true);
      }),
      Command.expectNone()
    );
  });

  it("ignores a chat that arrives with no pick", () => {
    story(
      update,
      given({ ...home, conversationId: "conv-9" }),
      message(Message.LoadedPastChat({ messages: lines })),
      model((next) => {
        expect(next.messages).toEqual([]);
        expect(next.pastChat).toBe(false);
        expect(next.readOnly).toBe(false);
        expect(next.conversationId).toBe("conv-9");
      }),
      Command.expectNone()
    );
  });

  it("replaces the transcript instead of adding to it when a chat opens twice", () => {
    story(
      update,
      given(home),
      message(
        Message.PickedMenuSession({ sessionId: "conv-2", status: "closed" })
      ),
      message(Message.LoadedPastChat({ messages: lines })),
      Command.resolve(ScrollToLatest(), Message.CompletedScrollToLatest()),
      message(
        Message.PickedMenuSession({ sessionId: "conv-2", status: "closed" })
      ),
      message(Message.LoadedPastChat({ messages: lines })),
      model((next) => {
        expect(next.messages).toHaveLength(2);
      }),
      Command.resolve(ScrollToLatest(), Message.CompletedScrollToLatest()),
      Command.expectNone()
    );
  });

  it("starts over with the greeting and drops the stored chat", () => {
    story(
      update,
      given({
        ...home,
        attachment: Option.some("data:image/png;base64,iVBORw0KGgo="),
        conversationId: "conv-9",
        messages: [
          {
            content: "How do I export tasks?",
            imageUrl: Option.none(),
            role: "user",
          },
        ],
        pastChat: true,
        readOnly: true,
        selection: Option.some({ sessionId: "conv-2", status: "closed" }),
        suggestionsHidden: true,
        visitorId: "visitor-1",
      }),
      message(Message.StartedNewConversation()),
      model((next) => {
        expect(next.conversationId).toBe("");
        expect(next.messages).toEqual([]);
        expect(next.pastChat).toBe(false);
        expect(next.readOnly).toBe(false);
        expect(next.attachment).toEqual(Option.none());
        expect(next.pendingQuestion).toEqual(Option.none());
        expect(next.selection).toEqual(Option.none());
        expect(next.suggestionsHidden).toBe(false);
        expect(next.suggestions).toHaveLength(3);
        expect(next.menu.kind).toBe("closed");
      }),
      Command.expectExact(
        StoreSession({
          conversationId: "",
          visitorId: "visitor-1",
          visitorSecret: "",
        })
      ),
      Command.resolve(
        StoreSession({
          conversationId: "",
          visitorId: "visitor-1",
          visitorSecret: "",
        }),
        Message.CompletedStoreSession()
      ),
      Command.expectNone()
    );
  });
});
