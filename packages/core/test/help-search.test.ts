import { describe, expect, it } from "@effect/vitest";

import { helpSearchKeywords } from "../src/help-articles.js";

describe("help search keywords", () => {
  it("drops stop words, short words and punctuation", () => {
    expect(
      helpSearchKeywords("How do I use The Board, with all the tasks?")
    ).toEqual(["use", "board", "tasks"]);
  });

  it("keeps a single keyword for a one word query", () => {
    expect(helpSearchKeywords("board")).toEqual(["board"]);
  });

  it("reads at most five keywords", () => {
    expect(
      helpSearchKeywords("alpha bravo charlie delta echo foxtrot")
    ).toEqual(["alpha", "bravo", "charlie", "delta", "echo"]);
  });

  it("answers no keyword for a query of stop words only", () => {
    expect(helpSearchKeywords("the and for")).toEqual([]);
  });

  it("answers no keyword for an empty query", () => {
    expect(helpSearchKeywords("")).toEqual([]);
  });
});
