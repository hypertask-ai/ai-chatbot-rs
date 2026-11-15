import { describe, expect, it } from "@effect/vitest";
import { DateTime } from "effect";

import {
  sessionPreview,
  sessionStamp,
  sessionTime,
} from "../src/widget/chat-sessions.js";
import { widgetCopy } from "../src/widget/copy.js";
import {
  oldSecondsStamp,
  oldSecondsStampLabel,
  sessionMenuFixture,
  sessionMenuNow,
} from "./session-menu-fixture.js";

describe("chat session rows match the old menu", () => {
  it("keeps every menu string word for word", () => {
    expect(widgetCopy.menuTitle).toBe(sessionMenuFixture.copy.menuTitle);
    expect(widgetCopy.pastChatTitle).toBe(
      sessionMenuFixture.copy.pastChatTitle
    );
    expect(widgetCopy.readOnlyBanner).toBe(
      sessionMenuFixture.copy.readOnlyBanner
    );
    expect(widgetCopy.menuEmptyHeading).toBe(
      sessionMenuFixture.copy.menuEmptyHeading
    );
    expect(widgetCopy.menuEmptyBody).toBe(
      sessionMenuFixture.copy.menuEmptyBody
    );
    expect(widgetCopy.pastChatEmpty).toBe(
      sessionMenuFixture.copy.pastChatEmpty
    );
    expect(widgetCopy.sessionNoMessages).toBe(
      sessionMenuFixture.copy.sessionNoMessages
    );
    expect(widgetCopy.sessionJustNow).toBe(
      sessionMenuFixture.copy.sessionJustNow
    );
    expect(widgetCopy.sessionYesterday).toBe(
      sessionMenuFixture.copy.sessionYesterday
    );
    expect(widgetCopy.sessionInvalidTime).toBe(
      sessionMenuFixture.copy.sessionInvalidTime
    );
    expect(widgetCopy.newConversationText).toBe(
      sessionMenuFixture.copy.newConversationText
    );
    expect(widgetCopy.newConversationLabel).toBe(
      sessionMenuFixture.copy.newConversationLabel
    );
  });

  it("shows the last message, or the fallback, cut at fifty characters", () => {
    for (const { expected, lastMessage } of sessionMenuFixture.previews) {
      expect(sessionPreview(lastMessage)).toBe(expected);
    }
  });

  it("reads the time the way the old menu reads it", () => {
    for (const { expected, millisAgo } of sessionMenuFixture.times) {
      const stamp = sessionMenuNow - millisAgo;

      expect(sessionTime(stamp, sessionMenuNow)).toBe(expected);

      const iso = DateTime.formatIso(DateTime.makeUnsafe(stamp));

      expect(sessionTime(iso, sessionMenuNow)).toBe(expected);
    }
  });

  it("falls back to the visitor's calendar date from seven days on", () => {
    const stamp = sessionMenuNow - 604_800_000;

    const calendar = new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
    }).format(stamp);

    expect(calendar).toMatch(/\d/u);
    expect(sessionTime(stamp, sessionMenuNow)).toBe(calendar);
  });

  it("takes the seconds the old read returns as milliseconds, as the old line does", () => {
    expect(sessionTime(oldSecondsStamp, sessionMenuNow)).toBe(
      oldSecondsStampLabel
    );
  });

  it("shows an invalid date when the read gives no time", () => {
    expect(sessionTime(undefined, sessionMenuNow)).toBe(
      sessionMenuFixture.copy.sessionInvalidTime
    );
    expect(sessionTime(null, sessionMenuNow)).toBe(
      sessionMenuFixture.copy.sessionInvalidTime
    );
  });

  it("prefers the last update over the creation time", () => {
    expect(
      sessionStamp({
        created_at: "then",
        id: "conv-1",
        status: "bot",
        updated_at: "now",
      })
    ).toBe("now");

    expect(
      sessionStamp({ created_at: "then", id: "conv-1", status: "bot" })
    ).toBe("then");
  });
});
