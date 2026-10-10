/**
 * SF6 AI Coach - public, read-only Release video stream proxy.
 * Worker Free; no object storage, no uploads, no video persistence.
 * Only a single GitHub repository and one Release tag can be requested.
 * Intended for Cloudflare Workers' module Worker editor or wrangler.
 */

const RELEASE_BASE = 'https://github.com/SashunDev/sf6-ai-coach-viewer/releases/download/sf6-ai-coach-media/';
const VIEWER_ORIGIN = 'https://sashundev.github.io';
const VIDEO_PATH = '/video/';
const VALID_FILENAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,125}\.mp4$/i;
const VALID_RANGE = /^bytes=(?:\d+-\d*|-\d+)$/;

function baseHeaders() {
  return {
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'Access-Control-Allow-Origin': VIEWER_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
    'Cross-Origin-Resource-Policy': 'cross-origin',
  };
}

function respond(text, status = 200, extras = {}) {
  return new Response(text, {
    status,
    headers: { ...baseHeaders(), 'Content-Type': 'text/plain; charset=utf-8', ...extras },
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: baseHeaders() });
    if (request.method !== 'GET' && request.method !== 'HEAD') return respond('Method not allowed', 405, { Allow: 'GET, HEAD, OPTIONS' });
    if (url.pathname === '/healthz' && !url.search) return respond('SF6 AI Coach media proxy ready\n');
    if (!url.pathname.startsWith(VIDEO_PATH) || url.search) return respond('Not found', 404);
    const filename = url.pathname.slice(VIDEO_PATH.length);
    if (!VALID_FILENAME.test(filename) || filename.includes('..')) return respond('Not found', 404);

    const range = request.headers.get('Range');
    if (range && (!VALID_RANGE.test(range) || range.length > 100)) return respond('Invalid Range', 416);
    const upstreamHeaders = new Headers();
    if (range) upstreamHeaders.set('Range', range);
    const ifRange = request.headers.get('If-Range');
    if (ifRange && ifRange.length <= 200) upstreamHeaders.set('If-Range', ifRange);

    let source;
    try {
      source = await fetch(RELEASE_BASE + filename, {
        method: request.method,
        headers: upstreamHeaders,
        redirect: 'follow',
      });
    } catch {
      return respond('Release media temporarily unavailable', 502);
    }

    if (source.status === 404 || source.status === 410) return respond('Video not found or expired', 404);
    if (source.status === 416) return respond('Range not satisfiable', 416, {
      ...(source.headers.get('Content-Range') ? { 'Content-Range': source.headers.get('Content-Range') } : {}),
    });
    if (source.status !== 200 && source.status !== 206) return respond('Release media temporarily unavailable', 502);
    const responseHeaders = new Headers(baseHeaders());
    responseHeaders.set('Content-Type', 'video/mp4');
    responseHeaders.set('Content-Disposition', `inline; filename="${filename}"`);
    for (const key of ['Content-Length', 'Content-Range', 'Accept-Ranges', 'ETag', 'Last-Modified']) {
      const value = source.headers.get(key);
      if (value) responseHeaders.set(key, value);
    }
    // Preserve 206 and Content-Range exactly; never buffer the entire file.
    return new Response(request.method === 'HEAD' ? null : source.body, {
      status: source.status,
      headers: responseHeaders,
    });
  },
};