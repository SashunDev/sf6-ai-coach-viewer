# SF6 AI Coach — Real replay one-command publisher (P4-B)

Status: Implementation QA, not real-match production GO. Spec: [P4 Direct Spec](PRODUCTION_READINESS_P4.md), issue [#3](https://github.com/SashunDev/sf6-ai-coach-viewer/issues/3).

## Requirements

- Python 3.10+, `gh` (GitHub CLI authenticated with repository Release/Actions permissions), `ffprobe` on a trusted PC or agent.
- `match-id.json` and `match-id.mp4` (exact same filename stem), located **outside the Git repository**. JSON must include `schemaVersion: 1` and matching `match.id`. The MP4 must have H.264 video (AAC audio optional), and duration must agree with the report.
- The current ChatGPT GitHub connector can edit/review source but cannot directly upload binary Release assets or dispatch workflows. A trusted environment with authenticated `gh` is required for the actual publication.
- ONLY for user-approved SF6 replay media in **explicit video-linked coaching mode**. Public Release and Pages expose footage, coaching weaknesses, and opponent information to everyone. GitHub video retention ~14 days (not guaranteed exact), public JSON without automatic expiry.
- Each video must fit the Pages budget 800,000,000 bytes. Persistent reports are limited to 2,000 JSON files and 50MB total. No new infrastructure or paid service.

## First, safe dry-run preflight (no changes)

```bash
python3 scripts/publish_match.py \
  --report /private/match-20261011-001.json \
  --video /private/match-20261011-001.mp4
```

Checks report structure, ID/filenames, codec/duration, public Release asset inventory, collisions, and mirror budgets. Requires `gh` authentication even in dry-run to inspect existing assets.

## Then publish in one command

```bash
python3 scripts/publish_match.py \
  --report /private/match-20261011-001.json \
  --video /private/match-20261011-001.mp4 \
  --apply
```

`--apply` is an explicit publication operation: uploads both assets to dedicated public Release `sf6-ai-coach-media`, triggers existing `pages-video-site.yml`, checks successful build **and** deploy, then downloads both Pages assets to calculate and compare exact SHA-256, HTTP 200 and MIME. The stable `#id=match-id` URL is printed **only when verification completes**. Video and coaching JSON are NOT committed to Git.

The Release retention workflow removes only videos (~14d; 2GB trigger / 1.8GB trim). JSON persists and remains readable via `reports/match-id.json` even when MP4 expires. A previously downloaded HTML/video copy is not deleted by the retention rule.

## Collisions, correction and recovery

- If this match ID already exists, normal `--apply` fails before any upload. Never overwrite video. Use a new match ID for different footage.
- Partial upload from a previous run: `--apply --resume` verifies existing Release asset(s) byte-for-byte against local input, and uploads only what is missing.
- Explicit **JSON-only correction**, with unchanged video: `--apply --replace-report --backup-dir /private/backups`. Both assets must already exist. The publisher verifies original video SHA and makes a local backup of the old JSON before `--clobber`. If the existing JSON is identical it returns without modifying it.
- Build/deploy or HTTP failure is **not E2E PASS**. Inspect GitHub Action status and Release asset names before retry. Use the standalone HTML `scripts/build_standalone_report.py` as a local fallback.
- Upstream GitHub API errors or concurrent deployment runs are treated as uncertain, not success. The current live site remains in place on a failed Pages build.

## Review Gate

1. CI on proposed code: `python3 -m unittest discover -s tests -p 'test_publish_match.py' -v`, plus synthetic real-H.264 codec preflight; tests do **not** use credentials or publicly upload footage.
2. Authenticated real Alex-versus-Terry release upload and independent HTTP verification of Pages JSON+MP4. Record only text Evidence; don't commit the actual video to Git.
3. Single-link iPhone Safari test: auto-loaded correct footage + coaching JSON, scene seek, clips, loop, playback. Safari may still require pressing Play. No file selection in normal flow.
4. When video is absent or expired, JSON must remain and local file fallback must be available.

Only ChatGPT Direct Review plus actual live HTTP/iPhone results can result in P4-C Formal GO. CI source-level PASS does not imply media publishing or real user-browser E2E success.

Privacy reminder: public footage may be copied before 14-day deletion, which cannot revoke copies outside repository control.
