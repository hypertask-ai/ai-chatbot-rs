import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { Schema } from "effect";
import { PNG } from "pngjs";

import {
  composePair,
  linkDiff,
  linesOf,
  normalizeHref,
  stampOf,
  textDiff,
  verdictOf,
} from "./parity-evidence.mjs";

const Facts = Schema.Struct({
  missingFromNewText: Schema.Array(Schema.String),
  newStatus: Schema.NullOr(Schema.Number),
  old: Schema.String,
  oldStatus: Schema.NullOr(Schema.Number),
  path: Schema.String,
  preview: Schema.String,
  reasons: Schema.Array(Schema.String),
  verdict: Schema.String,
});

const HeadTags = Schema.Struct({
  old: Schema.Struct({
    tags: Schema.Struct({ robots: Schema.NullOr(Schema.String) }),
  }),
  preview: Schema.Struct({
    status: Schema.Number,
    tags: Schema.Struct({ robots: Schema.NullOr(Schema.String) }),
  }),
});

const Links = Schema.Struct({
  missingFromNew: Schema.Array(Schema.String),
  previewBasePath: Schema.String,
});

const decodeFacts = Schema.decodeUnknownSync(Schema.fromJsonString(Facts));

const decodeHeadTags = Schema.decodeUnknownSync(
  Schema.fromJsonString(HeadTags)
);

const decodeLinks = Schema.decodeUnknownSync(Schema.fromJsonString(Links));

const decodeArgv = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Array(Schema.String))
);

const root = path.join(import.meta.dirname, "..");

const RED_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACklEQVR4AWPAAAAAEgABKPhxBgAAAABJRU5ErkJggg==",
  "base64"
);

const WHITE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVR4AWP8DwQMQMDEAAUAPfgEADYYS7QAAAAASUVORK5CYII=",
  "base64"
);

const OLD_HTML = `<!doctype html>
<html><head><title>Help Center - Hypertask</title></head>
<body><h1>How can we help?</h1></body></html>`;

const NEW_HTML = `<!doctype html>
<html><head>
<title>Help Center - Hypertask</title>
<meta name="robots" content="noindex">
</head><body><h1>How can we help?</h1></body></html>`;

const FIXTURE_DRIVER = `import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const spec = JSON.parse(readFileSync(process.env.FIXTURE_SPEC, "utf-8"));
const screens = process.env.SCREENS_DIR ?? "";

mkdirSync(screens, { recursive: true });

const pageOf = (side, viewport) => {
  const textFile = path.join(screens, side + "-" + viewport + "-text.txt");
  const shot = path.join(screens, side + "-" + viewport + ".png");

  writeFileSync(textFile, spec[side].text);
  writeFileSync(shot, Buffer.from(spec[side].png, "base64"));

  return {
    blockedChatSends: [],
    consoleErrors: [],
    failedRequests: [],
    finalUrl: spec[side].finalUrl,
    label: side,
    links: spec[side].links,
    pageErrors: [],
    screenshotFull: shot,
    screenshotViewport: shot,
    status: spec[side].status,
    textFile,
    title: "Fixture help",
    url: spec[side].finalUrl,
    viewport,
    words: 3
  };
};

writeFileSync(
  path.join(screens, "argv.json"),
  JSON.stringify(process.argv.slice(2))
);

writeFileSync(
  path.join(screens, "report-page.json"),
  JSON.stringify({
    base: spec.old.finalUrl,
    baseReport: [
      { pages: [pageOf("old", "1440"), pageOf("old", "390")], path: "/help" }
    ],
    head: spec.new.finalUrl,
    headReport: [
      { pages: [pageOf("new", "1440"), pageOf("new", "390")], path: "/help" }
    ]
  })
);
`;

const server = createServer((request, response) => {
  const url = request.url ?? "/";
  const body = url.startsWith("/new") ? NEW_HTML : OLD_HTML;

  if (url.endsWith("/help")) {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(body);

    return;
  }

  response.writeHead(404, { "content-type": "text/plain" });
  response.end("missing");
});

server.listen(0, "127.0.0.1");

await once(server, "listening");

const decodePort = Schema.decodeUnknownSync(
  Schema.Struct({ port: Schema.Number })
);

const decodeStatus = Schema.decodeUnknownSync(Schema.NullOr(Schema.Number));

const { port } = decodePort(server.address());

const origin = `http://127.0.0.1:${String(port)}`;

const workDir = mkdtempSync(path.join(tmpdir(), "parity-evidence-"));

const driverPath = path.join(workDir, "fixture-driver.mjs");

const specPath = path.join(workDir, "spec.json");

writeFileSync(driverPath, FIXTURE_DRIVER);

/**
 * @param {{ new?: Record<string, unknown>, old?: Record<string, unknown> }} [overrides]
 * @returns {Record<string, Record<string, unknown>>}
 */
