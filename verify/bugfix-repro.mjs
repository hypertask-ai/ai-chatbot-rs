import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { Schema } from "effect";

import { checkoutEnv } from "./diff.mjs";

const COMMIT = /^[0-9a-f]{40}$/u;

const PATH_SEGMENT = /^[A-Za-z0-9._-]+$/u;

const TEST_FILE =
  /^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.(?:test|spec)\.[cm]?[jt]sx?$/u;

const REPRO_FILE =
  /^(?:[A-Za-z0-9._-]+\/)*repro\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$|^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.repro\.[A-Za-z0-9._-]+$/u;

const BUG_TITLE = /\[bug\]/iu;

const BUG_YES = /^[ \t]*bug fix:[ \t]*yes[ \t]*$/imu;

const BUG_NO = /^[ \t]*bug fix:[ \t]*no[ \t]*$/imu;

const USAGE =
  "usage: node verify/bugfix-repro.mjs --pr-json <file> --repo <dir> --base <sha> --head <sha>";

export const BUG_FIX_REPRO =
  "Bug fix has no recorded repro. A later run cannot show the old failure. Fix: add `Repro: <path>` for an existing test or a `repro/` file, or add that file in this diff.";

export const UNMARKED_REPRO =
  "Pull request never says whether it is a bug fix. A bug fix with no repro can merge. Fix: add `Bug fix: no`, or add `Repro: <path>` for an existing test or a `repro/` file.";

/**
 * @param {string} file
 * @returns {boolean}
 */
export const isRecordedRepro = (file) => {
  if (file.length === 0 || file.length > 512) {
    return false;
  }

  const parts = file.split("/");

  if (
    !parts.every(
      (part) => part !== "." && part !== ".." && PATH_SEGMENT.test(part)
    )
  ) {
    return false;
  }

  return TEST_FILE.test(file) || REPRO_FILE.test(file);
};

/**
 * @param {string} title
 * @param {readonly string[]} labels
 * @param {string} body
 * @returns {boolean}
 */
const claimsBugFix = (title, labels, body) =>
  BUG_TITLE.test(title) ||
  labels.some((label) => label.trim().toLowerCase() === "bug") ||
  BUG_YES.test(body);

/**
 * @param {string} body
 * @returns {string[]}
 */
const reproPaths = (body) => {
  /** @type {string[]} */
  const found = [];

  for (const match of body.matchAll(
    /^[ \t]*repro:[ \t]+`?(?<file>[^`\s]+)`?[ \t]*$/gimu
  )) {
    const file = match.groups?.file;

    if (file !== undefined) {
      found.push(file);
    }
  }

  return found;
};

/**
 * @param {{ body: string, exists: (file: string) => boolean, files: readonly string[], labels: readonly string[], title: string }} input
 * @returns {{ detail: string, ok: boolean, required: boolean }}
 */
export const judgeBugFix = (input) => {
  const linked = reproPaths(input.body).filter(
    (file) => isRecordedRepro(file) && input.exists(file)
  );

  const changed = input.files.filter((file) => isRecordedRepro(file));

  const recorded = linked.length > 0 || changed.length > 0;

  const sample = linked.at(0) ?? changed.at(0) ?? "";

  if (claimsBugFix(input.title, input.labels, input.body)) {
    if (recorded) {
      return { detail: sample, ok: true, required: true };
    }

    return { detail: BUG_FIX_REPRO, ok: false, required: true };
  }

  if (BUG_NO.test(input.body)) {
    return { detail: "not a bug fix", ok: true, required: false };
  }

  if (recorded) {
    return { detail: sample, ok: true, required: false };
  }

  return { detail: UNMARKED_REPRO, ok: false, required: true };
};

/**
 * @param {string} repo
 * @param {string} file
 * @returns {boolean}
 */
export const existsInRepo = (repo, file) => {
  if (!isRecordedRepro(file)) {
    return false;
  }

  const root = path.resolve(repo);

  const target = path.resolve(root, file);

  const inside = target === root || target.startsWith(`${root}${path.sep}`);

  if (!inside || !existsSync(target)) {
    return false;
  }

  return statSync(target).isFile();
};

/**
 * @param {string} cwd
 * @param {string[]} args
 * @returns {import("node:child_process").SpawnSyncReturns<string>}
 */
const git = (cwd, args) => {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf-8",
    env: checkoutEnv(),
    maxBuffer: 8_388_608,
  });

  if (result.error !== undefined) {
    throw new Error(
      `git ${args.join(" ")} did not run: ${String(result.error)}`
    );
  }

  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} exited ${String(result.status)}: ${result.stderr.trim()}`
    );
  }

  return result;
};

