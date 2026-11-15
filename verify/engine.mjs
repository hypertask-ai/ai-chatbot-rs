import { readFileSync } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const ENGINES = ["deepseek", "codex", "claude"];

const SETTINGS = new Map([
  ["deepseek", ["OPENCODE_GO_API_KEY"]],
  ["codex", ["CODEX_AUTH_JSON", "CODEX_VERIFIER_KEY"]],
  ["claude", ["CLAUDE_CODE_OAUTH_TOKEN"]],
]);

const REDACTED_SETTINGS = [
  "OPENCODE_GO_API_KEY",
  "CODEX_AUTH_JSON",
  "CODEX_VERIFIER_KEY",
  "CLAUDE_CODE_OAUTH_TOKEN",
];

const LIMIT_MARKS = [
  /rate limit/iu,
  /rate_limit/iu,
  /too many requests/iu,
  /usage limit/iu,
  /limit reached/iu,
  /quota/iu,
  /insufficient credit/iu,
  /insufficient funds/iu,
  /credit balance/iu,
  /payment required/iu,
  /status(?: code)? 402/iu,
  /status(?: code)? 429/iu,
  /http[^\n]{0,16}402/iu,
  /http[^\n]{0,16}429/iu,
];

const LOGIN_MARKS = [
  /unauthorized/iu,
  /unauthenticated/iu,
  /authentication failed/iu,
  /invalid api key/iu,
  /incorrect api key/iu,
  /api key is invalid/iu,
  /missing api key/iu,
  /no api key/iu,
  /not logged in/iu,
  /login required/iu,
  /no credentials/iu,
  /invalid token/iu,
  /expired token/iu,
  /status(?: code)? 401/iu,
  /status(?: code)? 403/iu,
  /http[^\n]{0,16}401/iu,
  /http[^\n]{0,16}403/iu,
];

const VERDICT_LINE = /^VERDICT: (?:PASS\+NOTES|PASS|FAIL)/u;

const TAIL_LINES = 60;

const USAGE = [
  "usage: node verify/engine.mjs pick",
  "       node verify/engine.mjs classify <log> <verdict> <sha>",
  "       node verify/engine.mjs note <engine> <model> [engines that fell back]",
  "       node verify/engine.mjs redact <log>",
].join("\n");

/**
 * @param {string} engine
 * @returns {string[]}
 */
export const settingNames = (engine) => SETTINGS.get(engine) ?? [];

/**
 * @param {(engine: string) => boolean} hasSetting
 * @returns {string[]}
 */
export const configuredEngines = (hasSetting) =>
  ENGINES.filter((engine) => hasSetting(engine));

/**
 * @param {(engine: string) => boolean} hasSetting
 * @returns {string}
 */
export const pickEngine = (hasSetting) => {
  const [first] = configuredEngines(hasSetting);

  return first ?? "none";
};

/**
 * @param {string} file
 * @returns {string}
 */
const readText = (file) => {
  try {
    return readFileSync(file, "utf-8");
  } catch {
    return "";
  }
};

/**
 * @param {string} text
 * @returns {string}
 */
const firstLine = (text) => {
  const [line = ""] = text.split("\n");

  return line.trimEnd();
};

/**
 * @param {readonly RegExp[]} marks
 * @param {string} text
 * @returns {boolean}
 */
const mentionsAny = (marks, text) => marks.some((mark) => mark.test(text));

/**
 * @param {string} log
 * @param {string} verdict
 * @param {string} sha
 * @returns {"used" | "limit" | "login" | "other"}
 */
export const classifyEngineRun = (log, verdict, sha) => {
  const line = firstLine(verdict);

  if (VERDICT_LINE.test(line)) {
    return verdict.toLowerCase().includes(sha.toLowerCase()) ? "used" : "other";
  }

  if (mentionsAny(LIMIT_MARKS, log)) {
    return "limit";
  }

  if (mentionsAny(LOGIN_MARKS, log)) {
    return "login";
  }

  return "other";
};

/**
 * @param {string} text
 * @param {readonly string[]} secrets
 * @returns {string}
 */
export const redactSecrets = (text, secrets) => {
  let redacted = text;

  for (const secret of secrets) {
    if (secret !== "") {
      redacted = redacted.replaceAll(secret, "<redacted>");
    }
  }

  return redacted;
};

/**
 * @param {string} used
 * @param {string} model
 * @param {readonly string[]} fellBack
 * @returns {string}
 */
export const engineNote = (used, model, fellBack) => {
  const before = fellBack.join(",");

  if (used === "deepseek") {
    return `deepseek (${model} via pi)`;
  }

  if (used === "codex") {
    return before === ""
      ? "codex"
      : "codex, after DeepSeek ended on a limit or a login";
  }

  if (used === "claude") {
    if (before === "") {
      return "claude, because no DeepSeek or Codex setting exists";
    }

    if (before === "deepseek") {
      return "claude, because no Codex setting exists";
    }

    if (before === "codex") {
      return "claude, after Codex ended on a limit or a login";
    }

    return "claude, after DeepSeek and Codex ended on a limit or a login";
  }

  return "unknown";
};

/**
 * @param {string} name
 * @returns {string}
 */
const settingValue = (name) => {
  const value = process.env[name];

  return value ?? "";
};

/**
 * @param {string} engine
 * @returns {boolean}
 */
const hasSetting = (engine) =>
  settingNames(engine).some((name) => settingValue(name) !== "");

/**
 * @returns {string}
 */
const pickCommand = () => {
  const lines = [`engine=${pickEngine(hasSetting)}`];

  for (const engine of ENGINES) {
    lines.push(`${engine}=${hasSetting(engine) ? "yes" : "no"}`);
  }

  return lines.join("\n");
};

/**
 * @param {string[]} args
 * @returns {string}
 */
const classifyCommand = (args) => {
  const [logFile, verdictFile, sha] = args;

  if (logFile === undefined || verdictFile === undefined || sha === undefined) {
    throw new Error(
      "classify needs a log file, a verdict file and the head SHA"
    );
  }

  const log = readText(logFile);

  const verdict = readText(verdictFile);

  return classifyEngineRun(log, verdict, sha);
};

/**
 * @param {string[]} args
 * @returns {string}
 */
const noteCommand = (args) => {
  const [used, model, ...fellBack] = args;

  if (used === undefined || model === undefined) {
    throw new Error("note needs the engine that ran and the pinned model");
  }

  return engineNote(used, model, fellBack);
};

/**
 * @param {string[]} args
 * @returns {string}
 */
const redactCommand = (args) => {
  const [logFile] = args;

  if (logFile === undefined) {
    throw new Error("redact needs a log file");
  }

  const text = readText(logFile);

  /** @type {string[]} */
  const secrets = [];

  for (const name of REDACTED_SETTINGS) {
    const value = settingValue(name);

    if (value !== "") {
      secrets.push(value);
    }
  }

  const lines = redactSecrets(text, secrets).split("\n");

  return lines.slice(-TAIL_LINES).join("\n");
};

/**
 * @returns {void}
 */
const main = () => {
  const [command, ...args] = process.argv.slice(2);

  try {
    if (command === "pick") {
      console.log(pickCommand());

      return;
    }

    if (command === "classify") {
      console.log(classifyCommand(args));

      return;
    }

    if (command === "note") {
      console.log(noteCommand(args));

      return;
    }

    if (command === "redact") {
      console.log(redactCommand(args));

      return;
    }

    console.error(USAGE);

    process.exitCode = 2;
  } catch (error) {
    console.error(`engine pick failed: ${String(error)}`);

    process.exitCode = 1;
  }
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
