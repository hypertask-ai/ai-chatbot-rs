# help.hypertask.ai migration scaffold

Ticket: https://app.hypertask.ai/detail/project-15/9150 Parent: https://app.hypertask.ai/detail/project-15/9126 Source template: https://github.com/joelhooks/rat-stack/tree/10152920820e717f889628d4c4793fd38967dbd5

This private repository is the replacement help site's workspace. Nothing here changes help.hypertask.ai, its Cloudflare Worker, or a visitor's experience. Domain adoption, publishing and cutover belong to later tickets. The old site at https://github.com/valentinyeo/ai-chatbot keeps serving until every step matches.

## Keep or cut

| Keep | Reason |
| --- | --- |
| `apps/web` | The help centre, article pages, chat widget and admin dashboard move here in Foldkit and StyleX. |
| `apps/infra` | The help site is a Cloudflare Worker today. Its replacement needs its own Alchemy Stack and state store. |
| `packages/core` | Shared contracts, handlers and lifecycle machines. Chat status and retries become state machines here. |
| `packages/capability` | One contract, several surfaces. The chat and article actions serve pages, tools and tests from the same contract. |
| `packages/database` | The parent plan keeps the database cartridge for chat and article data. Not wired into the Stack yet. |
| `packages/flags` | The template's only Durable Object cartridge outside `apps/site`. Step 17 follows its ledger as the live chat room example. Not wired into the Stack yet. |

| Cut | Reason |
| --- | --- |
| `apps/cli` and npm publishing | The help site has no command-line product. |
| `apps/site` and its content-generation pipeline | Rat Stack's teaching site, agent sandbox and workshop are not the help site. The Foldkit entry renders on its own, without importing that backend or its reader. |
| Cafe, tube, motion and docs demos | None are help pages. A minimal private home shell replaces their routes and clients. |
| Auth cartridge | Admin pages keep the Cloudflare login they have today, so no owned accounts are created. |
| Events and Basin cartridges | Rat Stack's own analytics. The help site keeps Fathom on public pages, which has its own step. |
| Crash, devtools, motion, learn and lore cartridges | They serve removed demo interfaces, not the help site. |
| Intake and subscriber delivery cartridges | The help site does not operate Rat Stack's mailing list. The two Telegram bots have their own step. |
| Code snippets and teaching cards | The teaching content pipeline is removed. Its executable database examples would otherwise import deleted packages. |
| Turbo cache, deploy and check-harness cartridges | The template's cloud cache and release operator are not this site's release configuration. The publishing step owns deployment automation. |

Fence tests that resolve a cut package are cut with it, one reason each. The lint rules themselves stay unchanged.

| Cut test | Reason |
| --- | --- |
| Code-snippets and Shiki build-only, shared Basin independence, events seam, devtools in production, devtools distribution paths, dev client browser code (boundary tests) | They resolve `@rat-stack/code-snippets`, `events`, `basin`, `devtools` and `auth` through package folders that no longer exist. |
| Learn card snippets test | The `.brain/data/learn-cards` folder is cut. |
| Content task cache test | It checks cache keys of the removed `apps/site` content reader. |
| Intake spec test | It drives the removed `intake-live` cartridge. |

Keep exact retained pins, strict compiler settings, lint rules, formatter configuration, anti-slop rules, hooks and the complete CI check/test/build command. The lint plugin imports its audited regex policy from the retained scripts folder.

## Template commit

GitHub's template copy starts at the template's current default branch, `b89bf6155c0beb22ed2ca152f535f8ca9c5209fb`, not at the pinned commit. This repository was therefore seeded from a clone of `joelhooks/rat-stack` at the pinned commit `10152920820e717f889628d4c4793fd38967dbd5`, with that history intact, so every pin matches the plan.

## Verification

Build and test only on GitHub-hosted runners. CI runs `pnpm turbo run check test build --concurrency=2` after a frozen install. No checks are disabled for this cut.

The build measurement counts the JavaScript under `apps/web/dist/server` with source maps left out, and the static files under `apps/web/dist/client`. It reports raw bytes and a gzip figure that compresses the Worker graph as one stream. Cloudflare's published Worker limit is 64 MiB uncompressed on the Free plan: https://developers.cloudflare.com/workers/platform/limits/#worker-size

Project-law and package-scope replacement belongs to HTPR-9152. Infrastructure adoption is HTPR-9153. Do not run deployment commands before those steps.
