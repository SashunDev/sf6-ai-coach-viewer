// Issue #27 — pure shared YouTube IFrame Player API state helpers; no owner data.
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
