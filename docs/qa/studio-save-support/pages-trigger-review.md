# PR #26 — Pages push trigger correction

Date: 2026-11-17 JST. Refs #25. Direct Review: [5938401535](https://github.com/SashunDev/sf6-ai-coach-viewer/pull/26#pullrequestreview-5938401535).

Start/review HEAD: `44b7e7003fae2ba5c703f3ad82fb720b03daf7f7`.
Latest main/base at start: `937f3e143c02838ab0ca4e43666d3ddc0761d31f`.
Branch: `feature/studio-save-support`; starting working tree clean; no intervening head changes. Repository and ancestor AGENTS.md files were absent. Issue #25 OPEN / PR #26 OPEN and Draft confirmed.

## Scoped correction

- Add only `youtube-studio-support.mjs` to production Pages `on.push.paths`.
- Preserve all previous 25 entries and every other workflow setting; new total 26.
- Add one dependency-free test to `tests/test_pages_build.py`: the Studio helper must remain in `SITE_FILES`, and every published `.mjs` must have an explicit entry in this workflow's existing push-path block. This checks the current explicit-list contract; it is not a general YAML parser or GitHub glob interpreter.
- No UI, copy/title logic, OAuth, cache, sharing, playback, seek, local reviewer, or deployment job changes.

## Local verification

| Check | Result |
|---|---|
| Regression before workflow fix | Expected FAIL, solely missing `youtube-studio-support.mjs`; 28 tests / 1 failure |
| `python3 -m unittest discover -s tests -p 'test_pages_build.py' -v` after fix | 28 PASS, including mocked Pages builds |
| `npm test` | 58 PASS / 0 FAIL |
| `PYTHONPATH=/workspace/scratch/8e380c5cd6eb/python-test-deps python3 -m unittest discover -s tests -p 'test_*.py' -v` | 126 PASS; includes Pages and standalone packaging on synthetic/mocked inputs |
| Workflow YAML parsing | PyYAML 6.0.3 BaseLoader parses all workflow files; preserves YAML `on` as a string key |
| Parsed workflow comparison with start HEAD | Existing paths retained; exactly the new module added; all remaining parsed settings identical |
| Packaging manifest | `youtube-studio-support.mjs` remains in `SITE_FILES` (new regression assertion) |
| `git diff --check` | PASS |

The initial full Python invocation without the existing external test dependency path failed to import two unrelated Dropbox test modules (`nacl` missing). With that already-installed dependency directory on PYTHONPATH, the full suite passes; no repository dependency or unrelated source was changed.

Final exact-head B3/B4 run URLs, outcomes and re-review request are recorded in the [PR #26 conversation](https://github.com/SashunDev/sf6-ai-coach-viewer/pull/26). A PR CI run is not a production Pages deployment. No production workflow is manually dispatched, no main merge is performed, and Draft/Issue state remain unchanged.

## NOT TESTED / pending Owner Acceptance

Physical iPhone dialog operation, Studio app routing, Studio search success, actual MP4 save, and ChatGPT attachment remain NOT TESTED. No staging deployment is part of this P2 correction. Live main-push production deployment is intentionally not executed; validation covers the configured trigger and build/CI regressions. Independent ChatGPT Direct Re-Review and later isolated staging Owner Acceptance remain separate gates.
