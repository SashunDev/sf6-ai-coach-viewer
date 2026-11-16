// Issue #18: optional owner-only YouTube review mode.
// No OAuth secrets or Google access tokens are persisted; no YouTube media extraction.
import {SCOPE,isClientId,gatherOwnUnlisted,isVideoId,safeThumbnail} from "./youtube-library-core.mjs";
import {SEEK_SMALL,targetSeconds,secondsDisplay,classifyReportedSeek} from "./youtube-seek-core.mjs";

const $=id=>document.getElementById(id);
const state={
 active:false,epoch:0,token:null,controller:null,videos:[],partial:false,
 gisPromise:null,ytPromise:null,player:null,playerReady:false,
 selected:null,selectionSerial:0,seekPlan:null,savedFootnote:null
};
const status=message=>{ $("youtubeStatus").textContent=message; };
const playback=message=>{ $("youtubePlaybackStatus").textContent=message; };
const info=message=>{
 const log=$("youtubeSeekLog");
 const row=document.createElement("div");row.textContent=message;log.prepend(row);
 while(log.childElementCount>8)log.lastChild.remove();
};
function buttons(){
 const ready=state.active&&state.player&&state.playerReady;
 for(const id of ["youtubePause","youtubePrev","youtubeNext","youtubePrevSec","youtubeNextSec","youtubePrevTen","youtubeNextTen","youtubePrevFive","youtubeNextFive","youtubeCopy"])$(id).disabled=!ready;
 $("youtubeRevoke").disabled=!state.token;
}
function clearPlayer(){
 state.selectionSerial++;
 state.seekPlan=null;
 const old=state.player;state.player=null;state.playerReady=false;state.selected=null;
 if(old){try{old.destroy();}catch{}}
 $("youtubePlayer").replaceChildren();
 $("youtubeCurrentTitle").textContent="動画未選択";
 $("youtubePlaybackTime").textContent="--:--.---";
 $("youtubeHandoff").value="";
 $("youtubeSeekLog").replaceChildren();
 playback("動画を選択してください。");
 buttons();
}
function clearSession(message="YouTube接続と一覧を消去しました。"){
 state.epoch++;
 if(state.controller)state.controller.abort();
 state.controller=null;
 state.token=null;state.videos=[];state.partial=false;
 $("youtubeClientId").value="";
 $("youtubeConsent").checked=false;
 $("youtubeQuery").value="";
 $("youtubeNote").value="";
 clearPlayer();render();
 status(message);
}
function activate(){
 if(state.active)return;
 document.dispatchEvent(new Event("sf6:youtube-review-open"));
 state.active=true;
 document.body.classList.add("youtube-review-active");
 $("viewer").hidden=true;
 $("youtubeReviewPanel").hidden=false;
 $("sourceBadge").textContent="YOUTUBE公式プレイヤー · 外部通信あり";
 $("youtubeReviewTitle").focus();
 const footnote=$("reviewFootnote");
 if(footnote){state.savedFootnote=footnote.textContent;footnote.textContent="YouTubeモードはGoogle/YouTube公式サービスへ通信します。動画はAIへ自動送信されません。";}
 // Preload Google's official GIS script only after the owner opens this mode.
 // Actual OAuth access still requires a separate explicit consent and user click.
 if(!window.google?.accounts?.oauth2?.initTokenClient){
   $("youtubeConnect").disabled=true;
   ensureGoogleScript().then(()=>{
     if(state.active){$("youtubeConnect").disabled=false;status("認証準備完了。Client ID入力・同意後に接続できます。");}
   }).catch(()=>{
     if(state.active)status("Google認証の準備に失敗しました。ネットワーク設定・Safariのコンテンツブロックを確認してください。");
   });
 }
}
function deactivate(){
 if(!state.active)return;
 clearSession("ローカル動画モードへ戻りました。");
 state.active=false;
 document.body.classList.remove("youtube-review-active");
 $("youtubeReviewPanel").hidden=true;
 $("viewer").hidden=false;
 $("sourceBadge").textContent="LOCAL VIDEO · NO UPLOAD";
 if(state.savedFootnote!==null){$("reviewFootnote").textContent=state.savedFootnote;state.savedFootnote=null;}
 $("youtubeOpen").focus();
}
$("youtubeOpen").addEventListener("click",activate);
$("youtubeBack").addEventListener("click",deactivate);
$("youtubeLocalFallback").addEventListener("click",()=>{
 deactivate();
 $("fileInput")?.click();
});
$("youtubeClear").addEventListener("click",()=>clearSession());

