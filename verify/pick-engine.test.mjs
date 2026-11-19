import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { pickEngine } from "./pick-engine.mjs";

const failClosed =
  "No verifier setting. A missing key would leave pstack-verifier skipped, so a pull request could merge. Fix: add the repository secret `CODEX_AUTH_JSON`, `CODEX_VERIFIER_KEY`, or `CLAUDE_CODE_OAUTH_TOKEN`.";

const script = path.join(import.meta.dirname, "pick-engine.mjs");

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {string[]} args
 * @returns {{ output: string, status: number | null, stderr: string, summary: string }}
 */
const run = (env, args) => {
  const dir = mkdtempSync(path.join(tmpdir(), "pick-engine-"));
  const output = path.join(dir, "output");
  const summary = path.join(dir, "summary");

  const result = spawnSync(process.execPath, [script, ...args], {
    encoding: "utf-8",
    env: {
      ...env,
      GITHUB_OUTPUT: output,
      GITHUB_STEP_SUMMARY: summary,
    },
  });

  return {
    output: readFileSync(output, "utf-8"),
    status: result.status,
    stderr: result.stderr,
    summary: readFileSync(summary, "utf-8"),
  };
};

await test("a missing verifier setting is not a successful engine", () => {
  const picked = pickEngine({});

  assert.equal(picked.ok, false);
  assert.equal(picked.engine, "none");
  assert.equal(picked.codex, "no");
  assert.equal(picked.claude, "no");
});

await test("blank verifier settings are missing", () => {
  const picked = pickEngine({
    CLAUDE_CODE_OAUTH_TOKEN: "\t",
    CODEX_AUTH_JSON: " \n",
    CODEX_VERIFIER_KEY: "",
  });

  assert.equal(picked.ok, false);
  assert.equal(picked.engine, "none");
});

await test("a codex setting wins when claude is also present", () => {
  const picked = pickEngine({
    CLAUDE_CODE_OAUTH_TOKEN: "claude-test-value",
    CODEX_VERIFIER_KEY: "codex-test-value",
  });

  assert.equal(picked.ok, true);
  assert.equal(picked.engine, "codex");
  assert.equal(picked.codex, "yes");
  assert.equal(picked.claude, "yes");
});

await test("claude is selected only when no codex setting exists", () => {
  const picked = pickEngine({
    CLAUDE_CODE_OAUTH_TOKEN: "claude-test-value",
  });

  assert.equal(picked.engine, "claude");
  assert.equal(picked.codex, "no");
  assert.equal(picked.claude, "yes");
});

await test("a codex login file selects codex", () => {
  const picked = pickEngine({
    CODEX_AUTH_JSON: '{"auth_mode":"chatgpt"}',
  });

  assert.equal(picked.engine, "codex");
  assert.equal(picked.ok, true);
});

await test("require fails closed and does not copy the setting into the output", () => {
  const missing = run({}, ["--require"]);

  assert.equal(missing.status, 1);
  assert.ok(missing.stderr.includes(`::error::${failClosed}`));
  assert.equal(missing.output, "engine=none\ncodex=no\nclaude=no\n");
  assert.match(missing.summary, /engine: none/u);

  const present = run({ CODEX_VERIFIER_KEY: "codex-test-value" }, [
    "--require",
  ]);

  assert.equal(present.status, 0);
  assert.equal(present.stderr, "");
  assert.equal(present.output, "engine=codex\ncodex=yes\nclaude=no\n");
  assert.equal(present.output.includes("codex-test-value"), false);
  assert.equal(present.summary.includes("codex-test-value"), false);
});

await test("the engine job records a missing setting without failing", () => {
  const recorded = run({}, []);

  assert.equal(recorded.status, 0);
  assert.match(recorded.stderr, /::warning::/u);
  assert.equal(recorded.output, "engine=none\ncodex=no\nclaude=no\n");
});
