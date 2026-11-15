#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SCREENS = process.env.SCREENS_DIR ?? "verify-screens";

const TIMEOUT = 45_000;

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

const USAGE = `node verify/driver.mjs <command> [flags]

Commands:
  page     --head <url> [--base <url>] [--path /help ...]
  compare  --head <url> --base <url> [--path /help ...]
  widget   --head <url> [--base <url>] [--path /help ...]
  api      --head <url> [--base <url>] [--path /health ...]

Flags:
  PLAYWRIGHT_MODULE points at the playwright package when it is installed outside this repo.
  SCREENS_DIR points at the screenshot and report directory.`;

const argv = process.argv.slice(2);

const [command, ...rest] = argv;

const flag = (name) => {
  const at = rest.indexOf(`--${name}`);

  if (at === -1) {
    return "";
  }

  return rest[at + 1] ?? "";
};

const flagAll = (name) => {
  const indexes = rest
    .map((value, index) => (value === `--${name}` ? index : -1))
    .filter((index) => index >= 0);

  const found = [];

  for (const index of indexes) {
    found.push(rest[index + 1] ?? "");
  }

  return found;
};

const paths = () => {
  const given = flagAll("path").filter((value) => value.length > 0);

  return given.length > 0 ? given : ["/"];
};

const origin = (name) => flag(name).replace(/\/+$/u, "");

const slug = (value) => value.replaceAll(SLUG, "-");

const launch = async () => {
  const specifier = process.env.PLAYWRIGHT_MODULE ?? "playwright";

  const resolved = specifier.startsWith("/")
    ? pathToFileURL(specifier).href
    : specifier;

  const playwright = await import(resolved);

  return playwright.chromium.launch();
};

const blockChatSends = async (page) => {
  const blocked = [];
  await page.route("**/api/chat/**", async (route) => {
    if (route.request().method() === "POST") {
      blocked.push(route.request().url());
      await route.abort();

      return;
    }

    await route.continue();
  });

  return blocked;
};

const listen = (page) => {
  const consoleErrors = [];
  const failedRequests = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure();
    failedRequests.push(
      `${request.method()} ${request.url()} ${failure?.errorText ?? ""}`
    );
  });

  return { consoleErrors, failedRequests, pageErrors };
};

const open = async (browser, viewport) => {
  const context = await browser.newContext({ deviceScaleFactor: 1, viewport });
  const page = await context.newPage();
  const blocked = await blockChatSends(page);
  const watched = listen(page);

  return { blocked, context, page, watched };
};

const settle = async (page) => {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.waitForTimeout(700);
};

const writeText = async (file, text) => {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, "utf-8");
};

const shoot = async (page, file, fullPage) => {
  await mkdir(path.dirname(file), { recursive: true });
  await page.screenshot({ fullPage, path: file });
};

const linesOf = (text) =>
  text
    .split("\n")
    .map((line) => line.replaceAll(WHITESPACE, " ").trim())
    .filter((line) => line.length > 0);

const readText = async (file) => {
  if (file === undefined) {
    return [];
  }

  const loaded = await readFile(file, "utf-8");

  return [...new Set(linesOf(loaded))];
};

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

  const text = await page.evaluate(() => {
    const { body } = document;

    if (body === null) {
      return "";
    }

    return [...body.querySelectorAll("*")]
      .flatMap((node) => {
        if (node.childElementCount > 0) {
          return [];
        }

        const style = window.getComputedStyle(node);

        if (style.display === "none" || style.visibility === "hidden") {
          return [];
        }

        return [node.textContent ?? ""];
      })
      .join("\n");
  });

  const title = await page.title();

  const headings = await page.evaluate(() =>
    [...document.querySelectorAll("h1, h2, h3")].map((node) => ({
      level: node.tagName.toLowerCase(),
      text: (node.textContent ?? "").replaceAll(/\s+/gu, " ").trim(),
    }))
  );

  const links = await page.evaluate(() =>
    [...document.querySelectorAll("a[href]")].map((node) => ({
      href: node.href,
      text: (node.textContent ?? "").replaceAll(/\s+/gu, " ").trim(),
    }))
  );

  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;

    return [...document.fonts].flatMap((face) =>
      face.status === "loaded"
        ? [`${face.family} ${face.weight} ${face.style}`]
        : []
    );
  });

  const textFile = path.join(SCREENS, `${stem}-text.txt`);
  const viewportFile = path.join(SCREENS, `${stem}-viewport.png`);
  const fullFile = path.join(SCREENS, `${stem}-full.png`);
  await writeText(textFile, text);
  await shoot(page, viewportFile, false);
  await shoot(page, fullFile, true);

  return {
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

const visitOne = async (browser, url, label, viewport) => {
  const session = await open(browser, viewport);

  const report = await readPage(session.page, url, label, viewport, {
    blocked: session.blocked,
    watched: session.watched,
  });

  await session.context.close();

  return report;
};

const visit = (browser, base, label, routePath) => {
  const url = `${base}${routePath}`;

  return Promise.all(
    VIEWPORTS.map(
      async (viewport) =>
        await visitOne(browser, url, `${label}${slug(routePath)}`, viewport)
    )
  );
};

const visitAll = (browser, base, namePrefix) =>
  Promise.all(
    paths().map(async (routePath) => ({
      pages: await visit(browser, base, namePrefix, routePath),
      path: routePath,
    }))
  );

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
  const addedInHead = headLines.filter((line) => !baseSet.has(line)).toSorted();

  const missingFromHead = baseLines
    .filter((line) => !headSet.has(line))
    .toSorted();

  return {
    addedInHead,
    baseStatus: baseReport.status ?? 0,
    headStatus: headReport.status ?? 0,
    missingFromHead,
    path: routePath,
  };
};

const compareAll = (browser) =>
  Promise.all(
    paths().map(async (routePath) => await compareOne(browser, routePath))
  );

const findSelectors = async (page) => {
  const counts = await Promise.all(
    WIDGET_TARGETS.map(async (selector) => ({
      count: await page.locator(selector).count(),
      selector,
    }))
  );

  return counts.filter((entry) => entry.count > 0);
};

const isVisible = async (page, selector) => {
  try {
    return await page.locator(selector).first().isVisible();
  } catch {
    return false;
  }
};

const frameState = async (page) => {
  const handle = await page.locator("iframe").first().elementHandle();
  const frame = await handle?.contentFrame();

  if (frame === null || frame === undefined) {
    return { found: false };
  }

  const text = await frame.evaluate(() => {
    const { body } = document;

    if (body === null) {
      return "";
    }

    return [...body.querySelectorAll("*")]
      .flatMap((node) => {
        if (node.childElementCount > 0) {
          return [];
        }

        const style = window.getComputedStyle(node);

        if (style.display === "none" || style.visibility === "hidden") {
          return [];
        }

        return [node.textContent ?? ""];
      })
      .join("\n");
  });

  const buttons = await frame.evaluate(() =>
    [...document.querySelectorAll("button, [role='button']")].map((node) => ({
      label: (node.textContent ?? "").replaceAll(/\s+/gu, " ").trim(),
      type: node.getAttribute("type") ?? "",
    }))
  );

  const inputs = await frame.evaluate(() =>
    [...document.querySelectorAll("input, textarea")].map((node) => ({
      name: node.getAttribute("name") ?? "",
      placeholder: node.getAttribute("placeholder") ?? "",
      tag: node.tagName.toLowerCase(),
    }))
  );

  return {
    buttons,
    found: true,
    inputs,
    textExcerpt: text.slice(0, 4000),
    words: text.split(WHITESPACE).filter((word) => word.length > 0).length,
  };
};

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
