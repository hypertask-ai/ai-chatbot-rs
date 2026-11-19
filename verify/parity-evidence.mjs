#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { Schema } from "effect";
import { PNG } from "pngjs";

import { headTagsOf } from "./site-head.mjs";

const OLD_ORIGIN = "https://help.hypertask.ai";

const PREVIEW_ORIGIN = "https://help.hypertask.ai/ratstack";

const EVIDENCE_ROOT = "/tmp/ratstack/evidence/verify-ai-chatbot-rs";

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "..");

const DRIVER = "verify/driver.mjs";

const TIMEOUT = 45_000;

const DESKTOP = "1440";

const PHONE = "390";

const WHITESPACE = /\s+/gu;

const SLASHES = /\/+$/u;

const Link = Schema.Struct({ href: Schema.String, text: Schema.String });

const PageAction = Schema.Struct({
  action: Schema.String,
  error: Schema.optional(Schema.String),
  key: Schema.optional(Schema.String),
  ok: Schema.Boolean,
  target: Schema.optional(Schema.String),
});

const Page = Schema.Struct({
  actions: Schema.optional(Schema.Array(PageAction)),
  finalUrl: Schema.optional(Schema.String),
  links: Schema.optional(Schema.Array(Link)),
  screenshotViewport: Schema.optional(Schema.String),
  status: Schema.optional(Schema.Number),
  textFile: Schema.optional(Schema.String),
  viewport: Schema.String,
});

const Group = Schema.Struct({ pages: Schema.Array(Page), path: Schema.String });

const DriverReport = Schema.Struct({
  baseReport: Schema.Array(Group),
  headReport: Schema.Array(Group),
});

/** @typedef {typeof Page.Type} PageValue */

const decodeReport = Schema.decodeUnknownSync(
  Schema.fromJsonString(DriverReport)
);

/**
 * @typedef {{ error?: string, headers?: Record<string, string>, status?: number, tags?: { canonical: string | null, description: string | null, robots: string | null, title: string | null }, url?: string }} HeadValue
 */

/**
 * @typedef {{ actions: string[], addedInNewLinks: string[], addedInNewText: string[], changedText: string[], evidence: string, expected: number, feature: string, headTags: { old: HeadValue, preview: HeadValue }, missingFromNewLinks: string[], missingFromNewText: string[], newStatus: number | null, old: string, oldStatus: number | null, path: string, preview: string, reasons: string[], stamp: string, verdict: "FAIL" | "PASS" }} Facts
 */

const EMPTY_TAGS = {
  canonical: null,
  description: null,
  robots: null,
  title: null,
};

const USAGE = `node verify/parity-evidence.mjs --feature <id> [flags]

Runs verify/driver.mjs on the old site and the published preview, then writes
the side-by-side screenshots, the text diff, the link diff and the head tags
into one evidence folder.

Flags:
  --feature   feature id from .claude/skills/verify-ai-chatbot-rs/features
  --path      address to drive on both origins (default /help)
  --old       origin of the old site (default ${OLD_ORIGIN})
  --preview   origin of the published preview (default ${PREVIEW_ORIGIN})
  --evidence  folder that holds the runs (default ${EVIDENCE_ROOT})
  --driver    driver to run (default ${DRIVER})
  --click     control to choose after the page loads, repeatable
  --fill      "<selector>=<value>" to type after the page loads, repeatable
  --press     key to send after the page loads, repeatable
  --expect    status both sites must answer (default 200)
  --timeout   milliseconds allowed per request (default ${TIMEOUT})
  --json      print the run as JSON
  --help      print this text`;

/**
 * @param {string} value
 * @returns {string}
 */
const trimOrigin = (value) => value.replace(SLASHES, "");

/**
 * @param {Date} date
 * @returns {string}
 */
export const stampOf = (date) => date.toISOString().replaceAll(/[:.]/gu, "-");

/**
 * @param {string} href
 * @param {string} previewBasePath
 * @returns {string}
 */
