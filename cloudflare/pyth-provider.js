// A denied market must not disable every other market in a batched request.
// Only explicit provider entitlement errors can remove an exact requested ID.
const deniedByEnvironment = new WeakMap();

async function errorText(response) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  let text = '', size = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return text;
      size += value.length;
      if (size > 4096) return '';
      text += decoder.decode(value, { stream: true });
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function fetchPriceProvider(target, request, env, fetchImpl, route) {
  let cache = deniedByEnvironment.get(env);
  if (!cache || cache.key !== env.PYTH_API_KEY) {
    cache = { key: env.PYTH_API_KEY, feeds: new Map() };
    deniedByEnvironment.set(env, cache);
  }
  const requested = target.searchParams.getAll('ids[]');
  const missing = new Set(requested.filter(id => (cache.feeds.get(id) || 0) > Date.now()));
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(route === 'stream' ? 300000 : 10000)]);
  const deadline = Date.now() + 10000;
  for (let attempt = 0; attempt <= requested.length; attempt++) {
    const remaining = requested.filter(id => !missing.has(id));
    if (requested.length && !remaining.length) return { unavailable: [...missing], response: null };
    const url = new URL(target);
    url.searchParams.delete('ids[]');
    for (const id of remaining) url.searchParams.append('ids[]', id);
    // A long-lived SSE connection may stay open, but opening it or reading an
    // error must share the same short deadline as a normal snapshot request.
    const opening = new AbortController();
    const timer = setTimeout(() => opening.abort(), Math.max(1, deadline - Date.now()));
    let response, detail;
    try {
      response = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${env.PYTH_API_KEY}`, Accept: route === 'stream' ? 'text/event-stream' : 'application/json' },
        redirect: 'manual', signal: AbortSignal.any([signal, opening.signal]),
      });
      if (response.ok) return { response, unavailable: [...missing] };
      detail = await errorText(response);
    } finally { clearTimeout(timer); }
    const denied = response.status === 403 && detail.match(/^Not entitled: feed (?:0x)?([a-f0-9]{64})\b/i)?.[1]?.toLowerCase();
    const id = denied && remaining.find(value => value.replace(/^0x/, '') === denied);
    if (!id) return { response, unavailable: [...missing] };
    cache.feeds.set(id, Date.now() + 60000);
    missing.add(id);
    console.error(JSON.stringify({ event: 'pyth_feed_unavailable', feed: id, status: 403 }));
    if (Date.now() >= deadline) return { response, unavailable: [...missing] };
  }
  return { response: null, unavailable: [...missing] };
}
