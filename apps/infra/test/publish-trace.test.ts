// @effect-diagnostics nodeBuiltinImport:off -- The gate is a Node script. This test runs that script and reads the workflow file.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";

import { expect, it } from "@effect/vitest";

const repo = fileURLToPath(new URL("../../..", import.meta.url));

const featureMapPaths = [
  "/",
  "/en",
  "/en/anything",
  "/health",
  "/help",
  "/help?category=example",
  "/help#all",
  "/help/no-such-article",
  "/help/pricing-plans",
  "/api/articles",
  "/api/articles/no-such-article",
  "/api/articles/search/invite",
  "/api/help-reader/no-such-article",
  "/api/help-reader/pricing-plans",
  "/api/chat/history/unknown-without-secret",
  "/api/chat/debug-rag?q=invite",
  "/widget/widget.js",
  "/widget/chat",
  "/admin",
  "/admin/changelog",
  "/admin#conv=unknown",
  "/admin/api/usage?days=7",
  "/admin/api/customers/conversations?email=example",
] as const;

const commit = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const otherCommit = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const sampleMap = [
  "| Feature | Address to try | What to look for | Old rows |",
  "| --- | --- | --- | --- |",
  "| Home | `/` | the page | F01 |",
  "| Help | `/help` | the page | F03 |",
].join("\n");

const samplePaths = ["/", "/help"] as const;

const wireUrl = (visitPath: string): string =>
  `http://127.0.0.1:9${visitPath === "/" ? "/" : visitPath}`;

const u16 = (value: number): Buffer => {
  const bytes = Buffer.alloc(2);

  bytes.writeUInt16LE(value);

  return bytes;
};

const u32 = (value: number): Buffer => {
  const bytes = Buffer.alloc(4);

  bytes.writeUInt32LE(value < 0 ? value + 2 ** 32 : value);

  return bytes;
};

const zipEntry = (
  name: string,
  data: Buffer,
  method: 0 | 8,
  payload: Buffer
): Buffer => {
  const nameBytes = Buffer.from(name);
  const checksum = crc32(data);
  const unsigned = checksum < 0 ? checksum + 2 ** 32 : checksum;

  const local = Buffer.concat([
    u32(0x04_03_4b_50),
    u16(20),
    u16(0),
    u16(method),
    u16(0),
    u16(0),
    u32(unsigned),
    u32(payload.length),
    u32(data.length),
    u16(nameBytes.length),
    u16(0),
    nameBytes,
    payload,
  ]);

  const central = Buffer.concat([
    u32(0x02_01_4b_50),
    u16(20),
    u16(20),
    u16(0),
    u16(method),
    u16(0),
    u16(0),
    u32(unsigned),
    u32(payload.length),
    u32(data.length),
    u16(nameBytes.length),
    u16(0),
    u16(0),
    u16(0),
    u16(0),
    u32(0),
    u32(0),
    nameBytes,
  ]);

  const end = Buffer.concat([
    u32(0x06_05_4b_50),
    u16(0),
    u16(0),
    u16(1),
    u16(1),
    u32(central.length),
    u32(local.length),
    u16(0),
  ]);

  return Buffer.concat([local, central, end]);
};

const storedZip = (text: string): Buffer => {
  const data = Buffer.from(text);

  return zipEntry("trace.trace", data, 0, data);
};

const deflatedZip = (text: string): Buffer => {
  const data = Buffer.from(text);

  return zipEntry("trace.trace", data, 8, deflateRawSync(data));
};

const manifest = (sha: string, paths: readonly string[]): string =>
  `${JSON.stringify({
    commit: sha,
    visits: paths.map((visitPath) => ({
      path: visitPath,
      url: wireUrl(visitPath),
    })),
  })}\n`;

const run = (script: string, env: Readonly<Record<string, string>>) => {
  const result = spawnSync(process.execPath, [script], {
    cwd: repo,
    encoding: "utf-8",
    env: { PATH: process.env.PATH ?? "", ...env },
  });

  return {
    status: result.status,
    stderr: result.stderr,
    stdout: result.stdout,
  };
};

const writeTrace = (
  directory: string,
  sha: string,
  paths: readonly string[],
  zip: Buffer
): void => {
  writeFileSync(
    path.join(directory, `help-site-trace-${sha}.json`),
    manifest(sha, paths)
  );
  writeFileSync(path.join(directory, `help-site-trace-${sha}.zip`), zip);
};

