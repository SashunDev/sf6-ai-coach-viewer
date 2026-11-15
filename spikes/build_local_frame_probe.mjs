// Build a standalone, offline, *optional* iPhone test page from the draft PR source.
// This does not fetch any video or change GitHub Pages deployments.
import {readFileSync,writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {resolve,dirname} from "node:path";

const here=dirname(fileURLToPath(import.meta.url));
export function buildOffline(html,core){
  const start='<script type="module">\nimport {inferPeriod,targetForFrameStep,assessFrameStep} from "./local-frame-probe-core.mjs";';
  if(!html.includes(start)) throw new Error("The local probe module signature has changed");
  if(!/export function inferPeriod/.test(core) || !/export function assessFrameStep/.test(core))
    throw new Error("Required core helpers missing");
  if(/<script[\s>]|<\/script>/i.test(core)) throw new Error("Unexpected script markup in core");
  const inlineCore=core.replace(/^export /gm,"");
  let out=html.replace(start,"<script>\n"+inlineCore);
  if(/import\s*{inferPeriod|src=".*\.mjs"/.test(out))
    throw new Error("Unbundled module reference");
  out=out.replace("端末内MP4のコマ送り — 実現性検証","端末内MP4のコマ送り — オフライン検証ファイル");
  out=out.replace("<body>","<body>\n<p class=\"warning\">オフライン単独ファイル版です。iOSのファイルプレビューではJavaScriptが無効な場合があります。その際は本検証はHOLDとし、コードを公開サーバーにコピーしないでください。</p>");
  return out;
}
if(process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  const html=readFileSync(resolve(here,"local-frame-probe.html"),"utf8");
  const core=readFileSync(resolve(here,"local-frame-probe-core.mjs"),"utf8");
  const out=resolve(process.argv[2]||"phase-b-frame-step-offline.html");
  writeFileSync(out,buildOffline(html,core),"utf8");
  console.log("Created offline, no-video HTML:",out);
}
