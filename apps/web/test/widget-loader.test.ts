import { Script } from "node:vm";

import { describe, expect, it } from "@effect/vitest";

import { widgetChatPath, widgetScriptPath } from "../src/widget/embed.js";
import { widgetLoaderScript } from "../src/widget/loader.js";
import { proactiveDismissKey } from "../src/widget/proactive-bubble.js";
import {
  displayOf,
  handler,
  postToHost,
  runWidgetLoader,
} from "./widget-fake-dom.js";
import type { FakeElement } from "./widget-fake-dom.js";

const script = widgetLoaderScript("https://chat.test");

const origin = "https://chat.test";

const element = (
  run: ReturnType<typeof runWidgetLoader>,
  id: string
): FakeElement => {
  const found = run.elements.get(id);

  if (found === undefined) {
    throw new Error(`the loader did not create ${id}`);
  }

  return found;
};

const frame = (run: ReturnType<typeof runWidgetLoader>): FakeElement => {
  const found = run.frames.at(0);

  if (found === undefined) {
    throw new Error("the loader did not create the chat frame");
  }

  return found;
};

const hostKeysTouched = (run: ReturnType<typeof runWidgetLoader>) =>
  run.storageCalls.filter(([, key]) => key.startsWith("hypertask_chat_"));

describe("widget loader", () => {
  it("is served as the same embed address and compiles as a script", () => {
    expect(widgetScriptPath).toBe("/widget/widget.js");
    expect(widgetChatPath).toBe("/widget/chat");
    expect(new Script(script)).toBeInstanceOf(Script);
    expect(script).toContain("data-mode");
    expect(script).toContain("hypertask-chat-docked");
    expect(script).toContain("--hypertask-chat-dock-width");
  });

  it("waits for the launcher and keeps host storage untouched until the frame boots", () => {
    const run = runWidgetLoader(script);

    expect(run.frames).toHaveLength(1);
    expect(run.frames[0]?.src).toBeUndefined();
    expect(run.frames[0]?.parentElement).toBeNull();
    expect(hostKeysTouched(run)).toEqual([]);

    postToHost(run, {
      data: { type: "chat-widget-session", visitorId: "unexpected" },
      origin,
    });

    expect(hostKeysTouched(run)).toEqual([]);

    handler(element(run, "chat-widget-btn"), "click")();

    expect(run.frames[0]?.src).toBe(`${origin}/widget/chat`);
    expect(run.frames[0]?.parentElement).toBe(run.document.body);

    handler(frame(run), "load")();
    postToHost(run, {
      data: {
        conversationId: "conv-1",
        type: "chat-widget-session",
        visitorId: "visitor-1",
        visitorSecret: "secret-1",
      },
      origin,
    });

    expect(
      run.storageCalls
        .filter(([, key]) => key.startsWith("hypertask_chat_"))
        .filter(([method]) => method === "getItem")
        .map(([, key]) => key)
    ).toEqual([
      "hypertask_chat_conversation_id",
      "hypertask_chat_visitor_id",
      "hypertask_chat_visitor_secret",
    ]);
    expect(
      run.frames[0]?.messages.filter(
        (message) => message.type === "chat-widget-boot"
      )
    ).toHaveLength(1);
    expect(run.storage.get("hypertask_chat_conversation_id")).toBe("conv-1");
    expect(run.storage.get("hypertask_chat_visitor_id")).toBe("visitor-1");
    expect(run.storage.get("hypertask_chat_visitor_secret")).toBe("secret-1");

    handler(element(run, "chat-widget-btn"), "click")();
    handler(element(run, "chat-widget-btn"), "click")();

    expect(run.frames).toHaveLength(1);
    expect(run.frames[0]?.parentElement).toBe(run.document.body);
  });

  it("docks on a wide page, folds to the launcher at 390px, and remembers the fold", () => {
    const docked = runWidgetLoader(script, { dock: true, width: 1280 });
    const toggle = element(docked, "chat-widget-dock-toggle");

    expect(docked.frames[0]?.src).toBe(
      `${origin}/widget/chat?dock=1&pageUrl=${encodeURIComponent("https://host.test/")}&pageTitle=Host%20page&docked=1`
    );
    expect(docked.frames[0]?.parentElement).toBe(docked.document.body);
    expect(docked.elements.get("chat-widget-btn")?.parentElement).toBeNull();
    expect(docked.document.body.classes.has("hypertask-chat-docked")).toBe(
      true
    );
    expect(
      docked.document.documentElement.classes.has("hypertask-chat-docked")
    ).toBe(true);
    expect(toggle.style.right).toBe("378px");
    expect(toggle.getAttribute("aria-label")).toBe("Hide HyperAI");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(displayOf(element(docked, "chat-widget-iframe"))).toBe("block");

    handler(toggle, "click")();

    expect(docked.storage.get("hypertask-chat-dock-collapsed")).toBe("1");
    expect(toggle.getAttribute("aria-label")).toBe("Show HyperAI");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(docked.document.body.classes.has("hypertask-chat-docked")).toBe(
      false
    );
    expect(displayOf(element(docked, "chat-widget-iframe"))).toBe("none");

    const folded = runWidgetLoader(script, {
      dock: true,
      stored: { "hypertask-chat-dock-collapsed": "1" },
      width: 1280,
    });

    expect(folded.document.body.classes.has("hypertask-chat-docked")).toBe(
      false
    );
    expect(displayOf(element(folded, "chat-widget-iframe"))).toBe("none");
    expect(folded.elements.get("chat-widget-btn")?.parentElement).toBeNull();

    const narrow = runWidgetLoader(script, { dock: true, width: 390 });

    narrow.history.pushState({}, "", "/next");

    expect(narrow.frames[0]?.src).toBeUndefined();
    expect(narrow.frames[0]?.parentElement).toBeNull();
    expect(hostKeysTouched(narrow)).toEqual([]);
    expect(element(narrow, "chat-widget-dock-toggle").style.display).toBe(
      "none"
    );
  });

  it("fills the help page mount and pins the panel there", () => {
    const run = runWidgetLoader(script, { pinned: true, width: 1280 });

    expect(run.frames[0]?.src).toBe(
      `${origin}/widget/chat?context=help&pinned=1`
    );
    expect(run.frames[0]?.parentElement).toBe(run.mount);
    expect(run.elements.get("chat-widget-btn")?.parentElement).toBeNull();
    expect(
      run.elements.get("chat-widget-dock-toggle")?.parentElement
    ).toBeNull();
  });

  it("offers the article bubble after three seconds and sends its question once the frame is ready", () => {
    const run = runWidgetLoader(script, { article: true });
    const bubble = element(run, "chat-proactive-bubble");

    expect(displayOf(bubble)).toBeUndefined();

    run.timers[0]?.();

    expect(displayOf(bubble)).toBe("block");

    const stopped: string[] = [];

    handler(
      bubble.querySelector(".proactive-suggestion"),
      "click"
    )({
      stopPropagation: () => {
        stopped.push("suggestion");
      },
    });

    expect(stopped).toEqual(["suggestion"]);

    expect(displayOf(bubble)).toBe("none");
    expect(
      run.storage.get(
        "chat-bubble-dismissed-troubleshooting-email-login-magic-link"
      )
    ).toBe("true");
    expect(run.frames[0]?.src).toBe(
      `${origin}/widget/chat?article=troubleshooting-email-login-magic-link`
    );
    expect(run.frames[0]?.parentElement).toBe(run.document.body);

    for (const timer of run.timers) {
      timer();
    }

    expect(
      run.frames[0]?.messages.some(
        (message) => message.type === "send-suggestion"
      )
    ).toBe(false);

    handler(frame(run), "load")();

    expect(
      run.frames[0]?.messages.find(
        (message) => message.type === "send-suggestion"
      )
    ).toEqual({ message: "I can't log in", type: "send-suggestion" });
  });

  it("keeps the bubble away on later visits and for pages without a mapping", () => {
    const dismissed = runWidgetLoader(script, {
      article: true,
      stored: {
        "chat-bubble-dismissed-troubleshooting-email-login-magic-link": "true",
      },
    });

    for (const timer of dismissed.timers) {
      timer();
    }

    expect(dismissed.elements.get("chat-proactive-bubble")).toBeUndefined();

    const plain = runWidgetLoader(script);

    for (const timer of plain.timers) {
      timer();
    }

    expect(plain.elements.get("chat-proactive-bubble")).toBeUndefined();
  });

  it("stores a dismissal behind the one storage port and never offers the bubble again", () => {
    const run = runWidgetLoader(script, { article: true });
    const bubble = element(run, "chat-proactive-bubble");
    const key = proactiveDismissKey("troubleshooting-email-login-magic-link");

    run.timers[0]?.();

    expect(displayOf(bubble)).toBe("block");

    handler(
      bubble.querySelector(".proactive-close"),
      "click"
    )({
      stopPropagation: () => undefined,
    });

    expect(displayOf(bubble)).toBe("none");
    expect(run.storage.get(key)).toBe("true");

    const reloaded = runWidgetLoader(script, {
      article: true,
      stored: Object.fromEntries(run.storage),
    });

    for (const timer of reloaded.timers) {
      timer();
    }

    expect(reloaded.elements.get("chat-proactive-bubble")).toBeUndefined();
    expect(reloaded.storage.get(key)).toBe("true");
  });

  it("keeps the bubble hidden when the visitor opens the chat inside the three seconds", () => {
    const run = runWidgetLoader(script, { article: true });
    const bubble = element(run, "chat-proactive-bubble");

    handler(element(run, "chat-widget-btn"), "click")();

    expect(displayOf(bubble)).toBe("none");

    run.timers[0]?.();

    expect(displayOf(bubble)).toBe("none");
    expect(
      run.storage.get(
        proactiveDismissKey("troubleshooting-email-login-magic-link")
      )
    ).toBeUndefined();
  });

  it("offers no bubble in dock mode on the same trouble article", () => {
    const run = runWidgetLoader(script, { article: true, dock: true });

    for (const timer of run.timers) {
      timer();
    }

    expect(run.elements.get("chat-proactive-bubble")).toBeUndefined();
  });

  it("only closes the frame for a close message from the widget's own origin", () => {
    const run = runWidgetLoader(script);

    handler(element(run, "chat-widget-btn"), "click")();

    postToHost(run, {
      data: { type: "chat-widget-close" },
      origin: "https://evil.test",
    });

    expect(displayOf(element(run, "chat-widget-iframe"))).toBe("block");
    expect(
      run.frames[0]?.messages.filter(
        (message) => message.type === "chat-widget-closed"
      )
    ).toEqual([]);

    postToHost(run, { data: { type: "chat-widget-close" }, origin });

    expect(displayOf(element(run, "chat-widget-iframe"))).toBe("none");
    expect(
      run.frames[0]?.messages.filter(
        (message) => message.type === "chat-widget-closed"
      )
    ).toHaveLength(1);
  });
});
