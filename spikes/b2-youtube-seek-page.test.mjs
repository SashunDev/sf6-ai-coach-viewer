import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
const html=readFileSync(new URL("./b0-library.html",import.meta.url),"utf8");
const app=readFileSync(new URL("./b0-app.mjs",import.meta.url),"utf8");
const seek=readFileSync(new URL("./b2-youtube-seek-app.mjs",import.meta.url),"utf8");
test("new official iframe experiment is user-triggered, opt-in and visibly not frame stepping",()=>{
 assert.match(html,/id="b2-panel" class="card" hidden/);
 assert.match(html,/id="b2-next"/);
 assert.match(html,/時刻シーク検証/);
 assert.match(html,/コマ送り・1フレーム単位の表示は保証されません/);
 assert.match(html,/src="\.\/b2-youtube-seek-app\.mjs"/);
 assert.match(app,/new CustomEvent\("sf6:b2-open"/);
 assert.match(app,/document\.dispatchEvent\(new Event\("sf6:b2-reset"\)\)/);
 assert.match(seek,/document\.addEventListener\("sf6:b2-open"/);
 assert.match(seek,/state\.player\.cueVideoById\(id\)/);
});
test("CSP includes only official YouTube embed script and frames, no video download",()=>{
 assert.match(html,/script-src 'self' https:\/\/accounts\.google\.com\/gsi\/client https:\/\/www\.youtube\.com/);
 assert.match(html,/frame-src https:\/\/accounts\.google\.com\/gsi\/ https:\/\/www\.youtube\.com/);
 assert.match(seek,/script\.src="https:\/\/www\.youtube\.com\/iframe_api"/);
 assert.match(seek,/window\.YT\.Player/);
 assert.match(seek,/playerVars:\{playsinline:1,origin:location\.origin,controls:1,rel:0\}/);
 assert.doesNotMatch(seek,/fetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|document\.cookie/);
 assert.doesNotMatch(seek,/download|mediaSource|\.mp4|srcObject|createObjectURL/);
 assert.doesNotMatch(app,/https:\/\/googlevideo|https:\/\/youtube\.com\/api\/timedtext/);
});
test("fine seek is paused-only, records approximate API time not a guaranteed decoded frame",()=>{
 assert.match(seek,/player\.getPlayerState\(\)!==window\.YT\.PlayerState\?\.PAUSED/);
 assert.match(seek,/player\.seekTo\(to,true\)/);
 assert.match(seek,/classifyReportedSeek\(from,to,after\)/);
 assert.doesNotMatch(seek,/requestVideoFrameCallback|video\.currentTime/);
 for(const file of ["b2-youtube-seek-app.mjs","b2-youtube-seek-core.mjs"]){
  const p=spawnSync(process.execPath,["--check",new URL("./"+file,import.meta.url).pathname],{encoding:"utf8"});
  assert.equal(p.status,0,p.stderr);
 }
});