const spec = (overrides = {}) => ({
  new: {
    finalUrl: `${origin}/new/help`,
    links: [
      { href: `${origin}/new/help/pricing-plans`, text: "Pricing plans" },
    ],
    png: WHITE_PNG.toString("base64"),
    status: 200,
    text: "How can we help?\nPricing plans\n",
    ...overrides.new,
  },
  old: {
    finalUrl: `${origin}/old/help`,
    links: [{ href: `${origin}/help/pricing-plans`, text: "Pricing plans" }],
    png: RED_PNG.toString("base64"),
    status: 200,
    text: "How can we help?\nPricing plans\n",
    ...overrides.old,
  },
});

/**
 * @param {{ evidence?: string, extra?: string[], spec?: ReturnType<typeof spec> }} options
 * @returns {Promise<{ status: number | null, stderr: string, stdout: string }>}
 */
const runEvidence = async (options = {}) => {
  writeFileSync(specPath, JSON.stringify(options.spec ?? spec()));

  const child = spawn(
    process.execPath,
    [
      path.join(root, "verify/parity-evidence.mjs"),
      "--feature",
      "fixture",
      "--path",
      "/help",
      "--old",
      `${origin}/old`,
      "--preview",
      `${origin}/new`,
      "--evidence",
      options.evidence ?? path.join(workDir, "evidence"),
      "--driver",
      driverPath,
      ...(options.extra ?? []),
      "--json",
    ],
    {
      cwd: root,
      env: { ...process.env, FIXTURE_SPEC: specPath },
    }
  );

  let stdout = "";
  let stderr = "";

  child.stdout?.setEncoding("utf-8");
  child.stderr?.setEncoding("utf-8");
  child.stdout?.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr?.on("data", (chunk) => {
    stderr += chunk;
  });

  const timer = setTimeout(() => {
    child.kill();
  }, 60_000);

  const closed = await once(child, "close");

  clearTimeout(timer);

  return { status: decodeStatus(closed[0]), stderr, stdout };
};

/**
 * @param {string} evidence
 * @returns {string}
 */
const runOf = (evidence) => {
  const featureDir = path.join(evidence, "fixture");
  const [stamp] = readdirSync(featureDir).toSorted();

  if (stamp === undefined) {
    throw new Error("the run wrote no folder");
  }

  return path.join(featureDir, stamp);
};

await test("a stamp names the run and survives a file name", () => {
  assert.equal(
    stampOf(new Date("2026-11-19T20:15:00.000Z")),
    "2026-11-19T20-15-00-000Z"
  );
});

await test("addresses are compared under their own base path", () => {
  assert.equal(
    normalizeHref("https://help.hypertask.ai/ratstack/help/", "/ratstack"),
    "/help"
  );
  assert.equal(
    normalizeHref(
      "https://help.hypertask.ai/ratstack/?category=Agents#all",
      "/ratstack"
    ),
    "/?category=Agents#all"
  );
  assert.equal(
    normalizeHref("https://help.hypertask.ai/help", "/ratstack"),
    "/help"
  );
  assert.equal(
    normalizeHref("https://help.hypertask.ai/ratstack/", "/ratstack"),
    "/"
  );
});

await test("text is compared line by line without whitespace noise", () => {
  assert.deepEqual(linesOf(" a  b \n\n c\t\n"), ["a b", "c"]);

  const diff = textDiff("One\nTwo\n", "One\nThree\n");

  assert.deepEqual(diff.missingFromNew, ["Two"]);
  assert.deepEqual(diff.addedInNew, ["Three"]);
});

await test("links are compared by address, then by wording", () => {
  const oldLinks = [
    { href: "https://help.hypertask.ai/help/pricing-plans", text: "Plans" },
    {
      href: "https://help.hypertask.ai/help/invite",
      text: "Invite a teammate",
    },
  ];

  const newLinks = [
    {
      href: "https://help.hypertask.ai/ratstack/help/pricing-plans",
      text: "Plans and seats",
    },
  ];

  const diff = linkDiff(oldLinks, newLinks, "/ratstack");

  assert.deepEqual(diff.missingFromNew, ["/help/invite"]);
  assert.deepEqual(diff.addedInNew, []);
  assert.deepEqual(diff.changedText, [
    '/help/pricing-plans: "Plans" became "Plans and seats"',
  ]);
});

await test("two screenshots compose into one image side by side", () => {
  const composed = PNG.sync.read(composePair(RED_PNG, WHITE_PNG));

  assert.equal(composed.width, 4);
  assert.equal(composed.height, 2);
  assert.deepEqual([...composed.data.subarray(0, 4)], [0, 0, 0, 0]);
  assert.deepEqual([...composed.data.subarray(8, 12)], [255, 255, 255, 255]);
});

await test("a verdict names every reason it fails on", () => {
  const clean = verdictOf({
    addedInNewLinks: [],
    addedInNewText: [],
    changedText: [],
    expected: 200,
    missingFromNewLinks: [],
    missingFromNewText: [],
    newStatus: 200,
    oldStatus: 200,
  });

  assert.deepEqual(clean, { reasons: [], verdict: "PASS" });

  const broken = verdictOf({
    addedInNewLinks: ["/help/new"],
    addedInNewText: ["New words"],
    changedText: ['/help/one: "a" became "b"'],
    expected: 200,
    missingFromNewLinks: ["/help/invite"],
    missingFromNewText: ["Two"],
    newStatus: 404,
    oldStatus: 200,
  });

  assert.equal(broken.verdict, "FAIL");
  assert.equal(broken.reasons.length, 4);
});

