# Parity evidence: help-centre

- verdict: FAIL
- driven address: /help
- old: https://help.hypertask.ai (200)
- preview: https://help.hypertask.ai/ratstack (200)
- old final address: https://help.hypertask.ai/help
- preview final address: https://help.hypertask.ai/ratstack/help/
- expected status: 200
- run: 2026-11-19T19-33-47-563Z
- scope: every rendered node and every link, including panels both sites keep hidden

## Actions driven

- none

## Reasons

- 2 lines of the old page are missing from the preview
- 2 links of the preview say something different from the old page

## Text missing from the preview

- Get a signed webhook when a task changes in your team, with no agent, or wake an agent. Covers verification and working without a public URL.
- Manage your incoming notifications, Snooze, Important, and Decisions.

## Text the preview adds

- Understand what wakes an agent, what Hypertask sends, how to verify it, and how to work without a public URL.
- Manage your incoming notifications, Snooze, and Important section.

## Links missing from the preview

- none

## Links the preview adds

- none

## Link text that differs

- /help/docs-features-inbox: "Inbox & NotificationsBoards & ticketsManage your incoming notifications, Snooze, Important, and Decisions." became "Inbox & NotificationsBoards & ticketsManage your incoming notifications, Snooze, and Important section."
- /help/docs-mcp-agent-webhooks: "Agent webhooksAgentsGet a signed webhook when a task changes in your team, with no agent, or wake an agent. Covers verification and working without a public URL." became "Agent webhooksAgentsUnderstand what wakes an agent, what Hypertask sends, how to verify it, and how to work without a public URL."

## Head tags and response

| tag          | old                     | preview                 |
| ------------ | ----------------------- | ----------------------- |
| title        | Help Center - Hypertask | Help Center - Hypertask |
| description  | (absent)                | (absent)                |
| canonical    | (absent)                | (absent)                |
| robots       | (absent)                | noindex                 |
| status       | 200                     | 200                     |
| X-Robots-Tag | (absent)                | noindex                 |

## Artifacts

- side-by-side-1440.png
- side-by-side-390.png
- text-diff.txt
- links.json
- head-tags.json
- run.json
- driver/report-page.json