export const normalizeHref = (href, previewBasePath) => {
  const url = new URL(href, "https://site.invalid");

  const underBase =
    previewBasePath !== "" &&
    (url.pathname === previewBasePath ||
      url.pathname.startsWith(`${previewBasePath}/`));

  const stripped = underBase
    ? url.pathname.slice(previewBasePath.length) || "/"
    : url.pathname;

  const pathname =
    stripped.length > 1 ? stripped.replace(SLASHES, "") : stripped;

  return `${pathname}${url.search}${url.hash}`;
};

/**
 * @param {string} text
 * @returns {string[]}
 */
export const linesOf = (text) => [
  ...new Set(
    text
      .split("\n")
      .map((line) => line.replaceAll(WHITESPACE, " ").trim())
      .filter((line) => line.length > 0)
  ),
];

/**
 * @param {string} oldText
 * @param {string} newText
 * @returns {{ addedInNew: string[], missingFromNew: string[] }}
 */
export const textDiff = (oldText, newText) => {
  const oldLines = linesOf(oldText);
  const newLines = linesOf(newText);
  const newSet = new Set(newLines);
  const oldSet = new Set(oldLines);

  return {
    addedInNew: newLines.filter((line) => !oldSet.has(line)),
    missingFromNew: oldLines.filter((line) => !newSet.has(line)),
  };
};

/**
 * @param {readonly { href: string, text: string }[]} links
 * @param {string} previewBasePath
 * @returns {Map<string, string>}
 */
const keyed = (links, previewBasePath) => {
  /** @type {Map<string, string>} */
  const found = new Map();

  for (const link of links) {
    found.set(normalizeHref(link.href, previewBasePath), link.text);
  }

  return found;
};

/**
 * @param {readonly { href: string, text: string }[]} oldLinks
 * @param {readonly { href: string, text: string }[]} newLinks
 * @param {string} previewBasePath
 * @returns {{ addedInNew: string[], changedText: string[], missingFromNew: string[] }}
 */
export const linkDiff = (oldLinks, newLinks, previewBasePath) => {
  const oldKeyed = keyed(oldLinks, previewBasePath);
  const newKeyed = keyed(newLinks, previewBasePath);

  const missingFromNew = [...oldKeyed.keys()]
    .filter((key) => !newKeyed.has(key))
    .toSorted((left, right) => left.localeCompare(right));

  const addedInNew = [...newKeyed.keys()]
    .filter((key) => !oldKeyed.has(key))
    .toSorted((left, right) => left.localeCompare(right));

  const changedText = [...oldKeyed.entries()]
    .flatMap(([key, text]) => {
      const now = newKeyed.get(key);

      return now === undefined || now === text
        ? []
        : [`${key}: "${text}" became "${now}"`];
    })
    .toSorted((left, right) => left.localeCompare(right));

  return { addedInNew, changedText, missingFromNew };
};

/**
 * @param {Buffer} left
 * @param {Buffer} right
 * @returns {Buffer}
 */
export const composePair = (left, right) => {
  const first = PNG.sync.read(left);
  const second = PNG.sync.read(right);

  const composed = new PNG({
    height: Math.max(first.height, second.height),
    width: first.width + second.width,
  });

  composed.data.fill(255);
  PNG.bitblt(first, composed, 0, 0, first.width, first.height, 0, 0);
  PNG.bitblt(
    second,
    composed,
    0,
    0,
    second.width,
    second.height,
    first.width,
    0
  );

  return PNG.sync.write(composed);
};

/**
 * @param {{ addedInNewLinks: string[], addedInNewText: string[], changedText: string[], expected: number, missingFromNewLinks: string[], missingFromNewText: string[], newStatus: number | null, oldStatus: number | null }} facts
 * @returns {{ reasons: string[], verdict: "FAIL" | "PASS" }}
 */
