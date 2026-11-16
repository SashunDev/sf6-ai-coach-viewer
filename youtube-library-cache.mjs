// Phase B5 / Issue #22: explicitly opted-in per-device cache of the OWNER'S
// last VERIFIED unlisted YouTube list. No credentials, media, notes or auth state.
import {isVideoId,safeThumbnail} from "./youtube-library-core.mjs";

export const CACHE_KEY="sf6-coach-owner-unlisted-list-v1";
export const CACHE_VERSION=1;
export const CACHE_MAX_AGE_MS=30*24*60*60*1000;
export const CACHE_MAX_ITEMS=600;
const CACHE_MAX_CHARS=550000;
const CACHE_MAX_CLOCK_SKEW=5*60*1000;
const FIELDS="id,publishedAt,thumbnail,title";

function normalizeItems(items,strict=false){
 if(!Array.isArray(items)||items.length>10000)return null;
 const out=[],seen=new Set();
 for(const item of items){
   if(!item||typeof item!=="object"||Array.isArray(item)||
      typeof item.id!=="string"||!isVideoId(item.id)||
      typeof item.title!=="string"||typeof item.publishedAt!=="string"||
      typeof item.thumbnail!=="string")return null;
   if(strict&&(Object.keys(item).sort().join(",")!==FIELDS||
      item.title.length>180||item.publishedAt.length>40||
      item.thumbnail!==safeThumbnail(item.thumbnail)))return null;
   if(seen.has(item.id))return null;
   seen.add(item.id);
   if(out.length<CACHE_MAX_ITEMS){
     out.push({id:item.id,title:item.title.slice(0,180),
       publishedAt:item.publishedAt.slice(0,40),
       thumbnail:safeThumbnail(item.thumbnail)});
   }
 }
 return out;
}
export function makeCacheSnapshot(items,partial=false,now=Date.now()){
 if(!Number.isSafeInteger(now)||now<=0||typeof partial!=="boolean")return null;
 const clean=normalizeItems(items);
 if(!clean)return null;
 const result={version:CACHE_VERSION,savedAt:now,partial:partial||items.length>CACHE_MAX_ITEMS,items:clean};
 if(JSON.stringify(result).length>CACHE_MAX_CHARS)return null;
 return result;
}
export function writeCache(storage,items,partial=false,now=Date.now()){
 try{
   const snapshot=makeCacheSnapshot(items,partial,now);
   if(!snapshot)return false;
   storage.setItem(CACHE_KEY,JSON.stringify(snapshot));
   return true;
 }catch{return false;} // Safari private browsing or quota/security restrictions.
}
export function removeCache(storage){
 try{storage.removeItem(CACHE_KEY);return true;}catch{return false;}
}
export function readCache(storage,now=Date.now()){
 try{
   const raw=storage.getItem(CACHE_KEY);
   if(raw===null)return null;
   if(typeof raw!=="string"||raw.length>CACHE_MAX_CHARS)throw Error("oversize cache");
   const value=JSON.parse(raw);
   if(!value||typeof value!=="object"||Array.isArray(value)||
      Object.keys(value).sort().join(",")!=="items,partial,savedAt,version"||
      value.version!==CACHE_VERSION||typeof value.partial!=="boolean"||
      !Number.isSafeInteger(value.savedAt)||value.savedAt<=0||
      !Number.isSafeInteger(now)||now<=0||value.savedAt>now+CACHE_MAX_CLOCK_SKEW||
      now-value.savedAt>CACHE_MAX_AGE_MS)throw Error("expired or invalid cache");
   const normalized=normalizeItems(value.items,true);
   if(!normalized||normalized.length!==value.items.length||normalized.length>CACHE_MAX_ITEMS)
      throw Error("invalid cache items");
   return {savedAt:value.savedAt,partial:value.partial,items:normalized};
 }catch{
   removeCache(storage);
   return null;
 }
}
