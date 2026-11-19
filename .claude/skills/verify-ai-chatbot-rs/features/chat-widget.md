# Chat widget

The chat widget is how a visitor asks Hyper AI a question. A host page loads one script, the script injects a launcher, and choosing the launcher opens the chat frame with a welcome line, three starter buttons, an input and a send control. The widget is read here, never used: no run sends a message.

## Sub-features

- `widget-loader` serves `/widget/widget.js`, one load guard, and injects the launcher into the host page.
- `widget-launcher` opens the panel from the button labelled `Open help chat`, and closes it again.
- `widget-frame` serves `/widget/chat` with the Hyper AI header, a new conversation control, the welcome text, three starter buttons, the input and the attach control.
- `widget-input` keeps the input and the send control reachable, without a send.
- `widget-docked` marks the host page with `hypertask-chat-docked` and sets the dock width while the panel is open.

## How to get to it (user POV)

- On `https://help.hypertask.ai/help`, choose the round launcher at the bottom right, labelled `Open help chat`.
- On `https://app.hypertask.ai`, the same launcher opens the same conversation.
- Open `https://help.hypertask.ai/widget/chat` on its own to see the frame without the host page.

## Driving it with verify/driver.mjs

Preconditions:

- `node verify/site-doctor.mjs` exits 0.
- The widget is served at the origin you drive. The preview does not serve it yet.

- **Read the frame on both sides.** Run `node verify/parity-evidence.mjs --feature chat-widget --path /widget/chat`. Expect the old site to answer 200 and the preview to answer 404, so the verdict reads `FAIL` and names the missing control text. The evidence folder holds the screenshots and the status of each side.
- **Open the launcher on the old site.** Run `SCREENS_DIR=/tmp/help-widget node verify/driver.mjs widget --head https://help.hypertask.ai --path /help`. Expect `clicked` to name the launcher, `state.found` to be true, the frame to read about fifty words, and `blockedChatSends` to be empty because nothing was sent.
- **Read the frame controls.** In the same report, `state.inputs` holds one `textarea` with the placeholder `Ask a question…`, and `state.buttons` holds `New`, the close control and the three starter buttons. A missing control is a missing control, not a loading delay, once `state.found` is true.
- **Prove nothing was sent.** `blockedChatSends` in the report lists every POST the driver stopped; it must be empty, and the run must never carry a message. The driver blocks every POST to `/api/chat/**` whether or not one is attempted.
- **Proof.** `report.md`, `run.json`, the closed and open screenshots under the driver folder, and the widget report named on the command line. Quote the folder and the `verdict:` line.

## Gotchas

- The preview does not serve the widget yet: `/ratstack/widget/chat` answers 404 and `/ratstack/help/` loads no widget script. A run today reports `FAIL` with that status; that is the part of the move still to come, not a harness fault.
- Never send a chat message on the live site. The driver aborts the request before it leaves the browser, and a run that reports a blocked send is a run to throw away, not evidence.
- The launcher is injected by the script after load. Read `selectors` in the report rather than looking for the button in the served HTML, which never contains it.
- The docked mode rewrites `html` and `body` class names and the dock width variable on the host page. Read those two class lists when the proof is docking, not the screenshot alone.
- The widget frame carries `no-store` and a frame allowlist of `hypertask.ai`, `www.hypertask.ai` and `docs.hypertask.ai`. A new origin is a change to the allowlist, not to this map.
