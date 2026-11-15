// @effect-diagnostics nodeBuiltinImport:off -- This Node CLI writes screenshots, text pairs, and reports to disk.
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { parseArgs } from "node:util";

import { Schema } from "effect";
import { chromium } from "playwright";
import type { BrowserContext, Page } from "playwright";
import { PNG } from "pngjs";

interface ArticleRow {
  readonly category?: string | null | undefined;
  readonly slug: string;
}

interface Capture {
  readonly buffer: Buffer;
  readonly fonts: string;
  readonly imagePath: string;
  readonly status: number;
  readonly text: string;
  readonly title: string;
}

interface ChatProbe {
  readonly eventOrder: readonly string[];
  readonly sourceCount: number | null;
  readonly status: number;
  readonly storedMessageCount: number | null;
  readonly timingMetrics: readonly string[];
}

interface BehaviourResult {
  readonly failure: string | null;
  readonly newChat: ChatProbe | null;
  readonly oldChat: ChatProbe | null;
  readonly ran: boolean;
  readonly reason: string;
}

interface DiffResult {
  readonly diffImage: Buffer | null;
  readonly percent: number;
}

interface PageJob {
  readonly pagePath: string;
  readonly viewport: Viewport;
}

interface PageResult {
  readonly diffImagePath: string | null;
  readonly failure: string | null;
  readonly fontsMatch: boolean | null;
  readonly newImagePath: string | null;
  readonly newStatus: number | null;
  readonly newTitle: string | null;
  readonly oldImagePath: string | null;
  readonly oldStatus: number | null;
  readonly oldTitle: string | null;
  readonly pagePath: string;
  readonly percent: number | null;
  readonly textDiffPath: string | null;
  readonly textMatches: boolean | null;
  readonly viewport: string;
}

interface ProbeSnapshot {
  readonly documentKeys: readonly string[] | null;
  readonly headers: Readonly<Record<string, string | null>>;
  readonly location: string | null;
  readonly status: number;
}

interface RouteProbe {
  readonly label: string;
  readonly origin?: string;
  readonly path: string;
}

interface RouteResult {
  readonly failure: string | null;
  readonly label: string;
  readonly newSnapshot: ProbeSnapshot | null;
  readonly oldSnapshot: ProbeSnapshot | null;
  readonly path: string;
}

interface Viewport {
  readonly height: number;
  readonly name: string;
  readonly width: number;
}

const CONCURRENCY = 4;

const DEFAULT_OLD_BASE = "https://help.hypertask.ai";

const DEFAULT_OUT = "parity-out";

const DEFAULT_THRESHOLD = "0.1";

const NAVIGATION_TIMEOUT_MS = 60_000;

const NOT_FOUND_SLUG = "parity-page-that-does-not-exist";

const PARITY_QUESTION = "How do I invite a teammate?";

const PARITY_VISITOR_ID = "help-parity-probe";

const SEARCH_HIT = "invite";

const SEARCH_MISS = "zzzz-parity-zzzz";

const STORED_REPLY_WAIT_MS = 3000;

const FONT_SIGNATURE =
  "Array.from(document.fonts).filter((face) => face.status === 'loaded').map((face) => [face.family.replaceAll(/[\"']/gu, ''), face.weight, face.style].join(' ')).toSorted().join(', ')";

const VIEWPORTS: readonly Viewport[] = [
  { height: 900, name: "desktop", width: 1440 },
  { height: 844, name: "mobile", width: 390 },
];

const COMPARED_HEADERS = [
  "content-type",
  "cache-control",
  "content-security-policy",
  "x-frame-options",
  "access-control-allow-origin",
] as const;

const ANSWER_ACTION_LABELS = [
  "Did that answer it?",
  "Yes, thanks",
  "Talk to a person",
] as const;

const decodeString = Schema.decodeUnknownSync(Schema.String);

const decodeArticles = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Array(
      Schema.Struct({
        category: Schema.optional(Schema.NullOr(Schema.String)),
        slug: Schema.String,
      })
    )
  )
);

const decodeHistory = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      messages: Schema.optional(
        Schema.Array(Schema.Struct({ id: Schema.String }))
      ),
    })
  )
);

const decodeJsonRecord = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json))
);

const decodeJsonRecords = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Array(Schema.Record(Schema.String, Schema.Json)))
);

const decodeChatEvent = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      conversationId: Schema.optional(Schema.String),
      sources: Schema.optional(
        Schema.Array(Schema.Struct({ title: Schema.String }))
      ),
      type: Schema.String,
      visitorSecret: Schema.optional(Schema.String),
    })
  )
);

