// @effect-diagnostics nodeBuiltinImport:off -- This Node CLI reads the release trace from disk and stops the publish.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";

import { Schema } from "effect";

import {
  readFeatureMapPaths,
  traceBaseName,
  traceCommit,
  traceMapPath,
  traceOutDir,
} from "./publish-trace-paths.ts";

const missingTrace =
  "Release trace missing. This commit has no browser trace, so the publish stops before deploy. Fix: run `node scripts/publish-trace.ts` for this commit before the deploy step.";

const otherCommit =
  "Release trace is for another commit. This publish stops before deploy because the trace does not name the commit being released. Fix: set `TRACE_COMMIT` to that commit and run `node scripts/publish-trace.ts` again.";

const skippedPath =
  "Release trace skips a feature-map path. This publish stops before deploy because the trace did not visit every address in the feature map. Fix: run `node scripts/publish-trace.ts` so the zip contains every path in `verify/feature-map.md`.";

const unreadableTrace =
  "Release trace is unreadable. This publish stops before deploy because the zip has no Playwright trace. Fix: run `node scripts/publish-trace.ts` again for this commit.";

const unsetCommit =
  "Release commit is unset. This publish stops before deploy because the trace gate has no commit to match. Fix: set `TRACE_COMMIT` to the commit being published.";

const Visit = Schema.Struct({
  path: Schema.String,
  url: Schema.String,
});

const Manifest = Schema.Struct({
  commit: Schema.String,
  visits: Schema.Array(Visit),
});

const decodeManifest = Schema.decodeUnknownSync(
  Schema.fromJsonString(Manifest)
);

const centralSignature = 0x02_01_4b_50;

const endSignature = 0x06_05_4b_50;

const pathCharacter = /[A-Za-z0-9/._~-]/u;

const otherTrace = /^help-site-trace-[0-9a-f]{40}\.zip$/u;

const stop = (message: string): number => {
  process.stderr.write(`${message}\n`);

  return 1;
};

const namesIn = (directory: string): readonly string[] => {
  try {
    return readdirSync(directory);
  } catch {
    return [];
  }
};

const endOfCentralDirectory = (zip: Buffer): number => {
  const earliest = Math.max(0, zip.length - 22 - 65_535);

  for (let offset = zip.length - 22; offset >= earliest; offset -= 1) {
    if (zip.readUInt32LE(offset) === endSignature) {
      return offset;
    }
  }

  return -1;
};

const entryText = (
  zip: Buffer,
  localOffset: number,
  method: number,
  compressed: number
): string | undefined => {
  if (localOffset < 0 || localOffset + 30 > zip.length) {
    return undefined;
  }

  const nameLength = zip.readUInt16LE(localOffset + 26);
  const extraLength = zip.readUInt16LE(localOffset + 28);
  const start = localOffset + 30 + nameLength + extraLength;
  const end = start + compressed;

  if (end > zip.length) {
    return undefined;
  }

  const payload = zip.subarray(start, end);

  if (method === 0) {
    return payload.toString("utf-8");
  }

  if (method === 8) {
    try {
      return inflateRawSync(payload).toString("utf-8");
    } catch {
      return undefined;
    }
  }

  return undefined;
};

const isTraceEntry = (name: string): boolean =>
  name.endsWith("trace.trace") || name.endsWith("trace.network");

const traceText = (zip: Buffer): string | undefined => {
  if (zip.length < 22) {
    return undefined;
  }

  const end = endOfCentralDirectory(zip);

  if (end < 0) {
    return undefined;
  }

  const count = zip.readUInt16LE(end + 10);
  let cursor = zip.readUInt32LE(end + 16);
  const parts: string[] = [];

  for (let index = 0; index < count; index += 1) {
    if (
      cursor + 46 > zip.length ||
      zip.readUInt32LE(cursor) !== centralSignature
    ) {
      return undefined;
    }

    const method = zip.readUInt16LE(cursor + 10);
    const compressed = zip.readUInt32LE(cursor + 20);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const localOffset = zip.readUInt32LE(cursor + 42);
    const name = zip.toString("utf-8", cursor + 46, cursor + 46 + nameLength);

    cursor += 46 + nameLength + extraLength + commentLength;

    if (!isTraceEntry(name)) {
      continue;
    }

    const text = entryText(zip, localOffset, method, compressed);

    if (text === undefined) {
      return undefined;
    }

    parts.push(text);
  }

  return parts.length === 0 ? undefined : parts.join("\n");
};

const requestTarget = (url: string): string | undefined => {
  try {
    const parsed = new URL(url);

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return undefined;
  }
};

const wireUrl = (url: string): string | undefined => {
  try {
    const parsed = new URL(url);

    return `${parsed.origin}${parsed.pathname}${parsed.search}`;
  } catch {
    return undefined;
  }
};

const wireRecorded = (text: string, wire: string): boolean => {
  let from = 0;

  while (from <= text.length) {
    const at = text.indexOf(wire, from);

    if (at === -1) {
      return false;
    }

    const next = text[at + wire.length];

    if (next === undefined || !pathCharacter.test(next)) {
      return true;
    }

    from = at + wire.length;
  }

  return false;
};

const visitsCover = (
  paths: readonly string[],
  visits: readonly { readonly path: string; readonly url: string }[],
  text: string
): boolean => {
  if (paths.length === 0) {
    return false;
  }

  const byPath = new Map(visits.map((visit) => [visit.path, visit]));

  return paths.every((visitPath) => {
    const visit = byPath.get(visitPath);
    const wire = visit === undefined ? undefined : wireUrl(visit.url);

    return (
      visit !== undefined &&
      requestTarget(visit.url) === visitPath &&
      wire !== undefined &&
      wireRecorded(text, wire)
    );
  });
};

const gate = (): number => {
  const commit = traceCommit();

  if (commit === undefined) {
    return stop(unsetCommit);
  }

  const directory = traceOutDir();
  const base = traceBaseName(commit);
  const zipPath = path.join(directory, `${base}.zip`);
  const manifestPath = path.join(directory, `${base}.json`);

  if (!existsSync(zipPath) || !existsSync(manifestPath)) {
    const namedForAnotherCommit = namesIn(directory).some((name) =>
      otherTrace.test(name)
    );

    return stop(namedForAnotherCommit ? otherCommit : missingTrace);
  }

  let manifest: ReturnType<typeof decodeManifest>;

  try {
    manifest = decodeManifest(readFileSync(manifestPath, "utf-8"));
  } catch {
    return stop(unreadableTrace);
  }

  if (manifest.commit !== commit) {
    return stop(otherCommit);
  }

  const text = traceText(readFileSync(zipPath));

  if (text === undefined) {
    return stop(unreadableTrace);
  }

  const paths = readFeatureMapPaths(traceMapPath());

  if (!visitsCover(paths, manifest.visits, text)) {
    return stop(skippedPath);
  }

  process.stdout.write(
    `Trace ${commit} covers ${String(paths.length)} feature-map paths.\n`
  );

  return 0;
};

const invokedDirectly = (): boolean => {
  const [, entry] = process.argv;

  return entry !== undefined && path.resolve(entry) === import.meta.filename;
};

if (invokedDirectly()) {
  process.exitCode = gate();
}
