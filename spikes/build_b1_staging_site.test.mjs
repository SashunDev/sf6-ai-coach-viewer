import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync,mkdtempSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {spawnSync} from "node:child_process";
import {buildStagingHtml,createStaging,DEPLOY_WORKFLOW} from "./build_b1_staging_site.mjs";

const html=readFileSync(new URL("./local-frame-probe.html",import.meta.url),"utf8");
const core=readFileSync(new URL("./local-frame-probe-core.mjs",import.meta.url),"utf8");

test("staging HTML has no external API and a same-origin synthetic sample button",()=>{
 const page=buildStagingHtml(html,core);
 assert.match(page,/name="frame-probe-sample" content="\.\/sample\.mp4"/);
 assert.match(page,/media-src blob: 'self'/);
 assert.match(page,/connect-src 'none'/);
 assert.match(page,/candidate\.origin===location\.origin/);
 assert.match(page,/candidate\.protocol==="https:"/);
 assert.match(page,/ChatGPT内プレビューでは開かず/);
 assert.match(page,/JavaScript未起動/);
 assert.doesNotMatch(page,/<script type="module">/);
 assert.doesNotMatch(page,/<script[^>]+src=/);
 assert.doesNotMatch(page,/accounts\.google\.com|googleapis\.com\/youtube|oauth2|youtube\.readonly/);
 assert.doesNotMatch(page,/localStorage|sessionStorage|XMLHttpRequest/);
 const inline=page.match(/<script>([\s\S]*?)<\/script>/)?.[1]||"";
 assert.ok(inline);
 const r=spawnSync(process.execPath,["--check"],{encoding:"utf8",input:inline});
 assert.equal(r.status,0,r.stderr);
});

test("builder emits only an isolated staging site and minimum-permission workflow",()=>{
 const dir=mkdtempSync(join(tmpdir(),"b1-staging-test-"));
 try{
  const p=createStaging(dir);
  const expected=["public/index.html","public/.nojekyll",".github/workflows/pages.yml","README.md"];
  for(const name of expected) assert.equal(existsSync(join(p,name)),true,name);
  const page=readFileSync(join(p,"public","index.html"),"utf8");
  assert.match(page,/sample\.mp4/);
  assert.equal(readFileSync(join(p,"public",".nojekyll"),"utf8"),"");
  const wf=readFileSync(join(p,".github","workflows","pages.yml"),"utf8");
  assert.equal(wf,DEPLOY_WORKFLOW);
  assert.match(wf,/pages: write/);
  assert.match(wf,/id-token: write/);
  assert.match(wf,/branches: \[main\]/);
  assert.match(wf,/testsrc2=size=320x180:rate=30:duration=5/);
  assert.doesNotMatch(wf,/client_secret|GH_PAT|api_key|youtube\.com|upload.*video/);
 }finally{
  rmSync(dir,{recursive:true,force:true});
 }
});
