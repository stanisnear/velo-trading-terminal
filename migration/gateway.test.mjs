import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/worker.js';

const bindings = {
  VELO_BACKEND_URL: 'https://backend.example/functions/v1/velo-api',
  VELO_PROXY_TOKEN: 'test-gateway-token',
  ASSETS: { fetch: async () => new Response('<html>terminal</html>', { headers: { 'Content-Type': 'text/html' } }) },
};

async function withFetch(mock, task) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try { return await task(); } finally { globalThis.fetch = original; }
}

test('human SPA routes return the actual asset bytes', async () => {
  const response = await worker.fetch(new Request('https://app.example/social/post/abc'), bindings);
  assert.equal(await response.text(), '<html>terminal</html>');
  assert.equal(response.headers.get('Vary'), 'User-Agent');
});

test('API requests never fall through to the SPA or expose keeper routes', async () => {
  for (const route of ['/api', '/api/unknown', '/api/cron-tp-sl']) {
    const response = await worker.fetch(new Request(`https://app.example${route}`), bindings);
    assert.equal(response.status, 404);
    assert.match(response.headers.get('content-type'), /json/);
  }
});

test('missing secrets and invalid backend URLs fail closed', async () => {
  await withFetch(() => { throw new Error('must not call backend'); }, async () => {
    for (const env of [{}, { ...bindings, VELO_PROXY_TOKEN: '' }, { ...bindings, VELO_BACKEND_URL: 'http://backend.example' }]) {
      const response = await worker.fetch(new Request('https://app.example/api/user-stats'), env);
      assert.equal(response.status, 503);
    }
  });
});

test('proxy preserves payload/status but replaces spoofed credentials and excludes cookies', async () => {
  await withFetch(async (url, options) => {
    assert.equal(String(url), 'https://backend.example/functions/v1/velo-api/api/sponsor-eth');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.get('X-Velo-Proxy-Token'), bindings.VELO_PROXY_TOKEN);
    assert.equal(options.headers.has('cookie'), false);
    assert.equal(options.redirect, 'manual');
    assert.deepEqual(await new Response(options.body).json(), { burnerAddress: 'fixture' });
    return Response.json({ error: 'cooldown' }, { status: 429, headers: { 'Retry-After': '300' } });
  }, async () => {
    const response = await worker.fetch(new Request('https://app.example/api/sponsor-eth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': 'session=private', 'X-Velo-Proxy-Token': 'spoof' },
      body: JSON.stringify({ burnerAddress: 'fixture' }),
    }), bindings);
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('Retry-After'), '300');
    assert.deepEqual(await response.json(), { error: 'cooldown' });
  });
});

test('bot post metadata uses the path ID and prevents caching crawler HTML for humans', async () => {
  await withFetch(async url => {
    assert.equal(url.pathname, '/functions/v1/velo-api/api/post-og');
    assert.equal(url.searchParams.get('id'), 'actual-id');
    return new Response('<html>post metadata</html>');
  }, async () => {
    const response = await worker.fetch(new Request('https://app.example/social/post/actual-id?id=spoof', { headers: { 'User-Agent': 'Twitterbot' } }), bindings);
    assert.equal(await response.text(), '<html>post metadata</html>');
    assert.equal(response.headers.get('Vary'), 'User-Agent');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  });
});

test('upstream redirects cannot forward the gateway secret to another service', async () => {
  await withFetch(async () => new Response(null, { status: 302, headers: { Location: 'https://other.example' } }), async () => {
    assert.equal((await worker.fetch(new Request('https://app.example/api/og?url=https%3A%2F%2Fpublic.example'), bindings)).status, 502);
  });
});

test('only the existing method is allowed for sponsorship', async () => {
  const response = await worker.fetch(new Request('https://app.example/api/sponsor-eth'), bindings);
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'POST, OPTIONS');
});
