import test from "node:test";
import assert from "node:assert/strict";
import {playbackAction,playbackLabel,seekAnchor} from "../youtube-player-controls.mjs";
test("Official player states map to mutually exclusive play/pause commands",()=>{
 assert.equal(playbackAction(1),"pause");
 for(const n of [-1,0,2,5])assert.equal(playbackAction(n),"play");
 for(const n of [3,null,NaN,undefined,10])assert.equal(playbackAction(n),null);
 assert.equal(playbackLabel("pause"),"一時停止");
 assert.equal(playbackLabel("play"),"再生");
});
test("Optimistic seeks accumulate only for same player, serial and fresh 1.5 second burst",()=>{
 const p={};
 const plan={player:p,serial:1,target:1.5,at:1000};
 assert.equal(seekAnchor(plan,p,1,1.1,1100),1.5);
 assert.equal(seekAnchor(plan,p,1,1.1,2501),1.1);
 assert.equal(seekAnchor(plan,p,2,1.1,1300),1.1);
 assert.equal(seekAnchor(plan,{},1,1.1,1300),1.1);
 assert.equal(seekAnchor(null,p,1,1.1,1300),1.1);
});
