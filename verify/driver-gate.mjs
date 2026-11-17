import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const HELP_PATH = "/help";

const ARTICLE_PATHS = [
  "/health",
  "/api/articles",
  "/api/help-reader/pricing-plans",
];

export const driverReportFiles = {
  api: "report-api.json",
  compare: "report-compare.json",
  page: "report-page.json",
  widget: "report-widget.json",
};

/** @typedef {{ consoleErrors?: string[]; error?: string; pageErrors?: string[]; path?: string; status?: number; url?: string; viewport?: string }} PageHit */
/** @typedef {{ head?: string; headReport?: { pages?: PageHit[]; path?: string }[] }} PageReport */
/** @typedef {{ head?: string; report?: { headStatus?: number; path?: string }[] }} CompareReport */
/** @typedef {{ head?: string; onHead?: PageHit[] }} WidgetReport */
/** @typedef {{ head?: string; headProbes?: { error?: string; status?: number; url?: string }[] }} ApiReport */
/** @typedef {{ api?: ApiReport; compare?: CompareReport; page?: PageReport; widget?: WidgetReport }} DriverReports */
/** @typedef {{ lines: string[]; ok: boolean; reasons: string[] }} DriverVerdict */

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

/** @param {unknown} error
 * @returns {boolean} */
const isMissingFile = (error) =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

/** @param {string} value
 * @returns {string} */
const originOf = (value) => new URL(value).origin;

/** @param {number | undefined} status
 * @returns {boolean} */
const acceptableStatus = (status) =>
  Number.isInteger(status) && status >= 200 && status <= 399;

/** @param {string[]} reasons
 * @param {string} routePath
 * @param {PageHit} hit */
const judgeHit = (reasons, routePath, hit) => {
  if (hit.error !== undefined) {
    reasons.push(`the Worker did not answer ${routePath}: ${hit.error}`);
  }

  if (!acceptableStatus(hit.status)) {
    reasons.push(`bad status ${hit.status ?? "missing"} for ${routePath}`);
  }

  for (const message of hit.consoleErrors ?? []) {
    reasons.push(`console error on ${routePath}: ${message}`);
  }

  for (const message of hit.pageErrors ?? []) {
    reasons.push(`page error on ${routePath}: ${message}`);
  }
};

/** @param {string[]} reasons
 * @param {string | undefined} value
 * @param {string} workerOrigin
 * @param {string} command
 * @returns {boolean} */
const openedWorker = (reasons, value, workerOrigin, command) => {
  let opened = false;

  try {
    opened = value !== undefined && originOf(value) === workerOrigin;
  } catch {
    opened = false;
  }

  if (!opened) {
    reasons.push(
      `the driver did not open the Worker at ${workerOrigin} for ${command}`
    );
  }

  return opened;
};

/** @param {string | undefined} value
 * @param {string} workerOrigin
 * @returns {boolean} */
const sameOrigin = (value, workerOrigin) => {
  if (value === undefined) {
    return true;
  }

  try {
    return originOf(value) === workerOrigin;
  } catch {
    return false;
  }
};

/** @param {PageReport | undefined} report
 * @param {string} workerOrigin
 * @param {string[]} lines
 * @param {string[]} reasons */
const judgePage = (report, workerOrigin, lines, reasons) => {
  if (report === undefined) {
    reasons.push(
      `the driver did not run: ${driverReportFiles.page} is missing`
    );

    return;
  }

  if (!openedWorker(reasons, report.head, workerOrigin, "page")) {
    return;
  }

  const match = report.headReport?.find((entry) => entry.path === HELP_PATH);

  if (match === undefined || (match.pages ?? []).length === 0) {
    reasons.push(`the driver did not run page for ${HELP_PATH}`);

    return;
  }

  for (const hit of match.pages ?? []) {
    lines.push(
      `worker answered ${HELP_PATH} status=${hit.status ?? "missing"} viewport=${hit.viewport ?? ""}`
    );
    judgeHit(reasons, HELP_PATH, hit);

    if (!sameOrigin(hit.url, workerOrigin)) {
      reasons.push(
        `the driver did not open the Worker at ${workerOrigin} for page ${HELP_PATH}`
      );
    }
  }
};

/** @param {CompareReport | undefined} report
 * @param {string} workerOrigin
 * @param {string[]} lines
 * @param {string[]} reasons */
const judgeCompare = (report, workerOrigin, lines, reasons) => {
  if (report === undefined) {
    reasons.push(
      `the driver did not run: ${driverReportFiles.compare} is missing`
    );

    return;
  }

  if (!openedWorker(reasons, report.head, workerOrigin, "compare")) {
    return;
  }

  const match = report.report?.find((entry) => entry.path === HELP_PATH);

  if (match === undefined) {
    reasons.push(`the driver did not run compare for ${HELP_PATH}`);

    return;
  }

  lines.push(
    `worker answered ${HELP_PATH} status=${match.headStatus ?? "missing"} command=compare`
  );

  /** @type {PageHit} */
  const hit = {};

  if (Number.isInteger(match.headStatus)) {
    hit.status = match.headStatus;
  }

  judgeHit(reasons, HELP_PATH, hit);
};

/** @param {WidgetReport | undefined} report
 * @param {string} workerOrigin
 * @param {string[]} lines
 * @param {string[]} reasons */
