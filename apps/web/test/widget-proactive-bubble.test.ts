import { describe, expect, it } from "@effect/vitest";

import {
  proactiveBubbleDelayMs,
  proactiveBubbleOffered,
  proactiveBubbleShown,
  proactiveDismissKey,
} from "../src/widget/proactive-bubble.js";

type BubbleRow = Readonly<{
  dismissed: boolean;
  docked: boolean;
  name: string;
  open: boolean;
  shown: boolean;
  slug: string | null;
}>;

const rows: readonly BubbleRow[] = [
  {
    dismissed: false,
    docked: false,
    name: "the email login trouble page on a first visit",
    open: false,
    shown: true,
    slug: "troubleshooting-email-login-magic-link",
  },
  {
    dismissed: false,
    docked: false,
    name: "the Google login trouble page on a first visit",
    open: false,
    shown: true,
    slug: "troubleshooting-google-workspace-login",
  },
  {
    dismissed: true,
    docked: false,
    name: "a trouble page whose bubble was dismissed",
    open: false,
    shown: false,
    slug: "troubleshooting-email-login-magic-link",
  },
  {
    dismissed: false,
    docked: false,
    name: "a trouble page where the chat is already open",
    open: true,
    shown: false,
    slug: "troubleshooting-email-login-magic-link",
  },
  {
    dismissed: false,
    docked: true,
    name: "the docked chat on the same trouble page",
    open: false,
    shown: false,
    slug: "troubleshooting-email-login-magic-link",
  },
  {
    dismissed: false,
    docked: false,
    name: "an article with no suggestion",
    open: false,
    shown: false,
    slug: "boards-sections",
  },
  {
    dismissed: false,
    docked: false,
    name: "a page that is not an article",
    open: false,
    shown: false,
    slug: null,
  },
];

describe("the help bubble rule, read from the old widget", () => {
  it("waits the same three seconds and keys dismissal by article slug", () => {
    expect(proactiveBubbleDelayMs).toBe(3000);
    expect(proactiveDismissKey("troubleshooting-email-login-magic-link")).toBe(
      "chat-bubble-dismissed-troubleshooting-email-login-magic-link"
    );
    expect(proactiveDismissKey("troubleshooting-google-workspace-login")).toBe(
      "chat-bubble-dismissed-troubleshooting-google-workspace-login"
    );
  });

  for (const row of rows) {
    it(`shows the bubble only on ${row.name}`, () => {
      expect(
        proactiveBubbleShown({
          dismissed: row.dismissed,
          docked: row.docked,
          open: row.open,
          slug: row.slug,
        })
      ).toBe(row.shown);
    });
  }

  it("offers the bubble before the wait without looking at whether the chat is open", () => {
    expect(
      proactiveBubbleOffered({
        dismissed: false,
        docked: false,
        slug: "troubleshooting-email-login-magic-link",
      })
    ).toBe(true);
    expect(
      proactiveBubbleOffered({
        dismissed: false,
        docked: false,
        slug: "boards-sections",
      })
    ).toBe(false);
  });
});
