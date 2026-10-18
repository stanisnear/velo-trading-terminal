import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { tokenStatus } from '../supabase/functions/_shared/auth.js';
import { latestPythUpdate } from '../supabase/functions/_shared/pyth.js';
import { createApi } from '../supabase/functions/velo-api/bridge.js';
import { createKeepers } from '../supabase/functions/velo-keepers/bridge.js';

const token = 'test-only-token-not-an-actual-secret-'.repeat(2);
const other = 'other-test-only-token-not-a-secret-'.repeat(2);
const digest = value => createHash('sha256').update(value).digest('hex');
const hash = digest(token);
test('public hash verifies only the original token, and explicit secrets override it', async () => {
  assert.equal(await tokenStatus(token, undefined, hash), 0);
  for (const wrong of [hash, other, undefined, '', 'a'.repeat(513)]) {
    assert.equal(await tokenStatus(wrong, undefined, hash), 401);
  }
  assert.equal(await tokenStatus(token, other, hash), 401);
  assert.equal(await tokenStatus(other, other, hash), 0);
  for (const invalid of ['', 'short']) assert.equal(await tokenStatus(token, invalid, hash), 503);
  for (const invalid of [undefined, 'bad', 'a'.repeat(65)]) assert.equal(await tokenStatus(token, undefined, invalid), 503);
});
test('API and keeper verifiers keep their credentials separate and authenticate before work', async () => {
  let calls=0;
  const api=createApi({getEnv:()=>undefined,tokenHash:hash,loaders:{'user-stats':async()=>({default(_q,r){calls++;r.json({ok:true});}})}});
  for (const [value,status] of [[token,200],[other,401],[hash,401]]) {
    assert.equal((await api(new Request('https://x/velo-api/api/user-stats',{headers:{'x-velo-proxy-token':value}}))).status,status);
  }
  const now=Date.now(),job='cron-tp-sl';
  const keepers=createKeepers({getEnv:()=>undefined,tokenHash:digest(other),now:()=>now,run:async()=>{calls++;return{ok:true}}});
  for (const [value,status] of [[other,200],[token,401],[digest(other),401]]) {
    const req=new Request(`https://x/velo-keepers/api/${job}`,{method:'POST',headers:{Authorization:`Bearer ${value}`,'Content-Type':'application/json'},body:JSON.stringify({scheduledTime:now,runId:`${now}:${job}`,dryRun:true})});
    assert.equal((await keepers(req)).status,status);
  }
  assert.equal(calls,2);
});

const feed='0x'+'33'.repeat(32),key='fixture-private-pyth-key';
const env={VITE_PYTH_HERMES_URL:'https://hermes.pyth.network',PYTH_API_KEY:key};
test('Pyth key is sent only in a header to an approved origin with redirects disabled',async()=>{
  for (const base of ['https://hermes.pyth.network','https://pyth.dourolabs.app/hermes']) {
    const result=await latestPythUpdate(feed,n=>({...env,VITE_PYTH_HERMES_URL:base})[n],async(url,options)=>{
      assert(!String(url).includes(key));assert.equal(options.headers.Authorization,`Bearer ${key}`);
      assert.equal(options.redirect,'error');assert.equal(url.searchParams.get('ids[]'),feed.slice(2));
      return Response.json({parsed:[]});
    });
    assert.deepEqual(result,{parsed:[]});
  }
});
test('missing Pyth key and substituted hosts fail before a network request',async()=>{
  let calls=0;const fetch=async()=>{calls++;return Response.json({});};
  await assert.rejects(latestPythUpdate(feed,n=>n==='VITE_PYTH_HERMES_URL'?env[n]:undefined,fetch),{code:'PYTH_API_KEY_MISSING'});
  for(const base of ['https://attacker.invalid','https://hermes.pyth.network.evil.invalid','https://hermes.pyth.network/redirect','https://hermes.pyth.network?token=hidden']) {
    await assert.rejects(latestPythUpdate(feed,n=>({...env,VITE_PYTH_HERMES_URL:base})[n],fetch));
  }
  assert.equal(calls,0);
});
test('Pyth failures expose fixed codes without provider bodies or key values',async()=>{
  for(const [status,code] of [[401,'PYTH_AUTH_FAILED'],[403,'PYTH_AUTH_FAILED'],[429,'PYTH_RATE_LIMITED'],[500,'PYTH_UNAVAILABLE']]) {
    await assert.rejects(latestPythUpdate(feed,n=>env[n],async()=>new Response(key,{status})),{code});
  }
  await assert.rejects(latestPythUpdate(feed,n=>env[n],async()=>{throw Error(key)}),{message:'PYTH_UNAVAILABLE'});
  await assert.rejects(latestPythUpdate(feed,n=>env[n],async()=>new Response('a'.repeat(262145))),{code:'RESPONSE_TOO_LARGE'});
});
