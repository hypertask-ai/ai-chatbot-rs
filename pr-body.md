## Why

Valentin's goal is to rebuild hypertask.ai, docs.hypertask.ai and help.hypertask.ai on Rat Stack on Cloudflare, with each new site looking and reading exactly like the old one, and to put the new sites on separate addresses so the old pages are not lost while the switch is prepared. This unit makes the new help site able to run at help.hypertask.ai/ratstack. It publishes nothing: no deploy, no Cloudflare command, no live route.

This branch is based on `ratstack/htpr-9157` (PR 4, the health check, redirects and allowed sites) and targets it, because the routes this unit mounts under `/ratstack` are the ones PR 4 adds. It uses the `@rat-stack/` scope that branch has, so the HTPR-9181 rename will need a rebase.

## What changed

One build-time setting, `SITE_BASE_PATH`, empty by default. It is declared in `.env.schema` and, unlike docs PR 11, declared in `turbo.json` as an input of the `build` task, so a cached build cannot ignore it. Turbo 2 passes only declared variables to a task in strict env mode, so the declaration both hashes and passes it.

- `apps/web/src/site-base-path.ts` is the pure core: normalize, add, remove and test one root-relative prefix. Adding is idempotent, and external, protocol-relative, fragment and query addresses are left alone.
- `apps/web/src/site-base.ts` reads the base from `import.meta.env.BASE_URL`, which is Vite's own `base`, set from the setting in `apps/web/vite.config.ts`. It wraps the Foldkit HTML builder so `Href`, `Src`, `Action`, `Formaction` and the generic `Attribute` for href, src and srcset emit prefixed addresses. Vite's `base` is also the prefix Alchemy keys the uploaded asset manifest with, so the stylesheet, font and script addresses the build emits carry `/ratstack` and are served under it.
- `apps/web/src/server/help-site.ts` becomes `answerHelpSiteAt(basePath)` with `answerHelpSite = answerHelpSiteAt(siteBasePath)`. Under a base path it answers a preflight first (unchanged), refuses anything outside the base path with the CORS headers, strips the prefix for routing, answers `/ratstack/health` through the same health handler, and sends the root and `/en*` to `/ratstack/help`. The empty base path is identity: every recorded answer stays byte for byte.
- `apps/web/src/server/site-document.ts` adds `<meta name="robots" content="noindex, nofollow">` to every document when the base path is set, and returns Foldkit's own `renderDocument` untouched when it is empty.
- `apps/web/src/server/site-answer.ts` adds the `X-Robots-Tag` header to every answer under the test address, including a rendered `Rendered` result, through `Match` over `EntryResult`.
- `apps/web/src/features/home/index.ts` exposes `viewAt(basePath)` and `view = viewAt(siteBasePath)`, so no page is patched by hand and the browser builds the same markup the server does.

### Safety while both sites share help.hypertask.ai

The test address must never read or write the live chat data and never call the real AI. Today nothing can. The Stack declares only the Website and its own Alchemy state store. The old Worker's D1 database, Durable Object, rate limiters and `AI` binding are not adopted by this project yet, and HTPR-9155, HTPR-9160 and HTPR-9168 own those steps. The Website's entire binding set is the typed `workerBindings` map in `apps/web/src/server/site-bindings.ts`, which is empty and is the only `env` the Website receives in `apps/web/src/website.ts`. Nothing in the entry imports a data store, a database binding or an AI binding.

That state is guarded twice. `apps/web/src/server/site-isolation.ts` names every binding outside `separateTestStoreBindingNames` as live, and `answerHelpSiteAt` refuses at module load, fail closed, with a fence message when the base path is set and any live binding is reachable. `apps/web/test/site-isolation.test.ts` pins the shipped state and fails the day a production binding appears under `/ratstack` without an explicit separate test store.

### The planned route

`apps/infra/src/help-ratstack-route.ts` writes the route down as a typed value with `active: false`: pattern `help.hypertask.ai/ratstack*`, zone `hypertask.ai`, Worker `ai-chatbot-rs`, base path `/ratstack`. `apps/web/src/website-props.ts` gives the Website the name `ai-chatbot-rs` for every stage that is not a PR preview, and previews keep Alchemy's stage-scoped name, so the route has one exact target at the switch. No resource is declared as managed and no Cloudflare command runs.

### Publish steps for a later GitHub workflow

