import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { Schema } from "effect";

const root = path.join(import.meta.dirname, "..");

const HELP_HTML = `<!doctype html>
<html>
<head><title>Fixture help</title></head>
<body>
<h1>Fixture help</h1>
<a href="/help/article">Read article</a>
<p>Visible fixture sentence for the driver.</p>
<button id="hypertask-help-bubble" type="button">Help</button>
<iframe src="/widget/chat" title="chat"></iframe>
<script>fetch("/api/chat/message", { method: "POST", body: "{}" }).catch(() => {})</script>
</body>
</html>`;

const WIDGET_HTML = `<!doctype html>
<html>
<head><title>Fixture widget</title></head>
<body>
<p>Welcome from the fixture</p>
<button type="button">Send</button>
<input name="message" placeholder="Ask a question" />
</body>
</html>`;

const HEALTH_BODY = '{"status":"ok","service":"fixture"}';

const SEARCH_HTML = `<!doctype html>
<html>
<head><title>Fixture search</title></head>
<body>
<h1>Fixture search</h1>
<a id="reveal" href="#all">All articles</a>
<input id="fixture-input" type="search" hidden />
<p id="fixture-echo">no query</p>
<script>
const input = document.querySelector("#fixture-input");
document.querySelector("#reveal").addEventListener("click", () => {
  input.hidden = false;
});
input.addEventListener("input", () => {
  document.querySelector("#fixture-echo").textContent = input.value;
});
</script>
</body>
</html>`;

const DriverPage = Schema.Struct({
  actions: Schema.optional(
    Schema.Array(
      Schema.Struct({
        action: Schema.String,
        error: Schema.optional(Schema.String),
        key: Schema.optional(Schema.String),
        ok: Schema.Boolean,
        target: Schema.optional(Schema.String),
      })
    )
  ),
  blockedChatSends: Schema.Array(Schema.String),
  error: Schema.optional(Schema.String),
  finalUrl: Schema.optional(Schema.String),
  headings: Schema.Array(
    Schema.Struct({
      level: Schema.String,
      text: Schema.String,
    })
  ),
  links: Schema.Array(
    Schema.Struct({
      href: Schema.String,
      text: Schema.String,
    })
  ),
  screenshotFull: Schema.String,
  screenshotViewport: Schema.String,
  status: Schema.Number,
  textFile: Schema.String,
  title: Schema.String,
  viewport: Schema.String,
  words: Schema.Number,
});

const PagePayload = Schema.Struct({
  base: Schema.String,
  baseReport: Schema.Array(Schema.Unknown),
  head: Schema.String,
  headReport: Schema.Array(
    Schema.Struct({
      pages: Schema.Array(DriverPage),
      path: Schema.String,
    })
  ),
});

const WidgetReport = Schema.Struct({
  blockedChatSends: Schema.Array(Schema.String),
  clicked: Schema.String,
  closedScreenshots: Schema.Struct({
    full: Schema.String,
    viewport: Schema.String,
  }),
  error: Schema.optional(Schema.String),
  openScreenshots: Schema.Struct({
    full: Schema.String,
    viewport: Schema.String,
  }),
  path: Schema.String,
  selectors: Schema.Array(
    Schema.Struct({
      count: Schema.Number,
      selector: Schema.String,
    })
  ),
  sentAMessage: Schema.Boolean,
  state: Schema.Struct({
    buttons: Schema.Array(
      Schema.Struct({
        label: Schema.String,
        type: Schema.String,
      })
    ),
    found: Schema.Boolean,
    inputs: Schema.Array(
      Schema.Struct({
        name: Schema.String,
        placeholder: Schema.String,
        tag: Schema.String,
      })
    ),
    textExcerpt: Schema.String,
  }),
  status: Schema.Number,
});

const WidgetPayload = Schema.Struct({
  base: Schema.String,
  head: Schema.String,
  onHead: Schema.Array(WidgetReport),
});

const ApiPayload = Schema.Struct({
  base: Schema.String,
  baseProbes: Schema.Array(Schema.Struct({ skipped: Schema.String })),
  head: Schema.String,
  headProbes: Schema.Array(
    Schema.Struct({
      bodyExcerpt: Schema.String,
      error: Schema.optional(Schema.String),
      headers: Schema.Record(Schema.String, Schema.String),
      location: Schema.String,
      status: Schema.Number,
      url: Schema.String,
    })
  ),
});

const decodeListening = Schema.decodeUnknownSync(
  Schema.Struct({ port: Schema.Number })
);

const decodePage = Schema.decodeUnknownSync(Schema.fromJsonString(PagePayload));

