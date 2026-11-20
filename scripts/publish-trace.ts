// @effect-diagnostics nodeBuiltinImport:off -- This Node CLI serves the built site and writes a Playwright trace.
import { once } from "node:events";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import type { Server } from "node:http";
import path from "node:path";

import { Schema } from "effect";
import { chromium } from "playwright";

import { siteBasePath, stripBasePath } from "../apps/web/src/site-base-path.ts";
import {
  readFeatureMapPaths,
  traceBaseName,
  traceCommit,
  traceMapPath,
  traceOutDir,
} from "./publish-trace-paths.ts";

const missingBuild =
  "Built site is missing. This publish stops before deploy because there is no client bundle to trace. Fix: run `pnpm turbo run build` before `node scripts/publish-trace.ts`.";

const missingCommit =
  "Release commit is unset. This publish stops before deploy because the trace has no commit to name. Fix: set `TRACE_COMMIT` to the commit being published.";

const traceFailed =
  "Browser trace failed. This publish stops before deploy because Playwright did not write a trace for this commit. Fix: run `pnpm exec playwright install chromium` and then `node scripts/publish-trace.ts`.";

const contentType = (file: string): string => {
  switch (path.extname(file)) {
    case ".css": {
      return "text/css; charset=utf-8";
    }

    case ".html": {
      return "text/html; charset=utf-8";
    }

    case ".js": {
      return "text/javascript; charset=utf-8";
    }

    case ".json": {
      return "application/json; charset=utf-8";
    }

    case ".png": {
      return "image/png";
    }

    case ".svg": {
      return "image/svg+xml";
    }

    case ".woff2": {
      return "font/woff2";
    }

    default: {
      return "application/octet-stream";
    }
  }
};

const decodePort = Schema.decodeUnknownSync(
  Schema.Struct({ port: Schema.Int })
);

const pageTimeout = 15_000;

const stop = (message: string): number => {
  process.stderr.write(`${message}\n`);

  return 1;
};

const sitePath = (pathname: string): string =>
  stripBasePath(pathname, siteBasePath) ?? pathname;

const statOrUndefined = (
  file: string
): ReturnType<typeof statSync> | undefined => {
  try {
    return statSync(file);
  } catch {
    return undefined;
  }
};

const fileFor = (root: string, pathname: string): string | undefined => {
  const relative = sitePath(pathname).replace(/^\/+/u, "");
  const target = path.resolve(root, relative);
  const rootResolved = path.resolve(root);

  if (
    target !== rootResolved &&
    !target.startsWith(`${rootResolved}${path.sep}`)
  ) {
    return undefined;
  }

  const candidate = statOrUndefined(target);

  if (candidate?.isFile() === true) {
    return target;
  }

  if (candidate?.isDirectory() !== true && relative.length > 0) {
    return undefined;
  }

  const index = path.join(
    candidate?.isDirectory() === true ? target : rootResolved,
    "index.html"
  );

  return statOrUndefined(index)?.isFile() === true ? index : undefined;
};

// @effect-diagnostics-next-line asyncFunction:off -- node:events once() is a Promise, and this Node CLI runs outside an Effect runtime.
const listen = async (server: Server): Promise<string> => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const { port } = decodePort(server.address());

    return `http://127.0.0.1:${String(port)}`;
  } catch {
    throw new Error("The trace server has no port.");
  }
};

// @effect-diagnostics-next-line asyncFunction:off -- Closing the local file server is Promise I/O, and this Node CLI runs outside an Effect runtime.
const closeServer = async (server: Server): Promise<void> => {
  server.closeAllConnections();
  server.close();
  await once(server, "close");
};

// @effect-diagnostics-next-line asyncFunction:off -- The local file server is Promise I/O, and this Node CLI runs outside an Effect runtime.
const serveDist = async (
  root: string
): Promise<{
  readonly close: () => Promise<void>;
  readonly origin: string;
}> => {
  const server = createServer((request, response) => {
    const { host } = request.headers;

    if (host === undefined || request.url === undefined) {
      response.writeHead(400);
      response.end();

      return;
    }

    let pathname: string;

    try {
      pathname = decodeURIComponent(
        new URL(request.url, `http://${host}`).pathname
      );
    } catch {
      response.writeHead(400);
      response.end();

      return;
    }

    const file = fileFor(root, pathname);

    if (file === undefined) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");

      return;
    }

    response.writeHead(200, {
      "content-type": contentType(file),
    });
    createReadStream(file).pipe(response);
  });

  const origin = await listen(server);

  return { close: () => closeServer(server), origin };
};

