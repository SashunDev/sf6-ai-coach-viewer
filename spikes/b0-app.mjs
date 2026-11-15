// B0 client-only, owner-approved read-only YouTube inventory. No persistent credentials.
import {SCOPE,isClientId,gatherOwnUnlisted,mockCollection,isVideoId} from "./b0-library-core.mjs";

const el=id=>document.getElementById(id);
const state={token:null,items:[],mock:false,epoch:0,controller:null,client:null};
const setStatus=text=>{el("status").textContent=text;};
el("runtime").textContent="JavaScript起動確認済み。モック一覧を試せます。";
function wipe(reason="一覧・接続情報を消去しました。"){
 document.dispatchEvent(new Event("sf6:b2-reset"));
 state.epoch++;
 if(state.controller)state.controller.abort();
 state.controller=null;state.client=null;state.token=null;state.items=[];state.mock=false;
 el("clientId").value="";el("agree").checked=false;
 el("filter").value="";
 el("revoke").disabled=true;
 setStatus(reason); render();
}
function render(){
 const root=el("results");root.replaceChildren();
 const term=el("filter").value.trim().toLocaleLowerCase("ja");
 const matching=state.items.filter(x=>x.title.toLocaleLowerCase("ja").includes(term));
 el("stats").textContent=state.items.length
  ? "表示 "+matching.length+"本 / 取得 "+state.items.length+"本"+(state.mock?"（全件モック）":"（本人の限定公開）")
  : "表示 0本";
 for(const v of matching){
  const card=document.createElement("article");
  card.className="video";
  if(v.thumbnail){
   const img=document.createElement("img");
   img.src=v.thumbnail;img.alt="";img.loading="lazy";img.referrerPolicy="no-referrer";
   card.append(img);
  }
  const title=document.createElement("strong");title.textContent=v.title;card.append(title);
  const info=document.createElement("small");
  info.textContent=(v.publishedAt||"投稿日不明").slice(0,10)+(v.channelTitle?" / "+v.channelTitle:"");
  card.append(info);
  if(state.mock){
   const tag=document.createElement("small");tag.textContent="合成データ：実際のYouTube動画へのリンクなし";
   card.append(tag);
  }else if(isVideoId(v.id)){
   const a=document.createElement("a");
   a.textContent="YouTube公式で動画を開く";
   a.href="https://www.youtube.com/watch?v="+v.id;
   a.target="_blank";a.rel="noopener noreferrer";
   card.append(a);
   const b2=document.createElement("button");
   b2.type="button";b2.className="b2-action";
   b2.textContent="公式プレイヤーで細かい時刻移動を試す（検証）";
   b2.addEventListener("click",()=>document.dispatchEvent(new CustomEvent("sf6:b2-open",{detail:{id:v.id}})));
   card.append(b2);
  }
  root.append(card);
 }
 if(!matching.length){
  const p=document.createElement("p");p.className="muted";
  p.textContent=state.items.length?"条件に一致するタイトルがありません。":"表示できる動画がありません。";
  root.append(p);
 }
}
el("filter").addEventListener("input",render);
el("demo").addEventListener("click",()=>{
 wipe();
 state.items=mockCollection();state.mock=true;
 setStatus("モック2件を表示しました。Googleへの認証・APIアクセスは行っていません。");
 render();
});
el("clear").addEventListener("click",()=>wipe());
const describeApiError=(response,body)=>{
 const code=String(body?.error?.status||body?.error?.errors?.[0]?.reason||"").slice(0,60);
 return "YouTube API HTTP "+response.status+(code?" / "+code:"");
};
async function authenticatedList(token,epoch){
 if(epoch!==state.epoch)return;
 state.controller=new AbortController();
 const signal=state.controller.signal;
 setStatus("認可取得。本人チャンネルのアップロード一覧を取得中…");
 let callCount=0;
 const api=async(resource,params)=>{
  if(epoch!==state.epoch||token!==state.token||signal.aborted)throw Error("Disconnected");
  if(!["channels","playlistItems","videos"].includes(resource))throw Error("Invalid API operation");
  const u=new URL("https://www.googleapis.com/youtube/v3/"+resource);
  for(const [key,value] of Object.entries(params))if(value!==undefined&&value!=="")u.searchParams.set(key,String(value));
  const response=await fetch(u.href,{
    method:"GET",headers:{Authorization:"Bearer "+token},signal,cache:"no-store",referrerPolicy:"no-referrer"
  });
  if(!response.ok){
   let body={};try{body=await response.json();}catch{}
   throw Error(describeApiError(response,body));
  }
  callCount++;
  return response.json();
 };
 try{
  const result=await gatherOwnUnlisted(api,{onProgress:({candidateCount,requests})=>{
   if(epoch===state.epoch)setStatus("取得中：アップロード候補 "+candidateCount+"件 / "+requests+"リクエスト");
  }});
  if(epoch!==state.epoch||signal.aborted)return;
  state.items=result.items;state.mock=false;
  setStatus("限定公開 "+result.items.length+"本 / アップロード候補 "+result.candidateCount+
    "件 / APIリクエスト "+callCount+"回 / 対象チャンネル "+result.channelCount+
    (result.partial?"（取得上限に達したため一部のみ）":"（取得範囲内）"));
  render();
 }catch(e){
  if(epoch!==state.epoch||signal.aborted)return;
  const msg=String(e?.message||"unknown error");
  const note=msg.includes("HTTP 401")?"Googleの許可が切れた可能性があります。再接続してください。":
    msg.includes("HTTP 403")?"API権限・クォータ・テストユーザー設定を確認してください。":
    msg.includes("No uploads playlist")?"選択したGoogleアカウントにYouTubeチャンネルのアップロード一覧が見つかりません。":
    msg==="Failed to fetch"?"Google API通信に失敗しました。ブラウザの通信・ポリシーをご確認ください。":
    "一覧取得に失敗： "+msg.slice(0,130);
  state.items=[];render();
  setStatus(note);
 }
}
el("connect").addEventListener("click",()=>{
 if(!el("agree").checked){setStatus("データの取扱説明を確認して同意してください。");return;}
 const clientId=el("clientId").value.trim();
 if(!isClientId(clientId)){setStatus("Webアプリ用OAuthクライアントIDの形式を確認してください。");return;}
 if(!window.google?.accounts?.oauth2?.initTokenClient){setStatus("Google認証スクリプトが未準備です。通信やブラウザ制限を確認してください。");return;}
 // User gesture must synchronously open the Google's consent popup.
 wipe("認証ウィンドウを開く準備中…");
 el("clientId").value=clientId;el("agree").checked=true;
 const epoch=state.epoch;
 try{
  const client=window.google.accounts.oauth2.initTokenClient({
   client_id:clientId,scope:SCOPE,
   callback:response=>{
    if(epoch!==state.epoch)return;
    if(!response?.access_token||response?.error){
      setStatus("Google認証に失敗・中止："+String(response?.error||"不明").slice(0,90));return;
    }
    if(!window.google.accounts.oauth2.hasGrantedAllScopes(response,SCOPE)){
      setStatus("YouTubeの読み取り許可が付与されませんでした。");return;
    }
    state.token=response.access_token;el("revoke").disabled=false;
    authenticatedList(state.token,epoch);
   },
   error_callback:err=>{
    if(epoch===state.epoch)setStatus("認証ポップアップの処理に失敗："+String(err?.type||"不明").slice(0,70));
   }
  });
  state.client=client;
  setStatus("Googleの認証画面を表示しています。許可後に一覧を取得します。");
  client.requestAccessToken({prompt:"select_account"});
 }catch(err){if(epoch===state.epoch)setStatus("Google認証を開始できません："+String(err?.message||"不明").slice(0,100));}
});
el("revoke").addEventListener("click",()=>{
 const token=state.token;
 wipe("表示と接続を消去しました。Google側の権限取消を要求中…");
 const revoke=window.google?.accounts?.oauth2?.revoke;
 if(!token||typeof revoke!=="function"){setStatus("トークンが無いため取消を実行できません。Googleアカウント設定で確認してください。");return;}
 try{
  revoke(token,r=>setStatus(r?.successful?"Google側の権限を取り消しました。":"取消の確認が取れません。Googleアカウントの接続済みアプリを確認してください。"));
 }catch{setStatus("取消要求に失敗。Googleアカウントの接続済みアプリから削除してください。");}
});
render();
