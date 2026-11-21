import test from "node:test";
import assert from "node:assert/strict";
import {SCOPE,MAX_PAGES_PER_CHANNEL,isVideoId,isClientId,safeThumbnail,
  unlistedFromUploads,gatherOwnUnlisted,mockCollection,filterVideosByTitle} from "../youtube-library-core.mjs";

test("only youtube.readonly and valid web OAuth client IDs",()=>{
 assert.equal(SCOPE,"https://www.googleapis.com/auth/youtube.readonly");
 assert.equal(MAX_PAGES_PER_CHANNEL,20);
 assert.ok(isClientId("1234567890-abcdef.apps.googleusercontent.com"));
 for(const x of ["","bad","abc.apps.googleusercontent.com","12345-abc.apps.googleusercontent.com.evil"])assert.equal(isClientId(x),false);
});
test("strict, HTTPS-only official thumbnail hosts, never unknown sites",()=>{
 for(const x of ["https://i.ytimg.com/vi/test/default.jpg","https://i3.ytimg.com/vi/test/default.jpg"])assert.equal(safeThumbnail(x),x);
 for(const x of ["","http://i.ytimg.com/a","https://i.ytimg.com.evil.com/a","javascript:alert(1)","https://evil.test/a"])assert.equal(safeThumbnail(x),"");
});
test("playlist yields own unlisted only, de-duplicates, sorts, handles absent fields",()=>{
 const rows=["AAAAAAAAAAA","BBBBBBBBBBB","AAAAAAAAAAA","CCCCCCCCCCC","DDDDDDDDDDD"].map(id=>({contentDetails:{videoId:id}}));
 const details=[
  {id:"AAAAAAAAAAA",status:{privacyStatus:"unlisted"},snippet:{title:"後",publishedAt:"2026-11-15T01:00:00Z"}},
  {id:"BBBBBBBBBBB",status:{privacyStatus:"private"},snippet:{title:"非公開"}},
  {id:"CCCCCCCCCCC",status:{privacyStatus:"unlisted"},snippet:{title:"前",publishedAt:"2026-11-14T01:00:00Z"}},
  {id:"DDDDDDDDDDD",status:{privacyStatus:"public"},snippet:{title:"公開"}}
 ];
 assert.deepEqual(unlistedFromUploads(rows,details).map(x=>x.id),["AAAAAAAAAAA","CCCCCCCCCCC"]);
 assert.equal(unlistedFromUploads(rows,details)[0].title,"後");
 assert.equal(unlistedFromUploads(rows,[]).length,0);
 assert.equal(isVideoId("AAAAAAAAAAA"),true);
 assert.equal(isVideoId("AAAA"),false);
});
test("mock list is local synthetic and contains no private or public entries",()=>{
 const v=mockCollection();
 assert.equal(v.length,2);assert.ok(v.every(x=>x.title.startsWith("モック：")));
});
test("paged uploads path reads channel-owned uploads then batch videos, without search API",async()=>{
 const log=[];
 const api=async(resource,params)=>{
  log.push({resource,params});
  if(resource==="channels")return {items:[{contentDetails:{relatedPlaylists:{uploads:"UUdemo123"}}}]};
  if(resource==="playlistItems")return params.pageToken
    ?{items:[{contentDetails:{videoId:"BBBBBBBBBBB"}}]}
    :{items:[{contentDetails:{videoId:"AAAAAAAAAAA"}}],nextPageToken:"NEXT"};
  if(resource==="videos")return {items:[
   {id:"AAAAAAAAAAA",status:{privacyStatus:"unlisted"},snippet:{title:"自分の限定公開",publishedAt:"2026-11-15T10:00:00Z"}},
   {id:"BBBBBBBBBBB",status:{privacyStatus:"public"},snippet:{title:"公開"}}]};
  throw Error("Unexpected resource");
 };
 const result=await gatherOwnUnlisted(api);
 assert.equal(result.candidateCount,2);
 assert.equal(result.items.length,1);
 assert.equal(result.items[0].title,"自分の限定公開");
 assert.equal(result.requests,4);
 assert.deepEqual(log.map(x=>x.resource),["channels","playlistItems","playlistItems","videos"]);
 assert.equal(log[0].params.mine,"true");
 assert.equal(log[3].params.part,"snippet,status,contentDetails");
});
test("pagination stops at cap and explicitly warns incomplete",async()=>{
 const api=async(resource,params)=>{
  if(resource==="channels")return {items:[{contentDetails:{relatedPlaylists:{uploads:"UUdemo"}}}]};
  if(resource==="playlistItems")return {items:[],nextPageToken:params.pageToken?"NEXT2":"NEXT1"};
  throw Error("No videos should be requested");
 };
 const x=await gatherOwnUnlisted(api,{maxPages:2});
 assert.equal(x.partial,true);assert.equal(x.requests,3);
 await assert.rejects(gatherOwnUnlisted(api,{maxPages:21}),/invalid page cap/);
});
test("looping page continuation token is rejected instead of indefinite fetching",async()=>{
 const api=async(resource)=>{
  if(resource==="channels")return {items:[{contentDetails:{relatedPlaylists:{uploads:"UUdemo"}}}]};
  return {items:[],nextPageToken:"REPEAT"};
 };
 await assert.rejects(gatherOwnUnlisted(api),/Repeated playlist continuation token/);
});
test("no uploads playlist returns an explicit absence, not mock data",async()=>{
 const api=async()=>({items:[{contentDetails:{relatedPlaylists:{}}}]});
 await assert.rejects(gatherOwnUnlisted(api),/No uploads playlist/);
});
test("invalid response fails closed",async()=>{
 const api=async()=>({error:{message:"invalid"}});
 await assert.rejects(gatherOwnUnlisted(api),/channels response invalid/);
});

test("ASCII space-separated title keywords use case-insensitive, order-independent AND search",()=>{
 const videos=[
  {id:"a",title:"2026-11-21 Ed vs Cammy"},
  {id:"b",title:"エド vs 豪鬼"},
  {id:"c",title:"Cammy vs Alex"}
 ];
 const ids=q=>filterVideosByTitle(videos,q).map(v=>v.id);
 assert.deepEqual(ids(""),["a","b","c"]);
 assert.deepEqual(ids("    "),["a","b","c"]);
 assert.deepEqual(ids("ed"),["a"]);
 assert.deepEqual(ids("ED   cAMMy"),["a"]);
 assert.deepEqual(ids("   Cammy  ED  "),["a"]);
 assert.deepEqual(ids("エド 豪鬼"),["b"]);
 assert.deepEqual(ids("Cammy"),["a","c"]);
 assert.deepEqual(ids("ED ED"),["a"]);
 assert.deepEqual(ids("ed Alex"),[]);
 assert.deepEqual(ids("エド キャミィ"),[]);
 assert.deepEqual(ids("Ed\tCammy"),[]); // only ASCII spaces divide keywords
 assert.deepEqual(videos.map(v=>v.title),["2026-11-21 Ed vs Cammy","エド vs 豪鬼","Cammy vs Alex"]);
});
