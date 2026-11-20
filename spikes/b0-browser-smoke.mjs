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
 for(const file of ["b0-library.html","b0-app.mjs","b0-library-core.mjs","b0-privacy.html","b2-youtube-seek-core.mjs","b2-youtube-seek-app.mjs"]){
  const input=readFileSync(new URL("./"+file,import.meta.url),"utf8");
  writeFileSync(join(dir,file==="b0-library.html"?"b0.html":file),input);
 }
 launch("python3",["-m","http.server","18777","--bind","127.0.0.1"],{cwd:dir});
 await until(async()=> (await fetch("http://127.0.0.1:18777/b0.html")).ok);
 launch(process.env.CHROME_BIN||"google-chrome",
  ["--headless=new","--no-sandbox","--disable-gpu","--disable-dev-shm-usage",
   "--remote-allow-origins=*","--remote-debugging-port=18778",
   "--user-data-dir="+join(dir,"chrome-profile"),"--no-first-run"]);
 const tab=await until(async()=>{
  const r=await fetch("http://127.0.0.1:18778/json/new?http://127.0.0.1:18777/b0.html",{method:"PUT"});
  return r.ok?await r.json():null;
 });
 const ws=new WebSocket(tab.webSocketDebuggerUrl);
 await new Promise((res,rej)=>{ws.addEventListener("open",res,{once:true});ws.addEventListener("error",rej,{once:true});});
 let serial=0;const pending=new Map();const apiRequests=[];
 ws.addEventListener("message",e=>{
  const m=JSON.parse(e.data);
  if(m.method==="Network.requestWillBeSent" && m.params?.request?.url?.includes("youtube/v3"))apiRequests.push(m.params.request.url);
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
 await until(async()=>String(await ev("document.querySelector('#runtime')?.textContent")).includes("JavaScript起動確認済み"));
 const init=await ev("({runtime:document.querySelector('#runtime').textContent,count:document.querySelectorAll('#results .video').length})");
 await ev("document.querySelector('#demo').click()");
 await until(async()=>await ev("document.querySelectorAll('#results .video').length===2"));
 const demo=await ev("({titles:[...document.querySelectorAll('#results .video strong')].map(x=>x.textContent),status:document.querySelector('#status').textContent})");
 await ev("document.querySelector('#filter').value='対空';document.querySelector('#filter').dispatchEvent(new Event('input',{bubbles:true}))");
 await until(async()=>await ev("document.querySelectorAll('#results .video').length===1"));
 const filtered=await ev("document.querySelector('#results .video strong').textContent");
 await ev("document.querySelector('#clear').click()");
 await until(async()=>await ev("document.querySelectorAll('#results .video').length===0"));
 const end=await ev("({status:document.querySelector('#status').textContent,tokenInput:document.querySelector('#clientId').value})");
 if(apiRequests.length)throw Error("Mock UI unexpectedly called private YouTube APIs");
 if(!demo.titles.every(t=>t.startsWith("モック：")))throw Error("Demo contains non-mock data");
 if(!filtered.includes("対空")||end.tokenInput)throw Error("Filter/clear behavior is wrong");
 console.log("B0 MOCK BROWSER PASS",JSON.stringify({init,demo,filtered,end,privateApiCalls:apiRequests.length}));
 // A synthetic YT.Player implementation avoids remote playback and user data.
 // Test the B0 -> optional IFrame diagnosis wiring without real video downloads.
 await ev(`(()=>{
  window.YT={
   PlayerState:{PLAYING:1,PAUSED:2},
   Player:class{
    constructor(el,config){
     this._time=4;this._duration=30;this._state=2;this._container=el;
     el.textContent="FAKE YOUTUBE PLAYER FOR CI";
     setTimeout(()=>config.events.onReady({target:this}),10);
    }
    getPlayerState(){return this._state;}
    getCurrentTime(){return this._time;}
    getDuration(){return this._duration;}
    seekTo(t){this._time=t;}
    cueVideoById(){this._time=0;this._state=2;}
    pauseVideo(){this._state=2;}
    destroy(){this._container.remove();}
   }
  };
  document.dispatchEvent(new CustomEvent("sf6:b2-open",{detail:{id:"AAAAAAAAAAA"}}));
  return true;
 })()`);
 await until(async()=>await ev("document.querySelector('#b2-next')?.disabled===false"));
 await ev("document.querySelector('#b2-next').click()");
 await until(async()=>await ev("document.querySelector('#b2-log')?.textContent?.includes('API報告時刻が変化しました')"));
 const b2=await ev("({visible:!document.querySelector('#b2-panel').hidden,log:document.querySelector('#b2-log').textContent})");
 await ev("document.querySelector('#clear').click()");
 await until(async()=>await ev("document.querySelector('#b2-panel').hidden===true"));
 if(apiRequests.length)throw Error("B2 synthetic CI unexpectedly called private YouTube API");
 console.log("B2 IFRAME MOCK BROWSER PASS",JSON.stringify({visible:b2.visible,containsApproximateNotice:b2.log.includes("表示フレームの変化は未証明"),privateApiCalls:apiRequests.length}));

 ws.close();
}
try{await main();}finally{for(const p of procs){try{p.kill("SIGTERM");}catch{}}try{rmSync(dir,{recursive:true,force:true});}catch{}}
