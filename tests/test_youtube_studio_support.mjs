import test from 'node:test';
import assert from 'node:assert/strict';
import {STUDIO_URL,studioSearchCandidate} from '../youtube-studio-support.mjs';
test('Studio root is HTTPS only, without video, search, auth or custom schemes',()=>{
 assert.equal(STUDIO_URL,'https://studio.youtube.com/');
 const url=new URL(STUDIO_URL);assert.equal(url.search,'');assert.equal(url.hash,'');
});
test('valid leading date/time is a search suggestion, never a search guarantee',()=>{
 assert.equal(studioSearchCandidate('2026-11-16 21:26｜Example Match｜#01'),'2026-11-16 21:26');
 assert.equal(studioSearchCandidate('2024-02-29 00:00 | sample'),'2024-02-29 00:00');
});
test('other formats and invalid dates fall back to the entire original title',()=>{
 for(const title of ['Sample match','2026/11/16 21:26 sample','2026-02-30 10:20｜sample','2026-11-16 24:00｜sample','2026-11-16 23:60','2026-11-16 21:26:30 sample','<img src=x onerror=alert(1)>'])assert.equal(studioSearchCandidate(title),title);
});
test('empty or non-string titles safely disable copying',()=>{
 for(const title of ['', ' \n ',null,undefined,123,{},[]])assert.equal(studioSearchCandidate(title),'');
});
