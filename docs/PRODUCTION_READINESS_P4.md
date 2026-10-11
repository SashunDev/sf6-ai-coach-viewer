# SF6 AI Coach — Production Readiness / P4 Direct Implementation Spec

Status: **DESIGN GO / IMPLEMENTATION PENDING** (2026-10-11). Scope: only `SashunDev/sf6-ai-coach-viewer`. This is an implementation handoff, **not** a claim that live replay end-to-end publishing already works.

## User-approved product contract

A video-linked coaching request should result in an existing-layout viewer that **opens with the correct video and validated coaching JSON already selected**. User-approved Alex vs Terry embedded-HTML layout is the fallback reference, not a replacement for the existing `index.html` UI.

- Main path: public Pages `https://sashundev.github.io/sf6-ai-coach-viewer/#id=<match-id>`, with `reports/<match-id>.json` + `media/<match-id>.mp4` auto-loaded.
- Fallback path: one downloadable standalone HTML embedding report JSON + playable MP4, **without** file-picker steps or another visual layout. No network needed after download. Do not silently substitute the simulation scene.
- Keep official `index.html` layout, scene cards, markers/seek, clip playback/loop, speed control, and responsive iPhone layout; preserve `#r=` legacy links, JSON import, and video selection for recovery.
- User's normal input remains one trimmed match replay. Public upload requires the previously approved **explicit video-linked coaching mode**, never ordinary coaching, private recordings or another project.
- No new Notion DB. Notion session/memory remains coaching authority; JSON is a display artifact and one match is one Evidence.

## P4-A — Production-grade standalone fallback (Priority 1)

Implement `scripts/build_standalone_report.py` plus `tests/test_standalone_report.py` (names indicative; stable CLI and docs required).

**Inputs:** validated schemaVersion=1 coaching JSON, same-match H.264/AAC MP4 (when possible for Safari), existing `index.html` template; explicit output path. The program may be invoked locally by the assistant or implementation agent using a downloaded GitHub template. **Do not store source MP4, rendered frames, or a generated HTML with embedded video in Git history, Pages, or Notion.**

1. Reuse canonical `index.html` DOM/CSS/JS. Avoid a parallel bespoke viewer and avoid changing the production page just for standalone packaging. Load the supplied JSON using the existing report validation and DOM flow.
2. Embed the MP4 in the **local HTML artifact** as base64 and initialize the existing player via a Blob/File object URL. Decode in bounded chunks so Safari does not need a single large `atob` allocation. Initialize once, display a useful error when video decoding fails, and preserve normal play/seek/loop/scene navigation. Do not require autoplay (iOS gesture restrictions).
3. Strip/override the Pages `#id=` / `#r=` bootstrap **only in the generated file** so a stale fragment cannot silently switch to a different match. Original `index.html` is unchanged.
4. Validate match score, event order/ranges, duration, required string fields, and the same-match identifier; reject rather than fabricate missing data. Where ffprobe is available, check MP4 length against report duration with an explicit small tolerance. Validate exported data against the viewer schema and verify byte-for-byte MP4/JSON round trips.
5. Explicitly state that this standalone HTML is persistent on the recipient device; the **14-day GitHub Release retention does not delete a downloaded copy**.
6. Require no third-party CDN, online fetch, new dependency, credential, or user's manual JSON/video selection. Keep fallback local-only without automatically uploading game footage.
7. If generating a large file fails, return separately usable report JSON + MP4 and precise failure; do not claim a complete standalone bundle.

**Acceptance:** fixture/unit tests for good pairing, invalid JSON, mismatched id, duration mismatch, injection safety (`</script>` escaping), startup initializing report+video, no remote fetch, no layout loss and no accidental commit of binary. A real Alex-vs-Terry 173.4s/1–2 fixture may be checked **during this single current task only**, not committed or retained as regression media. Validate in desktop browser and iPhone Safari when accessible. PASS candidate until independent Direct Review; do not call production validated from source inspection alone.

## P4-B — Single-command Release/Pages publisher (Priority 1)

Implement a documented `scripts/publish_match.py` or equivalent command, accepting `--report <id>.json --video <id>.mp4 [--match-id <id>]`, using the user's pre-authenticated `gh` or narrowly scoped GitHub CLI/API. Never log auth tokens or store credentials in repo. **Do not request new paid infrastructure.**

