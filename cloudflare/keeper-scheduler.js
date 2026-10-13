// Cloudflare is the timer; the transaction work runs in Supabase.
// Do not enable until the backend has durable locking, bounded scans and
// duplicate-run protection, and the previous Vercel schedules are disabled.
export const jobs = ['cron-conditional-orders', 'cron-tp-sl', 'cron-liquidate'];

async function readResult(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty keeper response');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 16384) { await reader.cancel(); throw new Error('Oversized keeper response'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function runKeepers(controller, env, fetchImpl = fetch) {
  if (env.VELO_KEEPERS_ENABLED !== 'true') return { enabled: false, results: [] };
  if (!env.CRON_SECRET || !env.VELO_KEEPER_BASE_URL) throw new Error('Keeper scheduler is not configured');
  let base;
  try {
    base = new URL(env.VELO_KEEPER_BASE_URL);
    if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash ||
        !base.hostname.endsWith('.supabase.co') || !/^\/functions\/v1\/velo-keepers\/?$/.test(base.pathname)) {
      throw new Error();
    }
  } catch { throw new Error('Invalid keeper backend URL'); }

  const scheduledTime = Number(controller.scheduledTime);
  if (!Number.isSafeInteger(scheduledTime) || scheduledTime < 0) throw new Error('Invalid scheduled time');
  const results = [];
  // Serialize jobs within this invocation. The backend still needs a durable
  // lock shared with the sponsor to cover overlapping deliveries and isolates.
  for (const job of jobs) {
    const target = new URL(base);
    target.pathname = base.pathname.replace(/\/$/, '') + '/api/' + job;
    try {
      const response = await fetchImpl(target, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.CRON_SECRET}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: `${scheduledTime}:${job}`, scheduledTime, ...(env.VELO_KEEPERS_DRY_RUN === 'true' ? { dryRun: true } : {}) }),
        redirect: 'manual',
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        results.push({ job, ok: false, status: response.status });
        continue;
      }
      const result = await readResult(response);
      // A 200 with configured:false/skipped:true is not a successful keeper run.
      results.push({ job, ok: result.ok === true && result.skipped !== true && result.configured !== false, status: response.status });
    } catch {
      results.push({ job, ok: false, status: 'request-failed' });
    }
  }
  const failed = results.filter(result => !result.ok);
  console.log(JSON.stringify({ event: 'velo_keeper_tick', scheduledTime, dryRun: env.VELO_KEEPERS_DRY_RUN === 'true', results }));
  if (failed.length) {
    // Never log credentials, RPC URLs, backend response bodies or exceptions.
    throw new Error('Keeper jobs failed: ' + failed.map(result => `${result.job} (${result.status})`).join(', '));
  }
  return { enabled: true, results };
}

export default {
  async scheduled(controller, env, ctx) {
    const run = runKeepers(controller, env);
    ctx.waitUntil(run);
    await run;
  },
  async fetch() {
    // Public HTTP calls cannot trigger trading jobs.
    return new Response('Not found', { status: 404 });
  },
};
