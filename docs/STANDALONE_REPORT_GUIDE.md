# SF6 AI Coach — Standalone HTML report generator

This script generates **a single local HTML** with the existing GitHub Pages layout and controls, with both validated coaching JSON and same-match MP4 preloaded. It is an offline fallback when Release/Pages publishing is unavailable. The script **does not** upload or save videos to GitHub, and should be run only on approved SF6 match footage.

## Requirements

- Python 3.10+ (standard library; no pip packages).
- Existing repository \`index.html\` is used as the canonical layout; do **not** maintain a separate viewer fork.
- One validated schemaVersion=1 report including \`match.id\` (ASCII letters/numbers, hyphen, underscore), events and video duration.
- A matching \`<match.id>.mp4\` containing H.264 video. H.264 verification and duration comparison use ffprobe when available; without ffprobe the MP4 header is checked but playback compatibility is **not** independently assured.
- Standalone video maximum 250 MiB due to single-HTML memory overhead. Larger footage should use the public streaming viewer and local-file fallback.

## Build

\`\`\`bash
python3 scripts/build_standalone_report.py \
  --report ./private/sf6-alex-terry-recoach-20261011.json \
  --video ./private/sf6-alex-terry-recoach-20261011.mp4 \
  --out ./out/alex-terry-coaching.html
\`\`\`

Ensure the JSON is saved under the same basename as its \`match.id\` and the MP4. No user footage, generated bundles or per-match report JSON should be committed to the repository.

Open the HTML on a device/browser that supports Blob video URLs. The match report and video initialize automatically. iPhone Safari may still require one tap **to start playback**; this is different from selecting/uploading a file. Scene cards, seeking, speed and clip loop use the original viewer logic.

## Acceptance and limits

- Test command: \`python3 -m unittest discover -s tests -p 'test_standalone_report.py' -v\`.
- Pull requests run \`P4 Standalone viewer QA\` with real canonical \`index.html\` and a synthetic generated H.264 video when ffmpeg is available. Do not store real footage as a fixture.
- The JSON is escaped against \`</script>\` insertion, and a malformed video/ID/event list fails before writing the bundle. Output is written through a temporary path before replacement.
- HTML contains a base64-encoded copy of the complete video. File size is ~1.33x video size plus markup. The downloaded copy remains on the user device **after** any public GitHub Release video expiry. Treat it as a private recording and delete it locally if no longer needed.
- Generated HTML disables parsing external \`#id=\` and \`#r=\` fragments so it cannot silently replace the embedded report with a different match. Online index.html remains unchanged and backwards compatible.
- If native JS/Blob decoding fails, the viewer surfaces an error and still permits manual local video selection; this does **not** count as successful auto-load.
- Gate: automated QA PASS => PASS candidate. Formal acceptance requires a real match and Safari video autoplay-independent manual playback, seek, clip and loop checks. The P4-B public publishing flow is a **separate** Issue #3.