function ensureGoogleScript(){
 if(window.google?.accounts?.oauth2?.initTokenClient)return Promise.resolve();
 if(state.gisPromise)return state.gisPromise;
 state.gisPromise=new Promise((resolve,reject)=>{
   const script=document.createElement("script");
   script.src="https://accounts.google.com/gsi/client";script.async=true;
   script.onload=()=>window.google?.accounts?.oauth2?.initTokenClient?resolve():reject(Error("GIS unavailable"));
   script.onerror=()=>reject(Error("GIS network blocked"));
   document.head.append(script);
 }).catch(e=>{state.gisPromise=null;throw e;});
 return state.gisPromise;
}
function render(){
 const root=$("youtubeList");root.replaceChildren();
 const term=$("youtubeQuery").value.trim().toLocaleLowerCase("ja");
 const matching=state.videos.filter(v=>v.title.toLocaleLowerCase("ja").includes(term));
 $("youtubeCount").textContent=state.videos.length
  ?"限定公開 "+state.videos.length+"件（絞り込み："+matching.length+"件）"+(state.partial?" / 上限到達：一部のみ":"")
  :"限定公開動画の一覧は未取得です。";
 for(const video of matching){
   const b=document.createElement("button");b.type="button";b.className="youtube-card";
   b.setAttribute("aria-label",video.title+"を公式YouTubeプレイヤーで開く");
   if(safeThumbnail(video.thumbnail)){
     const img=document.createElement("img");
     img.src=video.thumbnail;img.alt="";img.loading="lazy";img.referrerPolicy="no-referrer";b.append(img);
   }
   const title=document.createElement("strong");title.textContent=video.title;b.append(title);
   const date=document.createElement("small");date.textContent=(video.publishedAt||"投稿日不明").slice(0,10);b.append(date);
   const prompt=document.createElement("span");prompt.textContent="公式プレイヤーで開く";b.append(prompt);
   b.addEventListener("click",()=>void selectVideo(video));
   root.append(b);
 }
 if(state.videos.length&&!matching.length){
   const msg=document.createElement("p");msg.textContent="検索条件に一致する動画はありません。";root.append(msg);
 }
}
$("youtubeQuery").addEventListener("input",render);
async function youtubeApi(resource,params,signal,epoch,token){
 if(epoch!==state.epoch||signal.aborted||token!==state.token)throw Error("Disconnected");
 if(!["channels","playlistItems","videos"].includes(resource))throw Error("Unsupported API operation");
 const url=new URL("https://www.googleapis.com/youtube/v3/"+resource);
 for(const [key,value] of Object.entries(params)){
   if(value!==undefined&&value!=="")url.searchParams.set(key,String(value));
 }
 const response=await fetch(url.href,{
   method:"GET",headers:{Authorization:"Bearer "+token},
   signal,cache:"no-store",referrerPolicy:"no-referrer",credentials:"omit",redirect:"error"
 });
 if(!response.ok){
   let category="";
   try{const err=await response.json();category=String(err?.error?.status||err?.error?.errors?.[0]?.reason||"").slice(0,60);}
   catch{}
   throw Error("YouTube API HTTP "+response.status+(category?" / "+category:""));
 }
 return response.json();
}
async function listOwnVideos(epoch,token){
 const ctrl=new AbortController();state.controller=ctrl;
 status("本人のアップロード一覧を読み込み中…");
 try{
   const result=await gatherOwnUnlisted(
      (resource,params)=>youtubeApi(resource,params,ctrl.signal,epoch,token),
      {onProgress:({candidateCount})=>{
        if(epoch===state.epoch)status("本人アップロード候補 "+candidateCount+"件を照合中…");
      }}
   );
   if(epoch!==state.epoch||ctrl.signal.aborted||state.token!==token)return;
   state.videos=result.items;state.partial=result.partial;render();
   status("本人限定公開 "+result.items.length+"件を表示 / 候補 "+result.candidateCount+
     "件 / "+result.requests+" API要求"+(result.partial?"。取得上限により一部のみ。":"。"));
 }catch(err){
   if(epoch!==state.epoch||ctrl.signal.aborted)return;
   const message=String(err?.message||"不明なエラー");
   if(/HTTP 401/.test(message))status("認証の期限切れの可能性があります。接続を消去し再認証してください。");
   else if(/HTTP 403/.test(message))status("YouTube APIの権限・クォータ・チャンネル設定を確認してください（"+message.slice(0,80)+"）。");
   else if(/No uploads playlist/.test(message))status("選択したGoogleアカウントにアップロード用プレイリストがありません。");
   else status("一覧取得失敗："+message.slice(0,140));
   state.videos=[];render();clearPlayer();
 }finally{if(state.controller===ctrl)state.controller=null;}
}
$("youtubeConnect").addEventListener("click",()=>{
 if(!state.active)return;
 if(!$("youtubeConsent").checked){status("データ取扱説明への同意が必要です。");return;}
 const id=$("youtubeClientId").value.trim();
 if(!isClientId(id)){status("Webアプリ用OAuth Client IDの形式を確認してください。");return;}
 if(!window.google?.accounts?.oauth2?.initTokenClient){
    status("Google認証用スクリプトが準備できていません。");return;
 }
 // Open the Google consent popup synchronously from this user click.
 clearSession("Googleの認証画面を開いています…");
 $("youtubeClientId").value=id;$("youtubeConsent").checked=true;
 const epoch=state.epoch;
 try{
   const client=window.google.accounts.oauth2.initTokenClient({
     client_id:id,scope:SCOPE,
     callback:resp=>{
       if(epoch!==state.epoch||!state.active)return;
       if(resp?.error||!resp?.access_token){
         status("Google認証が完了しませんでした："+String(resp?.error||"不明").slice(0,80));return;
       }
       if(!window.google.accounts.oauth2.hasGrantedAllScopes(resp,SCOPE)){
         status("YouTube読み取り専用権限を許可できませんでした。");return;
       }
       state.token=resp.access_token;buttons();void listOwnVideos(epoch,resp.access_token);
     },
     error_callback:resp=>{
       if(epoch===state.epoch)status("認証画面の処理失敗："+String(resp?.type||"不明").slice(0,60));
     }
   });
   client.requestAccessToken({prompt:"select_account"});
 }catch(e){if(epoch===state.epoch)status("認証開始失敗："+String(e?.message||"不明").slice(0,100));}
});
$("youtubeRevoke").addEventListener("click",()=>{
 const token=state.token;
 clearSession("Google側の権限取消を要求しています…");
 if(!token||typeof window.google?.accounts?.oauth2?.revoke!=="function"){
   status("取消できませんでした。Googleアカウントの接続管理から確認してください。");return;
 }
 try{
   window.google.accounts.oauth2.revoke(token,res=>{
     status(res?.successful?"Googleへの認可を取り消しました。":
       "Google側の取消を確認できませんでした。接続済みアプリから確認してください。");
   });
 }catch{status("取消要求に失敗しました。Googleアカウントの接続管理で確認してください。");}
});