1. Dry-run preflight: schema/byte limits, matching ids and names, supported MP4 codec/container, public-data warning (game replay/report and opponent/weakness data are accessible to anyone), existing release asset collision check. Default collision = FAIL, explicit `--replace-existing` only for a deliberate report correction. Never silently overwrite footage.
2. Publish both assets to the existing dedicated Release `sf6-ai-coach-media`, **not Git commits**. JSON persists; MP4 subject to existing 14-day cleanup, 2,000MB/1,800MB capacity policy.
3. Trigger the **existing** `pages-video-site.yml` workflow with deploy true after both uploads (or reliably invoke existing deploy process), check successful build+deploy and verify same-ID Pages JSON/MP4 by HTTP status, MIME, sha256 when feasible, and playable duration. No hypothetical success result.
4. Output the stable `#id=<match-id>` link only after both assets are publicly available. If JSON is available but MP4 is not mirrored owing to 800MB or age, report **report-only / video unavailable** with fallback, not E2E PASS.
5. Avoid long base64 tokens in manually entered GitHub Actions UI, and avoid storing a video in workflow logs, issue comments, commits, or GitHub Pages artifacts beyond the existing live retention policy.
6. Avoid accidental publication in normal coaching. Require an explicit video-linked operation, but do not ask for duplicate approval on a previously authorized replay.

**Reality check:** the currently connected ChatGPT GitHub tool can edit text and read Releases, but it has **no Release binary asset-upload action and no workflow-dispatch action**. Therefore an assistant cannot truthfully claim the end-to-end public publish solely through that connector. A one-command authenticated local/agent publisher is an implementable fallback, not unattended ChatGPT-to-GitHub automation. If fully automatic asset upload becomes available later, integrate via the same preflight and validation without broadening privileges.

## P4-C — Real-match E2E and product acceptance (Priority 1)

Use exactly one existing user-approved Alex vs Terry coaching report/video pair with a matching id; no new session and no duplicating Notion Evidence.

- Verify report validated, real MP4 duration and H.264 compatibility; review that observations, R3 stun/SA3 and Terry 2MP correction appear as recorded, with **user-confirmed** rather than independently verified exact damage.
- Verify Pages `reports/<id>.json` and `media/<id>.mp4` return 200, valid MIME, id pair, and matching checksums after deployment.
- On iPhone Safari, open ONLY the `#id=<id>` link: auto-load correct fight footage+JSON; seek markers and scene cards; clip and loop; general playback; no manual file selection. Confirm expected non-autoplay is not mistaken for missing video. Check error fallback with missing/expired MP4 and persistence of JSON.
- No claim of production Formal GO before actual mobile E2E. Synthetic `#id=` PASS is separate and already achieved.

## Gates and responsibilities

- **ChatGPT / AI Project Manager:** Direct Spec, architectural decision, actual GitHub PR diff + code/test/Evidence Direct Review, formal GO/HOLD/CORRECTIVE determination, Notion rule consistency.
- **Codex / Claude Code:** narrow implementation, tests and evidence, code commits/push; stop at `PASS candidate / Review Pending`. Do not merge on an implementer-only PASS claim.
- P4-A and P4-B can be implemented separately; avoid changing existing JSON schema or the published viewer's behavior without explicit SPEC CHANGE.
- **Existing P1–P3 analysis gates** remain intact, including previous user correction (Terry 2MP after guarded wake-up Drive Reversal; missed stun SA3 lethal is user-confirmed, not independently damage-verified).

## Known operational gap / separate corrective

The dedicated Release description currently says "JSON is not stored here" while a JSON asset **is** present and the approved current policy retains JSON. Update the Release description when a write mechanism is available; do not infer policy from the stale body.

## Rollback

- P4-A is additive; deleting only its script and tests returns previous behavior. Existing online `index.html` must remain byte-identical if P4-A alone is implemented.
- P4-B uses already established Release and Pages workflows. Failed preflight must not mutate Release assets. On publishing/deploy failure, retain prior published site and provide downloadable standalone fallback; never delete reports as automatic recovery.
