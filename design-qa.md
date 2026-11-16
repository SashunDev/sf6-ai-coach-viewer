# Workbench UI — review pending

final result: blocked

Source visual truth path: `/workspace/scratch/8e380c5cd6eb/generated_images/exec-78e6628e-78ca-4993-ae19-7cc2de159341.png` (the user's selected second design, 「ワークベンチ式 — 一覧と再生を行き来する」).

The selected reference is available in the design conversation; it is not a runtime asset or included in this PR.

Implementation: `index.html`, `youtube-review.mjs` on `design/workbench-ui`.

Implementation screenshot path: unavailable. No rendered screenshot of this implementation was obtained.

## Blocking evidence

- The local preview started with `sites-preview start` and returned HTTP 200 inside its command environment.
- The Cloud Browser at `http://terminal.local:4173/` displayed `upstream connect error or disconnect/reset before headers. reset reason: connection termination`.
- The installed Chromium regression runner could not start its browser: `socket() failed: Operation not permitted` (process singleton). Its layout assertions are **not validated** here.
- A proposed temporary self-contained file preview was rejected by the browser URL policy (only HTTP/HTTPS allowed). No further attempt to bypass that restriction was made.

## Intended viewports and state

Desktop: 1440 × 1024 CSS px, and compact 1280 × 720 / 1366 × 600. Mobile: 390 × 844 and 375 × 812 CSS px. Intended state is a selected owner replay, with cached library, paused player, and optional memo. Authentication, media and images in the visual reference are illustrative; no real owner credentials or replay were used for this change.

Reference source pixels: 1536 × 1024. It is a concept board with multiple app frames, not a single viewport capture. Implementation pixels/density normalization: unavailable. Full-view and focused-region comparisons are blocked; separate source viewing or code inspection is not a visual comparison.

## Fidelity surfaces

| Surface | Implementation intent | Verification |
|---|---|---|
| Fonts / typography | Existing Japanese system fonts, readable body text, compact headings | Browser appearance, wrapping and optical sizes pending |
| Spacing / layout | Desktop library / player / memo columns; mobile player with switchable memo / library; 44px minimum seek targets | Source reviewed, viewport geometry and touch behavior pending |
| Colors / tokens | Existing navy, lime and cyan tokens | Actual contrast and compositing pending |
| Images / assets | Real official player and API thumbnails at runtime; no concept-board character artwork in the product | Actual replay, crop and player sizing pending |
| Copy / content | Mode-specific content; approximate F labels; manual ChatGPT handoff; explicit guest-link sharing | DOM behavior and copy verified; visual truncation pending |

## Functional checks completed

- Node: 53 passing tests, including eight DOM behavior regressions (jsdom, no layout engine or real Google/YouTube access).
- Python: 125 passing tests, including Pages packaging, standalone exports and existing report workflows. PyNaCl was installed only into a scratch test-dependency directory to run the existing suite.
- Mode entry remains first even with a saved library; expired metadata is purged without initiating authentication.
- Selected replay, API time and memo survive mobile panel switches and navigation through home / local mode.
- Explicit sharing contains only one video ID and whole-second time. Clipboard failure exposes the manual handoff field.
- Initial consent, token reuse for refresh, revocation, cache deletion and existing URL validators remain covered with synthetic data.
- Syntax checks and `git diff --check` pass.

Browser console errors checked: **not completed**; there was no successful rendered implementation session. jsdom emitted no execution errors in the behavioral fixtures; this is not a browser-console pass.

## Comparison history

No visual comparison completed. Code review addressed an offline-export navigation trap, hidden local keyboard shortcuts affecting other modes, first-entry exposure of sample report data, and cache expiry at the mode selector. These are functional fixes, **not** visual-QA iterations.

## Required before acceptance

1. Open the actual branch in a working local HTTP preview; compare entry, selected-video workbench and local report states against the reference.
2. Verify PC and iPhone Safari layouts, all touch targets, keyboard / dialog focus, pane switching, scroll position and browser console.
3. With the owner's existing authorized environment, check real Google connection, cached revisit / refresh, three owned videos, pause / approximate seeking, manual copy and an anonymous friend link.
4. Capture source + implementation comparisons and resolve P0/P1/P2 issues. Replace this blocked report with measured evidence before visual acceptance or production merge.

No production merge, staging deployment, or release was performed.


## PR #23 corrective review — 2026-11-16 JST

Review: https://github.com/SashunDev/sf6-ai-coach-viewer/pull/23#pullrequestreview-5918139640
Pre-correction head: `c7f8c3a17f7118896557a37ebfafa4c8125ac1ea`.
Base: `feature/issue-18-youtube-review` / `ba21d615f4919fd5d00607d5f45aac949eba08b2`.

| Finding | Change | Result |
|---|---|---|
| P1-1 fine seek above seconds | DOM places `.seek-fine` before `.seek-seconds`; existing column-flex toolbar preserves this order. Pause remains centered in seconds row. Approximate time offsets are unchanged. | DOM test PASS; actual visual order NOT TESTED |
| P1-2 browser screen QA | Requested five-size runner attempted. Chromium cannot create its process singleton socket (EPERM). No screenshot obtained. | BLOCKED |
| P2-1 discoverable recovery | Embed/API startup errors reveal a hidden-by-default direct MP4 button beside playback status, outside settings. New selection/ready/clear hides it. Picker navigates to local and retains video/time/note/cache/token; deactivation attempts to pause even a not-ready/error player. | Synthetic error → file picker → return → token reuse test PASS; real browser picker NOT TESTED |
| P2-2 layout regressions | Runner checks fine-row bottom above seconds-row top, all backward/forward pairs, all nine controls ≥44×44, aspect ratio, PC player + ALL control bottoms inside viewport, mobile overflow, five-size mode/tab/dialog/focus/scroll flows. Captures screenshots, geometry JSON and console exceptions/errors when it can run. PC player height reserve increased from 300 to 360px to leave space for both rows in compact windows. | Syntax PASS; browser execution BLOCKED before layout checks |

### Current browser attempt and evidence

Command: `CHROME_BIN=/usr/bin/chromium SF6_QA_DIR="$PWD/docs/qa/pr23" npm run test:browser`.
The first attempt encountered a Node/undici local HTTP parsing assertion. The runner's loopback control requests were changed to Node's built-in `http.request` (proxy configuration unchanged). On the subsequent attempt the HTTP server became reachable but Chromium aborted with `socket() failed: Operation not permitted (1)` in `process_singleton_posix.cc`. The runner exited 1 at new-tab acquisition. No further browser workaround, alternate browser surface or escalation was attempted.

- [Browser invocation / failure](docs/qa/pr23/browser-test.log)
- [Chromium startup diagnostic](docs/qa/pr23/browser-startup.log)
- [Node tests: 53 PASS](docs/qa/pr23/node-tests.log)
- [Python suite / packaging builds: 125 PASS](docs/qa/pr23/python-tests.log)

| Target | Rendering / screenshots | Controls / bounds / overflow | Mode / tabs / dialog / keyboard / scroll | Browser console |
|---|---|---|---|---|
| iPhone-size 375×812 | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| iPhone-size 390×844 | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| PC 1280×720 | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| PC 1440×1024 | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| PC 1366×600 | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |

The runner uses Chromium viewport emulation, not physical iPhone Safari. Even a future runner PASS does not prove Safari or real Google/YouTube video behavior. No fabricated screenshot or previous/source image is substituted as implementation evidence. No geometry JSON was produced because startup failed.

Build checks: existing Pages builder and canonical standalone HTML tests run actual packaging on synthetic/mocked inputs in the 125-test Python suite; this is not a live Release fetch or deployment. JavaScript syntax, Python compile and `git diff --check` PASS. No OAuth/client/cache/seek-core/guest-route implementation, secret, owner data or production state was changed.

**Status: BLOCKED / MERGE HOLD / Draft maintained.** Code changes are ready for independent source re-review; P1-2 and the execution/visual portions of P1-1/P2-2 remain unresolved until a permitted browser environment is available.
