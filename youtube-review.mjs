import {STUDIO_URL,studioSearchCandidate} from "./youtube-studio-support.mjs";
import {playbackAction,playbackLabel,seekAnchor,restorePausedSeek} from "./youtube-player-controls.mjs";
// Issue #18: optional owner-only YouTube review mode.
// No OAuth secrets or Google access tokens are persisted; no YouTube media extraction.
import {SCOPE,isClientId,gatherOwnUnlisted,isVideoId,safeThumbnail} from "./youtube-library-core.mjs";
import {SEEK_SMALL,targetSeconds,secondsDisplay,classifyReportedSeek} from "./youtube-seek-core.mjs";
import {readCache,writeCache,removeCache} from "./youtube-library-cache.mjs";

const $=id=>document.getElementById(id);
const PUBLIC_ID_KEY="sf6-coach-public-google-oauth-client-id-v1";
const localStore=()=>{try{return window.localStorage;}catch{return null;}};
// The OAuth Web Client ID is a public identifier, not a client secret.
// Tokens stay in tab memory. An explicitly opted-in metadata list may be
// restored for up to 30 days by youtube-library-cache.mjs.
function siteClientId(){
 const value=document.querySelector('meta[name="sf6-youtube-oauth-client-id"]')?.content?.trim()||"";
 return isClientId(value)?value:"";
}
function cachedClientId(){
 try{const value=window.localStorage.getItem(PUBLIC_ID_KEY)||"";return isClientId(value)?value:"";}
 catch{return "";}
}
function setupClientId(){
 const configured=siteClientId();
 const saved=configured?"":cachedClientId();
 $("youtubeClientId").value=configured||saved;
 $("youtubeClientIdRow").hidden=!!configured;
 $("youtubeForgetClientId").hidden=!!configured||!saved;
 $("youtubeClientIdHelp").textContent=configured
   ?"このサイトは公開Google OAuth Client IDを設定済みです。Googleへの接続・同意のみ行ってください。"
   : saved?"公開Client IDをこの端末から読み込みました。Googleへの接続・同意のみ行ってください。"
   :"公開Google OAuth Client IDを初回だけ入力してください。接続時に、この端末へIDのみを保存します。";
}

const state={
 active:false,epoch:0,token:null,controller:null,videos:[],partial:false,
 gisPromise:null,ytPromise:null,player:null,playerReady:false,
 selected:null,selectionSerial:0,seekPlan:null,savedFootnote:null,
 cachedView:false,lastSyncedAt:null
};
const status=message=>{
 $("youtubeStatus").textContent=message;
 const mirror=$("youtubeSettingsStatus");if(mirror)mirror.textContent=message;
};
const playback=message=>{ $("youtubePlaybackStatus").textContent=message; };
const cacheNote=message=>{$("youtubeCacheNotice").textContent=message;};
const lastUpdated=ms=>new Date(ms).toLocaleString("ja-JP",{dateStyle:"short",timeStyle:"short"});
function cacheStatus(){
 if(state.cachedView&&state.lastSyncedAt)
   cacheNote(($("youtubeKeepList").checked?"前回保存した一覧":"前回取得した一覧（この端末への保存は解除済み）")+
     "（最終同期 "+lastUpdated(state.lastSyncedAt)+
     "）。最新の公開状態は未確認です。更新するには「再取得」を押してください。"+
     (state.partial?" 保存件数または取得件数が上限に達しています。":""));
 else if(state.lastSyncedAt&&$("youtubeKeepList").checked)
   cacheNote("この端末に保存済み：最終同期 "+lastUpdated(state.lastSyncedAt)+
     "。30日経過で自動削除されます。");
 else
   cacheNote("端末への一覧保存は無効です。接続・保存設定で保存を有効にできます。");
}
function restoreCachedList(){
 const saved=readCache(localStore());
 if(!saved){
   $("youtubeKeepList").checked=false;
   cacheStatus();
   return false;
 }
 state.videos=saved.items;
 state.partial=saved.partial;
 state.cachedView=true;
 state.lastSyncedAt=saved.savedAt;
 $("youtubeKeepList").checked=true;
 $("youtubeConsent").checked=true; // consent was explicit at the original successful sync
 render();
 cacheStatus();
 return true;
}
const info=message=>{
 const log=$("youtubeSeekLog");
 const row=document.createElement("div");row.textContent=message;log.prepend(row);
 while(log.childElementCount>8)log.lastChild.remove();
};
function refreshPlaybackToggle(){
 const button=$("youtubePause");
 let action=null;
 if(state.active&&state.player&&state.playerReady){
   try{action=playbackAction(state.player.getPlayerState());}catch{}
 }
 button.disabled=!action;
 button.textContent=playbackLabel(action);
 button.setAttribute("aria-label",button.textContent);
}
function buttons(){
 renderStudioSupport();
 const ready=state.active&&state.player&&state.playerReady;
 for(const id of ["youtubePrev","youtubeNext","youtubePrevSec","youtubeNextSec","youtubePrevTen","youtubeNextTen","youtubePrevFive","youtubeNextFive","youtubeCopy","youtubeShare"])$(id).disabled=!ready;
 refreshPlaybackToggle();
 if($("workbenchShare"))$("workbenchShare").disabled=!ready;
 $("youtubeRevoke").disabled=!state.token;
 $("youtubeRefresh").disabled=!state.active||!window.google?.accounts?.oauth2?.initTokenClient;
}

