import { boundedJson, RuntimeError } from '../_shared/runtime.js';
const JOBS = new Set(['cron-conditional-orders', 'cron-tp-sl', 'cron-liquidate']);
const json = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });

export function createKeepers({ getEnv, run, now = Date.now }) {
  return async request => {
    const url = new URL(request.url);
    const job = url.pathname.match(/^\/(?:functions\/v1\/)?velo-keepers\/api\/([a-z-]+)$/)?.[1];
    if (!JOBS.has(job)) return json({ error: 'NOT_FOUND' }, 404);
    if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
    const expected = getEnv('CRON_SECRET');
    if (!expected || expected.length < 16 || expected.length > 512) return json({ error: 'KEEPERS_NOT_CONFIGURED' }, 503);
    const actual = request.headers.get('authorization');
    if (!actual || actual.length > 520) return json({ error: 'UNAUTHORIZED' }, 401);
    const enc = new TextEncoder();
    const [a,b] = await Promise.all([actual, `Bearer ${expected}`].map(s => crypto.subtle.digest('SHA-256', enc.encode(s)).then(v => new Uint8Array(v))));
    let diff = 0; for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    if (diff !== 0) return json({ error: 'UNAUTHORIZED' }, 401);
    if (url.search || !/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) return json({ error: 'INVALID_REQUEST' }, 400);
    let input;
    try { input = await boundedJson(new Response(request.body), 2048); }
    catch { return json({ error: 'INVALID_BODY' }, 400); }
    if (!input || !Number.isSafeInteger(input.scheduledTime) || Math.abs(now()-input.scheduledTime) > 300000 ||
      input.runId !== `${input.scheduledTime}:${job}` || (input.dryRun !== undefined && typeof input.dryRun !== 'boolean')) return json({ error: 'INVALID_RUN' }, 400);
    try { const result = await run(job, input, getEnv); return json(result, result.ok ? 200 : 502); }
    catch (error) { return json({ error: error instanceof RuntimeError ? error.code : 'KEEPER_UNAVAILABLE' }, error instanceof RuntimeError ? error.status : 503); }
  };
}
