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

const entityAt = (
  value: string,
  index: number
): readonly [string, string] | undefined => {
  for (const entry of entities) {
    if (value.startsWith(entry[0], index)) {
      return entry;
    }
  }

  return undefined;
};

const decodeOnce = (value: string): string => {
  const parts: string[] = [];
  let index = 0;

  while (index < value.length) {
    const found = entityAt(value, index);

    if (found === undefined) {
      parts.push(value.at(index) ?? "");
      index += 1;
      continue;
    }

    parts.push(found[1]);
    index += found[0].length;
  }

  return parts.join("");
};

const tokens = [
  "&",
  "amp;",
  "quot;",
  "#39;",
  "lt;",
  "<",
  '"',
  "java",
  "script:",
];

const generated = (depth: number): readonly string[] => {
  let values: readonly string[] = [""];

  for (let level = 0; level < depth; level += 1) {
    const next: string[] = [];

    for (const value of values) {
      for (const token of tokens) {
        next.push(value + token);
      }
    }

    values = next;
  }

  return values;
};

const allowedHref = /^(?:https?:\/\/|mailto:|\/help\/)/iu;

const hrefsOf = (html: string): readonly string[] => {
  const hrefs: string[] = [];

  for (const match of html.matchAll(/<a\b[^>]*href="(?<href>[^"]*)"/gu)) {
    hrefs.push(match.groups?.href ?? "");
  }

  return hrefs;
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
    for (const value of generated(4)) {
      expect(decodeHrefEntities(value)).toBe(decodeOnce(value));
    }
  });

  it("never renders an anchor that leaves the attribute or the allowed schemes", () => {
    for (const value of generated(4)) {
      for (const href of hrefsOf(renderChatMarkdown(`[link](${value})`))) {
        expect(href.includes("<")).toBe(false);
        expect(allowedHref.test(href)).toBe(true);
      }
    }
  });
});
