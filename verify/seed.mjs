import { once } from "node:events";
import { writeSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { Schema } from "effect";

const RECORDED_ARTICLE_COUNT = 97;

/**
 * @param {string} line
 * @returns {void}
 */
const logLine = (line) => {
  writeSync(1, `${line}\n`);
};

const ARTICLES_PATH = "/api/articles";

const PAST_CHAT_PATH = "/widget/chat";

const HISTORY_PREFIX = "/api/chat/history/";

const WRAP_MARKER = "const verifySeedWrapped = true;";

const SEED_ID = /^seed-[a-z0-9-]+$/u;

const articlesFile = path.join(
  import.meta.dirname,
  "../packages/core/test/fixtures/help-articles.json"
);

const chatFile = path.join(import.meta.dirname, "seed-chat.json");

const seedModuleHref = pathToFileURL(import.meta.filename).href;

const FixtureArticle = Schema.Struct({
  content: Schema.NonEmptyString,
  id: Schema.NonEmptyString,
  slug: Schema.NonEmptyString,
  title: Schema.NonEmptyString,
  url: Schema.NullOr(Schema.String),
});

const FixtureArticles = Schema.Array(FixtureArticle);

const SeedMessage = Schema.Struct({
  content: Schema.NonEmptyString,
  id: Schema.NonEmptyString,
  role: Schema.Literals(["admin", "bot", "user"]),
});

const SeedConversation = Schema.Struct({
  has_hypertask_account: Schema.Literals(["free", "none", "paid", "unknown"]),
  id: Schema.NonEmptyString,
  is_eval: Schema.Finite,
  status: Schema.Literals(["bot", "closed", "handoff_requested", "human"]),
  visitor_email: Schema.NonEmptyString,
  visitor_id: Schema.NonEmptyString,
  visitor_name: Schema.NonEmptyString,
});

const SeedChat = Schema.Struct({
  conversation: SeedConversation,
  messages: Schema.Array(SeedMessage).check(Schema.isMinLength(2)),
});

const PageHit = Schema.Struct({
  status: Schema.Number,
  textFile: Schema.String,
});

const PageGroup = Schema.Struct({
  pages: Schema.Array(PageHit),
  path: Schema.String,
});

const DriverPageReport = Schema.Struct({
  headReport: Schema.Array(PageGroup),
});

const decodeArticleFile = Schema.decodeUnknownSync(
  Schema.fromJsonString(FixtureArticles)
);

const decodeChatFile = Schema.decodeUnknownSync(
  Schema.fromJsonString(SeedChat)
);

const decodePageReport = Schema.decodeUnknownSync(
  Schema.fromJsonString(DriverPageReport)
);

const BuildManifest = Schema.Struct({
  serverEntry: Schema.NonEmptyString.check(Schema.isPattern(/^[^/\\]+$/u)),
});

const decodeManifest = Schema.decodeUnknownSync(
  Schema.fromJsonString(BuildManifest)
);

/**
 * @typedef {typeof FixtureArticle.Type} FixtureArticleRow
 * @typedef {typeof SeedChat.Type} SeedChatRow
 * @typedef {{ articles: readonly FixtureArticleRow[]; chat: SeedChatRow }} VerifySeed
 */

/** @type {Promise<VerifySeed> | undefined} */
let defaultSeed;

/**
 * @param {readonly FixtureArticleRow[]} articles
 * @returns {void}
 */
const assertRecordedArticles = (articles) => {
  if (articles.length !== RECORDED_ARTICLE_COUNT) {
    throw new Error(
      `The article fixture has ${articles.length} rows. The verify seed needs ${RECORDED_ARTICLE_COUNT} recorded articles. Fix: use packages/core/test/fixtures/help-articles.json.`
    );
  }

  const slugs = new Set(articles.map((article) => article.slug));

  if (slugs.size !== articles.length) {
    throw new Error(
      "The article fixture repeats a slug. The verify seed reads one row per slug. Fix: keep slug unique in packages/core/test/fixtures/help-articles.json."
    );
  }
};

/**
 * @param {SeedChatRow} chat
 * @returns {void}
 */
const assertSampleChat = (chat) => {
  const email = chat.conversation.visitor_email;

  const domain = "@example.com";

  if (
    !email.endsWith(domain) ||
    email.indexOf("@") !== email.length - domain.length
  ) {
    throw new Error(
      `The sample chat email is ${email}. Verify seeds stay off customer mail. Fix: use an @example.com address in verify/seed-chat.json.`
    );
  }

  const ids = [
    chat.conversation.id,
    chat.conversation.visitor_id,
    ...chat.messages.map((message) => message.id),
  ];

  const foreign = ids.find((id) => !SEED_ID.test(id));

  if (foreign !== undefined) {
    throw new Error(
      `The sample chat id ${foreign} is outside the seed- prefix. Verify seeds must not reuse a live id. Fix: prefix every id in verify/seed-chat.json with seed-.`
    );
  }

  if (chat.conversation.is_eval !== 1) {
    throw new Error(
      "The sample chat is not marked eval. A verify seed must not look like a customer conversation. Fix: set is_eval to 1 in verify/seed-chat.json."
    );
  }
};

/**
 * @param {{ articlesPath?: string; chatPath?: string }} paths
 * @returns {Promise<VerifySeed>}
 */
const readSeed = async (paths) => {
  const articles = decodeArticleFile(
    await readFile(paths.articlesPath ?? articlesFile, "utf-8")
  );

  const chat = decodeChatFile(
    await readFile(paths.chatPath ?? chatFile, "utf-8")
  );

  assertRecordedArticles(articles);
  assertSampleChat(chat);

  return { articles, chat };
};

/**
 * @param {{ articlesPath?: string; chatPath?: string }} [paths]
 * @returns {Promise<VerifySeed>}
 */
export const loadVerifySeed = (paths = {}) => {
  if (paths.articlesPath !== undefined || paths.chatPath !== undefined) {
    return readSeed(paths);
  }

  defaultSeed ??= readSeed({});

  return defaultSeed;
};

/**
 * @param {FixtureArticleRow} article
 * @returns {{ id: string; slug: string; title: string; url: string | null }}
 */
const summaryOf = (article) => ({
  id: article.id,
  slug: article.slug,
  title: article.title,
  url: article.url,
});

/**
 * @param {string} value
 * @returns {string}
 */
const escapeHtml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/**
 * @param {VerifySeed} seed
 * @returns {string}
 */
export const pastChatHtml = (seed) => {
  const messages = seed.chat.messages
    .map(
      (message) =>
        `<article data-role="${escapeHtml(message.role)}">${escapeHtml(message.content)}</article>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Past chat ${escapeHtml(seed.chat.conversation.id)}</title></head>
<body>
<h1>Past chat</h1>
<p>Opened ${escapeHtml(seed.chat.conversation.id)}</p>
${messages}
</body>
</html>
`;
};

/**
 * @param {string} pathname
 * @returns {string}
 */
const articleSlug = (pathname) => {
  const prefix = `${ARTICLES_PATH}/`;

  if (!pathname.startsWith(prefix)) {
    return "";
  }

  const slug = pathname.slice(prefix.length);

  if (slug.length === 0 || slug.includes("/")) {
    return "";
  }

  return slug;
};

/**
 * @param {VerifySeed} seed
 * @param {URL} url
 * @returns {boolean}
 */
const opensPastChat = (seed, url) =>
  url.pathname === PAST_CHAT_PATH &&
  url.searchParams.get("conversation") === seed.chat.conversation.id;

/**
 * @param {VerifySeed} seed
 * @param {URL} url
 * @returns {Response | null}
 */
const seedGet = (seed, url) => {
  if (url.pathname === ARTICLES_PATH) {
    return Response.json(seed.articles.map(summaryOf));
  }

  const slug = articleSlug(url.pathname);

  if (slug.length > 0) {
    const article = seed.articles.find((row) => row.slug === slug);

    if (article === undefined) {
      return new Response("unknown article\n", {
        headers: { "content-type": "text/plain; charset=utf-8" },
        status: 404,
      });
    }

    return Response.json(article);
  }

  if (opensPastChat(seed, url)) {
    return new Response(pastChatHtml(seed), {
      headers: { "content-type": "text/html; charset=utf-8" },
      status: 200,
    });
  }

  const historyPath = `${HISTORY_PREFIX}${seed.chat.conversation.id}`;

  if (url.pathname !== historyPath) {
    return null;
  }

  return Response.json(seed.chat);
};

/**
 * @param {Request} request
 * @param {VerifySeed} [seed]
 * @returns {Promise<Response | null>}
 */
export const seedResponse = async (request, seed) => {
  const loaded = seed ?? (await loadVerifySeed());
  const url = new URL(request.url);

  const owned =
    url.pathname === ARTICLES_PATH ||
    articleSlug(url.pathname).length > 0 ||
    opensPastChat(loaded, url) ||
    url.pathname === `${HISTORY_PREFIX}${loaded.chat.conversation.id}`;

  if (!owned) {
    return null;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Unsupported method\n", {
      headers: { allow: "GET, HEAD" },
      status: 405,
    });
  }

  const response = seedGet(loaded, url);

  if (response === null || request.method === "GET") {
    return response;
  }

  return new Response(null, {
    headers: response.headers,
    status: response.status,
  });
};

