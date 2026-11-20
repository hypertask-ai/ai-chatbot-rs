#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const SCREENS = process.env.SCREENS_DIR ?? "verify-screens";

const TIMEOUT = 45_000;

/** @typedef {{ text: () => string; type: () => string }} VerifierConsoleMessage */
/** @typedef {{ message: string }} VerifierPageError */
/** @typedef {{ errorText: string }} VerifierRequestFailure */
/** @typedef {{ failure: () => VerifierRequestFailure | null; method: () => string; url: () => string }} VerifierRequest */
/** @typedef {{ request: () => VerifierRequest }} VerifierRouteRequest */
/** @typedef {{ abort: () => Promise<void>; continue: () => Promise<void>; request: () => VerifierRequest }} VerifierRoute */
/** @typedef {{ status: () => number }} VerifierResponse */
/** @typedef {{ evaluate: <Result>(expression: string) => Promise<Result> }} VerifierFrame */
/** @typedef {{ contentFrame: () => Promise<VerifierFrame | null> }} VerifierElementHandle */
/** @typedef {{ click: (options?: { timeout?: number }) => Promise<void>; count: () => Promise<number>; elementHandle: () => Promise<VerifierElementHandle | null>; fill: (value: string, options?: { timeout?: number }) => Promise<void>; first: () => VerifierLocator; isVisible: () => Promise<boolean> }} VerifierLocator */
/** @typedef {{ close: () => Promise<void>; newPage: () => Promise<VerifierPage> }} VerifierContext */
/** @typedef {{ close: () => Promise<void>; newContext: (options: { deviceScaleFactor: number; viewport: { height: number; width: number } }) => Promise<VerifierContext> }} VerifierBrowser */
/** @typedef {{ chromium: { launch: () => Promise<VerifierBrowser> } }} VerifierChromium */
/** @typedef {{ evaluate: <Result>(expression: string) => Promise<Result>; goto: (url: string, options?: { timeout?: number; waitUntil?: string }) => Promise<VerifierResponse | null>; keyboard: { press: (key: string) => Promise<void> }; locator: (selector: string) => VerifierLocator; on: (event: string, handler: (value: never) => void) => void; route: (pattern: string, handler: (route: VerifierRoute) => Promise<void>) => Promise<void>; screenshot: (options: { fullPage: boolean; path: string }) => Promise<Uint8Array>; title: () => Promise<string>; url: () => string; waitForTimeout: (milliseconds: number) => Promise<void> }} VerifierPage */
/** @typedef {{ height: number; name: string; width: number }} Viewport */
/** @typedef {{ consoleErrors: string[]; failedRequests: string[]; pageErrors: string[] }} Watch */
/** @typedef {{ blocked: string[]; context: VerifierContext; page: VerifierPage; watched: Watch }} Session */
/** @typedef {{ blocked: string[]; watched: Watch }} Runtime */
/** @typedef {{ count: number; selector: string }} Match */
/** @typedef {{ level: string; text: string }} Heading */
/** @typedef {{ href: string; text: string }} PageLink */
/** @typedef {{ label: string; type: string }} PageButton */
/** @typedef {{ name: string; placeholder: string; tag: string }} PageInput */
/** @typedef {{ action: string; error?: string; key?: string; ok: boolean; target?: string }} PageAction */
/** @typedef {{ blockedChatSends: string[]; actions?: PageAction[]; consoleErrors: string[]; error?: string; failedRequests: string[]; finalUrl?: string; fonts?: string[]; headings?: Heading[]; label: string; links?: PageLink[]; pageErrors: string[]; screenshotFull?: string; screenshotViewport?: string; status?: number; textFile?: string; title?: string; url: string; viewport: string; words?: number }} PageReport */
/** @typedef {{ addedInHead: string[]; baseStatus: number; headStatus: number; missingFromHead: string[]; path: string }} CompareReport */
/** @typedef {{ buttons: PageButton[]; found: boolean; inputs: PageInput[]; textExcerpt?: string; words?: number }} FrameState */

const VIEWPORTS = [
  { height: 900, name: "1440", width: 1440 },
  { height: 844, name: "390", width: 390 },
];

