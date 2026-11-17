import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { once } from "node:events";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { Schema } from "effect";

import {
  expectOpenedPastChat,
  loadVerifySeed,
  startSeedServer,
  wrapBuiltWorker,
} from "./seed.mjs";

const root = path.join(import.meta.dirname, "..");

const articlesFile = path.join(
  root,
  "packages/core/test/fixtures/help-articles.json"
);

const chatFile = path.join(import.meta.dirname, "seed-chat.json");

const RecordedRow = Schema.Struct({
  id: Schema.String,
  url: Schema.NullOr(Schema.String),
});

const Summary = Schema.Struct({
  content: Schema.optionalKey(Schema.String),
  created_at: Schema.optionalKey(Schema.String),
  id: Schema.String,
  slug: Schema.String,
  title: Schema.String,
  url: Schema.NullOr(Schema.String),
});

const ArticleBody = Schema.Struct({
  content: Schema.String,
});

const WrappedProbe = Schema.Struct({
  count: Schema.Number,
  healthStatus: Schema.Number,
  healthText: Schema.String,
});

const decodeRecorded = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Array(RecordedRow))
);

const decodeSummaries = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Array(Summary))
);

const decodeArticle = Schema.decodeUnknownSync(
  Schema.fromJsonString(ArticleBody)
);

const decodeProbe = Schema.decodeUnknownSync(
  Schema.fromJsonString(WrappedProbe)
);

/**
 * @param {import("node:http").Server} server
 * @returns {number}
 */
const portOf = (server) => {
  const address = server.address();

  if (
    address === null ||
    !("port" in address) ||
    !Number.isInteger(address.port)
  ) {
    throw new Error("test server did not bind");
  }

  return address.port;
};

/**
 * @returns {string}
 */
const tempDir = () => mkdtempSync(path.join(tmpdir(), "verify-seed-"));

/**
 * @param {readonly { content: string }[]} messages
 * @returns {string}
 */
const openingContent = (messages) => {
  const [opening] = messages;

  if (opening === undefined) {
    throw new Error("sample chat has no opening message");
  }

  return opening.content;
};

await test("the recorded fixture is 97 articles and keeps a missing url", async () => {
  const seed = await loadVerifySeed();
  const recorded = decodeRecorded(readFileSync(articlesFile, "utf-8"));
  const missing = recorded.find((article) => article.url === null);

  assert.equal(seed.articles.length, 97);
  assert.deepEqual(
    seed.articles.map((article) => article.id),
    recorded.map((article) => article.id)
  );
  assert.ok(missing);
  assert.equal(
    seed.articles.find((article) => article.id === missing.id)?.url,
    null
  );
  assert.equal(seed.chat.conversation.id, "seed-past-chat");
  assert.equal(
    seed.chat.conversation.visitor_email,
    "sample.visitor@example.com"
  );
  assert.equal(seed.chat.conversation.is_eval, 1);
});

