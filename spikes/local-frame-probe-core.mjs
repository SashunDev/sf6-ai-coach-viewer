// Pure helpers for the optional, on-device local MP4 frame-step feasibility probe.
// All "single frame" outcomes must be treated as candidates, never a browser guarantee.
export const MIN_FRAME_PERIOD = 1 / 240;
export const MAX_FRAME_PERIOD = 1 / 10;
export const FALLBACK_PERIOD = 1 / 60;

export function inferPeriod(samples, maxSamples = 60) {
  if (!Array.isArray(samples)) return null;
  const diffs = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    const jump = Number(b?.presentedFrames) - Number(a?.presentedFrames);
    const dt = Number(b?.mediaTime) - Number(a?.mediaTime);
    if (!Number.isFinite(jump) || jump < 1 || jump > 12 || !Number.isFinite(dt) || dt <= 0) continue;
    const perFrame = dt / jump;
    if (perFrame >= MIN_FRAME_PERIOD && perFrame <= MAX_FRAME_PERIOD) diffs.push(perFrame);
  }
  if (diffs.length < 4) return null;
  diffs.sort((a,b) => a-b);
  const picked = diffs.slice(-maxSamples);
  const m = Math.floor(picked.length / 2);
  return picked.length % 2 ? picked[m] : (picked[m-1] + picked[m]) / 2;
}

export function targetForFrameStep(before, direction, period, duration) {
  if (!Number.isFinite(before) || before < 0) throw new Error("missing visible video timestamp");
  if (direction !== -1 && direction !== 1) throw new Error("direction must be -1 or +1");
  const step = Number.isFinite(period) && period >= MIN_FRAME_PERIOD && period <= MAX_FRAME_PERIOD
    ? period : FALLBACK_PERIOD;
  // Target just inside the NEXT or PREVIOUS estimated frame's presentation interval.
  // Browser seek precision and variable frame rate can change the displayed frame.
  const target = before + step * (direction > 0 ? 1.1 : -0.5);
  const max = Number.isFinite(duration) && duration > 0 ? duration : Infinity;
  return Math.min(Math.max(0, target), max);
}

export function assessFrameStep(before, after, direction, period, stillPaused) {
  if (!stillPaused) return {state:"failed",detail:"一時停止を維持できませんでした"};
  if (!Number.isFinite(before) || !Number.isFinite(after)) {
    return {state:"unknown",detail:"フレーム提示時刻を取得できませんでした"};
  }
  const delta = (after - before) * direction;
  if (delta <= 1e-5) return {state:"failed",detail:"次／前のコマへの移動が確認できませんでした"};
  if (Number.isFinite(period) && period > 0 && delta > 1.7*period) {
    return {state:"skipped",detail:"動画の表示時刻が複数コマ相当飛んだ可能性があります"};
  }
  return {state:"candidate",detail:"動画の表示コマの移動を検出。厳密な1コマ保証ではありません"};
}
