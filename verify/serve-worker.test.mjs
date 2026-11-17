import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const script = path.join(import.meta.dirname, "serve-worker.mjs");

const entry = `export default {
  fetch(request) {
    const { pathname } = new URL(request.url);

    if (pathname === "/health") {
      return Response.json({ status: "ok", service: "ai-chatbot" });
    }

    if (pathname === "/api/articles") {
      return Response.json([{ slug: "pricing-plans" }]);
    }

    if (pathname === "/api/help-reader/pricing-plans") {
      return Response.json({ title: "plans" });
    }

    if (pathname === "/help") {
      return new Response("<h1>Help</h1>", {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    return new Response("Not found", { status: 404 });
  },
};
`;

await test(
  "the local Worker answers /help, /health and the article routes",
  { timeout: 20_000 },
  async () => {
    const dist = mkdtempSync(path.join(tmpdir(), "serve-worker-"));

    mkdirSync(path.join(dist, "server"));
    writeFileSync(
      path.join(dist, "server", "foldkit.build.json"),
      `${JSON.stringify({ serverEntry: "fetch.js" })}\n`
    );
    writeFileSync(path.join(dist, "server", "fetch.js"), entry);

    const child = spawn(
      process.execPath,
      [script, "--dist", dist, "--port", "0"],
      {
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    let output = "";
    let errors = "";

    child.stdout?.setEncoding("utf-8");
    child.stderr?.setEncoding("utf-8");
    child.stdout?.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      errors += chunk;
    });

    /** @returns {Promise<string>} */
    const waitForPort = async () => {
      const match = /worker listening http:\/\/127\.0\.0\.1:(?<port>\d+)/u.exec(
        output
      );

      if (match?.groups?.port !== undefined) {
        return match.groups.port;
      }

      if (child.exitCode !== null) {
        throw new Error(
          `worker exited ${child.exitCode}\n${output}\n${errors}`
        );
      }

      await Promise.race([
        once(child.stdout ?? child, "data"),
        once(child, "exit"),
      ]);

      return await waitForPort();
    };

    try {
      const listening = await waitForPort();

      const routes = [
        "/help",
        "/health",
        "/api/articles",
        "/api/help-reader/pricing-plans",
      ];

      await Promise.all(
        routes.map(async (routePath) => {
          const response = await fetch(
            `http://127.0.0.1:${listening}${routePath}`
          );

          assert.equal(response.status, 200, routePath);
          await response.arrayBuffer();
        })
      );

      assert.match(output, /worker answered GET \/help status=200/u);
      assert.match(output, /worker answered GET \/health status=200/u);
      assert.match(output, /worker answered GET \/api\/articles status=200/u);
      assert.match(
        output,
        /worker answered GET \/api\/help-reader\/pricing-plans status=200/u
      );
    } finally {
      child.kill();
      rmSync(dist, { force: true, recursive: true });
    }
  }
);
