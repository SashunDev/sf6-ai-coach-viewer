// Behavioral regressions without network, credentials, or browser-layout claims.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM,VirtualConsole} from 'jsdom';
import * as library from '../youtube-library-core.mjs';
import * as seek from '../youtube-seek-core.mjs';
import * as cache from '../youtube-library-cache.mjs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const module=readFileSync(new URL('../youtube-review.mjs',import.meta.url),'utf8')
 .replace(/^import \{([^}]+)\} from "\.\/([^\"]+)";/gm,(_line,names,file)=>
  'const {'+names+'}=window.__dependencies['+JSON.stringify(file)+'];');
const videos=[{id:'AAAAAAAAAAA',title:'合成テスト：対空の確認',publishedAt:'2026-11-15T00:00:00Z',thumbnail:''},
 {id:'BBBBBBBBBBB',title:'合成テスト：起き攻め',publishedAt:'2026-11-14T00:00:00Z',thumbnail:''}];
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
test('fine controls precede seconds and recovery is outside settings, hidden by default',()=>{
 const t=setup();try{
  const controls=t.d.querySelector('.ytr-seek-controls');
  assert.equal(controls.firstElementChild.className,'seek-fine');
  assert.equal(controls.lastElementChild.className,'seek-seconds');
  assert.equal(t.d.getElementById('youtubeRecovery').hidden,true);
  assert.equal(t.d.getElementById('youtubeLocalFallback').closest('dialog'),null);
 }finally{t.close();}
});

test('embed error exposes direct MP4 picker and preserves owner state on return',async()=>{
 const t=setup();try{
  t.click('youtubeOpen');t.d.querySelector('.youtube-card').click();await tick();
  const player=t.calls.players[0];
  t.d.getElementById('youtubeClientId').value='12345-test.apps.googleusercontent.com';
  t.click('youtubeConnect');await tick();
  const saved=t.w.localStorage.getItem(cache.CACHE_KEY);
  assert.equal(t.calls.oauth,1);
  t.d.getElementById('youtubeNote').value='復旧中も残すメモ';
  assert.equal(t.d.getElementById('youtubeRecovery').hidden,true);
  player.config.events.onError({target:player,data:101});
  assert.equal(t.d.getElementById('youtubeRecovery').hidden,false);
  assert.equal(t.d.getElementById('youtubeSettings').open,false);
  let picker=0;t.d.getElementById('fileInput').click=()=>picker++;
  t.click('youtubeLocalFallback');
  assert.equal(t.d.body.dataset.reviewMode,'local');assert.equal(picker,1);
  assert.equal(t.w.localStorage.getItem(cache.CACHE_KEY),saved);
  t.click('youtubeOpen');
  assert.equal(t.d.getElementById('youtubeNote').value,'復旧中も残すメモ');
  assert.equal(player.time,42);assert.equal(player.state,2);
  t.click('youtubeRefresh');await tick();assert.equal(t.calls.oauth,1);
  assert.equal(t.d.querySelectorAll('.youtube-card').length,2);
  t.d.querySelectorAll('.youtube-card')[1].click();await tick();
  assert.equal(t.d.getElementById('youtubeRecovery').hidden,true);
  assert.equal(t.errors.length,0);
 }finally{t.close();}
});
function setup({saved=true,hash='',savedAt=Date.now()-1000}={}){
 const errors=[];const console=new VirtualConsole();console.on('jsdomError',e=>errors.push(e));
 const dom=new JSDOM(html,{url:'https://viewer.example/'+hash,runScripts:'dangerously',virtualConsole:console,
  beforeParse(w){w.scrollTo=()=>{};w.Element.prototype.scrollIntoView=()=>{};
   w.HTMLMediaElement.prototype.pause=function(){};w.HTMLMediaElement.prototype.load=function(){};
   w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
   w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  }});
 const w=dom.window,d=w.document,calls={oauth:0,api:0,copies:[],players:[]};
 w.__dependencies={'youtube-library-core.mjs':library,'youtube-seek-core.mjs':seek,'youtube-library-cache.mjs':cache};
 if(saved)cache.writeCache(w.localStorage,videos,false,savedAt);
 w.google={accounts:{oauth2:{initTokenClient:({callback})=>({requestAccessToken:()=>{
  calls.oauth++;callback({access_token:'SYNTHETIC_ONLY'});
 }}),hasGrantedAllScopes:()=>true,revoke:(_token,cb)=>cb({successful:true})}}};
 w.YT={PlayerState:{PAUSED:2,PLAYING:1},Player:class{
  constructor(host,config){this.host=host;this.config=config;this.time=42;this.state=2;this.requests=[];
   calls.players.push(this);host.textContent='合成テストプレイヤー';
   w.setTimeout(()=>config.events.onReady({target:this}),0);
  }
  getCurrentTime(){return this.time;}getDuration(){return 130;}getPlayerState(){return this.state;}
  pauseVideo(){this.state=2;this.config.events.onStateChange({target:this,data:2});}
  seekTo(time){this.time=time;this.requests.push(time);}
  cueVideoById(){this.time=0;this.state=2;}destroy(){this.host.remove();}
 }};
 w.fetch=async url=>{calls.api++;const resource=new URL(url).pathname.split('/').at(-1);
  const data=resource==='channels'?{items:[{contentDetails:{relatedPlaylists:{uploads:'UUtest'}}}]}:
   resource==='playlistItems'?{items:videos.map(v=>({contentDetails:{videoId:v.id}}))}:
    {items:videos.map(v=>({id:v.id,status:{privacyStatus:'unlisted'},snippet:{title:v.title,publishedAt:v.publishedAt}}))};
  return new Response(JSON.stringify(data),{status:200});
 };
 Object.defineProperty(w.navigator,'clipboard',{configurable:true,value:{writeText:async text=>calls.copies.push(text)}});
 w.eval('(()=>{'+module+'\n})();');
 const click=id=>d.getElementById(id).click();
 return {dom,w,d,calls,errors,click,close:()=>dom.window.close()};
}

