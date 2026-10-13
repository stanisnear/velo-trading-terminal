import test from 'node:test';
import assert from 'node:assert/strict';
import { keccak256 } from 'viem';
import { normalisePrice, triggerFor, scanIds } from '../supabase/functions/velo-keepers/math.js';
import { createKeepers } from '../supabase/functions/velo-keepers/bridge.js';
import { runKeeper } from '../supabase/functions/velo-keepers/engine.js';
import { withSigner } from '../supabase/functions/_shared/signer.js';
import { createSponsor } from '../supabase/functions/velo-api/sponsor.js';

const P = '0x' + '11'.repeat(20), Y = '0x' + '22'.repeat(20), FEED = '0x' + '33'.repeat(32);
const NOW = 1791876000000, TOKEN = 'fixture-only-not-a-real-secret-123456';
const job = 'cron-conditional-orders';
const input = { scheduledTime: NOW, runId: `${NOW}:${job}`, dryRun: true };
const settings = { CRON_SECRET: TOKEN, VITE_VELO_PERPS_V3_ADDRESS: P, PYTH_CONTRACT_ADDRESS: Y,
  VITE_PYTH_HERMES_URL: 'https://hermes.pyth.network', VELO_KEEPERS_ENABLED: 'true' };
const getEnv = key => settings[key];
const order = { owner: P, active: true, pairIndex: 0, triggerPrice_E18: 100n * 10n**18n, triggerKind: 0, isLong: true };

test('price scale and inclusive long/short limit/stop boundaries match the contract', () => {
  assert.equal(normalisePrice('12345', -2), 12345n*10n**16n);
  assert.equal(normalisePrice('12345', -20), 123n);
  assert.throws(() => normalisePrice('-1', -8));
  for (const isLong of [true,false]) for (const triggerKind of [0,1]) {
    const o = { ...order, isLong, triggerKind, triggerPrice_E18: 100n };
    assert.equal(triggerFor(job,o,100n),'ORDER');
    const below = triggerKind===0 ? isLong : !isLong;
    assert.equal(triggerFor(job,o,99n),below?'ORDER':null);
    assert.equal(triggerFor(job,o,101n),below?null:'ORDER');
  }
});
test('TP/SL handles both directions, unset triggers and exact liquidation threshold', () => {
  const p={isLong:true,takeProfit_E18:110n,stopLoss_E18:90n,entryPrice_E18:100n,collateralUSDC_6:1000000n,leverage:10n};
  assert.equal(triggerFor('cron-tp-sl',p,110n),'TP');
  assert.equal(triggerFor('cron-tp-sl',p,90n),'SL');
  assert.equal(triggerFor('cron-tp-sl',{...p,isLong:false,takeProfit_E18:90n,stopLoss_E18:110n},90n),'TP');
  assert.equal(triggerFor('cron-tp-sl',{...p,takeProfit_E18:0n,stopLoss_E18:0n},1n),null);
  assert.equal(triggerFor('cron-liquidate',p,91n,9000n),'LIQUIDATION');
  assert.equal(triggerFor('cron-liquidate',p,92n,9000n),null);
  assert.equal(triggerFor('cron-liquidate',{...p,isLong:false},109n,9000n),'LIQUIDATION');
});
test('large history stays bounded while oldest active and newest IDs remain eligible', () => {
  const s=scanIds({cursor:1,active:[4,5,999]},1000000);
  assert.equal(s.discovery.length,32); assert(s.ids.length<=72);
  for(const id of [4,5,999,999999,999992,1,32])assert(s.ids.includes(id));
  assert.throws(()=>scanIds({cursor:1,active:[]},Number.MAX_SAFE_INTEGER+1));
});

