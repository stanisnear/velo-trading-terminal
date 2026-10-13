import { boundedJson, RuntimeError } from '../_shared/runtime.js';
import { tokenStatus } from '../_shared/auth.js';
const JOBS = new Set(['cron-conditional-orders', 'cron-tp-sl', 'cron-liquidate']);
const json = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });

export function createKeepers({ getEnv, run, now = Date.now, tokenHash }) {
  return async request => {
    const url = new URL(request.url);
    const job = url.pathname.match(/^\/(?:functions\/v1\/)?velo-keepers\/api\/([a-z-]+)$/)?.[1];
    if (!JOBS.has(job)) return json({ error: 'NOT_FOUND' }, 404);
    if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
    const actual = request.headers.get('authorization')?.match(/^Bearer (\S{16,512})$/)?.[1];
    const auth = await tokenStatus(actual, getEnv('CRON_SECRET'), tokenHash, 16);
    if (auth) return json({ error: auth === 503 ? 'KEEPERS_NOT_CONFIGURED' : 'UNAUTHORIZED' }, auth);
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
