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
- Existing B3 GitHub Actions workflow already runs npm test + this browser runner and uploads screenshots/geometry/logs. No new workflow or deployment changes. CI outcome and artifact links will be recorded in the Draft PR review request. Before CI completes, status is HOLD.

No production merge or deployment is authorized by this change.
