import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  BUG_FIX_REPRO,
  UNMARKED_REPRO,
  changedFiles,
  existsInRepo,
  isRecordedRepro,
  judgeBugFix,
} from "./bugfix-repro.mjs";
import { checkoutEnv } from "./diff.mjs";

const sentenceBreak = /(?<=[.!?])\s+(?=[A-Z`"'{])/u;

const codeSpan = /`[^`]+`/u;

/**
 * @param {string} text
 * @returns {boolean}
 */
const isFenceMessage = (text) => {
  const [head, fix, ...extra] = text.split(" Fix: ");

  if (head === undefined || fix === undefined || extra.length > 0) {
    return false;
  }

  const [what, ...why] = head.split(sentenceBreak);

  return (
    what !== undefined &&
    why.length > 0 &&
    /[.!?]$/u.test(head) &&
    /[.!?]$/u.test(fix) &&
    codeSpan.test(fix)
  );
};

/**
 * @param {string} cwd
 * @param {string[]} args
 * @returns {string}
 */
const git = (cwd, args) =>
  execFileSync("git", args, { cwd, encoding: "utf-8", env: checkoutEnv() });

/**
 * @returns {string}
 */
const makeRepository = () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "bugfix-repro-"));

  git(cwd, ["init", "--quiet", "--initial-branch=main"]);
  git(cwd, ["config", "user.email", "verifier@example.test"]);
  git(cwd, ["config", "user.name", "Verifier"]);
  git(cwd, ["config", "core.hooksPath", "/dev/null"]);

  return cwd;
};

/**
 * @param {string} cwd
 * @param {string} message
 * @returns {string}
 */
const commit = (cwd, message) => {
  git(cwd, ["add", "--all"]);
  git(cwd, ["commit", "--quiet", "--message", message]);

  return git(cwd, ["rev-parse", "HEAD"]).trim();
};

/**
 * @param {{ body?: string, exists?: (file: string) => boolean, files?: readonly string[], labels?: readonly string[], title: string }} input
 */
const judge = (input) =>
  judgeBugFix({
    body: input.body ?? "",
    exists: input.exists ?? (() => false),
    files: input.files ?? [],
    labels: input.labels ?? [],
    title: input.title,
  });

await test("the refusal tells the author what to add", () => {
  assert.equal(isFenceMessage(BUG_FIX_REPRO), true);
  assert.equal(isFenceMessage(UNMARKED_REPRO), true);
});

await test("a test file and a repro file count, and a source file does not", () => {
  assert.equal(isRecordedRepro("packages/core/test/keep.test.ts"), true);
  assert.equal(isRecordedRepro("verify/bugfix-repro.test.mjs"), true);
  assert.equal(isRecordedRepro("repro/chat-drop.mjs"), true);
  assert.equal(isRecordedRepro("packages/core/repro/chat-drop.md"), true);
  assert.equal(isRecordedRepro("notes.repro.md"), true);
  assert.equal(isRecordedRepro("src/chat.ts"), false);
  assert.equal(isRecordedRepro("../secrets.test.ts"), false);
  assert.equal(isRecordedRepro("/tmp/keep.test.ts"), false);
  assert.equal(isRecordedRepro("repro/../src/chat.ts"), false);
});

await test("a bug fix with no failing test and no repro file fails", () => {
  const report = judge({
    files: ["src/chat.ts"],
    title: "[BUG] chat drops the last line",
  });

  assert.equal(report.ok, false);
  assert.equal(report.required, true);
  assert.equal(report.detail, BUG_FIX_REPRO);
});

await test("a bug label with no repro fails the same way", () => {
  const report = judge({
    labels: ["bug"],
    title: "HTPR-1: chat drops the last line",
  });

  assert.equal(report.ok, false);
  assert.equal(report.detail, BUG_FIX_REPRO);
});

await test("Bug fix: no does not excuse a bug title", () => {
  const report = judge({
    body: "Bug fix: no\n",
    title: "[BUG] chat drops the last line",
  });

  assert.equal(report.ok, false);
  assert.equal(report.detail, BUG_FIX_REPRO);
});

await test("an existing test is enough when the suite already catches the bug", () => {
  const report = judge({
    body: "Repro: packages/core/test/keep.test.ts\n",
    exists: (file) => file === "packages/core/test/keep.test.ts",
    title: "[BUG] chat drops the last line",
  });

  assert.equal(report.ok, true);
  assert.equal(report.detail, "packages/core/test/keep.test.ts");
});

