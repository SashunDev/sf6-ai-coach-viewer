import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
const read=file=>readFileSync(new URL("../"+file,import.meta.url),"utf8");
const html=read("index.html");
const module=read("youtube-review.mjs");
const privacy=read("youtube-privacy.html");
const builder=read("scripts/build_pages_site.py");
const standalone=read("scripts/build_standalone_report.py");

test("YouTube mode is hidden by default and original MP4/reports remain intact",()=>{
 assert.match(html,/id="viewer"/);
 assert.match(html,/id="youtubeReviewPanel" hidden/);
 assert.match(html,/id="youtubeOpen"/);
 assert.match(html,/id="fileInput" type="file"/);
 assert.match(html,/id="reportInput" type="file"/);
 assert.match(html,/function setVideoFile\(file\)/);
 assert.match(html,/function setRemoteVideo\(sourceUrl\)/);
 assert.match(html,/decodeStoredReportIdFragment\(\)/);
 assert.match(html,/decodeLinkReportFragment\(\)/);
 assert.match(html,/window\.addEventListener\('sf6:youtube-review-open',\(\)=>pause\(\)\)/);
 assert.match(html,/type="module" src="\.\/youtube-review\.mjs"/);
 assert.match(module,/document\.body\.classList\.add\("youtube-review-active"\)/);
 assert.match(module,/document\.body\.classList\.remove\("youtube-review-active"\)/);
 assert.match(module,/\$\("viewer"\)\.hidden=false/);
 assert.match(html,/name="sf6-youtube-oauth-client-id" content=""/);
 assert.match(html,/id="youtubeForgetClientId"/);
});

