import test from "node:test";
import assert from "node:assert/strict";
import {
 CACHE_KEY,CACHE_VERSION,CACHE_MAX_AGE_MS,CACHE_MAX_ITEMS,
 makeCacheSnapshot,writeCache,readCache,removeCache
} from "../youtube-library-cache.mjs";

const now=1794829200000;
const ownerVideo=(id="AAAAAAAAAAA")=>({
 id,title:"Mock Ed Match",publishedAt:"2026-11-15T02:00:00Z",
 thumbnail:"https://i.ytimg.com/vi/AAAAAAAAAAA/mqdefault.jpg",
 duration:"PT79S",channelTitle:"DO NOT PERSIST CHANNEL",privacyStatus:"unlisted"
});
function storage(){
 const data=new Map();
 return {
 data,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),
 removeItem:k=>data.delete(k)
 };
}
test("only explicitly saved whitelisted metadata, never tokens or other owner fields",()=>{
 const s=storage();
 assert.equal(readCache(s,now),null);
 assert.equal(writeCache(s,[ownerVideo()],false,now),true);
 const raw=s.getItem(CACHE_KEY);
 const parsed=JSON.parse(raw);
 assert.deepEqual(Object.keys(parsed).sort(),["items","partial","savedAt","version"]);
 assert.equal(parsed.version,CACHE_VERSION);
 assert.deepEqual(Object.keys(parsed.items[0]).sort(),["id","publishedAt","thumbnail","title"]);
 assert.equal(parsed.items[0].id,"AAAAAAAAAAA");
 assert.doesNotMatch(raw,/DO NOT PERSIST|channelTitle|duration|privacyStatus|access_token|refresh_token/);
 assert.deepEqual(readCache(s,now),{savedAt:now,partial:false,items:parsed.items});
 assert.equal(s.data.size,1);
});
test("opt-in cache is bounded to <=30 days; older and future cache is deleted",()=>{
 for(const delta of [CACHE_MAX_AGE_MS+1,-6*60*1000]){
   const s=storage();
   assert.equal(writeCache(s,[ownerVideo()],false,now),true);
   assert.equal(readCache(s,now+delta),null);
   assert.equal(s.getItem(CACHE_KEY),null);
 }
 const s=storage();
 assert.equal(writeCache(s,[ownerVideo()],false,now),true);
 assert.ok(readCache(s,now+CACHE_MAX_AGE_MS));
});
test("read fail-closed for malformed, duplicate, non-video, extra or unsafe URL data",()=>{
 const base=makeCacheSnapshot([ownerVideo()],false,now);
 assert.ok(base);
 const variants=[
   {...base,version:19},
   {...base,access_token:"LEAK"},
   {...base,items:[{...base.items[0],access_token:"LEAK"}]},
   {...base,items:[base.items[0],base.items[0]]},
   {...base,items:[{...base.items[0],id:"notAnId"}]},
   {...base,items:[{...base.items[0],thumbnail:"https://evil.test/bad.png"}]},
   {...base,items:[{...base.items[0],title:"X".repeat(200)}]},
   {...base,savedAt:"2026-11-15"},
   {...base,savedAt:now-31*86400000},
   {...base,items:"string"}
 ];
 for(const variant of variants){
   const s=storage();s.setItem(CACHE_KEY,JSON.stringify(variant));
   assert.equal(readCache(s,now),null,JSON.stringify(variant).slice(0,70));
   assert.equal(s.getItem(CACHE_KEY),null);
 }
 const s=storage();s.setItem(CACHE_KEY,"{invalid");
 assert.equal(readCache(s,now),null);
});
test("reject invalid API payloads and never serialize arbitrary objects",()=>{
 const s=storage();
 assert.equal(writeCache(s,[{...ownerVideo(),id:"no"}],false,now),false);
 assert.equal(writeCache(s,[ownerVideo(),ownerVideo()],false,now),false);
 assert.equal(writeCache(s,"not array",false,now),false);
 assert.equal(s.data.size,0);
});
test("quota/security restrictions are safe; voluntary deletion always works",()=>{
 const blocked={getItem(){throw Error("disabled");},setItem(){throw Error("quota");},removeItem(){throw Error("locked");}};
 assert.equal(readCache(blocked),null);
 assert.equal(writeCache(blocked,[ownerVideo()],false,now),false);
 assert.equal(removeCache(blocked),false);
 const s=storage();
 assert.equal(writeCache(s,[ownerVideo()],false,now),true);
 assert.equal(removeCache(s),true);
 assert.equal(readCache(s,now),null);
});
test("limit stored entries, restrict titles and thumbnails and mark incomplete list",()=>{
 const list=Array.from({length:CACHE_MAX_ITEMS+2},(_,i)=>({
  ...ownerVideo(),id:i.toString(36).padStart(11,"0"),
  title:"T".repeat(220),thumbnail:"https://not-youtube.test/image"
 }));
 const snapshot=makeCacheSnapshot(list,false,now);
 assert.ok(snapshot);
 assert.equal(snapshot.items.length,CACHE_MAX_ITEMS);
 assert.equal(snapshot.partial,true);
 assert.equal(snapshot.items[0].title.length,180);
 assert.equal(snapshot.items[0].thumbnail,"");
 const s=storage();
 assert.equal(writeCache(s,list,false,now),true);
 assert.equal(readCache(s,now).items.length,CACHE_MAX_ITEMS);
});
