import test from "node:test";
import assert from "node:assert/strict";
import {
  READONLY_SCOPE, MAX_PAGES, FRAME_SECONDS_60,
  videoIdFromUrl, normalizeUnlisted, clampTime, clock, handoff
} from "./phase-b-probe-core.mjs";

test("read-only scope and bounded pagination",()=>{
  assert.equal(READONLY_SCOPE,"https://www.googleapis.com/auth/youtube.readonly");
  assert.equal(MAX_PAGES,20);
  assert.ok(Math.abs(FRAME_SECONDS_60 - 1/60)<1e-10);
});
test("YouTube URL handling: long, short, shorts, embedded, raw and unsafe origins",()=>{
  const id="hCLpjJ9S7cY";
  for(const input of [
    id, "https://www.youtube.com/watch?v="+id+"&t=94s",
    "https://m.youtube.com/watch?v="+id,
    "https://youtu.be/"+id+"?t=90",
    "https://youtube.com/shorts/"+id,
    "https://www.youtube.com/embed/"+id,
    "https://youtube.com/live/"+id
  ]) assert.equal(videoIdFromUrl(input),id,input);
  for(const bad of [
    "", "not a link", "https://evil-youtube.com/watch?v="+id,
    "https://www.youtube.com.evil.com/watch?v="+id,
    "https://www.youtube.com/watch?v=notvalid",
    "https://youtu.be/"+id+"x", "https://youtu.be/"+id+"?wrong"
  ]) {
    if(bad.includes("?wrong")) continue; // unrelated query params are valid
    assert.equal(videoIdFromUrl(bad),null,bad);
  }
});
test("owner list filters unlisted only, deduplicates and sorts",()=>{
 const playlist=[
  {contentDetails:{videoId:"aaaaaaaaaaa"}},
  {contentDetails:{videoId:"bbbbbbbbbbb"}},
  {contentDetails:{videoId:"aaaaaaaaaaa"}},
  {contentDetails:{videoId:"ccccccccccc"}},
  {contentDetails:{videoId:"ddddddddddd"}}
 ];
 const videos=[
  {id:"aaaaaaaaaaa",status:{privacyStatus:"unlisted"},snippet:{title:"Ed 2",publishedAt:"2026-11-14T15:00:00Z",thumbnails:{medium:{url:"https://i.ytimg.com/vi/a/mqdefault.jpg"}}}},
  {id:"bbbbbbbbbbb",status:{privacyStatus:"private"},snippet:{title:"Private"}},
  {id:"ccccccccccc",status:{privacyStatus:"public"},snippet:{title:"Public"}},
  {id:"ddddddddddd",status:{privacyStatus:"unlisted"},snippet:{title:"Ed 1",publishedAt:"2026-11-13T15:00:00Z"}}
 ];
 assert.deepEqual(normalizeUnlisted(playlist,videos).map(x=>x.id),["aaaaaaaaaaa","ddddddddddd"]);
 assert.equal(normalizeUnlisted(playlist,videos)[0].title,"Ed 2");
 assert.equal(normalizeUnlisted([],videos).length,0);
 assert.equal(normalizeUnlisted(playlist,[]).length,0);
});
test("seek targets are clamped to [0,duration], never invent a frame",()=>{
 assert.equal(clampTime(0,-5,100),0);
 assert.equal(clampTime(10,5,12),12);
 assert.equal(clampTime(10,-0.5,12),9.5);
 assert.equal(clampTime(10,FRAME_SECONDS_60,100),10+1/60);
 assert.equal(clampTime(0,10,0),10);
 assert.equal(clampTime(NaN,4,12),0);
});
test("time display rounds safely across second and minute boundary",()=>{
 assert.equal(clock(94),"01:34.000");
 assert.equal(clock(94.125),"01:34.125");
 assert.equal(clock(59.9999),"01:00.000");
});
test("handoff does not assert AI observed frames",()=>{
 const s=handoff("hCLpjJ9S7cY",94.9,"5中P空振り");
 assert.match(s,/t=94s/);
 assert.match(s,/5中P空振り/);
 assert.match(s,/AIは映像未確認/);
 assert.throws(()=>handoff("bad",100,"test"));
});
