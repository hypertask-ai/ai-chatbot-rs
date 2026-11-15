import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { plainTextOf } from "../src/help-article-html.js";

const isMarkupStart = (character: string): boolean =>
  (character >= "A" && character <= "Z") ||
  (character >= "a" && character <= "z") ||
  character === "/" ||
  character === "!" ||
  character === "?";

const holdsTagOpening = (text: string): boolean => {
  let index = text.indexOf("<");

  while (index !== -1) {
    if (isMarkupStart(text.at(index + 1) ?? "")) {
      return true;
    }

    index = text.indexOf("<", index + 1);
  }

  return false;
};

describe("plain text of an inline fragment", () => {
  it("drops a tag nested inside another tag", () => {
    const nested = "<scr<script>ipt>alert(1)</scr</script>ipt>";

    expect(plainTextOf(nested)).toBe("ipt>alert(1)ipt>");
    expect(holdsTagOpening(plainTextOf(nested))).toBe(false);
  });

  it("drops an unclosed tag without leaving its opening behind", () => {
    for (const fragment of [
      "<b><i>bold",
      "see <b",
      "<script",
      "<kbd>Ctrl",
      "<<<b",
    ]) {
      expect(holdsTagOpening(plainTextOf(fragment)), fragment).toBe(false);
    }

    expect(plainTextOf("<b><i>bold")).toBe("bold");
    expect(plainTextOf("<<<b")).toBe("b");
  });

  it("drops an opening that removing a tag would otherwise expose", () => {
    expect(plainTextOf("<script>a<b")).toBe("ab");
    expect(plainTextOf("<b>see <i")).toBe("see i");
  });

  it("drops a comment and the text inside it", () => {
    expect(plainTextOf("<!-- <script>alert(1)</script> -->kept")).toBe("kept");
    expect(plainTextOf("a<!-- unclosed <script> b")).toBe("a");
  });

  it("reads a > inside an attribute as part of the tag", () => {
    expect(plainTextOf('<a title="a > b">label</a>')).toBe("label");
    expect(plainTextOf("<img alt='x > y' src='z'>shot")).toBe("shot");
  });

  it("keeps text that only looks like a comparison", () => {
    expect(plainTextOf("5 < 6 and 7 > 2")).toBe("5 < 6 and 7 > 2");
    expect(plainTextOf("a << b")).toBe("a << b");
    expect(plainTextOf("press <3 to win")).toBe("press <3 to win");
  });

  it("keeps the words around a tag that a second pass would rebuild", () => {
    expect(plainTextOf("<<script>script>")).toBe("script>");
    expect(plainTextOf("<<scr<script>ipt>ipt>")).toBe("ipt>ipt>");
  });

  it.prop(
    "never leaves a tag opening in the plain text",
    { input: Arbitrary.schema(Schema.String) },
    ({ input }) => {
      expect(holdsTagOpening(plainTextOf(input))).toBe(false);
    }
  );
});