/**
 * @param {import("node:http").Server} server
 * @returns {number}
 */
const listeningPort = (server) => {
  const address = server.address();

  if (
    address === null ||
    !("port" in address) ||
    !Number.isInteger(address.port)
  ) {
    throw new Error(
      "The verify seed did not bind a local port. Fix: pass --port with an integer port."
    );
  }

  return address.port;
};

/**
 * @param {number} port
 * @param {VerifySeed} seed
 * @returns {Promise<void>}
 */
const proveSeed = async (port, seed) => {
  const origin = `http://127.0.0.1:${port}`;
  const articles = await fetch(new URL(ARTICLES_PATH, origin));

  const rows = Schema.decodeUnknownSync(
    Schema.fromJsonString(Schema.Array(Schema.Struct({ id: Schema.String })))
  )(await articles.text());

  const count = rows.length;

  if (articles.status !== 200 || count !== RECORDED_ARTICLE_COUNT) {
    throw new Error(
      `The verify seed /api/articles returned status ${articles.status} and ${count} rows. It needs 200 and ${RECORDED_ARTICLE_COUNT} rows. Fix: serve verify/seed.mjs before the driver.`
    );
  }

  logLine(`seed: /api/articles returned ${count} articles`);

  const [opening] = seed.chat.messages;
  const pageUrl = new URL(PAST_CHAT_PATH, origin);

  pageUrl.searchParams.set("conversation", seed.chat.conversation.id);

  const page = await fetch(pageUrl);
  const html = await page.text();

  const opened =
    opening !== undefined &&
    page.status === 200 &&
    html.includes(seed.chat.conversation.id) &&
    html.includes(opening.content);

  if (!opened) {
    throw new Error(
      `The verify seed did not open past chat ${seed.chat.conversation.id}. Fix: GET ${pageUrl.pathname}${pageUrl.search} on the seed.`
    );
  }

  logLine(`seed: opened past chat ${seed.chat.conversation.id}`);
};