const WIDGET_TARGETS = [
  "#help-chat-mount iframe",
  "#hypertask-help-bubble",
  "[data-hypertask-help]",
  "[data-help-open]",
  "button[aria-label*='chat' i]",
  "button[aria-label*='help' i]",
  "iframe[src*='widget']",
  "iframe[title*='chat' i]",
];

const HEADER_NAMES = [
  "access-control-allow-origin",
  "cache-control",
  "content-type",
  "content-security-policy",
  "x-frame-options",
];

const WHITESPACE = /\s+/gu;

const SLUG = /[^a-z0-9]+/giu;

const VISIBLE_TEXT = `(() => {
  const body = document.body;
  if (body === null) return "";
  return Array.from(body.querySelectorAll("*"))
    .flatMap((node) => {
      if (node.childElementCount > 0) return [];
      const style = window.getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") return [];
      return [node.textContent ?? ""];
    })
    .join("\\n");
})()`;

const HEADINGS = `Array.from(document.querySelectorAll("h1, h2, h3")).map((node) => ({
  level: node.tagName.toLowerCase(),
  text: (node.textContent ?? "").replace(/\\s+/gu, " ").trim(),
}))`;

const LINKS = `Array.from(document.querySelectorAll("a[href]")).map((node) => ({
  href: node.href,
  text: (node.textContent ?? "").replace(/\\s+/gu, " ").trim(),
}))`;

const FONTS = `(async () => {
  await document.fonts.ready;
  return Array.from(document.fonts).flatMap((face) =>
    face.status === "loaded" ? [face.family + " " + face.weight + " " + face.style] : [],
  );
})()`;

const BUTTONS = `Array.from(document.querySelectorAll("button, [role='button']")).map((node) => ({
  label: (node.textContent ?? "").replace(/\\s+/gu, " ").trim(),
  type: node.getAttribute("type") ?? "",
}))`;

const INPUTS = `Array.from(document.querySelectorAll("input, textarea")).map((node) => ({
  name: node.getAttribute("name") ?? "",
  placeholder: node.getAttribute("placeholder") ?? "",
  tag: node.tagName.toLowerCase(),
}))`;

const USAGE = `node verify/driver.mjs <command> [flags]

Commands:
  page     --head <url> [--base <url>] [--path /help ...]
  compare  --head <url> --base <url> [--path /help ...]
  widget   --head <url> [--base <url>] [--path /help ...]
  api      --head <url> [--base <url>] [--path /health ...]

Flags:
  SCREENS_DIR points at the screenshot and report directory.
  --click "<selector>" chooses a control after the page loads
  --fill "<selector>=<value>" types into a control after the page loads
  --press "<key>" sends a key after the page loads

Clicks run first, then fills, then presses. So
--click "a[href='#all']" --fill "#searchInput=agents" --press "Escape"
opens the article browser, searches, and clears the box.`;

const argv = process.argv.slice(2);

const [command, ...rest] = argv;

/** @param {string} name
 * @returns {string} */
const flag = (name) => {
  const at = rest.indexOf(`--${name}`);

  if (at === -1) {
    return "";
  }

  return rest[at + 1] ?? "";
};

/** @param {string} entry
 * @returns {{ selector: string, value: string }} */
const splitFill = (entry) => {
  const at = entry.indexOf("=");

  return at === -1
    ? { selector: entry, value: "" }
    : { selector: entry.slice(0, at), value: entry.slice(at + 1) };
};

/** @typedef {{ kind: "click", selector: string } | { kind: "fill", selector: string, value: string } | { kind: "press", key: string }} Action */

/** @param {string} name
 * @returns {string[]} */
const flagAll = (name) => {
  const indexes = rest
    .map((value, index) => (value === `--${name}` ? index : -1))
    .filter((index) => index >= 0);

  /** @type {string[]} */
  const found = [];

  for (const index of indexes) {
    found.push(rest[index + 1] ?? "");
  }

  return found;
};

/** @returns {string[]} */
const paths = () => {
  const given = flagAll("path").filter((value) => value.length > 0);

  return given.length > 0 ? given : ["/"];
};

/** @param {string} name
 * @returns {string} */
const origin = (name) => flag(name).replace(/\/+$/u, "");

/** @param {string} value
 * @returns {string} */
const slug = (value) => value.replaceAll(SLUG, "-");