const request = (body=input, headers={}, search='') => new Request(`https://example.supabase.co/functions/v1/velo-keepers/api/${job}${search}`,
 {method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${TOKEN}`,...headers},body:JSON.stringify(body)});
test('keeper authentication rejects missing config, query secrets, stale run IDs and public GET', async () => {
  let called=0;const run=async()=>{called++;return {ok:true}};
  const serve=createKeepers({getEnv,run,now:()=>NOW});
  assert.equal((await createKeepers({getEnv:()=>undefined,run})(request())).status,503);
  assert.equal((await serve(request(input,{Authorization:'Bearer wrong'}))).status,401);
  assert.equal((await serve(request(input,{},'?secret=x'))).status,400);
  assert.equal((await serve(request({...input,scheduledTime:NOW-600000}))).status,400);
  assert.equal((await serve(new Request(`https://x/velo-keepers/api/${job}`))).status,405);
  assert.equal(called,0);
  assert.equal((await serve(request())).status,200);assert.equal(called,1);
});

function engineFixture(overrides={}) {
 const writes=[], calls=[];
 const db=async(action,p)=>{calls.push({action,p}); if(action==='claim_job')return{cursor:1,active:[],activeCount:0};return{saved:true};};
 const publicClient={
  getChainId:async()=>84532,
  readContract:async({functionName,args})=>{
   if(functionName==='VERSION')return 3;
   if(functionName==='PYTH')return Y;
   if(functionName==='nextOrderId')return 2n;
   if(functionName==='conditionalOrders')return order;
   if(functionName==='pairFeedId')return FEED;
   if(functionName==='getUpdateFee')return 7n;
   throw Error('Unexpected contract read');
  },
  simulateContract:async x=>{writes.push(x);return{request:x}},
  ...overrides,
 };
 const fetch=async()=>Response.json({binary:{data:['abcd']},parsed:[{id:FEED.slice(2),price:{price:'99',expo:0,publish_time:NOW/1000}}]});
 return {calls,writes,deps:{db,clients:{publicClient,account:{address:P}},now:()=>NOW,fetch,
  withSigner:async(_clients,action)=>action(async x=>{writes.push(x);return{hash:'0xabc',status:'success'}})}};
}
test('dry run scans and persists progress but never signs or simulates a transaction',async()=>{
 const f=engineFixture();const r=await runKeeper(job,input,getEnv,f.deps);
 assert.equal(r.ok,true);assert.equal(r.triggered,1);assert.equal(r.executed.length,0);assert.equal(f.writes.length,0);
 assert.equal(f.calls.find(c=>c.action==='save_scan').p.cursor,2);
});
test('execution reads exact Pyth fee, simulates and counts only confirmed success',async()=>{
 const f=engineFixture();const r=await runKeeper(job,{...input,dryRun:false},getEnv,f.deps);
 assert.equal(r.ok,true);assert.equal(r.executed.length,1);assert.equal(f.writes[0].value,7n);assert.equal(f.writes[1].value,7n);
 f.deps.withSigner=async()=>({hash:'0xabc',status:'reverted'});
 const reverted=await runKeeper(job,{...input,dryRun:false},getEnv,f.deps);
 assert.equal(reverted.ok,false);assert.equal(reverted.executed.length,0);
});
test('wrong chain, stale prices and failed reads cannot report a successful keeper run',async()=>{
 const wrong=engineFixture({getChainId:async()=>1});assert.equal((await runKeeper(job,input,getEnv,wrong.deps)).ok,false);
 const stale=engineFixture();stale.deps.fetch=async()=>Response.json({binary:{data:['abcd']},parsed:[{id:FEED.slice(2),price:{price:'99',expo:0,publish_time:NOW/1000-60}}]});
 assert.equal((await runKeeper(job,input,getEnv,stale.deps)).errors[0].code,'STALE_PRICE');
 const failed=engineFixture();const orig=failed.deps.clients.publicClient.readContract;
 failed.deps.clients.publicClient.readContract=async p=>{if(p.functionName==='conditionalOrders')throw Error();return orig(p)};
 assert.equal((await runKeeper(job,input,getEnv,failed.deps)).ok,false);
 assert.equal(failed.calls.find(c=>c.action==='save_scan').p.cursor,1);
});
test('duplicate delivery uses the saved result without RPC reads or transaction work',async()=>{
 const f=engineFixture({getChainId:async()=>{throw Error('must not execute')}});
 f.deps.db=async()=>({duplicate:true,result:{ok:true,executed:[]}});
 assert.equal((await runKeeper(job,input,getEnv,f.deps)).duplicate,true);
});