test("CSP allows only required Google/YouTube endpoints without media extraction",()=>{
 const csp=html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
 assert.ok(csp);
 assert.match(csp,/default-src 'none'/);
 assert.match(csp,/media-src 'self' blob:/);
 assert.match(csp,/connect-src 'self' https:\/\/www\.googleapis\.com https:\/\/accounts\.google\.com\/gsi\//);
 assert.match(csp,/frame-src https:\/\/accounts\.google\.com\/gsi\/ https:\/\/www\.youtube\.com/);
 assert.match(csp,/script-src 'self' 'unsafe-inline' https:\/\/accounts\.google\.com\/gsi\/client https:\/\/www\.youtube\.com/);
 assert.match(csp,/object-src 'none'/);
 assert.match(csp,/form-action 'none'/);
 assert.doesNotMatch(csp,/(?:connect-src|media-src)[^;]*googlevideo/);
 assert.doesNotMatch(csp,/\bunsafe-eval\b/);
});
test("B0 keeps owner-only in-memory read-only access, logout and partial-data safeguards",()=>{
 assert.match(module,/gatherOwnUnlisted/);
 assert.match(module,/scope:SCOPE/);
 assert.match(module,/hasGrantedAllScopes/);
 assert.ok(module.includes('requestAccessToken({prompt:""})'));
 assert.doesNotMatch(module,/prompt:"select_account"/);
 assert.ok(!module.includes('requestAccessToken({prompt:"none"})'));
 assert.match(module,/state\.epoch\+\+/);
 assert.match(module,/state\.controller\.abort\(\)/);
 assert.match(module,/state\.token=null/);
 assert.match(module,/state\.videos=\[\]/);
 assert.match(module,/youtubeClear/);
 assert.match(module,/youtubeRevoke/);
 assert.match(module,/partial\?" \/ 上限到達：一部のみ"/);
 assert.doesNotMatch(module,/sessionStorage|document\.cookie|window\.open\(/);
 assert.match(module,/const PUBLIC_ID_KEY=/);
 assert.match(module,/window\.localStorage\.setItem\(PUBLIC_ID_KEY,id\)/);
 assert.match(module,/window\.localStorage\.removeItem\(PUBLIC_ID_KEY\)/);
 assert.doesNotMatch(module,/localStorage\.setItem\([^\n]*(?:token|videos|access_token)/);
 assert.doesNotMatch(module,/createObjectURL|MediaSource|XMLHttpRequest|sendBeacon/);
});
test("Official IFrame player is user-selected, paused-only approximate seek",()=>{
 assert.match(module,/new window\.YT\.Player/);
 assert.match(module,/script\.src="https:\/\/www\.youtube\.com\/iframe_api"/);
 assert.match(module,/videoId:video\.id/);
 assert.match(module,/playerVars:\{playsinline:1,origin:location\.origin,controls:1,rel:0\}/);
 assert.match(module,/getPlayerState\(\)!==window\.YT\.PlayerState\?\.PAUSED/);
 assert.match(module,/player\.seekTo\(goal,true\)/);
 assert.match(module,/classifyReportedSeek\(baseline,goal,reported\)/);
 assert.match(html,/細かい時刻移動/);
 assert.match(html,/本当の1コマ送りを保証するものではありません/);
 assert.match(html,/touch-action:manipulation/);
 for(const id of ["youtubePrevFive","youtubeNextFive","youtubePrevTen","youtubeNextTen"]){
   assert.match(html,new RegExp('id="'+id+'"'));
   assert.match(module,new RegExp('"'+id+'"'));
 }
 assert.ok(module.includes('state.seekPlan=plan'));
 assert.ok(module.includes('now-previous.at<=1500'));
 assert.ok(html.includes('10×1/30秒'));
 const ids=[["youtubePrevFive","youtubeNextFive"],["youtubePrevSec","youtubeNextSec"],
   ["youtubePrevTen","youtubeNextTen"],["youtubePrev","youtubeNext"]];
 const seekSection=html.slice(html.indexOf('class="ytr-seek-controls"'),html.indexOf('id="youtubePlaybackStatus"'));
 assert.ok(seekSection.includes('class="ytr-seek-pause"'));
 assert.equal((seekSection.match(/class="ytr-seek-pair"/g)||[]).length,4);
 for(const [id,label] of [
   ["youtubePrevTen","← 10F"],["youtubeNextTen","10F →"],
   ["youtubePrev","← 1F"],["youtubeNext","1F →"]
 ]){
   assert.ok(seekSection.includes('id="'+id+'"'),"seek control missing: "+id);
   assert.ok(seekSection.includes('disabled>'+label+'</button>'),"label missing: "+label);
 }
 assert.ok(html.includes('厳密なフレーム送り（10コマ・1コマの移動）ではありません。'));
 assert.equal((seekSection.match(/class="ytr-seek-group"/g)||[]).length,2);
 assert.ok(seekSection.indexOf('aria-label="細かい時刻移動（近似）"')<
           seekSection.indexOf('aria-label="秒単位の移動"'),"fine controls must appear first");
 assert.ok(html.includes('@media(min-width:851px)'));
 assert.ok(html.includes('#youtubePlayer{width:min(100%,560px)'));
 assert.ok(html.includes('.ytr-seek-pause{grid-column:1/-1'));
 for(const [previous,next] of ids){
   const start=seekSection.indexOf('id="'+previous+'"');
   const end=seekSection.indexOf('id="'+next+'"');
   assert.ok(start>=0&&end>start&&end-start<220,"back/forward pair separated: "+previous);
 }
 assert.ok(html.includes('.ytr-seek-pair{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr)'));
 assert.match(html,/min-height:52px/);
 assert.match(html,/role="group" aria-label="細かい時刻移動（近似）"/);
});
test("Manual ChatGPT handoff does not claim actual video perception",()=>{
 assert.match(module,/youtubeCopy"\)\.addEventListener\("click"/);
 assert.match(module,/navigator\.clipboard\.writeText\(content\)/);
 assert.match(module,/映像をChatGPTが自動確認したわけではありません/);
 assert.ok(module.includes('const millis=Math.round(current*1000)'));
 assert.match(module,/直近のシーク要求/);
 assert.match(html,/id="youtubeShare" type="button" disabled/);
 assert.match(html,/id="youtubeShareLink" type="text" readonly/);
 assert.match(module,/youtubeShare"\)\.addEventListener\("click"/);
 assert.match(module,/share\.searchParams\.set\("v",id\)/);
 assert.match(module,/share\.searchParams\.set\("t",String\(seconds\)\)/);
 assert.match(module,/state\.videos\.some\(video=>video\.id===id\)/);
 assert.match(html,/ChatGPTへ貼り付けてください/);
 assert.match(html,/既存レポートはこのYouTube動画に自動同期しません/);
});
test("Pages includes all four assets and standalone strips web mode",()=>{
 for(const name of ["youtube-review.mjs","youtube-library-core.mjs","youtube-seek-core.mjs","youtube-privacy.html"]){
  assert.ok(builder.includes('"'+name+'"'),"missing Pages "+name);
 }
 assert.match(standalone,/def strip_external_youtube_mode\(template: str\)/);
 assert.match(standalone,/template = strip_external_youtube_mode\(template\)/);
 assert.match(standalone,/result = result\.replace\(YT_CSP, LOCAL_CSP, 1\)/);
 assert.match(privacy,/YouTube連携に関するデータ取扱説明/);
 assert.match(privacy,/Googleアカウントの連携管理/);
 assert.match(privacy,/公開識別子/);
 assert.match(builder,/SF6_YOUTUBE_OAUTH_CLIENT_ID/);
});
test("Node syntax check for new modules",()=>{
 for(const path of ["youtube-review.mjs","youtube-library-core.mjs","youtube-seek-core.mjs"]){
  const p=spawnSync(process.execPath,["--check",new URL("../"+path,import.meta.url).pathname],{encoding:"utf8"});
  assert.equal(p.status,0,p.stderr);
 }
});
