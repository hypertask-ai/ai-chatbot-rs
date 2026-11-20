import { appendFileSync } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";

const missingVerifierSetting =
  "No verifier setting. A missing key would leave pstack-verifier skipped, so a pull request could merge. Fix: add the repository secret `CODEX_AUTH_JSON`, `CODEX_VERIFIER_KEY`, or `CLAUDE_CODE_OAUTH_TOKEN`.";

/**
 * @param {string | undefined} value
 * @returns {boolean}
 */
const nonEmpty = (value) => value !== undefined && value.trim() !== "";

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {{ claude: "yes" | "no", codex: "yes" | "no", engine: "none" | "codex" | "claude", ok: boolean }}
 */
export const pickEngine = (env) => {
  const codex =
    nonEmpty(env.CODEX_AUTH_JSON) || nonEmpty(env.CODEX_VERIFIER_KEY);

  const claude = nonEmpty(env.CLAUDE_CODE_OAUTH_TOKEN);

  if (!codex && !claude) {
    return { claude: "no", codex: "no", engine: "none", ok: false };
  }

  if (codex) {
    return {
      claude: claude ? "yes" : "no",
      codex: "yes",
      engine: "codex",
      ok: true,
    };
  }

  return { claude: "yes", codex: "no", engine: "claude", ok: true };
};

/**
 * @param {string | undefined} file
 * @param {string} text
 */
const append = (file, text) => {
  if (file === undefined || file.trim() === "") {
    return;
  }

  appendFileSync(file, text);
};

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {boolean} requireSetting
 * @returns {number}
 */
const runPickEngine = (env, requireSetting) => {
  const picked = pickEngine(env);

  append(
    env.GITHUB_OUTPUT,
    `engine=${picked.engine}\ncodex=${picked.codex}\nclaude=${picked.claude}\n`
  );
  append(
    env.GITHUB_STEP_SUMMARY,
    picked.ok
      ? `engine: ${picked.engine}\n`
      : `engine: none\n${missingVerifierSetting}\n`
  );

  if (!picked.ok) {
    const level = requireSetting ? "error" : "warning";

    console.error(`::${level}::${missingVerifierSetting}`);

    if (requireSetting) {
      return 1;
    }
  }

  return 0;
};

const main = () => {
  process.exitCode = runPickEngine(
    process.env,
    process.argv.includes("--require")
  );
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