/** @returns {Action[]} */
const actions = () => [
  ...flagAll("click")
    .filter((entry) => entry.length > 0)
    .map((entry) => ({ kind: "click", selector: entry })),
  ...flagAll("fill")
    .filter((entry) => entry.length > 0)
    .map((entry) => ({ kind: "fill", ...splitFill(entry) })),
  ...flagAll("press")
    .filter((entry) => entry.length > 0)
    .map((entry) => ({ key: entry, kind: "press" })),
];

/** @param {VerifierPage} page
 * @param {Action} action
 * @returns {Promise<PageAction>} */
const apply = async (page, action) => {
  if (action.kind === "press") {
    await page.keyboard.press(action.key);

    return { action: "press", key: action.key, ok: true };
  }

  if (action.kind === "click") {
    try {
      await page.locator(action.selector).first().click({ timeout: 5000 });

      return { action: "click", ok: true, target: action.selector };
    } catch (error) {
      return {
        action: "click",
        error: String(error).split("\n")[0] ?? "",
        ok: false,
        target: action.selector,
      };
    }
  }

  try {
    await page
      .locator(action.selector)
      .first()
      .fill(action.value, { timeout: 5000 });

    return { action: "fill", ok: true, target: action.selector };
  } catch (error) {
    return {
      action: "fill",
      error: String(error).split("\n")[0] ?? "",
      ok: false,
      target: action.selector,
    };
  }
};

/** @returns {Promise<VerifierBrowser>} */
const launch = async () => {
  /** @type {unknown} */
  const imported = await import("playwright");
  /** @type {VerifierChromium} */
  const playwright = imported;

  return await playwright.chromium.launch();
};

/** @param {VerifierPage} page
 * @returns {Promise<string[]>} */
const blockChatSends = async (page) => {
  /** @type {string[]} */
  const blocked = [];

  /** @type {(route: VerifierRoute) => Promise<void>} */
  const onRoute = async (route) => {
    if (route.request().method() === "POST") {
      blocked.push(route.request().url());
      await route.abort();

      return;
    }

    await route.continue();
  };

  await page.route("**/api/chat/**", onRoute);

  return blocked;
};

/** @param {VerifierPage} page
 * @returns {Watch} */
const listen = (page) => {
  /** @type {string[]} */
  const consoleErrors = [];
  /** @type {string[]} */
  const failedRequests = [];
  /** @type {string[]} */
  const pageErrors = [];

  /** @type {(message: VerifierConsoleMessage) => void} */
  const onMessage = (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  };

  /** @type {(error: VerifierPageError) => void} */
  const onPageError = (error) => {
    pageErrors.push(error.message);
  };

  /** @type {(request: VerifierRequest) => void} */
  const onRequestFailed = (request) => {
    const failure = request.failure();

    failedRequests.push(
      `${request.method()} ${request.url()} ${failure?.errorText ?? ""}`
    );
  };

  page.on("console", onMessage);
  page.on("pageerror", onPageError);
  page.on("requestfailed", onRequestFailed);

  return { consoleErrors, failedRequests, pageErrors };
};

/** @param {VerifierBrowser} browser
 * @param {Viewport} viewport
 * @returns {Promise<Session>} */
const open = async (browser, viewport) => {
  const context = await browser.newContext({ deviceScaleFactor: 1, viewport });
  const page = await context.newPage();
  const blocked = await blockChatSends(page);
  const watched = listen(page);

  return { blocked, context, page, watched };
};

/** @param {VerifierPage} page
 * @returns {Promise<void>} */
const settle = async (page) => {
  await page.evaluate(`document.fonts.ready.then(() => "ready")`);
  await page.waitForTimeout(700);
};

/** @param {string} file
 * @param {string} text
 * @returns {Promise<void>} */
const writeText = async (file, text) => {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, "utf-8");
};

/** @param {VerifierPage} page
 * @param {string} file
 * @param {boolean} fullPage
 * @returns {Promise<void>} */
const shoot = async (page, file, fullPage) => {
  await mkdir(path.dirname(file), { recursive: true });
  await page.screenshot({ fullPage, path: file });
};

/** @param {string} text
 * @returns {string[]} */
