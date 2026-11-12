import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeEventTopics,encodeAbiParameters } from 'viem';
import { VELO_PERPS_V4_ABI as abi } from '../supabase/functions/velo-keepers/generated/abi.js';
import { balanceCheckpoint,reconcileReceipt,reconcileEngine } from '../supabase/functions/velo-keepers/reconciliation.js';

const engine='0xe9aecfbc5814ce3b2db0107594d80f054e6db52f',owner='0x'+'11'.repeat(20);
const hash='0x'+'ab'.repeat(32),blockHash='0x'+'cd'.repeat(32);
const block={number:56445514n,timestamp:1794210971n,hash:blockHash};
const position={owner,pairIndex:20,isLong:true,leverage:10,openedAt:1793094968n,
 entryPrice_E18:77578052090862880000n,originalNotional_6:21457685700n,collateralUSDC_6:2145768570n};
function log(name,args,values,index){const event=abi.find(e=>e.type==='event'&&e.name===name);return {
 address:engine,logIndex:index,topics:encodeEventTopics({abi,eventName:name,args}),
 data:encodeAbiParameters(event.inputs.filter(i=>!i.indexed),values)};}
function fixture(logs){
 const applied=[],reads=[];
 const client={getTransactionReceipt:async()=>({status:'success',transactionHash:hash,blockNumber:block.number,blockHash,logs}),
  getBlock:async()=>block,readContract:async(a)=>{reads.push(a);switch(a.functionName){
   case 'balanceOf':return 400000000n;case 'getTraderTrades':return a.blockNumber===block.number?[]:[15n];
   case 'getTraderOrders':return [1n];case 'conditionalOrders':return [owner,0,false,0,false,0,0,0n,20000000n,1,0n,true];
   case 'getPosition':return position;default:throw Error(a.functionName);
  }}};
 const store=async(action,p)=>{if(action==='profiles')return [owner];if(action==='apply')applied.push(p);return {saved:true};};
 return {client,store,applied,reads};
}
test('an offline liquidation is one atomic history, social status, notification and book-balance write',async()=>{
 const f=fixture([
  log('PositionClosed',{tradeId:15n,trader:owner,pairIndex:20},[72513728604702080000n,-2119816536n,47626464n,21457685n],40),
  log('PositionLiquidated',{tradeId:15n,trader:owner,liquidator:owner},[72513728604702080000n,10728842n],42),
 ]);
 await reconcileReceipt({...f,perps:engine,hash});
 assert.equal(f.applied.length,1);
 const account=f.applied[0].accounts[0];
 assert.equal(account.history[0].action,'LIQUIDATION');assert.equal(account.history[0].pnl,-2119.816536);
 assert.equal(account.closes[0].tradeId,'15');assert.equal(account.closes[0].closedAt,1794210971000);
 assert.equal(account.balance.value,420,'no realized PnL is added to cash twice');
 assert(f.reads.every(r=>r.blockNumber===block.number||r.functionName==='getPosition'&&r.blockNumber===block.number-1n));
 await reconcileReceipt({...f,perps:engine,hash});
 assert.equal(f.applied[1].accounts[0].history[0].id,account.history[0].id,'retries retain canonical identity');
});
test('conditional fills create opening history without a browser; archive errors never acknowledge a job',async()=>{
 const f=fixture([log('PositionOpened',{tradeId:16n,trader:owner,pairIndex:20},[true,10,0,100000000n,80n*10n**18n],12)]);
 await reconcileReceipt({...f,perps:engine,hash});
 assert.equal(f.applied[0].accounts[0].history[0].action,'OPEN');
 assert.equal(f.applied[0].accounts[0].history[0].size,1000);
 f.client.readContract=async()=>{throw Error('RPC unavailable');};
 await assert.rejects(reconcileReceipt({...f,perps:engine,hash}),/RPC unavailable/);
 assert.equal(f.applied.length,1);
 f.client.getTransactionReceipt=async()=>({status:'reverted'});
 await assert.rejects(reconcileReceipt({...f,perps:engine,hash}),/Invalid receipt/);
});
test('book checkpoints fail closed on inconsistent ownership',async()=>{
 const f=fixture([]);
 f.client.readContract=async({functionName})=>functionName==='balanceOf'?100n:functionName==='getTraderTrades'?[1n]:functionName==='getTraderOrders'?[]:{...position,owner:engine};
 await assert.rejects(balanceCheckpoint(f.client,engine,owner,block),/ownership/);
});
test('an entry and close in separate transactions of one block recover the opening terms',async()=>{
 const close=log('PositionClosed',{tradeId:16n,trader:owner,pairIndex:20},[80n*10n**18n,-1000000n,99000000n,1000000n],30);
 const f=fixture([close]),read=f.client.readContract;
 f.client.readContract=async(a)=>a.functionName==='getPosition'?{owner:'0x'+'00'.repeat(20)}:read(a);
 const opening={removed:false,blockHash,logIndex:10,args:{tradeId:16n,trader:owner,pairIndex:20,
  isLong:true,leverage:10,entryPrice_E18:80n*10n**18n,collateralUSDC_6:99000000n}};
 f.client.getLogs=async(q)=>{assert.equal(q.fromBlock,block.number);assert.equal(q.toBlock,block.number);return [opening];};
 await reconcileReceipt({...f,perps:engine,hash});
 assert.equal(f.applied[0].accounts[0].history[0].size,990);
 assert.equal(f.applied[0].accounts[0].history[0].pnl,-1);
 for(const invalid of [{...opening,logIndex:40},{...opening,blockHash:hash},{...opening,removed:true}]){
  f.client.getLogs=async()=>[invalid];
  await assert.rejects(reconcileReceipt({...f,perps:engine,hash}),/opening state unavailable/);
 }
 assert.equal(f.applied.length,1,'unverified opening terms never acknowledge a settlement');
});
test('indexer never skips failed ingestion and retains failed jobs for retry',async()=>{
 let failIngest=true;const calls=[];
 const client={getBlockNumber:async()=>56500000n,getLogs:async()=>[],getTransactionReceipt:async()=>{throw Error('RPC unavailable');}};
 const store=async(a,p)=>{calls.push({a,p});if(a==='begin')return{next:56490000,backfill:48312993,backfillEnd:56490000};
  if(a==='ingest'&&failIngest)throw Error('Database unavailable');if(a==='claim')return[{hash}];return{};};
 const env=k=>k==='VITE_VELO_PERPS_V4_ADDRESS'?engine:undefined;
 await assert.rejects(reconcileEngine(env,{store,client}),/Database unavailable/);
 assert.equal(calls.at(-1).a,'release');assert(!calls.some(c=>c.a==='claim'));
 failIngest=false;const result=await reconcileEngine(env,{store,client});
 assert.equal(result.failed,1);assert.equal(result.synced,0);assert(calls.some(c=>c.a==='retry'&&c.p.hash===hash));
 assert(!calls.some(c=>c.a==='apply'));
});
