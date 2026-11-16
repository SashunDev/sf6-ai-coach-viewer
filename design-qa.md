# Workbench UI — hosted Chromium QA passed / owner acceptance pending

final result: **SYNTHETIC CHROMIUM QA PASS / REAL iPHONE SAFARI + OWNER GOOGLE/YOUTUBE PENDING / MERGE HOLD**

## 2026-11-16 — GitHub-hosted browser validation (newest evidence)

Tested product/workflow commit: `f994e2bd4e5c6438bbe8bd477b19d5d4aac6c593` (the following documentation update does not modify app/test/workflow code).

- [B3 Chromium + DOM QA: SUCCESS](https://github.com/SashunDev/sf6-ai-coach-viewer/actions/runs/43851771014): pinned `npm ci`, **53/53 Node PASS**, Pages/standalone targeted Python regressions PASS, and synthetic real-Chromium browser suite PASS.
- [P4 standalone viewer QA: SUCCESS](https://github.com/SashunDev/sf6-ai-coach-viewer/actions/runs/43851771115).
- [Browser QA artifact — 5 resolutions, screenshots and geometry JSON](https://github.com/SashunDev/sf6-ai-coach-viewer/actions/runs/43851771014/artifacts/14218515952). 14-day retention; no private owner videos or OAuth credentials; UI uses mocked YouTube/Google, mock video titles and a mock iframe.
- GitHub-hosted Linux Chromium was permitted to launch. Installed `fonts-noto-cjk` before the final pass to capture actual Japanese glyphs and realistic text wrapping. Earlier agent-local `socket() EPERM` blocker is avoided for this **synthetic hosted run only**.
- Reviewed generated screenshots of entry, owner workbench, local mode, mobile library and settings at all five viewports; no obvious text-glyph boxes, horizontal clipping, seek-bar overlaps or obscured fixed controls observed. This is human review of **synthetic screenshots**, not physical iPhone or visual comparison against the original concept source.

| Viewport | Video px (W×H, approx.) | Lowest seek control Y | Horizontal overflow | Synthetic UI/geometry |
|---|---|---:|---|---|
| Mobile 375×812 | 343×193 | 558 px | none | PASS |
| Mobile 390×844 | 358×201 | 567 px | none | PASS |
| Desktop 1280×720 | 640×360 | 711 px | none | PASS |
| Desktop 1440×1024 | 838×471 | 822 px | none | PASS |
| Desktop 1366×600 | 427×240 | 591 px | none | PASS |

The Chromium runner exercised fine-seek row above seconds, directionality, all nine controls at least 44×44 CSS px, 16:9 video, desktop seek row through bottom of viewport, mobile overflow, mode choice/local/YouTube isolation, mobile tabs, settings dialog focus, and scroll reset. Captured runtime console errors **0**. Note: on 720px and 600px desktops the last seek row ends roughly **9 px** before the viewport edge; browser zoom, custom font and OS display scaling still warrant owner acceptance.

**Prior hosted attempt (diagnostic):** [B3 job failure](https://github.com/SashunDev/sf6-ai-coach-viewer/actions/runs/43851330280) reached Chromium and collected screenshots but failed a stale expectation requiring the home header to still say `LOCAL VIDEO`. Test fixed to expect `リプレイレビュー` after returning to home, without modifying functional UI; [follow-up PASS](https://github.com/SashunDev/sf6-ai-coach-viewer/actions/runs/43851493468). A subsequent Japanese-font-enabled pass above also succeeded.

**Still NOT TESTED / release gates:** actual iPhone Safari (not equivalent to Chromium mobile viewport emulation); owner Google OAuth, real unlisted video and official iframe playback; phone OS video/file-picker UX; owner screenshot/design acceptance; source-concept versus implementation fidelity. No production Pages deployment, PR merge or Draft status changes. The user earlier accepted the *older staging design*, not this PR #23 redesign.

## Historical local-environment blocker and original design notes

Source visual truth path: `/workspace/scratch/8e380c5cd6eb/generated_images/exec-78e6628e-78ca-4993-ae19-7cc2de159341.png` (the user's selected second design, 「ワークベンチ式 — 一覧と再生を行き来する」).

The selected reference is available in the design conversation; it is not a runtime asset or included in this PR.

Implementation: `index.html`, `youtube-review.mjs` on `design/workbench-ui`.

Historical note: before the hosted runs, no implementation screenshots were available. The newer CI artifact linked above contains synthetic rendered screenshots at all five viewports.

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

Historical agent-local session had no browser console coverage. The subsequent **hosted Chromium synthetic run** reported **0 console errors**. Real Safari/Google/YouTube network-console checks are still NOT TESTED.

## Comparison history

No source-reference-to-implementation pixel comparison completed. Hosted implementation screenshots were visually inspected for gross layout/overflow issues as stated above. Code review addressed an offline-export navigation trap, hidden local keyboard shortcuts affecting other modes, first-entry exposure of sample report data, and cache expiry at the mode selector. These are functional fixes, **not** visual-QA iterations.

## Required before acceptance

1. Compare the captured synthetic browser screenshots against the actual selected design source with an accessible reference image, then request Owner visual acceptance of the redesigned workbench.
2. Verify on physical PC Chrome and iPhone Safari; Chromium viewport/tab/dialog/geometry/console checks passed synthetically but do not substitute for physical device behavior.
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
