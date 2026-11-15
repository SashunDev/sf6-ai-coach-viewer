import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {MIN_FRAME_PERIOD,MAX_FRAME_PERIOD,FALLBACK_PERIOD,inferPeriod,targetForFrameStep,assessFrameStep} from "./local-frame-probe-core.mjs";

function frames(fps,count=26) {
  return Array.from({length:count},(_,i)=>({mediaTime:i/fps,presentedFrames:i+1}));
}
test("infer presentation intervals at common video rates, without requiring game 60fps",()=>{
 for(const fps of [24,25,30,50,59.94,60,120]){
   const p=inferPeriod(frames(fps));
   assert.ok(p!==null,"no period for "+fps);
   assert.ok(Math.abs(p-1/fps)<1e-9,fps+": "+p);
 }
 assert.equal(inferPeriod(frames(60,3)),null,"minimum sample size enforced");
 assert.ok(MAX_FRAME_PERIOD>=1/10 && MIN_FRAME_PERIOD<=1/240);
});
test("dropped visual callbacks can still yield a per-frame estimate",()=>{
 const samples=frames(30).filter((x,i)=>i%2===0);
 assert.ok(Math.abs(inferPeriod(samples)-1/30)<1e-10);
});
test("seek target is conservative and clamps to source duration",()=>{
 const p=1/30;
 assert.ok(targetForFrameStep(5,1,p,10)>5+p);
 assert.ok(targetForFrameStep(5,-1,p,10)<5);
 assert.equal(targetForFrameStep(0,-1,p,10),0);
 assert.equal(targetForFrameStep(9.99,1,p,10),10);
 assert.ok(Math.abs(targetForFrameStep(5,1,NaN,10)-(5+FALLBACK_PERIOD*1.1))<1e-10);
 assert.throws(()=>targetForFrameStep(NaN,1,p,10));
 assert.throws(()=>targetForFrameStep(2,0,p,10));
});
test("classification does not equate currentTime seek with proven one-frame step",()=>{
 const p=1/30;
 assert.equal(assessFrameStep(5,5+p,1,p,true).state,"candidate");
 assert.equal(assessFrameStep(5,5-p,-1,p,true).state,"candidate");
 assert.equal(assessFrameStep(5,5,1,p,true).state,"failed");
 assert.equal(assessFrameStep(5,4.99,1,p,true).state,"failed");
 assert.equal(assessFrameStep(5,5+4*p,1,p,true).state,"skipped");
 assert.equal(assessFrameStep(5,5+p,1,p,false).state,"failed");
 assert.equal(assessFrameStep(5,undefined,1,p,true).state,"unknown");
});
test("standalone local probe JS syntax and privacy restrictions",()=>{
 const html=readFileSync(new URL("./local-frame-probe.html",import.meta.url),"utf8");
 const script=html.split('<script type="module">')[1]?.split('</script>')[0] || "";
 assert.ok(script,"missing local probe module");
 const r=spawnSync(process.execPath,["--check","--input-type=module"],{input:script,encoding:"utf8"});
 assert.equal(r.status,0,r.stderr);
 assert.match(html,/requestVideoFrameCallback/);
 assert.match(html,/accept="video\/mp4/);
 assert.match(html,/media-src blob:/);
 assert.match(html,/connect-src 'none'/);
 assert.match(html,/動画のコマとゲーム内の1Fが一致する必要はありません/);
 assert.doesNotMatch(script,/fetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage/);
});


test("iOS Quick Look script-blocking and file-load failures are diagnosable",()=>{
 const html=readFileSync(new URL("./local-frame-probe.html",import.meta.url),"utf8");
 const script=html.split('<script type="module">')[1]?.split('</script>')[0] || "";
 assert.match(html,/id="runtimeState"/);
 assert.match(html,/JavaScript未起動/);
 assert.match(script,/JavaScript起動確認済み/);
 assert.match(script,/addEventListener\("loadedmetadata"/);
 assert.match(script,/addEventListener\("error"/);
 assert.match(script,/addEventListener\("change"/);
 assert.match(script,/動画読み込みエラー/);
 assert.doesNotMatch(script,/fetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage/);
});