const judgeWidget = (report, workerOrigin, lines, reasons) => {
  if (report === undefined) {
    reasons.push(
      `the driver did not run: ${driverReportFiles.widget} is missing`
    );

    return;
  }

  if (!openedWorker(reasons, report.head, workerOrigin, "widget")) {
    return;
  }

  const match = report.onHead?.find((entry) => entry.path === HELP_PATH);

  if (match === undefined) {
    reasons.push(`the driver did not run widget for ${HELP_PATH}`);

    return;
  }

  lines.push(
    `worker answered ${HELP_PATH} status=${match.status ?? "missing"} command=widget`
  );
  judgeHit(reasons, HELP_PATH, match);
};

/** @param {ApiReport | undefined} report
 * @param {string} workerOrigin
 * @param {string[]} lines
 * @param {string[]} reasons */
const judgeApi = (report, workerOrigin, lines, reasons) => {
  if (report === undefined) {
    reasons.push(`the driver did not run: ${driverReportFiles.api} is missing`);

    return;
  }

  if (!openedWorker(reasons, report.head, workerOrigin, "api")) {
    return;
  }

  for (const routePath of ARTICLE_PATHS) {
    const match = report.headProbes?.find((probe) => {
      if (probe.url === undefined) {
        return false;
      }

      try {
        return new URL(probe.url).pathname === routePath;
      } catch {
        return false;
      }
    });

    if (match === undefined) {
      reasons.push(`the driver did not run api for ${routePath}`);
      continue;
    }

    lines.push(
      `worker answered ${routePath} status=${match.status ?? "missing"}`
    );
    judgeHit(reasons, routePath, match);

    if (!sameOrigin(match.url, workerOrigin)) {
      reasons.push(
        `the driver did not open the Worker at ${workerOrigin} for api ${routePath}`
      );
    }
  }
};

/** @param {DriverReports} reports
 * @param {string} worker
 * @returns {DriverVerdict} */
export const judgeDriverRun = (reports, worker) => {
  /** @type {string[]} */
  const lines = [];
  /** @type {string[]} */
  const reasons = [];
  const workerOrigin = originOf(worker);

  judgePage(reports.page, workerOrigin, lines, reasons);
  judgeCompare(reports.compare, workerOrigin, lines, reasons);
  judgeWidget(reports.widget, workerOrigin, lines, reasons);
  judgeApi(reports.api, workerOrigin, lines, reasons);

  return { lines, ok: reasons.length === 0, reasons };
};

/** @param {string} screens
 * @param {string} command
 * @param {string} fileName
 * @returns {Promise<[string, unknown]>} */
const readReport = async (screens, command, fileName) => {
  try {
    return [
      command,
      parseJson(await readFile(path.join(screens, fileName), "utf-8")),
    ];
  } catch (error) {
    if (isMissingFile(error)) {
      return [command, undefined];
    }

    throw error;
  }
};

/** @param {unknown} value
 * @returns {ApiReport | undefined} */
const asApi = (value) => {
  if (value === undefined || !(value instanceof Object)) {
    return;
  }

  // SAFETY: report-api.json is the api command's own JSON, checked by pathname below.
  /** @type {ApiReport} */
  const report = value;

  // oxlint-disable-next-line typescript/consistent-return -- a bare return means there is no report
  return report;
};

/** @param {unknown} value
 * @returns {CompareReport | undefined} */
const asCompare = (value) => {
  if (value === undefined || !(value instanceof Object)) {
    return;
  }

  // SAFETY: report-compare.json is the compare command's own JSON.
  /** @type {CompareReport} */
  const report = value;

  // oxlint-disable-next-line typescript/consistent-return -- a bare return means there is no report
  return report;
};

/** @param {unknown} value
 * @returns {PageReport | undefined} */
const asPage = (value) => {
  if (value === undefined || !(value instanceof Object)) {
    return;
  }

  // SAFETY: report-page.json is the page command's own JSON.
  /** @type {PageReport} */
  const report = value;

  // oxlint-disable-next-line typescript/consistent-return -- a bare return means there is no report
  return report;
};

/** @param {unknown} value
 * @returns {WidgetReport | undefined} */
const asWidget = (value) => {
  if (value === undefined || !(value instanceof Object)) {
    return;
  }

  // SAFETY: report-widget.json is the widget command's own JSON.
  /** @type {WidgetReport} */
  const report = value;

  // oxlint-disable-next-line typescript/consistent-return -- a bare return means there is no report
  return report;
};

/** @param {string} screens
 * @returns {Promise<DriverReports>} */
const readReports = async (screens) => {
  const loaded = await Promise.all(
    Object.entries(driverReportFiles).map(
      async ([command, fileName]) =>
        await readReport(screens, command, fileName)
    )
  );

  /** @type {DriverReports} */
  const reports = {};

  for (const [command, value] of loaded) {
    if (command === "api") {
      const api = asApi(value);

      if (api !== undefined) {
        reports.api = api;
      }
    } else if (command === "compare") {
      const compare = asCompare(value);

      if (compare !== undefined) {
        reports.compare = compare;
      }
    } else if (command === "page") {
      const page = asPage(value);

      if (page !== undefined) {
        reports.page = page;
      }
    } else {
      const widget = asWidget(value);

      if (widget !== undefined) {
        reports.widget = widget;
      }
    }
  }

  return reports;
};

const isEntry =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntry) {
  const screens = flag("screens");
  const worker = flag("worker");

  if (screens === "" || worker === "") {
    process.stderr.write(
      "node verify/driver-gate.mjs --screens <dir> --worker <url>\n"
    );
    process.exitCode = 1;
  } else {
    const verdict = judgeDriverRun(await readReports(screens), worker);

    for (const line of verdict.lines) {
      process.stdout.write(`${line}\n`);
    }

    for (const reason of verdict.reasons) {
      process.stderr.write(`${reason}\n`);
    }

    if (!verdict.ok) {
      process.exitCode = 1;
    }
  }
}