const linesOf = (text) =>
  text
    .split("\n")
    .map((line) => line.replaceAll(WHITESPACE, " ").trim())
    .filter((line) => line.length > 0);

/** @param {string | undefined} file
 * @returns {Promise<string[]>} */
const readText = async (file) => {
  if (file === undefined) {
    return [];
  }

  const loaded = await readFile(file, "utf-8");

  return [...new Set(linesOf(loaded))];
};

/** @param {VerifierPage} page
 * @param {string} url
 * @param {string} label
 * @param {Viewport} viewport
 * @param {Runtime} runtime
 * @returns {Promise<PageReport>} */
const readPage = async (page, url, label, viewport, runtime) => {
  const stem = `${label}-${viewport.name}`;
  let response = null;

  try {
    response = await page.goto(url, { timeout: TIMEOUT, waitUntil: "load" });
  } catch (error) {
    return {
      blockedChatSends: runtime.blocked,
      consoleErrors: runtime.watched.consoleErrors,
      error: String(error),
      failedRequests: runtime.watched.failedRequests,
      label,
      pageErrors: runtime.watched.pageErrors,
      url,
      viewport: viewport.name,
    };
  }

  await settle(page);
  /** @type {PageAction[]} */
  const acted = [];

  for (const action of actions()) {
    // oxlint-disable-next-line no-await-in-loop -- The actions run in the order they were given, so a fill lands before the key that clears it.
    acted.push(await apply(page, action));
  }

  if (acted.length > 0) {
    await settle(page);
  }

  /** @type {string} */
  const text = await page.evaluate(VISIBLE_TEXT);
  const title = await page.title();
  /** @type {Heading[]} */
  const headings = await page.evaluate(HEADINGS);
  /** @type {PageLink[]} */
  const links = await page.evaluate(LINKS);
  /** @type {string[]} */
  const fonts = await page.evaluate(FONTS);
  const textFile = path.join(SCREENS, `${stem}-text.txt`);
  const viewportFile = path.join(SCREENS, `${stem}-viewport.png`);
  const fullFile = path.join(SCREENS, `${stem}-full.png`);
  await writeText(textFile, text);
  await shoot(page, viewportFile, false);
  await shoot(page, fullFile, true);

  return {
    actions: acted,
    blockedChatSends: runtime.blocked,
    consoleErrors: runtime.watched.consoleErrors,
    failedRequests: runtime.watched.failedRequests,
    finalUrl: page.url(),
    fonts,
    headings,
    label,
    links,
    pageErrors: runtime.watched.pageErrors,
    screenshotFull: fullFile,
    screenshotViewport: viewportFile,
    status: response?.status() ?? 0,
    textFile,
    title,
    url,
    viewport: viewport.name,
    words: text.split(WHITESPACE).filter((word) => word.length > 0).length,
  };
};

/** @param {VerifierBrowser} browser
 * @param {string} url
 * @param {string} label
 * @param {Viewport} viewport
 * @returns {Promise<PageReport>} */
const visitOne = async (browser, url, label, viewport) => {
  const session = await open(browser, viewport);

  const report = await readPage(session.page, url, label, viewport, {
    blocked: session.blocked,
    watched: session.watched,
  });

  await session.context.close();

  return report;
};

/** @param {VerifierBrowser} browser
 * @param {string} base
 * @param {string} label
 * @param {string} routePath
 * @returns {Promise<PageReport[]>} */
const visit = (browser, base, label, routePath) => {
  const url = `${base}${routePath}`;

  return Promise.all(
    VIEWPORTS.map(
      async (viewport) =>
        await visitOne(browser, url, `${label}${slug(routePath)}`, viewport)
    )
  );
};

/** @param {VerifierBrowser} browser
 * @param {string} base
 * @param {string} namePrefix
 * @returns {Promise<{ pages: PageReport[]; path: string }[]>} */
const visitAll = (browser, base, namePrefix) =>
  Promise.all(
    paths().map(async (routePath) => ({
      pages: await visit(browser, base, namePrefix, routePath),
      path: routePath,
    }))
  );

/** @param {VerifierBrowser} browser
 * @param {string} routePath
 * @returns {Promise<CompareReport>} */