it("names every address in the feature map", () => {
  const result = run("scripts/publish-trace-paths.ts", {});

  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toStrictEqual(featureMapPaths);
});

it("stops the release when this commit has no trace", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "publish-trace-"));
  const map = path.join(directory, "map.md");

  writeFileSync(map, sampleMap);

  const result = run("scripts/publish-trace-gate.ts", {
    TRACE_COMMIT: commit,
    TRACE_MAP: map,
    TRACE_OUT: directory,
  });

  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain(
    "Release trace missing. This commit has no browser trace, so the publish stops before deploy."
  );
  expect(result.stderr).toContain("node scripts/publish-trace.ts");
});

it("stops the release when the trace names another commit", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "publish-trace-"));
  const map = path.join(directory, "map.md");
  const urls = samplePaths.map((visitPath) => wireUrl(visitPath)).join("\n");

  writeFileSync(map, sampleMap);
  writeTrace(directory, otherCommit, samplePaths, storedZip(urls));

  const result = run("scripts/publish-trace-gate.ts", {
    TRACE_COMMIT: commit,
    TRACE_MAP: map,
    TRACE_OUT: directory,
  });

  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("Release trace is for another commit.");
});

it("stops the release when the zip never visited a feature-map path", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "publish-trace-"));
  const map = path.join(directory, "map.md");

  writeFileSync(map, sampleMap);
  writeTrace(
    directory,
    commit,
    samplePaths,
    storedZip("http://127.0.0.1:9/only")
  );

  const result = run("scripts/publish-trace-gate.ts", {
    TRACE_COMMIT: commit,
    TRACE_MAP: map,
    TRACE_OUT: directory,
  });

  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("Release trace skips a feature-map path.");
});

it("accepts a stored trace that visited every feature-map path for this commit", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "publish-trace-"));
  const map = path.join(directory, "map.md");
  const urls = samplePaths.map((visitPath) => wireUrl(visitPath)).join("\n");

  writeFileSync(map, sampleMap);
  writeTrace(directory, commit, samplePaths, storedZip(urls));

  const result = run("scripts/publish-trace-gate.ts", {
    TRACE_COMMIT: commit,
    TRACE_MAP: map,
    TRACE_OUT: directory,
  });

  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
});

it("stops the release when a shorter path only appears inside a longer one", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "publish-trace-"));
  const map = path.join(directory, "map.md");

  const nestedMap = [
    "| Feature | Address to try | What to look for | Old rows |",
    "| --- | --- | --- | --- |",
    "| English | `/en`, `/en/anything` | redirect | F01 |",
  ].join("\n");

  const nestedPaths = ["/en", "/en/anything"] as const;

  writeFileSync(map, nestedMap);
  writeTrace(
    directory,
    commit,
    nestedPaths,
    storedZip(wireUrl("/en/anything"))
  );

  const result = run("scripts/publish-trace-gate.ts", {
    TRACE_COMMIT: commit,
    TRACE_MAP: map,
    TRACE_OUT: directory,
  });

  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("Release trace skips a feature-map path.");
});

it("accepts a deflated Playwright trace for this commit", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "publish-trace-"));
  const map = path.join(directory, "map.md");
  const urls = samplePaths.map((visitPath) => wireUrl(visitPath)).join("\n");

  writeFileSync(map, sampleMap);
  writeTrace(directory, commit, samplePaths, deflatedZip(urls));

  const result = run("scripts/publish-trace-gate.ts", {
    TRACE_COMMIT: commit,
    TRACE_MAP: map,
    TRACE_OUT: directory,
  });

  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
});

it("publishes only after the trace for this commit is uploaded", () => {
  const workflow = readFileSync(
    path.join(repo, ".github/workflows/publish-ratstack.yml"),
    "utf-8"
  );

  const recordAt = workflow.indexOf("node scripts/publish-trace.ts");
  const gateAt = workflow.indexOf("node scripts/publish-trace-gate.ts");

  const artifactAt = workflow.indexOf(
    "help-site-trace-".concat("$", "{{ github.sha }}")
  );

  const deployAt = workflow.indexOf("alchemy deploy");

  expect(recordAt).toBeGreaterThan(-1);
  expect(gateAt).toBeGreaterThan(recordAt);
  expect(artifactAt).toBeGreaterThan(gateAt);
  expect(workflow).toContain("if-no-files-found: error");
  expect(workflow).toContain("actions: write");
  expect(deployAt).toBeGreaterThan(artifactAt);
});
