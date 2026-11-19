import { describe, expect, it } from "@effect/vitest";

import { widgetCopy } from "../src/widget/copy.js";
import {
  isWidgetChatPath,
  widgetChatHeaders,
  widgetEmbedOrigins,
  widgetFrameAncestors,
  widgetScriptHeaders,
} from "../src/widget/embed.js";
import { mergeLoadedHistory } from "../src/widget/history-merge.js";
import { renderChatMarkdown } from "../src/widget/markdown.js";
import { widgetPageFlags } from "../src/widget/params.js";
import {
  dockCollapsedValue,
  frameStorageKeys,
  hostStorageKeys,
  proactiveDismissPrefix,
} from "../src/widget/storage.js";
import {
  articleBubbleFor,
  articleBubbles,
  starterSuggestions,
} from "../src/widget/suggestions.js";
import { widgetLayout, widgetTheme } from "../src/widget/theme.js";
import { widgetParityFixture } from "./widget-parity-fixture.js";

describe("chat widget parity with the old help site", () => {
  it("keeps every visible string word for word", () => {
    expect(widgetCopy.headerTitle).toBe(widgetParityFixture.copy.headerTitle);
    expect(widgetCopy.headerSubtitle).toBe(
      widgetParityFixture.copy.headerSubtitle
    );
    expect(widgetCopy.welcomeHeading).toBe(
      widgetParityFixture.copy.welcomeHeading
    );
    expect(widgetCopy.welcomeBody).toBe(widgetParityFixture.copy.welcomeBody);
    expect(widgetCopy.inputPlaceholder).toBe(
      widgetParityFixture.copy.inputPlaceholder
    );
    expect(widgetCopy.takeoverNote).toBe(widgetParityFixture.copy.takeoverNote);
    expect(widgetCopy.privacyShort).toBe(widgetParityFixture.copy.privacyShort);
    expect(widgetCopy.privacyLong).toBe(widgetParityFixture.copy.privacyLong);
    expect(widgetCopy.privacyPolicyUrl).toBe("https://hypertask.ai/privacy/");
    expect(widgetCopy.logoUrl).toBe("https://hypertask.ai/glyph-white.png");
  });

  it("keeps the storage keys and the dock collapse value byte for byte", () => {
    expect(hostStorageKeys.conversation).toBe(
      widgetParityFixture.storage.host.conversation
    );
    expect(hostStorageKeys.visitor).toBe(
      widgetParityFixture.storage.host.visitor
    );
    expect(hostStorageKeys.visitorSecret).toBe(
      widgetParityFixture.storage.host.visitorSecret
    );
    expect(frameStorageKeys).toEqual(widgetParityFixture.storage.frame);
    expect(hostStorageKeys.dockCollapsed).toBe(
      widgetParityFixture.storage.dockCollapsed
    );
    expect(dockCollapsedValue(true)).toBe("1");
    expect(dockCollapsedValue(false)).toBe("0");
    expect(proactiveDismissPrefix).toBe(
      widgetParityFixture.storage.proactiveDismissPrefix
    );
  });

  it("keeps the starter questions and the article bubbles", () => {
    expect([...starterSuggestions]).toEqual(
      widgetParityFixture.suggestions.starter
    );
    expect(Object.fromEntries(articleBubbles)).toEqual(
      widgetParityFixture.suggestions.article
    );
    expect(articleBubbleFor("troubleshooting-google-workspace-login")).toEqual({
      bubble: "Google login not working?",
      prompt: "Google sign-in isn't working",
    });
    expect(articleBubbleFor(null)).toBeUndefined();
    expect(articleBubbleFor("not-an-article")).toBeUndefined();
  });

  it("keeps the panel sizes, breakpoints and colours", () => {
    expect(widgetLayout.normalWidth).toBe("400px");
    expect(widgetLayout.normalHeight).toBe("640px");
    expect(widgetLayout.expandedWidth).toBe("500px");
    expect(widgetLayout.expandedHeight).toBe("720px");
    expect(widgetLayout.launcherSize).toBe("56px");
    expect(widgetLayout.chatBottom).toBe("92px");
    expect(widgetLayout.mobileBreakpoint).toBe(640);
    expect(widgetLayout.helpBreakpoint).toBe(900);
    expect(widgetLayout.dockWidth).toBe(400);
    expect(widgetTheme.chatBg).toBe("#262626");
    expect(widgetTheme.htInk).toBe("#f4f4f7");
    expect(widgetTheme.btnBg).toBe("#ffffff");
    expect(widgetTheme.btnFg).toBe("#000000");
  });

  it("reads the same query parameters the loader writes", () => {
    expect(widgetPageFlags("")).toEqual({
      docked: false,
      pageTitle: "",
      pageUrl: "",
      pinned: false,
    });
    expect(widgetPageFlags("?context=help&pinned=1")).toEqual({
      docked: false,
      pageTitle: "",
      pageUrl: "",
      pinned: true,
    });
    expect(
      widgetPageFlags(
        "?dock=1&pageUrl=https%3A%2F%2Fhost.test%2F&pageTitle=Host%20page&docked=1"
      )
    ).toEqual({
      docked: true,
      pageTitle: "Host page",
      pageUrl: "https://host.test/",
      pinned: false,
    });
    expect(widgetPageFlags("?docked=true").docked).toBe(false);
  });

  it("only frames the help site for the sites allowed today", () => {
    expect([...widgetEmbedOrigins]).toEqual([
      "https://hypertask.ai",
      "https://www.hypertask.ai",
      "https://docs.hypertask.ai",
    ]);
    expect(widgetFrameAncestors).toBe(
      "frame-ancestors 'self' https://hypertask.ai https://www.hypertask.ai https://docs.hypertask.ai"
    );
    expect(widgetChatHeaders["content-security-policy"]).toBe(
      widgetFrameAncestors
    );
    expect(widgetChatHeaders["cache-control"]).toBe("no-store");
    expect(widgetScriptHeaders["content-type"]).toBe("application/javascript");
    expect(widgetScriptHeaders["cache-control"]).toBe("public, max-age=3600");
  });

  it("hydrates the panel only on the chat path, under the preview base path", () => {
    expect(isWidgetChatPath("/ratstack/widget/chat")).toBe(true);
    expect(isWidgetChatPath("/widget/chat")).toBe(false);
    expect(isWidgetChatPath("/ratstack/widget/chat/")).toBe(false);
    expect(isWidgetChatPath("/ratstack/widget/chat2")).toBe(false);
  });

  it("renders the same HTML for the same markdown as the old renderer", () => {
    for (const row of widgetParityFixture.markdown) {
      expect(renderChatMarkdown(row.input)).toBe(row.html);
    }
  });

  it("merges loaded history the way the old widget did", () => {
    for (const row of widgetParityFixture.historyMerge) {
      const merged = mergeLoadedHistory(row.server, row.onScreen);

      expect(merged.keptLocal).toBe(row.expected.keptLocal);
      expect([...merged.messages]).toEqual([...row.expected.messages]);
    }
  });
});
