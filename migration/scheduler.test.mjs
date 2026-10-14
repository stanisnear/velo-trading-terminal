import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { jobs, runKeepers } from '../cloudflare/keeper-scheduler.js';

const event = { scheduledTime: Date.now() };
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
  assert.equal(count, 3);
});

function clock(start = event.scheduledTime) {
  let time = start;
  const delays = [];
  return { now: () => time, advance: ms => { time += ms; }, delays,
    sleep: async ms => { delays.push(ms); time += ms; } };
}

test('a transient 520 retries once with the identical run ID, dry-run flag and credentials', async () => {
  const calls = [];
  const time = clock();
  const result = await runKeepers(event, { ...env, VELO_KEEPERS_DRY_RUN: 'true' }, async (url, options) => {
    calls.push({ url: String(url), body: options.body, headers: options.headers, redirect: options.redirect });
    if (calls.length === 1) return new Response('private gateway error', { status: 520 });
    return Response.json({ ok: true, duplicate: calls.length === 2 });
  }, time);
  assert.equal(calls.length, 4);
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(JSON.parse(calls[1].body).dryRun, true);
  assert.deepEqual(time.delays, [1000]);
  assert.deepEqual(result.results.map(r => r.attempts), [2, 1, 1]);
  assert.equal(result.results.every(r => r.ok), true);
});

test('a lost network response retries the same request and accepts a cached result', async () => {
  const bodies = [];
  const time = clock();
  const result = await runKeepers(event, env, async (_url, options) => {
    bodies.push(options.body);
    if (bodies.length === 1) throw new TypeError('Private network details');
    return Response.json({ ok: true, duplicate: bodies.length === 2 });
  }, time);
  assert.equal(bodies[0], bodies[1]);
  assert.deepEqual(time.delays, [1000]);
  assert.equal(result.results[0].attempts, 2);
});

test('persistent gateway failures stop after two attempts and later jobs still run', async () => {
  const calls = [];
  const time = clock();
  await assert.rejects(runKeepers(event, env, async url => {
    const job = url.pathname.split('/').pop();
    calls.push(job);
    return job === jobs[0] ? new Response('private error', { status: 520 }) : Response.json({ ok: true });
  }, time), /cron-conditional-orders \(520\)/);
  assert.deepEqual(calls, [jobs[0], ...jobs]);
  assert.deepEqual(time.delays, [1000]);
});

test('authorization, busy jobs and backend failures are never retried', async () => {
  const statuses = [401, 409, 502];
  const time = clock();
  let count = 0;
  await assert.rejects(runKeepers(event, env, async () => new Response(null, { status: statuses[count++] }), time), /Keeper jobs failed/);
  assert.equal(count, 3);
  assert.deepEqual(time.delays, []);
});

test('a timed-out job does not gain another full timeout budget', async () => {
  const time = clock();
  const calls = [];
  await assert.rejects(runKeepers(event, env, async url => {
    calls.push(url.pathname.split('/').pop());
    if (calls.length === 1) { time.advance(120_000); throw new Error('timeout'); }
    return Response.json({ ok: true });
  }, time), /cron-conditional-orders \(request-failed\)/);
  assert.deepEqual(calls, jobs);
  assert.deepEqual(time.delays, []);
});

test('stale invocations cannot start jobs or retry after their overall deadline', async () => {
  const time = clock(event.scheduledTime + 268_000);
  const calls = [];
  await assert.rejects(runKeepers(event, env, async url => {
    calls.push(url.pathname.split('/').pop());
    time.advance(500);
    return new Response(null, { status: 520 });
  }, time), /cron-tp-sl \(deadline-exceeded\), cron-liquidate \(deadline-exceeded\)/);
  assert.deepEqual(calls, [jobs[0], jobs[0]]);
  assert.deepEqual(time.delays, [1000]);
});
