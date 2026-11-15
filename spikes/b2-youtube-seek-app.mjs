// Optional official YouTube IFrame Player API diagnostic.
// No YouTube media extraction, video download, API token access, or stored IDs.
import {safeVideoId,SEEK_SMALL,targetSeconds,secondsDisplay,classifyReportedSeek} from "./b2-youtube-seek-core.mjs";
const el=id=>document.getElementById(id);
const state={id:null,player:null,ready:false,loader:null,serial:0};
const tell=message=>{el("b2-status").textContent=message;};
const log=message=>{
 const entry=document.createElement("div");
 entry.textContent=message;
 el("b2-log").prepend(entry);
 while(el("b2-log").childElementCount>12)el("b2-log").lastChild.remove();
};
function setControlState(){
 const ready=!!(state.player&&state.ready);
 for(const id of ["b2-pause","b2-minus1","b2-plus1","b2-prev","b2-next"])el(id).disabled=!ready;
}
function reset(){
 state.serial++;state.id=null;state.ready=false;
 if(state.player){try{state.player.destroy();}catch{}}
 state.player=null;
 el("b2-video").replaceChildren();
 el("b2-panel").hidden=true;
 el("b2-log").replaceChildren();
 tell("動画未選択");
 setControlState();
}
async function loadOfficialIFrameAPI(){
 if(window.YT?.Player)return;
 if(state.loader)return state.loader;
 state.loader=new Promise((resolve,reject)=>{
   const script=document.createElement("script");
   let finished=false;
   const previous=window.onYouTubeIframeAPIReady;
   const deadline=setTimeout(()=>settle(false,new Error("YouTube IFrame APIの読み込みがタイムアウトしました")),15000);
   function settle(ok,error){
     if(finished)return;
     finished=true;clearTimeout(deadline);
     if(ok)resolve();
     else reject(error||new Error("YouTube IFrame APIの読み込みに失敗しました"));
   }
   window.onYouTubeIframeAPIReady=()=>{
     if(typeof previous==="function")try{previous();}catch{}
     settle(Boolean(window.YT?.Player),new Error("プレイヤーAPIが準備できません"));
   };
   script.src="https://www.youtube.com/iframe_api";
   script.async=true;script.onerror=()=>settle(false,new Error("YouTube公式スクリプトがブロックされました"));
   document.head.append(script);
 }).catch(e=>{state.loader=null;throw e;});
 return state.loader;
}
function mountPlayer(id){
 // A user must click the official YouTube play button before we can inspect paused seeks.
 const container=document.createElement("div");container.id="b2-player";
 el("b2-video").replaceChildren(container);
 state.player=new window.YT.Player(container,{
   width:"640",height:"360",videoId:id,
   playerVars:{playsinline:1,origin:location.origin,controls:1,rel:0},
   events:{
     onReady:event=>{
       if(!state.id||state.player!==event.target)return;
       state.ready=true;
       setControlState();
       tell("公式プレイヤー準備完了。動画を再生してから、一時停止してください。");
     },
     onError:event=>{
       if(!state.id||state.player!==event.target)return;
       tell("YouTube公式プレイヤーのエラー："+String(event.data).slice(0,4)+"（限定公開の再生可否・埋め込み許可をご確認ください）");
     },
     onStateChange:event=>{
       if(!state.id||state.player!==event.target)return;
       if(event.data===window.YT.PlayerState?.PAUSED)tell("一時停止中。細かい時刻移動を試せます。");
       else if(event.data===window.YT.PlayerState?.PLAYING)tell("再生中。まず「一時停止」を押してください。");
     }
   }
 });
}
async function selectVideo(id){
 if(!safeVideoId(id)){tell("不正な動画IDです");return;}
 state.serial++;
 const serial=state.serial;
 const previousId=state.id;
 state.id=id;
 el("b2-panel").hidden=false;
 el("b2-log").replaceChildren();
 if(state.player&&state.ready){
  try{state.player.cueVideoById(id);tell("別の動画に切り替えました。再生してから一時停止してください。");}
  catch(e){tell("動画の切替に失敗："+String(e?.message||"不明"));}
 }else{
  tell("YouTube公式プレイヤーを準備中…");
  try{
   await loadOfficialIFrameAPI();
   if(serial!==state.serial)return;
   mountPlayer(id);
  }catch(e){
   if(serial===state.serial)tell(String(e?.message||"公式API読み込みに失敗"));
  }
 }
 if(previousId!==id)log("選択した動画を公式埋め込みで開きます。映像のコピー・ダウンロードはしません。");
 el("b2-panel").scrollIntoView({behavior:"smooth",block:"start"});
}
document.addEventListener("sf6:b2-open",event=>selectVideo(event.detail?.id));
document.addEventListener("sf6:b2-reset",reset);
el("b2-close").addEventListener("click",reset);
el("b2-pause").addEventListener("click",()=>{
 if(!state.ready)return;
 state.player.pauseVideo();
 tell("一時停止を要求しました。表示が止まってから時刻移動を試してください。");
});
function requestSeek(delta){
 if(!state.ready||!state.player)return;
 const player=state.player;
 if(player.getPlayerState()!==window.YT.PlayerState?.PAUSED){
  tell("停止状態ではありません。最初にプレイヤーを再生し、一時停止してください。");
  return;
 }
 const from=Number(player.getCurrentTime());
 const to=targetSeconds(from,delta,Number(player.getDuration()));
 if(to===null){tell("現在時刻を取得できません");return;}
 if(Math.abs(to-from)<0.001){tell("動画の端に到達しています");return;}
 const serial=state.serial;
 try{player.seekTo(to,true);}
 catch(e){tell("YouTube時刻移動エラー："+String(e?.message||"不明"));return;}
 const direction=delta>0?"+":"-";
 const label=direction+secondsDisplay(Math.abs(delta));
 tell("時刻シーク要求 "+label+"："+secondsDisplay(from)+" → "+secondsDisplay(to)+"。映像の1コマ移動を保証しません。");
 setTimeout(()=>{
  if(serial!==state.serial||player!==state.player||!state.ready)return;
  const after=Number(player.getCurrentTime());
  log("指定 "+secondsDisplay(to)+" ／ 1秒後のAPI時刻 "+secondsDisplay(after)+"："+classifyReportedSeek(from,to,after));
 },1000);
}
for(const [id,delta] of [
 ["b2-minus1",-1],["b2-plus1",1],["b2-prev",-SEEK_SMALL],["b2-next",SEEK_SMALL]
]){
 el(id).addEventListener("click",()=>requestSeek(delta));
}
setControlState();
