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
 for(const file of ["index.html","youtube-review.mjs","youtube-library-core.mjs","youtube-seek-core.mjs","youtube-privacy.html"]){
  const input=readFileSync(new URL("./"+file,import.meta.url),"utf8");
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
 await new Promise(r=>setTimeout(r,300));
 const start=await ev('({viewer:!document.querySelector("#viewer").hidden,youtube:document.querySelector("#youtubeReviewPanel").hidden,hasFile:!!document.querySelector("#fileInput")})');
 if(!start.viewer||!start.youtube||!start.hasFile)throw Error("Local reviewer changed by B3");
 // Inject synthetic Google/YT browser APIs only after load; no real OAuth, uploads or CDN.
 await ev('window.google={accounts:{oauth2:{initTokenClient:({callback})=>({requestAccessToken:()=>callback({access_token:"SYNTHETIC_ONLY"})}),hasGrantedAllScopes:()=>true,revoke:(_t,cb)=>cb({successful:true})}}};true');
 await ev('window.YT={PlayerState:{PLAYING:1,PAUSED:2},Player:class{constructor(host,config){this.host=host;this.events=config.events;this.time=5;this.state=2;host.textContent="SYNTHETIC YT PLAYER";setTimeout(()=>config.events.onReady({target:this}),5)}getPlayerState(){return this.state}getCurrentTime(){return this.time}getDuration(){return 120}pauseVideo(){this.state=2;this.events.onStateChange({target:this,data:2})}cueVideoById(_id){this.time=5;this.state=2;this.events.onStateChange({target:this,data:2})}seekTo(v){this.time=v}destroy(){this.host.remove()}}};true');
 await ev('window.__syntheticCalls=0;const originalFetch=window.fetch.bind(window);window.fetch=(url,opts)=>{const x=String(url);if(!x.startsWith("https://www.googleapis.com/youtube/v3/"))return originalFetch(url,opts);window.__syntheticCalls++;const u=new URL(x),op=u.pathname.split("/").pop();let d;if(op==="channels")d={items:[{contentDetails:{relatedPlaylists:{uploads:"UUdemo"}}}]};else if(op==="playlistItems")d={items:[{contentDetails:{videoId:"AAAAAAAAAAA"}},{contentDetails:{videoId:"BBBBBBBBBBB"}},{contentDetails:{videoId:"CCCCCCCCCCC"}}]};else if(op==="videos")d={items:[{id:"AAAAAAAAAAA",status:{privacyStatus:"unlisted"},snippet:{title:"Mock Ed Match",publishedAt:"2026-11-15T02:00:00Z"}},{id:"BBBBBBBBBBB",status:{privacyStatus:"unlisted"},snippet:{title:"Mock Alex Match",publishedAt:"2026-11-14T02:00:00Z"}},{id:"CCCCCCCCCCC",status:{privacyStatus:"private"},snippet:{title:"Private fixture"}}]};else throw Error("Unknown mock API "+op);return Promise.resolve(new Response(JSON.stringify(d),{status:200,headers:{"Content-Type":"application/json"}}))};true');
 await ev('document.querySelector("#youtubeOpen").click()');
 await until(async()=>await ev('!document.querySelector("#youtubeReviewPanel").hidden'));
 await ev('document.querySelector("#youtubeClientId").value="1234567890-abcd.apps.googleusercontent.com";document.querySelector("#youtubeConsent").checked=true;document.querySelector("#youtubeConnect").click();true');
 await until(async()=>await ev('document.querySelectorAll("#youtubeList .youtube-card").length===2'));
 const library=await ev('({titles:[...document.querySelectorAll("#youtubeList .youtube-card strong")].map(x=>x.textContent),apiCalls:window.__syntheticCalls})');
 if(library.titles.some(x=>x.includes("Private")))throw Error("Private video displayed");
 await ev('document.querySelector("#youtubeQuery").value="Ed";document.querySelector("#youtubeQuery").dispatchEvent(new Event("input",{bubbles:true}));true');
 await until(async()=>await ev('document.querySelectorAll("#youtubeList .youtube-card").length===1'));
 await ev('document.querySelector("#youtubeList .youtube-card").click()');
 await until(async()=>await ev('document.querySelector("#youtubeNext").disabled===false'));
 await ev('document.querySelector("#youtubeNext").click()');
 await until(async()=>await ev('document.querySelector("#youtubeSeekLog").textContent.includes("未証明")'),5000);
 await ev('document.querySelector("#youtubeNote").value="対空の確認";document.querySelector("#youtubeCopy").click()');
 await until(async()=>await ev('document.querySelector("#youtubeHandoff").value.includes("対空の確認")'));
 const handoff=await ev('document.querySelector("#youtubeHandoff").value');
 if(!handoff.includes("Mock Ed Match")||!handoff.includes("AI"))throw Error("Manual copy handoff missing");
 await ev('document.querySelector("#youtubeQuery").value="";document.querySelector("#youtubeQuery").dispatchEvent(new Event("input",{bubbles:true}));document.querySelectorAll("#youtubeList .youtube-card")[1].click();true');
 await until(async()=>await ev('document.querySelector("#youtubeCurrentTitle").textContent==="Mock Alex Match"'));
 await ev('document.querySelector("#youtubeClear").click()');
 await until(async()=>await ev('document.querySelectorAll("#youtubeList .youtube-card").length===0 && document.querySelector("#youtubePlayer").childElementCount===0'));
 const cleared=await ev('({tokenField:document.querySelector("#youtubeClientId").value,selected:document.querySelector("#youtubeCurrentTitle").textContent})');
 if(cleared.tokenField)throw Error("Clear left OAuth client input populated");
 await ev('document.querySelector("#youtubeBack").click()');
 const finish=await ev('({local:!document.querySelector("#viewer").hidden,youtubeHidden:document.querySelector("#youtubeReviewPanel").hidden,source:document.querySelector("#sourceBadge").textContent})');
 if(!finish.local||!finish.youtubeHidden||!finish.source.includes("LOCAL VIDEO"))throw Error("Local reviewer not restored");
 if(apiRequests.length||external.length)throw Error("Mock browser unexpectedly sent real private Google/YouTube network requests");
 console.log("B3 OWNER MODE BROWSER PASS",JSON.stringify({start,library,cleared,finish,externalCalls:external.length}));
 ws.close();
}
try{await main();}finally{for(const p of procs){try{p.kill("SIGTERM");}catch{}}try{rmSync(dir,{recursive:true,force:true});}catch{}}
