// Browser-only smoke test for B0 mock UI. Does not ask Google for tokens or read private uploads.
import {spawn} from "node:child_process";
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
const dir=mkdtempSync(join(tmpdir(),"sf6-b0-browser-"));const procs=[];
function launch(program,args,opts={}){const p=spawn(program,args,{...opts,stdio:"ignore"});procs.push(p);return p;}
async function until(f,ms=16000){
 const stop=Date.now()+ms;
 while(Date.now()<stop){try{const x=await f();if(x)return x;}catch{}await new Promise(r=>setTimeout(r,200));}
 throw Error("Timeout in B0 mock browser smoke");
}
async function main(){
 for(const file of ["index.html","youtube-review.mjs","youtube-library-core.mjs","youtube-library-cache.mjs","youtube-seek-core.mjs","youtube-privacy.html"]){
  const input=readFileSync(new URL("../"+file,import.meta.url),"utf8");
  writeFileSync(join(dir,file),input);
 }
 launch("python3",["-m","http.server","18777","--bind","127.0.0.1"],{cwd:dir});
 await until(async()=> (await fetch("http://127.0.0.1:18777/index.html")).ok);
 launch(process.env.CHROME_BIN||"google-chrome",
  ["--headless=new","--no-sandbox","--disable-gpu","--disable-dev-shm-usage",
   "--remote-allow-origins=*","--remote-debugging-port=18778",
   "--user-data-dir="+join(dir,"chrome-profile"),"--no-first-run"]);
 const tab=await until(async()=>{
  const r=await fetch("http://127.0.0.1:18778/json/new?http://127.0.0.1:18777/index.html",{method:"PUT"});
  return r.ok?await r.json():null;
 });
 const ws=new WebSocket(tab.webSocketDebuggerUrl);
 await new Promise((res,rej)=>{ws.addEventListener("open",res,{once:true});ws.addEventListener("error",rej,{once:true});});
 let serial=0;const pending=new Map();const apiRequests=[];const external=[];
 ws.addEventListener("message",e=>{
  const m=JSON.parse(e.data);
  if(m.method==="Network.requestWillBeSent"){const url=m.params?.request?.url||"";if(url.includes("youtube/v3"))apiRequests.push(url);if(url.startsWith("https://"))external.push(url.split("?")[0]);}
  if(!m.id||!pending.has(m.id))return;
  const p=pending.get(m.id);pending.delete(m.id);
  if(m.error)p.reject(Error(JSON.stringify(m.error)));else p.resolve(m.result||{});
 });
 function send(method,params={}){
  const id=++serial;return new Promise((resolve,reject)=>{
   pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));
  });
 }
 async function ev(expression){
  const r=await send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});
  if(r.exceptionDetails)throw Error("Browser JS exception: "+JSON.stringify(r.exceptionDetails).slice(0,300));
  return r.result?.value;
 }
 await send("Runtime.enable");await send("Network.enable");

 await until(async()=>await ev('document.readyState==="complete" && !!document.querySelector("#youtubeOpen")'));
 await send("Emulation.setDeviceMetricsOverride",{width:375,height:812,deviceScaleFactor:2,mobile:true});
 await send("Emulation.setDeviceMetricsOverride",{width:375,height:812,deviceScaleFactor:2,mobile:true});
 await new Promise(r=>setTimeout(r,300));
 const start=await ev('({viewer:!document.querySelector("#viewer").hidden,youtube:document.querySelector("#youtubeReviewPanel").hidden,hasFile:!!document.querySelector("#fileInput")})');
 if(!start.viewer||!start.youtube||!start.hasFile)throw Error("Local reviewer changed by B3");
 // Inject synthetic Google/YT browser APIs only after load; no real OAuth, uploads or CDN.
 await ev('window.google={accounts:{oauth2:{initTokenClient:({callback})=>({requestAccessToken:(args)=>{window.__lastOAuthPrompt=args?.prompt;callback({access_token:"SYNTHETIC_ONLY"})}}),hasGrantedAllScopes:()=>true,revoke:(_t,cb)=>cb({successful:true})}}};true');
 // Delayed API time intentionally emulates the asynchronous official YouTube iframe.
 await ev('window.__ytPlayers=[];window.YT={PlayerState:{PLAYING:1,PAUSED:2},Player:class{constructor(host,config){this.host=host;this.events=config.events;this.time=5;this.state=2;this.requests=[];this.generation=0;window.__ytPlayers.push(this);host.textContent="SYNTHETIC YT PLAYER";setTimeout(()=>config.events.onReady({target:this}),5)}getPlayerState(){return this.state}getCurrentTime(){return this.time}getDuration(){return 120}pauseVideo(){this.state=2;this.events.onStateChange({target:this,data:2})}cueVideoById(_id){this.generation++;this.time=5;this.state=2;this.events.onStateChange({target:this,data:2})}seekTo(v){this.requests.push(v);const gen=this.generation;setTimeout(()=>{if(gen===this.generation)this.time=v},120)}destroy(){this.generation++;this.host.remove()}}};true');
 await ev('window.__syntheticCalls=0;const originalFetch=window.fetch.bind(window);window.fetch=(url,opts)=>{const x=String(url);if(!x.startsWith("https://www.googleapis.com/youtube/v3/"))return originalFetch(url,opts);window.__syntheticCalls++;const u=new URL(x),op=u.pathname.split("/").pop();let d;if(op==="channels")d={items:[{contentDetails:{relatedPlaylists:{uploads:"UUdemo"}}}]};else if(op==="playlistItems")d={items:[{contentDetails:{videoId:"AAAAAAAAAAA"}},{contentDetails:{videoId:"BBBBBBBBBBB"}},{contentDetails:{videoId:"CCCCCCCCCCC"}}]};else if(op==="videos")d={items:[{id:"AAAAAAAAAAA",status:{privacyStatus:"unlisted"},snippet:{title:"Mock Ed Match",publishedAt:"2026-11-15T02:00:00Z"}},{id:"BBBBBBBBBBB",status:{privacyStatus:"unlisted"},snippet:{title:"Mock Alex Match",publishedAt:"2026-11-14T02:00:00Z"}},{id:"CCCCCCCCCCC",status:{privacyStatus:"private"},snippet:{title:"Private fixture"}}]};else throw Error("Unknown mock API "+op);return Promise.resolve(new Response(JSON.stringify(d),{status:200,headers:{"Content-Type":"application/json"}}))};true');
 await ev('document.querySelector("#youtubeOpen").click()');
 await until(async()=>await ev('!document.querySelector("#youtubeReviewPanel").hidden'));
 const mobileGeometry=await ev('(()=>{const pairs=[["youtubePrevTen","youtubeNextTen"],["youtubePrev","youtubeNext"],["youtubePrevFive","youtubeNextFive"],["youtubePrevSec","youtubeNextSec"]];const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}};return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,pause:rect("youtubePause"),pairs:pairs.map(([a,b])=>[rect(a),rect(b)])}})()');
 if(mobileGeometry.width!==375||mobileGeometry.scrollWidth>375.5)throw Error("Mobile seek layout overflow: "+JSON.stringify(mobileGeometry));
 if(mobileGeometry.pause.h<44)throw Error("Pause target too small");
 let lastBottom=mobileGeometry.pause.y+mobileGeometry.pause.h;
 for(const [left,right] of mobileGeometry.pairs){
   if(left.x>=right.x||Math.abs(left.y-right.y)>1||Math.abs(left.h-right.h)>1)
     throw Error("Seek pair not horizontally aligned: "+JSON.stringify([left,right]));
   if(left.w<100||right.w<100||left.h<44||right.h<44)
     throw Error("Seek targets too small: "+JSON.stringify([left,right]));
   if(left.y<=lastBottom)throw Error("Seek rows overlap or wrong order");
   lastBottom=left.y+left.h;
 }

 // Also check a compact desktop viewport where the video and all controls
 // must fit into one viewport when the review section is scrolled into view.
 const mobileSequence=mobileGeometry.pairs.map(pair=>pair[0].y);
 if(!(mobileSequence[0]<mobileSequence[2]))throw Error("Fine seek controls are not first on mobile");
 // Desktop 16:9 scales smoothly with available viewport height, rather than
 // always occupying 560px. Test short and tall viewports without logging in.
 const desktopSizes=[[1280,720],[1600,900],[1680,800],[1366,600]];
 const observedDesktop=[];
 for(const [width,height] of desktopSizes){
   await send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:false});
   const desk=await ev('(()=>{const r=id=>{const p=document.getElementById(id).getBoundingClientRect();return{x:p.x,y:p.y,w:p.width,h:p.height,bottom:p.bottom}};return{viewport:innerHeight,scrollWidth:document.documentElement.scrollWidth,player:r("youtubePlayer"),title:r("youtubeCurrentTitle"),pause:r("youtubePause"),fine:r("youtubePrevTen"),seconds:r("youtubePrevFive"),last:r("youtubeNextSec")}})()');
   if(desk.scrollWidth>width+0.5||desk.player.w>1080.5||desk.player.h<180)
     throw Error("Desktop player overflow or too small: "+JSON.stringify({width,height,desk}));
   if(Math.abs(desk.player.w/desk.player.h-16/9)>0.025)
     throw Error("Desktop player 16:9 aspect ratio lost: "+JSON.stringify({width,height,desk}));
   if(!(desk.fine.x<desk.seconds.x&&Math.abs(desk.fine.y-desk.seconds.y)<3))
     throw Error("Desktop seek groups not side-by-side: "+JSON.stringify({width,height,desk}));
   if(desk.last.bottom-desk.title.y>desk.viewport-12)
     throw Error("Desktop video and seek buttons do not fit one section viewport: "+JSON.stringify({width,height,desk}));
   observedDesktop.push({width,height,videoWidth:desk.player.w,videoHeight:desk.player.h});
 }
 if(observedDesktop[0].videoWidth<=620)
   throw Error("720p desktop player did not improve over 560px: "+JSON.stringify(observedDesktop));
 if(observedDesktop[1].videoWidth<=observedDesktop[0].videoWidth+200)
   throw Error("Desktop player did not respond to available height: "+JSON.stringify(observedDesktop));
 await send("Emulation.setDeviceMetricsOverride",{width:375,height:812,deviceScaleFactor:2,mobile:true});
 if(await ev('document.querySelector("#youtubeKeepList").checked'))throw Error("Owner storage opt-in must start disabled");
 await ev('document.querySelector("#youtubeKeepList").checked=true;document.querySelector("#youtubeKeepList").dispatchEvent(new Event("change",{bubbles:true}));true');
 await ev('document.querySelector("#youtubeClientId").value="1234567890-abcd.apps.googleusercontent.com";document.querySelector("#youtubeConsent").checked=true;document.querySelector("#youtubeConnect").click();true');
 await until(async()=>await ev('document.querySelectorAll("#youtubeList .youtube-card").length===2'));
 if((await ev('window.__lastOAuthPrompt'))!=="")throw Error("OAuth must reuse prior consent without forced select_account");
 const remembered=await ev('window.localStorage.getItem("sf6-coach-public-google-oauth-client-id-v1")');
 if(remembered!=="1234567890-abcd.apps.googleusercontent.com")throw Error("Public client ID was not retained");
 const cachedSnapshot=await ev('window.localStorage.getItem("sf6-coach-owner-unlisted-list-v1")');
 if(!cachedSnapshot)throw Error("Opted-in owner list was not stored");
 const cachedMetadata=JSON.parse(cachedSnapshot);
 if(cachedMetadata.items.length!==2||
    cachedMetadata.items.some(x=>x.title==="Private fixture"||Object.keys(x).some(k=>!["id","title","publishedAt","thumbnail"].includes(k)))||
    cachedSnapshot.includes("SYNTHETIC_ONLY")||cachedSnapshot.includes("token"))
   throw Error("Private or credential-like data entered local cache");
 const onlyKeys=await ev('Object.keys(window.localStorage).sort()');
 if(onlyKeys.length!==2||onlyKeys[0]!=="sf6-coach-owner-unlisted-list-v1"||
    onlyKeys[1]!=="sf6-coach-public-google-oauth-client-id-v1")
   throw Error("Unexpected persistent browser keys: "+JSON.stringify(onlyKeys));
 const beforeRefresh=await ev('window.__syntheticCalls');
 await ev('document.querySelector("#youtubeRefresh").click()');
 await until(async()=>await ev('window.__syntheticCalls >= '+(beforeRefresh+3)));
 if((await ev('window.__lastOAuthPrompt'))!=="")throw Error("Refresh with active token unnecessarily changed OAuth prompt");


 const library=await ev('({titles:[...document.querySelectorAll("#youtubeList .youtube-card strong")].map(x=>x.textContent),apiCalls:window.__syntheticCalls})');
 if(library.titles.some(x=>x.includes("Private")))throw Error("Private video displayed");
 await ev('document.querySelector("#youtubeQuery").value="Ed";document.querySelector("#youtubeQuery").dispatchEvent(new Event("input",{bubbles:true}));true');
 await until(async()=>await ev('document.querySelectorAll("#youtubeList .youtube-card").length===1'));
 await ev('document.querySelector("#youtubeList .youtube-card").click()');
 await until(async()=>await ev('document.querySelector("#youtubeNext").disabled===false'));
 await ev('document.querySelector("#youtubeNext").click()');
 await until(async()=>await ev('document.querySelector("#youtubeSeekLog").textContent.includes("未証明")'),5000);
 // Ten rapid taps arrive before getCurrentTime reflects any seek; every target
 // must accumulate instead of repeating the identical 1/30s request.
 const base=await ev('window.__ytPlayers[0].getCurrentTime()');
 await ev('(()=>{for(let i=0;i<10;i++)document.querySelector("#youtubeNext").click();return true})()');
 const forward=await ev('window.__ytPlayers[0].requests.slice(-10)');
 for(let i=0;i<10;i++){
   if(Math.abs(forward[i]-(base+(i+1)/30))>0.001)throw Error("Rapid +seek did not accumulate at step "+i);
 }
 await ev('(()=>{for(let i=0;i<10;i++)document.querySelector("#youtubePrev").click();return true})()');
 const reverse=await ev('window.__ytPlayers[0].requests.slice(-10)');
 for(let i=0;i<10;i++){
   if(Math.abs(reverse[i]-(base+(9-i)/30))>0.001)throw Error("Rapid -seek did not reverse at step "+i);
 }
 await until(async()=>await ev('Math.abs(window.__ytPlayers[0].getCurrentTime()-'+JSON.stringify(base)+')<0.001'));
 if(!(await ev('window.__ytPlayers[0].getPlayerState()===2')))throw Error("Rapid seek resumed playback");
 // Verify 10-step and five-second presets use time offsets without frame claims.
 await ev('document.querySelector("#youtubeNextTen").click()');
 let target=await ev('window.__ytPlayers[0].requests.at(-1)');
 if(Math.abs(target-(base+10/30))>0.001)throw Error("10-step preset wrong");
 await ev('document.querySelector("#youtubePrevTen").click()');
 target=await ev('window.__ytPlayers[0].requests.at(-1)');
 if(Math.abs(target-base)>0.001)throw Error("reverse 10-step preset wrong");
 await ev('document.querySelector("#youtubeNextFive").click()');
 target=await ev('window.__ytPlayers[0].requests.at(-1)');
 if(Math.abs(target-(base+5))>0.001)throw Error("+5s preset wrong");
 await ev('document.querySelector("#youtubePrevFive").click()');
 target=await ev('window.__ytPlayers[0].requests.at(-1)');
 if(Math.abs(target-base)>0.001)throw Error("-5s preset wrong");
 await ev('document.querySelector("#youtubeNext").click()');
 await until(async()=>await ev('Math.abs(window.__ytPlayers[0].getCurrentTime()-'+JSON.stringify(base+1/30)+')<0.001'));
 await ev('document.querySelector("#youtubeShare").click()');
 const ownerLink=await ev('document.querySelector("#youtubeShareLink").value');
 const friendUrl=new URL(ownerLink);
 if(!friendUrl.pathname.endsWith("/youtube-share.html")||
    friendUrl.searchParams.get("v")!=="AAAAAAAAAAA"||
    friendUrl.searchParams.get("t")!=="5"||friendUrl.searchParams.size!==2||
    ownerLink.includes("Mock Ed")||ownerLink.includes("SYNTHETIC_ONLY")||ownerLink.includes("対空"))
    throw Error("Guest share URL included unexpected data or invalid parameters");
 await ev('document.querySelector("#youtubeNote").value="対空の確認";document.querySelector("#youtubeCopy").click()');
 await until(async()=>await ev('document.querySelector("#youtubeHandoff").value.includes("対空の確認")'));
 const handoff=await ev('document.querySelector("#youtubeHandoff").value');
 if(!handoff.includes("Mock Ed Match")||!handoff.includes("AI"))throw Error("Manual copy handoff missing");
 const expectedMs=Math.round((base+1/30)*1000);
 const expectedTime="00:"+String(Math.floor(expectedMs/1000)).padStart(2,"0")+"."+String(expectedMs%1000).padStart(3,"0");
 if(!handoff.includes("時刻: "+expectedTime))throw Error("Subsecond handoff lost: "+handoff);
 if(!handoff.includes("URLの再生開始は秒単位"))throw Error("Coarse YouTube URL not labeled");
 if(!handoff.includes("直近のシーク要求"))throw Error("Seek request not distinguished from API time");
 await ev('document.querySelector("#youtubeQuery").value="";document.querySelector("#youtubeQuery").dispatchEvent(new Event("input",{bubbles:true}));document.querySelectorAll("#youtubeList .youtube-card")[1].click();true');
 await until(async()=>await ev('document.querySelector("#youtubeCurrentTitle").textContent==="Mock Alex Match"'));
 await ev('document.querySelector("#youtubeClear").click()');
 await until(async()=>await ev('document.querySelectorAll("#youtubeList .youtube-card").length===0 && document.querySelector("#youtubePlayer").childElementCount===0'));
 if(await ev('window.localStorage.getItem("sf6-coach-owner-unlisted-list-v1")!==null'))
   throw Error("Logout did not immediately clear persisted YouTube list");
 const cleared=await ev('({tokenField:document.querySelector("#youtubeClientId").value,selected:document.querySelector("#youtubeCurrentTitle").textContent})');
 if(cleared.tokenField!==remembered)throw Error("Clear lost the saved public client ID");
 if(await ev('document.querySelector("#youtubeShareLink").value!==""'))throw Error("Shared URL survived logout");
 await ev('document.querySelector("#youtubeBack").click()');
 await ev('document.querySelector("#youtubeOpen").click()');
 const reused=await ev('document.querySelector("#youtubeClientId").value');
 if(reused!==remembered)throw Error("Returning to owner mode required Client ID reentry");
 await ev('document.querySelector("#youtubeForgetClientId").click()');
 const forgotten=await ev('({field:document.querySelector("#youtubeClientId").value,saved:window.localStorage.getItem("sf6-coach-public-google-oauth-client-id-v1")})');
 if(forgotten.field||forgotten.saved)throw Error("Forget ID did not clear browser storage and input");
 await ev('document.querySelector(\'meta[name="sf6-youtube-oauth-client-id"]\').content="1234567890-site.apps.googleusercontent.com";document.querySelector("#youtubeBack").click();document.querySelector("#youtubeOpen").click()');
 const configured=await ev('({field:document.querySelector("#youtubeClientId").value,hidden:document.querySelector("#youtubeClientIdRow").hidden,forgetHidden:document.querySelector("#youtubeForgetClientId").hidden})');
 if(!configured.hidden||!configured.forgetHidden||configured.field!=="1234567890-site.apps.googleusercontent.com")throw Error("Site-wide OAuth ID not auto-configured");
 await ev('document.querySelector("#youtubeBack").click()');
 const finish=await ev('({local:!document.querySelector("#viewer").hidden,youtubeHidden:document.querySelector("#youtubeReviewPanel").hidden,source:document.querySelector("#sourceBadge").textContent})');
 if(!finish.local||!finish.youtubeHidden||!finish.source.includes("LOCAL VIDEO"))throw Error("Local reviewer not restored");
 if(apiRequests.length||external.length)throw Error("Mock browser unexpectedly sent real private Google/YouTube network requests");
 // A subsequent visit to this device MUST show the previous owner list
 // without clicking Google OAuth. Reuse the cache created by the real opt-in path.
 await ev('window.localStorage.setItem("sf6-coach-owner-unlisted-list-v1",'+JSON.stringify(cachedSnapshot)+');window.localStorage.setItem("sf6-coach-public-google-oauth-client-id-v1",'+JSON.stringify("1234567890-abcd.apps.googleusercontent.com")+');true');
 const beforeReloadApiCalls=apiRequests.length;
 await send("Page.enable");
 await send("Page.reload",{ignoreCache:true});
 await until(async()=>await ev('document.readyState==="complete"&&document.querySelector("#youtubeReviewPanel")&&!document.querySelector("#youtubeReviewPanel").hidden&&document.querySelectorAll("#youtubeList .youtube-card").length===2'));
 const restored=await ev('({cachedLabel:document.querySelector("#youtubeCount").textContent,notice:document.querySelector("#youtubeCacheNotice").textContent,keep:document.querySelector("#youtubeKeepList").checked,consent:document.querySelector("#youtubeConsent").checked,items:[...document.querySelectorAll("#youtubeList .youtube-card strong")].map(x=>x.textContent)})');
 if(!restored.cachedLabel.includes("前回保存")||!restored.notice.includes("最終同期")||
    !restored.keep||!restored.consent||restored.items.length!==2)
   throw Error("Returning visitor cache not shown or not labeled stale: "+JSON.stringify(restored));
 if(apiRequests.length!==beforeReloadApiCalls)throw Error("Cached visit made an authenticated YouTube Data API request");
 // Disabling/re-enabling local cache must preserve the original synchronizedAt;
 // it must never silently extend the 30-day authorized-data retention window.
 await ev('document.querySelector("#youtubeKeepList").checked=false;document.querySelector("#youtubeKeepList").dispatchEvent(new Event("change",{bubbles:true}));true');
 if(await ev('window.localStorage.getItem("sf6-coach-owner-unlisted-list-v1")!==null'))
   throw Error("Opt-out failed to remove saved owner list");
 if(!(await ev('document.querySelector("#youtubeCacheNotice").textContent.includes("解除済み")')))
   throw Error("Opt-out left a misleading stored-cache label");
 await ev('document.querySelector("#youtubeKeepList").checked=true;document.querySelector("#youtubeKeepList").dispatchEvent(new Event("change",{bubbles:true}));true');
 const restoredAt=await ev('JSON.parse(window.localStorage.getItem("sf6-coach-owner-unlisted-list-v1")).savedAt');
 if(restoredAt!==cachedMetadata.savedAt)
   throw Error("Re-opt-in silently extended 30-day cache lifetime");
 // Loading the cached video needs NO owner Google token. Stub the official player
 // only for synthetic verification; don't contact real YouTube.
 await ev('window.YT={PlayerState:{PLAYING:1,PAUSED:2},Player:class{constructor(host,config){this.host=host;this.time=5;this.state=2;this.events=config.events;setTimeout(()=>config.events.onReady({target:this}),5)}getPlayerState(){return this.state}getCurrentTime(){return this.time}getDuration(){return 120}pauseVideo(){this.state=2}seekTo(v){this.time=v}cueVideoById(){}destroy(){this.host.remove()}}};true');
 await ev('document.querySelector("#youtubeList .youtube-card").click()');
 await until(async()=>await ev('document.querySelector("#youtubeNext").disabled===false'));
 await ev('document.querySelector("#youtubeShare").click()');
 const cachedShare=await ev('document.querySelector("#youtubeShareLink").value');
 if(!cachedShare.includes("v=AAAAAAAAAAA"))throw Error("Cached video failed share-link handoff");
 await ev('document.querySelector("#youtubeForgetList").click()');
 if(await ev('window.localStorage.getItem("sf6-coach-owner-unlisted-list-v1")!==null||document.querySelectorAll("#youtubeList .youtube-card").length!==0'))
   throw Error("Forget saved list left persistent or visible owner metadata");
 console.log("B3 OWNER CACHE BROWSER PASS",JSON.stringify({restored,friendShareHasUrl:!!cachedShare}));
 ws.close();
}
try{await main();}finally{for(const p of procs){try{p.kill("SIGTERM");}catch{}}try{rmSync(dir,{recursive:true,force:true});}catch{}}
