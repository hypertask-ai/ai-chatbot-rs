import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** @param {unknown} value
 * @returns {string} */
const functionTag = (value) => Object.prototype.toString.call(value);

/** @param {unknown} value
 * @returns {unknown} */
const moduleDefault = (value) => {
  const tag = functionTag(value);

  if (
    (tag !== "[object Module]" && tag !== "[object Object]") ||
    !("default" in value)
  ) {
    return;
  }

  // oxlint-disable-next-line typescript/consistent-return -- a bare return means the module has no default
  return value.default;
};

/** @typedef {(request: Request) => Promise<Response>} WorkerFetch */

/** @param {unknown} value
 * @returns {WorkerFetch | undefined} */
const workerFetch = (value) => {
  if (functionTag(value) !== "[object Object]" || !("fetch" in value)) {
    return;
  }

  const handler = value.fetch;
  const tag = functionTag(handler);

  if (tag !== "[object Function]" && tag !== "[object AsyncFunction]") {
    return;
  }

  // SAFETY: foldkit.build.json names the built server entry, and its default.fetch is the Worker fetch handler.
  /** @type {WorkerFetch} */
  const fetchHandler = handler;

  // oxlint-disable-next-line typescript/consistent-return -- a bare return means this export is not a fetch handler
  return fetchHandler;
};

const args = process.argv.slice(2);

/** @param {string} name
 * @returns {string} */
const flag = (name) => {
  const at = args.indexOf(`--${name}`);

  return at === -1 ? "" : (args[at + 1] ?? "");
};

/** @param {string} text
 * @returns {unknown} */
const parseJson = (text) => JSON.parse(text);

/** @param {unknown} value
 * @returns {string | undefined} */
const fileName = (value) => {
  if (functionTag(value) !== "[object String]") {
    return;
  }

  const name = String(value);

  if (name.length === 0 || name.includes("/") || name.includes("\\")) {
    return;
  }

  // oxlint-disable-next-line typescript/consistent-return -- a bare return means the manifest entry is not one file name
  return name;
};

const distFlag = flag("dist");

const portFlag = flag("port");

const port = Number(portFlag);

if (distFlag === "" || portFlag === "" || !Number.isInteger(port) || port < 0) {
  process.stderr.write(
    "node verify/serve-worker.mjs --dist <apps/web/dist> --port <n>\n"
  );
  process.exit(1);
}

const dist = path.resolve(distFlag);

const manifest = parseJson(
  await readFile(path.join(dist, "server", "foldkit.build.json"), "utf-8")
);

const entryName =
  manifest instanceof Object && "serverEntry" in manifest
    ? fileName(manifest.serverEntry)
    : undefined;

if (entryName === undefined) {
  process.stderr.write(
    `foldkit.build.json serverEntry must name one file in ${path.join(dist, "server")}\n`
  );
  process.exit(1);
}

const entryPath = path.join(dist, "server", entryName);

/** @type {unknown} */
const loaded = await import(pathToFileURL(entryPath).href);

const fetchHandler = workerFetch(moduleDefault(loaded));

if (fetchHandler === undefined) {
  process.stderr.write(`${entryPath} does not export default.fetch\n`);
  process.exit(1);
}

/** @param {import("node:http").IncomingMessage} request
 * @param {import("node:http").ServerResponse} response
 * @returns {Promise<void>} */
const answer = async (request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  const headers = new Headers();

  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined) {
      continue;
    }

    headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }

  const answered = await fetchHandler(
    new Request(url, { headers, method: request.method ?? "GET" })
  );

  const payload = Buffer.from(await answered.arrayBuffer());

  /** @type {Record<string, string>} */
  const outgoing = {};

  for (const [name, value] of answered.headers) {
    if (name !== "transfer-encoding") {
      outgoing[name] = value;
    }
  }

  process.stdout.write(
    `worker answered ${request.method} ${url.pathname} status=${answered.status}\n`
  );
  response.writeHead(answered.status, outgoing);

  if (request.method === "HEAD") {
    response.end();

    return;
  }

  response.end(payload);
};

/** @param {import("node:http").IncomingMessage} request
 * @param {import("node:http").ServerResponse} response
 * @returns {Promise<void>} */
const respond = async (request, response) => {
  try {
    await answer(request, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    process.stderr.write(
      `worker failed ${request.method} ${request.url ?? "/"}: ${message}\n`
    );

    if (!response.headersSent) {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    }

    response.end();
  }
};

const server = createServer((request, response) => {
  void respond(request, response);
});

server.on("error", (error) => {
  const message = error instanceof Error ? error.message : String(error);

  process.stderr.write(`worker listen failed: ${message}\n`);
  process.exit(1);
});

server.listen(port, "127.0.0.1", () => {
  const address = server.address();

  const actual =
    address instanceof Object &&
    "port" in address &&
    Number.isInteger(address.port)
      ? address.port
      : port;

  process.stdout.write(`worker listening http://127.0.0.1:${actual}\n`);
});
