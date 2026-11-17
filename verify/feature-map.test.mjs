import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const map = readFileSync(new URL("feature-map.md", import.meta.url), "utf-8");

const tableRows = map
  .split("\n")
  .filter(
    (line) =>
      line.startsWith("| ") &&
      !line.includes("| ---") &&
      !line.startsWith("| Feature")
  );

/**
 * @param {string} value
 * @returns {string}
 */
const escapeRegExp = (value) =>
  value.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/**
 * @param {string} method
 * @param {string} path
 * @returns {string | undefined}
 */
const routeRow = (method, path) => {
  const pattern = new RegExp(
    `${escapeRegExp(method)} ${escapeRegExp(path)}(?![\\w/:-])`,
    "u"
  );

  return tableRows.find((line) => pattern.test(line));
};

/** @type {Array<{ route: string, needle: string }>} */
const alreadyMapped = [
  { needle: "| `/`, `/en`, `/en/anything` |", route: "GET /" },
  { needle: "`/en`", route: "GET /en" },
  { needle: "`/en/anything`", route: "GET /en/*" },
  { needle: "`/health`", route: "GET /health" },
  { needle: "| `/help` |", route: "GET /help" },
  { needle: "`/help/<slug>`", route: "GET /help/:slug" },
  { needle: "`/api/articles`", route: "GET /api/articles" },
  { needle: "`/api/articles/<slug>`", route: "GET /api/articles/:slug" },
  {
    needle: "`/api/articles/search/",
    route: "GET /api/articles/search/:query",
  },
  { needle: "`/api/help-reader/<slug>`", route: "GET /api/help-reader/:slug" },
  { needle: "`/widget/widget.js`", route: "GET /widget/widget.js" },
  { needle: "`/widget/chat`", route: "GET /widget/chat" },
  {
    needle: "`/api/chat/history/",
    route: "GET /api/chat/history/:conversationId",
  },
  { needle: "`/api/chat/debug-rag", route: "GET /api/chat/debug-rag" },
  { needle: "| `/admin` |", route: "GET /admin" },
  { needle: "`/admin/changelog`", route: "GET /admin/changelog" },
  { needle: "`/admin/api/usage", route: "GET /admin/api/usage" },
  {
    needle: "`/admin/api/customers/conversations",
    route: "GET /admin/api/customers/conversations",
  },
];

/** @type {Array<{ method: string, path: string, statuses: string[] }>} */
const addedRoutes = [
  {
    method: "POST",
    path: "/api/chat/message",
    statuses: ["400", "200", "429", "404"],
  },
  {
    method: "POST",
    path: "/api/chat/profile",
    statuses: ["400", "404", "200"],
  },
  {
    method: "POST",
    path: "/api/chat/handoff-email",
    statuses: ["401", "400", "404", "429", "200"],
  },
  {
    method: "POST",
    path: "/api/chat/handoff",
    statuses: ["400", "404", "200"],
  },
  {
    method: "GET",
    path: "/api/chat/sessions/:visitorId",
    statuses: ["401", "200"],
  },
  {
    method: "GET",
    path: "/api/chat/ws/:conversationId",
    statuses: ["101", "404"],
  },
  {
    method: "GET",
    path: "/admin/api/conversations",
    statuses: ["401", "200"],
  },
  {
    method: "POST",
    path: "/admin/api/conversations/bulk/archive",
    statuses: ["401", "400", "200"],
  },
  {
    method: "GET",
    path: "/admin/api/conversations/:id",
    statuses: ["401", "200"],
  },
  {
    method: "POST",
    path: "/admin/api/conversations/:id/accept",
    statuses: ["401", "200"],
  },
  {
    method: "POST",
    path: "/admin/api/conversations/:id/takeover",
    statuses: ["401", "200"],
  },
  {
    method: "POST",
    path: "/admin/api/conversations/:id/message",
    statuses: ["401", "200"],
  },
  {
    method: "POST",
    path: "/admin/api/conversations/:id/close",
    statuses: ["401", "200"],
  },
  {
    method: "POST",
    path: "/admin/api/conversations/:id/archive",
    statuses: ["401", "200"],
  },
  {
    method: "POST",
    path: "/admin/api/conversations/:id/unarchive",
    statuses: ["401", "200"],
  },
];

await test("every old help route has a feature-map row", () => {
  assert.match(map, /blocks every POST to `\/api\/chat\/\*\*`/u);

  for (const { route, needle } of alreadyMapped) {
    assert.ok(map.includes(needle), `${route} has no row`);
  }

  for (const { method, path, statuses } of addedRoutes) {
    const row = routeRow(method, path);

    assert.notEqual(row, undefined, `${method} ${path} has no row`);

    for (const status of statuses) {
      assert.match(
        row,
        new RegExp(String.raw`\b${escapeRegExp(status)}\b`, "u"),
        `${method} ${path} ${status}`
      );
    }
  }
});