1. Build at the test address, no Cloudflare key: job environment `SITE_BASE_PATH=/ratstack`, then `pnpm install --frozen-lockfile`, `pnpm sources:fetch`, `pnpm turbo run check test build --concurrency=2`. `turbo.json` declares the variable on `build`, so the cache key includes it.
2. Deploy the Stack, needs the owner's Cloudflare key: repository secret `CLOUDFLARE_API_TOKEN`, repository variable `CLOUDFLARE_ACCOUNT_ID`, a named `ALCHEMY_PROFILE`, and `ALCHEMY_STAGE=live`. Any stage that does not start with `pr-` gives the Worker the name `ai-chatbot-rs`. Command: `pnpm --filter @rat-stack/infra exec alchemy deploy --stage live`.
3. Attach the route, needs the same owner's key with Workers Routes edit on `hypertask.ai`: make `helpRatstackRoute` active by declaring `routes: [{ pattern: helpRatstackRoute.pattern, zoneName: helpRatstackRoute.zoneName }]` on the Website, then deploy again. This unit leaves the value `active: false`, so no deploy can create it.
4. Verify, no key: `curl -i https://help.hypertask.ai/ratstack/health` answers 200 with `{"status":"ok","service":"ai-chatbot"}` and `x-robots-tag: noindex, nofollow`; `curl -I https://help.hypertask.ai/health` still answers from the old site; `curl -I https://help.hypertask.ai/ratstack/` answers 302 with `location: /ratstack/help`.
5. Cutover is HTPR-9178: drop `SITE_BASE_PATH` from the build environment and move the route from `/ratstack*` to the whole host in one change. Rollback is the same change reversed.

## Proof

- `apps/web/test/help-site.test.ts`: every recorded row from PR 4 runs twice. Once through the real Foldkit page host with the setting empty, comparing status, every compared header and the body byte for byte. Once through `answerHelpSiteAt("/ratstack")` with the prefix, comparing status, every compared header with `location` moved inside `/ratstack`, the body, and `x-robots-tag`. It also pins that the root and `/en*` redirect to `/ratstack/help`, that `/ratstack/nope` answers 404 with the CORS headers, that `/health`, `/`, `/help` and `/en/foo` outside the base path answer 404, that a preflight under `/ratstack/api/chat/message` answers the same CORS headers, and it crawls every internal address it finds and asserts each one stays inside `/ratstack`.
- `apps/web/test/site-base.test.ts`: a property test runs a route through add and remove for both bases; example tests cover external addresses, fragments, queries, srcset descriptors and normalization; a rendered home page under the test address carries the robots meta and no address outside the base; the same page with the empty setting contains no `/ratstack` and no robots meta; `siteDocumentRenderer("")` is Foldkit's own renderer.
- `apps/web/test/site-isolation.test.ts`: the live binding list is empty today, `/ratstack` refuses a live binding with the fence message, the origin root is unaffected, and a binding named as the separate test store is allowed.
- `apps/infra/test/help-ratstack-route.test.ts`: the planned route is inactive, its pattern is the base path on `help.hypertask.ai`, the zone is `hypertask.ai`, and the Worker name is the name `apps/web/src/website-props.ts` gives the non-preview Website.
- Not run here: no build, no typecheck, no tests, no dev server, no deploy. GitHub checks are the only judge. No Cloudflare resource, route or secret was touched.

### The ticket's Done when lines

- The new help site builds with and without `/ratstack`. The empty build is today's CI path. The `/ratstack` build is step 1 of the publish workflow, and both bases are exercised by the tests above. Gap: no CI job builds with the setting on, because existing workflows are fenced in this unit.
- No link under `/ratstack` leaves `/ratstack` by mistake. Covered by the builder tests, the rendered page and the route crawl.
- Every `/ratstack` page says do not index. Covered by the robots meta in the document and the `X-Robots-Tag` header on every answer under the test address.
- An independent checker posts PASS on GitHub. The independent checker is its own ticket (HTPR-9176, step 25); this unit's gate is green checks on the head sha.

## Gaps and follow-ups

- The `/help` page does not exist yet (HTPR-9170), so `/ratstack/help` answers 404 today, inside the prefix. The route and prefix plumbing are ready for it.
- The widget address `/ratstack/widget/widget.js` arrives with HTPR-9323 and inherits the same stripping.
- The CI build at `/ratstack` and the route attach both need the owner's Cloudflare key, and both belong to the publish ticket.
- `apps/web/src/website.ts` now takes stage-aware props and pins the non-preview Worker name. Nothing is deployed, so no Worker is renamed.

## Modern web guidance used

- Guide id `html`: document head metadata, resource URL handling, and the robots meta tag.
