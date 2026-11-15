import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  classifyEngineRun,
  configuredEngines,
  ENGINES,
  engineNote,
  pickEngine,
  redactSecrets,
  settingNames,
} from "./engine.mjs";

const WORKFLOW = readFileSync(
  new URL("../.github/workflows/pstack-verifier.yml", import.meta.url),
  "utf-8"
);

const SHA = "9f2c1b0ad4e5f60718293a4b5c6d7e8f90a1b2c3";

/**
 * @param {string} firstLine
 * @returns {string}
 */
const verdictFor = (firstLine) => `${firstLine}\n\nhead ${SHA}\n`;

await test("tries the engines in the order DeepSeek, Codex, Claude", () => {
  assert.deepEqual(ENGINES, ["deepseek", "codex", "claude"]);
});

await test("keeps the DeepSeek key in the repo secret OPENCODE_GO_API_KEY", () => {
  assert.deepEqual(settingNames("deepseek"), ["OPENCODE_GO_API_KEY"]);
  assert.deepEqual(settingNames("codex"), [
    "CODEX_AUTH_JSON",
    "CODEX_VERIFIER_KEY",
  ]);
  assert.deepEqual(settingNames("claude"), ["CLAUDE_CODE_OAUTH_TOKEN"]);
});

await test("picks DeepSeek when its secret is the only one set", () => {
  assert.equal(
    pickEngine((engine) => engine === "deepseek"),
    "deepseek"
  );
});

await test("picks DeepSeek ahead of Codex and Claude when all three are set", () => {
  assert.equal(
    pickEngine(() => true),
    "deepseek"
  );
  assert.deepEqual(
    configuredEngines(() => true),
    ["deepseek", "codex", "claude"]
  );
});

await test("picks Codex when no DeepSeek secret is set", () => {
  assert.equal(
    pickEngine((engine) => engine === "codex" || engine === "claude"),
    "codex"
  );
});

await test("picks Claude when only the Claude setting is set", () => {
  assert.equal(
    pickEngine((engine) => engine === "claude"),
    "claude"
  );
});

await test("picks no engine when no verifier setting is set", () => {
  assert.equal(
    pickEngine(() => false),
    "none"
  );
  assert.deepEqual(
    configuredEngines(() => false),
    []
  );
});

await test("treats a verdict that names the head as a finished run", () => {
  assert.equal(classifyEngineRun("", verdictFor("VERDICT: PASS"), SHA), "used");
  assert.equal(
    classifyEngineRun("", verdictFor("VERDICT: PASS+NOTES"), SHA),
    "used"
  );
  assert.equal(classifyEngineRun("", verdictFor("VERDICT: FAIL"), SHA), "used");
});

await test("never falls back on a FAIL verdict, whatever the log says", () => {
  assert.equal(
    classifyEngineRun(
      "status code 429, too many requests",
      verdictFor("VERDICT: FAIL"),
      SHA
    ),
    "used"
  );
  assert.equal(
    classifyEngineRun(
      "status code 401, unauthorized",
      verdictFor("VERDICT: FAIL"),
      SHA
    ),
    "used"
  );
});

await test("falls back on the line Pi 1.5.0 prints for a rejected key", () => {
  assert.equal(
    classifyEngineRun(
      '401: {"type":"authentication_error","message":"Invalid credential"}\n',
      "",
      SHA
    ),
    "login"
  );
  assert.equal(
    classifyEngineRun(
      '403: {"type":"permission_error","message":"Invalid credential"}\n',
      "",
      SHA
    ),
    "login"
  );
});

await test("falls back on the line Pi 1.5.0 prints for an unusable balance", () => {
  assert.equal(
    classifyEngineRun(
      '402: {"type":"payment_required","message":"Insufficient balance"}\n',
      "",
      SHA
    ),
    "limit"
  );
  assert.equal(
    classifyEngineRun(
      '429: {"type":"rate_limit","message":"Rate limit exceeded"}\n',
      "",
      SHA
    ),
    "limit"
  );
});

await test("falls back when the DeepSeek log ends on a limit", () => {
  assert.equal(
    classifyEngineRun(
      "Error: 429 Too Many Requests: rate limit reached for this plan",
      "",
      SHA
    ),
    "limit"
  );
  assert.equal(
    classifyEngineRun("you have hit your usage limit for this week", "", SHA),
    "limit"
  );
  assert.equal(
    classifyEngineRun("insufficient credit to run this request", "", SHA),
    "limit"
  );
});

