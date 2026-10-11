#!/usr/bin/env python3
"""Generate an offline, canonical-layout SF6 AI Coach viewer with JSON and MP4 embedded.

Only the resulting local HTML contains footage. Never commit match-specific files.
The HTML remains on the recipient's device after any GitHub video retention period.
"""
from __future__ import annotations

import argparse
import base64
import json
import re
import shutil
import subprocess
from pathlib import Path

MATCH_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$", re.ASCII)
REPORT_TAG = re.compile(r'(<script id="coach-report-data" type="application/json">)(.*?)(</script>)', re.DOTALL)
BOOTSTRAP = (
    "renderReportMeta();choose(0,false);refresh();\n"
    "void loadReportFromHash();\n"
    "window.addEventListener('hashchange',()=>void loadReportFromHash());"
)
MAX_JSON = 1024 * 1024
MAX_VIDEO = 250 * 1024 * 1024


def valid_text(value: object, maximum: int) -> bool:
    return isinstance(value, str) and bool(value.strip()) and len(value) <= maximum


def validate_report(data: object) -> dict:
    if not isinstance(data, dict) or type(data.get("schemaVersion")) is not int or data["schemaVersion"] != 1:
        raise ValueError("schemaVersion=1 required")
    match, coach, events = data.get("match"), data.get("coaching"), data.get("events")
    if not isinstance(match, dict) or not isinstance(coach, dict) or not isinstance(events, list) or not 1 <= len(events) <= 40:
        raise ValueError("Invalid match/coaching/events (1-40)")
    ident = match.get("id")
    if not isinstance(ident, str) or not MATCH_ID.fullmatch(ident):
        raise ValueError("Valid ASCII match.id required for video pairing")
    for field, limit in (("self", 60), ("opponent", 60), ("mainFocus", 140),
                         ("analysisMode", 40), ("style", 70)):
        if not valid_text(match.get(field), limit):
            raise ValueError("Invalid match." + field)
    if not isinstance(match.get("mainFocusNote"), str):
        raise ValueError("Invalid match.mainFocusNote")
    for field in ("scoreSelf", "scoreOpponent"):
        if type(match.get(field)) is not int or not 0 <= match[field] <= 9:
            raise ValueError("Invalid match." + field)
    duration = match.get("durationSec")
    if type(duration) not in (int, float) or not 0 < duration <= 86400:
        raise ValueError("Invalid video duration")
    for field, limit in (("summary", 2200), ("primaryTheme", 1200)):
        if not valid_text(coach.get(field), limit):
            raise ValueError("Invalid coaching." + field)
    if coach.get("secondaryTheme") is not None and not isinstance(coach["secondaryTheme"], str):
        raise ValueError("Invalid secondaryTheme")
    seen = set()
    prev = -1.0
    for event in events:
        if not isinstance(event, dict) or not valid_text(event.get("id"), 20) or event["id"] in seen:
            raise ValueError("Invalid/duplicate event id")
        seen.add(event["id"])
        if not isinstance(event.get("round"), str) or not re.fullmatch(r"ROUND [0-9]{2}", event["round"]):
            raise ValueError("Invalid round")
        if event.get("category") not in ("good", "review"):
            raise ValueError("Invalid event category")
        start, end = event.get("start"), event.get("end")
        if type(start) not in (int, float) or type(end) not in (int, float) or not 0 <= start < end <= duration or start < prev:
            raise ValueError("Invalid event timestamps")
        prev = start
        for field, limit in (("tag", 30), ("title", 110), ("short", 280),
                             ("observed", 900), ("judgment", 1000), ("action", 900), ("success", 900)):
            if not valid_text(event.get(field), limit):
                raise ValueError("Invalid event." + field)
    return data


def inspect_video(path: Path, expected_duration: float) -> None:
    if path.suffix.lower() != ".mp4" or path.stat().st_size > MAX_VIDEO:
        raise ValueError("MP4 required; standalone output limited to 250 MiB video")
    with path.open("rb") as file:
        header = file.read(32)
    if len(header) < 12 or header[4:8] != b"ftyp":
        raise ValueError("Invalid MP4 ftyp header")
    probe = shutil.which("ffprobe")
    if not probe:
        return  # codec/duration not independently verified without ffprobe
    result = subprocess.run(
        [probe, "-v", "error", "-show_entries", "format=duration:stream=codec_name,codec_type",
         "-of", "json", str(path)],
        capture_output=True, text=True, timeout=20, check=False,
    )
    if result.returncode:
        raise ValueError("ffprobe failed to inspect MP4")
    parsed = json.loads(result.stdout)
    video = [s for s in parsed.get("streams", []) if s.get("codec_type") == "video"]
    if not video or video[0].get("codec_name") != "h264":
        raise ValueError("H.264 MP4 required for Safari compatibility")
    actual = float(parsed.get("format", {}).get("duration") or 0)
    if abs(actual - expected_duration) > max(2, expected_duration * .02):
        raise ValueError("MP4 duration does not match report duration")