const { values } = parseArgs({
  options: {
    behaviour: { default: "false", type: "string" },
    "new-base": { default: "", type: "string" },
    "old-base": { default: DEFAULT_OLD_BASE, type: "string" },
    out: { default: DEFAULT_OUT, type: "string" },
    threshold: { default: DEFAULT_THRESHOLD, type: "string" },
  },
});

const oldBase = values["old-base"] ?? DEFAULT_OLD_BASE;

const newBase = values["new-base"] ?? "";

const outDir = values.out ?? DEFAULT_OUT;

const threshold = Number(values.threshold ?? DEFAULT_THRESHOLD);

const baselineMode = newBase.length === 0;

const behaviourRequested = (values.behaviour ?? "false") === "true";

const evalToken = process.env.EVAL_TOKEN ?? "";

const imagesDir = path.join(outDir, "images");

const textsDir = path.join(outDir, "texts");

const failWith = (what: string, why: string, fix: string): never => {
  process.stderr.write(`${what}. ${why}. Fix: ${fix}.\n`);
  process.exit(1);
};

if (!Number.isFinite(threshold) || threshold < 0) {
  failWith(
    `The pixel threshold ${values.threshold ?? DEFAULT_THRESHOLD} is not a number`,
    "Parity compares pixel differences against a percentage",
    "pass --threshold with a number such as 0.1"
  );
}

const jsonKeysOf = (body: string): readonly string[] => {
  const keys = new Set<string>();

  if (body.trimStart().startsWith("[")) {
    for (const row of decodeJsonRecords(body)) {
      for (const key of Object.keys(row)) {
        keys.add(key);
      }
    }
  } else {
    for (const key of Object.keys(decodeJsonRecord(body))) {
      keys.add(key);
    }
  }

  return [...keys].toSorted();
};

const documentKeysOf = (
  body: string,
  contentType: string | null
): readonly string[] | null => {
  if (contentType === null || !contentType.toLowerCase().includes("json")) {
    return null;
  }

  try {
    return jsonKeysOf(body);
  } catch {
    return ["<unreadable json>"];
  }
};

const mediaTypeOf = (value: string | null): string | null => {
  if (value === null) {
    return null;
  }

  const [mediaType = ""] = value.split(";");

  return mediaType.trim().toLowerCase();
};

const lowerOf = (value: string | null): string | null =>
  value === null ? null : value.trim().toLowerCase();

const timingMetricsOf = (value: string | null): readonly string[] => {
  if (value === null) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.split(";")[0]?.trim() ?? "")
    .filter((name) => name.length > 0)
    .toSorted();
};

const ssePayloadsOf = (body: string): readonly string[] =>
  body.split("\n\n").flatMap((event) => {
    const data = event
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => line.slice("data: ".length));

    return data.length === 0 ? [] : [data.join("\n")];
  });

const collapseKinds = (kinds: readonly string[]): readonly string[] =>
  kinds.filter((kind, index) => kind !== kinds[index - 1]);

const fileNameFor = (pagePath: string): string => {
  const slug = pagePath
    .replaceAll(/[^0-9A-Za-z]+/gu, "-")
    .replaceAll(/^-+/gu, "")
    .replaceAll(/-+$/gu, "");

  return slug.length === 0 ? "index" : slug;
};

// @effect-diagnostics-next-line asyncFunction:off -- Playwright is Promise based and this Node CLI drives it outside an Effect runtime.
const visibleText = async (page: Page): Promise<string> => {
  // oxlint-disable-next-line unicorn/prefer-dom-node-text-content -- Locator.innerText reads rendered text, so inline script bodies and hidden article cards stay out of the comparison.
  const text = await page.locator("body").innerText();

  return text.replaceAll(/\s+/gu, " ").trim();
};

// @effect-diagnostics-next-line asyncFunction:off -- Playwright is Promise based and this Node CLI drives it outside an Effect runtime.
const capture = async (
  page: Page,
  url: string,
  imagePath: string
): Promise<Capture> => {
  const response = await page.goto(url, {
    timeout: NAVIGATION_TIMEOUT_MS,
    waitUntil: "load",
  });

  if (response === null) {
    throw new Error(`No response from ${url}`);
  }

  await page.evaluate("document.fonts.ready");

  const fonts = decodeString(await page.evaluate(FONT_SIGNATURE));

  const buffer = await page.screenshot({
    animations: "disabled",
    caret: "hide",
    fullPage: true,
  });

  const title = await page.title();
  const text = await visibleText(page);

  writeFileSync(imagePath, buffer);

  return { buffer, fonts, imagePath, status: response.status(), text, title };
};

