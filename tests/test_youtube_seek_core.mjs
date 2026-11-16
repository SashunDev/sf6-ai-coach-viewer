import test from "node:test";
import assert from "node:assert/strict";
import {safeVideoId,SEEK_SMALL,secondsDisplay,targetSeconds,classifyReportedSeek} from "../youtube-seek-core.mjs";
test("validated video ID only",()=>{
 assert.equal(safeVideoId("AAAAAAAAAAA"),true);
 for(const id of ["bad","AAAAAAAAAAA?x=1","//youtube.com","BBBBBBBBBBBB"])assert.equal(safeVideoId(id),false);
});
test("30fps time seek bounded; not a step command",()=>{
 assert.equal(SEEK_SMALL,1/30);
 assert.ok(Math.abs(targetSeconds(1,SEEK_SMALL,4)-(1+1/30))<1e-8);
 assert.equal(targetSeconds(3.99,SEEK_SMALL,4),4);
 assert.equal(targetSeconds(0,-SEEK_SMALL,4),0);
 assert.equal(targetSeconds(1,6,4),null);
 assert.equal(targetSeconds(NaN,SEEK_SMALL,4),null);
});
test("reported IFrame seek time does not claim actual frame changed",()=>{
 assert.match(classifyReportedSeek(1,1+SEEK_SMALL,1+SEEK_SMALL),/未証明/);
 assert.match(classifyReportedSeek(1,1+SEEK_SMALL,1),/変化が見られません/);
 assert.match(classifyReportedSeek(1,1+SEEK_SMALL,0.83),/ずれが大きい/);
 assert.match(classifyReportedSeek(NaN,1,1),/取得できません/);
 assert.equal(secondsDisplay(1.23361),"1.234s");
 assert.equal(secondsDisplay(NaN),"取得不可");
});
