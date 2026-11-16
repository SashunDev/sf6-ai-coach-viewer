// Issue #20: public, read-only YouTube watch route, completely separate from owner OAuth.
export const MAX_START_SECONDS=43200; // 12 hours, refuse unbounded query inputs.
export function isYouTubeVideoId(value){
 return typeof value==="string"&&/^[A-Za-z0-9_-]{11}$/.test(value);
}
export function safeStartSeconds(value){
 if(typeof value!=="number"||!Number.isFinite(value)||value<0||value>MAX_START_SECONDS)return null;
 return Math.floor(value);
}
export function parseSharedLink(search,hash=""){
 if(typeof search!=="string"||search.length>160||hash!=="")return null;
 const query=search.startsWith("?")?search.slice(1):search;
 if(!query)return null;
 const params=new URLSearchParams(query);
 const keys=[...params.keys()];
 if(keys.length<1||keys.length>2||keys.some(key=>key!=="v"&&key!=="t"))return null;
 if(params.getAll("v").length!==1||params.getAll("t").length>1)return null;
 const id=params.get("v");
 if(!isYouTubeVideoId(id))return null;
 const timeText=params.get("t");
 if(timeText!==null&&!/^(?:0|[1-9][0-9]{0,4})$/.test(timeText))return null;
 const seconds=timeText===null?0:Number(timeText);
 if(!Number.isSafeInteger(seconds)||seconds>MAX_START_SECONDS)return null;
 return {videoId:id,startSeconds:seconds};
}
export function makeShareUrl(pageUrl,videoId,startSeconds=0){
 if(!isYouTubeVideoId(videoId))throw Error("Invalid YouTube video ID");
 const t=safeStartSeconds(startSeconds);
 if(t===null)throw Error("Invalid start seconds");
 const url=new URL(pageUrl);
 if(url.protocol!=="https:"&&!(url.protocol==="http:"&&["localhost","127.0.0.1"].includes(url.hostname)))
   throw Error("HTTPS site URL required");
 url.search="";url.hash="";
 url.searchParams.set("v",videoId);
 if(t!==0)url.searchParams.set("t",String(t));
 return url.href;
}
export function directYouTubeUrl(videoId,startSeconds){
 if(!isYouTubeVideoId(videoId)||safeStartSeconds(startSeconds)!==startSeconds)throw Error("Invalid video");
 const url=new URL("https://www.youtube.com/watch");
 url.searchParams.set("v",videoId);
 if(startSeconds>0)url.searchParams.set("t",String(startSeconds)+"s");
 return url.href;
}
export function embedYouTubeUrl(videoId,startSeconds){
 if(!isYouTubeVideoId(videoId)||safeStartSeconds(startSeconds)!==startSeconds)throw Error("Invalid video");
 const url=new URL("https://www.youtube-nocookie.com/embed/"+videoId);
 url.searchParams.set("start",String(startSeconds));
 url.searchParams.set("playsinline","1");
 url.searchParams.set("rel","0");
 return url.href;
}
export function initializeShareView(doc,href){
 const status=doc.getElementById("shareStatus");
 const visible=doc.getElementById("shareValid");
 const start=doc.getElementById("shareStart");
 const frame=doc.getElementById("shareFrame");
 const link=doc.getElementById("shareYoutube");
 const startTime=doc.getElementById("shareStartTime");
 let parsed=null;
 try{
   const url=new URL(href);
   if(url.protocol==="https:"||(url.protocol==="http:"&&["localhost","127.0.0.1"].includes(url.hostname)))
     parsed=parseSharedLink(url.search,url.hash);
 }catch{}
 if(!parsed){
   status.textContent="共有URLが無効です。動画ID・時刻を確認してください。";
   visible.hidden=true;return false;
 }
 visible.hidden=false;
 const watch=directYouTubeUrl(parsed.videoId,parsed.startSeconds);
 link.href=watch;
 startTime.textContent="再生開始位置："+Math.floor(parsed.startSeconds/60)+"分"+(parsed.startSeconds%60)+"秒（指定時刻・近似）";
 status.textContent="有効な共有リンクです。動画を開くとYouTube公式プレイヤーへ通信します。";
 let opened=false;
 start.addEventListener("click",()=>{
   if(opened)return;
   opened=true;
   const embed=doc.createElement("iframe");
   embed.src=embedYouTubeUrl(parsed.videoId,parsed.startSeconds);
   embed.title="YouTube公式プレイヤー：共有SF6リプレイ";
   embed.loading="eager";
   embed.allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share";
   embed.referrerPolicy="strict-origin-when-cross-origin";
   embed.allowFullscreen=true;
   frame.replaceChildren(embed);
   start.disabled=true;
   status.textContent="動画の読み込みを開始しました。再生できない場合はYouTubeで直接開いてください。";
 });
 return true;
}
if(typeof document!=="undefined"&&typeof location!=="undefined"){
 initializeShareView(document,location.href);
}