export const verdictOf = (facts) => {
  const reasons = [];

  if (facts.oldStatus !== facts.expected) {
    reasons.push(
      `the old site answered ${facts.oldStatus === null ? "nothing" : String(facts.oldStatus)} and the journey expects ${String(facts.expected)}`
    );
  }

  if (facts.newStatus !== facts.oldStatus) {
    reasons.push(
      `the preview answered ${facts.newStatus === null ? "nothing" : String(facts.newStatus)} where the old site answered ${facts.oldStatus === null ? "nothing" : String(facts.oldStatus)}`
    );
  }

  if (facts.missingFromNewText.length > 0) {
    reasons.push(
      `${String(facts.missingFromNewText.length)} lines of the old page are missing from the preview`
    );
  }

  if (facts.missingFromNewLinks.length > 0) {
    reasons.push(
      `${String(facts.missingFromNewLinks.length)} links of the old page are missing from the preview`
    );
  }

  if (facts.changedText.length > 0) {
    reasons.push(
      `${String(facts.changedText.length)} links of the preview say something different from the old page`
    );
  }

  return { reasons, verdict: reasons.length === 0 ? "PASS" : "FAIL" };
};

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
 * @param {string} name
 * @returns {string[]}
 */
const flagAll = (name) => {
  const found = [];

  for (const [index, value] of argv.entries()) {
    if (value === `--${name}`) {
      found.push(argv[index + 1] ?? "");
    }
  }

  return found.filter((entry) => entry.length > 0);
};

/**
 * @param {string} name
 * @param {string[]} list
 * @returns {string[]}
 */
const repeat = (name, list) => list.flatMap((value) => [`--${name}`, value]);

/**
 * @param {string} url
 * @param {number} timeout
 * @returns {Promise<HeadValue>}
 */
