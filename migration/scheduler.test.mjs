import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { jobs, runKeepers } from '../cloudflare/keeper-scheduler.js';

const event = { scheduledTime: 1791840000000 };
const env = {
  VELO_KEEPERS_ENABLED: 'true',
  VELO_KEEPER_BASE_URL: 'https://project.supabase.co/functions/v1/velo-keepers',
  CRON_SECRET: 'fixture-secret',
};

test('disabled scheduler never calls a backend and public HTTP cannot trigger it', async () => {
  const result = await runKeepers(event, {}, () => { throw new Error('Must not fetch'); });
  assert.deepEqual(result, { enabled: false, results: [] });
  assert.equal((await worker.fetch(new Request('https://scheduler.example/'))).status, 404);
});

test('missing secrets and invalid destinations fail before a request is sent', async () => {
  const noFetch = () => { throw new Error('Must not fetch'); };
  await assert.rejects(runKeepers(event, { ...env, CRON_SECRET: '' }, noFetch), /not configured/);
  for (const url of ['http://project.supabase.co/functions/v1/velo-keepers', 'https://other.example/functions/v1/velo-keepers', env.VELO_KEEPER_BASE_URL + '?secret=bad']) {
    await assert.rejects(runKeepers(event, { ...env, VELO_KEEPER_BASE_URL: url }, noFetch), /Invalid keeper backend URL/);
  }
});

test('all three jobs receive stable run identifiers and run serially', async () => {
  const calls = [];
  let inflight = 0;
  const result = await runKeepers(event, env, async (url, options) => {
    assert.equal(inflight++, 0);
    const job = url.pathname.split('/').pop();
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer fixture-secret');
    assert.equal(options.redirect, 'manual');
    assert.deepEqual(JSON.parse(options.body), { runId: `${event.scheduledTime}:${job}`, scheduledTime: event.scheduledTime });
    await Promise.resolve();
    calls.push(job);
    inflight--;
    return Response.json({ ok: true });
  });
  assert.deepEqual(calls, jobs);
  assert.equal(result.results.every(result => result.ok), true);
});

test('one failed job does not prevent the other jobs from being attempted', async () => {
  const calls = [];
  await assert.rejects(runKeepers(event, env, async url => {
    calls.push(url.pathname.split('/').pop());
    return calls.length === 1 ? new Response('private backend details', { status: 500 }) : Response.json({ ok: true });
  }), error => error.message.includes('cron-conditional-orders (500)') && !error.message.includes('private backend details'));
  assert.deepEqual(calls, jobs);
});

test('redirects and skipped jobs are not reported as successful runs', async () => {
  let count = 0;
  await assert.rejects(runKeepers(event, env, async () => {
    count++;
    if (count === 1) return new Response(null, { status: 302, headers: { Location: 'https://unrelated.example' } });
    return Response.json({ ok: true, skipped: true });
  }), /Keeper jobs failed: cron-conditional-orders \(302\), cron-tp-sl \(200\), cron-liquidate \(200\)/);
});
