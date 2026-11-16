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

- Node: 51 passing tests, including six new DOM behavior regressions (jsdom, no layout engine or real Google/YouTube access).
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
