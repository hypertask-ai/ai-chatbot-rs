# Help site feature map

The reference for look and content is the live old site https://help.hypertask.ai, read only. Never send it a chat message. The head site is the pull request under review. The base site is the branch it targets, when the base builds.

One row per user-visible feature of help.hypertask.ai. The address is what a visitor types or what the page calls. The last column names the function rows in `/tmp/ratstack/help-functions.md` on the old repo `origin/master`, so a reviewer can read the old source for the same feature.

The verifier calls `verify/driver.mjs` for the pages, screenshots, links, console errors, addresses and the chat widget. The `widget` command opens the widget and reads its visible state. It never types, never sends, and blocks every POST to `/api/chat/**`.

## Public pages

| Feature | Address to try | What to look for | Old rows |
| --- | --- | --- | --- |
| Old and root URLs | `/`, `/en`, `/en/anything` | 302 to `/help`, same status and `Location` | F01 |
| Health check | `/health` | `{"status":"ok","service":"ai-chatbot"}`, JSON content type | F02 |
| Help centre | `/help` | Header, hero, three starter chips, eight topic cards in the same order, the article browser, the footer, the dark page and cards, the same fonts | F03, F10, F15 |
| Live search | `/help`, type in the search box | The cards give way to results, `<mark>` highlight, a no-results sentence, Escape clears the box | F04 |
| Category deep links | `/help?category=…`, `/help#all`, "All articles" | Only that category's cards, the browser title set to the category name, all eight legacy `cat-…` ids shown as real names | F05, F14 |
| Hero chat box | `/help` hero: textarea, image attach, three chips | Opening it brings up the chat with the question or image queued, no page reload | F06, F68 |
| In-page reader | `/help`, then open an article card | The article replaces the list in the right pane, a back button, Escape closes, the split view above 900 pixels, the address does not change | F07 |
| Article page | `/help/<slug>` | Title, excerpt, body, related links, the same header and footer as `/help` | F11 |
| Article not found | `/help/no-such-article` | Status 404 and the heading `Article not found`, not a blank page | F11 |
| Related articles | Bottom of `/help/<slug>` | Up to three from the same category, then up to two from other categories by keyword | F11 |
| Pricing plans | `/help/pricing-plans` | Free, BYOK and Pro cards, the monthly and yearly radio pair, the 50-seat cap note, the signup links | F13 |
| Header behaviour | Any page, scroll, then 390 pixels wide | A border appears on scroll, the mobile menu button opens the menu | F08 |
| Fonts and theme | Any page | IBM Plex Sans, Newsreader, IBM Plex Mono and Inter load, the colours, sizes and corners match the old page | F10, F15 |
| Page views | Any public page | The same analytics tag as the old page, and none in the widget frame | F09 |

## Addresses the pages call

| Feature | Address to try | What to look for | Old rows |
| --- | --- | --- | --- |
| Article list | `/api/articles` | JSON array, one row per article, the same 97 articles | F16 |
| One article | `/api/articles/<slug>`, plus a slug that does not exist | The full row, and 404 with an `error` field | F17 |
| Keyword search | `/api/articles/search/invite`, plus a miss | Ranked JSON list, title matches first, an empty list on a miss | F18 |
| Reader payload | `/api/help-reader/<slug>`, plus a miss | `title`, `slug`, `excerpt`, `category`, `html`, `plansHtml`, 404 on a miss | F12 |
| Pricing block | `/api/help-reader/pricing-plans` | `plansHtml` holds the plan board, and only for that article | F12, F13 |
| Transcript gate | `/api/chat/history/unknown-without-secret` | 401 without the visitor secret or the admin password | F39 |
| Retrieval debug | `/api/chat/debug-rag?q=invite` | `{query, count, articles}` with hits, the same shape | F41 |
| Embed headers | `/widget/widget.js`, `/widget/chat` | `frame-ancestors 'self'` plus the three allowed sites, `no-store` on the frame, CORS only for the allowlist | F47, F48, F102 |

## Chat widget

