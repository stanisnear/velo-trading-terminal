import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeEventTopics, encodeAbiParameters, parseAbi } from 'viem';
import { persistKeeperSettlement } from '../supabase/functions/velo-keepers/settlement.js';

const perps='0xe9aecfbc5814ce3b2db0107594d80f054e6db52f',owner='0x'+'11'.repeat(20),hash='0x'+'ab'.repeat(32);
const abi=parseAbi([
 'event PositionClosed(uint256 indexed tradeId,address indexed trader,uint16 indexed pairIndex,uint128 exitPrice_E18,int256 pnlUSDC_6,uint64 payoutUSDC_6,uint64 feeUSDC_6)',
 'event PositionLiquidated(uint256 indexed tradeId,address indexed trader,address indexed liquidator,uint128 exitPrice_E18,uint64 bountyUSDC_6)',
]);
const closed={address:perps,logIndex:40,topics:encodeEventTopics({abi,eventName:'PositionClosed',args:{tradeId:15n,trader:owner,pairIndex:20}}),
 data:encodeAbiParameters(abi[0].inputs.filter(i=>!i.indexed),[72513728604702080000n,-2119816536n,47626464n,21457685n])};
const liquidated={address:perps,logIndex:42,topics:encodeEventTopics({abi,eventName:'PositionLiquidated',args:{tradeId:15n,trader:owner,liquidator:owner}}),
 data:encodeAbiParameters(abi[1].inputs.filter(i=>!i.indexed),[72513728604702080000n,10728842n])};
const position={owner,pairIndex:20,isLong:true,leverage:10,openedAt:1793094968n,entryPrice_E18:77578052090862880000n,originalNotional_6:21457685700n};
const snapshot={contract:perps,trader:owner,tradeId:'15',updateMode:'live',status:'OPEN',pnl:4931,pnlPct:227};

function fixture({fail=false}={}) {
 const writes=[];
 const admin={from(table){let action='read',value;const q={
  select(){return q;},eq(){return q;},ilike(){return q;},gte(){return q;},lte(){return q;},order(){return q;},limit(){return q;},maybeSingle(){return q;},
  update(v){action='update';value=v;return q;},upsert(v,options){action='upsert';value=v;assert.equal(options.ignoreDuplicates,true);return q;},
  then(resolve,reject){
   if(action!=='read'){writes.push({table,action,value});return Promise.resolve({error:fail?{message:'offline'}:null}).then(resolve,reject);}
   const data=table==='profiles'?{id:'profile'}:table==='trade_history'?{id:'opening',open_tx_hash:hash}:[
    {id:'live',trade_snapshot:snapshot},{id:'freeze',trade_snapshot:{...snapshot,onClose:'freeze'}},
    {id:'fixed',trade_snapshot:{...snapshot,updateMode:'snapshot'}},{id:'other-engine',trade_snapshot:{...snapshot,contract:owner}},
   ];return Promise.resolve({data,error:null}).then(resolve,reject);
  },
 };return q;}};
 const publicClient={getTransactionReceipt:async()=>({status:'success',transactionHash:hash,blockNumber:56445514n,logs:[closed,liquidated]}),getBlock:async()=>({timestamp:1794210971n})};
 return {writes,admin,publicClient};
}
test('keeper settlements persist exact liquidation PnL, chain time, identity and live-post outcome without a browser',async()=>{
 const f=fixture();
 await persistKeeperSettlement({...f,perps,tradeId:15,position,hash});
 const history=f.writes.find(w=>w.action==='upsert').value;
 assert.equal(history.action,'LIQUIDATION');assert.equal(history.pnl,-2119.816536);assert.equal(history.created_at,'2026-11-09T07:56:11.000Z');
 assert.equal(history.velo_trade_id,'15');assert.equal(history.close_tx_hash,hash);assert.equal(history.size,21457.6857);
 const posts=f.writes.filter(w=>w.table==='posts').map(w=>w.value.trade_snapshot);
 assert.equal(posts.length,2,'fixed snapshots and other engines are untouched');
 assert.equal(posts[0].status,'LIQUIDATED');assert.equal(posts[0].pnl,-2119.816536);assert.equal(posts[0].closedAt,1794210971000);assert.equal(posts[0].closeTxHash,hash);
 assert.equal(posts[1].pnl,4931);assert.equal(posts[1].closedSnapshot,true);assert.equal(posts[1].status,'LIQUIDATED');
 await persistKeeperSettlement({...f,perps,tradeId:15,position,hash});
 assert.equal(f.writes.filter(w=>w.action==='upsert')[1].value.id,history.id,'retry uses the same event identity');
});
test('a reverted receipt or persistence failure cannot report a saved settlement',async()=>{
 const f=fixture({fail:true});
 await assert.rejects(persistKeeperSettlement({...f,perps,tradeId:15,position,hash}),/persistence failed/);
 f.publicClient.getTransactionReceipt=async()=>({status:'reverted',logs:[]});
 await assert.rejects(persistKeeperSettlement({...f,perps,tradeId:15,position,hash}),/reverted/);
});