await test("a matching pair writes side by side evidence", async () => {
  const evidence = path.join(workDir, "evidence-pass");

  const result = await runEvidence({
    evidence,
    extra: [
      "--click",
      "#reveal",
      "--fill",
      "#fixture-input=agents",
      "--press",
      "End",
    ],
  });

  assert.equal(result.status, 0, result.stderr + result.stdout);

  const payload = decodeFacts(result.stdout);
  const runDir = runOf(evidence);

  assert.equal(payload.verdict, "PASS");
  assert.equal(payload.path, "/help");
  assert.equal(payload.old, `${origin}/old`);
  assert.equal(payload.preview, `${origin}/new`);
  assert.equal(payload.oldStatus, 200);
  assert.equal(payload.newStatus, 200);

  for (const file of [
    "head-tags.json",
    "links.json",
    "report.md",
    "run.json",
    "side-by-side-1440.png",
    "side-by-side-390.png",
    "text-diff.txt",
  ]) {
    assert.ok(existsSync(path.join(runDir, file)), `${file} is missing`);
  }

  const headTags = decodeHeadTags(
    readFileSync(path.join(runDir, "head-tags.json"), "utf-8")
  );

  assert.equal(headTags.old.tags.robots, null);
  assert.equal(headTags.preview.tags.robots, "noindex");
  assert.equal(headTags.preview.status, 200);

  const argv = decodeArgv(
    readFileSync(path.join(runDir, "driver", "argv.json"), "utf-8")
  );

  assert.deepEqual(argv.slice(0, 2), ["page", "--head"]);
  assert.deepEqual(argv.slice(-6), [
    "--click",
    "#reveal",
    "--fill",
    "#fixture-input=agents",
    "--press",
    "End",
  ]);

  const composed = PNG.sync.read(
    readFileSync(path.join(runDir, "side-by-side-1440.png"))
  );

  assert.equal(composed.width, 4);
  assert.match(
    readFileSync(path.join(runDir, "report.md"), "utf-8"),
    /^\| robots \| \(absent\) \| noindex \|$/mu
  );
});

await test("a missing sentence and a missing link fail the run", async () => {
  const evidence = path.join(workDir, "evidence-fail");

  const result = await runEvidence({
    evidence,
    spec: spec({
      new: {
        links: [
          { href: `${origin}/new/help/pricing-plans`, text: "Pricing plans" },
        ],
        text: "How can we help?\n",
      },
    }),
  });

  assert.equal(result.status, 1, result.stderr);

  const payload = decodeFacts(result.stdout);
  const runDir = runOf(evidence);

  assert.equal(payload.verdict, "FAIL");
  assert.deepEqual(payload.missingFromNewText, ["Pricing plans"]);

  const links = decodeLinks(
    readFileSync(path.join(runDir, "links.json"), "utf-8")
  );

  assert.deepEqual(links.previewBasePath, "/new");
  assert.deepEqual(links.missingFromNew, []);

  const text = readFileSync(path.join(runDir, "text-diff.txt"), "utf-8");

  assert.match(text, /Pricing plans/u);
  assert.match(
    readFileSync(path.join(runDir, "report.md"), "utf-8"),
    /- verdict: FAIL/mu
  );
});

await test("a not-found journey passes when both sites answer 404", async () => {
  const result = await runEvidence({
    evidence: path.join(workDir, "evidence-404-both"),
    extra: ["--expect", "404"],
    spec: spec({ new: { status: 404 }, old: { status: 404 } }),
  });

  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(decodeFacts(result.stdout).verdict, "PASS");
});

await test("a preview that answers nothing fails with its status", async () => {
  const result = await runEvidence({
    evidence: path.join(workDir, "evidence-404"),
    spec: spec({ new: { status: 404 } }),
  });

  assert.equal(result.status, 1, result.stderr);

  const payload = decodeFacts(result.stdout);

  assert.equal(payload.verdict, "FAIL");
  assert.match(
    payload.reasons.join("\n"),
    /the preview answered 404 where the old site answered 200/u
  );
});

mkdirSync(path.join(workDir, "unused"), { recursive: true });

try {
  await test("the help flag prints the usage without driving", async () => {
    const child = spawn(
      process.execPath,
      [path.join(root, "verify/parity-evidence.mjs"), "--help"],
      { cwd: root }
    );

    let stdout = "";

    child.stdout?.setEncoding("utf-8");
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });

    const closed = await once(child, "close");

    assert.equal(closed[0], 0);
    assert.match(stdout, /--feature/mu);
  });
} finally {
  const closed = once(server, "close");

  server.close();
  await closed;
  rmSync(workDir, { force: true, recursive: true });
}