const readHead = async (url, timeout) => {
  try {
    const response = await fetch(url, {
      headers: { accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(timeout),
    });

    return {
      headers: {
        "cache-control": response.headers.get("cache-control") ?? "",
        "content-type": response.headers.get("content-type") ?? "",
        "x-robots-tag": response.headers.get("x-robots-tag") ?? "",
      },
      status: response.status,
      tags: headTagsOf(await response.text()),
      url: response.url,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
};

/**
 * @template {{ viewport: string }} Viewport
 * @param {readonly Viewport[]} pages
 * @param {string} viewport
 * @returns {Viewport | undefined}
 */
const pick = (pages, viewport) =>
  pages.find((page) => page.viewport === viewport);

/**
 * @param {string | undefined} file
 * @returns {Promise<string>}
 */
const readText = async (file) =>
  file === undefined ? "" : await readFile(file, "utf-8");

/**
 * @param {string} file
 * @param {string} text
 * @returns {Promise<void>}
 */
const writeText = async (file, text) => {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, "utf-8");
};

/**
 * @param {string} file
 * @param {unknown} value
 * @returns {Promise<void>}
 */
const writeJson = async (file, value) => {
  await writeText(file, `${JSON.stringify(value, null, 2)}\n`);
};

/**
 * @param {string | null} value
 * @returns {string}
 */
const tagCell = (value) =>
  value === null || value === "" ? "(absent)" : value;

/**
 * @param {string[]} lines
 * @returns {string}
 */
const bullets = (lines) =>
  lines.length === 0 ? "- none\n" : lines.map((line) => `- ${line}\n`).join("");

/**
 * @param {{ action: string, error?: string, key?: string, ok: boolean, target?: string }} entry
 * @returns {string}
 */
const describeAction = (entry) => {
  const target = entry.target ?? entry.key ?? "";
  const result = entry.ok ? "reached" : `failed: ${entry.error ?? ""}`;

  return `${entry.action} ${target} ${result}`.trim();
};

/**
 * @param {string} label
 * @param {string} origin
 * @param {number | null} status
 * @returns {string}
 */
const addressLine = (label, origin, status) =>
  `- ${label}: ${origin} (${status === null ? "no answer" : String(status)})`;

/**
 * @param {string} tag
 * @param {string | null} left
 * @param {string | null} right
 * @returns {string}
 */
const headerRow = (tag, left, right) =>
  `| ${tag} | ${tagCell(left)} | ${tagCell(right)} |`;

/**
 * @param {HeadValue} old
 * @param {HeadValue} preview
 * @returns {string[]}
 */
const headTableOf = (old, preview) => {
  const oldTags = old.tags ?? EMPTY_TAGS;
  const newTags = preview.tags ?? EMPTY_TAGS;

  return [
    "| tag | old | preview |",
    "| --- | --- | --- |",
    headerRow("title", oldTags.title, newTags.title),
    headerRow("description", oldTags.description, newTags.description),
    headerRow("canonical", oldTags.canonical, newTags.canonical),
    headerRow("robots", oldTags.robots, newTags.robots),
    headerRow("status", String(old.status ?? 0), String(preview.status ?? 0)),
    headerRow(
      "X-Robots-Tag",
      old.headers?.["x-robots-tag"] ?? "",
      preview.headers?.["x-robots-tag"] ?? ""
    ),
  ];
};

/**
 * @param {Facts} facts
 * @returns {string}
 */
const reportOf = (facts) => {
  const { old, preview } = facts.headTags;

  return [
    `# Parity evidence: ${facts.feature}`,
    "",
    `- verdict: ${facts.verdict}`,
    `- driven address: ${facts.path}`,
    addressLine("old", facts.old, facts.oldStatus),
    addressLine("preview", facts.preview, facts.newStatus),
    `- old final address: ${old.url ?? "unknown"}`,
    `- preview final address: ${preview.url ?? "unknown"}`,
    `- expected status: ${String(facts.expected)}`,
    `- run: ${facts.stamp}`,
    "- scope: every rendered node and every link, including panels both sites keep hidden",
    "",
    "## Actions driven",
    "",
    bullets(facts.actions),
    "## Reasons",
    "",
    bullets(facts.reasons),
    "## Text missing from the preview",
    "",
    bullets(facts.missingFromNewText),
    "## Text the preview adds",
    "",
    bullets(facts.addedInNewText),
    "## Links missing from the preview",
    "",
    bullets(facts.missingFromNewLinks),
    "## Links the preview adds",
    "",
    bullets(facts.addedInNewLinks),
    "## Link text that differs",
    "",
    bullets(facts.changedText),
    "## Head tags and response",
    "",
    ...headTableOf(old, preview),
    "",
    "## Artifacts",
    "",
    bullets([
      "side-by-side-1440.png",
      "side-by-side-390.png",
      "text-diff.txt",
      "links.json",
      "head-tags.json",
      "run.json",
      "driver/report-page.json",
    ]),
  ].join("\n");
};

/**
 * @param {string} message
 * @returns {void}
 */
const fail = (message) => {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
};

/**
 * @param {{ click: string[], driverPath: string, driverDir: string, fill: string[], old: string, press: string[], preview: string, routePath: string }} config
 * @returns {import("node:child_process").SpawnSyncReturns<string>}
 */
const drive = (config) =>
  spawnSync(
    process.execPath,
    [
      config.driverPath,
      "page",
      "--head",
      config.preview,
      "--base",
      config.old,
      "--path",
      config.routePath,
      ...repeat("click", config.click),
      ...repeat("fill", config.fill),
      ...repeat("press", config.press),
    ],
    {
      cwd: REPOSITORY_ROOT,
      encoding: "utf-8",
      env: { ...process.env, SCREENS_DIR: config.driverDir },
      maxBuffer: 67_108_864,
    }
  );

/**
 * @param {string} oldShot
 * @param {string} newShot
 * @param {string} file
 * @returns {Promise<void>}
 */
const writePair = async (oldShot, newShot, file) => {
  const composed = composePair(
    await readFile(oldShot),
    await readFile(newShot)
  );

  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, composed);
};

/**
 * @param {string} runDir
 * @param {string} viewport
 * @param {string | undefined} oldShot
 * @param {string | undefined} newShot
 * @returns {Promise<void>}
 */
const writePairFor = async (runDir, viewport, oldShot, newShot) => {
  if (oldShot === undefined || newShot === undefined) {
    return;
  }

  await writePair(
    oldShot,
    newShot,
    path.join(runDir, `side-by-side-${viewport}.png`)
  );
};

/**
 * @param {{ newDesktop?: PageValue, newPhone?: PageValue, oldDesktop?: PageValue, oldPhone?: PageValue, runDir: string }} shots
 * @returns {Promise<void>}
 */
const writePairs = async (shots) => {
  await writePairFor(
    shots.runDir,
    DESKTOP,
    shots.oldDesktop?.screenshotViewport,
    shots.newDesktop?.screenshotViewport
  );

  await writePairFor(
    shots.runDir,
    PHONE,
    shots.oldPhone?.screenshotViewport,
    shots.newPhone?.screenshotViewport
  );
};

/**
 * @param {{ basePath: string, headTags: { old: HeadValue, preview: HeadValue }, links: { addedInNew: string[], changedText: string[], missingFromNew: string[] }, runDir: string, text: { addedInNew: string[], missingFromNew: string[] } }} parts
 * @returns {Promise<void>}
 */
const writeArtifacts = async (parts) => {
  await writeText(
    path.join(parts.runDir, "text-diff.txt"),
    [
      "missing from the preview:",
      ...parts.text.missingFromNew,
      "",
      "added by the preview:",
      ...parts.text.addedInNew,
      "",
    ].join("\n")
  );

  await writeJson(path.join(parts.runDir, "links.json"), {
    ...parts.links,
    previewBasePath: parts.basePath,
  });
  await writeJson(path.join(parts.runDir, "head-tags.json"), parts.headTags);
};

/**
 * @param {Facts} facts
 * @returns {void}
 */
const print = (facts) => {
  const folder = path.join(facts.evidence, facts.feature, facts.stamp);

  process.stdout.write(`evidence ${folder}\n`);
  process.stdout.write(
    `old ${facts.old}${facts.path} answered ${String(facts.oldStatus ?? 0)}\n`
  );
  process.stdout.write(
    `preview ${facts.preview}${facts.path} answered ${String(facts.newStatus ?? 0)}\n`
  );
  process.stdout.write(
    `text: ${String(facts.missingFromNewText.length)} missing, ${String(facts.addedInNewText.length)} added\n`
  );
  process.stdout.write(
    `links: ${String(facts.missingFromNewLinks.length)} missing, ${String(facts.addedInNewLinks.length)} added, ${String(facts.changedText.length)} reworded\n`
  );

  for (const reason of facts.reasons) {
    process.stdout.write(`  - ${reason}\n`);
  }

  process.stdout.write(`verdict: ${facts.verdict}\n`);
};

/**
 * @typedef {{ click: string[], driver: string, evidence: string, expected: number, feature: string, fill: string[], old: string, path: string, press: string[], preview: string, runDir: string, driverDir: string, basePath: string, stamp: string, timeout: number }} Config
 */

/**
 * @returns {Config}
 */
const configOf = () => {
  const old = trimOrigin(flag("old") || OLD_ORIGIN);
  const preview = trimOrigin(flag("preview") || PREVIEW_ORIGIN);
  const given = flag("path") || "/help";
  const evidence = path.resolve(flag("evidence") || EVIDENCE_ROOT);
  const feature = flag("feature");
  const stamp = stampOf(new Date());
  const runDir = path.join(evidence, feature, stamp);

  return {
    basePath: trimOrigin(new URL(preview).pathname),
    click: flagAll("click"),
    driver: path.resolve(REPOSITORY_ROOT, flag("driver") || DRIVER),
    driverDir: path.join(runDir, "driver"),
    evidence,
    expected: Number(flag("expect") || "200"),
    feature,
    fill: flagAll("fill"),
    old,
    path: given.startsWith("/") ? given : `/${given}`,
    press: flagAll("press"),
    preview,
    runDir,
    stamp,
    timeout: Number(flag("timeout") || TIMEOUT),
  };
};

/**
 * @param {Config} config
 * @returns {Promise<Facts | null>}
 */
const collect = async (config) => {
  const ran = drive({
    click: config.click,
    driverDir: config.driverDir,
    driverPath: config.driver,
    fill: config.fill,
    old: config.old,
    press: config.press,
    preview: config.preview,
    routePath: config.path,
  });

  if (ran.error !== undefined) {
    fail(`the driver did not run: ${ran.error.message}`);

    return null;
  }

  if (ran.status !== 0) {
    fail(
      `the driver exited ${String(ran.status)}: ${(ran.stderr ?? "").trim()}`
    );

    return null;
  }

  const report = decodeReport(
    await readFile(path.join(config.driverDir, "report-page.json"), "utf-8")
  );

  const oldPages = report.baseReport[0]?.pages ?? [];
  const newPages = report.headReport[0]?.pages ?? [];
  const oldDesktop = pick(oldPages, DESKTOP);
  const newDesktop = pick(newPages, DESKTOP);

  if (oldDesktop === undefined || newDesktop === undefined) {
    fail(
      `the driver reported no ${DESKTOP} page for ${config.path}, so there is nothing to compare`
    );

    return null;
  }

  const text = textDiff(
    await readText(oldDesktop.textFile),
    await readText(newDesktop.textFile)
  );

  const links = linkDiff(
    oldDesktop.links ?? [],
    newDesktop.links ?? [],
    config.basePath
  );

  const actions = [
    ...(oldDesktop.actions ?? []).map(
      (entry) => `old ${describeAction(entry)}`
    ),
    ...(newDesktop.actions ?? []).map(
      (entry) => `preview ${describeAction(entry)}`
    ),
  ];

  const headTags = {
    old: await readHead(
      oldDesktop.finalUrl ?? `${config.old}${config.path}`,
      config.timeout
    ),
    preview: await readHead(
      newDesktop.finalUrl ?? `${config.preview}${config.path}`,
      config.timeout
    ),
  };

  const verdict = verdictOf({
    addedInNewLinks: links.addedInNew,
    addedInNewText: text.addedInNew,
    changedText: links.changedText,
    expected: config.expected,
    missingFromNewLinks: links.missingFromNew,
    missingFromNewText: text.missingFromNew,
    newStatus: newDesktop.status ?? null,
    oldStatus: oldDesktop.status ?? null,
  });

  await writePairs({
    newDesktop,
    newPhone: pick(newPages, PHONE),
    oldDesktop,
    oldPhone: pick(oldPages, PHONE),
    runDir: config.runDir,
  });

  await writeArtifacts({
    basePath: config.basePath,
    headTags,
    links,
    runDir: config.runDir,
    text,
  });

  /** @type {Facts} */
  const facts = {
    actions,
    addedInNewLinks: links.addedInNew,
    addedInNewText: text.addedInNew,
    changedText: links.changedText,
    evidence: config.evidence,
    expected: config.expected,
    feature: config.feature,
    headTags,
    missingFromNewLinks: links.missingFromNew,
    missingFromNewText: text.missingFromNew,
    newStatus: newDesktop.status ?? null,
    old: config.old,
    oldStatus: oldDesktop.status ?? null,
    path: config.path,
    preview: config.preview,
    reasons: verdict.reasons,
    stamp: config.stamp,
    verdict: verdict.verdict,
  };

  await writeJson(path.join(config.runDir, "run.json"), facts);
  await writeText(path.join(config.runDir, "report.md"), reportOf(facts));

  return facts;
};

const main = async () => {
  if (argv.includes("--help")) {
    process.stdout.write(`${USAGE}\n`);

    return;
  }

  const config = configOf();

  if (config.feature === "") {
    fail(`--feature is required\n${USAGE}`);

    return;
  }

  const facts = await collect(config);

  if (facts === null) {
    return;
  }

  if (argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(facts, null, 2)}\n`);
  } else {
    print(facts);
  }

  process.exitCode = facts.verdict === "PASS" ? 0 : 1;
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