await test("a missing path and a source path are not a repro", () => {
  const missing = judge({
    body: "Repro: packages/core/test/keep.test.ts\n",
    title: "[BUG] chat drops the last line",
  });

  const source = judge({
    body: "Repro: src/chat.ts\n",
    exists: () => true,
    title: "[BUG] chat drops the last line",
  });

  assert.equal(missing.ok, false);
  assert.equal(source.ok, false);
});

await test("a checked-in repro file in the diff passes", () => {
  const report = judge({
    files: ["src/chat.ts", "repro/chat-drop.mjs"],
    title: "[BUG] chat drops the last line",
  });

  assert.equal(report.ok, true);
  assert.equal(report.detail, "repro/chat-drop.mjs");
});

await test("a body that says Bug fix: yes still needs a repro", () => {
  const report = judge({
    body: "Bug fix: yes\n",
    files: ["src/chat.ts"],
    title: "chat drops the last line",
  });

  assert.equal(report.ok, false);
  assert.equal(report.detail, BUG_FIX_REPRO);
});

await test("a pull request that says it is not a bug fix passes", () => {
  const report = judge({
    body: "Bug fix: no\n",
    files: ["src/chat.ts"],
    title: "[INFRA] HEFE-88 record the repro",
  });

  assert.equal(report.ok, true);
  assert.equal(report.required, false);
  assert.equal(report.detail, "not a bug fix");
});

await test("a pull request that says neither fails", () => {
  const report = judge({
    files: ["README.md"],
    title: "[INFRA] record the repro",
  });

  assert.equal(report.ok, false);
  assert.equal(report.required, true);
  assert.equal(report.detail, UNMARKED_REPRO);
});

await test("a deleted test is not a recorded repro", () => {
  const cwd = makeRepository();

  try {
    writeFileSync(path.join(cwd, "old.test.mjs"), "test\n");

    const base = commit(cwd, "add test");

    rmSync(path.join(cwd, "old.test.mjs"));

    const head = commit(cwd, "remove test");

    const files = changedFiles(cwd, base, head);

    assert.deepEqual(files, []);

    const report = judgeBugFix({
      body: "",
      exists: (file) => existsInRepo(cwd, file),
      files,
      labels: [],
      title: "[BUG] drop the test",
    });

    assert.equal(report.ok, false);
    assert.equal(report.detail, BUG_FIX_REPRO);
  } finally {
    rmSync(cwd, { force: true, recursive: true });
  }
});

await test("files changed on the base after the branch point are not this pull request", () => {
  const cwd = makeRepository();

  try {
    writeFileSync(path.join(cwd, "readme.md"), "root\n");

    commit(cwd, "root");

    git(cwd, ["checkout", "--quiet", "-b", "feature"]);

    writeFileSync(path.join(cwd, "app.js"), "app\n");

    const head = commit(cwd, "app");

    git(cwd, ["checkout", "--quiet", "main"]);

    writeFileSync(path.join(cwd, "other.js"), "other\n");

    const base = commit(cwd, "other");

    assert.deepEqual(changedFiles(cwd, base, head), ["app.js"]);
  } finally {
    rmSync(cwd, { force: true, recursive: true });
  }
});

await test("the command fails a bug fix that has no repro and passes one that names an existing test", () => {
  const cwd = makeRepository();

  try {
    mkdirSync(path.join(cwd, "packages/core/test"), { recursive: true });

    writeFileSync(path.join(cwd, "packages/core/test/keep.test.ts"), "test\n");

    writeFileSync(path.join(cwd, "src.js"), "before\n");

    const base = commit(cwd, "base");

    writeFileSync(path.join(cwd, "src.js"), "after\n");

    const head = commit(cwd, "fix");

    const prJson = path.join(cwd, "pr.json");

    const script = path.join(import.meta.dirname, "bugfix-repro.mjs");

    /**
     * @param {string} body
     */
    const run = (body) => {
      writeFileSync(
        prJson,
        JSON.stringify({
          body,
          labels: [{ color: "d73a4a", id: "1", name: "bug" }],
          title: "[BUG] chat drops the last line",
        })
      );

      return spawnSync(
        process.execPath,
        [
          script,
          "--pr-json",
          prJson,
          "--repo",
          cwd,
          "--base",
          base,
          "--head",
          head,
        ],
        { encoding: "utf-8" }
      );
    };

    const failed = run("");

    assert.equal(failed.status, 1);
    assert.equal(failed.stderr.trim(), BUG_FIX_REPRO);

    const passed = run("Repro: packages/core/test/keep.test.ts\n");

    assert.equal(passed.status, 0);
    assert.equal(passed.stdout.trim(), "packages/core/test/keep.test.ts");
  } finally {
    rmSync(cwd, { force: true, recursive: true });
  }
});