const compareOne = async (browser, routePath) => {
  const headSession = await open(browser, VIEWPORTS[0]);
  const baseSession = await open(browser, VIEWPORTS[0]);

  const headReport = await readPage(
    headSession.page,
    `${origin("head")}${routePath}`,
    `compare-head${slug(routePath)}`,
    VIEWPORTS[0],
    { blocked: headSession.blocked, watched: headSession.watched }
  );

  const baseReport = await readPage(
    baseSession.page,
    `${origin("base")}${routePath}`,
    `compare-base${slug(routePath)}`,
    VIEWPORTS[0],
    { blocked: baseSession.blocked, watched: baseSession.watched }
  );

  await headSession.context.close();
  await baseSession.context.close();
  const headLines = await readText(headReport.textFile);
  const baseLines = await readText(baseReport.textFile);
  const baseSet = new Set(baseLines);
  const headSet = new Set(headLines);
  const addedInHead = headLines.filter((line) => !baseSet.has(line));

  const missingFromHead = baseLines.filter((line) => !headSet.has(line));

  return {
    addedInHead,
    baseStatus: baseReport.status ?? 0,
    headStatus: headReport.status ?? 0,
    missingFromHead,
    path: routePath,
  };
};

/** @param {VerifierBrowser} browser
 * @returns {Promise<CompareReport[]>} */
const compareAll = (browser) =>
  Promise.all(
    paths().map(async (routePath) => await compareOne(browser, routePath))
  );

/** @param {VerifierPage} page
 * @returns {Promise<Match[]>} */
const findSelectors = async (page) => {
  const counts = await Promise.all(
    WIDGET_TARGETS.map(async (selector) => ({
      count: await page.locator(selector).count(),
      selector,
    }))
  );

  return counts.filter((entry) => entry.count > 0);
};

/** @param {VerifierPage} page
 * @param {string} selector
 * @returns {Promise<boolean>} */
const isVisible = async (page, selector) => {
  try {
    return await page.locator(selector).first().isVisible();
  } catch {
    return false;
  }
};

/** @param {VerifierFrame} frame
 * @returns {Promise<FrameState>} */
const readFrame = async (frame) => {
  /** @type {string} */
  const text = await frame.evaluate(VISIBLE_TEXT);
  /** @type {PageButton[]} */
  const buttons = await frame.evaluate(BUTTONS);
  /** @type {PageInput[]} */
  const inputs = await frame.evaluate(INPUTS);

  return {
    buttons,
    found: true,
    inputs,
    textExcerpt: text.slice(0, 4000),
    words: text.split(WHITESPACE).filter((word) => word.length > 0).length,
  };
};

/** @param {VerifierPage} page
 * @returns {Promise<FrameState>} */
const frameState = async (page) => {
  const handle = await page.locator("iframe").first().elementHandle();
  const frame = await handle?.contentFrame();

  if (frame === null || frame === undefined) {
    return { buttons: [], found: false, inputs: [] };
  }

  return await readFrame(frame);
};

/** @param {VerifierPage} page
 * @param {Match[]} matches
 * @returns {Promise<string>} */
const clickLauncher = async (page, matches) => {
  const checked = await Promise.all(
    matches
      .filter((entry) => !entry.selector.includes("iframe"))
      .map(async (entry) => ({
        entry,
        visible: await isVisible(page, entry.selector),
      }))
  );

  const candidate = checked.find((result) => result.visible);

  if (candidate === undefined) {
    return "";
  }

  try {
    await page
      .locator(candidate.entry.selector)
      .first()
      .click({ timeout: 5000 });

    return candidate.entry.selector;
  } catch {
    return "";
  }
};

/** @param {VerifierBrowser} browser
 * @param {string} base
 * @param {string} routePath
 * @param {string} namePrefix
 * @returns {Promise<Record<string, unknown>>} */
