import { RuntimeError, boundedJson, httpsSetting } from './runtime.js';

// Pyth Core's August 2026 change requires an API key. Keep it exclusively in
// server secrets. Never put it in a VITE_ setting, query string or response.
export async function latestPythUpdate(feed, getEnv, fetchImpl = fetch) {
  if (!/^0x[0-9a-f]{64}$/i.test(feed)) throw new RuntimeError('INVALID_FEED_ID');
  const base = httpsSetting(getEnv('PYTH_HERMES_URL') || getEnv('VITE_PYTH_HERMES_URL'), 'HERMES');
  if (base.search) throw new RuntimeError('HERMES_NOT_CONFIGURED');
  const official = (base.origin === 'https://hermes.pyth.network' && /^\/?$/.test(base.pathname)) ||
    (base.origin === 'https://pyth.dourolabs.app' && /^\/hermes\/?$/.test(base.pathname));
  const key = getEnv('PYTH_API_KEY');
  if (official && !key) throw new RuntimeError('PYTH_API_KEY_MISSING');
  // Credentials must never leak to a substituted endpoint. A custom public
  // Hermes deployment can be configured without the Pyth provider's key.
  if (key && !official) throw new RuntimeError('PYTH_KEY_HOST_MISMATCH');
  if (key && (key.length > 4096 || /[\s\x00-\x1f\x7f]/.test(key))) throw new RuntimeError('PYTH_KEY_INVALID');
  base.pathname = base.pathname.replace(/\/$/, '') + '/v2/updates/price/latest';
  base.searchParams.set('ids[]', feed.slice(2));
  base.searchParams.set('encoding', 'hex');
  base.searchParams.set('parsed', 'true');
  let response;
  try {
    response = await fetchImpl(base, {
      headers: key ? { Authorization: `Bearer ${key}` } : {},
      redirect: 'error', signal: AbortSignal.timeout(7000),
    });
  } catch { throw new RuntimeError('PYTH_UNAVAILABLE'); }
  if (!response.ok) {
    await response.body?.cancel();
    throw new RuntimeError(response.status === 401 || response.status === 403 ? 'PYTH_AUTH_FAILED' :
      response.status === 429 ? 'PYTH_RATE_LIMITED' : 'PYTH_UNAVAILABLE');
  }
  return boundedJson(response);
}
