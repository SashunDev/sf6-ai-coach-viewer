// Issue #27 — shared YouTube IFrame Player API state helpers; no owner data.
const SEEK_PAUSE_WINDOW_MS=2500;
export function playbackAction(state){
 if(state===1)return "pause";
 if(state===-1||state===0||state===2||state===5)return "play";
 return null; // BUFFERING(3)/unknown: wait for a stable state.
}
export function playbackLabel(action){return action==="pause"?"一時停止":"再生";}
export function seekAnchor(plan,player,serial,reported,now){
 return plan&&plan.player===player&&plan.serial===serial&&
  now>=plan.at&&now-plan.at<=1500?plan.target:reported;
}

export function restorePausedSeek(plan,player,serial,now){
 if(!plan||plan.player!==player||plan.serial!==serial||plan.pauseRequested||
    now<plan.at||now-plan.at>SEEK_PAUSE_WINDOW_MS||player.getPlayerState()!==1)return false;
 // Bound recovery to one request per seek, even if pauseVideo emits synchronously
 // or a subsequent PLAYING notification arrives before the player pauses.
 plan.pauseRequested=true;
 player.pauseVideo();
 return true;
}
