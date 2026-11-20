// B0 YouTube uploads -> own unlisted-video library. No secrets, OAuth, IO or storage here.
export const SCOPE = "https://www.googleapis.com/auth/youtube.readonly";
export const MAX_PAGES_PER_CHANNEL = 20;
export const MAX_CHANNELS = 5;
const videoIdRE = /^[A-Za-z0-9_-]{11}$/;
const playlistIdRE = /^[A-Za-z0-9_-]{1,100}$/;
export function isVideoId(value){return videoIdRE.test(String(value||""));}
export function isClientId(value){return /^[0-9]+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(String(value||"").trim());}
export function safeThumbnail(value){
  try {
    const u=new URL(String(value||""));
    return u.protocol==="https:" && /^(?:i\d*|img)\.ytimg\.com$/i.test(u.hostname) ? u.href : "";
  } catch{return "";}
}
export function unlistedFromUploads(entries,videos){
  const map=new Map((videos||[]).filter(v=>isVideoId(v?.id)).map(v=>[v.id,v]));
  const list=[],seen=new Set();
  for(const entry of entries||[]){
    const id=entry?.contentDetails?.videoId;
    if(!isVideoId(id)||seen.has(id))continue;
    seen.add(id);
    const v=map.get(id);
    if(v?.status?.privacyStatus!=="unlisted")continue;
    const s=v.snippet||{};
    const thumb=s.thumbnails?.medium?.url || s.thumbnails?.default?.url || "";
    list.push({id,title:String(s.title||"(タイトルなし)"),
      publishedAt:String(s.publishedAt||entry?.contentDetails?.videoPublishedAt||""),
      thumbnail:safeThumbnail(thumb),
      duration:String(v.contentDetails?.duration||""),
      channelTitle:String(s.channelTitle||"")});
  }
  list.sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));
  return list;
}
export async function gatherOwnUnlisted(api,{maxPages=MAX_PAGES_PER_CHANNEL,onProgress=()=>{}}={}){
  if(!Number.isInteger(maxPages)||maxPages<1||maxPages>MAX_PAGES_PER_CHANNEL)throw Error("invalid page cap");
  let calls=0;
  const call=async(resource,params)=>{calls++;return api(resource,params);};
  const ch=await call("channels",{part:"contentDetails",mine:"true",maxResults:50});
  if(!Array.isArray(ch?.items))throw Error("channels response invalid");
  const uploads=[...new Set(ch.items.map(x=>x?.contentDetails?.relatedPlaylists?.uploads).filter(x=>playlistIdRE.test(String(x||""))))];
  if(!uploads.length)throw Error("No uploads playlist for selected Google/YouTube channel");
  if(uploads.length>MAX_CHANNELS)throw Error("Too many channels for bounded diagnostic");
  const rows=[]; let partial=false;
  for(const playlistId of uploads){
    let token="",pages=0;
    const seenPageTokens=new Set();
    do{
      if(token && seenPageTokens.has(token))throw Error("Repeated playlist continuation token");
      if(token)seenPageTokens.add(token);
      const p=await call("playlistItems",{part:"contentDetails",playlistId,maxResults:50,...(token?{pageToken:token}:{})});
      if(!Array.isArray(p?.items))throw Error("playlistItems response invalid");
      rows.push(...p.items);
      token=String(p.nextPageToken||"");
      onProgress({candidateCount:rows.length,requests:calls});
      pages++;
    }while(token && pages<maxPages);
    if(token)partial=true;
  }
  const ids=[...new Set(rows.map(x=>x?.contentDetails?.videoId).filter(isVideoId))];
  const details=[];
  for(let i=0;i<ids.length;i+=50){
    const v=await call("videos",{part:"snippet,status,contentDetails",id:ids.slice(i,i+50).join(",")});
    if(!Array.isArray(v?.items))throw Error("videos response invalid");
    details.push(...v.items);
  }
  const items=unlistedFromUploads(rows,details);
  return {items,candidateCount:rows.length,uniqueCount:ids.length,partial,requests:calls,channelCount:uploads.length};
}
export function mockCollection(){
  const id1="AAAAAAAAAAA",id2="BBBBBBBBBBB",id3="CCCCCCCCCCC";
  const rows=[{contentDetails:{videoId:id1}},{contentDetails:{videoId:id2}},{contentDetails:{videoId:id3}}];
  const details=[
    {id:id1,status:{privacyStatus:"unlisted"},snippet:{title:"モック：エドの対空確認",publishedAt:"2026-11-14T10:00:00Z"}},
    {id:id2,status:{privacyStatus:"private"},snippet:{title:"モック：非公開（一覧に出ない）"}},
    {id:id3,status:{privacyStatus:"unlisted"},snippet:{title:"モック：起き攻めの確認",publishedAt:"2026-11-13T10:00:00Z"}}
  ];
  return unlistedFromUploads(rows,details);
}
