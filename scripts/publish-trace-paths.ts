// @effect-diagnostics nodeBuiltinImport:off -- This Node CLI reads the feature map from disk.
import { readFileSync } from "node:fs";
import path from "node:path";

const addressPath = /`(?<path>\/[^`]*)`/gu;

const commitPattern = /^[0-9a-f]{40}$/u;

const concretePath = (address: string): string =>
  address
    .replaceAll("<slug>", "no-such-article")
    .replaceAll("<id>", "unknown")
    .replaceAll("…", "example")
    .replaceAll("...", "example");

export const featureMapPaths = (markdown: string): readonly string[] => {
  const seen = new Set<string>();
  const paths: string[] = [];

  for (const line of markdown.split("\n")) {
    if (!line.startsWith("|")) {
      continue;
    }

    const cells = line.split("|").map((cell) => cell.trim());
    const address = cells.at(2);

    if (address === undefined) {
      continue;
    }

    for (const match of address.matchAll(addressPath)) {
      const visitPath = concretePath(match.groups?.path ?? "");

      if (visitPath.length === 0 || seen.has(visitPath)) {
        continue;
      }

      seen.add(visitPath);
      paths.push(visitPath);
    }
  }

  return paths;
};

export const traceCommit = (): string | undefined => {
  const value = process.env.TRACE_COMMIT;

  return value !== undefined && commitPattern.test(value) ? value : undefined;
};

export const traceMapPath = (): string =>
  process.env.TRACE_MAP ?? "verify/feature-map.md";

export const traceOutDir = (): string =>
  process.env.TRACE_OUT ?? "verify-traces";

export const traceBaseName = (commit: string): string =>
  `help-site-trace-${commit}`;

export const readFeatureMapPaths = (mapPath: string): readonly string[] =>
  featureMapPaths(readFileSync(mapPath, "utf-8"));

const invokedDirectly = (): boolean => {
  const [, entry] = process.argv;

  return entry !== undefined && path.resolve(entry) === import.meta.filename;
};

if (invokedDirectly()) {
  process.stdout.write(
    `${JSON.stringify(readFeatureMapPaths(traceMapPath()))}\n`
  );
}
