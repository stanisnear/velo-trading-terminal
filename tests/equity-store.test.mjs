import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

test('shared equity loads beyond the API page cap and never returns an incomplete archive',async()=>{
 const dir=await mkdtemp(path.join(process.cwd(),'audit/equity-store-'));
 const file=path.join(dir,'store.mjs');
 const rows=Array.from({length:1201},(_,i)=>({observed_at:new Date(1700000000000+i*300000).toISOString(),equity:String(100+i)}));
 let failAt=-1;
 const ranges=[],writes=[];
 globalThis.__equityClient={
  rpc(name,args){assert.equal(name,'get_account_equity_history');assert.equal(args.p_trader_address,'wallet');return {async range(from,to){ranges.push([from,to]);return from===failAt?{error:new Error('Network unavailable')}:{data:rows.slice(from,to+1)};}};},
  from(name){assert.equal(name,'account_equity_snapshots');return {async upsert(data,options){writes.push({data,options});return {error:null};}};},
 };
 try{
  await build({entryPoints:['src/services/equityStore.ts'],outfile:file,bundle:true,platform:'node',format:'esm',plugins:[{name:'account-store-fixture',setup(b){b.onResolve({filter:/supabaseStore$/},()=>({path:'client',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const supabase=globalThis.__equityClient;',loader:'js'}));}}]});
  const {equityStore}=await import(pathToFileURL(file));
  const points=await equityStore.load('owner','WALLET','ENGINE');
  assert.equal(points.length,1201);assert.deepEqual(ranges,[[0,499],[500,999],[1000,1499]]);
  assert.equal(points.at(-1).value,1300);assert.equal(points[0].timestamp,Date.parse(rows[0].observed_at));
  failAt=500;await assert.rejects(equityStore.load('owner','wallet','engine'),/Network unavailable/);
  await equityStore.save('owner','WALLET','ENGINE',[...points,{...points[0],value:150,valuationVersion:2},{timestamp:NaN,value:1}]);
  assert.deepEqual(writes.map(w=>w.data.length),[250,250,250,250,201]);
  const first=writes[0];assert.equal(first.data[0].user_id,'owner');assert.equal(first.data[0].trader_address,'wallet');assert.equal(first.data[0].valuation_version,2);
  assert.equal(first.data[0].equity,150);assert.equal(first.data[0].source,'observed');
  assert.equal(Date.parse(first.data[0].bucket_at)%300000,0);
  assert.equal(first.options.ignoreDuplicates,true,'browser writes cannot overwrite a verified checkpoint');
 }finally{delete globalThis.__equityClient;await rm(dir,{recursive:true,force:true});}
});
