import { describe, expect, it } from "@effect/vitest";

import { parityUrl } from "../../../scripts/help-parity-url.js";

const paths = [
  "/help/filter-tasks-by-star-status",
  "/help/sort-tasks-by-last-updated-status",
  "/help/using-the-forward-slash-menu-in-task-descriptions-and-comments",
  "/help?category=Features%20%26%20How-To#all",
  "/api/articles",
  "/api/chat/history/visitor%2Fconversation",
  "/api/chat/message",
  "/widget/chat",
  "/help/unknown/",
  "/",
];

describe("parity request addresses", () => {
  it.each(paths)("keeps %s under the preview mount", (path) => {
    for (const base of [
      "https://help.hypertask.ai/ratstack",
      "https://help.hypertask.ai/ratstack/",
    ]) {
      expect(parityUrl({ base, path })).toBe(
        `https://help.hypertask.ai/ratstack${path}`
      );
    }
  });

  it.each(paths)("keeps %s at the live origin root", (path) => {
    for (const base of [
      "https://help.hypertask.ai",
      "https://help.hypertask.ai/",
    ]) {
      expect(parityUrl({ base, path })).toBe(
        `https://help.hypertask.ai${path}`
      );
    }
  });

  it("keeps a nested preview mount instead of replacing its final segment", () => {
    expect(
      parityUrl({
        base: "https://example.com/previews/help",
        path: "/help/filter-tasks-by-star-status",
      })
    ).toBe(
      "https://example.com/previews/help/help/filter-tasks-by-star-status"
    );
  });
});
