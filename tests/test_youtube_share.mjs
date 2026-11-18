import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {isYouTubeVideoId,safeStartSeconds,parseSharedLink,makeShareUrl,directYouTubeUrl,embedYouTubeUrl,initializeShareView} from "../youtube-share.mjs";
const page=readFileSync(new URL("../youtube-share.html",import.meta.url),"utf8");
const ID="AAAAAAAAAAA";
test("strict one-video share parsing and start time bounds",()=>{
 assert.deepEqual(parseSharedLink("?v="+ID),{videoId:ID,startSeconds:0});
 assert.deepEqual(parseSharedLink("?v="+ID+"&t=29"),{videoId:ID,startSeconds:29});
 assert.deepEqual(parseSharedLink("?t=43200&v="+ID),{videoId:ID,startSeconds:43200});
 for(const bad of ["","?v=short","?v="+ID+"&v="+ID,"?v="+ID+"&t=1&t=2",
    "?v="+ID+"&debug=yes","?v="+ID+"&t=-1","?v="+ID+"&t=43201",
    "?v="+ID+"&t=01","?v="+ID+"&t=1.1","?v="+ID+"&t=1s",
    "?v="+ID+"&t="+("1".repeat(200))]){
   assert.equal(parseSharedLink(bad),null,bad);
 }
 assert.equal(parseSharedLink("?v="+ID,"#private"),null);
 assert.equal(isYouTubeVideoId("abcdefghijkl"),false);
 assert.equal(safeStartSeconds(Infinity),null);
});
test("generated watch links contain one video only, not owner data",()=>{
 const url=makeShareUrl("https://sashundev.github.io/sf6-ai-coach-viewer/youtube-share.html?junk=1#token","BBBBBBBBBBB",12.7);
 assert.equal(url,"https://sashundev.github.io/sf6-ai-coach-viewer/youtube-share.html?v=BBBBBBBBBBB&t=12");
 assert.deepEqual(parseSharedLink(new URL(url).search),{videoId:"BBBBBBBBBBB",startSeconds:12});
 assert.equal(directYouTubeUrl(ID,5),"https://www.youtube.com/watch?v="+ID+"&t=5s");
 assert.equal(embedYouTubeUrl(ID,0),"https://www.youtube-nocookie.com/embed/"+ID+"?start=0&playsinline=1&rel=0");
 assert.throws(()=>makeShareUrl("javascript:bad",ID),/HTTPS/);
 assert.throws(()=>makeShareUrl("https://example.com/",ID,Infinity),/Invalid/);
});
function createDoc(){
 const elements=Object.fromEntries(["shareStatus","shareValid","shareStart","shareFrame","shareYoutube","shareStartTime","shareControls","sharePause",
  "sharePrevTen","sharePrev","shareNext","shareNextTen","sharePrevFive","sharePrevSec","shareNextSec","shareNextFive"].map(k=>[k,{
  hidden:false,disabled:false,href:"#",textContent:"",children:[],listeners:new Map(),
  addEventListener(name,fn){this.listeners.set(name,fn);},
  setAttribute(name,value){this[name]=value;},
  replaceChildren(...xs){this.children=xs;},
  click(){this.listeners.get("click")?.();}
 }]));
 const scripts=[];
 const doc={getElementById:id=>elements[id],createElement:tag=>({tag,src:"",allowFullscreen:false}),
  head:{append(element){scripts.push(element);}}};
 return {doc,elements,scripts};
}
test("no iframe or network before guest deliberately opens video",()=>{
 const {doc,elements:e}=createDoc();
 assert.equal(initializeShareView(doc,"https://example.com/youtube-share.html?v="+ID+"&t=5"),true);
 assert.equal(e.shareFrame.children.length,0);
 assert.equal(e.shareYoutube.href,"https://www.youtube.com/watch?v="+ID+"&t=5s");
 assert.equal(e.shareStart.disabled,false);
 e.shareStart.click();
 assert.equal(e.shareStart.disabled,true);
 assert.equal(e.shareFrame.children.length,1);
 assert.equal(e.shareFrame.children[0].tag,"iframe");
 assert.match(e.shareFrame.children[0].src,/^https:\/\/www\.youtube-nocookie\.com\/embed\//);
 assert.equal(e.shareFrame.children[0].referrerPolicy,"strict-origin-when-cross-origin");
 assert.equal(e.shareFrame.children[0].allowFullscreen,true);
 e.shareStart.click();
 assert.equal(e.shareFrame.children.length,1);
});
test("Guest player toggle + paused-only approximate seeks work with synthetic official API",async()=>{
 const {doc,elements:e,scripts}=createDoc();
 const env={YT:{Player:class{
  constructor(embed,config){
   this.embed=embed;this.events=config.events;this.state=2;this.time=24;this.requests=[];
   env.player=this;queueMicrotask(()=>this.events.onReady({target:this}));
  }
  getPlayerState(){return this.state;}
  getCurrentTime(){return this.time;}
  getDuration(){return 90;}
  pauseVideo(){this.state=2;this.events.onStateChange({target:this,data:2});}
  playVideo(){this.state=1;this.events.onStateChange({target:this,data:1});}
  seekTo(x){this.time=x;this.requests.push(x);}
 }},setTimeout,clearTimeout};
 assert.equal(initializeShareView(doc,"https://example.com/youtube-share.html?v="+ID+"&t=15",env),true);
 assert.equal(scripts.length,0);
 assert.equal(e.shareControls.hidden,true);
 assert.equal(e.sharePause.disabled,true);
 e.shareStart.click();
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(e.shareFrame.children.length,1);
 assert.equal(e.shareFrame.children[0].src.includes("enablejsapi=1"),true);
 assert.equal(e.shareFrame.children[0].src.includes("origin=https%3A%2F%2Fexample.com"),true);
 assert.equal(e.sharePause.disabled,false);
 assert.equal(e.sharePause.textContent,"再生");
 e.sharePause.click();assert.equal(env.player.state,1);assert.equal(e.sharePause.textContent,"一時停止");
 const before=env.player.requests.length;
 e.shareNext.click();assert.equal(env.player.requests.length,before);
 e.sharePause.click();assert.equal(env.player.state,2);assert.equal(e.sharePause.textContent,"再生");
 e.shareNext.click();assert.equal(env.player.requests.length,before+1);
 assert.ok(Math.abs(env.player.time-(24+1/30))<.00001);
 e.shareNextTen.click();assert.equal(env.player.requests.length,before+2);
 assert.ok(Math.abs(env.player.time-(24+11/30))<.00001);
 assert.equal(scripts.length,0); // already loaded API, no extra network script
});
test("IFrame API is injected only after guest click and CSP permits its official script",()=>{
 const {doc,elements:e,scripts}=createDoc();
 const env={setTimeout,clearTimeout};
 assert.equal(initializeShareView(doc,"https://example.com/youtube-share.html?v="+ID,env),true);
 assert.equal(scripts.length,0);
 e.shareStart.click();
 assert.equal(scripts.length,1);
 assert.equal(scripts[0].src,"https://www.youtube.com/iframe_api");
 scripts[0].onerror();
 assert.match(page,/script-src 'self' https:\/\/www\.youtube\.com/);
 assert.match(page,/connect-src 'none'/);
});
test("invalid links fail closed without embedding or OAuth",()=>{
 const {doc,elements:e}=createDoc();
 assert.equal(initializeShareView(doc,"https://example.com/youtube-share.html?v="+ID+"&t=NaN"),false);
 assert.equal(e.shareValid.hidden,true);
 assert.equal(e.shareFrame.children.length,0);
 assert.equal(e.shareYoutube.href,"#");
 assert.doesNotMatch(page,/https:\/\/accounts\.google\.com\/gsi/);
 assert.doesNotMatch(page,/localStorage|sessionStorage|fetch\(|Google OAuth|access_token/);
 assert.doesNotMatch(page,/autoplay=1/);
 assert.match(page,/meta name="robots" content="noindex,nofollow,noarchive"/);
 assert.match(page,/referrer" content="strict-origin-when-cross-origin"/);
 assert.match(page,/connect-src 'none'/);
 assert.match(page,/href="#" target="_blank" rel="noopener noreferrer"/);
 assert.match(page,/youtube-share\.mjs/);
});
