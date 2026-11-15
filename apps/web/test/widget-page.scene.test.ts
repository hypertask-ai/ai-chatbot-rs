import { describe, it } from "@effect/vitest";
import {
  Command,
  Subscription,
  click,
  expect as sceneExpect,
  given,
  keydown,
  placeholder,
  role,
  scene,
  selector,
  text,
  type,
} from "foldkit/scene";

import {
  RequestHostClose,
  ScrollToLatest,
  SyncChrome,
} from "../src/client/widget/command.js";
import { Message } from "../src/client/widget/message.js";
import { initialModel } from "../src/client/widget/model.js";
import type { WidgetFlags } from "../src/client/widget/model.js";
import { update } from "../src/client/widget/update.js";
import { view } from "../src/features/widget/index.js";

const flags = (overrides: Partial<WidgetFlags> = {}): WidgetFlags => ({
  docked: false,
  pageTitle: "Boards & Sections",
  pageUrl: "https://hypertask.ai/help/boards-sections",
  pinned: false,
  ...overrides,
});

const home = initialModel(flags());

const box = placeholder("Ask a question…");

const imageDataUrl = "data:image/png;base64,iVBORw0KGgo=";

describe("chat widget page", () => {
  it("shows the old header, greeting, starters, placeholder, takeover note and privacy notice", () => {
    scene(
      { update, view },
      given(home),
      sceneExpect(selector("#headerTitle")).toHaveText("Hyper AI"),
      sceneExpect(text("Answers in seconds")).toExist(),
      sceneExpect(role("heading", { name: "Hi, how can we help?" })).toExist(),
      sceneExpect(
        text(
          "Ask anything about Hypertask. Answers come from our help articles."
        )
      ).toExist(),
      sceneExpect(
        role("button", { name: "Connect Claude to my board" })
      ).toExist(),
      sceneExpect(role("button", { name: "Invite my team" })).toExist(),
      sceneExpect(role("button", { name: "Change my plan" })).toExist(),
      sceneExpect(box).toExist(),
      sceneExpect(role("button", { name: "Send" })).toExist(),
      sceneExpect(
        text("A person takes over when the bot can't help")
      ).toExist(),
      sceneExpect(role("link", { name: "Privacy Policy" })).toHaveAttr(
        "href",
        "https://hypertask.ai/privacy/"
      ),
      sceneExpect(selector(".toolbar-btn")).toBeAbsent()
    );
  });

  it("sends on Enter, shows the visitor's message and clears the box", () => {
    scene(
      { update, view },
      given(home),
      type(box, "How do I export tasks?"),
      keydown(box, "Enter"),
      sceneExpect(selector(".message.user")).toHaveText(
        "How do I export tasks?"
      ),
      sceneExpect(box).toHaveValue(""),
      sceneExpect(role("button", { name: "Invite my team" })).toBeAbsent(),
      sceneExpect(
        role("heading", { name: "Hi, how can we help?" })
      ).toBeAbsent(),
      Command.expectExact(ScrollToLatest()),
      Command.resolve(ScrollToLatest(), Message.CompletedScrollToLatest()),
      Command.expectNone()
    );
  });

  it("sends a starter question when its button is clicked", () => {
    scene(
      { update, view },
      given(home),
      click(role("button", { name: "Change my plan" })),
      sceneExpect(selector(".message.user")).toHaveText("Change my plan"),
      sceneExpect(box).toHaveValue(""),
      Command.resolve(ScrollToLatest(), Message.CompletedScrollToLatest()),
      Command.expectNone()
    );
  });

  it("keeps the greeting on a blank send and asks the host to close from the header button", () => {
    scene(
      { update, view },
      given(home),
      click(role("button", { name: "Send" })),
      sceneExpect(role("heading", { name: "Hi, how can we help?" })).toExist(),
      sceneExpect(selector(".message")).toBeAbsent(),
      Command.expectNone(),
      click(role("button", { name: "Close" })),
      Command.expectExact(RequestHostClose()),
      Command.resolve(RequestHostClose(), Message.CompletedHostClose()),
      Command.expectNone()
    );
  });

  it("previews the attachment the host hands over and drops it on remove", () => {
    scene(
      { update, view },
      given(home),
      Subscription.emit(
        Message.ReceivedHostMessage({
          data: { dataUrl: imageDataUrl, type: "help-attachment" },
          fromParent: true,
          sameOrigin: true,
        })
      ),
      sceneExpect(selector("#attachmentPreview")).toExist(),
      sceneExpect(selector("#attachmentImg")).toHaveAttr("src", imageDataUrl),
      click(role("button", { name: "Remove attachment" })),
      sceneExpect(selector("#attachmentPreview")).toBeAbsent()
    );
  });

  it("sends the attached image with the question and opens it full size", () => {
    scene(
      { update, view },
      given(home),
      Subscription.emit(
        Message.ReceivedHostMessage({
          data: { dataUrl: imageDataUrl, type: "help-attachment" },
          fromParent: true,
          sameOrigin: true,
        })
      ),
      type(box, "What is this?"),
      keydown(box, "Enter"),
      sceneExpect(selector(".message-image")).toExist(),
      click(selector(".message-image")),
      sceneExpect(selector("#lightbox")).toExist(),
      sceneExpect(selector("#lightboxImg")).toHaveAttr("src", imageDataUrl),
      click(selector("#lightboxClose")),
      sceneExpect(selector("#lightbox")).toBeAbsent(),
      Command.resolve(ScrollToLatest(), Message.CompletedScrollToLatest()),
      Command.expectNone()
    );
  });

  it("ignores an attachment from another origin or a non-image payload", () => {
    scene(
      { update, view },
      given(home),
      Subscription.emit(
        Message.ReceivedHostMessage({
          data: { dataUrl: imageDataUrl, type: "help-attachment" },
          fromParent: true,
          sameOrigin: false,
        })
      ),
      Subscription.emit(
        Message.ReceivedHostMessage({
          data: { dataUrl: "https://evil.test/x.png", type: "help-attachment" },
          fromParent: true,
          sameOrigin: true,
        })
      ),
      sceneExpect(selector("#attachmentPreview")).toBeAbsent()
    );
  });

  it("keeps the welcome when a host message is unknown", () => {
    scene(
      { update, view },
      given(home),
      Subscription.emit(
        Message.ReceivedHostMessage({
          data: { type: "chat-widget-nothing" },
          fromParent: true,
          sameOrigin: true,
        })
      ),
      sceneExpect(role("heading", { name: "Hi, how can we help?" })).toExist()
    );
  });

  it("fits the viewport and marks the panel pinned when the host says so", () => {
    scene(
      { update, view },
      given(home),
      Subscription.emit(
        Message.ReceivedHostMessage({
          data: { isMobile: true, pinned: true, type: "chat-widget-pinned" },
          fromParent: true,
          sameOrigin: true,
        })
      ),
      Command.expectExact(
        SyncChrome({ docked: false, pinned: true, sheet: false })
      )
    );
  });
});