await test("a short article fixture is refused", async () => {
  const dir = tempDir();
  const articlesPath = path.join(dir, "articles.json");

  writeFileSync(
    articlesPath,
    JSON.stringify([
      {
        content: "One row is not the recorded set.",
        id: "only-row",
        slug: "only-row",
        title: "Only row",
        url: null,
      },
    ])
  );

  try {
    await assert.rejects(
      () => loadVerifySeed({ articlesPath }),
      /97 recorded articles/u
    );
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

await test("a sample chat on customer mail is refused", async () => {
  const dir = tempDir();
  const chatPath = path.join(dir, "chat.json");

  writeFileSync(
    chatPath,
    readFileSync(chatFile, "utf-8").replaceAll(
      "sample.visitor@example.com",
      "person@gmail.com"
    )
  );

  try {
    await assert.rejects(() => loadVerifySeed({ chatPath }), /customer mail/u);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

await test("the seed serves 97 articles and opens the seeded past chat", async () => {
  const upstream = createServer((_request, result) => {
    result.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    result.end("upstream-ok");
  });

  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");

  const started = await startSeedServer({
    port: 0,
    upstream: `http://127.0.0.1:${portOf(upstream)}`,
  });

  try {
    const origin = `http://127.0.0.1:${started.port}`;
    const list = await fetch(new URL("/api/articles", origin));
    const rows = decodeSummaries(await list.text());
    const seed = await loadVerifySeed();
    const [first] = rows;
    const [article] = seed.articles;
    const missing = seed.articles.find((row) => row.url === null);

    assert.equal(list.status, 200);
    assert.equal(rows.length, 97);
    assert.ok(first);
    assert.equal(first.content, undefined);
    assert.equal(first.created_at, undefined);
    assert.deepEqual(
      rows.map((row) => row.id),
      seed.articles.map((row) => row.id)
    );
    assert.ok(missing);
    assert.equal(rows.find((row) => row.id === missing.id)?.url, null);
    assert.ok(article);

    const articleResponse = await fetch(
      new URL(`/api/articles/${article.slug}`, origin)
    );

    const body = decodeArticle(await articleResponse.text());

    assert.equal(body.content, article.content);

    const page = await fetch(
      new URL("/widget/chat?conversation=seed-past-chat", origin)
    );

    const html = await page.text();

    assert.equal(page.status, 200);
    assert.match(html, /Opened seed-past-chat/u);
    assert.match(html, /How do I filter chats to one board\?/u);

    const plainWidget = await fetch(new URL("/widget/chat", origin));

    const otherChat = await fetch(
      new URL("/widget/chat?conversation=seed-other", origin)
    );

    assert.equal(await plainWidget.text(), "upstream-ok");
    assert.equal(await otherChat.text(), "upstream-ok");

    const posted = await fetch(new URL("/api/articles", origin), {
      method: "POST",
    });

    assert.equal(posted.status, 405);

    const health = await fetch(new URL("/health", origin));

    assert.equal(health.status, 200);
    assert.equal(await health.text(), "upstream-ok");
  } finally {
    started.server.close();
    upstream.close();
  }
});

await test("a forwarded path cannot choose the upstream host", async () => {
  /** @type {string[]} */
  const seen = [];

  const upstream = createServer((request, result) => {
    seen.push(`${request.headers.host ?? ""} ${request.url ?? ""}`);
    result.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    result.end("upstream-ok");
  });

  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const upstreamPort = portOf(upstream);

  const started = await startSeedServer({
    port: 0,
    upstream: `http://127.0.0.1:${upstreamPort}`,
  });

  const readText = Schema.decodeUnknownSync(Schema.String);

  /**
   * @param {string} requestPath
   * @returns {Promise<{ body: string, status: number | undefined }>}
   */
  const send = async (requestPath) => {
    /** @type {string[]} */
    const parts = [];

    /** @type {number[]} */
    const statuses = [];

    const outgoing = httpRequest(
      {
        hostname: "127.0.0.1",
        method: "GET",
        path: requestPath,
        port: started.port,
      },
      (result) => {
        result.setEncoding("utf-8");

        if (result.statusCode !== undefined) {
          statuses.push(result.statusCode);
        }

        result.on("data", (chunk) => {
          parts.push(readText(chunk));
        });
      }
    );

    const closed = once(outgoing, "close");

    outgoing.end();
    await closed;

    return {
      body: parts.join(""),
      status: statuses[0],
    };
  };

  try {
    const health = await send("/health?x=1");
    const attack = await send("/.//evil.example");

    assert.equal(health.status, 200);
    assert.equal(health.body, "upstream-ok");
    assert.equal(attack.status, 200);
    assert.equal(attack.body, "upstream-ok");
    assert.deepEqual(seen, [
      `127.0.0.1:${upstreamPort} /health?x=1`,
      `127.0.0.1:${upstreamPort} //evil.example`,
    ]);
  } finally {
    started.server.close();
    upstream.close();
  }
});

await test("a wrapped worker serves the seed and keeps its other routes", async () => {
  const dir = tempDir();
  const serverDir = path.join(dir, "server");
  const entryPath = path.join(serverDir, "entry.mjs");

  mkdirSync(serverDir);
  writeFileSync(
    path.join(serverDir, "foldkit.build.json"),
    JSON.stringify({ serverEntry: "entry.mjs" })
  );
  writeFileSync(
    entryPath,
    `export default {
  fetch: async (request) =>
    new Response("original " + new URL(request.url).pathname, { status: 404 }),
};
`
  );

  try {
    const first = await wrapBuiltWorker(dir);
    const second = await wrapBuiltWorker(dir);

    const probe = `
      const worker = await import(${JSON.stringify(pathToFileURL(entryPath).href)});
      const articles = await worker.default.fetch(new Request("http://127.0.0.1/api/articles"));
      const health = await worker.default.fetch(new Request("http://127.0.0.1/health"));
      const rows = await articles.json();
      process.stdout.write(JSON.stringify({
        count: rows.length,
        healthStatus: health.status,
        healthText: await health.text(),
      }));
    `;

    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", probe],
      { encoding: "utf-8" }
    );

    assert.equal(first.already, false);
    assert.equal(first.entry, "entry.mjs");
    assert.equal(second.already, true);
    assert.equal(result.status, 0, result.stderr);

    const body = decodeProbe(result.stdout);

    assert.equal(body.count, 97);
    assert.equal(body.healthStatus, 404);
    assert.equal(body.healthText, "original /health");
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

await test("the driver gate accepts an opened past chat and rejects a closed one", async () => {
  const dir = tempDir();
  const textFile = path.join(dir, "page.txt");
  const reportPath = path.join(dir, "report.json");
  const seed = await loadVerifySeed();
  const opening = openingContent(seed.chat.messages);

  writeFileSync(textFile, `Opened ${seed.chat.conversation.id}\n${opening}\n`);
  writeFileSync(
    reportPath,
    JSON.stringify({
      extra: true,
      headReport: [
        {
          pages: [{ status: 200, textFile, viewport: "1440" }],
          path: `/widget/chat?conversation=${seed.chat.conversation.id}`,
        },
      ],
    })
  );

  try {
    await expectOpenedPastChat(reportPath);

    const closedPath = path.join(dir, "closed.json");

    writeFileSync(
      closedPath,
      JSON.stringify({
        headReport: [
          {
            pages: [{ status: 500, textFile }],
            path: `/widget/chat?conversation=${seed.chat.conversation.id}`,
          },
        ],
      })
    );
    await assert.rejects(
      () => expectOpenedPastChat(closedPath),
      /did not open past chat/u
    );
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});