def safe_json_script(data: dict) -> str:
    return (json.dumps(data, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
            .replace("&", "\\u0026").replace("<", "\\u003c")
            .replace(">", "\\u003e").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029"))


EMBEDDED_LOADER = r"""
// Standalone-only bootstrap. Use the canonical viewer's existing local-video pathway.
async function loadEmbeddedMatch() {
 try {
  const element=document.getElementById('embedded-video');
  const base64Text=element.textContent.trim(), parts=[];
  // Keep each atob allocation small. Chunk is divisible by 4.
  for(let i=0;i<base64Text.length;i+=65536){
   const decoded=atob(base64Text.slice(i,i+65536));
   const bytes=new Uint8Array(decoded.length);
   for(let j=0;j<decoded.length;j++)bytes[j]=decoded.charCodeAt(j);
   parts.push(bytes);
  }
  element.textContent='';
  const file=new File(parts, report.match.id+'.mp4', {type:'video/mp4'});
  parts.length=0;
  setVideoFile(file); // video is loaded, never auto-played (iOS user gesture required)
  safeText($('#reviewFootnote'),'動画とJSONはこのHTMLに内蔵されています。外部送信しません。');
 }catch(err){
  safeText($('#fileStatus'),'動画の自動読込に失敗: '+String(err?.message||err).slice(0,140));
  toast('動画の自動読込に失敗しました。端末内動画を選択できます。');
 }
}
"""


def build(template: str, report: dict, video: bytes) -> str:
    if template.count(BOOTSTRAP) != 1 or len(REPORT_TAG.findall(template)) != 1:
        raise ValueError("Canonical index.html changed: report/bootstrap markers not unique")
    if "function setVideoFile(file)" not in template or "function verifyReport(data)" not in template:
        raise ValueError("Canonical viewer local-video/JSON validation unavailable")
    result = REPORT_TAG.sub(lambda match: match.group(1) + safe_json_script(report) + match.group(3), template, count=1)
    runtime = "<script>\n(()=>{"
    if result.count(runtime) != 1:
        raise ValueError("Canonical runtime script marker not unique")
    tag = '<script id="embedded-video" type="text/plain">' + base64.b64encode(video).decode("ascii") + "</script>"
    result = result.replace(runtime, tag + runtime, 1)
    result = result.replace(BOOTSTRAP, EMBEDDED_LOADER + "\nrenderReportMeta();choose(0,false);refresh();\nvoid loadEmbeddedMatch();", 1)
    result = result.replace(
        "このレポートに元動画は含まれません。再生するときは、この端末の動画を選択してください。",
        "動画とJSONはこのHTMLに内蔵されています。外部送信しません。",
    )
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--template", type=Path, default=Path(__file__).resolve().parents[1] / "index.html")
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--video", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)
    if args.out.resolve() in (args.template.resolve(), args.report.resolve(), args.video.resolve()):
        parser.error("Output path must differ from input paths")
    raw = args.report.read_bytes()
    if len(raw) > MAX_JSON:
        parser.error("Report exceeds 1 MiB")
    report = validate_report(json.loads(raw.decode("utf-8")))
    if args.video.stem != report["match"]["id"]:
        parser.error("MP4 basename and match.id must match exactly")
    inspect_video(args.video, report["match"]["durationSec"])
    result = build(args.template.read_text(encoding="utf-8"), report, args.video.read_bytes())
    args.out.parent.mkdir(parents=True, exist_ok=True)
    temp = args.out.with_suffix(args.out.suffix + ".tmp")
    try:
        temp.write_text(result, encoding="utf-8")
        temp.replace(args.out)
    finally:
        temp.unlink(missing_ok=True)
    print("PASS:", args.out, "id="+report["match"]["id"], "events="+str(len(report["events"])))
    print("NOTE: downloading HTML retains video locally beyond GitHub's 14-day public retention.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
