# Mode-first replay workbench

The user selected the second visual direction (「ワークベンチ式」) in the design conversation. This change implements that responsive layout in the existing static viewer; it does not replace the playback/authentication stack with a new app framework.

## User flow

| State | Visible content |
|---|---|
| Plain visit, including a cached revisit | Local video / YouTube mode choice |
| Local | Local file + report loading, existing timeline / scene review / clip / loop / speed; report summaries appear only after loading a report |
| YouTube on PC | Searchable library, official player + approximate seek controls, optional memo |
| YouTube on iPhone | Library first; after selection, player + controls followed by memo / library tabs |
| Connection / storage | Explicit dialog containing the existing consent, public Client ID configuration, storage opt-in, deletion and revoke controls |
| Sharing | Explicit dialog; one-video, time-only guest link; separate OAuth-free `youtube-share.html` |

Navigation pauses playback and aborts in-flight library requests but retains the selected video, time, memo and in-memory connection in the current tab. Explicit clear / revoke still erases the appropriate state. No new persistent keys are introduced. Metadata cache limits and original synchronization time are unchanged. A plain visit purges expired cache without displaying it or starting authentication. Existing report deep links open local mode directly.

The local export builder removes the mode selector and external YouTube mode, preserves strict offline CSP, and opens local review directly. The Pages builder packages the guest route as well as the existing owner modules. `youtube-library-core.mjs`, `youtube-library-cache.mjs`, and `youtube-seek-core.mjs` are unchanged.

## Dependencies and scope

- Based on Draft PR #19 (`feature/issue-18-youtube-review`, baseline `ba21d615f4919fd5d00607d5f45aac949eba08b2`). Target this PR at that branch to keep the UI diff reviewable.
- Guest HTML / module and parser tests are copied byte-for-byte from Draft PR #21 (`cd026a41ffa9127f35621759e549fe1551aaa15d`). They remain a separate review dependency; this does not approve either predecessor for production.
- `npm run dev -- --host 0.0.0.0 --port 4173 --strictPort` is a dependency-free Python static preview, not a production backend. Production remains GitHub Pages.
- `npm ci && npm test` runs pure/static/DOM regressions. jsdom is a development-only dependency. `npm run test:browser` invokes the existing Chromium runner; it requires a compatible browser and permitted local sockets (set `CHROME_BIN` if needed).
- No new CI workflow, cloud service, scopes, paid API, or deployment is added.

## Validation status

51 Node tests and 125 Python tests pass. Real browser rendering, viewport geometry, browser-console inspection, real OAuth / video playback and iPhone Safari acceptance are pending. See the project-root `design-qa.md`; its result is **blocked**, so this is a reviewable Draft, not a visually accepted release candidate.