/**
 * @param {import("node:http").IncomingMessage} request
 * @param {string} upstream
 * @param {number} port
 * @returns {Promise<Response>}
 */
const forward = async (request, upstream, port) => {
  const incoming = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  const allowed = new URL(upstream);

  if (allowed.protocol !== "http:" && allowed.protocol !== "https:") {
    throw new Error(
      `The verify seed upstream uses the ${allowed.protocol} scheme. A forwarded path must stay on http or https. Fix: pass \`--upstream\` as an http or https URL.`
    );
  }

  const target = new URL(allowed.origin);

  target.pathname = incoming.pathname;
  target.search = incoming.search;

  if (target.origin !== allowed.origin) {
    throw new Error(
      `The verify seed refused to forward ${incoming.pathname}. That path changed the upstream host. Fix: keep the forward URL on \`${allowed.origin}\`.`
    );
  }

  const headers = new Headers();

  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined || name === "host") {
      continue;
    }

    headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }

  return await fetch(target, {
    headers,
    method: request.method,
    redirect: "manual",
  });
};

/**
 * @param {Response} response
 * @param {import("node:http").ServerResponse} result
 * @returns {Promise<void>}
 */
const send = async (response, result) => {
  const payload = Buffer.from(await response.arrayBuffer());

  /** @type {Record<string, string | string[]>} */
  const headers = {};

  for (const [name, value] of response.headers) {
    if (name !== "transfer-encoding") {
      headers[name] = value;
    }
  }

  result.writeHead(response.status, headers);
  result.end(payload);
};

/**
 * @param {import("node:http").IncomingMessage} request
 * @param {import("node:http").ServerResponse} result
 * @param {VerifySeed} seed
 * @param {string} upstream
 * @param {number} port
 * @returns {Promise<void>}
 */
const answerSeed = async (request, result, seed, upstream, port) => {
  try {
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
    const incoming = new Request(url, { method: request.method });
    const seeded = await seedResponse(incoming, seed);

    if (seeded !== null) {
      await send(seeded, result);

      return;
    }

    if (upstream.length > 0) {
      await send(await forward(request, upstream, port), result);

      return;
    }

    result.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    result.end("not seeded\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    process.stderr.write(
      `seed failed ${request.method} ${request.url}: ${message}\n`
    );

    if (!result.headersSent) {
      result.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    }

    result.end();
  }
};

/**
 * @param {{ port: number; upstream?: string }} options
 * @returns {Promise<{ port: number; server: import("node:http").Server }>}
 */
export const startSeedServer = async ({ port, upstream = "" }) => {
  const seed = await loadVerifySeed();

  /** @type {import("node:http").Server} */
  const server = createServer((request, result) => {
    void answerSeed(request, result, seed, upstream, port);
  });

  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  const actual = listeningPort(server);

  try {
    await proveSeed(actual, seed);
  } catch (error) {
    server.close();
    throw error;
  }

  logLine(`seed listening http://127.0.0.1:${actual}`);

  return { port: actual, server };
};

