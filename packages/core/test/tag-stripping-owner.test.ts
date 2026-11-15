// @effect-diagnostics nodeBuiltinImport:off -- This test reads every source file in the repository from disk.
import { globSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

const owner = "packages/core/src/help-article-html.ts";

const sourcePatterns = [
  "apps/**/*.ts",
  "apps/**/*.tsx",
  "packages/**/*.ts",
  "packages/**/*.tsx",
  "scripts/**/*.ts",
  "scripts/**/*.js",
  "scripts/**/*.mjs",
  "tools/**/*.ts",
  "verify/**/*.ts",
  "verify/**/*.mjs",
];

const TAG_BINDING =
  /^\s*(?:const|let|var)?\s*(?<name>[A-Za-z_$][\w$]*)\s*[:=]\s*\/(?<pattern>.+)\/(?<flags>[a-z]*)\s*[,;]?\s*$/mu;

const REMOVAL =
  /\.replace(?:All)?\(\s*(?<target>[^,]+?)\s*,\s*(?:""|" "|''|' ')\s*\)/gu;

const IDENTIFIER = /[A-Za-z_$][\w$]*/gu;

const matchesHtmlTag = (pattern: string): boolean => pattern.includes("<");

interface TagBinding {
  readonly line: number;
  readonly name: string;
}

const tagBindingsOf = (lines: readonly string[]): readonly TagBinding[] =>
  lines.flatMap((text, at) => {
    const match = TAG_BINDING.exec(text);

    return matchesHtmlTag(match?.groups?.pattern ?? "")
      ? [{ line: at + 1, name: match?.groups?.name ?? "" }]
      : [];
  });

const tagStrippingLines = (source: string): readonly number[] => {
  const lines = source.split("\n");
  const bindings = tagBindingsOf(lines);
  const found = new Set<number>();

  for (const [at, text] of lines.entries()) {
    for (const match of text.matchAll(REMOVAL)) {
      const target = (match.groups?.target ?? "").trim();

      if (target.startsWith("/")) {
        if (matchesHtmlTag(target)) {
          found.add(at + 1);
        }

        continue;
      }

      const names = target.match(IDENTIFIER) ?? [];

      for (const binding of bindings) {
        if (names.includes(binding.name)) {
          found.add(binding.line);
        }
      }
    }
  }

  return [...found].toSorted((left, right) => left - right);
};

const sourceFiles = (): readonly string[] =>
  globSync(sourcePatterns, {
    cwd: repoRoot,
    exclude: (file) => file.includes("node_modules"),
  })
    .filter((file) => file !== owner)
    .toSorted();

describe("the one owner for HTML tag stripping", () => {
  it("catches a file that removes tags with a regex", () => {
    const removed = String.raw`  tag: /<[^>]*>/gu,
  html.replaceAll(patterns.tag, "");`;

    expect(tagStrippingLines(removed)).toEqual([1]);
  });

  it("reports no tag stripping outside the owner", () => {
    const offenders = sourceFiles().flatMap((file) =>
      tagStrippingLines(readFileSync(path.join(repoRoot, file), "utf-8")).map(
        (line) => `${file}:${line}`
      )
    );

    expect(
      offenders,
      `Strip HTML tags with \`plainTextOf\` from \`${owner}\`, never with a regex.`
    ).toEqual([]);
  });
});
