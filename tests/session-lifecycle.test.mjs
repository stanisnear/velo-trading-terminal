import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { canRestoreCachedProfile, createDeferredAuthListener, sessionTimeLeft, IDLE_TIMEOUT_MS, SESSION_MAX_MS, boundedFetch } from '../src/services/sessionLifecycle.mjs';

test('mobile refresh restores only the persisted authenticated account and respects logout and expiry', () => {
  const now = 1000000, profile = {id:'owner',_cachedAt:now}, auth = {user:{id:'owner'},refresh_token:'fixture'};
  assert.equal(canRestoreCachedProfile(profile,auth,false,now,now),true);
  assert.equal(canRestoreCachedProfile(profile,{...auth,user:{id:'other'}},false,now,now),false);
  assert.equal(canRestoreCachedProfile(profile,auth,true,now,now),false);
  assert.equal(canRestoreCachedProfile(profile,null,false,now,now),false);
  assert.equal(canRestoreCachedProfile(profile,auth,false,now+SESSION_MAX_MS+1,now),false);
});

const deadline = (promise, ms=2000) => {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer=setTimeout(() => reject(new Error('Auth lock did not release')),ms); })]).finally(() => clearTimeout(timer));
};
test('auth event can read the same Supabase client without blocking later reads', async () => {
  const client=createClient('https://fixture.supabase.co','public-test-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'fixture-session'}});
  let resolve, reject;
  const complete=new Promise((yes,no)=>{resolve=yes;reject=no;});
  const listener=createDeferredAuthListener(async (event)=>{
    if(event !== 'INITIAL_SESSION') return;
    const {data,error}=await client.auth.getSession();
    assert.equal(error,null); assert.equal(data.session,null); resolve();
  },reject);
  const {data:{subscription}}=client.auth.onAuthStateChange(listener.callback);
  try { await deadline(complete); await deadline(client.auth.getSession()); }
  finally { listener.cancel(); subscription.unsubscribe(); client.auth.stopAutoRefresh(); }
});
test('deferred auth work is cancelled on teardown', async () => {
  let calls=0;const listener=createDeferredAuthListener(()=>{calls++;});
  assert.equal(listener.callback('SIGNED_IN',{}),undefined);listener.cancel();
  await new Promise(r=>setTimeout(r,10));assert.equal(calls,0);
});
test('idle and absolute session expiry remain effective after tab suspension',()=>{
  const started=100000;
  assert.equal(sessionTimeLeft(started,started,started),IDLE_TIMEOUT_MS);
  assert.equal(sessionTimeLeft(started+IDLE_TIMEOUT_MS+1,started,started),0);
  assert.equal(sessionTimeLeft(started+SESSION_MAX_MS+1,started+SESSION_MAX_MS,started),0);
  assert.equal(sessionTimeLeft(started+900000,started+900000,started),IDLE_TIMEOUT_MS);
});
test('bounded fetch aborts stalled requests and preserves caller cancellation',async()=>{
  const real=globalThis.fetch;
  globalThis.fetch=async (_url,{signal})=>new Promise((_,reject)=>{
    if(signal.aborted) reject(signal.reason);
    else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
  });
  try {
    await assert.rejects(boundedFetch('https://fixture.invalid',{},10),{name:'TimeoutError'});
    const controller=new AbortController();controller.abort();
    await assert.rejects(boundedFetch('https://fixture.invalid',{signal:controller.signal},100),{name:'AbortError'});
  } finally { globalThis.fetch=real; }
});
test('mobile connector reconnect cannot arm sign-in; only a recent explicit account choice can',async()=>{
 const {hasWalletSignInIntent}=await import('../src/services/sessionLifecycle.mjs');
 const now=1_000_000;
 for(const connectionStatus of ['reconnecting','connecting','connected']) assert.equal(hasWalletSignInIntent(0,now),false,connectionStatus);
 assert.equal(hasWalletSignInIntent(now,now+60_000),true);
 assert.equal(hasWalletSignInIntent(now,now+300_001),false);
 assert.equal(hasWalletSignInIntent(now,now-1),false);
});