test('plain and cached visits always start at mode choice, without OAuth or API calls',()=>{
 for(const saved of [false,true]){
  const t=setup({saved});try{
   assert.equal(t.d.body.dataset.reviewMode,'home');assert.equal(t.calls.oauth,0);assert.equal(t.calls.api,0);
   assert.equal(t.d.querySelectorAll('.youtube-card').length,0);
   t.click('youtubeOpen');assert.equal(t.d.body.dataset.reviewMode,'youtube');
   assert.equal(t.d.querySelectorAll('.youtube-card').length,saved?2:0);
   assert.equal(t.calls.oauth,0);assert.equal(t.calls.api,0);assert.equal(t.errors.length,0);
  }finally{t.close();}
 }
});

test('expired cache is purged even when the visitor remains at mode choice',()=>{
 const t=setup({savedAt:Date.now()-31*24*60*60*1000});try{
  assert.equal(t.d.body.dataset.reviewMode,'home');
  assert.equal(t.w.localStorage.getItem(cache.CACHE_KEY),null);
  assert.equal(t.calls.oauth,0);assert.equal(t.calls.api,0);
 }finally{t.close();}
});

test('home, local mode, and mobile panes preserve selected YouTube video, time and note',async()=>{
 const t=setup();try{
  t.click('youtubeOpen');t.d.querySelector('.youtube-card').click();await tick();
  const player=t.calls.players[0];t.d.getElementById('youtubeNote').value='判断を見直したい';
  t.click('youtubeNextTen');const target=42+10/30;
  assert.ok(Math.abs(player.time-target)<.0001);
  t.click('youtubeLibraryTab');t.click('youtubeMemoTab');
  assert.equal(t.d.querySelector('.ytr-content').dataset.mobilePane,'memo');
  assert.equal(t.calls.players.length,1);assert.ok(Math.abs(player.time-target)<.0001);
  t.click('youtubeBack');assert.equal(t.d.body.dataset.reviewMode,'home');
  t.click('localOpen');assert.equal(t.d.body.dataset.reviewMode,'local');
  t.d.querySelector('[data-home]').click();t.click('youtubeOpen');
  assert.equal(t.calls.players.length,1);assert.equal(t.d.getElementById('youtubeNote').value,'判断を見直したい');
  assert.equal(t.d.getElementById('youtubeCurrentTitle').textContent,videos[0].title);
  assert.ok(Math.abs(player.time-target)<.0001);assert.equal(t.d.getElementById('youtubeNext').disabled,false);
  assert.equal(t.d.querySelector('.youtube-card[aria-pressed=true] strong').textContent,videos[0].title);
  assert.equal(t.errors.length,0);
 }finally{t.close();}
});

