export class RuntimeError extends Error {
  constructor(code, status = 503) { super(code); this.code = code; this.status = status; }
}

export async function boundedJson(response, limit = 262144) {
  if (!response.ok) { await response.body?.cancel(); throw new RuntimeError('UPSTREAM_UNAVAILABLE'); }
  const reader = response.body?.getReader();
  if (!reader) throw new RuntimeError('EMPTY_RESPONSE');
  const parts = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new RuntimeError('RESPONSE_TOO_LARGE'); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function runtimeStore(getEnv, fetchImpl = fetch) {
  const url = getEnv('SUPABASE_URL');
  const key = getEnv('SUPABASE_SERVICE_ROLE_KEY') || getEnv('SUPABASE_SERVICE_KEY');
  if (url !== 'https://btgfoekgvyvdflzjfehz.supabase.co' || !key) throw new RuntimeError('DATABASE_NOT_CONFIGURED');
  return async (action, p) => boundedJson(await fetchImpl(`${url}/rest/v1/rpc/velo_runtime`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_action: action, p }),
  }));
}

export function httpsSetting(value, name) {
  try { const u = new URL(value); if (u.protocol !== 'https:' || u.username || u.password || u.hash) throw Error(); return u; }
  catch { throw new RuntimeError(`${name}_NOT_CONFIGURED`); }
}
