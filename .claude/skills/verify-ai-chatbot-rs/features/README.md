# Help site verification map

This directory is the maintained source for proving that the new help.hypertask.ai preview looks, reads and behaves like the old live site. Read the index before driving, then use the matching feature file as the recipe. The whole address table, route by route, stays in `verify/feature-map.md`; this map names the journeys an agent drives.

## Baseline preconditions

- The old site answers at `https://help.hypertask.ai` and the preview at `https://help.hypertask.ai/ratstack`. Neither is ever written to.
- `node verify/site-doctor.mjs` exits 0. It proves both hosts answer, the preview carries noindex, the old site still does not, the preview bundle answers, and the last successful publish on `main` matches the `main` head.
- Playwright 1.65.1 with Chromium resolves from `verify/`. In the verifier job it is linked at `verify/node_modules`; on a laptop it comes from the workspace install.
- Evidence goes to `${EVIDENCE_DIR:-/tmp/ratstack/evidence/verify-ai-chatbot-rs}`. Never inside the clone, and never removed by cleanup.
- Never log in to the admin pages and never send a chat message. The driver blocks every POST to `/api/chat/**` and reports what it blocked.

## Driving conventions

- Start every recipe from the baseline state unless its preconditions say otherwise.
- Drive the same address on both sides. The preview answers `/ratstack/help` with a 307 to `/ratstack/help/`, and the driver records the final address in `finalUrl`.
- Prefer the stable handles over coordinates and tab order: ids such as `#searchInput` and `#all`, `aria-label` values such as `Search articles`, and data attributes such as `[data-category]` and `[data-message]`.
- Treat every command as literal. Keep the quoted selectors unchanged; a selector with an inner quote uses double quotes outside and single quotes inside.
- Run browser actions through `node verify/driver.mjs` or, when the run needs the full evidence set, through `node verify/parity-evidence.mjs`, which runs the same driver.
- Actions run in the order clicks, then fills, then presses. Each flag may repeat.

## Proof and skip reporting

- Capture the action and the state after it, not only the last screen. `run.json` holds the actions and whether each one reached its control.
- The verdict is `PASS` only when both sides answer the expected status, every line of the old page appears in the preview, every old link is present, and no link says something different. Anything else is `FAIL` with a reason.
- Quote the verdict line, the evidence folder and the artifact names in what you report.
- A journey whose precondition the preview lacks reports `FAIL`, and that feature's Gotchas says what the preview is missing. Do not report a skipped entry point as verified through another path, and never weaken a journey to make it pass.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with verify/driver.mjs` starts with `Preconditions:` and pairs each user action with an exact command and an observable result.
4. `Gotchas` lists traps that can waste or invalidate a run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Help centre](./help-centre.md) covers the landing page: the header, the hero chat box, the three chips, the eight topic cards, the article browser and the footer.
- [Live search](./live-search.md) covers revealing the article browser, typing a query, reading the matches, and clearing the box.
- [Article page](./article-page.md) covers a published article, the pricing plans block, the related links and the not-found page.
- [Chat widget](./chat-widget.md) covers the embed loader, the chat frame, the launcher and the input, without sending a message.
