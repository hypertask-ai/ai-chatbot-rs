import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { Schema } from "effect";

const root = path.join(import.meta.dirname, "..");

const MAIN_SHA = "1".repeat(40);

const STALE_SHA = "2".repeat(40);

const OLD_HTML = `<!doctype html>
<html><head><title>Help Center - Hypertask</title></head>
<body><h1>How can we help?</h1></body></html>`;

/** @type {{ asset: boolean, oldNoindex: boolean, previewNoindex: boolean }} */
const state = {
  asset: true,
  oldNoindex: false,
  previewNoindex: true,
};

const previewHtml = () => `<!doctype html>
<html><head>
<title>Help Center - Hypertask</title>
${state.previewNoindex ? '<meta name="robots" content="noindex">' : ""}
<script type="module" src="/assets/app-fix.js"></script>
</head><body><h1>How can we help?</h1></body></html>`;

const ASSET = "console.log('fixture');";

const respond = (response, status, body, headers = {}) => {
  response.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    ...headers,
  });
  response.end(body);
};

const html = createServer((request, response) => {
  const url = request.url ?? "/";

  if (url === "/help" && state.oldNoindex) {
    respond(response, 200, OLD_HTML, { "x-robots-tag": "noindex" });

    return;
  }

  if (url === "/help") {
    respond(response, 200, OLD_HTML);

    return;
  }

  respond(response, 404, "missing");
});

const assets = createServer((request, response) => {
  const url = request.url ?? "/";

  if (url === "/") {
    respond(
      response,
      200,
      previewHtml(),
      state.previewNoindex ? { "x-robots-tag": "noindex" } : {}
    );

    return;
  }

  if (url === "/assets/app-fix.js" && state.asset) {
    response.writeHead(200, { "content-type": "text/javascript" });
    response.end(ASSET);

    return;
  }

  respond(response, 404, "missing");
});

html.listen(0, "127.0.0.1");

assets.listen(0, "127.0.0.1");

await Promise.all([once(html, "listening"), once(assets, "listening")]);

const decodePort = Schema.decodeUnknownSync(
  Schema.Struct({ port: Schema.Number })
);

/**
 * @param {import("node:http").Server} server
 * @returns {string}
 */
const originOf = (server) => {
  const { port } = decodePort(server.address());

  return `http://127.0.0.1:${String(port)}`;
};

const oldOrigin = originOf(html);

const previewOrigin = originOf(assets);

const GH = `#!/usr/bin/env node
const args = process.argv.slice(2);
const main = "${MAIN_SHA}";
const run = process.env.FAKE_RUN_SHA ?? main;
if (args[0] === "api") {
  process.stdout.write(main + "\\n");
} else {
  process.stdout.write(JSON.stringify([{
    conclusion: "success",
    createdAt: "2026-11-19T00:00:00Z",
    databaseId: 44592257889,
    headSha: run,
    url: "https://example.invalid/run/44592257889"
  }]));
}
`;

const binDir = mkdtempSync(path.join(tmpdir(), "site-doctor-gh-"));

writeFileSync(path.join(binDir, "gh"), GH);

chmodSync(path.join(binDir, "gh"), 0o755);

mkdirSync(path.join(binDir, "empty"), { recursive: true });

/**
 * @param {string[]} args
 * @param {{ path?: string, runSha?: string }} [options]
 * @returns {Promise<{ status: number | null, stderr: string, stdout: string }>}
 */
const runDoctor = async (args, options = {}) => {
  const child = spawn(
    process.execPath,
    [
      path.join(root, "verify/site-doctor.mjs"),
      "--old",
      oldOrigin,
      "--preview",
      previewOrigin,
      ...args,
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        FAKE_RUN_SHA: options.runSha ?? MAIN_SHA,
        PATH: options.path ?? `${binDir}:${process.env.PATH ?? ""}`,
      },
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

  return { status: closed[0], stderr, stdout };
};

const reset = () => {
  state.asset = true;
  state.oldNoindex = false;
  state.previewNoindex = true;
};

try {
  await test("a healthy pair passes every check", async () => {
    reset();

    const result = await runDoctor([]);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /^pass old: 200 "Help Center - Hypertask"/mu);
    assert.match(result.stdout, /^pass preview: 200 /mu);
    assert.match(result.stdout, /^pass preview-noindex: /mu);
    assert.match(result.stdout, /^pass old-indexable: /mu);
    assert.match(
      result.stdout,
      /^pass preview-build: app-fix\.js answered 200/mu
    );
    assert.match(result.stdout, /^pass publish: run 44592257889 published /mu);
    assert.match(result.stdout, /^doctor: ok \(6 checks\)$/mu);
  });

  await test("a preview without noindex fails", async () => {
    reset();
    state.previewNoindex = false;

    const result = await runDoctor(["--json"]);

    assert.equal(result.status, 1, result.stdout);

    const payload = JSON.parse(result.stdout);

    const check = payload.checks.find(
      (entry) => entry.name === "preview-noindex"
    );

    assert.equal(payload.verdict, "failed");
    assert.equal(check.state, "fail");
    assert.match(check.detail, /noindex header missing/mu);
    assert.match(check.fix, /site-base-path\.ts/u);
  });

  await test("a noindex live site fails", async () => {
    reset();
    state.oldNoindex = true;

    const result = await runDoctor([]);

    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, /^fail old-indexable: /mu);
  });

  await test("a missing preview asset fails the build check", async () => {
    reset();
    state.asset = false;

    const result = await runDoctor([]);

    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, /^fail preview-build: the page links /mu);
  });

  await test("a preview behind main fails the publish check", async () => {
    reset();

    const result = await runDoctor([], { runSha: STALE_SHA });

    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, /^fail publish: main is at /mu);
    assert.match(result.stdout, /run 44592257889/u);
  });

  await test("a missing gh reports the publish check as unknown", async () => {
    reset();

    const result = await runDoctor([], {
      path: path.join(binDir, "empty"),
    });

    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, /^unknown publish: /mu);
    assert.match(result.stdout, /^doctor: failed /mu);
  });

  await test("the help flag prints the usage without running", async () => {
    reset();

    const result = await runDoctor(["--help"]);

    assert.equal(result.status, 0, result.stdout);
    assert.match(result.stdout, /node verify\/site-doctor\.mjs/u);
  });
} finally {
  const closed = [];

  for (const server of [html, assets]) {
    closed.push(once(server, "close"));
    server.close();
  }

  await Promise.all(closed);
  rmSync(binDir, { force: true, recursive: true });
}