const visitUrl = (origin: string, visitPath: string): string =>
  new URL(visitPath, `${origin}/`).href;

// @effect-diagnostics-next-line asyncFunction:off -- Playwright tracing is Promise based, and this Node CLI drives it outside an Effect runtime.
const record = async (
  origin: string,
  paths: readonly string[],
  zipPath: string
): Promise<readonly { readonly path: string; readonly url: string }[]> => {
  const browser = await chromium.launch();

  try {
    const context = await browser.newContext();

    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      title: path.basename(zipPath),
    });

    const page = await context.newPage();

    await page.route(
      "**/*",
      // @effect-diagnostics-next-line asyncFunction:off -- Playwright route handlers return Promises outside an Effect runtime.
      async (route) => {
        const requestUrl = new URL(route.request().url());
        const { pathname } = requestUrl;
        const method = route.request().method();

        const chatPost =
          method === "POST" &&
          (pathname.startsWith("/api/chat/") ||
            pathname.startsWith(`${siteBasePath}/api/chat/`));

        if (requestUrl.origin !== origin || chatPost) {
          await route.abort();

          return;
        }

        await route.continue();
      }
    );

    const visits: { path: string; url: string }[] = [];

    for (const visitPath of paths) {
      const url = visitUrl(origin, visitPath);

      // oxlint-disable-next-line no-await-in-loop -- The trace is one page, so each feature-map path is visited in order.
      await page.goto(url, {
        timeout: pageTimeout,
        waitUntil: "domcontentloaded",
      });

      visits.push({ path: visitPath, url });
    }

    await context.tracing.stop({ path: zipPath });

    return visits;
  } finally {
    await browser.close();
  }
};

// @effect-diagnostics-next-line asyncFunction:off -- This Node CLI records the release trace with Playwright Promises outside an Effect runtime.
const main = async (): Promise<number> => {
  const commit = traceCommit();

  if (commit === undefined) {
    return stop(missingCommit);
  }

  const paths = readFeatureMapPaths(traceMapPath());

  if (paths.length === 0) {
    return stop(traceFailed);
  }

  const givenOrigin = process.env.TRACE_ORIGIN;

  const originFromEnv =
    givenOrigin === undefined || givenOrigin.length === 0
      ? undefined
      : givenOrigin;

  const dist = process.env.TRACE_DIST ?? "apps/web/dist/client";

  if (
    originFromEnv === undefined &&
    !existsSync(path.join(dist, "index.html"))
  ) {
    return stop(missingBuild);
  }

  const served =
    originFromEnv === undefined ? await serveDist(dist) : undefined;

  const origin = originFromEnv ?? served?.origin;

  if (origin === undefined) {
    await served?.close();

    return stop(traceFailed);
  }

  const directory = traceOutDir();

  mkdirSync(directory, { recursive: true });

  const base = traceBaseName(commit);
  const partial = path.join(directory, `${base}.partial.zip`);
  const zipPath = path.join(directory, `${base}.zip`);

  const manifestPath = path.join(directory, `${base}.json`);
  const manifestPartial = path.join(directory, `${base}.partial.json`);

  try {
    const visits = await record(origin, paths, partial);

    writeFileSync(manifestPartial, `${JSON.stringify({ commit, visits })}\n`);
    renameSync(partial, zipPath);
    renameSync(manifestPartial, manifestPath);
  } catch (error) {
    rmSync(partial, { force: true });
    rmSync(manifestPartial, { force: true });
    const reason = error instanceof Error ? error.message : "unknown error";

    process.stderr.write(`${traceFailed}\n${reason}\n`);

    return 1;
  } finally {
    await served?.close();
  }

  process.stdout.write(`Recorded ${zipPath}\n`);

  return 0;
};

const invokedDirectly = (): boolean => {
  const [, entry] = process.argv;

  return entry !== undefined && path.resolve(entry) === import.meta.filename;
};

if (invokedDirectly()) {
  process.exitCode = await main().catch(() => stop(traceFailed));
}