let studioSelectionKey="";
function renderStudioSupport(){
 const title=typeof state.selected?.title==="string"?state.selected.title:"";
 const keyword=studioSearchCandidate(title);
 const enabled=!!(state.active&&isVideoId(state.selected?.id)&&keyword);
 $("youtubeStudioOpen").disabled=!enabled;
 $("youtubeStudioCopyKeyword").disabled=!enabled;
 $("youtubeStudioCopyTitle").disabled=!enabled;
 $("youtubeStudioFullTitle").value=title;
 $("youtubeStudioKeyword").value=keyword;
 $("youtubeStudioLink").href=STUDIO_URL;
 const key=(state.selected?.id||"")+"\n"+title;
 if(key!==studioSelectionKey){$("youtubeStudioStatus").textContent="";studioSelectionKey=key;}
}
$("youtubeStudioOpen").addEventListener("click",()=>{
 renderStudioSupport();
 if($("youtubeStudioOpen").disabled)return;
 const dialog=$("youtubeStudioDialog");
 if(!dialog.open){
   // Native dialog restores focus to the element active before showModal.
   $("youtubeStudioOpen").focus({preventScroll:true});
   dialog.showModal();
 }
});
async function copyStudioText(fieldId,label){
 if(!state.active||$("youtubeStudioOpen").disabled)return;
 const field=$(fieldId),text=field.value,key=studioSelectionKey;
 if(!text)return;
 try{
   await navigator.clipboard.writeText(text);
   if(key===studioSelectionKey)$("youtubeStudioStatus").textContent=label+"をコピーしました。";
 }catch{
   if(key!==studioSelectionKey)return;
   $("youtubeStudioStatus").textContent="自動コピーできませんでした。表示欄の文字列を選択して手動コピーしてください。";
   field.focus();field.select();
 }
}
$("youtubeStudioCopyKeyword").addEventListener("click",()=>void copyStudioText("youtubeStudioKeyword","検索キーワード"));
$("youtubeStudioCopyTitle").addEventListener("click",()=>void copyStudioText("youtubeStudioFullTitle","タイトル全文"));

