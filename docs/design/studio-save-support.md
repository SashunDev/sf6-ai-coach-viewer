# YouTube Studio保存補助 — Issue #25

Base: `937f3e143c02838ab0ca4e43666d3ddc0761d31f` (latest main at start). No repository or ancestor AGENTS.md was present. All Issue/PR titles and Studio-related matches were checked; no equivalent feature was found. #19/#21/#23 are merged; existing branches/PRs are untouched.

## UX and scope

Uses the existing workbench dialog style. A selected-video-only header action opens a dialog with the current title, suggested search keyword, independent copy actions and a plain HTTPS Studio link. On narrow screens header actions occupy their own row; the player and fine/seconds toolbar markup/order are unchanged. No new fonts, icons, raster art or design framework is needed.

A valid leading YYYY-MM-DD HH:mm is a suggestion; otherwise the entire title is used. Invalid/empty/non-string values safely yield no copy action. Readonly fields use DOM values, not HTML interpretation. Failed clipboard writes focus/select the appropriate field; stale async copy results do not overwrite feedback for a different selected title. Opening/copying/closing does not call any playback, seek, OAuth, fetch or storage operation. Native dialog Escape/focus restoration and the existing close handler are used.

Only `https://studio.youtube.com/` is opened, with noopener/noreferrer. The title/ID/search/notes never enter its URL. No custom scheme, edit URL, Studio automation, stream extraction or new persistent key/scope/backend is introduced. The helper module is included in Pages packaging; the entire owner-only panel is still removed from offline HTML by the existing export builder. Local review and guest viewer implementations are untouched.

## Official guide / limitations

Checked 2026-11-17: https://support.google.com/youtube/answer/56100?co=GENIE.Platform%3DiOS&hl=ja . Official iOS Studio instructions describe Content, Shorts/Videos and the selected video's menu → Save to device. The dialog keeps guidance conditional because app UI and availability differ. It does not promise keyword search success, app opening, a specific destination screen, file saving or ChatGPT attachment. Physical iPhone/app search/save remains Owner Acceptance.

## Verification

- Local Node: 58 PASS; pure helper cases and synthetic DOM dialog/copy/state-preservation/security regressions.
- Local Python: 125 PASS; includes actual Pages/standalone packaging tests on synthetic inputs.
- Syntax and git diff --check: PASS.
- Local Chromium: BLOCKED at startup, process singleton socket EPERM. No local screenshots/geometry/console PASS is claimed. Logs: ../qa/studio-save-support/.
- Extended existing Chromium runner for 375x812 / 390x844 / 1280x720 / 1440x1024 (also existing 1366x600): dialog bounds, horizontal overflow, 44px buttons/link, copy feedback, Escape/focus restoration, no selected video/time/play-state change. Existing seek/share/local regressions retained.
- Hosted Chromium on `a62938b68877435c1281d8a4b13fc208e6f4816f`: all five viewport flows PASS, zero captured console errors. B3 SUCCESS: https://github.com/SashunDev/sf6-ai-coach-viewer/actions/runs/44077015058 ; B4 guest SUCCESS: https://github.com/SashunDev/sf6-ai-coach-viewer/actions/runs/44077015062 . B3 includes 58 Node tests and 37 targeted Python packaging/regression tests. No workflow or deployment changes.
- First CI attempt on `614b438` failed the Escape/focus assertion. The opener now explicitly receives focus before native showModal, and the browser test waits for asynchronous native closing. The subsequent run above passes. Initial failure remains visible at https://github.com/SashunDev/sf6-ai-coach-viewer/actions/runs/44076319590 .
- Screenshots were downloaded and visually inspected at mobile 375/390 and desktop 1280/1440 (plus compact 1366). Mobile header actions wrap above the player without changing seeks. Dialogs use bounded vertical scrolling; the full guide requires scrolling on short screens. No horizontal clipping found. Artifacts: `pr23-workbench-browser-qa` (existing workflow name), 14-day retention. Relevant files: `WIDTHxHEIGHT-studio.png`, `-review.png`, `layout-results.json`.
- Final evidence-only extension also records dialog geometry/scroll measurements, screenshots of the guide, Tab containment, and both Escape/button-close focus restoration. The exact final HEAD CI links and independent review request are maintained in Draft PR #26.

No production merge or deployment is authorized by this change.