test('sharing and manual handoff keep separate payloads; copy denial exposes manual fallback',async()=>{
 const t=setup();try{
  t.click('youtubeOpen');t.d.querySelector('.youtube-card').click();await tick();
  t.d.getElementById('youtubeNote').value='非公開の振り返りメモ';
  t.click('workbenchShare');assert.equal(t.d.getElementById('youtubeShareDialog').open,true);
  t.click('youtubeShare');await tick();
  const link=t.d.getElementById('youtubeShareLink').value,url=new URL(link);
  assert.equal(url.pathname,'/youtube-share.html');assert.equal(url.searchParams.get('v'),videos[0].id);
  assert.equal(url.searchParams.get('t'),'42');assert.equal(url.searchParams.size,2);
  assert.ok(!link.includes('メモ'));assert.ok(!link.includes('SYNTHETIC_ONLY'));
  t.d.getElementById('youtubeShareDialog').close();
  Object.defineProperty(t.w.navigator,'clipboard',{value:{writeText:async()=>{throw Error('denied');}}});
  t.click('youtubeCopy');await tick();
  assert.equal(t.d.getElementById('youtubeHandoffFallback').open,true);
  assert.ok(t.d.getElementById('youtubeHandoff').value.includes('非公開の振り返りメモ'));
  assert.ok(t.d.getElementById('youtubeHandoff').value.includes('自動確認したわけではありません'));
  t.click('youtubeClear');assert.equal(t.w.localStorage.getItem(cache.CACHE_KEY),null);
  assert.equal(t.d.getElementById('youtubeNote').value,'');assert.equal(t.d.getElementById('youtubeShareLink').value,'');
  assert.equal(t.d.getElementById('workbenchShare').disabled,true);
  assert.equal(t.errors.length,0);
 }finally{t.close();}
});

test('initial connection still requires consent, refresh reuses the in-memory token and revoke clears cache',async()=>{
 const t=setup({saved:false});try{
  t.click('youtubeOpen');t.click('youtubeRefresh');
  assert.equal(t.calls.oauth,0);assert.equal(t.d.getElementById('youtubeSettings').open,true);
  t.d.getElementById('youtubeClientId').value='12345-test.apps.googleusercontent.com';
  t.d.getElementById('youtubeConsent').checked=true;t.d.getElementById('youtubeKeepList').checked=true;
  t.click('youtubeConnect');await tick();
  assert.equal(t.calls.oauth,1);assert.equal(t.calls.api,3);assert.equal(t.d.getElementById('youtubeSettings').open,false);
  assert.equal(t.d.querySelectorAll('.youtube-card').length,2);assert.ok(t.w.localStorage.getItem(cache.CACHE_KEY));
  t.click('youtubeRefresh');await tick();assert.equal(t.calls.oauth,1);assert.equal(t.calls.api,6);
  t.click('youtubeRevoke');assert.equal(t.w.localStorage.getItem(cache.CACHE_KEY),null);
  assert.equal(t.d.querySelectorAll('.youtube-card').length,0);assert.equal(t.errors.length,0);
 }finally{t.close();}
});

test('report deep links enter local mode and local playback shortcuts do not run in YouTube or home',()=>{
 const t=setup({hash:'#id=synthetic-test'});try{
  assert.equal(t.d.body.dataset.reviewMode,'local');
  // The fetch starts before test setup, so this fixture only verifies navigation.
  t.w.SF6Workbench.home();const time=t.d.getElementById('timeNow').textContent;
  t.d.dispatchEvent(new t.w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
  assert.equal(t.d.getElementById('timeNow').textContent,time);
  t.click('youtubeOpen');t.d.dispatchEvent(new t.w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
  assert.equal(t.d.getElementById('timeNow').textContent,time);
 }finally{t.close();}
});