async function loadYouTubeAPI(){
 if(window.YT?.Player)return;
 if(state.ytPromise)return state.ytPromise;
 state.ytPromise=new Promise((resolve,reject)=>{
   let completed=false;
   const script=document.createElement("script");
   const timeout=setTimeout(()=>finish(new Error("YouTube公式プレイヤーの準備がタイムアウトしました")),15000);
   const previous=window.onYouTubeIframeAPIReady;
   function finish(error){
     if(completed)return;completed=true;clearTimeout(timeout);
     if(error)reject(error);else resolve();
   }
   window.onYouTubeIframeAPIReady=()=>{
     if(typeof previous==="function"){try{previous();}catch{}}
     if(window.YT?.Player)finish();else finish(Error("YT.Player unavailable"));
   };
   script.src="https://www.youtube.com/iframe_api";
   script.async=true;script.onerror=()=>finish(Error("YouTube公式プレイヤーがブロックされました"));
   document.head.append(script);
 }).catch(err=>{state.ytPromise=null;throw err;});
 return state.ytPromise;
}
function mountPlayer(video,serial){
 const host=document.createElement("div");host.id="ownerYoutubeEmbed";
 $("youtubePlayer").replaceChildren(host);
 const player=new window.YT.Player(host,{
   width:"640",height:"360",videoId:video.id,
   playerVars:{playsinline:1,origin:location.origin,controls:1,rel:0},
   events:{
     onReady:event=>{
       if(state.player!==event.target||!state.active)return;
       state.playerReady=true;buttons();
       playback("公式プレイヤー準備完了。映像を再生した後、一時停止してください。");
     },
     onError:event=>{
       if(state.player!==event.target||!state.active)return;
       state.playerReady=false;buttons();
       playback("YouTube埋め込み再生エラー "+String(event.data).slice(0,4)+
         "。動画の埋め込み制限を確認するか、端末内MP4を選択してください。");
     },
     onStateChange:event=>{
       if(state.player!==event.target||!state.active)return;
       if(event.data===window.YT.PlayerState?.PAUSED)playback("停止中：細かい時刻移動ができます（近似）。");
       else if(event.data===window.YT.PlayerState?.PLAYING){
         state.seekPlan=null;
         playback("再生中：細かい時刻移動の前に停止してください。");
       }
     }
   }
 });
 state.player=player;
}
async function selectVideo(video){
 if(!state.active||!state.token||!isVideoId(video?.id)||!state.videos.some(v=>v.id===video.id))return;
 state.selectionSerial++;
 state.seekPlan=null;
 const serial=state.selectionSerial;
 state.selected=video;
 $("youtubeCurrentTitle").textContent=video.title;
 $("youtubeHandoff").value="";$("youtubeSeekLog").replaceChildren();
 $("youtubePlayer").scrollIntoView({behavior:"smooth",block:"nearest"});
 try{
   if(state.player&&state.playerReady){
     state.player.cueVideoById(video.id);
     playback("動画を切り替えました。再生後に停止してください。");
   }else{
     const previous=state.player;
     state.player=null;state.playerReady=false;buttons();
     if(previous){try{previous.destroy();}catch{}}
     playback("YouTube公式プレイヤーを準備中…");
     await loadYouTubeAPI();
     if(serial!==state.selectionSerial||!state.active||!state.token)return;
     mountPlayer(video,serial);
   }
 }catch(e){
   if(serial===state.selectionSerial)playback("プレイヤー起動失敗："+String(e?.message||"不明").slice(0,110));
 }
}
$("youtubePause").addEventListener("click",()=>{
 if(!state.playerReady)return;
 state.player.pauseVideo();playback("停止を要求しました。映像が止まったことを確認してください。");
});
// Short tap bursts should accumulate targets even when YT.getCurrentTime() lags seekTo().
 // Never treat the optimistic target as proof of the frame that was displayed.
