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
 const elements=Object.fromEntries(["shareStatus","shareValid","shareStart","shareFrame","shareYoutube","shareStartTime"].map(k=>[k,{
  hidden:false,disabled:false,href:"#",textContent:"",children:[],listeners:new Map(),
  addEventListener(name,fn){this.listeners.set(name,fn);},
  replaceChildren(...xs){this.children=xs;},
  click(){this.listeners.get("click")?.();}
 }]));
 const doc={getElementById:id=>elements[id],createElement:tag=>({tag,src:"",allowFullscreen:false})};
 return {doc,elements};
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
