import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.mjs';

const ROOT = 'https://sf6-coach-test.example.workers.dev';
const NAME = 'sf6-coach-synthetic-smoke-16s.mp4';
const video = `${ROOT}/video/${NAME}`;

function req(path, init = {}) { return new Request(path, init); }

async function withSource(handler, callback) {
  const before = globalThis.fetch;
  const captured = [];
  globalThis.fetch = async (url, init) => {
    captured.push({ url: String(url), init });
    return await handler(url, init);
  };
  try { await callback(captured); } finally { globalThis.fetch = before; }
}

test('health endpoint without upstream network', async () => {
  await withSource(() => { throw Error('not expected'); }, async calls => {
    const res = await worker.fetch(req(`${ROOT}/healthz`));
    assert.equal(res.status, 200);
    assert.match(await res.text(), /ready/);
    assert.equal(calls.length, 0);
  });
});

test('forbid proxy to anything outside known media path', async () => {
  await withSource(() => { throw Error('should not fetch upstream'); }, async calls => {
    for (const path of ['/', '/video/other.webm', '/video/foo.mp4?url=https://example.com',
      '/video/%2Fsecret.mp4', '/video/../secret.mp4', '/video/x..mp4']) {
      const res = await worker.fetch(req(`${ROOT}${path}`));
      assert.equal(res.status, 404, path);
    }
    assert.equal(calls.length, 0);
  });
});

test('only read-only methods', async () => {
  await withSource(() => { throw Error('unexpected'); }, async calls => {
    const res = await worker.fetch(req(video, { method: 'POST' }));
    assert.equal(res.status, 405);
    assert.equal(calls.length, 0);
  });
});

test('OPTIONS returns CORS without contacting GitHub', async () => {
  await withSource(() => { throw Error('unexpected'); }, async calls => {
    const res = await worker.fetch(req(video, { method: 'OPTIONS' }));
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://sashundev.github.io');
    assert.equal(calls.length, 0);
  });
});

test('stream original body, replace MIME and attachment disposition', async () => {
  const payload = new Uint8Array([0,1,2,3,4]);
  await withSource(() => new Response(payload, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename=download.mp4',
      'Content-Length': '5',
      'Accept-Ranges': 'bytes',
    }
  }), async calls => {
    const res = await worker.fetch(req(video));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Content-Type'), 'video/mp4');
    assert.equal(res.headers.get('Content-Disposition'), `inline; filename="${NAME}"`);
    assert.equal(res.headers.get('Content-Length'), '5');
    assert.equal(res.headers.get('Accept-Ranges'), 'bytes');
    assert.deepEqual(new Uint8Array(await res.arrayBuffer()), payload);
    assert.match(calls[0].url, /SashunDev\/sf6-ai-coach-viewer\/releases\/download\/sf6-ai-coach-media/);
    assert.equal(calls[0].init.redirect, 'follow');
  });
});

test('single Range gets 206 and unchanged content range', async () => {
  await withSource((_url, init) => {
    assert.equal(init.headers.get('Range'), 'bytes=1024-2047');
    return new Response(new Uint8Array([1,2,3]), {
      status: 206,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Range': 'bytes 1024-2047/354785',
        'Content-Length': '1024',
        'Accept-Ranges': 'bytes',
      },
    });
  }, async calls => {
    const res = await worker.fetch(req(video, { headers: { Range: 'bytes=1024-2047' }}));
    assert.equal(res.status, 206);
    assert.equal(res.headers.get('Content-Type'), 'video/mp4');
    assert.equal(res.headers.get('Content-Range'), 'bytes 1024-2047/354785');
    assert.equal(res.headers.get('Content-Length'), '1024');
    assert.equal(calls.length, 1);
  });
});

test('illegal and multipart byte ranges rejected', async () => {
  await withSource(() => { throw Error('unexpected'); }, async calls => {
    for(const range of ['bytes=0-1,3-4','something','bytes=abc-5','items=0-10']) {
      const res = await worker.fetch(req(video, { headers: { Range: range } }));
      assert.equal(res.status, 416);
    }
    assert.equal(calls.length, 0);
  });
});

test('HEAD does not return video body', async () => {
  await withSource((_url, init) => {
    assert.equal(init.method, 'HEAD');
    return new Response(null, {status:200, headers:{'Content-Length':'354785'}});
  }, async () => {
    const res = await worker.fetch(req(video, { method:'HEAD' }));
    assert.equal(res.status, 200);
    assert.equal(res.body, null);
    assert.equal(res.headers.get('Content-Type'), 'video/mp4');
  });
});

test('upstream errors never proxy raw GitHub HTML', async () => {
  for(const [status,expected] of [[404,404],[410,404],[429,502],[500,502],[302,502]]) {
    await withSource(()=>new Response('<html>GitHub error</html>',{status}), async () => {
      const res=await worker.fetch(req(video));
      assert.equal(res.status, expected);
      assert.doesNotMatch(await res.text(), /<html>/);
    });
  }
});

test('network fetch failure is mapped to retryable error', async () => {
  await withSource(() => { throw Error('network'); }, async () => {
    const res = await worker.fetch(req(video));
    assert.equal(res.status, 502);
  });
});

test('cannot be used as an arbitrary URL proxy via query parameters', async () => {
  await withSource(()=>{throw Error('unexpected')},async calls=>{
    const res=await worker.fetch(req(`${video}?url=https://example.com/secret`));
    assert.equal(res.status,404);
    assert.equal(calls.length,0);
  });
});

test('cache disabled and only intended viewer origin gets CORS', async () => {
  await withSource(()=>new Response(new Uint8Array([1])), async () => {
    const res=await worker.fetch(req(video));
    assert.equal(res.headers.get('Cache-Control'), 'no-store, max-age=0');
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://sashundev.github.io');
  });
});