function fineSeek(delta){
 if(!state.playerReady||!state.player||!state.selected)return;
 const player=state.player;
 if(player.getPlayerState()!==window.YT.PlayerState?.PAUSED){
   state.seekPlan=null;
   playback("一時停止してから細かい時刻移動を行ってください。");return;
 }
 const current=Number(player.getCurrentTime());
 if(!Number.isFinite(current)||current<0){playback("現在時刻を取得できません。");return;}
 const serial=state.selectionSerial;
 const now=Date.now();
 const previous=state.seekPlan;
 // A burst shares one optimistic anchor for <=1.5s between taps. A new video,
 // a resumed player, or a longer gap starts from the player's reported time.
 const valid=previous&&previous.player===player&&previous.serial===serial&&
   now>=previous.at&&now-previous.at<=1500;
 const baseline=valid?previous.target:current;
 const goal=targetSeconds(baseline,delta,Number(player.getDuration()));
 if(goal===null){playback("時刻移動の値が不正です。");return;}
 if(Math.abs(goal-baseline)<.001){playback("動画の冒頭または終端です。");return;}
 const plan={player,serial,target:goal,at:now};
 try{player.seekTo(goal,true);}
 catch(e){playback("時刻移動に失敗："+String(e?.message||"不明").slice(0,70));return;}
 state.seekPlan=plan;
 playback("時刻移動 "+(delta>0?"+":"-")+secondsDisplay(Math.abs(delta))+
   "："+secondsDisplay(baseline)+" → "+secondsDisplay(goal)+"（時刻指定・表示フレーム未保証）");
 setTimeout(()=>{
   if(!state.active||serial!==state.selectionSerial||player!==state.player||
       !state.playerReady||state.seekPlan!==plan)return;
   const reported=Number(player.getCurrentTime());
   const stateNow=player.getPlayerState();
   if(stateNow===window.YT.PlayerState?.PLAYING){
     player.pauseVideo();
     info("シーク後に再生されたため停止を要求しました。");
   }
   info("要求 "+secondsDisplay(goal)+" / API時刻 "+secondsDisplay(reported)+
      "：" + classifyReportedSeek(baseline,goal,reported));
 },1000);
}
for(const [id,delta] of [["youtubePrevFive",-5],["youtubePrevSec",-1],
 ["youtubePrevTen",-10*SEEK_SMALL],["youtubePrev",-SEEK_SMALL],
 ["youtubeNext",SEEK_SMALL],["youtubeNextTen",10*SEEK_SMALL],
 ["youtubeNextSec",1],["youtubeNextFive",5]]){
 $(id).addEventListener("click",()=>fineSeek(delta));
}
function handoffText(){
 if(!state.selected||!state.playerReady)return null;
 const current=Number(state.player.getCurrentTime());
 if(!Number.isFinite(current)||current<0)return null;
 // Link playback starts at integer seconds, but the analysis timestamp must
 // preserve milliseconds. Neither API time nor a requested seek certifies a frame.
 const millis=Math.round(current*1000);
 const whole=Math.floor(millis/1000);
 const formatted=String(Math.floor(whole/60)).padStart(2,"0")+":"+
   String(whole%60).padStart(2,"0")+"."+String(millis%1000).padStart(3,"0");
 const linkSeconds=Math.floor(current);
 const title=String(state.selected.title||"(無題)").replace(/[\r\n\t]+/g," ").slice(0,160);
 const note=$("youtubeNote").value.trim().slice(0,600);
 const plan=state.seekPlan;
 const requested=plan?.player===state.player&&plan?.serial===state.selectionSerial&&
   Date.now()-plan.at<=2500?plan.target:null;
 return "SF6 AI Coach レビュー引き継ぎ\n"+
  "動画名: "+title+"\n"+
  "動画URL: https://www.youtube.com/watch?v="+state.selected.id+"&t="+linkSeconds+"s（URLの再生開始は秒単位）\n"+
  "時刻: "+formatted+"（YouTube公式プレイヤーのAPI報告時刻・近似）\n"+
  (requested!==null?"直近のシーク要求: "+secondsDisplay(requested)+"（表示コマとの一致は未確認）\n":"")+
  "振り返り: "+(note||"この時刻の判断を振り返りたい。")+"\n"+
  "※映像をChatGPTが自動確認したわけではありません。";
}
$("youtubeCopy").addEventListener("click",async()=>{
 const content=handoffText();if(!content)return;
 $("youtubeHandoff").value=content;
 try{
   await navigator.clipboard.writeText(content);
   playback("引き継ぎテキストをコピーしました。ChatGPTへの送信は手動です。");
 }catch{
   playback("自動コピーが制限されました。下のテキスト欄から手動でコピーしてください。");
   $("youtubeHandoff").focus();$("youtubeHandoff").select();
 }
});
window.setInterval(()=>{
 if(!state.active||!state.playerReady||!state.player)return;
 try{$("youtubePlaybackTime").textContent=secondsDisplay(state.player.getCurrentTime())+
      " / "+secondsDisplay(state.player.getDuration());}catch{}
},500);
render();buttons();
