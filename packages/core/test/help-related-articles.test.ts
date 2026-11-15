import { describe, expect, it } from "@effect/vitest";

import type { HelpArticleSummaryValue } from "../src/help-article-store.js";
import { relatedHelpArticles } from "../src/help-related-articles.js";

const article = (
  slug: string,
  title: string,
  category: string | null
): HelpArticleSummaryValue => ({
  category,
  created_at: 0,
  excerpt: "",
  id: slug,
  slug,
  title,
});

const slugsOf = (
  list: readonly { readonly slug: string }[]
): readonly string[] => list.map((entry) => entry.slug);

describe("help related articles", () => {
  it("lists the current article's category by title, without the current article", () => {
    const current = article("board-settings", "Board Settings", "Boards");
    const list = [
      article("boards", "Boards & Sections", "Boards"),
      current,
      article("calendar", "Calendar", "Boards"),
      article("bulk", "Bulk Actions", "Boards"),
      article("filters", "Filters", "Boards"),
      article("agents", "Agents", "Agents"),
    ];

    const related = relatedHelpArticles({ article: current, list });

    expect(slugsOf(related)).toEqual(["boards", "bulk", "calendar"]);
  });

  it("adds up to two articles from other categories that hold a title keyword", () => {
    const current = article("boards", "Boards & Sections", "Boards");
    const list = [
      current,
      article("board-visibility", "Board & Subtask Visibility", "Boards"),
      article("calendar", "Calendar", "Boards"),
      article("moving", "Moving Tasks Between Boards", "Features"),
      article("switching", "Switching Boards Quickly", "Features"),
      article("inbox", "Inbox", "Features"),
    ];

    const related = relatedHelpArticles({ article: current, list });

    expect(slugsOf(related)).toEqual([
      "board-visibility",
      "calendar",
      "moving",
      "switching",
    ]);
  });

  it("caps the same category picks at three and the keyword picks at two", () => {
    const current = article("focus", "Board Focus", "Boards");
    const list = [
      article("a", "A", "Boards"),
      article("b", "B", "Boards"),
      article("c", "C", "Boards"),
      article("d", "D", "Boards"),
      current,
      article("e", "Board A", "Elsewhere"),
      article("f", "Board B", "Elsewhere"),
      article("g", "Board C", "Elsewhere"),
    ];

    const related = relatedHelpArticles({ article: current, list });

    expect(slugsOf(related)).toEqual(["a", "b", "c", "e", "f"]);
  });

  it("drops stop words, short words and every keyword past the third", () => {
    const current = article(
      "create",
      "How to Create Tasks in Hypertask Keyboard",
      "Boards"
    );
    const list = [
      current,
      article("create-basics", "Create Basics", "Elsewhere"),
      article("how-to", "How To Guide", "Elsewhere"),
      article("keyboard", "Keyboard Shortcuts", "Elsewhere"),
      article("tasks", "Tasks Overview", "Elsewhere"),
    ];

    const related = relatedHelpArticles({ article: current, list });

    expect(slugsOf(related)).toEqual(["create-basics", "tasks"]);
  });

  it("lists same category articles only when the title carries no keyword", () => {
    const current = article("how-do-it", "How to do it", "Boards");
    const list = [
      current,
      article("calendar", "Calendar", "Boards"),
      article("board", "Board", "Elsewhere"),
      article("how-to", "How To Guide", "Elsewhere"),
    ];

    const related = relatedHelpArticles({ article: current, list });

    expect(slugsOf(related)).toEqual(["calendar"]);
  });

  it("lists nothing when the current article has no category", () => {
    const current = article("loose", "Board Loose", null);
    const list = [
      current,
      article("calendar", "Calendar", "Boards"),
      article("board", "Board", "Elsewhere"),
      article("other", "Other", null),
    ];

    expect(relatedHelpArticles({ article: current, list })).toEqual([]);
  });

  it("lists nothing when no other article is in the list", () => {
    const current = article("only", "Only", "Boards");

    expect(relatedHelpArticles({ article: current, list: [current] })).toEqual(
      []
    );
  });

  it("matches a keyword the way SQL LIKE does, with the underscore wildcard", () => {
    const current = article("task-list", "Task_List Guide", "Boards");
    const list = [
      current,
      article("task-list-page", "Task List", "Elsewhere"),
      article("task-x-list", "TaskXList", "Elsewhere"),
    ];

    const related = relatedHelpArticles({ article: current, list });

    expect(slugsOf(related)).toEqual(["task-list-page", "task-x-list"]);
  });

  it("matches a keyword the way SQL LIKE does, with the percent wildcard", () => {
    const current = article("off", "Save 50%off today", "Boards");
    const list = [
      current,
      article("discount", "Save 50 percent off now", "Elsewhere"),
      article("short", "Save 50Xoff now", "Elsewhere"),
    ];

    const related = relatedHelpArticles({ article: current, list });

    expect(slugsOf(related)).toEqual(["discount", "short"]);
  });

  it("orders titles the way the old database orders text, upper case first", () => {
    const current = article("focus", "Focus", "Boards");
    const list = [
      current,
      article("apple", "apple", "Boards"),
      article("zebra", "Zebra", "Boards"),
      article("beta", "Beta", "Boards"),
      article("alpha", "alpha", "Boards"),
    ];

    const related = relatedHelpArticles({ article: current, list });

    expect(related.map((entry) => entry.title)).toEqual([
      "Beta",
      "Zebra",
      "alpha",
    ]);
  });
});