function signerFixture({pending=false,timeout=false,status='success',busy=false}={}){
 const events=[],raw='0x02',hash=keccak256(raw);
 const clients={db:async(action,p)=>{events.push(action);if(action==='claim_signer')return {busy,pendingHash:pending?hash:null,pendingRaw:pending?raw:null};return {saved:true}},
  account:{address:P,signTransaction:async()=>{events.push('sign');return raw}},
  walletClient:{prepareTransactionRequest:async x=>x},
  publicClient:{getChainId:async()=>84532,getTransactionCount:async()=>0,
   getTransactionReceipt:async()=>{throw Error('not mined')},
   sendRawTransaction:async()=>{events.push('broadcast');return hash},
   waitForTransactionReceipt:async()=>{events.push('receipt');if(timeout)throw Error('timeout');return {transactionHash:hash,status}}}};
 return{clients,events,hash};
}
test('signed bytes persist before broadcast and the receipt is checked before clearing state',async()=>{
 const f=signerFixture();const r=await withSigner(f.clients,send=>send({to:Y,value:1n}));
 assert.equal(r.status,'success');
 assert(f.events.indexOf('record_tx')<f.events.indexOf('broadcast'));
 assert(f.events.indexOf('receipt')<f.events.indexOf('clear_tx'));
 assert.equal(f.events.at(-1),'release_signer');
});
test('pending recovery completes before new work; timeout preserves pending state',async()=>{
 const f=signerFixture({pending:true});await withSigner(f.clients,async()=>{f.events.push('new-work')});
 assert(f.events.indexOf('clear_tx')<f.events.indexOf('new-work'));assert(!f.events.includes('sign'));
 const t=signerFixture({pending:true,timeout:true});let called=false;
 await assert.rejects(withSigner(t.clients,async()=>{called=true}),/TRANSACTION_PENDING/);
 assert.equal(called,false);assert(!t.events.includes('clear_tx'));assert.equal(t.events.at(-1),'release_signer');
});
test('busy wallet cannot sign; reverted and replaced receipts cannot claim success',async()=>{
 const b=signerFixture({busy:true});await assert.rejects(withSigner(b.clients,async()=>{throw Error('called')}),/SIGNER_BUSY/);
 const r=signerFixture({status:'reverted'});assert.equal((await withSigner(r.clients,send=>send({to:Y,value:1n}))).status,'reverted');
 const replaced=signerFixture();replaced.clients.publicClient.waitForTransactionReceipt=async()=>({status:'success',transactionHash:'0x'+'ff'.repeat(32)});
 await assert.rejects(withSigner(replaced.clients,send=>send({to:Y,value:1n})),/TRANSACTION_REPLACED/);
 assert(!replaced.events.includes('clear_tx'));
});
test('sponsor checks funding under the same lock and enforces durable rate limits',async()=>{
 const res={status(n){this.code=n;return this},json(v){this.data=v;return this},setHeader(){return this}};
 const deps={clients:{publicClient:{getBalance:async()=>0n}},db:async()=>({allowed:false}),withSigner:async(_,action)=>action(async()=>{throw Error('must not send')})};
 const sponsor=createSponsor(k=>k==='VELO_SPONSOR_ENABLED'?'true':undefined,deps);
 await sponsor({method:'POST',body:{burnerAddress:P}},res);assert.equal(res.code,429);
 deps.clients.publicClient.getBalance=async()=>10000000000000000n;
 await sponsor({method:'POST',body:{burnerAddress:P}},res);assert.equal(res.code,200);assert.equal(res.data.sponsored,false);
});
