import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const worker = "http://127.0.0.1:4175";

const gate = path.join(import.meta.dirname, "driver-gate.mjs");

/** @param {string} screens
 * @returns {import("node:child_process").SpawnSyncReturns<string>} */
const runGate = (screens) =>
  spawnSync(
    process.execPath,
    [gate, "--screens", screens, "--worker", worker],
    {
      encoding: "utf-8",
    }
  );

/** @param {string} screens
 * @param {Record<string, unknown>} reports */
const writeReports = (screens, reports) => {
  mkdirSync(screens, { recursive: true });

  for (const [name, report] of Object.entries(reports)) {
    writeFileSync(
      path.join(screens, name),
      `${JSON.stringify(report, undefined, 2)}\n`
    );
  }
};

/** @param {number} status
 * @param {string[]} [consoleErrors]
 * @param {string} [head]
 * @returns {Record<string, { head: string; headProbes?: { status: number; url: string }[]; headReport?: { pages: { consoleErrors: string[]; pageErrors: string[]; status: number; url: string; viewport: string }[]; path: string }[]; onHead?: { consoleErrors: string[]; pageErrors: string[]; path: string; status: number }[]; report?: { headStatus: number; path: string }[] }>} */
const passingReports = (status, consoleErrors = [], head = worker) => ({
  "report-api.json": {
    head,
    headProbes: [
      "/health",
      "/api/articles",
      "/api/help-reader/pricing-plans",
    ].map((routePath) => ({
      status,
      url: `${head}${routePath}`,
    })),
  },
  "report-compare.json": {
    head,
    report: [{ headStatus: status, path: "/help" }],
  },
  "report-page.json": {
    head,
    headReport: [
      {
        pages: ["1440", "390"].map((viewport) => ({
          consoleErrors,
          pageErrors: [],
          status,
          url: `${head}/help`,
          viewport,
        })),
        path: "/help",
      },
    ],
  },
  "report-widget.json": {
    head,
    onHead: [
      {
        consoleErrors,
        pageErrors: [],
        path: "/help",
        status,
      },
    ],
  },
});

await test("a verifier run fails when the driver did not run", () => {
  const screens = mkdtempSync(path.join(tmpdir(), "driver-gate-missing-"));

  try {
    const result = runGate(screens);

    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /the driver did not run: report-page\.json is missing/u
    );
    assert.match(
      result.stderr,
      /the driver did not run: report-compare\.json is missing/u
    );
    assert.match(
      result.stderr,
      /the driver did not run: report-widget\.json is missing/u
    );
    assert.match(
      result.stderr,
      /the driver did not run: report-api\.json is missing/u
    );
  } finally {
    rmSync(screens, { force: true, recursive: true });
  }
});

await test("the driver passes when the Worker answers the help routes", () => {
  const screens = mkdtempSync(path.join(tmpdir(), "driver-gate-pass-"));

  try {
    writeReports(screens, passingReports(200));

    const result = runGate(screens);

    assert.equal(result.status, 0, result.stderr);
    assert.match(
      result.stdout,
      /worker answered \/help status=200 viewport=1440/u
    );
    assert.match(
      result.stdout,
      /worker answered \/help status=200 viewport=390/u
    );
    assert.match(result.stdout, /worker answered \/health status=200/u);
    assert.match(result.stdout, /worker answered \/api\/articles status=200/u);
    assert.match(
      result.stdout,
      /worker answered \/api\/help-reader\/pricing-plans status=200/u
    );
  } finally {
    rmSync(screens, { force: true, recursive: true });
  }
});

await test("a bad status fails after the log shows the Worker answered", () => {
  const screens = mkdtempSync(path.join(tmpdir(), "driver-gate-status-"));

  try {
    writeReports(screens, passingReports(404));

    const result = runGate(screens);

    assert.equal(result.status, 1);
    assert.match(
      result.stdout,
      /worker answered \/help status=404 viewport=1440/u
    );
    assert.match(result.stdout, /worker answered \/health status=404/u);
    assert.match(result.stdout, /worker answered \/api\/articles status=404/u);
    assert.match(result.stderr, /bad status 404 for \/help/u);
    assert.match(result.stderr, /bad status 404 for \/health/u);
  } finally {
    rmSync(screens, { force: true, recursive: true });
  }
});

await test("a console error fails the driver run", () => {
  const screens = mkdtempSync(path.join(tmpdir(), "driver-gate-console-"));

  try {
    writeReports(screens, passingReports(200, ["widget exploded"]));

    const result = runGate(screens);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /console error on \/help: widget exploded/u);
  } finally {
    rmSync(screens, { force: true, recursive: true });
  }
});

await test("reports from the static file server do not count as the Worker", () => {
  const screens = mkdtempSync(path.join(tmpdir(), "driver-gate-static-"));

  try {
    writeReports(screens, passingReports(200, [], "http://127.0.0.1:4173"));

    const result = runGate(screens);

    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /the driver did not open the Worker at http:\/\/127\.0\.0\.1:4175 for page/u
    );
  } finally {
    rmSync(screens, { force: true, recursive: true });
  }
});
