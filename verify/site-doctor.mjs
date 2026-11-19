#!/usr/bin/env node
import { spawnSync } from "node:child_process";

import { Schema } from "effect";

import {
  firstAssetOf,
  hasNoindexHeader,
  headTagsNoindex,
  headTagsOf,
} from "./site-head.mjs";

const OLD_ORIGIN = "https://help.hypertask.ai";

const PREVIEW_ORIGIN = "https://help.hypertask.ai/ratstack";

const REPOSITORY = "hypertask-ai/ai-chatbot-rs";

const WORKFLOW = "publish-ratstack.yml";

const BRANCH = "main";

const TIMEOUT = 30_000;

const BUILD = /data-foldkit-build="(?<build>[^"]+)"/u;

const PublishRun = Schema.Struct({
  conclusion: Schema.String,
  createdAt: Schema.String,
  databaseId: Schema.Number,
  headSha: Schema.String,
  url: Schema.String,
});

const decodeRuns = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Array(PublishRun))
);

const USAGE = `node verify/site-doctor.mjs [flags]

Flags:
  --old       origin of the old site (default ${OLD_ORIGIN})
  --preview   origin of the published preview (default ${PREVIEW_ORIGIN})
  --repo      owner/name of the repository (default ${REPOSITORY})
  --workflow  publish workflow file or id (default ${WORKFLOW})
  --branch    branch the preview publishes from (default ${BRANCH})
  --timeout   milliseconds allowed per request (default ${TIMEOUT})
  --json      print the checks as JSON
  --help      print this text`;

const argv = process.argv.slice(2);

/**
 * @param {string} name
 * @returns {string}
 */
const flag = (name) => {
  const at = argv.indexOf(`--${name}`);

  return at === -1 ? "" : (argv[at + 1] ?? "");
};

/**
 * @param {string} value
 * @returns {string}
 */
const trimOrigin = (value) => value.replace(/\/+$/u, "");

const oldOrigin = trimOrigin(flag("old") || OLD_ORIGIN);

const previewOrigin = trimOrigin(flag("preview") || PREVIEW_ORIGIN);

const repository = flag("repo") || REPOSITORY;

const workflow = flag("workflow") || WORKFLOW;

const branch = flag("branch") || BRANCH;

const timeout = Number(flag("timeout") || TIMEOUT);

/**
 * @typedef {{ detail: string, fix?: string, name: string, state: "fail" | "pass" | "unknown" }} Check
 */

/**
 * @typedef {{ error?: string, headers?: Headers, html?: string, status?: number, url?: string }} Page
 */

/**
 * @param {string} url
 * @returns {Promise<Page>}
 */
