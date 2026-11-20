import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";

const html=readFileSync(new URL("./b0-library.html",import.meta.url),"utf8");
const app=readFileSync(new URL("./b0-app.mjs",import.meta.url),"utf8");
test("B0 page requires explicit user consent and never includes real video or credentials",()=>{
 assert.match(html,/id="agree"/);
 assert.match(html,/id="connect"/);
 assert.match(html,/id="demo"/);
 assert.match(html,/id="revoke"/);
 assert.match(html,/JavaScript未起動/);
 assert.match(html,/https:\/\/sashundev\.github\.io/);
 assert.match(html,/youtube\.readonly/);
 assert.doesNotMatch(html,/client_secret|access_token|refresh_token|AIza[0-9A-Za-z_-]+/);
});
test("CSP constrains Google origins and no user-data sharing destinations",()=>{
 assert.match(html,/default-src 'none'/);
 assert.match(html,/script-src 'self' https:\/\/accounts\.google\.com\/gsi\/client/);
 assert.match(html,/connect-src https:\/\/www\.googleapis\.com https:\/\/accounts\.google\.com\/gsi\//);
 assert.match(html,/form-action 'none'/);
 assert.match(html,/base-uri 'none'/);
 assert.match(html,/type="module" src="\.\/b0-app\.mjs"/);
 assert.doesNotMatch(html,/<iframe|innerHTML/);
});
test("B0 app explicitly uses limited read-only YouTube endpoints without persistent storage",()=>{
 assert.match(app,/gatherOwnUnlisted/);
 assert.match(app,/initTokenClient/);
 assert.match(app,/requestAccessToken/);
 assert.match(app,/hasGrantedAllScopes/);
 assert.match(app,/client_id:clientId,scope:SCOPE/);
 assert.match(app,/new AbortController/);
 assert.match(app,/state\.epoch\+\+/);
 assert.match(app,/cache:"no-store"/);
 assert.match(app,/^\s*if\(!\["channels","playlistItems","videos"\]\.includes\(resource\)\)/m);
 assert.doesNotMatch(app,/localStorage|sessionStorage|document\.cookie|sendBeacon|XMLHttpRequest|innerHTML/);
 assert.doesNotMatch(app,/(?:fetch\(|new URL\()\s*["']https:\/\/(?!(?:www\.googleapis\.com))/);
 for(const file of ["b0-app.mjs","b0-library-core.mjs"]){
  const proc=spawnSync(process.execPath,["--check",new URL("./"+file,import.meta.url).pathname],{encoding:"utf8"});
  assert.equal(proc.status,0,proc.stderr);
 }
});
