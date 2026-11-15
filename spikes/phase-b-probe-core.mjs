export const READONLY_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";
export const MAX_PAGES = 20;
export const FRAME_SECONDS_60 = 1 / 60;

export function videoIdFromUrl(input) {
  const value = String(input || "").trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(value)) return value;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    let id = null;
    if (host === "youtu.be" || host === "www.youtu.be") {
      id = url.pathname.split("/")[1];
    } else if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host)) {
      if (url.pathname === "/watch") id = url.searchParams.get("v");
      else if (/^\/(shorts|embed|live)\//.test(url.pathname)) id = url.pathname.split("/")[2];
    }
    return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}
export function normalizeUnlisted(playlistItems, videos) {
  const lookup = new Map();
  for (const v of videos || []) {
    if (/^[a-zA-Z0-9_-]{11}$/.test(String(v.id || ""))) lookup.set(v.id, v);
  }
  const output = [], seen = new Set();
  for (const entry of playlistItems || []) {
    const id = entry?.contentDetails?.videoId;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const video = lookup.get(id);
    if (!video || video.status?.privacyStatus !== "unlisted") continue;
    const s = video.snippet || {};
    const t = s.thumbnails || {};
    output.push({
      id,
      title: String(s.title || "(タイトルなし)"),
      publishedAt: String(s.publishedAt || entry?.contentDetails?.videoPublishedAt || ""),
      thumbnail: t.medium?.url || t.default?.url || "",
      channelTitle: String(s.channelTitle || ""),
    });
  }
  return output.sort((a,b) => b.publishedAt.localeCompare(a.publishedAt));
}
export function clampTime(current, delta, duration) {
  let v = Number(current) + Number(delta);
  if (!Number.isFinite(v)) return 0;
  const max = Number(duration);
  return Math.max(0, Math.min(v, Number.isFinite(max) && max > 0 ? max : Infinity));
}
export function clock(seconds) {
  const n = Math.max(0, Number(seconds) || 0);
  const millis = Math.round(n * 1000);
  const s = Math.floor(millis / 1000);
  return String(Math.floor(s / 60)).padStart(2, "0") + ":" +
    String(s % 60).padStart(2, "0") + "." +
    String(millis % 1000).padStart(3, "0");
}
export function handoff(videoId, at, note) {
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) throw new Error("動画IDが不正です");
  const secs = Math.floor(Math.max(0, Number(at) || 0));
  return "SF6 リプレイ反省会\n動画: https://www.youtube.com/watch?v=" + videoId +
    "&t=" + secs + "s\n時刻: " + clock(secs) +
    "\n" + (String(note || "").trim() || "この場面を反省したい。") +
    "\n※時刻はユーザーが選択。AIは映像未確認。";
}