const comparePixels = (before: Buffer, after: Buffer): DiffResult => {
  const first = PNG.sync.read(before);
  const mask = PNG.sync.read(after);

  if (first.width !== mask.width || first.height !== mask.height) {
    return { diffImage: null, percent: 100 };
  }

  const pixels = first.width * first.height;

  let changed = 0;

  for (let index = 0; index < pixels; index += 1) {
    const offset = index * 4;

    const differs =
      first.data[offset] !== mask.data[offset] ||
      first.data[offset + 1] !== mask.data[offset + 1] ||
      first.data[offset + 2] !== mask.data[offset + 2];

    if (differs) {
      changed += 1;

      mask.data[offset] = 255;
      mask.data[offset + 1] = 0;
      mask.data[offset + 2] = 0;
      mask.data[offset + 3] = 255;
    } else {
      mask.data[offset + 3] = 0;
    }
  }

  return {
    diffImage: PNG.sync.write(mask),
    percent: pixels === 0 ? 0 : (changed / pixels) * 100,
  };
};

const emptyPageResult = (job: PageJob): PageResult => ({
  diffImagePath: null,
  failure: null,
  fontsMatch: null,
  newImagePath: null,
  newStatus: null,
  newTitle: null,
  oldImagePath: null,
  oldStatus: null,
  oldTitle: null,
  pagePath: job.pagePath,
  percent: null,
  textDiffPath: null,
  textMatches: null,
  viewport: job.viewport.name,
});

const writeDiffImage = (
  diff: DiffResult,
  targetPath: string
): string | null => {
  if (diff.diffImage === null) {
    return null;
  }

  writeFileSync(targetPath, diff.diffImage);

  return targetPath;
};

const writeTextPair = (
  job: PageJob,
  oldText: string,
  newText: string
): string => {
  const targetPath = path.join(
    textsDir,
    `${fileNameFor(job.pagePath)}-${job.viewport.name}.txt`
  );

  writeFileSync(targetPath, `OLD\n${oldText}\n\nNEW\n${newText}\n`);

  return targetPath;
};

