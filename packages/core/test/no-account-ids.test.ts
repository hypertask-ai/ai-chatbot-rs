// @effect-diagnostics nodeBuiltinImport:off -- This test reads repository source files from disk.
import { globSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

const sourceGlobs = [
  "*.{ts,tsx,js,mjs,cjs}",
  "{apps,packages,scripts,verify,tools}/**/*.{ts,tsx,js,mjs,cjs}",
];

const accountIdPattern = /(?<![0-9a-f])[0-9a-f]{32}(?![0-9a-f])/u;

const sourceFiles = () =>
  globSync(sourceGlobs, {
    cwd: repoRoot,
    exclude: (file) =>
      file.includes("node_modules") ||
      file.includes(`${path.sep}dist${path.sep}`),
  });

describe("Cloudflare account ids in source", () => {
  it("keeps every account id in the environment, out of source", () => {
    const offenders = sourceFiles().filter((file) =>
      accountIdPattern.test(readFileSync(path.join(repoRoot, file), "utf-8"))
    );

    expect(offenders).toEqual([]);
  });
});
