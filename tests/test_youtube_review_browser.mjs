// Browser-only smoke test for B0 mock UI. Does not ask Google for tokens or read private uploads.
import {spawn} from "node:child_process";
import {request} from "node:http";
function localRequest(url,method="GET"){return new Promise((resolve,reject)=>{const req=request(url,{method},res=>{let data="";res.setEncoding("utf8");res.on("data",c=>data+=c);res.on("end",()=>resolve({status:res.statusCode,data}));});req.on("error",reject);req.end();});}
import {mkdtempSync,readFileSync,writeFileSync,rmSync,mkdirSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
const evidence=process.env.SF6_QA_DIR||join(process.cwd(),"docs/qa/pr23");mkdirSync(evidence,{recursive:true});
const dir=mkdtempSync(join(tmpdir(),"sf6-b0-browser-"));const procs=[];
function launch(program,args,opts={}){const p=spawn(program,args,{...opts,stdio:["ignore","ignore","pipe"]});
 p.stderr.on("data",chunk=>{writeFileSync(join(evidence,program.includes("chrom")?"browser-startup.log":"server.log"),chunk,{flag:"a"});});
 p.on("error",e=>writeFileSync(join(evidence,"startup-error.log"),String(e)));procs.push(p);return p;}
async function until(f,ms=16000){
 const stop=Date.now()+ms;
 while(Date.now()<stop){try{const x=await f();if(x)return x;}catch{}await new Promise(r=>setTimeout(r,200));}
 throw Error("Timeout in B0 mock browser smoke");
}
async function main(){
 for(const file of ["youtube-studio-support.mjs","youtube-player-controls.mjs","youtube-share.mjs","youtube-share.html","index.html","youtube-review.mjs","youtube-library-core.mjs","youtube-library-cache.mjs","youtube-seek-core.mjs","youtube-privacy.html"]){
  const input=readFileSync(new URL("../"+file,import.meta.url),"utf8");
  writeFileSync(join(dir,file),input);
 }
 launch("python3",["-m","http.server","18777","--bind","127.0.0.1"],{cwd:dir});
 await until(async()=> (await localRequest("http://127.0.0.1:18777/index.html")).status===200);
 launch(process.env.CHROME_BIN||"google-chrome",
  ["--headless=new","--no-sandbox","--disable-gpu","--disable-dev-shm-usage",
   "--remote-allow-origins=*","--remote-debugging-port=18778",
   "--user-data-dir="+join(dir,"chrome-profile"),"--no-first-run"]);
 const tab=await until(async()=>{
  const r=await localRequest("http://127.0.0.1:18778/json/new?http://127.0.0.1:18777/index.html","PUT");
  return r.status===200?JSON.parse(r.data):null;
 });
 const ws=new WebSocket(tab.webSocketDebuggerUrl);
 await new Promise((res,rej)=>{ws.addEventListener("open",res,{once:true});ws.addEventListener("error",rej,{once:true});});
 let serial=0;const pending=new Map();const apiRequests=[];const external=[];const consoleErrors=[];
 ws.addEventListener("message",e=>{
  const m=JSON.parse(e.data);
  if(m.method==="Runtime.exceptionThrown")consoleErrors.push(m.params.exceptionDetails);
  if(m.method==="Runtime.consoleAPICalled"&&m.params.type==="error")consoleErrors.push(m.params.args);
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
 async function mockGoogle(){
  await ev('window.google={accounts:{oauth2:{initTokenClient:({callback})=>({requestAccessToken:(args)=>{window.__lastOAuthPrompt=args?.prompt;callback({access_token:"SYNTHETIC_ONLY"})}}),hasGrantedAllScopes:()=>true,revoke:(_t,cb)=>cb({successful:true})}}};true');
 }
 await send("Runtime.enable");await send("Network.enable");await send("Page.enable");

 await until(async()=>await ev('document.readyState==="complete" && !!document.querySelector("#youtubeOpen")'));
 await send("Emulation.setDeviceMetricsOverride",{width:375,height:812,deviceScaleFactor:2,mobile:true});
 await send("Emulation.setDeviceMetricsOverride",{width:375,height:812,deviceScaleFactor:2,mobile:true});
 await new Promise(r=>setTimeout(r,300));
 const start=await ev('({viewer:!document.querySelector("#viewer").hidden,youtube:document.querySelector("#youtubeReviewPanel").hidden,hasFile:!!document.querySelector("#fileInput")})');
 if(!start.viewer||!start.youtube||!start.hasFile)throw Error("Local reviewer changed by B3");
 if(await ev('document.body.dataset.reviewMode!=="home"'))throw Error("First visit bypassed mode choice");
 if(await ev('getComputedStyle(document.querySelector(".workarea")).display!=="none"'))throw Error("Home exposed a review workspace");
 // Inject synthetic Google/YT browser APIs only after load; no real OAuth, uploads or CDN.
 await mockGoogle();
 // Delayed API time intentionally emulates the asynchronous official YouTube iframe.
 await ev('window.__ytPlayers=[];window.YT={PlayerState:{PLAYING:1,PAUSED:2},Player:class{constructor(host,config){this.host=host;this.events=config.events;this.time=5;this.state=2;this.requests=[];this.generation=0;window.__ytPlayers.push(this);host.textContent="SYNTHETIC YT PLAYER";setTimeout(()=>config.events.onReady({target:this}),5)}getPlayerState(){return this.state}getCurrentTime(){return this.time}getDuration(){return 120}playVideo(){this.state=1;this.events.onStateChange({target:this,data:1})}pauseVideo(){this.state=2;this.events.onStateChange({target:this,data:2})}cueVideoById(_id){this.generation++;this.time=5;this.state=2;this.events.onStateChange({target:this,data:2})}seekTo(v){this.requests.push(v);const gen=this.generation;setTimeout(()=>{if(gen===this.generation)this.time=v},120)}destroy(){this.generation++;this.host.remove()}}};true');
 await ev('window.__syntheticCalls=0;const originalFetch=window.fetch.bind(window);window.fetch=(url,opts)=>{const x=String(url);if(!x.startsWith("https://www.googleapis.com/youtube/v3/"))return originalFetch(url,opts);window.__syntheticCalls++;const u=new URL(x),op=u.pathname.split("/").pop();let d;if(op==="channels")d={items:[{contentDetails:{relatedPlaylists:{uploads:"UUdemo"}}}]};else if(op==="playlistItems")d={items:[{contentDetails:{videoId:"AAAAAAAAAAA"}},{contentDetails:{videoId:"BBBBBBBBBBB"}},{contentDetails:{videoId:"CCCCCCCCCCC"}}]};else if(op==="videos")d={items:[{id:"AAAAAAAAAAA",status:{privacyStatus:"unlisted"},snippet:{title:"Mock Ed Match",publishedAt:"2026-11-15T02:00:00Z"}},{id:"BBBBBBBBBBB",status:{privacyStatus:"unlisted"},snippet:{title:"Mock Alex Match",publishedAt:"2026-11-14T02:00:00Z"}},{id:"CCCCCCCCCCC",status:{privacyStatus:"private"},snippet:{title:"Private fixture"}}]};else throw Error("Unknown mock API "+op);return Promise.resolve(new Response(JSON.stringify(d),{status:200,headers:{"Content-Type":"application/json"}}))};true');
 await ev('document.querySelector("#youtubeOpen").click()');
 await until(async()=>await ev('!document.querySelector("#youtubeReviewPanel").hidden'));
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
 // End-to-end filtering in the owner library (without a YouTube search API call).
 for(const [query,expected] of [["Ed",1],["Ed Match",1],["Match ED",1],["Ed  Match",1],["Ed Alex",0],["   ",2]]){
   await ev('document.querySelector("#youtubeQuery").value='+JSON.stringify(query)+';document.querySelector("#youtubeQuery").dispatchEvent(new Event("input",{bubbles:true}));true');
   const count=await ev('document.querySelectorAll("#youtubeList .youtube-card").length');
   if(count!==expected)throw Error("AND title search failed for "+JSON.stringify(query)+": "+count+" != "+expected);
 }
 await ev('document.querySelector("#youtubeQuery").value="Ed Match";document.querySelector("#youtubeQuery").dispatchEvent(new Event("input",{bubbles:true}));true');
 await until(async()=>await ev('document.querySelectorAll("#youtubeList .youtube-card").length===1'));
 await ev('document.querySelector("#youtubeList .youtube-card").click()');
 await until(async()=>await ev('document.querySelector("#youtubeNext").disabled===false'));
 if(await ev('document.querySelector("#youtubePause").textContent!=="再生"'))throw Error("Paused owner should show play");
 await ev('document.querySelector("#youtubePause").click()');
 if(await ev('window.__ytPlayers[0].getPlayerState()!==1||document.querySelector("#youtubePause").textContent!=="一時停止"'))
   throw Error("Owner pause/play toggle did not play");
 await ev('document.querySelector("#youtubePause").click()');
 if(await ev('window.__ytPlayers[0].getPlayerState()!==2||document.querySelector("#youtubePause").textContent!=="再生"'))
   throw Error("Owner pause/play toggle did not pause");
 const geometry=[];
 const ids=["youtubePause","youtubePrevTen","youtubeNextTen","youtubePrev","youtubeNext","youtubePrevFive","youtubeNextFive","youtubePrevSec","youtubeNextSec"];
 async function screenshot(name){const shot=await send("Page.captureScreenshot",{format:"png"});writeFileSync(join(evidence,name+".png"),Buffer.from(shot.data,"base64"));}
 async function measure(){return ev('(()=>{const r=id=>{const x=document.getElementById(id).getBoundingClientRect();return{x:x.x,y:x.y,w:x.width,h:x.height,bottom:x.bottom}};return{width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,player:r("youtubePlayer"),controls:Object.fromEntries('+JSON.stringify(ids)+'.map(id=>[id,r(id)]))}})()');}
 await ev('document.documentElement.style.scrollBehavior="auto";true');
 for(const [width,height] of [[375,812],[390,844],[1280,720],[1440,1024],[1366,600]]){
   const mobile=width<761;
   await send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile});
   await ev('window.scrollTo(0,0);true');
   const g=await measure();
   if(g.width!==width||g.scrollWidth>width+.5)throw Error("Viewport overflow "+JSON.stringify(g));
   for(const [id,r] of Object.entries(g.controls))if(r.w<44||r.h<44)throw Error("Small tap target "+id+JSON.stringify(g));
   for(const [a,b] of [["youtubePrevFive","youtubeNextFive"],["youtubePrevSec","youtubeNextSec"],["youtubePrevTen","youtubeNextTen"],["youtubePrev","youtubeNext"]]){
     const x=g.controls[a],y=g.controls[b];
     if(x.x+x.w>y.x||Math.abs(x.y-y.y)>1)throw Error("Backward/forward pair shuffled "+JSON.stringify(g));
   }
   const fineBottom=Math.max(...["youtubePrevTen","youtubeNextTen","youtubePrev","youtubeNext"].map(id=>g.controls[id].bottom));
   const secondsTop=Math.min(...["youtubePrevFive","youtubeNextFive","youtubePrevSec","youtubeNextSec"].map(id=>g.controls[id].y));
   if(fineBottom>secondsTop)throw Error("Fine seeks not above seconds "+JSON.stringify(g));
   if(Math.abs(g.player.w/g.player.h-16/9)>.025)throw Error("Player aspect ratio changed");
   if(!mobile&&(g.player.y<0||Math.max(...Object.values(g.controls).map(r=>r.bottom))>height))throw Error("Player or LAST control below viewport "+JSON.stringify(g));
   await screenshot(width+"x"+height+"-review");geometry.push(g);
   const beforeStudio=await ev('({time:window.__ytPlayers[0].getCurrentTime(),state:window.__ytPlayers[0].getPlayerState(),title:document.querySelector("#youtubeCurrentTitle").textContent})');
   await ev('document.querySelector("#youtubeStudioOpen").click();true');
   if(!(await ev('document.querySelector("#youtubeStudioDialog").open&&document.querySelector("#youtubeStudioDialog").contains(document.activeElement)')))throw Error("Studio dialog focus missing");
   const studioGeometry=await ev('(()=>{const d=document.querySelector("#youtubeStudioDialog"),r=d.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,overflow:d.scrollWidth>d.clientWidth+1,targets:[...d.querySelectorAll("button,a")].map(el=>{const r=el.getBoundingClientRect();return{w:r.width,h:r.height}})}})()');
   if(studioGeometry.x<0||studioGeometry.y<0||studioGeometry.right>width+.5||studioGeometry.bottom>height+.5||studioGeometry.overflow||studioGeometry.targets.some(r=>r.w<44||r.h<44))throw Error("Studio dialog overflow/target regression "+JSON.stringify(studioGeometry));
   g.studio=studioGeometry;
   await send("Input.dispatchKeyEvent",{type:"keyDown",key:"Tab",code:"Tab",windowsVirtualKeyCode:9});
   await send("Input.dispatchKeyEvent",{type:"keyUp",key:"Tab",code:"Tab",windowsVirtualKeyCode:9});
   if(!(await ev('document.querySelector("#youtubeStudioDialog").contains(document.activeElement)')))throw Error("Studio dialog focus escaped");
   if(await ev('document.querySelector("#youtubeStudioLink").href!=="https://studio.youtube.com/"'))throw Error("Studio destination changed");
   await ev('document.querySelector("#youtubeStudioCopyKeyword").click();true');
   await until(async()=>await ev('document.querySelector("#youtubeStudioStatus").textContent.length>0'));
   await screenshot(width+"x"+height+"-studio");
   await ev('document.querySelector("#youtubeStudioLink").focus();document.querySelector("#youtubeStudioDialog").scrollTop=document.querySelector("#youtubeStudioDialog").scrollHeight;true');
   const studioBottom=await ev('(()=>{const d=document.querySelector("#youtubeStudioDialog");return{scrollTop:d.scrollTop,remaining:d.scrollHeight-d.clientHeight-d.scrollTop}})()');
   if(studioBottom.remaining>1)throw Error("Studio guide could not be scrolled into view");
   g.studioScroll=studioBottom;
   await screenshot(width+"x"+height+"-studio-guide");
   await send("Input.dispatchKeyEvent",{type:"keyDown",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});
   await send("Input.dispatchKeyEvent",{type:"keyUp",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});
   await until(async()=>await ev('!document.querySelector("#youtubeStudioDialog").open&&document.activeElement.id==="youtubeStudioOpen"'));
   await ev('document.querySelector("#youtubeStudioOpen").click();document.querySelector("#youtubeStudioDialog [data-close-dialog]").click();true');
   await until(async()=>await ev('!document.querySelector("#youtubeStudioDialog").open&&document.activeElement.id==="youtubeStudioOpen"'));
   const afterStudio=await ev('({time:window.__ytPlayers[0].getCurrentTime(),state:window.__ytPlayers[0].getPlayerState(),title:document.querySelector("#youtubeCurrentTitle").textContent})');
   if(JSON.stringify(beforeStudio)!==JSON.stringify(afterStudio))throw Error("Studio changed replay state");

   // Tab switching preserves the selected replay and note, without mounting a new player.
   if(mobile){
     await ev('document.querySelector("#youtubeNote").value="layout-test-note";document.querySelector("#youtubeLibraryTab").click();true');
     if(!(await ev('getComputedStyle(document.querySelector("#youtubeLibraryPane")).display!=="none"&&getComputedStyle(document.querySelector("#youtubeMemoPane")).display==="none"')))throw Error("Library tab failed");
     await screenshot(width+"x"+height+"-library");
     await ev('document.querySelector("#youtubeMemoTab").click();true');
     if(!(await ev('getComputedStyle(document.querySelector("#youtubeMemoPane")).display!=="none"&&document.querySelector("#youtubeNote").value==="layout-test-note"')))throw Error("Memo tab failed");
   }
   await ev('document.querySelector("[data-settings]").click();true');
   if(!(await ev('document.querySelector("#youtubeSettings").open&&document.querySelector("#youtubeSettings").contains(document.activeElement)')))throw Error("Settings focus missing");
   await send("Input.dispatchKeyEvent",{type:"keyDown",key:"Tab",code:"Tab",windowsVirtualKeyCode:9});
   await send("Input.dispatchKeyEvent",{type:"keyUp",key:"Tab",code:"Tab",windowsVirtualKeyCode:9});
   if(!(await ev('document.querySelector("#youtubeSettings").contains(document.activeElement)')))throw Error("Dialog focus escaped");
   await screenshot(width+"x"+height+"-settings");
   await ev('document.querySelector("#youtubeSettings [data-close-dialog]").click();document.querySelector("#youtubeBack").click();true');
   if(!(await ev('document.body.dataset.reviewMode==="home"&&getComputedStyle(document.querySelector(".workarea")).display==="none"')))throw Error("Mode choice failed");
   await screenshot(width+"x"+height+"-home");
   await ev('document.querySelector("#localOpen").click();true');
   if(!(await ev('document.body.dataset.reviewMode==="local"&&document.querySelector("#youtubeReviewPanel").hidden')))throw Error("Local mode isolation failed");
   await screenshot(width+"x"+height+"-local");
   await ev('document.querySelector("[data-home]").click();document.querySelector("#youtubeOpen").click();window.scrollTo(0,0);true');
   if(!(await ev('document.querySelector("#viewer").hidden&&getComputedStyle(document.querySelector("#insight")).display==="none"&&scrollY===0')))throw Error("YouTube isolation/scroll failed");
 }
 if(consoleErrors.length)throw Error("Console errors: "+JSON.stringify(consoleErrors));
 writeFileSync(join(evidence,"layout-results.json"),JSON.stringify({geometry,consoleErrors,engine:"Chromium emulation, not physical iPhone Safari"},null,2));
 await send("Emulation.setDeviceMetricsOverride",{width:375,height:812,deviceScaleFactor:2,mobile:true});
 const mobileGeometry=geometry[0],observedDesktop=geometry.filter(x=>x.width>760);

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
 if(!finish.local||!finish.youtubeHidden||!finish.source.includes("リプレイレビュー")||await ev('document.body.dataset.reviewMode!=="home"'))throw Error("Mode choice/home state not restored: "+JSON.stringify(finish));
 if(apiRequests.length||external.length)throw Error("Mock browser unexpectedly sent real private Google/YouTube network requests");
 // A subsequent visit to this device MUST show the previous owner list
 // without clicking Google OAuth. Reuse the cache created by the real opt-in path.
 await ev('window.localStorage.setItem("sf6-coach-owner-unlisted-list-v1",'+JSON.stringify(cachedSnapshot)+');window.localStorage.setItem("sf6-coach-public-google-oauth-client-id-v1",'+JSON.stringify("1234567890-abcd.apps.googleusercontent.com")+');true');
 const beforeReloadApiCalls=apiRequests.length;
 await send("Page.enable");
 await send("Page.reload",{ignoreCache:true});
 await until(async()=>await ev('document.readyState==="complete"&&document.body.dataset.reviewMode==="home"'));
 if(await ev('document.querySelectorAll("#youtubeList .youtube-card").length!==0'))throw Error("Cached revisit bypassed mode selection");
 // Reload discards the mock. Reinstall it before opening the owner mode, which
 // otherwise preloads GIS even if no OAuth request is made.
 await mockGoogle();
 await ev('document.querySelector("#youtubeOpen").click()');
 await until(async()=>await ev('document.querySelectorAll("#youtubeList .youtube-card").length===2'));
 const restored=await ev('({cachedLabel:document.querySelector("#youtubeCount").textContent,notice:document.querySelector("#youtubeCacheNotice").textContent,keep:document.querySelector("#youtubeKeepList").checked,consent:document.querySelector("#youtubeConsent").checked,items:[...document.querySelectorAll("#youtubeList .youtube-card strong")].map(x=>x.textContent)})');
 if(!restored.cachedLabel.includes("前回保存")||!restored.notice.includes("最終同期")||
    !restored.keep||!restored.consent||restored.items.length!==2)
   throw Error("Returning visitor cache not shown or not labeled stale: "+JSON.stringify(restored));
 if(apiRequests.length!==beforeReloadApiCalls||await ev('window.__lastOAuthPrompt!==undefined'))
   throw Error("Cached visit requested OAuth or made a YouTube Data API request");
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
 if(external.length)throw Error("Owner cache scenario opened external resources: "+JSON.stringify(external));
 // Guest layout is visually measured across the same five viewport sizes.
 // Do not click "open video" in the network-isolated browser: API behavior is
 // independently exercised with synthetic Node mocks and needs real Safari QA.
 await send("Page.navigate",{url:"http://127.0.0.1:18777/youtube-share.html?v=AAAAAAAAAAA&t=5"});
 await until(async()=>await ev('document.readyState==="complete"&&document.querySelector("#shareValid")?.hidden===false'));
 if(await ev('document.querySelector("#shareFrame iframe")!==null||document.querySelector("#shareControls").hidden!==true'))
   throw Error("Guest loaded media or enabled controls before user click");
 await ev('document.querySelector("#shareControls").hidden=false;true');
 for(const [width,height] of [[375,812],[390,844],[1280,720],[1440,1024],[1366,600]]){
   await send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width<761});
   const g=await ev('(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,targets:[...document.querySelectorAll("#shareControls button")].map(el=>{const r=el.getBoundingClientRect();return{width:r.width,height:r.height,left:r.left,right:r.right}})}))()');
   if(g.scrollWidth>width+.5||g.targets.length!==9||
     g.targets.some(x=>x.width<44||x.height<44||x.left<0||x.right>width+.5))
     throw Error("Guest controls overflow or tap targets too small: "+JSON.stringify(g));
   await screenshot(width+"x"+height+"-guest-controls");
 }
 if(external.length)throw Error("Guest opened external resources without user action: "+JSON.stringify(external));
 if(consoleErrors.length)throw Error("Console errors: "+JSON.stringify(consoleErrors));
 console.log("B3 OWNER CACHE / GUEST LAYOUT BROWSER PASS",JSON.stringify({restored,friendShareHasUrl:!!cachedShare}));
 ws.close();
}
try{await main();}finally{for(const p of procs){try{p.kill("SIGTERM");}catch{}}try{rmSync(dir,{recursive:true,force:true});}catch{}}