await test("falls back when the DeepSeek log ends on a login error", () => {
  assert.equal(
    classifyEngineRun(
      "Error: 401 Unauthorized: invalid api key for provider opencode-go",
      "",
      SHA
    ),
    "login"
  );
  assert.equal(
    classifyEngineRun("no api key set for provider opencode-go", "", SHA),
    "login"
  );
  assert.equal(
    classifyEngineRun("Error: authentication failed for this account", "", SHA),
    "login"
  );
});

await test("stops on a verdict that is stale instead of trying another engine", () => {
  assert.equal(
    classifyEngineRun(
      "status code 429, too many requests",
      verdictFor("VERDICT: FAIL"),
      "0".repeat(40)
    ),
    "other"
  );
  assert.equal(
    classifyEngineRun(
      "status code 401, unauthorized",
      verdictFor("VERDICT: PASS"),
      "0".repeat(40)
    ),
    "other"
  );
});

await test("stops instead of falling back on any other failure", () => {
  assert.equal(
    classifyEngineRun("process exited with code 1", "", SHA),
    "other"
  );
  assert.equal(classifyEngineRun("", "", SHA), "other");
  assert.equal(
    classifyEngineRun("", verdictFor("VERDICT: PASS"), "0".repeat(40)),
    "other"
  );
  assert.equal(
    classifyEngineRun("", "I could not read the site.\n", SHA),
    "other"
  );
});

await test("names the engine and the pinned model in the verdict header", () => {
  assert.equal(
    engineNote("deepseek", "deepseek-v4.1-flash", []),
    "deepseek (deepseek-v4.1-flash via pi)"
  );
  assert.equal(engineNote("codex", "deepseek-v4.1-flash", []), "codex");
  assert.equal(
    engineNote("codex", "deepseek-v4.1-flash", ["deepseek"]),
    "codex, after DeepSeek ended on a limit or a login"
  );
  assert.equal(
    engineNote("claude", "deepseek-v4.1-flash", []),
    "claude, because no DeepSeek or Codex setting exists"
  );
  assert.equal(
    engineNote("claude", "deepseek-v4.1-flash", ["deepseek"]),
    "claude, because no Codex setting exists"
  );
  assert.equal(
    engineNote("claude", "deepseek-v4.1-flash", ["codex"]),
    "claude, after Codex ended on a limit or a login"
  );
  assert.equal(
    engineNote("claude", "deepseek-v4.1-flash", ["deepseek", "codex"]),
    "claude, after DeepSeek and Codex ended on a limit or a login"
  );
});

await test("cuts the setting value out of a log tail", () => {
  const secret = "the-plan-token-value";

  const redacted = redactSecrets(
    `request failed\nauthorization: Bearer ${secret}\n`,
    [secret]
  );

  assert.equal(redacted.includes(secret), false);
  assert.match(redacted, /authorization: Bearer <redacted>/u);
});

await test("runs the DeepSeek engine on Pi in print mode with flash pinned once", () => {
  const modelPins = WORKFLOW.match(/deepseek-v4\.1-flash/gu) ?? [];

  assert.equal(modelPins.length, 1);
  assert.equal(WORKFLOW.includes("deepseek-v4-pro"), false);
  assert.match(
    WORKFLOW,
    /pi -p \\\n\s+--provider opencode-go \\\n\s+--model "\$VERIFIER_MODEL" \\\n\s+--thinking medium/u
  );
  assert.match(WORKFLOW, /@earendil-works\/pi-coding-agent@1\.5\.0/u);
  assert.match(WORKFLOW, /OPENCODE_API_KEY="\$engine_token"/u);
  assert.match(
    WORKFLOW,
    /OPENCODE_GO_API_KEY: \$\{\{ secrets\.OPENCODE_GO_API_KEY \}\}/u
  );
  assert.equal(WORKFLOW.includes("VERIFIER_MODEL: deepseek-v4.1-flash"), true);
});

await test("runs the engines in the workflow in the same order", () => {
  const deepseekStep = WORKFLOW.indexOf("name: Verify with DeepSeek");
  const codexStep = WORKFLOW.indexOf("name: Verify with Codex");
  const claudeStep = WORKFLOW.indexOf("name: Verify with Claude");

  assert.ok(deepseekStep > 0);
  assert.ok(deepseekStep < codexStep);
  assert.ok(codexStep < claudeStep);
  assert.match(
    WORKFLOW,
    /if: steps\.target\.outputs\.go == 'yes' && needs\.engine\.outputs\.deepseek == 'yes'/u
  );
  assert.match(
    WORKFLOW,
    /needs\.engine\.outputs\.deepseek == 'no' \|\| steps\.deepseek\.outputs\.fallback == 'yes'/u
  );
  assert.match(
    WORKFLOW,
    /needs\.engine\.outputs\.codex == 'no' \|\| steps\.codex\.outputs\.fallback == 'yes'/u
  );
});
