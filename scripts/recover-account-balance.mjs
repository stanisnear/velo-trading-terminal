// Revalue evidence at archive block state. Never relabel unrealized-equity data.
import { readFileSync,writeFileSync } from 'node:fs';
import { createPublicClient,http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { balanceCheckpoint,reconcileReceipt } from '../supabase/functions/velo-keepers/reconciliation.js';
const [input,output]=process.argv.slice(2);
if(!input||!output)throw Error('Usage: node scripts/recover-account-balance.mjs EVIDENCE_JSON OUTPUT_JSON');
const evidence=JSON.parse(readFileSync(input));
const engine='0xe9aecfbc5814ce3b2db0107594d80f054e6db52f';
const client=createPublicClient({chain:baseSepolia,transport:http(process.env.BALANCE_ARCHIVE_RPC||'https://base-sepolia-rpc.publicnode.com',{timeout:12000,retryCount:1})});
const wallets=[...new Set(evidence.checkpoints.map(p=>p.trader))];
const payloads=[],failed=[];
for(const point of [...evidence.checkpoints,...wallets.map(trader=>({trader,block:'latest',hash:null}))]){
 try{
  const block=await client.getBlock(point.block==='latest'?{}:{blockNumber:BigInt(point.block)});
  const balance=await balanceCheckpoint(client,engine,point.trader,block);
  payloads.push({engine,hash:point.hash,accounts:[{trader:point.trader,history:[],closes:[],balance}]});
 }catch{failed.push({block:point.block,trader:point.trader});}
}
for(const hash of evidence.transactions||[]){
 try{await reconcileReceipt({client,perps:engine,hash,store:async(action,p)=>{
  if(action==='profiles')return p.traders.filter(t=>wallets.includes(t));
  if(action==='apply')payloads.push(p);
 }});}catch{failed.push({hash});}
}
writeFileSync(output,JSON.stringify({payloads,failed}));
console.log(JSON.stringify({verified:payloads.length,failed:failed.length}));