const widgetOne = async (browser, base, routePath, namePrefix) => {
  const session = await open(browser, VIEWPORTS[0]);
  const { page } = session;
  const stem = `${namePrefix}${slug(routePath)}`;
  let status = 0;

  try {
    const response = await page.goto(`${base}${routePath}`, {
      timeout: TIMEOUT,
      waitUntil: "load",
    });

    status = response?.status() ?? 0;
  } catch (error) {
    await session.context.close();

    return { error: String(error), path: routePath, status };
  }

  await settle(page);

  const closedShots = {
    full: path.join(SCREENS, `${stem}-widget-closed-full.png`),
    viewport: path.join(SCREENS, `${stem}-widget-closed-viewport.png`),
  };

  await shoot(page, closedShots.viewport, false);
  await shoot(page, closedShots.full, true);
  const matches = await findSelectors(page);
  const clicked = await clickLauncher(page, matches);
  await page.waitForTimeout(1500);
  await settle(page);

  const openShots = {
    full: path.join(SCREENS, `${stem}-widget-open-full.png`),
    viewport: path.join(SCREENS, `${stem}-widget-open-viewport.png`),
  };

  await shoot(page, openShots.viewport, false);
  await shoot(page, openShots.full, true);
  const state = await frameState(page);

  const report = {
    blockedChatSends: session.blocked,
    clicked,
    closedScreenshots: closedShots,
    consoleErrors: session.watched.consoleErrors,
    openScreenshots: openShots,
    pageErrors: session.watched.pageErrors,
    path: routePath,
    selectors: matches,
    sentAMessage: false,
    state,
    status,
  };

  await session.context.close();

  return report;
};

/** @param {VerifierBrowser} browser
 * @returns {Promise<Record<string, unknown>>} */
const widgetAll = async (browser) => {
  const head = origin("head");
  const base = origin("base");

  const onHead = await Promise.all(
    paths().map(
      async (routePath) => await widgetOne(browser, head, routePath, "head")
    )
  );

  const onBase = await Promise.all(
    paths().map(async (routePath) =>
      base.length > 0
        ? await widgetOne(browser, base, routePath, "base")
        : { path: routePath, skipped: "no base url" }
    )
  );

  return { base, head, onBase, onHead };
};

/** @param {string} base
 * @param {string} routePath
 * @returns {Promise<Record<string, unknown>>} */
const probe = async (base, routePath) => {
  const { href } = new URL(routePath, base);

  try {
    const response = await fetch(href, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT),
    });

    const body = await response.text();

    const headers = Object.fromEntries(
      HEADER_NAMES.map((name) => [name, response.headers.get(name) ?? ""])
    );

    return {
      bodyExcerpt: body.slice(0, 600),
      headers,
      location: response.headers.get("location") ?? "",
      status: response.status,
      url: href,
    };
  } catch (error) {
    return { error: String(error), url: href };
  }
};

/** @returns {Promise<Record<string, unknown>>} */
const apiAll = async () => {
  const head = origin("head");
  const base = origin("base");

  const headProbes = await Promise.all(
    paths().map(async (routePath) => await probe(head, routePath))
  );

  const baseProbes = await Promise.all(
    paths().map(async (routePath) =>
      base.length > 0
        ? await probe(base, routePath)
        : { skipped: "no base url" }
    )
  );

  return { base, baseProbes, head, headProbes };
};

/** @returns {Promise<void>} */
const run = async () => {
  if (command === undefined || command === "help" || command === "--help") {
    process.stdout.write(`${USAGE}\n`);

    return;
  }

  if (command === "api") {
    const report = await apiAll();

    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

    return;
  }

  const browser = await launch();

  try {
    if (command === "page") {
      const report = await visitAll(browser, origin("head"), "head");
      const base = origin("base");

      const baseReport =
        base.length > 0 ? await visitAll(browser, base, "base") : [];

      const payload = {
        base,
        baseReport,
        head: origin("head"),
        headReport: report,
      };

      await writeText(
        path.join(SCREENS, "report-page.json"),
        JSON.stringify(payload, null, 2)
      );
      process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);

      return;
    }

    if (command === "compare") {
      const report = await compareAll(browser);
      const payload = { base: origin("base"), head: origin("head"), report };

      await writeText(
        path.join(SCREENS, "report-compare.json"),
        JSON.stringify(payload, null, 2)
      );
      process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);

      return;
    }

    if (command === "widget") {
      const report = await widgetAll(browser);

      await writeText(
        path.join(SCREENS, "report-widget.json"),
        JSON.stringify(report, null, 2)
      );
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

      return;
    }

    process.stderr.write(`unknown command ${command}\n${USAGE}\n`);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
};

await run();
