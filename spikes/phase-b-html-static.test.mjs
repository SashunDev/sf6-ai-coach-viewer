import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const html = readFileSync(new URL("./phase-b-feasibility.html",import.meta.url),"utf8");
const match = html.match(/<script type="module">([\s\S]*?)<\/script>/);

test("HTML embeds one real ES module with valid syntax",()=>{
  assert.ok(match,"missing module");
  const result=spawnSync(process.execPath,["--check","--input-type=module"],{input:match[1],encoding:"utf8"});
  assert.equal(result.status,0,result.stderr);
});
test("security and privacy boundaries remain explicit",()=>{
  assert.match(html,/youtube\.readonly|READONLY_SCOPE/);
  assert.match(html,/status\.privacyStatus|normalizeUnlisted/);
  assert.match(html,/window\.google\.accounts\.oauth2/);
  assert.match(html,/https:\/\/www\.googleapis\.com\/youtube\/v3\//);
  assert.doesNotMatch(html,/localStorage|sessionStorage|indexedDB|client_secret|AIza[a-zA-Z0-9_-]{20}/i);
  assert.match(html,/console/); // e.g. Google Cloudコンソール usage
  assert.match(html,/AIは映像未確認|AI.*映像未確認|映像未確認/);
  assert.match(html,/保証されません/);
});
