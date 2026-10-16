import { allowedFeeds, allowedSymbols } from './pyth-feeds.js';
import { boundedJson } from '../supabase/functions/_shared/runtime.js';
import { fetchPriceProvider } from './pyth-provider.js';

const SUPABASE = 'https://btgfoekgvyvdflzjfehz.supabase.co';
const resolutions = { '1':60, '2':120, '5':300, '15':900, '30':1800, '60':3600, '120':7200, '240':14400, '360':21600, '720':43200, D:86400, W:604800, M:2592000 };
const fail = (error, status) => Response.json({ error }, {
  status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(status === 429 ? { 'Retry-After': '60' } : {}) },
});

// Invoked through the Pages service binding, with workers.dev disabled.
// Browsers send their Supabase session, never the provider's long-lived key.
export async function proxyPyth(request, env, fetchImpl = fetch) {
  const url = new URL(request.url);
  const route = url.pathname === '/api/pyth/history' ? 'history' : url.pathname.match(/^\/api\/pyth\/v2\/updates\/price\/(latest|stream)$/)?.[1];
  if (!route) return fail('NOT_FOUND', 404);
  if (request.method !== 'GET') return fail('METHOD_NOT_ALLOWED', 405);
  if (url.search.length > 4096) return fail('INVALID_QUERY', 400);
  let target;
  if (route === 'history') {
    const expected = new Set(['symbol','resolution','from','to']);
    if ([...url.searchParams.keys()].some(k=>!expected.has(k)) || [...expected].some(k=>url.searchParams.getAll(k).length!==1)) return fail('INVALID_QUERY',400);
    const symbol=url.searchParams.get('symbol'),resolution=url.searchParams.get('resolution');
    const from=Number(url.searchParams.get('from')),to=Number(url.searchParams.get('to')),now=Date.now()/1000;
    const seconds=Object.hasOwn(resolutions,resolution)?resolutions[resolution]:0;
    if (!allowedSymbols.has(symbol) || !seconds || !Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from<now-5*366*86400 || to>now+60 || from>=to || (to-from)/seconds>500) return fail('INVALID_HISTORY_RANGE',400);
    target=new URL('https://pyth.dourolabs.app/v1/fixed_rate@200ms/history');
    for(const name of expected) target.searchParams.set(name,url.searchParams.get(name));
  } else {
    const accepted = new Set(['ids[]', 'encoding', 'parsed', 'allow_unordered']);
    if ([...url.searchParams.keys()].some(k => !accepted.has(k))) return fail('INVALID_QUERY', 400);
    for (const name of ['encoding', 'parsed', 'allow_unordered']) if (url.searchParams.getAll(name).length > 1) return fail('INVALID_QUERY', 400);
    if (url.searchParams.has('encoding') && url.searchParams.get('encoding') !== 'hex') return fail('INVALID_QUERY', 400);
    for (const name of ['parsed', 'allow_unordered']) if (url.searchParams.has(name) && url.searchParams.get(name) !== 'true') return fail('INVALID_QUERY', 400);
    const ids = url.searchParams.getAll('ids[]').map(x => x.replace(/^0x/, '').toLowerCase());
    if (!ids.length || ids.length > allowedFeeds.size || new Set(ids).size !== ids.length || ids.some(x => !allowedFeeds.has(x))) return fail('INVALID_FEEDS', 400);
    target = new URL(`https://pyth.dourolabs.app/hermes/v2/updates/price/${route}`);
    for (const id of ids.sort()) target.searchParams.append('ids[]', `0x${id}`);
    target.searchParams.set('encoding', 'hex'); target.searchParams.set('parsed', 'true');
    if (route === 'stream') target.searchParams.set('allow_unordered', 'true');
  }
  const authorization = request.headers.get('Authorization');
  if (!authorization || !/^Bearer [A-Za-z0-9_.-]{50,4096}$/.test(authorization)) return fail('SIGN_IN_REQUIRED', 401);
  if (!env.PYTH_API_KEY || !env.SUPABASE_ANON_KEY || !env.AUTH_LIMIT || !env.USER_LIMIT || !env.STREAM_LIMIT) return fail('PRICE_SERVICE_NOT_CONFIGURED', 503);
  let stage = 'auth_limit';
  try {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!(await env.AUTH_LIMIT.limit({ key: ip })).success) return fail('RATE_LIMITED', 429);
    stage = 'auth_fetch';
    const auth = await fetchImpl(`${SUPABASE}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: authorization },
      redirect: 'manual', signal: AbortSignal.timeout(7000),
    });
    if (!auth.ok) {
      if (auth.status >= 300 && auth.status < 400) console.error(JSON.stringify({ event: 'pyth_auth_redirect_refused', status: auth.status }));
      await auth.body?.cancel();
      return fail(auth.status === 401 || auth.status === 403 ? 'SIGN_IN_REQUIRED' : 'AUTH_UNAVAILABLE', auth.status === 401 || auth.status === 403 ? 401 : 503);
    }
    stage = 'auth_response';
    const user = await boundedJson(auth, 65536);
    if (!/^[0-9a-f-]{36}$/i.test(user.id || '') || user.is_anonymous === true) return fail('SIGN_IN_REQUIRED', 401);
    stage = 'user_limit';
    if (!(await env.USER_LIMIT.limit({ key: user.id })).success) return fail('RATE_LIMITED', 429);
    if (route === 'stream' && !(await env.STREAM_LIMIT.limit({ key: user.id })).success) return fail('RATE_LIMITED', 429);
    stage = 'provider_fetch';
    const { response: upstream, unavailable } = await fetchPriceProvider(target, request, env, fetchImpl, route);
    if (!upstream) return fail('PYTH_FEED_UNAVAILABLE', 503);
    if (!upstream.ok) {
      console.error(JSON.stringify({ event: 'pyth_provider_rejected', route, status: upstream.status }));
      return fail(upstream.status === 429 ? 'PYTH_RATE_LIMITED' : 'PYTH_UNAVAILABLE', upstream.status === 429 ? 429 : 502);
    }
    stage = 'provider_response';
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(unavailable.length ? { 'X-Pyth-Unavailable-Feeds': unavailable.join(',') } : {}) };
    if (route !== 'stream') return Response.json(await boundedJson(upstream, 524288), { headers });
    if (!upstream.headers.get('Content-Type')?.startsWith('text/event-stream')) {
      await upstream.body?.cancel(); return fail('INVALID_PRICE_STREAM', 502);
    }
    return new Response(upstream.body, { headers: { ...headers, 'Content-Type': 'text/event-stream' } });
  } catch (error) {
    // Log only a fixed stage and the error class, never URLs, headers or bodies.
    const reason = /illegal invocation|this.*bound|incorrect.*this/i.test(error?.message || '') ? 'INVOCATION_CONTEXT' : /redirect/i.test(error?.message || '') ? 'REDIRECT_REJECTED' : /header/i.test(error?.message || '') ? 'INVALID_HEADER' : /network|fetch failed|internal error|connection/i.test(error?.message || '') ? 'NETWORK_ERROR' : 'UNCLASSIFIED';
    console.error(JSON.stringify({ event: 'pyth_proxy_failed', stage, reason, errorType: ['TypeError', 'AbortError', 'TimeoutError', 'SyntaxError'].includes(error?.name) ? error.name : 'Error' }));
    return fail('PRICE_SERVICE_UNAVAILABLE', 503);
  }
}
export default { fetch: (request, env) => proxyPyth(request, env) };