// @effect-diagnostics-next-line asyncFunction:off -- Playwright is Promise based and this Node CLI drives it outside an Effect runtime.
const runPageJob = async (
  browserContext: BrowserContext,
  job: PageJob
): Promise<PageResult> => {
  const { height, name, width } = job.viewport;
  const pageName = fileNameFor(job.pagePath);
  const oldUrl = new URL(job.pagePath, oldBase).href;

  const newUrl =
    newBase.length > 0 ? new URL(job.pagePath, newBase).href : null;

  const page = await browserContext.newPage();

  await page.setViewportSize({ height, width });

  try {
    const oldCapture = await capture(
      page,
      oldUrl,
      path.join(imagesDir, "old", name, `${pageName}.png`)
    );

    if (newUrl === null) {
      return {
        ...emptyPageResult(job),
        oldImagePath: oldCapture.imagePath,
        oldStatus: oldCapture.status,
        oldTitle: oldCapture.title,
      };
    }

    const newCapture = await capture(
      page,
      newUrl,
      path.join(imagesDir, "new", name, `${pageName}.png`)
    );

    const diff = comparePixels(oldCapture.buffer, newCapture.buffer);
    const textMatches = oldCapture.text === newCapture.text;

    return {
      ...emptyPageResult(job),
      diffImagePath: writeDiffImage(
        diff,
        path.join(imagesDir, "diff", name, `${pageName}.png`)
      ),
      fontsMatch: oldCapture.fonts === newCapture.fonts,
      newImagePath: newCapture.imagePath,
      newStatus: newCapture.status,
      newTitle: newCapture.title,
      oldImagePath: oldCapture.imagePath,
      oldStatus: oldCapture.status,
      oldTitle: oldCapture.title,
      percent: diff.percent,
      textDiffPath: textMatches
        ? null
        : writeTextPair(job, oldCapture.text, newCapture.text),
      textMatches,
    };
  } catch (error) {
    return {
      ...emptyPageResult(job),
      failure: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await page.close();
  }
};

const pageViolations = (row: PageResult): readonly string[] => {
  if (row.failure !== null) {
    return [row.failure];
  }

  if (row.oldStatus === null) {
    return ["the old site gave no answer"];
  }

  if (baselineMode) {
    return [];
  }

  const reasons: string[] = [];

  if (row.oldStatus !== row.newStatus) {
    reasons.push(`status ${row.oldStatus} became ${row.newStatus ?? "none"}`);
  }

  if (row.oldTitle !== row.newTitle) {
    reasons.push("title differs");
  }

  if (row.textMatches === false) {
    reasons.push("text differs");
  }

  if (row.fontsMatch === false) {
    reasons.push("loaded fonts differ");
  }

  if ((row.percent ?? 0) > threshold) {
    reasons.push(`pixels differ ${row.percent?.toFixed(2) ?? "?"} percent`);
  }

  return reasons;
};

// @effect-diagnostics-next-line asyncFunction:off -- This Node CLI probes public routes with native Promise I/O outside an Effect runtime.
const probe = async (
  base: string,
  target: RouteProbe
): Promise<ProbeSnapshot> => {
  const headers =
    target.origin === undefined
      ? { accept: "*/*" }
      : { accept: "*/*", origin: target.origin };

  // @effect-diagnostics-next-line globalFetch:off -- This Node CLI probes a public site outside an Effect runtime.
  const response = await fetch(new URL(target.path, base).href, {
    headers,
    redirect: "manual",
  });

  const body = await response.text();

  const compared: Record<string, string | null> = {};

  for (const name of COMPARED_HEADERS) {
    compared[name] = response.headers.get(name);
  }

  return {
    documentKeys: documentKeysOf(body, response.headers.get("content-type")),
    headers: compared,
    location: response.headers.get("location"),
    status: response.status,
  };
};

// @effect-diagnostics-next-line asyncFunction:off -- This Node CLI probes public routes with native Promise I/O outside an Effect runtime.
const runRoute = async (target: RouteProbe): Promise<RouteResult> => {
  try {
    const oldSnapshot = await probe(oldBase, target);

    if (baselineMode) {
      return {
        failure: null,
        label: target.label,
        newSnapshot: null,
        oldSnapshot,
        path: target.path,
      };
    }

    const newSnapshot = await probe(newBase, target);

    return {
      failure: null,
      label: target.label,
      newSnapshot,
      oldSnapshot,
      path: target.path,
    };
  } catch (error) {
    return {
      failure: error instanceof Error ? error.message : String(error),
      label: target.label,
      newSnapshot: null,
      oldSnapshot: null,
      path: target.path,
    };
  }
};

const headerOf = (snapshot: ProbeSnapshot, name: string): string | null =>
  snapshot.headers[name] ?? null;

const routeViolations = (row: RouteResult): readonly string[] => {
  if (row.failure !== null) {
    return [row.failure];
  }

  const before = row.oldSnapshot;

  if (before === null) {
    return ["the old site gave no answer"];
  }

  if (baselineMode) {
    return [];
  }

  const after = row.newSnapshot;

  if (after === null) {
    return ["the new site gave no answer"];
  }

  const reasons: string[] = [];

  if (before.status !== after.status) {
    reasons.push(`status ${before.status} became ${after.status}`);
  }

  if (before.status >= 300 && before.status < 400) {
    if ((before.location === null) !== (after.location === null)) {
      reasons.push("redirect destination presence differs");
    }

    return reasons;
  }

  if (
    mediaTypeOf(headerOf(before, "content-type")) !==
    mediaTypeOf(headerOf(after, "content-type"))
  ) {
    reasons.push("content type differs");
  }

  if (
    lowerOf(headerOf(before, "cache-control")) !==
    lowerOf(headerOf(after, "cache-control"))
  ) {
    reasons.push("cache header differs");
  }

  if (
    headerOf(before, "content-security-policy") !==
    headerOf(after, "content-security-policy")
  ) {
    reasons.push("framing header differs");
  }

  if (
    headerOf(before, "x-frame-options") !== headerOf(after, "x-frame-options")
  ) {
    reasons.push("x-frame-options differs");
  }

  if (
    headerOf(before, "access-control-allow-origin") !==
    headerOf(after, "access-control-allow-origin")
  ) {
    reasons.push("CORS header differs");
  }

  if (
    (before.documentKeys ?? []).join(",") !==
    (after.documentKeys ?? []).join(",")
  ) {
    reasons.push("JSON keys differ");
  }

  return reasons;
};

// @effect-diagnostics-next-line asyncFunction:off -- This Node CLI reads a public history route with native Promise I/O outside an Effect runtime.
const readHistoryCount = async (
  base: string,
  conversationId: string,
  visitorSecret: string
): Promise<number | null> => {
  // @effect-diagnostics-next-line globalFetch:off -- This Node CLI reads a public history route outside an Effect runtime.
  const response = await fetch(
    new URL(`/api/chat/history/${encodeURIComponent(conversationId)}`, base)
      .href,
    { headers: { authorization: `Bearer ${visitorSecret}` } }
  );

  if (!response.ok) {
    return null;
  }

  const history = decodeHistory(await response.text());

  return history.messages?.length ?? null;
};

// @effect-diagnostics-next-line asyncFunction:off -- This Node CLI waits for the stored reply with native Promise I/O outside an Effect runtime.
const storedMessageCount = async (
  base: string,
  conversationId: string,
  visitorSecret: string
): Promise<number | null> => {
  let count = await readHistoryCount(base, conversationId, visitorSecret);

  if (count !== null && count < 2) {
    await delay(STORED_REPLY_WAIT_MS);
    count = await readHistoryCount(base, conversationId, visitorSecret);
  }

  return count;
};

// @effect-diagnostics-next-line asyncFunction:off -- This Node CLI sends one test-marked chat with native Promise I/O outside an Effect runtime.
const runChat = async (base: string, token: string): Promise<ChatProbe> => {
  // @effect-diagnostics-next-line globalFetch:off -- This Node CLI sends one test-marked chat outside an Effect runtime.
  const response = await fetch(new URL("/api/chat/message", base).href, {
    body: JSON.stringify({
      message: PARITY_QUESTION,
      pageTitle: "Help Center",
      pageUrl: new URL("/help", base).href,
      visitorId: PARITY_VISITOR_ID,
    }),
    headers: {
      "content-type": "application/json",
      "x-eval-token": token,
    },
    method: "POST",
  });

  const events = ssePayloadsOf(await response.text()).map((payload) =>
    decodeChatEvent(payload)
  );

  const kinds = events.map((event) => event.type);

  const connected = events.find((event) => event.type === "connected");

  const done = events.find((event) => event.type === "done");

  const conversationId = connected?.conversationId ?? null;
  const visitorSecret = connected?.visitorSecret ?? null;

  const messageCount =
    conversationId === null || visitorSecret === null
      ? null
      : await storedMessageCount(base, conversationId, visitorSecret);

  return {
    eventOrder: collapseKinds(kinds),
    sourceCount: done?.sources?.length ?? null,
    status: response.status,
    storedMessageCount: messageCount,
    timingMetrics: timingMetricsOf(response.headers.get("server-timing")),
  };
};

// @effect-diagnostics-next-line asyncFunction:off -- This Node CLI reads the widget frame with native Promise I/O outside an Effect runtime.
const answerActionLabels = async (base: string): Promise<readonly string[]> => {
  // @effect-diagnostics-next-line globalFetch:off -- This Node CLI reads the public widget frame outside an Effect runtime.
  const response = await fetch(new URL("/widget/chat", base).href);

  const html = await response.text();

  return ANSWER_ACTION_LABELS.filter((label) => html.includes(label));
};

const skippedBehaviour = (reason: string): BehaviourResult => ({
  failure: null,
  newChat: null,
  oldChat: null,
  ran: false,
  reason,
});

// @effect-diagnostics-next-line asyncFunction:off -- This Node CLI runs the optional behaviour comparison outside an Effect runtime.
const runBehaviour = async (): Promise<BehaviourResult> => {
  if (!behaviourRequested) {
    return skippedBehaviour("the behaviour input is false");
  }

  if (baselineMode) {
    return skippedBehaviour(
      "no new base was given, so there is nothing to compare"
    );
  }

  if (evalToken.length === 0) {
    return skippedBehaviour(
      "the EVAL_INGEST_SECRET repository secret is not set, and an unmarked chat would page a human"
    );
  }

  try {
    const oldChat = await runChat(oldBase, evalToken);
    const newChat = await runChat(newBase, evalToken);

    const oldActions = await answerActionLabels(oldBase);
    const newActions = await answerActionLabels(newBase);

    if (oldActions.join(",") !== newActions.join(",")) {
      return {
        failure: "the answer action buttons differ",
        newChat,
        oldChat,
        ran: true,
        reason: "compared",
      };
    }

    return {
      failure: null,
      newChat,
      oldChat,
      ran: true,
      reason: "compared",
    };
  } catch (error) {
    return {
      failure: error instanceof Error ? error.message : String(error),
      newChat: null,
      oldChat: null,
      ran: true,
      reason: "compared",
    };
  }
};

const behaviourViolations = (result: BehaviourResult): readonly string[] => {
  if (!result.ran) {
    return [];
  }

  if (result.failure !== null) {
    return [result.failure];
  }

  const before = result.oldChat;
  const after = result.newChat;

  if (before === null || after === null) {
    return ["the chat shapes are missing"];
  }

  const reasons: string[] = [];

  if (before.status !== after.status) {
    reasons.push(`chat status ${before.status} became ${after.status}`);
  }

  if (before.eventOrder.join(",") !== after.eventOrder.join(",")) {
    reasons.push("stream event order differs");
  }

  if ((before.sourceCount === null) !== (after.sourceCount === null)) {
    reasons.push("source line presence differs");
  } else if (
    before.sourceCount !== null &&
    before.sourceCount !== after.sourceCount
  ) {
    reasons.push("source line count differs");
  }

  if ((before.storedMessageCount ?? -1) !== (after.storedMessageCount ?? -1)) {
    reasons.push("stored message count differs");
  }

  if (before.timingMetrics.join(",") !== after.timingMetrics.join(",")) {
    reasons.push("Server-Timing metrics differ");
  }

  return reasons;
};

const formatPercent = (percent: number | null): string =>
  percent === null ? "n/a" : `${percent.toFixed(2)}%`;

const fontsCell = (rows: readonly PageResult[]): string => {
  if (baselineMode) {
    return "baseline";
  }

  if (rows.some((row) => row.fontsMatch === false)) {
    return "differs";
  }

  return rows.every((row) => row.fontsMatch === true) ? "same" : "missing";
};

const textCell = (rows: readonly PageResult[]): string => {
  if (baselineMode) {
    return "baseline";
  }

  if (rows.some((row) => row.textMatches === false)) {
    return "differs";
  }

  return rows.every((row) => row.textMatches === true) ? "same" : "missing";
};

const titleCell = (rows: readonly PageResult[]): string => {
  if (baselineMode) {
    return "baseline";
  }

  return rows.every(
    (row) => row.newTitle !== null && row.oldTitle === row.newTitle
  )
    ? "same"
    : "differs";
};

const pageStatusCell = (row: PageResult): string =>
  baselineMode
    ? `${row.viewport} ${row.oldStatus ?? "none"}`
    : `${row.viewport} ${row.oldStatus ?? "none"} to ${row.newStatus ?? "none"}`;

const pageRow = (pagePath: string, rows: readonly PageResult[]): string => {
  const reasons = rows.flatMap((row) => pageViolations(row));

  const statuses = rows.map((row) => pageStatusCell(row)).join(", ");

  const pixels = rows
    .map((row) => `${row.viewport} ${formatPercent(row.percent)}`)
    .join(", ");

  const verdict = reasons.length === 0 ? "pass" : reasons.join("; ");
  const target = new URL(pagePath, oldBase).href;

  return `| [${pagePath}](${target}) | ${statuses} | ${titleCell(rows)} | ${textCell(rows)} | ${fontsCell(rows)} | ${pixels} | ${verdict} |`;
};

const routeStatusCell = (row: RouteResult): string => {
  const before = row.oldSnapshot?.status ?? "none";
  const after = row.newSnapshot?.status ?? "none";

  return baselineMode ? `${before}` : `${before} to ${after}`;
};

const routeContentTypeCell = (row: RouteResult): string => {
  const before = row.oldSnapshot;
  const after = row.newSnapshot;

  if (before === null) {
    return "n/a";
  }

  if (baselineMode || after === null) {
    return before.headers["content-type"] ?? "n/a";
  }

  const beforeType = before.headers["content-type"] ?? "none";
  const afterType = after.headers["content-type"] ?? "none";

  return mediaTypeOf(beforeType) === mediaTypeOf(afterType)
    ? afterType
    : `${beforeType} to ${afterType}`;
};

const routeFramingCell = (row: RouteResult): string => {
  const before = row.oldSnapshot;
  const after = row.newSnapshot;

  if (baselineMode || before === null || after === null) {
    return "baseline";
  }

  return headerOf(before, "content-security-policy") ===
    headerOf(after, "content-security-policy")
    ? "same"
    : "differs";
};

const routeKeyCell = (row: RouteResult): string => {
  const before = row.oldSnapshot;
  const after = row.newSnapshot;

  if (baselineMode || before === null || after === null) {
    return "baseline";
  }

  const beforeKeys = before.documentKeys;
  const afterKeys = after.documentKeys;

  if (beforeKeys === null || afterKeys === null) {
    return "n/a";
  }

  return beforeKeys.join(",") === afterKeys.join(",")
    ? `${afterKeys.length} keys`
    : "differs";
};

const routeRow = (row: RouteResult): string => {
  const reasons = routeViolations(row);
  const target = new URL(row.path, oldBase).href;
  const verdict = reasons.length === 0 ? "pass" : reasons.join("; ");

  return `| [${row.label}](${target}) ${row.path} | ${routeStatusCell(row)} | ${routeContentTypeCell(row)} | ${routeFramingCell(row)} | ${routeKeyCell(row)} | ${verdict} |`;
};

const distinctCategories = (
  articles: readonly ArticleRow[]
): readonly string[] => {
  const seen = new Set<string>();
  const categories: string[] = [];

  for (const article of articles) {
    const { category } = article;

    if (category === null || category === undefined || seen.has(category)) {
      continue;
    }

    seen.add(category);
    categories.push(category);
  }

  return categories;
};

// @effect-diagnostics-next-line asyncFunction:off -- This Node CLI reads the old article list with native Promise I/O outside an Effect runtime.
const readArticles = async (base: string): Promise<readonly ArticleRow[]> => {
  // @effect-diagnostics-next-line globalFetch:off -- This Node CLI reads the public article list outside an Effect runtime.
  const response = await fetch(new URL("/api/articles", base).href, {
    headers: { accept: "application/json" },
  });

  const body = await response.text();

  if (!response.ok) {
    return failWith(
      `The article list at ${base}/api/articles answered ${response.status}`,
      "Parity needs the old article list to build the page set",
      "check the old site is up and reachable from the runner"
    );
  }

  try {
    return decodeArticles(body);
  } catch (error) {
    return failWith(
      `The article list at ${base}/api/articles did not parse as an article array`,
      error instanceof Error ? error.message : String(error),
      "check the old route still returns the documented article list"
    );
  }
};

const articles = await readArticles(oldBase);

if (articles.length === 0) {
  failWith(
    `The article list at ${oldBase}/api/articles is empty`,
    "Parity cannot build a page set without articles",
    "check the old site still serves its articles"
  );
}

const [sampleSlug] = articles.map((article) => article.slug).toSorted();

if (sampleSlug === undefined) {
  failWith(
    `The article list at ${oldBase}/api/articles has no usable slug`,
    "Parity cannot probe a single article without a slug",
    "check the old route still returns slugs"
  );
}

const categories = distinctCategories(articles);

const pagePaths = [
  "/help",
  ...categories.map(
    (category) => `/help?category=${encodeURIComponent(category)}`
  ),
  ...articles.map((article) => `/help/${article.slug}`),
  `/help/${NOT_FOUND_SLUG}`,
  "/widget/chat",
];

const routeProbes: readonly RouteProbe[] = [
  { label: "root redirect", path: "/" },
  { label: "old URL redirect", path: "/en" },
  { label: "health", path: "/health" },
  { label: "articles list", path: "/api/articles" },
  { label: "article row", path: `/api/articles/${sampleSlug}` },
  { label: "article row missing", path: `/api/articles/${NOT_FOUND_SLUG}` },
  { label: "article search hit", path: `/api/articles/search/${SEARCH_HIT}` },
  { label: "article search miss", path: `/api/articles/search/${SEARCH_MISS}` },
  { label: "help reader", path: `/api/help-reader/${sampleSlug}` },
  {
    label: "help reader missing",
    path: `/api/help-reader/${NOT_FOUND_SLUG}`,
  },
  { label: "help reader pricing", path: "/api/help-reader/pricing-plans" },
  { label: "debug retrieval", path: "/api/chat/debug-rag?q=invite" },
  {
    label: "chat history without secret",
    path: "/api/chat/history/parity-missing-conversation",
  },
  { label: "widget script", path: "/widget/widget.js" },
  { label: "widget frame", path: "/widget/chat" },
  { label: "help page", path: "/help" },
  { label: "article page", path: `/help/${sampleSlug}` },
  { label: "not found page", path: `/help/${NOT_FOUND_SLUG}` },
  { label: "admin entry", path: "/admin" },
  { label: "cors allowed", origin: "https://hypertask.ai", path: "/health" },
  { label: "cors blocked", origin: "https://parity.invalid", path: "/health" },
];

const routeResults = await Promise.all(
  routeProbes.map((target) => runRoute(target))
);

const behaviourResult = await runBehaviour();

const jobs = pagePaths.flatMap((pagePath) =>
  VIEWPORTS.map((viewport) => ({ pagePath, viewport }))
);

for (const directory of [imagesDir, textsDir]) {
  mkdirSync(directory, { recursive: true });
}

for (const viewport of VIEWPORTS) {
  for (const side of ["old", "new", "diff"]) {
    mkdirSync(path.join(imagesDir, side, viewport.name), { recursive: true });
  }
}

const pageResults: PageResult[] = [];

const queue = [...jobs];

// @effect-diagnostics-next-line asyncFunction:off -- This Node CLI drains its capture queue with Playwright Promises outside an Effect runtime.
const drain = async (browserContext: BrowserContext): Promise<void> => {
  const job = queue.shift();

  if (job === undefined) {
    return;
  }

  pageResults.push(await runPageJob(browserContext, job));

  if (pageResults.length % 20 === 0) {
    process.stdout.write(
      `captured ${pageResults.length} of ${jobs.length} page captures\n`
    );
  }

  await drain(browserContext);
};

const browser = await chromium.launch();

const context = await browser.newContext({
  colorScheme: "dark",
  reducedMotion: "reduce",
});

const workers = Math.min(CONCURRENCY, queue.length);

await Promise.all(Array.from({ length: workers }, () => drain(context)));

await browser.close();

const orderedPages = pageResults.toSorted((left, right) => {
  const byPath = left.pagePath.localeCompare(right.pagePath);

  return byPath === 0 ? left.viewport.localeCompare(right.viewport) : byPath;
});

const pageGroups = new Map<string, PageResult[]>();

for (const row of orderedPages) {
  const group = pageGroups.get(row.pagePath);

  if (group === undefined) {
    pageGroups.set(row.pagePath, [row]);
  } else {
    group.push(row);
  }
}

const pageTableRows = [...pageGroups.entries()].map(([pagePath, rows]) =>
  pageRow(pagePath, rows)
);

const pageFailureCount = orderedPages.filter(
  (row) => pageViolations(row).length > 0
).length;

const routeFailureCount = routeResults.filter(
  (row) => routeViolations(row).length > 0
).length;

const behaviourFailures = behaviourViolations(behaviourResult);

const failureCount =
  pageFailureCount + routeFailureCount + behaviourFailures.length;

const summary = [
  baselineMode ? "Help parity baseline capture" : "Help parity comparison",
  "",
  `Old base: ${oldBase}`,
  `New base: ${baselineMode ? "baseline only" : newBase}`,
  `Pages: ${pageGroups.size}`,
  `Page captures: ${pageResults.length}`,
  `Routes: ${routeResults.length}`,
  `Pixel threshold: ${threshold}%`,
  `Failing page captures: ${pageFailureCount}`,
  `Failing routes: ${routeFailureCount}`,
  `Behaviour: ${behaviourResult.reason}`,
  "",
  "| Page | Status | Title | Text | Fonts | Pixels | Verdict |",
  "| --- | --- | --- | --- | --- | --- | --- |",
  ...pageTableRows,
  "",
  "| Route | Status | Content type | Framing | JSON keys | Verdict |",
  "| --- | --- | --- | --- | --- | --- |",
  ...routeResults.map((row) => routeRow(row)),
  "",
  "## Behaviour",
  "",
  behaviourResult.ran
    ? `Compared one test-marked chat on both sites: ${behaviourFailures.length === 0 ? "pass" : behaviourFailures.join("; ")}.`
    : `Skipped: ${behaviourResult.reason}.`,
];

const summaryText = `${summary.join("\n")}\n`;

process.stdout.write(summaryText);

const summaryPath = process.env.GITHUB_STEP_SUMMARY;

if (summaryPath !== undefined) {
  appendFileSync(summaryPath, summaryText);
}

writeFileSync(
  path.join(outDir, "report.json"),
  `${JSON.stringify(
    {
      baseline: baselineMode,
      behaviour: behaviourResult,
      failingPageCaptures: pageFailureCount,
      failingRoutes: routeFailureCount,
      newBase,
      oldBase,
      pageCaptures: pageResults.length,
      pageRows: orderedPages,
      pages: pageGroups.size,
      routeRows: routeResults,
      routes: routeResults.length,
      threshold,
    },
    null,
    2
  )}\n`
);

process.exitCode = failureCount > 0 ? 1 : 0;
