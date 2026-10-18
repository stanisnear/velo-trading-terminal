// Fetch <-> req/res adapter for the handlers in api/. All handlers require the private gateway token.
import { tokenStatus } from '../_shared/auth.js';
const methods = new Map([
  ['record-transfer', ['POST']],
  ['wallet-auth', ['POST']],
  ['sponsor-eth', ['POST', 'OPTIONS']],
  ['user-stats', ['GET', 'HEAD']],
  ['ga-stats', ['GET', 'HEAD']],
  ['protocol-stats', ['GET', 'HEAD']],
  ['og', ['GET', 'HEAD']],
  ['post-og', ['GET', 'HEAD']],
]);
const MAX_BODY = 16 * 1024;
const secureHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

function problem(status, error, extra = {}) {
  return Response.json({ error }, { status, headers: { ...secureHeaders, ...extra } });
}

async function readBody(request) {
  if (Number(request.headers.get('content-length')) > MAX_BODY) throw new RangeError('Body too large');
  if (!request.body) return undefined;
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY) {
        await reader.cancel();
        throw new RangeError('Body too large');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const text = new TextDecoder().decode(bytes);
  return text ? JSON.parse(text) : undefined;
}

export function createApi({ getEnv, loaders, tokenHash }) {
  return async function serve(request) {
    // Supabase can pass either /velo-api/... or /functions/v1/velo-api/....
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/(?:functions\/v1\/)?velo-api\/api\/([a-z-]+)$/);
    const name = match?.[1];
    const allowed = methods.get(name);
    if (!allowed || !Object.hasOwn(loaders, name)) return problem(404, 'Route not found');
    if (!allowed.includes(request.method)) return problem(405, 'Method not allowed', { Allow: allowed.join(', ') });

    const auth = await tokenStatus(request.headers.get('x-velo-proxy-token'), getEnv('VELO_PROXY_TOKEN'), tokenHash);
    if (auth) return problem(auth, auth === 503 ? 'Backend not configured' : 'Unauthorized');

    let body;
    if (request.method === 'POST') {
      if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) {
        return problem(415, 'Content-Type must be application/json');
      }
      try { body = await readBody(request); }
      catch (error) { return problem(error instanceof RangeError ? 413 : 400, 'Invalid JSON body'); }
    }

    const query = Object.create(null);
    for (const [key, value] of url.searchParams) {
      if (Object.hasOwn(query, key)) return problem(400, 'Duplicate query parameter');
      query[key] = value;
    }
    const req = {
      method: request.method === 'HEAD' ? 'GET' : request.method,
      url: url.pathname + url.search,
      query,
      body,
      headers: Object.fromEntries(request.headers),
    };
    const headers = new Headers(secureHeaders);
    let status = 200;
    let output = null;
    let finished = false;
    const res = {
      setHeader(name, value) { headers.set(name, String(value)); return res; },
      status(value) { status = value; return res; },
      json(value) { headers.set('Content-Type', 'application/json; charset=utf-8'); output = JSON.stringify(value); finished = true; return res; },
      send(value) { output = String(value); finished = true; return res; },
      end(value) { output = value == null ? null : String(value); finished = true; return res; },
    };
    try {
      const { default: handler } = await loaders[name]();
      await handler(req, res);
      if (!finished) return problem(502, 'Backend returned no response');
      // Supabase's default domain rewrites GET HTML to text/plain. Only this
      // trusted renderer may ask the Cloudflare gateway to restore HTML.
      if (name === 'post-og' && status === 200 && /^text\/html\b/.test(headers.get('content-type') || '')) {
        headers.set('X-Velo-Response-Type', 'post-og-html');
      }
      return new Response(request.method === 'HEAD' || status === 204 ? null : output, { status, headers });
    } catch {
      // Do not reflect exception text containing RPC URLs or credentials.
      console.error(`[velo-api] ${name}: handler failed`);
      return problem(500, 'Backend request failed');
    }
  };
}
