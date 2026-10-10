const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const html=fs.readFileSync('index.html','utf8');
const smoke=fs.readFileSync('pages-integration-smoke.html','utf8');
const start=html.indexOf('function safeReleaseVideoUrl(raw){');
const stop=html.indexOf('\nfunction setRemoteVideo(',start);
if(start<0||stop<=start)throw new Error('Video URL validator missing');
const safe=vm.runInNewContext('('+html.slice(start,stop).trim()+')',{URL});
const base='https://sashundev.github.io/sf6-ai-coach-viewer/media/';
const legacy='https://github.com/SashunDev/sf6-ai-coach-viewer/releases/download/sf6-ai-coach-media/';

test('Pages MP4 accepted without transformation',()=>{
 assert.equal(safe(base+'test-001.mp4'),base+'test-001.mp4');
});
test('Legacy Release URL maps to same-origin Pages',()=>{
 assert.equal(safe(legacy+'test-001.mp4'),base+'test-001.mp4');
});
test('Reject third-party host and lookalikes',()=>{
 for(const url of ['https://evil.example/media/test.mp4',
  'https://sashundev.github.io.evil.net/sf6-ai-coach-viewer/media/test.mp4',
  'https://github.com.evil.net/SashunDev/sf6-ai-coach-viewer/releases/download/sf6-ai-coach-media/a.mp4']){
  assert.equal(safe(url),null);
 }
});
test('Reject alternate repo, release, or directory',()=>{
 for(const url of ['https://sashundev.github.io/other/media/a.mp4',
  'https://github.com/SashunDev/another/releases/download/sf6-ai-coach-media/a.mp4',
  'https://github.com/SashunDev/sf6-ai-coach-viewer/releases/download/other/a.mp4',
  'https://sashundev.github.io/sf6-ai-coach-viewer/media2/a.mp4']){
  assert.equal(safe(url),null);
 }
});
test('Reject query, fragment and userinfo',()=>{
 for(const url of [base+'a.mp4?download=1',base+'a.mp4#x','https://evil@sashundev.github.io/sf6-ai-coach-viewer/media/a.mp4']){
  assert.equal(safe(url),null);
 }
});
test('Reject traversal, percent encoding and unsafe extensions',()=>{
 for(const url of [base+'%2e%2e%2fprivate.mp4',base+'a%2fb.mp4',
  base+'a.mp4%3f',base+'bad.mov',base+'.secret.mp4',base+'bad%20name.mp4']){
  assert.equal(safe(url),null);
 }
});
test('Reject HTTP, port, excessive length and non-string',()=>{
 for(const url of [base.replace('https:','http:')+'a.mp4',
  'https://sashundev.github.io:8443/sf6-ai-coach-viewer/media/a.mp4',
  base+('a'.repeat(300))+'.mp4',{},null]){
  assert.equal(safe(url),null);
 }
});
test('CSP permits same-origin media only',()=>{
 assert.ok(html.includes("media-src 'self' blob:;"));
 assert.ok(!html.includes("media-src blob: https://github.com"));
 assert.ok(html.includes("connect-src 'none'"));
});
test('Original file chooser is retained',()=>{
 assert.ok(html.includes('setVideoFile(file)'));
 assert.ok(html.includes("$('#reportInput')?.addEventListener('change'"));
});
test('Normal report link and compressed JSON still supported',()=>{
 assert.ok(html.includes("new DecompressionStream('deflate')"));
 assert.ok(html.includes("decodeLinkReportFragment()"));
 assert.ok(html.includes("if(videoLink)setRemoteVideo(videoLink)"));
});
test('Error provides local fallback for expired Pages video',()=>{
 assert.ok(html.includes("state.hasVideo=false;state.videoSource=null;state.playing=false"));
 assert.ok(html.includes("端末内の動画を選択してください"));
});
test('Synthetic one-tap report links to Pages MP4',()=>{
 assert.ok(smoke.includes('location.replace("./#r=z.'));
 assert.ok(smoke.includes('sashundev.github.io%2Fsf6-ai-coach-viewer%2Fmedia%2Fsf6-coach-synthetic-smoke-16s.mp4'));
 assert.ok(!smoke.includes('github.com%2FSashunDev%2Fsf6-ai-coach-viewer%2Freleases'));
});
