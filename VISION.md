# Vision

This repository is the new home of help.hypertask.ai, the Hypertask help desk: a help centre, an AI chat that answers from the help articles, a handoff to a person, and the admin dashboard where that person replies. It rebuilds the Hono Worker on Rat Stack, as Foldkit pages on a Cloudflare Worker. A visitor should notice nothing.

## What the help site is for

Someone stuck on a Hypertask problem lands on help.hypertask.ai, reads an article, and asks the chat when the article does not answer it. The chat answers from the help articles in seconds, collects a name, an email and an account type, and hands the conversation to a person when the visitor asks for one or the chat cannot help. That person replies from the admin dashboard and hears about new conversations in Telegram.

The same chat runs inside hypertask.ai and docs.hypertask.ai through one script tag, so the widget is the product's front door for support. A visitor who asks a question on the marketing site gets the same answer, on the same conversation, as one who asks at help.hypertask.ai.

## What must not change

- Every live address: `/help` and `/help/<slug>`, `/admin` and its API, `/widget/widget.js`, `/widget/chat`, `/api/chat/*`, `/api/articles/*`, `/api/help-reader/<slug>` and `/health`. `/`, `/en` and `/en/*` keep redirecting to `/help`.
- The look. Colours, fonts, sizes, corners and the page frame carry over from the old Worker's theme, on the help centre, the article pages, the chat widget and the admin dashboard.
- Claude Haiku 5.5 and nothing else, with no fallback. The answer streams, the stable system prompt stays the cached prefix, and retrieved articles stay a separate block because that text changes per question.
- The conversation states `bot`, `handoff_requested`, `human` and `closed`, the profile markers, the rules for when a handoff may happen, and the busy message when the model does not answer.
- The two Telegram bots and the split between them. Customer messages use the Help Desk bot only.
- The Cloudflare login in front of the admin, and the private history: a visitor reads their own conversation and no other.
- The Fathom tag on the public help pages, never inside the chat widget or the dashboard.
- The three origins allowed to embed the chat, with no wildcard.
- The rate limits: 30 messages per visitor per minute and 3 new conversations per minute.
- The live data. The new Worker adopts the existing database and the existing conversations. Nothing is copied, nothing is deleted, and no step loses a customer message.
- Help articles still sync from docs.hypertask.ai, so a page is never written twice.

## What changes

- Pages become Foldkit screens with StyleX styles, and routes become typed contracts the pages and the tools share.
- Chat status and retries become state machines.
- The admin room follows Rat Stack's own Durable Object example instead of a hand-rolled one.
- Google font links become self-hosted fonts.
- Publishing runs from GitHub on every merge, and nothing is built or deployed on our servers.
- The strict Rat Stack gate runs on every push: types, lint, format, tests and build. No rule is loosened to make a change pass, and a package this site does not use is cut rather than carried.

## How the move runs

28 small steps on https://app.hypertask.ai/detail/project-15/9126. The old Worker keeps serving help.hypertask.ai until the new one matches it on a preview, then step 27 switches the address and step 28 removes the old code. Undo any step by reverting it, and undo the cutover by pointing help.hypertask.ai back at the old Worker.

Two risks are checked early. Rat Stack has no route that streams an answer, so step 10 tests that first. Rat Stack has no live connection route, so step 17 follows its Durable Object example. The built site has to fit the free plan, which step 1 measures.

## Who it is for

People who need an answer about Hypertask right now, the person on support who answers the ones the chat cannot, and the agents that change this repository.

`AGENTS.md` holds the rules and the addresses. The inherited Rat Stack `README.md` describes the stack the project starts from, and the embed snippet in this repository's `README.md` is the widget contract a host page relies on.

## Amendment policy

This file belongs to the help project and changes when the help site's purpose or promises change. Rat Stack's own `VISION.md` describes the reference project, not this one.
