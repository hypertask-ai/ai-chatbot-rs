import { describe, it } from "@effect/vitest";
import { Option } from "effect";
import {
  all,
  Command,
  click,
  expect as sceneExpect,
  expectAll,
  first,
  given,
  last,
  nth,
  placeholder,
  role,
  scene,
  selector,
  Subscription,
  text,
} from "foldkit/scene";

import { StoreSession } from "../src/client/widget/command.js";
import { Message } from "../src/client/widget/message.js";
import { initialModel } from "../src/client/widget/model.js";
import type { AppModel, WidgetFlags } from "../src/client/widget/model.js";
import { update } from "../src/client/widget/update.js";
import { view } from "../src/features/widget/index.js";
import { widgetCopy } from "../src/widget/copy.js";
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

const rows = all.selector(".menu-session-item");

const withMenu = (model: AppModel): AppModel => ({
  ...model,
  menu: { kind: "ready", now: sessionMenuNow, rows: built.sessions },
});

const pastChat = (model: AppModel): AppModel => ({
  ...model,
  conversationId: "conv-2",
  messages: [
    {
      content: "How do I export tasks?",
      imageUrl: Option.none(),
      role: "user",
    },
    {
      content: "Open the board menu.",
      imageUrl: Option.none(),
      role: "bot",
    },
  ],
  pastChat: true,
  readOnly: true,
});

describe("chat widget past chats", () => {
  it("opens the menu from the page event and sets the header label", () => {
    scene(
      { update, view },
      given(home),
      Subscription.emit(Message.OpenedMenu()),
      sceneExpect(selector("#headerTitle")).toHaveText("Conversations"),
      sceneExpect(selector("#menuView")).toExist(),
      sceneExpect(role("button", { name: "New" })).toExist(),
      sceneExpect(role("button", { name: "Close" })).toExist(),
      sceneExpect(selector("#chatView")).toBeAbsent(),
      sceneExpect(placeholder("Ask a question…")).toBeAbsent(),
      sceneExpect(
        role("heading", { name: "Hi, how can we help?" })
      ).toBeAbsent()
    );
  });

  it("lists the twenty chats the read returned, newest first", () => {
    scene(
      { update, view },
      given(withMenu(home)),
      expectAll(rows).toHaveCount(20),
      sceneExpect(first(rows)).toContainText("Question 1"),
      sceneExpect(first(rows)).toContainText("1 min ago"),
      sceneExpect(last(rows)).toContainText("Question 20"),
      sceneExpect(last(rows)).toContainText("20 min ago"),
      sceneExpect(selector(".menu-sessions-empty")).toBeAbsent()
    );
  });

  it("marks the chat the visitor is in", () => {
    scene(
      { update, view },
      given({ ...withMenu(home), conversationId: "conv-2" }),
      sceneExpect(nth(rows, 1)).toHaveClass("current"),
      sceneExpect(first(rows)).not.toHaveClass("current")
    );
  });

  it("cuts a long preview and falls back when the chat has no messages", () => {
    const long = "y".repeat(60);

    scene(
      { update, view },
      given({
        ...home,
        menu: {
          kind: "ready",
          now: sessionMenuNow,
          rows: [
            { id: "conv-long", last_message: long, status: "bot" },
            { id: "conv-empty", last_message: null, status: "closed" },
          ],
        },
      }),
      sceneExpect(first(rows)).toContainText(`${"y".repeat(50)}...`),
      sceneExpect(nth(rows, 1)).toContainText(widgetCopy.sessionNoMessages)
    );
  });

  it("shows the empty state when the read returned no chats", () => {
    scene(
      { update, view },
      given({
        ...home,
        menu: { kind: "ready", now: sessionMenuNow, rows: [] },
      }),
      sceneExpect(selector("#menuSessionsEmpty")).toExist(),
      sceneExpect(
        role("heading", { name: widgetCopy.menuEmptyHeading })
      ).toExist(),
      sceneExpect(text(widgetCopy.menuEmptyBody)).toExist()
    );
  });

  it("keeps the chats on screen while a new read is running", () => {
    scene(
      { update, view },
      given({
        ...withMenu(home),
        menu: { kind: "loading", now: sessionMenuNow, rows: built.sessions },
      }),
      expectAll(rows).toHaveCount(20),
      sceneExpect(selector(".menu-sessions-empty")).toBeAbsent()
    );
  });

  it("keeps the chats on screen when the read failed", () => {
    scene(
      { update, view },
      given({
        ...withMenu(home),
        menu: { kind: "failed", now: sessionMenuNow, rows: built.sessions },
      }),
      expectAll(rows).toHaveCount(20)
    );
  });

  it("opens a closed chat read only with the old banner and no composer", () => {
    scene(
      { update, view },
      given(pastChat(home)),
      sceneExpect(selector("#headerTitle")).toHaveText(
        widgetCopy.pastChatTitle
      ),
      sceneExpect(selector(".readonly-banner")).toHaveText(
        widgetCopy.readOnlyBanner
      ),
      sceneExpect(placeholder("Ask a question…")).toBeAbsent(),
      sceneExpect(selector(".message.user")).toHaveText(
        "How do I export tasks?"
      ),
      sceneExpect(role("button", { name: "Invite my team" })).toBeAbsent(),
      sceneExpect(role("button", { name: "New" })).toBeAbsent()
    );
  });

  it("resumes a chat that is still open with the composer back", () => {
    scene(
      { update, view },
      given({ ...pastChat(home), readOnly: false }),
      sceneExpect(selector("#headerTitle")).toHaveText("Hyper AI"),
      sceneExpect(selector(".readonly-banner")).toBeAbsent(),
      sceneExpect(placeholder("Ask a question…")).toExist(),
      sceneExpect(role("button", { name: "Send" })).toExist()
    );
  });

  it("says a past chat has no messages instead of showing the greeting", () => {
    scene(
      { update, view },
      given({ ...pastChat(home), messages: [], readOnly: false }),
      sceneExpect(text(widgetCopy.pastChatEmpty)).toExist(),
      sceneExpect(
        role("heading", { name: "Hi, how can we help?" })
      ).toBeAbsent(),
      sceneExpect(placeholder("Ask a question…")).toExist()
    );
  });

  it("starts a new chat from the menu and asks the host to forget the old one", () => {
    scene(
      { update, view },
      given({ ...pastChat(home), menu: withMenu(home).menu }),
      click(role("button", { name: "New" })),
      sceneExpect(selector("#menuView")).toBeAbsent(),
      sceneExpect(selector("#headerTitle")).toHaveText("Hyper AI"),
      sceneExpect(role("heading", { name: "Hi, how can we help?" })).toExist(),
      sceneExpect(role("button", { name: "Invite my team" })).toExist(),
      sceneExpect(placeholder("Ask a question…")).toExist(),
      Command.expectExact(StoreSession({ conversationId: "", visitorId: "" })),
      Command.resolve(
        StoreSession({ conversationId: "", visitorId: "" }),
        Message.CompletedStoreSession()
      ),
      Command.expectNone()
    );
  });
});
