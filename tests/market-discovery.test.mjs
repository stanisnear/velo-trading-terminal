import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMarketCoins, resolveMarketAsset, mentionsTicker } from '../shared/marketDiscovery.mjs';
import { ELIGIBLE_PERPETUALS, TRADING_MARKETS } from '../shared/markets.mjs';
import { handleMarketData } from '../cloudflare/market-data.js';

const coin = (id = 1, symbol = 'BTC') => ({ id, symbol, name: symbol, slug: 'bitcoin', cmc_rank: 1,
  quote: { USD: { price: 100, percent_change_24h: 2 } } });
const env = { CMC_API_KEY: 'test-server-key' };
const url = suffix => new Request('https://velo.test/api/market-data' + suffix);
const memory = () => {
  const map = new Map();
  return { match: async key => map.get(key.url)?.clone(), put: async (key, value) => { map.set(key.url, value); } };
};

test('top 50 directory is independent of oracle/contract listing; excluded pairs cannot trade', () => {
  const assets = normalizeMarketCoins(Array.from({ length: 60 }, (_, i) => coin(i + 1, 'C' + i)));
  assert.equal(assets.length, 50);
  assert.deepEqual(assets[0].sparkline, []);
  assert.deepEqual(ELIGIBLE_PERPETUALS.map(m => m.symbol).sort(), ['BNB','BTC','DOGE','ETH','HYPE','PYTH','SOL','STETH','XRP']);
  assert.equal(TRADING_MARKETS.length, 4);
});

test('directory validates IDs, numeric quotes and logo hosts without inventing prices', () => {
  const [asset] = normalizeMarketCoins([{ ...coin(999), image: 'javascript:alert(1)', quote: { USD: { price: '100' } } }, coin(999), { ...coin(), id: '../secrets' }]);
  assert.equal(asset.logo, 'https://s2.coinmarketcap.com/static/img/coins/128x128/999.png');
  assert.equal(asset.price, null);
  assert.throws(() => normalizeMarketCoins({ error: 'provider failed' }));
});

test('asset identity cannot be hijacked by a matching ticker', () => {
  const assets = normalizeMarketCoins([coin(), coin(999)]);
  assert.equal(resolveMarketAsset(assets, 'cmc-999').geckoId, null);
  assert.equal(resolveMarketAsset(assets, 'BTC').cmcId, 1);
  assert.equal(resolveMarketAsset(assets, 'bitcoin').cmcId, 1);
  assert.equal(mentionsTicker('I watch $SOLX', 'SOL'), false);
  assert.equal(mentionsTicker('I watch $sol.', 'SOL'), true);
  assert.equal(mentionsTicker('I watch $1INCH and $USDE.E.', '1INCH'), true);
  assert.equal(mentionsTicker('I watch $1INCH and $USDE.E.', 'USDE.E'), true);
});

test('ticker discussion rejects event objects and malformed identifiers without crashing', () => {
  for (const identifier of [undefined, null, {}, { type: 'click' }, 42, ['BTC'], '']) {
    assert.equal(mentionsTicker('I watch $BTC', identifier), false);
  }
});

test('gateway rejects invalid methods and ranges before any upstream request', async () => {
  for (const [query, method, status] of [['?kind=chart&id=bitcoin&days=365', 'GET', 400], ['?kind=coin&id=../secret', 'GET', 400], ['', 'POST', 405]]) {
    assert.equal((await handleMarketData(new Request('https://velo.test/api/market-data' + query, { method }))).status, status);
  }
});

test('canonical cache shares public snapshots without cookies or exposing the server key', async t => {
  let calls = 0;
  const cache = memory();
  t.mock.method(globalThis, 'fetch', async (target, init) => {
    calls++;
    assert.equal(target.hostname, 'pro-api.coinmarketcap.com');
    assert.equal(target.searchParams.get('limit'), '50');
    assert.deepEqual(init.headers, { 'X-CMC_PRO_API_KEY': env.CMC_API_KEY });
    assert.equal(init.redirect, 'manual');
    return Response.json({ data: [coin()] });
  });
  const request = new Request('https://velo.test/api/market-data?ignored=secret', { headers: { Cookie: 'private', Authorization: 'Bearer private' } });
  const result = await handleMarketData(request, env, undefined, cache);
  assert.equal(result.status, 200);
  assert.doesNotMatch(await result.clone().text(), /test-server-key|private/);
  assert.equal((await result.json()).assets.length, 1);
  const head = await handleMarketData(new Request('https://velo.test/api/market-data', { method: 'HEAD' }), {}, undefined, cache);
  assert.equal(await head.text(), ''); assert.equal(calls, 1);
});

test('provider failures are not cached or exposed', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('private provider diagnostics', { status: 403 }));
  const result = await handleMarketData(url(''), env);
  assert.equal(result.status, 503);
  assert.equal(result.headers.get('Cache-Control'), 'no-store');
  assert.ok(!(await result.text()).includes('private'));
});

test('provider redirects are rejected without forwarding the key or caching the redirect', async t => {
  let calls = 0;
  const cache = memory();
  t.mock.method(globalThis, 'fetch', async (target, init) => {
    calls++;
    assert.equal(target.hostname, 'pro-api.coinmarketcap.com');
    assert.equal(init.redirect, 'manual');
    return new Response(null, { status: 302, headers: { Location: 'https://untrusted.test/collect' } });
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await handleMarketData(url(''), env, undefined, cache);
    assert.equal(result.status, 503);
    assert.equal(result.headers.get('Location'), null);
    assert.doesNotMatch(await result.text(), /untrusted|test-server-key/);
  }
  assert.equal(calls, 2);
});

test('arbitrary asset IDs cannot spend chart or metadata credits', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({ data: [coin()] }); });
  assert.equal((await handleMarketData(url('?kind=chart&id=cmc-999&days=1'), env)).status, 404);
  assert.equal(calls, 1);
});

test('history uses actual provider timestamps, sorts and deduplicates, and separates price from market cap', async t => {
  t.mock.method(globalThis, 'fetch', async target => {
    if (target.pathname.includes('listings')) return Response.json({ data: [coin()] });
    assert.equal(target.searchParams.get('interval'), '12h');
    assert.equal(target.searchParams.get('count'), '61');
    const row = (time, price) => ({ timestamp: time, quote: { USD: { price, market_cap: price * 10 } } });
    return Response.json({ data: { 1: { quotes: [row('2020-01-02', 20), row('bad', 5), row('2020-01-01', 10), row('2020-01-02', 21)] } } });
  });
  const result = await handleMarketData(url('?kind=chart&id=bitcoin&days=30'), env);
  const data = await result.json();
  assert.deepEqual(data.prices, [[Date.parse('2020-01-01'), 10], [Date.parse('2020-01-02'), 21]]);
  assert.deepEqual(data.market_caps.map(row => row[1]), [100, 210]);
});

test('metadata is sanitized and cached separately from fresh quotes', async t => {
  t.mock.method(globalThis, 'fetch', async target => target.pathname.includes('listings')
    ? Response.json({ data: [coin()] })
    : Response.json({ data: { 1: { id: 1, description: 'Bitcoin', urls: { website: ['javascript:bad', 'https://bitcoin.org'] } } } }));
  const result = await handleMarketData(url('?kind=coin&id=bitcoin'), env, undefined, memory());
  const data = await result.json();
  assert.equal(data.asset.price, 100);
  assert.deepEqual(data.links.website, ['https://bitcoin.org']);
});
