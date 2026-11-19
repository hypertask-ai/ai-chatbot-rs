# Help centre

The help centre is the landing page of the site. A visitor reads the header, the hero question box, three starter chips, eight topic cards and the footer, and can open the article browser from the topics heading.

## Sub-features

- `centre-header` shows the Hypertask mark, the `Help` word, the `Docs` link and the `Open app` button.
- `centre-hero` shows the question `How can we help?`, the line about Hyper AI, the textarea, the image attach control and `Send message`.
- `centre-chips` shows `Connect Claude to my board`, `Change my plan` and `Invite a teammate`.
- `centre-topics` shows the heading `Or browse topics`, the link `All articles →` and eight topic cards in the old order.
- `centre-cards` holds the article cards, one per article, grouped by category. The region stays hidden until a visitor opens `All articles →`.
- `centre-footer` shows the footer links and the copyright line.

## How to get to it (user POV)

- Type `https://help.hypertask.ai/help` for the old site, or `https://help.hypertask.ai/ratstack/help/` for the preview.
- `https://help.hypertask.ai/ratstack/` also lands on the same help centre in the preview.
- From any page of the old site, the `Help` word in the header goes to `/help`.

## Driving it with verify/driver.mjs

Preconditions:

- `node verify/site-doctor.mjs` exits 0.
- `verify/node_modules` resolves Playwright, or the workspace install does.

- **Read the landing page on both sides.** Run `node verify/parity-evidence.mjs --feature help-centre --path /help`. Expect a folder under `${EVIDENCE_DIR:-/tmp/ratstack/evidence/verify-ai-chatbot-rs}/help-centre/` with `side-by-side-1440.png`, `side-by-side-390.png`, `text-diff.txt`, `links.json`, `head-tags.json`, `report.md` and `run.json`, and a `verdict:` line on stdout.
- **Check the page frame and the words.** Read `report.md`. The head tags table names the title, the description, the canonical and the robots tag of each side, and the two final addresses. The preview answers `https://help.hypertask.ai/ratstack/help/` after the 307 from `/ratstack/help`.
- **Check the eight topic cards.** Read the `Links missing from the preview` and `Links the preview adds` sections. Each topic card is an address such as `/help?category=Agents#all`, compared under the preview's base path, so a card that disappears or changes its wording is named there.
- **Check the three chips and the hero box.** Read the `Text missing from the preview` section. Every chip label and every line of the hero appears there when the preview loses it.
- **Read one viewport by hand when a screenshot is the only evidence.** Run `SCREENS_DIR=/tmp/help-centre node verify/driver.mjs page --head https://help.hypertask.ai/ratstack --base https://help.hypertask.ai --path /help`. Expect two screenshots per side, `1440` and `390`, plus a text file per side.
- **Proof.** The `verdict:` line and `run.json` are the proof. Quote them with the folder name, and name the two viewports the screenshots cover.

## Gotchas

- The preview answers `/ratstack/help` with a 307. The driver follows it and records `finalUrl`; read `finalUrl`, not the address you asked for.
- The article browser (`#all`) and the reader (`#reader`) are `hidden` on both sites. The driver still reads text inside hidden panels, so a card excerpt counts as a difference even though a visitor cannot see the card until the browser opens. `report.md` says so on its `scope:` line.
- Two article card excerpts already differ from the old site, on `docs-mcp-agent-webhooks` and `docs-features-inbox`. A run today therefore reports `FAIL` with those two lines; that is the content difference to fix, not a harness fault.
- The dark page background, the fonts and the card corners come from the old theme. A size or colour difference shows in the screenshot pair and in `fonts` in `driver/report-page.json`, not in the text diff.
- Fathom loads on the public pages. Its request can fail in a headless run; read `failedRequests` in the driver report before calling a console error a regression.
