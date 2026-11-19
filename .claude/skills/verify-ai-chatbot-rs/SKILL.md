---
name: verify-ai-chatbot-rs
description: Prove the new help.hypertask.ai preview looks, reads and behaves like the old live site before a change is called done. Use for "verify the help site", "compare the preview with the old site", "prove the help move", or any check of help.hypertask.ai on Rat Stack.
---

# Verify the help site

The old site at `https://help.hypertask.ai/help` is the reference. The new site is the preview that GitHub publishes at `https://help.hypertask.ai/ratstack/`. This skill drives both with GET, captures the same evidence from each, and states what a visitor would notice. It never writes to either site.

Drive one feature per run, the one your change touches. The feature files in `features/` hold the recipe for each, and `verify/feature-map.md` holds the whole address table.

## Launch

Nothing builds on our servers and nothing runs here. The instance is the published preview, redeployed by `.github/workflows/publish-ratstack.yml` (run name `Publish the help preview`) on every push to `main` and by hand with `gh workflow run publish-ratstack.yml --ref main`. That workflow deploys one Worker, `help-hypertask-ratstack`, on the route `help.hypertask.ai/ratstack*`.

Ready means the doctor below passes. It also answers whether the preview is the current build:

- `gh run list --repo hypertask-ai/ai-chatbot-rs --workflow publish-ratstack.yml --branch main --limit 1 --json databaseId,headSha,conclusion,url` names the last publish.
- `gh api repos/hypertask-ai/ai-chatbot-rs/git/ref/heads/main --jq .object.sha` names the commit it should be.
- The two hashes must be equal. A newer `main` than the last publish means the preview is stale.

The page names its own build twice, so two runs can be told apart: `data-foldkit-build` on the root element, and the bundle file `/ratstack/assets/app-<hash>.js`. Write both down with the evidence when a publish is in doubt.

The preview keeps the base path and adds a trailing slash. `https://help.hypertask.ai/ratstack/help` answers 307 to `https://help.hypertask.ai/ratstack/help/`, and `/ratstack/widget/chat` does not exist yet. Drive the same address on both sides and let the redirect land; the driver records the final address.

## Doctor

```
node verify/site-doctor.mjs
```

Reads only, changes nothing. Six checks: the old site answers, the preview answers, the preview carries `X-Robots-Tag: noindex` and the robots meta tag, the old site still carries no noindex, the preview's bundle answers, and the last successful publish on `main` matches the `main` head. Exit code 0 means every check passed, 1 means at least one failed or could not be read. `--json` prints the checks as JSON. `--old`, `--preview`, `--repo`, `--workflow` and `--branch` point it at another host or repository.

Run it first, whenever a page looks wrong, and before you believe any drive.

## Drive

The driver is `verify/driver.mjs`. It opens Chromium headless at 1440x900 and 390x844, blocks every POST to `/api/chat/**`, and reads the page: status, final address, title, headings, links, fonts, visible text, console errors and failed requests. Every run writes screenshots and a text file per side and viewport.

```
SCREENS_DIR=/tmp/help-drive node verify/driver.mjs page \
  --head https://help.hypertask.ai/ratstack \
  --base https://help.hypertask.ai \
  --path /help
```

`--click`, `--fill` and `--press` drive the page before it is read, in that order. Each may repeat.

```
node verify/driver.mjs page --head https://help.hypertask.ai --path /help \
  --click "a[href='#all']" --fill "#searchInput=agents" --press "Escape"
```

Stable handles, present on both sites: `#searchInput` (`aria-label="Search articles"`), `#searchClear` (`aria-label="Clear search"`), `#liveSearchResults`, `#all` the article browser, `#topics` and `#topics a[href*="category="]` for the eight topic cards, `[data-category]` for the article cards, `[data-message]` for the three hero chips, `#heroChat` and `#heroMessage` (`aria-label="Your question"`), `#reader`, `#readerBody` and `#readerBack` labelled `Back to articles`, `article.plan-card[data-plan]`, `#ht-plan-monthly` and `#ht-plan-yearly`. Prefer these over coordinates and tab order.

The other driver commands are `compare` for the text diff against the base, `widget` for the chat widget, and `api` for a GET of an address with its status and headers.

## Evidence

```
node verify/parity-evidence.mjs --feature help-centre --path /help
```

It runs the driver on both sides, then writes one folder per run:

- `side-by-side-1440.png` and `side-by-side-390.png`, the old page on the left and the preview on the right.
- `text-diff.txt`, every line of the old page the preview lacks, then every line it adds.
- `links.json`, the addresses and wording that differ, compared under the preview's base path.
- `head-tags.json`, the status, final address, headers, title, description, canonical and robots tag of each side.
- `report.md` and `run.json`, the verdict, the reasons and the actions driven.

Runs land in `${EVIDENCE_DIR:-/tmp/ratstack/evidence/verify-ai-chatbot-rs}/<feature>/<stamp>/`. Set `EVIDENCE_DIR` to a durable path when the proof must outlive a reboot. Cleanup never removes this folder.

`--click`, `--fill`, `--press` and `--expect` pass through to the driver and the verdict; `--expect 404` is how the not-found journey is driven. The exit code is 0 on PASS and 1 on FAIL.

Proof standards: drive the real page on both hosts, not a test-only route. Capture the action and the state after it, not only the last screen. Quote the verdict line and the artifact names in what you report. A FAIL is the result to record, not a run to bend: name the difference and the feature file's Gotchas entry that explains it.

## Cleanup

The driver closes the browser it opened in a `finally`, so one run leaves no browser behind. `parity-evidence.mjs` starts no browser of its own. Nothing else runs, so there is no server and no port to close.

Never kill by process name; kill what your run started. Remove only the scratch you created, for example a temporary `verify/node_modules` link when Playwright lives elsewhere. Leave the evidence folder alone.

## Helpers

- `node verify/site-doctor.mjs [--json]` checks both hosts, the preview's noindex and the last publish. Read only.
- `node verify/driver.mjs <page|compare|widget|api> --head <origin> [--base <origin>] [--path <address>] [--click <selector>] [--fill "<selector>=<value>"] [--press <key>]`
- `node verify/parity-evidence.mjs --feature <id> --path <address> [--click ...] [--fill ...] [--press ...] [--expect <status>] [--json]`

## The feature map

`features/README.md` is the index, and one file per feature holds the four sections: Sub-features, How to get to it (user POV), Driving it with verify/driver.mjs, and Gotchas. A journey whose precondition the preview lacks reports a failure and the reason goes in that feature's Gotchas; never weaken the journey to make it pass.

After a page, an address or a control changes, run `/pstack:maintain-verification-skill` so the map stays true.