| Feature | Address to try | What to look for | Old rows |
| --- | --- | --- | --- |
| Embed loader | `/widget/widget.js` | The same script, one load guard, the bubble injected on first open | F47 |
| Chat frame | `/widget/chat` | The same page, same look as the help page, `no-store` | F48 |
| Launcher | Any page with the loader, then 390 pixels wide | Opens bottom right, expands, becomes a full sheet on a phone, the page behind does not scroll | F49 |
| Frame shell | `/widget/chat` | Hyper AI and Conversations header, new conversation, close, welcome text, three starter buttons, input, attach button, typing dots | F55 |
| Send and stream | `/widget/chat`, no send | The input and the send control exist and are reachable. The verifier never sends a message | F56 |
| Source line | An answer on the old site | `From: <article>` under the answer, one link, the consent words link to the article | F57 |
| Answer actions | An answer on the old site | `Did that answer it?` with Yes and Talk to a person, nothing stored | F58 |
| Handoff card | `/widget/chat`, then Talk to a person | The email form, its validation, the waiting state, then the sent bubble | F61 |
| Human mode | `/widget/chat` with a person replying | The admin reply appears in the open widget, reconnect after a drop, online and offline handled | F62 |
| Past chats | `/widget/chat` header | The last 20 sessions with a 50 character preview and a relative time, a past chat opens read only, a new conversation resets the thread | F63 |
| Image attach | `/widget/chat` | Preview strip, remove, image only message, click to enlarge | F64 |
| Proactive bubble | `/help` on the two troubleshooting articles | A small article bubble beside the launcher, dismissal remembered per article | F65 |
| Connection banner | `/widget/chat` with the network off | A connection lost banner, five retries with backoff, then online again | F66 |
| History merge | `/widget/chat`, reload mid load | No duplicated bubble, no lost bubble | F67 |
| Public open API | Any host page | `window.HypertaskHelp.open({message, attachment})` opens the chat pre-filled | F68 |
| Pinned mode | `/help` at 900 pixels or wider | The chat sits in the page column, no bubble | F51 |
| Docked mode | A host page with `data-mode="docked"` | A 400 pixel right panel, the host body margin, the collapsed state remembered | F50 |
| Post message protocol | A host page | Open, close, expand, dock, article clicks and size changes reach the host, the parent origin is checked | F52, F53 |
| Saved state | `/widget/chat`, then reload | Conversation id, visitor id and visitor secret survive a reload and a page change | F54 |

## Admin pages

The verifier reads these without logging in. Access sits in front of them on the old site, so the passing state is the redirect to the login page, never a rendered inbox.

| Feature | Address to try | What to look for | Old rows |
| --- | --- | --- | --- |
| Dashboard | `/admin` | Redirect to the Cloudflare Access login, no inbox in the response | F69 |
| Changelog | `/admin/changelog` | Same gate, then formatted markdown after login | F70 |
| Inbox list | `/admin` after login | Fifty rows, handoffs first, an unread flag, an archived tab, a refresh every three seconds | F72, F83 |
| Conversation pane | `/admin` after login | The messages, the reply box, accept, takeover, close and archive, the same order | F74, F75, F76, F77, F78, F79, F80, F85 |
| Alerts | `/admin` after login, new handoff | Three note tone, desktop notification, the title flashing for ten seconds, the unread count in the title | F84 |
| Article search | Reply box, type `@` | Articles listed, one inserted as a markdown link | F85 |
| Customer history | Conversation pane, open the history | Every thread for the visitor's email, jump to one | F86 |
| Keyboard | `/admin` after login | j and k move, Enter opens, e archives, r replies, Escape closes, Ctrl or Cmd plus A selects all | F87 |
| Deep link | `/admin#conv=<id>` | That conversation opens, the mobile back button returns to the list | F88 |
| Admin socket | `/admin` after login with a visitor writing | The new message appears and a tone plays, the reconnect runs every two seconds | F89 |
| Usage report | `/admin/api/usage?days=7` | 401 without the password or an Access token, token and cost totals after login | F81, F71 |
| Customer threads | `/admin/api/customers/conversations?email=…` | 401 without a credential, the visitor's threads after login | F82 |

## Not in this map

Machine only, no visitor surface, so the browser driver does not touch them: Telegram alerts (F90), the handoff email transcript (F91), the unresolved chat check (F92), the MCP server (F93), the docs to database sync and its workflow (F94, F95), the replay harness and the retrieval scorer (F99, F100), the schema and migrations (F101), and the one-off importers (F103). The old CI and deploy workflows (F96, F97) are replaced by the new repo's checks and the verifier this map ships with. The secret scan stays (F98).