/**
 * @param {string} dist
 * @returns {Promise<{ already: boolean; entry: string }>}
 */
export const wrapBuiltWorker = async (dist) => {
  const manifestPath = path.join(dist, "server", "foldkit.build.json");

  let entryName;

  try {
    entryName = decodeManifest(
      await readFile(manifestPath, "utf-8")
    ).serverEntry;
  } catch (error) {
    throw new Error(
      `foldkit.build.json in ${dist} has no single serverEntry file. The verify seed wraps that file so the Worker serves the recorded articles. Fix: build apps/web before verify/seed.mjs --wrap.`,
      { cause: error }
    );
  }

  const entryPath = path.join(dist, "server", entryName);
  const source = await readFile(entryPath, "utf-8");

  if (source.startsWith(WRAP_MARKER)) {
    return { already: true, entry: entryName };
  }

  const extension = path.extname(entryName);
  const unseededName = `${path.basename(entryName, extension)}.unseeded${extension}`;

  await rename(entryPath, path.join(dist, "server", unseededName));

  const wrapper = `${WRAP_MARKER}
import { seedResponse } from ${JSON.stringify(seedModuleHref)};

const loaded = await import(new URL(${JSON.stringify(`./${unseededName}`)}, import.meta.url).href);
const handler = loaded.default?.fetch;

if (typeof handler !== "function") {
  throw new Error("The wrapped Worker has no default.fetch. Fix: build the Foldkit server entry before wrapping it.");
}

export default {
  fetch: async (request) => {
    const seeded = await seedResponse(request);
    if (seeded !== null) {
      return seeded;
    }
    return handler(request);
  },
};
`;

  await writeFile(entryPath, wrapper);

  return { already: false, entry: entryName };
};

/**
 * @param {string} reportPath
 * @returns {Promise<void>}
 */
export const expectOpenedPastChat = async (reportPath) => {
  const seed = await loadVerifySeed();
  const report = decodePageReport(await readFile(reportPath, "utf-8"));
  const [opening] = seed.chat.messages;

  if (opening === undefined) {
    throw new Error(
      "The sample chat has no opening message. Fix: keep at least two messages in verify/seed-chat.json."
    );
  }

  const group = report.headReport.find((entry) =>
    entry.path.includes(seed.chat.conversation.id)
  );

  if (group === undefined || group.pages.length === 0) {
    throw new Error(
      `The driver report ${reportPath} has no page for past chat ${seed.chat.conversation.id}. Fix: run verify/driver.mjs page against the seed /widget/chat?conversation=${seed.chat.conversation.id}.`
    );
  }

  const opened = await Promise.all(
    group.pages.map(async (page) => {
      const text = await readFile(page.textFile, "utf-8");

      return (
        page.status === 200 &&
        text.includes(seed.chat.conversation.id) &&
        text.includes(opening.content)
      );
    })
  );

  if (opened.some((page) => !page)) {
    throw new Error(
      `The driver did not open past chat ${seed.chat.conversation.id} at status 200 with its seeded message. Fix: serve the seed and rerun verify/driver.mjs page.`
    );
  }

  logLine(`seed: driver opened past chat ${seed.chat.conversation.id}`);
};

/**
 * @param {string} name
 * @param {readonly string[]} args
 * @returns {string}
 */
const flag = (name, args) => {
  const at = args.indexOf(`--${name}`);

  return at === -1 ? "" : (args[at + 1] ?? "");
};

const USAGE =
  "node verify/seed.mjs --port <n> [--upstream <url>] [--wrap <dist>] [--expect-page <driver-report.json>]";

const args = process.argv.slice(2);

const portFlag = flag("port", args);

const wrapFlag = flag("wrap", args);

const upstreamFlag = flag("upstream", args);

const expectFlag = flag("expect-page", args);

const invoked =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === import.meta.filename;

if (invoked) {
  if (wrapFlag === "" && portFlag === "" && expectFlag === "") {
    process.stderr.write(`${USAGE}\n`);
    process.exit(1);
  }

  if (wrapFlag !== "") {
    const wrapped = await wrapBuiltWorker(wrapFlag);

    logLine(`seed: wrapped ${wrapped.entry} in ${wrapFlag}`);
  }

  if (expectFlag !== "") {
    await expectOpenedPastChat(expectFlag);
  }

  if (portFlag !== "") {
    const port = Number(portFlag);

    if (!Number.isInteger(port) || port < 0) {
      process.stderr.write(`${USAGE}\n`);
      process.exit(1);
    }

    await startSeedServer({
      port,
      upstream: upstreamFlag,
    });
  }
}
