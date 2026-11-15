import { describe, expect, it } from "@effect/vitest";

import {
  decodeHrefEntities,
  renderChatMarkdown,
} from "../src/widget/markdown.js";

const entities = [
  ["&amp;", "&"],
  ["&quot;", '"'],
  ["&#39;", "'"],
] as const;

const decodeOnce = (value: string): string => {
  const parts: string[] = [];
  let index = 0;

  while (index < value.length) {
    const found = entities.find(([name]) => value.startsWith(name, index));

    if (found === undefined) {
      parts.push(value.charAt(index));
      index += 1;
      continue;
    }

    parts.push(found[1]);
    index += found[0].length;
  }

  return parts.join("");
};

const fragments = [
  "&",
  "amp",
  "quot",
  "#39",
  ";",
  "&amp;",
  "&quot;",
  "&#39;",
  "lt",
  "<",
  ">",
  '"',
  "'",
  "a",
  "/help/",
  "javascript:",
  " ",
];

const nextRandom = (seed: number): (() => number) => {
  let state = seed;

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;

    return state / 4_294_967_296;
  };
};

const generated = (count: number): readonly string[] => {
  const next = nextRandom(9_171);

  return Array.from({ length: count }, () => {
    const length = 1 + Math.floor(next() * 12);
    let value = "";

    for (let index = 0; index < length; index += 1) {
      value += fragments[Math.floor(next() * fragments.length)] ?? "";
    }

    return value;
  });
};

describe("chat markdown href decoding", () => {
  it("decodes exactly one layer", () => {
    expect(decodeHrefEntities("&amp;quot;")).toBe("&quot;");
    expect(decodeHrefEntities("&amp;amp;")).toBe("&amp;");
    expect(decodeHrefEntities("&amp;&quot;&#39;")).toBe("&\"'");
    expect(decodeHrefEntities("&lt;")).toBe("&lt;");
    expect(decodeHrefEntities("https://hypertask.ai?a=1&amp;b=2")).toBe(
      "https://hypertask.ai?a=1&b=2"
    );
  });

  it("leaves a nested entity escaped, so a second pass cannot open markup", () => {
    const once = decodeHrefEntities("&amp;lt;script&amp;gt;");

    expect(once).toBe("&lt;script&gt;");
    expect(once.startsWith("<")).toBe(false);
  });

  it("matches a single left to right pass over every generated string", () => {
    for (const value of generated(500)) {
      expect(decodeHrefEntities(value)).toBe(decodeOnce(value));
    }
  });

  it("never turns a generated string into an anchor that leaves the attribute", () => {
    for (const value of generated(500)) {
      const html = renderChatMarkdown(`[link](${value})`);

      for (const match of html.matchAll(/<a\b[^>]*href="(?<href>[^"]*)"/gu)) {
        const href = match.groups?.href ?? "";

        expect(href.includes("<")).toBe(false);
        expect(/^(?:javascript|data|vbscript):/iu.test(href)).toBe(false);
      }
    }
  });
});
