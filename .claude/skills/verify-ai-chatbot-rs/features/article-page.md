# Article page

An article page shows one help article at its own address: the title, the excerpt, the body, the pricing plans block on the pricing article and the related articles. An address that names no article answers 404 with the heading `Article not found`.

## Sub-features

- `article-body` shows the article title, its excerpt and its body text at `/help/<slug>`.
- `article-plans` shows the Free, BYOK and Pro plan cards with their prices, and the monthly and yearly choice, on `/help/pricing-plans`.
- `article-related` shows the related articles block at the bottom, three from the same category then two by keyword.
- `article-missing` answers 404 with `Article not found` for an address that names no article.
- `article-frame` keeps the same header and footer as the help centre.

## How to get to it (user POV)

- Type the address, for example `https://help.hypertask.ai/help/pricing-plans`.
- Open an article card from the article browser on `/help`, which loads it into the in-page reader without changing the address.
- Open a related article from the bottom of another article.

## Driving it with verify/driver.mjs

Preconditions:

- `node verify/site-doctor.mjs` exits 0.
- The pricing article exists on both sides; it is in the old site's article table and in the preview's recorded articles.

- **Read the pricing article on both sides.** Run `node verify/parity-evidence.mjs --feature article-page --path /help/pricing-plans`. Expect an evidence folder and a `verdict:` line, with the preview landing on `https://help.hypertask.ai/ratstack/help/pricing-plans/`.
- **Check the plan cards and the two prices.** Both pages carry `article.plan-card[data-plan="free"]`, `[data-plan="byok"]` and `[data-plan="pro"]`, and the radio pair `#ht-plan-monthly` and `#ht-plan-yearly`. Read `text-diff.txt` for a price or a plan name that differs.
- **Check the related articles.** Read `Links missing from the preview` in `report.md`. Each related article is one address under `/help/<slug>`, so a block that lists fewer articles is named there.
- **Check the not-found page.** Run `node verify/parity-evidence.mjs --feature article-page-not-found --path /help/no-such-article --expect 404`. Both sides must answer 404 and the verdict must read `PASS`; the heading `Article not found` appears in both text files.
- **Read the head tags.** Read the head tags table in `report.md`: the title differs per article and both sides carry no description and no canonical tag today.
- **Proof.** `report.md`, `run.json` and the two screenshot pairs. Quote the folder, the `verdict:` line and the `text:` and `links:` counts.

## Gotchas

- The preview answers `/ratstack/help/pricing-plans` with a 307 to the trailing-slash address. Read `finalUrl` in `report.md`, not the address you typed.
- The Related Articles block already differs: the preview lists fewer related articles than the old page, so a run today names the missing ones and reports `FAIL`. If your change is not about related links, quote the difference and leave it to the article step.
- Article bodies come from the docs sync. A body that differs after a docs change is a content difference, not a render bug; read the old page and the docs source before you report it.
- The plan cards carry their prices in `data-monthly`, `data-yearly` and `data-year-total` on both sides, so a price difference is visible in the raw row as well as in the text.
