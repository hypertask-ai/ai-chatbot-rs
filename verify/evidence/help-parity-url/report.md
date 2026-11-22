# HYST-36 parity investigation

Valentin's goal is to rebuild hypertask.ai, docs.hypertask.ai and help.hypertask.ai on Rat Stack without changing their appearance or content.

## The comparison used the wrong site

Run [45067574089](https://github.com/hypertask-ai/ai-chatbot-rs/actions/runs/45067574089) used commit `a4624192ccc9c801df43214afc8d8a85d59b5f93`. Its report names `https://help.hypertask.ai/ratstack` as the new base. Its page and route requests use `new URL(path, base)` with paths that start with `/`. That replaces the base pathname, so both captures request the old site.

Reproduce the address error without a browser or network request:

```sh
node -e 'console.log(new URL("/help/filter-tasks-by-star-status", "https://help.hypertask.ai/ratstack").href)'
```

The old expression prints `https://help.hypertask.ai/help/filter-tasks-by-star-status`. The correct target is `https://help.hypertask.ai/ratstack/help/filter-tasks-by-star-status`.

`packages/core/test/help-parity-url.test.ts` records the expected addresses for the three reported articles, route probes, encoded paths, query strings, trailing slashes and both root and mounted bases. GitHub CI runs those tests. The same resolver now owns every parity request and report link.

No screenshot baseline, pixel comparison, threshold, player, article or stylesheet changed. The prior 113-page result does not establish preview parity. A corrected comparison can reveal more failures.

## What the supplied images show

These observations come from the downloaded `parity-45067574089` artifact. Coordinates are exclusive pixel bounds from Pillow's image difference. All changed pixels are inside the embedded video frames.

| Article | Capture | Old and new image dimensions | Changed bounds |
| --- | --- | --- | --- |
| `filter-tasks-by-star-status` | Desktop | Both 1440 by 2799 | 365, 423 to 1075, 821 |
| `filter-tasks-by-star-status` | Phone | Both 390 by 2993 | 17, 404 to 373, 603 |
| `sort-tasks-by-last-updated-status` | Desktop | Both 1440 by 3178 | 365, 423 to 1075, 821 |
| `sort-tasks-by-last-updated-status` | Phone | Both 390 by 3565 | None |
| `using-the-forward-slash-menu-in-task-descriptions-and-comments` | Desktop | Both 1440 by 4260 | None |
| `using-the-forward-slash-menu-in-task-descriptions-and-comments` | Phone | Old 390 by 5089, new 390 by 5088 | 17, 520 to 373, 719 in the common image area |

The Loom captures show an unloaded frame on one side and a loaded player on the other. The slash-menu phone capture shows the same timing difference for YouTube. Its extra bottom row also makes the dimension check return 100 percent. Neither result justifies removing or hiding a working player.

## Read-only browser inspection

On November 22, 2026, direct GET requests to the old and actual preview addresses returned identical iframe markup for each article, including `loading="lazy"` and the same Loom or YouTube address. A browser inspection at widths 1440 and 390 found matching iframe rectangles and adjacent content positions.

Desktop frames were 712 by 400.5 pixels. Phone frames were 358 by 201.375 pixels. The actual preview has separate mobile heading-size differences that the original comparison could not detect. This change does not claim to fix those styles or establish page parity.

The local inspection saved `.parity/browser-metrics.json`, `.parity/browser-trace.zip` and screenshots in the worker clone. It blocked every request method except GET and HEAD. It sent no chat message and started no server.

## Follow-up for the orchestrator

Rerun the corrected parity workflow with `new_base=https://help.hypertask.ai/ratstack` and `behaviour=false`. Use its actual preview differences to scope the remaining visual work. Do not treat the original run as a 113-page parity pass.

The worker CLI refused both ticket reads with `plan-pick worker: no board login`. No board write or login bypass was attempted. The installed formatter needed cached dependencies because this clone has no dependency installation. No dependency pin or configuration changed.

The verifier workflow on the branch's `origin/main` uses Claude Code and no longer contains the earlier browser-trace or bugfix-repro gate. This investigation retains its local browser trace and records the URL reproduction above.

Modern Web Guidance guides read for this investigation were `html` and `lazy-load-video-and-audio`. Native lazy loading and the existing video content remain unchanged.
