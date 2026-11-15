import { describe, expect, it } from "@effect/vitest";

import {
  proactiveBubbleDelayMs,
  proactiveBubbleOffered,
  proactiveBubbleShown,
  proactiveDismissKey,
} from "../src/widget/proactive-bubble.js";

type BubbleRow = Readonly<{
  docked: boolean;
  dismissed: boolean;
  name: string;
  open: boolean;
  shown: boolean;
  slug: string | null;
}>;

const rows: ReadonlyArray<BubbleRow> = [
  {
    docked: false,
    dismissed: false,
    name: "the email login trouble page on a first visit",
    open: false,
    shown: true,
    slug: "troubleshooting-email-login-magic-link",
  },
  {
    docked: false,
    dismissed: false,
    name: "the Google login trouble page on a first visit",
    open: false,
    shown: true,
    slug: "troubleshooting-google-workspace-login",
  },
  {
    docked: false,
    dismissed: true,
    name: "a trouble page whose bubble was dismissed",
    open: false,
    shown: false,
    slug: "troubleshooting-email-login-magic-link",
  },
  {
    docked: false,
    dismissed: false,
    name: "a trouble page where the chat is already open",
    open: true,
    shown: false,
    slug: "troubleshooting-email-login-magic-link",
  },
  {
    docked: true,
    dismissed: false,
    name: "the docked chat on the same trouble page",
    open: false,
    shown: false,
    slug: "troubleshooting-email-login-magic-link",
  },
  {
    docked: false,
    dismissed: false,
    name: "an article with no suggestion",
    open: false,
    shown: false,
    slug: "boards-sections",
  },
  {
    docked: false,
    dismissed: false,
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
          docked: row.docked,
          dismissed: row.dismissed,
          open: row.open,
          slug: row.slug,
        })
      ).toBe(row.shown);
    });
  }

  it("offers the bubble before the wait without looking at whether the chat is open", () => {
    expect(
      proactiveBubbleOffered({
        docked: false,
        dismissed: false,
        slug: "troubleshooting-email-login-magic-link",
      })
    ).toBe(true);
    expect(
      proactiveBubbleOffered({
        docked: false,
        dismissed: false,
        slug: "boards-sections",
      })
    ).toBe(false);
  });
});
