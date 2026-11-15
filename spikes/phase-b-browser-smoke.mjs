// Synthetic desktop-Chromium browser smoke test for the standalone frame probe.
// This does NOT prove iPhone compatibility or accurate one-frame seeking.
import {spawn,spawnSync} from "node:child_process";
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {buildOffline} from "./build_local_frame_probe.mjs";

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const dir=mkdtempSync(join(tmpdir(),"phase-b-browser-"));
const procs=[];
async function until(fn,ms=12000){
 const deadline=Date.now()+ms;
 while(Date.now()<deadline){try{const x=await fn();if(x)return x;}catch{}await sleep(160);}
 throw Error("Timed out waiting for local diagnostic component");
}
function proc(cmd,args,options={}){
 const p=spawn(cmd,args,{...options,stdio:"ignore"});
 procs.push(p);return p;
}
async function main(){
 const html=readFileSync(new URL("./local-frame-probe.html",import.meta.url),"utf8");
 const core=readFileSync(new URL("./local-frame-probe-core.mjs",import.meta.url),"utf8");
 writeFileSync(join(dir,"probe.html"),buildOffline(html,core));
 const video=join(dir,"test.mp4");
 const ff=spawnSync("ffmpeg",["-hide_banner","-loglevel","error","-y","-f","lavfi","-i","testsrc2=size=320x180:rate=30:duration=5","-c:v","libx264","-preset","ultrafast","-pix_fmt","yuv420p","-movflags","+faststart",video],{encoding:"utf8"});
 if(ff.status!==0)throw Error("Synthetic ffmpeg build failed: "+ff.stderr?.slice(-800));
 proc("python3",["-m","http.server","18775","--bind","127.0.0.1"],{cwd:dir});
 await until(async()=> (await fetch("http://127.0.0.1:18775/probe.html")).ok);
 const browserExe=process.env.CHROME_BIN||"google-chrome";
 proc(browserExe,["--headless=new","--no-sandbox","--disable-gpu","--disable-dev-shm-usage","--remote-allow-origins=*","--remote-debugging-port=18776","--user-data-dir="+join(dir,"profile"),"--autoplay-policy=no-user-gesture-required"]);
 const pageInfo=await until(async()=> {
  const resp=await fetch("http://127.0.0.1:18776/json/new?http://127.0.0.1:18775/probe.html",{method:"PUT"});
  return resp.ok ? await resp.json():null;
 });
 if(!pageInfo.webSocketDebuggerUrl)throw Error("Missing CDP websocket");
 const ws=new WebSocket(pageInfo.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{
  ws.addEventListener("open",resolve,{once:true});
  ws.addEventListener("error",reject,{once:true});
 });
 let seq=0;
 const requests=new Map();
 ws.addEventListener("message",ev=>{
  const data=JSON.parse(ev.data);
  if(!data.id)return;
  const p=requests.get(data.id);if(!p)return;
  requests.delete(data.id);
  if(data.error)p.reject(new Error(JSON.stringify(data.error)));
  else p.resolve(data.result||{});
 });
 function send(method,params={}){
  const id=++seq;
  return new Promise((resolve,reject)=>{
   requests.set(id,{resolve,reject});
   ws.send(JSON.stringify({id,method,params}));
  });
 }
 async function ev(expression){
  const r=await send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});
  if(r.exceptionDetails)throw Error("JS exception: "+JSON.stringify(r.exceptionDetails).slice(0,600));
  return r.result?.value;
 }
 await send("Runtime.enable");
 await send("DOM.enable");
 await until(async()=>await ev("document.readyState==='complete'"));
 const document=await send("DOM.getDocument",{depth:2});
 const input=await send("DOM.querySelector",{nodeId:document.root.nodeId,selector:"#file"});
 if(!input.nodeId)throw Error("Cannot locate file chooser");
 await send("DOM.setFileInputFiles",{nodeId:input.nodeId,files:[video]});
 await ev("document.querySelector('#file').dispatchEvent(new Event('change',{bubbles:true}))");
 await until(async()=>{const x=await ev("document.querySelector('video').duration");return Number.isFinite(x)&&x>4;});
 const first=await ev("(async()=>{ const v=document.querySelector('video'); await v.play(); await new Promise(r=>setTimeout(r,1850)); v.pause(); await new Promise(r=>setTimeout(r,220)); return {rvfc:typeof v.requestVideoFrameCallback==='function',duration:v.duration,paused:v.paused,measure:document.querySelector('#measure').textContent,nextDisabled:document.querySelector('#next').disabled}; })()");
 console.log("CHROMIUM INITIAL",JSON.stringify(first));
 if(!first.rvfc || first.nextDisabled || !first.paused)throw Error("Unable to instrument native video frames in synthetic Chromium; no B1 success claim");
 const steps=[];
 for(const selector of ["#next","#next","#prev"]){
  const q=JSON.stringify(selector);
  await ev("document.querySelector("+q+").click()");
  await sleep(2450);
  const result=await ev("({paused:document.querySelector('video').paused,disabled:document.querySelector("+q+").disabled,log:document.querySelector('#log').textContent.split('\\n')[0]})");
  steps.push({button:selector,...result});
 }
 console.log("CHROMIUM STEP OBSERVATIONS",JSON.stringify(steps));
 if(steps.some(x=>!x.paused))throw Error("Paused video unexpectedly resumed");
 if(steps.some(x=>!x.log.includes("コマ")))throw Error("Missing outcome log");
 console.log("NOTE: Chromium observations are not iPhone evidence and are not a universal exact frame-step guarantee");
 ws.close();
}
try{await main();}finally{
 for(const p of procs){try{p.kill("SIGTERM");}catch{}}
 try{rmSync(dir,{recursive:true,force:true});}catch{}
}
