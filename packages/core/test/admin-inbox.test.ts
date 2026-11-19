import { describe, expect, it } from "@effect/vitest";

import {
  archiveIdsOf,
  inboxQueryOf,
  lastSeenOf,
  unreadOf,
} from "../src/admin-conversations.js";

const BOT_ROW = {
  archived: 0,
  created_at: 950,
  has_hypertask_account: "unknown",
  id: "conv-bot",
  is_eval: 0,
  last_message: "How do I archive",
  last_message_role: "user",
  last_message_time: 6000,
  message_count: 1,
  profile_completed: 0,
  status: "bot",
  updated_at: 80_000,
  visitor_email: null,
  visitor_id: "v-bot",
  visitor_name: null,
};

describe("the inbox inputs", () => {
  it("reads the last seen map the admin page sends", () => {
    expect([
      lastSeenOf(),
      lastSeenOf('{"conv-bot":6000}'),
      lastSeenOf('{"conv-bot":6000,"conv-x":1}'),
    ]).toEqual([{}, { "conv-bot": 6000 }, { "conv-bot": 6000, "conv-x": 1 }]);
  });

  it("keeps nothing read when the last seen map is unreadable", () => {
    expect([
      lastSeenOf("not json"),
      lastSeenOf('["conv-bot"]'),
      lastSeenOf('{"conv-bot":"6000"}'),
      lastSeenOf(""),
    ]).toEqual([{}, {}, {}, {}]);
  });

  it("shows a conversation as unread only when the visitor wrote last", () => {
    expect([
      unreadOf(BOT_ROW, {}),
      unreadOf(BOT_ROW, { "conv-bot": 5999 }),
      unreadOf(BOT_ROW, { "conv-bot": 6000 }),
      unreadOf(BOT_ROW, { "conv-bot": 6001 }),
      unreadOf({ ...BOT_ROW, last_message_role: "admin" }, {}),
      unreadOf({ ...BOT_ROW, last_message_time: null }, {}),
    ]).toEqual([true, true, false, false, false, false]);
  });

  it("shows the archived tab only for the archived flag", () => {
    expect([
      inboxQueryOf("true"),
      inboxQueryOf(),
      inboxQueryOf("TRUE"),
      inboxQueryOf("false"),
    ]).toEqual([
      { archived: true },
      { archived: false },
      { archived: false },
      { archived: false },
    ]);
  });
});

describe("the bulk archive input", () => {
  it("keeps every id in the order the page sent it", () => {
    expect(archiveIdsOf(["conv-a", "conv-b"])).toEqual(["conv-a", "conv-b"]);
  });

  it("turns numeric ids into the text the old bind accepted", () => {
    expect(archiveIdsOf([1, 2])).toEqual(["1", "2"]);
  });

  it("refuses an empty list, another shape and a non scalar id", () => {
    expect([
      archiveIdsOf(),
      archiveIdsOf([]),
      archiveIdsOf("conv-a"),
      archiveIdsOf({ ids: ["conv-a"] }),
      archiveIdsOf(["conv-a", { id: "conv-b" }]),
      archiveIdsOf([true]),
    ]).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });
});