const decodeWidget = Schema.decodeUnknownSync(
  Schema.fromJsonString(WidgetPayload)
);

const decodeApi = Schema.decodeUnknownSync(Schema.fromJsonString(ApiPayload));

/** @type {string[]} */
const chatPosts = [];

const server = createServer((request, response) => {
  const url = request.url ?? "/";
  const method = request.method ?? "GET";

  if (method === "POST" && url.startsWith("/api/chat/")) {
    chatPosts.push(url);
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("sent");

    return;
  }

  if (method === "GET" && url === "/help") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(HELP_HTML);

    return;
  }

  if (method === "GET" && url === "/widget/chat") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(WIDGET_HTML);

    return;
  }

  if (method === "GET" && url === "/search-fixture") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(SEARCH_HTML);

    return;
  }

  if (method === "GET" && url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(HEALTH_BODY);

    return;
  }

  response.writeHead(404, { "content-type": "text/plain" });
  response.end("missing");
});

server.listen(0, "127.0.0.1");

await once(server, "listening");

const { port } = decodeListening(server.address());

const head = `http://127.0.0.1:${String(port)}`;

/**
 * @param {string[]} args
 * @param {string} screens
 * @returns {Promise<{ status: number | null; stderr: string; stdout: string }>}
 */
const runDriver = async (args, screens) => {
  const child = spawn(
    process.execPath,
    [path.join(root, "verify/driver.mjs"), ...args],
    {
      cwd: root,
      env: { ...process.env, SCREENS_DIR: screens },
    }
  );

  let stderr = "";
  let stdout = "";

  child.stderr?.setEncoding("utf-8");
  child.stdout?.setEncoding("utf-8");
  child.stderr?.on("data", (chunk) => {
    stderr += chunk;
  });
  child.stdout?.on("data", (chunk) => {
    stdout += chunk;
  });

  const timer = setTimeout(() => {
    child.kill();
  }, 100_000);

  const closed = await once(child, "close");

  clearTimeout(timer);

  const status = Schema.decodeUnknownSync(Schema.NullOr(Schema.Number))(
    closed[0]
  );

  return { status, stderr, stdout };
};

/**
 * @returns {string}
 */
const screensDir = () => mkdtempSync(path.join(tmpdir(), "driver-screens-"));

/**
 * @param {string} file
 * @returns {void}
 */
const assertPng = (file) => {
  const bytes = readFileSync(file);

  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
};

/**
 * @param {string[]} args
 * @returns {Promise<{ screens: string; stdout: string }>}
 */
const runOk = async (args) => {
  const screens = screensDir();

  try {
    const result = await runDriver(args, screens);
    const detail = `${result.stderr}\n${result.stdout}`;

    assert.equal(result.status, 0, detail);

    return { screens, stdout: result.stdout };
  } catch (error) {
    rmSync(screens, { force: true, recursive: true });

    throw error;
  }
};