const read = async (url) => {
  try {
    const response = await fetch(url, {
      headers: { accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(timeout),
    });

    return {
      headers: response.headers,
      html: await response.text(),
      status: response.status,
      url: response.url,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
};

/**
 * @param {string} name
 * @param {string} url
 * @param {string} label
 * @returns {Promise<Check>}
 */
const answers = async (name, url, label) => {
  const page = await read(url);

  if (page.error !== undefined) {
    return {
      detail: `GET ${url} did not answer: ${page.error}.`,
      fix: `check ${label} is reachable from this machine with \`curl -sS -o /dev/null -w '%{http_code}' ${url}\``,
      name,
      state: "fail",
    };
  }

  if (page.status !== 200) {
    return {
      detail: `GET ${url} answered ${String(page.status)}.`,
      fix: `check ${label} still serves this address and read the publish runs with \`gh run list --workflow ${workflow} --branch ${branch} --limit 5\``,
      name,
      state: "fail",
    };
  }

  const tags = headTagsOf(page.html ?? "");

  if (tags.title === null) {
    return {
      detail: `GET ${url} answered 200 without a title.`,
      fix: `check ${label} renders its head with \`curl -sS ${url} | head -40\``,
      name,
      state: "fail",
    };
  }

  return {
    detail: `200 "${tags.title}" at ${page.url ?? url}.`,
    name,
    state: "pass",
  };
};

/**
 * @returns {Promise<Check>}
 */
const previewNoindex = async () => {
  const page = await read(`${previewOrigin}/`);

  if (page.error !== undefined) {
    return {
      detail: `${previewOrigin}/ did not answer: ${page.error}.`,
      fix: `check the preview is published with \`gh run list --workflow ${workflow} --branch ${branch} --limit 1\``,
      name: "preview-noindex",
      state: "fail",
    };
  }

  const tags = headTagsOf(page.html ?? "");
  const header = hasNoindexHeader(page.headers ?? new Headers());
  const meta = headTagsNoindex(tags);

  if (header && meta) {
    return {
      detail:
        "X-Robots-Tag: noindex on the response and the robots meta tag on the page.",
      name: "preview-noindex",
      state: "pass",
    };
  }

  return {
    detail: `noindex header ${header ? "present" : "missing"} and robots meta ${meta ? "present" : "missing"}.`,
    fix: "check siteAssetHeaders and siteRobotsMeta in `apps/web/src/site-base-path.ts`, then the deploy step of `.github/workflows/publish-ratstack.yml`",
    name: "preview-noindex",
    state: "fail",
  };
};

/**
 * @returns {Promise<Check>}
 */
const oldIndexable = async () => {
  const page = await read(`${oldOrigin}/help`);

  if (page.error !== undefined) {
    return {
      detail: `${oldOrigin}/help did not answer: ${page.error}.`,
      name: "old-indexable",
      state: "unknown",
    };
  }

  const noindex =
    hasNoindexHeader(page.headers ?? new Headers()) ||
    headTagsNoindex(headTagsOf(page.html ?? ""));

  if (noindex) {
    return {
      detail: `${oldOrigin}/help answers noindex, so the live site became invisible to search engines.`,
      fix: "check the base path still names the preview in `apps/web/src/site-base-path.ts` and roll back the deploy that changed it",
      name: "old-indexable",
      state: "fail",
    };
  }

  return {
    detail: `${oldOrigin}/help answers without noindex.`,
    name: "old-indexable",
    state: "pass",
  };
};

/**
 * @returns {Promise<Check>}
 */
const previewBuild = async () => {
  const page = await read(`${previewOrigin}/`);

  if (page.error !== undefined) {
    return {
      detail: `${previewOrigin}/ did not answer, so the build cannot be read.`,
      name: "preview-build",
      state: "fail",
    };
  }

  const html = page.html ?? "";
  const asset = firstAssetOf(html);

  if (asset === null) {
    return {
      detail: "the preview page links no /assets/*.js file.",
      fix: "check the build step of `.github/workflows/publish-ratstack.yml` uploads the client bundle",
      name: "preview-build",
      state: "fail",
    };
  }

  const assetUrl = new URL(asset, `${previewOrigin}/`).href;
  const served = await read(assetUrl);

  if (served.status !== 200) {
    return {
      detail: `the page links ${assetUrl} and it answered ${String(served.status ?? served.error)}.`,
      fix: `check the asset is published with \`curl -sSI ${assetUrl}\``,
      name: "preview-build",
      state: "fail",
    };
  }

  const build = BUILD.exec(html)?.groups?.build ?? "unstated";

  return {
    detail: `${asset.split("/").at(-1) ?? asset} answered 200 and the page names build ${build}.`,
    name: "preview-build",
    state: "pass",
  };
};

/**
 * @param {string[]} args
 * @returns {{ error?: string, text?: string }}
 */
const gh = (args) => {
  const result = spawnSync("gh", args, {
    encoding: "utf-8",
    maxBuffer: 8_388_608,
  });

  if (result.error !== undefined) {
    return { error: `gh did not run: ${result.error.message}` };
  }

  if (result.status !== 0) {
    return {
      error: `gh ${args.slice(0, 3).join(" ")} exited ${String(result.status)}: ${(result.stderr ?? "").trim()}`,
    };
  }

  return { text: (result.stdout ?? "").trim() };
};

/**
 * @param {string} detail
 * @returns {Check}
 */
const missingPublish = (detail) => ({
  detail,
  fix: `check gh is logged in and reads the repository with \`gh api repos/${repository}/git/ref/heads/${branch}\``,
  name: "publish",
  state: "unknown",
});

/**
 * @returns {Check}
 */
const publishRun = () => {
  const head = gh([
    "api",
    `repos/${repository}/git/ref/heads/${branch}`,
    "--jq",
    ".object.sha",
  ]);

  if (head.text === undefined || head.text.length === 0) {
    return missingPublish(
      `the ${branch} head could not be read: ${head.error ?? "empty answer"}.`
    );
  }

  const runs = gh([
    "run",
    "list",
    "--repo",
    repository,
    "--workflow",
    workflow,
    "--branch",
    branch,
    "--status",
    "success",
    "--limit",
    "1",
    "--json",
    "conclusion,createdAt,databaseId,headSha,url",
  ]);

  if (runs.text === undefined) {
    return missingPublish(
      `the publish runs could not be read: ${runs.error ?? "empty answer"}.`
    );
  }

  const [latest] = decodeRuns(runs.text);

  if (latest === undefined) {
    return {
      detail: `\`${workflow}\` has no successful run on ${branch}.`,
      fix: `run the publish by hand with \`gh workflow run ${workflow} --ref ${branch}\``,
      name: "publish",
      state: "fail",
    };
  }

  if (latest.headSha !== head.text) {
    return {
      detail: `${branch} is at ${head.text} and the last successful publish ran ${latest.headSha} in run ${String(latest.databaseId)}, so the preview is behind ${branch}.`,
      fix: `read the run at ${latest.url} and wait for the next publish of ${branch} before you trust the preview`,
      name: "publish",
      state: "fail",
    };
  }

  return {
    detail: `run ${String(latest.databaseId)} published ${latest.headSha} and ${branch} is ${head.text}.`,
    name: "publish",
    state: "pass",
  };
};

/**
 * @param {boolean} json
 * @param {Check[]} checks
 * @returns {void}
 */
const report = (json, checks) => {
  const failed = checks.filter((check) => check.state !== "pass");

  if (json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          checks,
          old: oldOrigin,
          preview: previewOrigin,
          verdict: failed.length === 0 ? "ok" : "failed",
        },
        null,
        2
      )}\n`
    );

    return;
  }

  for (const check of checks) {
    process.stdout.write(`${check.state} ${check.name}: ${check.detail}\n`);

    if (check.fix !== undefined) {
      process.stdout.write(`  Fix: ${check.fix}\n`);
    }
  }

  process.stdout.write(
    failed.length === 0
      ? `doctor: ok (${checks.length} checks)\n`
      : `doctor: failed (${failed.length} of ${checks.length} checks)\n`
  );
};

const main = async () => {
  if (argv.includes("--help")) {
    process.stdout.write(`${USAGE}\n`);

    return;
  }

  const checks = [
    await answers("old", `${oldOrigin}/help`, "the old site"),
    await answers("preview", `${previewOrigin}/`, "the published preview"),
    await previewNoindex(),
    await oldIndexable(),
    await previewBuild(),
    publishRun(),
  ];

  report(argv.includes("--json"), checks);

  process.exitCode = checks.every((check) => check.state === "pass") ? 0 : 1;
};

await main();
