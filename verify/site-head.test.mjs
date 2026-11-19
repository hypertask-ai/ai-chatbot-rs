import assert from "node:assert/strict";
import test from "node:test";

import {
  firstAssetOf,
  hasNoindexHeader,
  headTagsNoindex,
  headTagsOf,
} from "./site-head.mjs";

const HELP_HTML = `<!doctype html>
<html lang="en">
<head>
<title>Help Center &amp; Articles</title>
<meta name="description" content="Answers about boards">
<meta name="robots" content="noindex">
<link rel="canonical" href="https://help.hypertask.ai/help">
<script type="module" src="/ratstack/assets/app-fix.js"></script>
</head>
<body><h1>How can we help?</h1></body>
</html>`;

const BARE_HTML = `<!doctype html>
<html><head><title>Only a title</title></head><body></body></html>`;

await test("head tags are read from the page head", () => {
  assert.deepEqual(headTagsOf(HELP_HTML), {
    canonical: "https://help.hypertask.ai/help",
    description: "Answers about boards",
    robots: "noindex",
    title: "Help Center & Articles",
  });
});

await test("absent head tags are null rather than empty text", () => {
  assert.deepEqual(headTagsOf(BARE_HTML), {
    canonical: null,
    description: null,
    robots: null,
    title: "Only a title",
  });
});

await test("a page without a title reports no title", () => {
  assert.equal(
    headTagsOf("<html><head></head><body></body></html>").title,
    null
  );
});

await test("the first script asset is named", () => {
  assert.equal(firstAssetOf(HELP_HTML), "/ratstack/assets/app-fix.js");
  assert.equal(firstAssetOf(BARE_HTML), null);
});

await test("the noindex header and the robots tag are told apart", () => {
  const noindex = new Headers({ "x-robots-tag": "noindex" });

  assert.equal(hasNoindexHeader(noindex), true);
  assert.equal(
    hasNoindexHeader(new Headers({ "x-robots-tag": "index" })),
    false
  );
  assert.equal(hasNoindexHeader(new Headers()), false);
  assert.equal(headTagsNoindex(headTagsOf(HELP_HTML)), true);
  assert.equal(headTagsNoindex(headTagsOf(BARE_HTML)), false);
});