try {
  await test("page report reads the fixture help page and blocks a chat send", async () => {
    chatPosts.length = 0;

    const { screens, stdout } = await runOk([
      "page",
      "--head",
      head,
      "--path",
      "/help",
    ]);

    const payload = decodePage(stdout);

    try {
      assert.equal(payload.base, "");
      assert.deepEqual(payload.baseReport, []);
      assert.equal(payload.head, head);
      assert.equal(payload.headReport.length, 1);

      const [group] = payload.headReport;

      if (group === undefined) {
        throw new Error("page report has no path");
      }

      assert.equal(group.path, "/help");

      const { pages } = group;

      assert.deepEqual(
        pages.map((page) => page.viewport),
        ["1440", "390"]
      );

      for (const page of pages) {
        assert.equal(page.status, 200);
        assert.equal(page.title, "Fixture help");
        assert.equal(page.finalUrl, `${head}/help`);
        assert.equal(page.error, undefined);
        assert.deepEqual(
          page.headings.filter((heading) => heading.level === "h1"),
          [{ level: "h1", text: "Fixture help" }]
        );
        assert.deepEqual(page.links, [
          { href: `${head}/help/article`, text: "Read article" },
        ]);
        assert.ok(page.words > 0);
        assert.match(
          readFileSync(page.textFile, "utf-8"),
          /Visible fixture sentence for the driver/u
        );
        assert.ok(
          page.blockedChatSends.some((url) => url.endsWith("/api/chat/message"))
        );
        assertPng(page.screenshotViewport);
        assertPng(page.screenshotFull);
      }

      assert.deepEqual(chatPosts, []);
    } finally {
      rmSync(screens, { force: true, recursive: true });
    }
  });

  await test("widget report opens the fixture launcher and does not deliver a chat send", async () => {
    chatPosts.length = 0;

    const { screens, stdout } = await runOk([
      "widget",
      "--head",
      head,
      "--path",
      "/help",
    ]);

    const payload = decodeWidget(stdout);

    try {
      assert.equal(payload.head, head);
      assert.equal(payload.base, "");
      assert.equal(payload.onHead.length, 1);

      const [report] = payload.onHead;

      if (report === undefined) {
        throw new Error("widget report has no head page");
      }

      assert.equal(report.status, 200);
      assert.equal(report.path, "/help");
      assert.equal(report.error, undefined);
      assert.equal(report.sentAMessage, false);
      assert.equal(report.clicked, "#hypertask-help-bubble");
      assert.ok(
        report.selectors.some(
          (entry) =>
            entry.selector === "#hypertask-help-bubble" && entry.count === 1
        )
      );
      assert.ok(
        report.selectors.some(
          (entry) =>
            entry.selector === "iframe[src*='widget']" && entry.count === 1
        )
      );
      assert.equal(report.state.found, true);
      assert.match(report.state.textExcerpt, /Welcome from the fixture/u);
      assert.deepEqual(report.state.buttons, [
        { label: "Send", type: "button" },
      ]);
      assert.deepEqual(report.state.inputs, [
        {
          name: "message",
          placeholder: "Ask a question",
          tag: "input",
        },
      ]);
      assert.ok(
        report.blockedChatSends.some((url) => url.endsWith("/api/chat/message"))
      );
      assertPng(report.closedScreenshots.viewport);
      assertPng(report.closedScreenshots.full);
      assertPng(report.openScreenshots.viewport);
      assertPng(report.openScreenshots.full);
      assert.deepEqual(chatPosts, []);
    } finally {
      rmSync(screens, { force: true, recursive: true });
    }
  });

  await test("click, fill and press run before the page is read", async () => {
    const { screens, stdout } = await runOk([
      "page",
      "--head",
      head,
      "--path",
      "/search-fixture",
      "--click",
      "#reveal",
      "--fill",
      "#fixture-input=agents",
      "--press",
      "End",
    ]);

    const payload = decodePage(stdout);

    try {
      const [group] = payload.headReport;

      if (group === undefined) {
        throw new Error("page report has no path");
      }

      for (const page of group.pages) {
        assert.deepEqual(page.actions, [
          { action: "click", ok: true, target: "#reveal" },
          { action: "fill", ok: true, target: "#fixture-input" },
          { action: "press", key: "End", ok: true },
        ]);
        assert.match(readFileSync(page.textFile, "utf-8"), /agents/u);
      }
    } finally {
      rmSync(screens, { force: true, recursive: true });
    }
  });

  await test("a control the actions cannot reach is reported, not thrown", async () => {
    const { screens, stdout } = await runOk([
      "page",
      "--head",
      head,
      "--path",
      "/help",
      "--click",
      "#no-such-control",
      "--fill",
      "#no-such-input=agents",
    ]);

    const payload = decodePage(stdout);

    try {
      const [group] = payload.headReport;

      if (group === undefined) {
        throw new Error("page report has no path");
      }

      for (const page of group.pages) {
        assert.equal(page.actions?.length, 2);
        assert.deepEqual(
          page.actions?.map((entry) => entry.ok),
          [false, false]
        );
        assert.match(page.actions?.[0]?.error ?? "", /TimeoutError/u);
      }
    } finally {
      rmSync(screens, { force: true, recursive: true });
    }
  });

  await test("api report reads the fixture health response", async () => {
    const { screens, stdout } = await runOk([
      "api",
      "--head",
      head,
      "--path",
      "/health",
    ]);

    const payload = decodeApi(stdout);

    try {
      assert.equal(payload.head, head);
      assert.equal(payload.base, "");
      assert.deepEqual(payload.baseProbes, [{ skipped: "no base url" }]);
      assert.equal(payload.headProbes.length, 1);

      const [probe] = payload.headProbes;

      if (probe === undefined) {
        throw new Error("api report has no health probe");
      }

      assert.equal(probe.status, 200);
      assert.equal(probe.url, `${head}/health`);
      assert.equal(probe.bodyExcerpt, HEALTH_BODY);
      assert.equal(probe.headers["content-type"], "application/json");
      assert.equal(probe.location, "");
      assert.equal(probe.error, undefined);
    } finally {
      rmSync(screens, { force: true, recursive: true });
    }
  });
} finally {
  const closed = once(server, "close");

  server.close();
  await closed;
}
