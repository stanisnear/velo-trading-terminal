import { CMC_IDS, normalizeMarketCoins } from '../shared/marketDiscovery.mjs';
import { MARKETS } from '../shared/markets.mjs';

const headers = { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' };
const fail = (error, status) => Response.json({ error }, { status, headers: { ...headers, 'Cache-Control': 'no-store' } });

async function readJson(response) {
  if (!response.ok || !response.body) throw new Error('Provider unavailable');
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 2_000_000) { await reader.cancel(); throw new Error('Response too large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const data = JSON.parse(new TextDecoder().decode(bytes));
  if (data.status?.error_code) throw new Error('Provider unavailable');
  return data;
}

export async function handleMarketData(request, env = {}, ctx, cache = globalThis.caches?.default) {
  const url = new URL(request.url);
  if (!['GET', 'HEAD'].includes(request.method)) return fail('Method not allowed', 405);
  const kind = url.searchParams.get('kind') || 'markets';
  const id = url.searchParams.get('id');
  const days = url.searchParams.get('days') || '1';
  if (!['markets', 'coin', 'chart'].includes(kind)
    || (kind !== 'markets' && !/^[a-z0-9][a-z0-9-]{0,99}$/.test(id || ''))
    || (kind === 'chart' && !['1', '7', '30'].includes(days))) return fail('Invalid market request', 400);

  // Only canonical public data enters this cache; no visitor credentials or cookies.
  const cachedData = async (name, ttl, getData) => {
    const key = new Request(`${url.origin}/api/market-data/cache/cmc-v1/${name}`);
    const cached = await cache?.match(key);
    if (cached) return cached.json();
    const data = await getData();
    if (cache) {
      const save = cache.put(key, Response.json(data, { headers: { ...headers, 'Cache-Control': `public, max-age=${ttl}` } })).catch(() => {});
      if (ctx) ctx.waitUntil(save); else await save;
    }
    return data;
  };
  const cmc = async (path, params) => {
    if (!env.CMC_API_KEY) throw new Error('Provider not configured');
    const target = new URL(`https://pro-api.coinmarketcap.com${path}`);
    target.search = new URLSearchParams(params).toString();
    return readJson(await fetch(target, { headers: { 'X-CMC_PRO_API_KEY': env.CMC_API_KEY },
      // Workers supports manual, not error; readJson rejects every 3xx response.
      signal: AbortSignal.timeout(8000), redirect: 'manual' }));
  };

  try {
    const directory = await cachedData('top50', 600, async () => {
      const data = await cmc('/v1/cryptocurrency/listings/latest', { limit: '50', convert: 'USD', sort: 'market_cap' });
      const assets = normalizeMarketCoins(data.data);
      if (!assets.length) throw new Error('Empty directory');
      return { assets, fetchedAt: Date.now(), provider: 'CoinMarketCap' };
    });
    let body = directory;
    let ttl = 600;
    if (kind !== 'markets') {
      const reference = MARKETS.find(market => market.geckoId === id);
      let asset = directory.assets.find(item => item.assetId === id);
      // Arbitrary CMC IDs cannot turn this endpoint into a quota-consuming proxy.
      if (!asset && !reference) return fail('Market unavailable', 404);
      const cmcId = asset?.cmcId || CMC_IDS[reference.symbol];
      if (kind === 'coin') {
        const metadata = await cachedData(`metadata-${cmcId}`, 86400, async () => {
          const data = await cmc('/v2/cryptocurrency/info', { id: String(cmcId) });
          const info = data.data?.[cmcId];
          if (!info || info.id !== cmcId) throw new Error('Missing metadata');
          const safeLinks = values => (Array.isArray(values) ? values : []).filter(value => typeof value === 'string' && /^https:\/\//.test(value)).slice(0, 5);
          return { description: String(info.description || '').slice(0, 5000),
            links: { website: safeLinks(info.urls?.website), twitter: safeLinks(info.urls?.twitter), whitepaper: safeLinks(info.urls?.technical_doc) } };
        });
        if (!asset) asset = await cachedData(`quote-${cmcId}`, 600, async () => {
          const data = await cmc('/v2/cryptocurrency/quotes/latest', { id: String(cmcId), convert: 'USD' });
          const normalized = normalizeMarketCoins([data.data?.[cmcId]])[0];
          if (!normalized) throw new Error('Missing quote');
          return normalized;
        });
        body = { asset, ...metadata, provider: 'CoinMarketCap' };
      } else {
        ttl = days === '1' ? 900 : 3600;
        body = await cachedData(`history-${cmcId}-${days}`, ttl, async () => {
          const interval = { '1': '15m', '7': '2h', '30': '12h' }[days];
          const count = { '1': '97', '7': '85', '30': '61' }[days];
          const data = await cmc('/v3/cryptocurrency/quotes/historical', { id: String(cmcId), convert: 'USD', interval, count });
          const quotes = data.data?.[cmcId]?.quotes;
          if (!Array.isArray(quotes)) throw new Error('Missing history');
          const rows = quotes.map(row => ({ time: Date.parse(row.timestamp), quote: row.quote?.USD }))
            .filter(row => Number.isFinite(row.time) && row.time <= Date.now()).sort((a, b) => a.time - b.time);
          const series = field => [...new Map(rows.filter(row => Number.isFinite(row.quote?.[field]) && row.quote[field] > 0)
            .map(row => [row.time, [row.time, row.quote[field]]])).values()];
          const prices = series('price');
          if (prices.length < 2) throw new Error('Missing history');
          return { prices, market_caps: series('market_cap'), provider: 'CoinMarketCap', fetchedAt: Date.now() };
        });
      }
    }
    const result = Response.json(body, { headers: { ...headers, 'Cache-Control': `public, max-age=${ttl}` } });
    return request.method === 'HEAD' ? new Response(null, result) : result;
  } catch { return fail('Market data temporarily unavailable. Please retry shortly.', 503); }
}