/**
 * @param {string} sha
 * @param {string} label
 * @returns {void}
 */
const assertCommit = (sha, label) => {
  if (!COMMIT.test(sha)) {
    throw new Error(`${label} is not a full commit SHA`);
  }
};

/**
 * @param {string} cwd
 * @param {string} base
 * @param {string} head
 * @returns {string | null}
 */
const mergeBaseOf = (cwd, base, head) => {
  const result = spawnSync("git", ["merge-base", base, head], {
    cwd,
    encoding: "utf-8",
    env: checkoutEnv(),
    maxBuffer: 8_388_608,
  });

  if (result.status !== 0) {
    return null;
  }

  const found = result.stdout.trim();

  return COMMIT.test(found) ? found : null;
};

/**
 * @param {string} repo
 * @param {string} base
 * @param {string} head
 * @returns {string[]}
 */
export const changedFiles = (repo, base, head) => {
  assertCommit(base, "base");

  assertCommit(head, "head");

  const cwd = path.resolve(repo);

  const mergeBase = mergeBaseOf(cwd, base, head);

  const range = mergeBase === null ? [base, head] : [mergeBase, head];

  const output = git(cwd, [
    "diff",
    "-z",
    "--name-only",
    "--diff-filter=ACMR",
    ...range,
  ]).stdout;

  return output.split("\0").filter((line) => line !== "");
};

const PullRequestFile = Schema.Struct({
  body: Schema.NullOr(Schema.String),
  labels: Schema.Array(Schema.Struct({ name: Schema.String })),
  title: Schema.String,
});

const decodePullRequest = Schema.decodeUnknownSync(
  Schema.fromJsonString(PullRequestFile)
);

/**
 * @param {string} file
 * @returns {{ body: string, labels: string[], title: string }}
 */
const readPullRequest = (file) => {
  const parsed = decodePullRequest(readFileSync(file, "utf-8"));

  return {
    body: parsed.body ?? "",
    labels: parsed.labels.map((label) => label.name),
    title: parsed.title,
  };
};

/**
 * @param {string[]} args
 * @param {string} name
 * @returns {string | undefined}
 */
const optionValue = (args, name) => {
  const index = args.indexOf(name);

  return index === -1 ? undefined : args[index + 1];
};

/**
 * @returns {void}
 */
const main = () => {
  const args = process.argv.slice(2);

  const prJson = optionValue(args, "--pr-json");

  const repo = optionValue(args, "--repo");

  const base = optionValue(args, "--base");

  const head = optionValue(args, "--head");

  if (
    prJson === undefined ||
    repo === undefined ||
    base === undefined ||
    head === undefined
  ) {
    console.error(USAGE);

    process.exitCode = 2;

    return;
  }

  try {
    const pullRequest = readPullRequest(prJson);

    const report = judgeBugFix({
      body: pullRequest.body,
      exists: (file) => existsInRepo(repo, file),
      files: changedFiles(repo, base, head),
      labels: pullRequest.labels,
      title: pullRequest.title,
    });

    if (!report.ok) {
      console.error(report.detail);

      process.exitCode = 1;

      return;
    }

    console.log(report.detail);
  } catch (error) {
    console.error(`bug fix repro failed: ${String(error)}`);

    process.exitCode = 1;
  }
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