function showRecovery(show){ $("youtubeRecovery").hidden=!show; }
function clearPlayer(){
 showRecovery(false);
 state.selectionSerial++;
 state.seekPlan=null;
 const old=state.player;state.player=null;state.playerReady=false;state.selected=null;
 if(old){try{old.destroy();}catch{}}
 $("youtubePlayer").replaceChildren();
 $("youtubeReviewPanel").dataset.hasVideo="false";
 window.SF6Workbench?.pane("library");
 $("youtubeCurrentTitle").textContent="動画未選択";
 $("youtubePlaybackTime").textContent="--:--.---";
 $("youtubeHandoff").value="";
 $("youtubeShareLink").value="";
 if($("youtubeShareStatus"))$("youtubeShareStatus").textContent="";
 $("youtubeSeekLog").replaceChildren();
 playback("動画を選択してください。");
 buttons();
}
function clearSession(message="YouTube接続・一覧・保存分を消去しました。",eraseSaved=true){
 state.epoch++;
 if(state.controller)state.controller.abort();
 state.controller=null;
 state.token=null;state.videos=[];state.partial=false;
 state.cachedView=false;state.lastSyncedAt=null;
 if(eraseSaved)removeCache(localStore());
 $("youtubeKeepList").checked=false;
 $("youtubeClientId").value="";
 setupClientId();
 $("youtubeConsent").checked=false;
 $("youtubeQuery").value="";
 $("youtubeNote").value="";
 clearPlayer();render();cacheStatus();
 status(message);
}
function activate(){
 if(state.active)return;
 window.dispatchEvent(new Event("sf6:youtube-review-open"));
 state.active=true;
 setupClientId();
 if(!state.videos.length)restoreCachedList();
 document.body.classList.add("youtube-review-active");
 document.body.dataset.reviewMode="youtube";
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
   $("youtubeRefresh").disabled=true;
   ensureGoogleScript().then(()=>{
     if(state.active){
       $("youtubeConnect").disabled=false;buttons();
       status(state.cachedView?"保存済み一覧を表示中。Google認証なしで視聴できます。最新情報は「再取得」から。":
         "認証準備完了。Googleに接続して一覧を読み込めます。");
     }
   }).catch(()=>{
     if(state.active)status("Google認証の準備に失敗しました。保存一覧は閲覧できます。ネットワーク・コンテンツブロックを確認してください。");
   });
 }
 buttons();
}
function deactivate(){
 if(!state.active)return;
 state.seekPlan=null;
 // Navigation is reversible; only explicit clear/revoke erases notes or state.
 if(state.player){try{state.player.pauseVideo();}catch{}}
 state.epoch++;
 if(state.controller)state.controller.abort();
 state.controller=null;
 state.active=false;
 document.body.classList.remove("youtube-review-active");
 $("youtubeReviewPanel").hidden=true;
 $("viewer").hidden=false;
 $("sourceBadge").textContent="LOCAL VIDEO · NO UPLOAD";
 if(state.savedFootnote!==null){$("reviewFootnote").textContent=state.savedFootnote;state.savedFootnote=null;}
 $("youtubeOpen").focus();
 buttons();
}
$("youtubeOpen").addEventListener("click",activate);
$("youtubeBack").addEventListener("click",()=>{
 deactivate();window.SF6Workbench?.home();
});
window.addEventListener("sf6:review-home",deactivate);
$("youtubeLocalFallback").addEventListener("click",()=>{
 deactivate();
 window.SF6Workbench?.local();
 $("fileInput")?.click();
});
$("youtubeClear").addEventListener("click",()=>clearSession());
$("youtubeForgetList").addEventListener("click",()=>{
 removeCache(localStore());
 $("youtubeKeepList").checked=false;
 state.lastSyncedAt=null;
 if(state.cachedView&&!state.token){
   clearSession("この端末の保存済み一覧を削除しました。YouTube上の動画には影響しません。");
 }else{
   cacheStatus();
   status("この端末の保存済み一覧を削除しました。YouTube上の動画は削除していません。");
 }
});
$("youtubeKeepList").addEventListener("change",()=>{
 if(!$("youtubeKeepList").checked){
   removeCache(localStore());
   if(!state.cachedView)state.lastSyncedAt=null;
   cacheStatus();
   return;
 }
 if(state.cachedView&&state.lastSyncedAt){
   // Do not reset the retention clock by re-saving previously cached data.
   if(!writeCache(localStore(),state.videos,state.partial,state.lastSyncedAt))
     status("前回の一覧を再保存できませんでした。ブラウザの容量・設定を確認してください。");
 }else if(state.token&&!state.cachedView){
   const now=Date.now();
   const ok=writeCache(localStore(),state.videos,state.partial,now);
   if(ok)state.lastSyncedAt=now;
   else status("一覧をこの端末に保存できませんでした。プライベートブラウズ・空き容量をご確認ください。");
 }
 cacheStatus();
});
$("youtubeForgetClientId").addEventListener("click",()=>{
 try{window.localStorage.removeItem(PUBLIC_ID_KEY);}catch{}
 clearSession("この端末に保存した公開Client IDを削除しました。Google接続と一覧も消去しました。");
});

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
  ?(state.cachedView?"前回保存 ":"限定公開 ")+state.videos.length+"件（絞り込み："+matching.length+"件）"+(state.partial?" / 上限到達：一部のみ":"")
  :"限定公開動画の一覧は未取得です。";
 if($("youtubeLibraryEmpty"))$("youtubeLibraryEmpty").hidden=state.videos.length>0;
 for(const video of matching){
   const b=document.createElement("button");b.type="button";b.className="youtube-card";
   b.setAttribute("aria-label",video.title+"を公式YouTubeプレイヤーで開く");
   b.setAttribute("aria-pressed",String(video.id===state.selected?.id));
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
   state.videos=result.items;state.partial=result.partial;
   state.cachedView=false;state.lastSyncedAt=Date.now();
   if(state.selected&&!result.items.some(v=>v.id===state.selected.id))clearPlayer();
   if($("youtubeKeepList").checked){
     if(!writeCache(localStore(),result.items,result.partial,state.lastSyncedAt))
       cacheNote("ブラウザへの保存に失敗しました。表示中の一覧はこのタブだけで利用できます。");
     else cacheStatus();
   }else{removeCache(localStore());cacheStatus();}
   render();
   const settings=$("youtubeSettings");if(settings?.open)settings.close();
   window.SF6Workbench?.pane("library");
   status("本人限定公開 "+result.items.length+"件を表示 / 候補 "+result.candidateCount+
     "件 / "+result.requests+" API要求"+(result.partial?"。取得上限により一部のみ。":"。"));
 }catch(err){
   if(epoch!==state.epoch||ctrl.signal.aborted)return;
   const message=String(err?.message||"不明なエラー");
   if(/HTTP 401/.test(message))status("認証の期限切れの可能性があります。接続を消去し再認証してください。");
   else if(/HTTP 403/.test(message))status("YouTube APIの権限・クォータ・チャンネル設定を確認してください（"+message.slice(0,80)+"）。");
   else if(/No uploads playlist/.test(message))status("選択したGoogleアカウントにアップロード用プレイリストがありません。");
   else status("一覧取得失敗："+message.slice(0,140));
   if(state.cachedView){
     status("再取得できませんでした。前回保存した一覧を保持します："+message.slice(0,110));
     cacheStatus();
   }else if(state.videos.length){
     status("再取得できませんでした。現在表示中の一覧は更新されていません："+message.slice(0,110));
   }else{
     state.videos=[];render();clearPlayer();
   }
 }finally{if(state.controller===ctrl)state.controller=null;}
}
function beginGoogleConnection(){
 if(!state.active)return;
 if(!$("youtubeConsent").checked){
   status("データ取扱説明への同意が必要です。");
   const dialog=$("youtubeSettings");if(dialog&&!dialog.open)dialog.showModal();return;
 }
 const id=$("youtubeClientId").value.trim();
 if(!isClientId(id)){
   status("Webアプリ用OAuth Client IDの形式を確認してください。");
   const dialog=$("youtubeSettings");if(dialog&&!dialog.open)dialog.showModal();return;
 }
 if(!window.google?.accounts?.oauth2?.initTokenClient){
    status("Google認証用スクリプトが準備できていません。");return;
 }
 // Keep a visible saved list during the explicit Google authorization popup.
 // Invalidate prior in-flight API requests, but do not erase saved metadata.
 state.epoch++;
 if(state.controller)state.controller.abort();
 state.controller=null;state.token=null;
 $("youtubeClientId").value=id;$("youtubeConsent").checked=true;
 buttons();
 status("Googleの認証画面を開いています…");
 if(!siteClientId()){
   try{window.localStorage.setItem(PUBLIC_ID_KEY,id);}catch{}
 }
 setupClientId();
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
   // Reuse existing Google approval where possible. An explicit owner click
   // is still required by Google's token model; never start auth on page load.
   client.requestAccessToken({prompt:""});
 }catch(e){if(epoch===state.epoch)status("認証開始失敗："+String(e?.message||"不明").slice(0,100));}
}
$("youtubeConnect").addEventListener("click",beginGoogleConnection);
$("youtubeRefresh").addEventListener("click",()=>{
 if(!state.active)return;
 if(state.token){
   state.epoch++;
   if(state.controller)state.controller.abort();
   void listOwnVideos(state.epoch,state.token);
 }else beginGoogleConnection();
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
       state.playerReady=true;showRecovery(false);buttons();
       playback("公式プレイヤー準備完了。映像を再生した後、一時停止してください。");
     },
     onError:event=>{
       if(state.player!==event.target||!state.active)return;
       state.seekPlan=null;
       state.playerReady=false;showRecovery(true);buttons();
       playback("YouTube埋め込み再生エラー "+String(event.data).slice(0,4)+
         "。動画の埋め込み制限を確認するか、端末内MP4を選択してください。");
     },
     onStateChange:event=>{
       if(state.player!==event.target||!state.active||!state.playerReady)return;
       refreshPlaybackToggle();
       if(event.data===window.YT.PlayerState?.PAUSED)playback("停止中：細かい時刻移動ができます（近似）。");
       else if(event.data===window.YT.PlayerState?.PLAYING){
         if(recoverPausedSeek())return;
         playback("再生中：細かい時刻移動の前に停止してください。");
       }
     }
   }
 });
 state.player=player;
}
async function selectVideo(video){
 if(!state.active||!(state.token||state.cachedView)||!isVideoId(video?.id)||!state.videos.some(v=>v.id===video.id))return;
 state.selectionSerial++;
 showRecovery(false);
 state.seekPlan=null;
 const serial=state.selectionSerial;
 state.selected=video;
 renderStudioSupport();
 $("youtubeReviewPanel").dataset.hasVideo="true";
 render();window.SF6Workbench?.pane("memo");
 $("youtubeCurrentTitle").textContent=video.title;
 $("youtubeHandoff").value="";$("youtubeShareLink").value="";$("youtubeSeekLog").replaceChildren();
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
     if(serial!==state.selectionSerial||!state.active||!(state.token||state.cachedView))return;
     mountPlayer(video,serial);
   }
 }catch(e){
   if(serial===state.selectionSerial){showRecovery(true);playback("プレイヤー起動失敗："+String(e?.message||"不明").slice(0,110));}
 }
}
$("youtubePause").addEventListener("click",()=>{
 if(!state.active||!state.playerReady||!state.player)return;
 const player=state.player;
 let action=null;
 try{action=playbackAction(player.getPlayerState());}catch{}
 if(!action){refreshPlaybackToggle();return;}
 state.seekPlan=null;
 try{
   if(action==="pause"){
     player.pauseVideo();
     playback("一時停止を要求しました。実際の状態はプレイヤーで確認してください。");
   }else{
     player.playVideo();
     playback("再生を要求しました。実際の状態はプレイヤーで確認してください。");
   }
 }catch(e){playback("再生操作に失敗："+String(e?.message||"不明").slice(0,70));}
 refreshPlaybackToggle();
});
function recoverPausedSeek(){
 try{
   if(!restorePausedSeek(state.seekPlan,state.player,state.selectionSerial,Date.now()))return false;
   refreshPlaybackToggle();
   info("シーク後に再生されたため停止を要求しました。");
   return true;
 }catch{
   info("シーク後の停止要求に失敗しました。");
   return false;
 }
}
// Short tap bursts should accumulate targets even when YT.getCurrentTime() lags seekTo().
// Never treat the optimistic target as proof of the frame that was displayed.
function fineSeek(delta){
 if(!state.active||!state.playerReady||!state.player||!state.selected)return;
 const player=state.player;
 if(player.getPlayerState()!==window.YT.PlayerState?.PAUSED){
   playback("一時停止してから細かい時刻移動を行ってください。");return;
 }
 const current=Number(player.getCurrentTime());
 if(!Number.isFinite(current)||current<0){playback("現在時刻を取得できません。");return;}
 const serial=state.selectionSerial;
 const now=Date.now();
 const previous=state.seekPlan;
 // A burst shares one optimistic anchor for <=1.5s between taps. A new video,
 // a resumed player, or a longer gap starts from the player's reported time.
 const baseline=seekAnchor(previous,player,serial,current,now);
 const goal=targetSeconds(baseline,delta,Number(player.getDuration()));
 if(goal===null){playback("時刻移動の値が不正です。");return;}
 if(Math.abs(goal-baseline)<.001){playback("動画の冒頭または終端です。");return;}
 const plan={player,serial,target:goal,at:now};
 // Install the plan before seekTo, which can immediately emit a state event.
 state.seekPlan=plan;
 try{player.seekTo(goal,true);}
 catch(e){
   if(state.seekPlan===plan)state.seekPlan=null;
   playback("時刻移動に失敗："+String(e?.message||"不明").slice(0,70));return;
 }
 if(state.seekPlan!==plan)return;
 playback("時刻移動 "+(delta>0?"+":"-")+secondsDisplay(Math.abs(delta))+
   "："+secondsDisplay(baseline)+" → "+secondsDisplay(goal)+"（時刻指定・表示フレーム未保証）");
 setTimeout(()=>{
   if(!state.active||serial!==state.selectionSerial||player!==state.player||
       !state.playerReady||state.seekPlan!==plan)return;
   recoverPausedSeek();
   if(state.seekPlan!==plan)return;
   try{
     const reported=Number(player.getCurrentTime());
     info("要求 "+secondsDisplay(goal)+" / API時刻 "+secondsDisplay(reported)+
        "：" + classifyReportedSeek(baseline,goal,reported));
   }catch{info("移動後の時刻を確認できませんでした。");}
 },1000);
}
for(const [id,delta] of [["youtubePrevFive",-5],["youtubePrevSec",-1],
 ["youtubePrevTen",-10*SEEK_SMALL],["youtubePrev",-SEEK_SMALL],
 ["youtubeNext",SEEK_SMALL],["youtubeNextTen",10*SEEK_SMALL],
 ["youtubeNextSec",1],["youtubeNextFive",5]]){
 $(id).addEventListener("click",()=>fineSeek(delta));
}
// Share is a deliberate owner action. Only the selected unlisted video's validated
// ID and whole-second playback time enter the link; never titles, notes or OAuth.
$("youtubeShare").addEventListener("click",async()=>{
 if(!state.active||!(state.token||state.cachedView)||!state.selected||!state.playerReady||!state.player)return;
 const id=state.selected.id;
 if(!isVideoId(id)||!state.videos.some(video=>video.id===id))return;
 const raw=Number(state.player.getCurrentTime());
 const seconds=Number.isFinite(raw)&&raw>=0&&raw<=43200?Math.floor(raw):0;
 const share=new URL("./youtube-share.html",location.href);
 share.search="";share.hash="";
 share.searchParams.set("v",id);
 if(seconds)share.searchParams.set("t",String(seconds));
 const link=share.href;
 $("youtubeShareLink").value=link;
 const shareStatus=$("youtubeShareStatus");
 try{
   await navigator.clipboard.writeText(link);
   if(shareStatus)shareStatus.textContent="共有リンクをコピーしました。リンクを知っている人は再共有できます。";
   playback(state.cachedView?
     "共有リンクをコピーしました。前回の公開状態は未確認です。リンクは第三者へ再共有できます。":
     "共有リンクをコピーしました。限定公開リンクは第三者へ再共有できます。");
 }catch{
   if(shareStatus)shareStatus.textContent="自動コピーできませんでした。下の共有URLを選択してコピーしてください。";
   playback("自動コピーが制限されました。共有URL欄を長押ししてコピーしてください。");
   $("youtubeShareLink").focus();$("youtubeShareLink").select();
 }
});
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
   if($("youtubeHandoffFallback"))$("youtubeHandoffFallback").open=true;
   $("youtubeHandoff").focus();$("youtubeHandoff").select();
 }
});
window.setInterval(()=>{
 if(!state.active||!state.playerReady||!state.player)return;
 try{$("youtubePlaybackTime").textContent=secondsDisplay(state.player.getCurrentTime())+
      " / "+secondsDisplay(state.player.getDuration());}catch{}
},500);
// Purge expired/invalid metadata on every visit without bypassing mode choice.
readCache(localStore());
render();buttons();
// Entry always offers the mode choice. Cached metadata is restored only when
// the owner opens YouTube; neither cache nor a plain visit initiates OAuth.
