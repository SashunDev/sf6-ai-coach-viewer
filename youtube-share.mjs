// Issue #20/#27: guest-only YouTube watch, no owner OAuth/persistence.
import {SEEK_SMALL,targetSeconds,secondsDisplay,classifyReportedSeek} from "./youtube-seek-core.mjs";
import {playbackAction,playbackLabel,seekAnchor,restorePausedSeek} from "./youtube-player-controls.mjs";
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
export function embedYouTubeUrl(videoId,startSeconds,origin=""){
 if(!isYouTubeVideoId(videoId)||safeStartSeconds(startSeconds)!==startSeconds)throw Error("Invalid video");
 const url=new URL("https://www.youtube-nocookie.com/embed/"+videoId);
 url.searchParams.set("start",String(startSeconds));
 url.searchParams.set("playsinline","1");
 url.searchParams.set("rel","0");
 if(origin){
   const location=new URL(origin);
   if(location.origin!==origin||!(location.protocol==="https:"||
       (location.protocol==="http:"&&["localhost","127.0.0.1"].includes(location.hostname))))
     throw Error("Invalid playback origin");
   url.searchParams.set("enablejsapi","1");
   url.searchParams.set("origin",origin);
 }
 return url.href;
}

export function initializeShareView(doc,href,env=typeof window!=="undefined"?window:null){
 const get=id=>doc.getElementById(id);
 const status=get("shareStatus"),visible=get("shareValid"),start=get("shareStart"),
   frame=get("shareFrame"),link=get("shareYoutube"),startTime=get("shareStartTime"),
   controls=get("shareControls"),pause=get("sharePause");
 const seeks=[
  ["sharePrevTen",-10*SEEK_SMALL],["sharePrev",-SEEK_SMALL],
  ["shareNext",SEEK_SMALL],["shareNextTen",10*SEEK_SMALL],
  ["sharePrevFive",-5],["sharePrevSec",-1],["shareNextSec",1],["shareNextFive",5]
 ];
 let parsed=null,origin="";
 try{
  const url=new URL(href);
  if(url.protocol==="https:"||(url.protocol==="http:"&&["localhost","127.0.0.1"].includes(url.hostname))){
    parsed=parseSharedLink(url.search,url.hash);origin=url.origin;
  }
 }catch{}
 if(!parsed){
   status.textContent="共有URLが無効です。動画ID・時刻を確認してください。";
   visible.hidden=true;return false;
 }
 visible.hidden=false;
 link.href=directYouTubeUrl(parsed.videoId,parsed.startSeconds);
 startTime.textContent="再生開始位置："+Math.floor(parsed.startSeconds/60)+"分"+
    (parsed.startSeconds%60)+"秒（指定時刻・近似）";
 status.textContent="有効な共有リンクです。動画を開くとYouTube公式プレイヤーへ通信します。";
 let opened=false,ready=false,player=null,seekPlan=null;
 const playState=()=>{try{return ready&&player?Number(player.getPlayerState()):null;}catch{return null;}};
 function refresh(){
   const action=playbackAction(playState());
   pause.disabled=!action;
   pause.textContent=playbackLabel(action);
   pause.setAttribute("aria-label",pause.textContent);
   for(const [id] of seeks)get(id).disabled=!ready;
 }
 controls.hidden=true;refresh();
 pause.addEventListener("click",()=>{
   if(!ready||!player)return;
   const action=playbackAction(playState());if(!action)return;
   seekPlan=null;
   try{
     if(action==="pause"){player.pauseVideo();status.textContent="一時停止を要求しました。";}
     else{player.playVideo();status.textContent="再生を要求しました。";}
   }catch{status.textContent="操作に失敗しました。YouTubeで直接開いてください。";}
   refresh();
 });
 function recoverPausedSeek(){
   const plan=seekPlan;
   try{
     if(!restorePausedSeek(plan,player,1,Date.now()))return false;
     if(seekPlan===plan){
       refresh();
       status.textContent="移動後に再生されたため停止を要求しました。";
     }
   }catch{
     if(seekPlan===plan)status.textContent="移動後の停止要求に失敗しました。";
   }
   return true;
 }
 function seek(delta){
   if(!ready||!player)return;
   if(playState()!==2){status.textContent="時刻移動は一時停止中に操作してください。";return;}
   const current=Number(player.getCurrentTime());
   if(!Number.isFinite(current)||current<0){status.textContent="時刻を取得できません。";return;}
   const baseline=seekAnchor(seekPlan,player,1,current,Date.now());
   const goal=targetSeconds(baseline,delta,Number(player.getDuration()));
   if(goal===null){status.textContent="時刻指定が不正です。";return;}
   if(Math.abs(goal-baseline)<.001){status.textContent="動画の冒頭または終端です。";return;}
   const plan={player,serial:1,target:goal,at:Date.now()};
   seekPlan=plan;
   try{player.seekTo(goal,true);}catch{
     if(seekPlan===plan)seekPlan=null;
     status.textContent="時刻移動に失敗しました。";return;
   }
   if(seekPlan!==plan)return;
   status.textContent="時刻移動 "+secondsDisplay(baseline)+" → "+secondsDisplay(goal)+
      "（時刻指定・表示フレーム未保証）";
   (env?.setTimeout||setTimeout)(()=>{
     if(!ready||seekPlan!==plan||player!==plan.player)return;
     if(recoverPausedSeek()||seekPlan!==plan)return;
     try{
       const reported=Number(player.getCurrentTime());
       status.textContent="要求 "+secondsDisplay(goal)+" / API時刻 "+
         secondsDisplay(reported)+"："+classifyReportedSeek(baseline,goal,reported);
     }catch{status.textContent="移動後の状態確認に失敗しました。";}
   },1000);
 }
 for(const [id,delta] of seeks)get(id).addEventListener("click",()=>seek(delta));
 function failure(message){
   ready=false;seekPlan=null;refresh();
   status.textContent=message+"。YouTubeで直接開いてください。";
 }
 function loadAPI(){
   if(env?.YT?.Player)return Promise.resolve(env.YT);
   return new Promise((resolve,reject)=>{
     if(!env||!doc.head){reject(Error("YouTube API unavailable"));return;}
     let finished=false;
     const previous=env.onYouTubeIframeAPIReady;
     const finish=error=>{
       if(finished)return;
       finished=true;
       (env.clearTimeout||clearTimeout)(timeout);
       if(error)reject(error);else if(env.YT?.Player)resolve(env.YT);
       else reject(Error("YT.Player missing"));
     };
     const timeout=(env.setTimeout||setTimeout)(()=>finish(Error("API timeout")),15000);
     env.onYouTubeIframeAPIReady=()=>{
       if(typeof previous==="function"){try{previous();}catch{}}
       finish(null);
     };
     const tag=doc.createElement("script");
     tag.src="https://www.youtube.com/iframe_api";
     tag.async=true;tag.onerror=()=>finish(Error("API blocked"));
     doc.head.append(tag);
   });
 }
 start.addEventListener("click",()=>{
   if(opened)return;opened=true;
   const embed=doc.createElement("iframe");
   embed.id="shareYoutubeIframe";
   embed.src=embedYouTubeUrl(parsed.videoId,parsed.startSeconds,origin);
   embed.title="YouTube公式プレイヤー：共有SF6リプレイ";
   embed.loading="eager";
   embed.allow="autoplay; accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share";
   embed.referrerPolicy="strict-origin-when-cross-origin";
   embed.allowFullscreen=true;
   frame.replaceChildren(embed);
   start.disabled=true;controls.hidden=false;
   status.textContent="公式プレイヤーを読み込み中です。";
   // Official IFrame API and iframe are both loaded only after an explicit click.
   void loadAPI().then(api=>{
     try{
       player=new api.Player(embed,{events:{
         onReady:event=>{
           if(event.target!==player)return;
           ready=true;refresh();
           status.textContent="公式プレイヤー準備完了。";
         },
         onStateChange:event=>{
           if(event.target!==player||!ready)return;
           refresh();
           if(event.data===1&&!recoverPausedSeek())status.textContent="再生中：時刻移動の前に一時停止してください。";
           if(event.data===2)status.textContent="一時停止中：近似時刻移動を操作できます。";
         },
         onError:event=>{if(event.target===player)failure("埋め込み再生エラー "+String(event.data).slice(0,4));}
       }});
     }catch{failure("公式プレイヤーの初期化に失敗しました");}
   }).catch(()=>failure("YouTube操作APIの読み込みに失敗しました"));
 });
 return true;
}
if(typeof document!=="undefined"&&typeof location!=="undefined")
 initializeShareView(document,location.href);
