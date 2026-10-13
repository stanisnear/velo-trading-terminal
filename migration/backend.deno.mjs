// Run with Deno, using no outbound network or wallet credentials.
// Deno.serve is replaced before importing the deployment bundle.
const fixtureToken = 'fixture-gateway-token-32-characters-long';
Deno.env.set('VELO_PROXY_TOKEN', fixtureToken);
let serve;
Deno.serve = handler => { serve = handler; };
await import('../supabase/functions/velo-api/bundle.js');
if (typeof serve !== 'function') throw new Error('Missing deployment handler');
const base = 'https://project.supabase.co/functions/v1/velo-api/api/';
const headers = { 'X-Velo-Proxy-Token': fixtureToken };
const denied = await serve(new Request(base + 'user-stats'));
if (denied.status !== 401) throw new Error('Authentication guard failed');
const ga = await serve(new Request(base + 'ga-stats', { headers }));
if (ga.status !== 200 || (await ga.json()).configured !== false) throw new Error('GA adapter failed');
const og = await serve(new Request(base + 'post-og?id=fixture', { headers }));
if (og.status !== 200 || !(await og.text()).includes('<!doctype html>')) throw new Error('HTML adapter failed');
const sponsor = await serve(new Request(base + 'sponsor-eth', {
  method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{"burnerAddress":"invalid"}',
}));
if (sponsor.status !== 400) throw new Error('Sponsor validation failed');
console.log('Deno bundle: authentication, Node crypto import, HTML renderer and viem import passed. No network requests or transactions.');

Deno.env.set('CRON_SECRET', 'fixture-cron-secret-no-real-credentials');
await import('../supabase/functions/velo-keepers/bundle.js');
const keeperBase = 'https://project.supabase.co/functions/v1/velo-keepers/api/cron-tp-sl';
const unauthorized = await serve(new Request(keeperBase, { method: 'POST', body: '{}' }));
if (unauthorized.status !== 401) throw new Error('Keeper authentication failed');
const scheduledTime = Date.now();
const disabled = await serve(new Request(keeperBase, {
  method: 'POST', headers: { Authorization: 'Bearer fixture-cron-secret-no-real-credentials', 'Content-Type': 'application/json' },
  body: JSON.stringify({ scheduledTime, runId: `${scheduledTime}:cron-tp-sl` }),
}));
if (disabled.status !== 503 || (await disabled.json()).error !== 'KEEPERS_DISABLED') throw new Error('Keeper disable guard failed');
console.log('Deno keeper bundle: unauthorized and disabled requests rejected before RPC or signing.');
