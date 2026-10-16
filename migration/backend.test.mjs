import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../supabase/functions/velo-api/bridge.js';
import worker from '../cloudflare/worker.js';

const token = 'fixture-gateway-token-32-characters-long';
const getEnv = name => name === 'VELO_PROXY_TOKEN' ? token : undefined;
const url = name => `https://project.supabase.co/functions/v1/velo-api/api/${name}`;
const request = (name, options = {}) => new Request(url(name), {
  ...options, headers: { 'X-Velo-Proxy-Token': token, ...options.headers },
});

test('missing/short tokens and unauthorized callers cannot load a handler', async () => {
  const loaders = { 'user-stats': () => { throw new Error('Must not load'); } };
  for (const secret of [undefined, '', 'short']) {
    const serve = createApi({ getEnv: () => secret, loaders });
    assert.equal((await serve(request('user-stats'))).status, 503);
  }
  const serve = createApi({ getEnv, loaders });
  for (const supplied of ['', 'x'.repeat(token.length), 'x'.repeat(513)]) {
    assert.equal((await serve(request('user-stats', { headers: { 'X-Velo-Proxy-Token': supplied } }))).status, 401);
  }
});

test('cron and unknown routes remain inaccessible, including with a valid gateway token', async () => {
  const serve = createApi({ getEnv, loaders: {} });
  for (const name of ['cron-tp-sl', 'cron-liquidate', 'cron-conditional-orders', 'unknown', '__proto__']) {
    assert.equal((await serve(request(name))).status, 404);
  }
});

test('adapter preserves JSON, status and retry headers and accepts Supabase short paths', async () => {
  const serve = createApi({ getEnv, loaders: { 'sponsor-eth': async () => ({ default(req, res) {
    assert.equal(req.method, 'POST');
    assert.deepEqual(req.body, { burnerAddress: 'fixture' });
    res.setHeader('Retry-After', '300').status(429).json({ error: 'cooldown' });
  } }) } });
  const result = await serve(new Request('https://project.supabase.co/velo-api/api/sponsor-eth', {
    method: 'POST', headers: { 'X-Velo-Proxy-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ burnerAddress: 'fixture' }),
  }));
  assert.equal(result.status, 429);
  assert.equal(result.headers.get('Retry-After'), '300');
  assert.deepEqual(await result.json(), { error: 'cooldown' });
});

test('oversized, malformed and ambiguous input never reaches the sponsor', async () => {
  const serve = createApi({ getEnv, loaders: { 'sponsor-eth': () => { throw new Error('Must not load'); } } });
  for (const [body, expected] of [['{', 400], [JSON.stringify({ data: 'a'.repeat(17000) }), 413]]) {
    const result = await serve(request('sponsor-eth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }));
    assert.equal(result.status, expected);
  }
  assert.equal((await serve(request('sponsor-eth', { method: 'POST', body: '{}' }))).status, 415);
  assert.equal((await serve(request('sponsor-eth'))).status, 405);
});

test('HEAD and OPTIONS responses do not contain a body', async () => {
  const serve = createApi({ getEnv, loaders: {
    'user-stats': async () => ({ default(req, res) { assert.equal(req.method, 'GET'); res.json({ count: 7 }); } }),
    'sponsor-eth': async () => ({ default(req, res) { assert.equal(req.method, 'OPTIONS'); res.status(204).end(); } }),
  } });
  const head = await serve(request('user-stats', { method: 'HEAD' }));
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  const options = await serve(request('sponsor-eth', { method: 'OPTIONS' }));
  assert.equal(options.status, 204);
  assert.equal(await options.text(), '');
});

test('generated handlers load and retain safe unconfigured/validation behavior', async () => {
  globalThis.Deno = { env: { get: () => undefined } };
  const serve = createApi({ getEnv, loaders: {
    'ga-stats': () => import('../supabase/functions/velo-api/generated/ga-stats.js'),
    'user-stats': () => import('../supabase/functions/velo-api/generated/user-stats.js'),
    'sponsor-eth': () => import('../supabase/functions/velo-api/sponsor.js'),
    'og': () => import('../supabase/functions/velo-api/generated/og.js'),
    'protocol-stats': () => import('../supabase/functions/velo-api/generated/protocol-stats.js'),
  } });
  assert.equal((await (await serve(request('ga-stats'))).json()).configured, false);
  assert.equal((await (await serve(request('user-stats'))).json()).configured, false);
  const bad = await serve(request('sponsor-eth', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ burnerAddress: 'invalid' }),
  }));
  assert.equal(bad.status, 400);
  assert.deepEqual(await bad.json(), { error: 'Invalid burnerAddress' });
  assert.equal((await serve(request('og'))).status, 400);
  // Import viability only: never call RPCs or submit transactions in this test.
  assert.equal(typeof (await import('../supabase/functions/velo-api/generated/protocol-stats.js')).default, 'function');
});

test('real post renderer survives Supabase HTML rewriting and escapes untrusted input', async () => {
  globalThis.Deno = { env: { get: () => undefined } };
  const serve = createApi({ getEnv, loaders: { 'post-og': () => import('../supabase/functions/velo-api/generated/post-og.js') } });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (target, options) => {
    const response = await serve(new Request(target, options));
    // Reproduce the documented default-domain behavior of Supabase.
    response.headers.set('Content-Type', 'text/plain');
    return response;
  };
  try {
    const response = await worker.fetch(new Request('https://app.example/social/post/%22%3E%3Cscript%3E?id=ignored', {
      headers: { 'User-Agent': 'Twitterbot' },
    }), { VELO_BACKEND_URL: 'https://project.supabase.co/functions/v1/velo-api', VELO_PROXY_TOKEN: token });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^text\/html/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.has('X-Velo-Response-Type'), false);
    const body = await response.text();
    assert.match(body, /<!doctype html>/);
    assert.doesNotMatch(body, /<script>/);
  } finally { globalThis.fetch = originalFetch; }
  const direct = await serve(request('post-og?id=' + encodeURIComponent('\"><script>')));
  assert.match(await direct.text(), /&quot;&gt;&lt;script&gt;/);
  assert.equal((await serve(request('post-og?id=one&id=two'))).status, 400);
});

test('HTML promotion is restricted to successful post-og responses', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('<script>fixture</script>', {
    headers: { 'Content-Type': 'text/plain', 'X-Velo-Response-Type': 'post-og-html' },
  });
  try {
    const response = await worker.fetch(new Request('https://app.example/api/og'), {
      VELO_BACKEND_URL: 'https://project.supabase.co/functions/v1/velo-api', VELO_PROXY_TOKEN: token,
    });
    assert.equal(response.headers.get('content-type'), 'text/plain');
  } finally { globalThis.fetch = originalFetch; }
});
