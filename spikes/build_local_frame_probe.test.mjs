import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {buildOffline} from "./build_local_frame_probe.mjs";

const html=readFileSync(new URL("./local-frame-probe.html",import.meta.url),"utf8");
const core=readFileSync(new URL("./local-frame-probe-core.mjs",import.meta.url),"utf8");
test("standalone bundler eliminates module imports and keeps no-network CSP",()=>{
 const page=buildOffline(html,core);
 assert.ok(page.includes("<script>"));
 assert.doesNotMatch(page,/<script type="module">/);
 assert.doesNotMatch(page,/import\s*{inferPeriod/);
 assert.match(page,/function inferPeriod/);
 assert.match(page,/function assessFrameStep/);
 assert.match(page,/connect-src 'none'/);
 assert.match(page,/media-src blob:/);
 assert.match(page,/type="file"/);
 assert.match(page,/iOSのファイルプレビュー/);
 assert.doesNotMatch(page,/<script[^>]+src=/);
 assert.doesNotMatch(page,/<iframe/);
 const script=page.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script);
 const r=spawnSync(process.execPath,["--check"],{input:script,encoding:"utf8"});
 assert.equal(r.status,0,r.stderr);
});
test("fails closed if source module format drifts",()=>{
 assert.throws(()=>buildOffline(html.replace('type="module"','type="text/plain"'),core));
 assert.throws(()=>buildOffline(html,"/* missing helpers */"));
});
