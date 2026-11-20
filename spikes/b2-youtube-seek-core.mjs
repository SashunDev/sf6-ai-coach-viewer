// Pure helpers for an optional official YouTube IFrame time-seek experiment.
// These are time-seek requests, NEVER exact frame stepping.
export const VIDEO_ID_RE=/^[A-Za-z0-9_-]{11}$/;
export const SEEK_SMALL=1/30;
export function safeVideoId(value){return VIDEO_ID_RE.test(String(value||""));}
export function secondsDisplay(value){
 const n=Number(value);
 return Number.isFinite(n)&&n>=0?n.toFixed(3)+"s":"取得不可";
}
export function targetSeconds(current,delta,duration){
 const c=Number(current),d=Number(delta),length=Number(duration);
 if(!Number.isFinite(c)||c<0||!Number.isFinite(d)||Math.abs(d)>5)return null;
 const max=Number.isFinite(length)&&length>0?length:Infinity;
 return Math.min(max,Math.max(0,c+d));
}
export function classifyReportedSeek(start,requested,reported){
 if(![start,requested,reported].every(Number.isFinite))return "API時刻を取得できません";
 const move=Math.abs(reported-start);
 if(move<0.01)return "API報告時刻に変化が見られません";
 const error=Math.abs(reported-requested);
 if(error>0.12)return "指定時刻からのずれが大きい（キーフレーム等の可能性）";
 return "API報告時刻が変化しました（表示フレームの変化は未証明）";
}
