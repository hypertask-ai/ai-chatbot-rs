import { readFileSync } from "node:fs";

import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";

import { widgetCopy } from "../src/widget/copy.js";
import {
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

const Line = Schema.Struct({ content: Schema.String, role: Schema.String });

const Fixture = Schema.Struct({
  copy: Schema.Struct({
    headerSubtitle: Schema.String,
    headerTitle: Schema.String,
    inputPlaceholder: Schema.String,
    privacyLong: Schema.String,
    privacyShort: Schema.String,
    takeoverNote: Schema.String,
    welcomeBody: Schema.String,
    welcomeHeading: Schema.String,
  }),
  historyMerge: Schema.Array(
    Schema.Struct({
      expected: Schema.Struct({
        keptLocal: Schema.Finite,
        messages: Schema.Array(Line),
      }),
      onScreen: Schema.Array(Line),
      server: Schema.Array(Line),
    })
  ),
  markdown: Schema.Array(
    Schema.Struct({ html: Schema.String, input: Schema.String })
  ),
  storage: Schema.Struct({
    dockCollapsed: Schema.String,
    frame: Schema.Struct({
      conversation: Schema.String,
      visitor: Schema.String,
      visitorSecret: Schema.String,
    }),
    host: Schema.Struct({
      conversation: Schema.String,
      visitor: Schema.String,
      visitorSecret: Schema.String,
    }),
    proactiveDismissPrefix: Schema.String,
  }),
  suggestions: Schema.Struct({
    article: Schema.Record(
      Schema.String,
      Schema.Struct({ bubble: Schema.String, prompt: Schema.String })
    ),
    starter: Schema.Array(Schema.String),
  }),
});

const fixture = Schema.decodeUnknownSync(Fixture)(
  JSON.parse(
    readFileSync(
      new URL("fixtures/widget-parity.json", import.meta.url),
      "utf-8"
    )
  )
);

describe("chat widget parity with the old help site", () => {
  it("keeps every visible string word for word", () => {
    expect(widgetCopy.headerTitle).toBe(fixture.copy.headerTitle);
    expect(widgetCopy.headerSubtitle).toBe(fixture.copy.headerSubtitle);
    expect(widgetCopy.welcomeHeading).toBe(fixture.copy.welcomeHeading);
    expect(widgetCopy.welcomeBody).toBe(fixture.copy.welcomeBody);
    expect(widgetCopy.inputPlaceholder).toBe(fixture.copy.inputPlaceholder);
    expect(widgetCopy.takeoverNote).toBe(fixture.copy.takeoverNote);
    expect(widgetCopy.privacyShort).toBe(fixture.copy.privacyShort);
    expect(widgetCopy.privacyLong).toBe(fixture.copy.privacyLong);
    expect(widgetCopy.privacyPolicyUrl).toBe("https://hypertask.ai/privacy/");
    expect(widgetCopy.logoUrl).toBe("https://hypertask.ai/glyph-white.png");
  });

  it("keeps the storage keys and the dock collapse value byte for byte", () => {
    expect(hostStorageKeys).toEqual(fixture.storage.host);
    expect(frameStorageKeys).toEqual(fixture.storage.frame);
    expect(hostStorageKeys.dockCollapsed).toBe(fixture.storage.dockCollapsed);
    expect(dockCollapsedValue(true)).toBe("1");
    expect(dockCollapsedValue(false)).toBe("0");
    expect(proactiveDismissPrefix).toBe(fixture.storage.proactiveDismissPrefix);
  });

  it("keeps the starter questions and the article bubbles", () => {
    expect([...starterSuggestions]).toEqual(fixture.suggestions.starter);
    expect(Object.fromEntries(articleBubbles)).toEqual(
      fixture.suggestions.article
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
    expect(widgetTheme.ink).toBe("#f4f4f7");
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

  it("renders the same HTML for the same markdown as the old renderer", () => {
    for (const row of fixture.markdown) {
      expect(renderChatMarkdown(row.input)).toBe(row.html);
    }
  });

  it("merges loaded history the way the old widget did", () => {
    for (const row of fixture.historyMerge) {
      const merged = mergeLoadedHistory(row.server, row.onScreen);

      expect(merged.keptLocal).toBe(row.expected.keptLocal);
      expect([...merged.messages]).toEqual([...row.expected.messages]);
    }
  });
});
