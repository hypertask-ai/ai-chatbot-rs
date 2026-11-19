# Live search

Live search lets a visitor narrow the article list by typing into the search box. The article browser opens first, the matches appear in a results region above the list, and the box clears on Escape or on the clear button.

## Sub-features

- `search-reveal` opens the article browser from `All articles →` or from a topic card.
- `search-match` shows matching articles for a query, with the query marked inside the result.
- `search-empty` keeps the list usable when a query matches nothing, with the article cards still in place.
- `search-clear` empties the box and drops the results from `Clear search` or from Escape.

## How to get to it (user POV)

- On `/help`, choose `All articles →` in the `Or browse topics` heading, or any of the eight topic cards.
- Type into the box labelled `Search articles`, under the article browser heading.
- Press Escape, or choose the button labelled `Clear search`.

## Driving it with verify/driver.mjs

Preconditions:

- `node verify/site-doctor.mjs` exits 0.
- The page is `/help`: `https://help.hypertask.ai/help` on the old site, `https://help.hypertask.ai/ratstack/help` on the preview.

- **Open the article browser.** Choose `All articles →`. The link is `a[href='#all']` on both sites and the browser region is `#all`.
- **Search for one word.** Type `agents` into `#searchInput`. The old site appends the matches to `#liveSearchResults`, so the visible text grows by the matching rows. Run `node verify/parity-evidence.mjs --feature live-search --path /help --click "a[href='#all']" --fill "#searchInput=agents"`. Expect the run to write the evidence folder and to name `#searchInput` under `Actions driven` in `report.md`.
- **Clear the box.** Send Escape. A search input clears on Escape, so the results disappear and the box is empty. Run the same command with `--press "Escape"` and read the last action in `report.md`; it must read `press Escape reached`.
- **Proof.** `report.md` and `run.json` hold the actions, the status of each side, the text missing from the preview and the link differences. Quote the folder and the `verdict:` line.

## Gotchas

- The search box lives inside the hidden article browser. A fill before the reveal cannot reach it and the driver records `ok: false` with a timeout; the reveal must come first, and clicks run before fills.
- The preview has no search script yet: `apps/web/src/client/help/update.ts` handles article feedback only. On the preview the reveal does nothing, `#all` stays hidden, and the fill times out. A run today reports `FAIL` with `#searchInput` as a failed action; that is the missing behaviour, not a harness fault.
- Escape clears a `type="search"` input by itself, so a run that fills and then presses Escape proves the clear, not the query. Run the fill on its own when the proof is the matches.
- The results region is `#liveSearchResults` while the article cards stay in `#categoriesContainer`. A search that matches nothing leaves the cards in place, so count results, not cards.
- A query is matched against the title and the excerpt. Pick a word that appears in one article only, or the run cannot tell a filtered list from an unfiltered one.
