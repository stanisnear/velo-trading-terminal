import { createPublicClient, http, decodeEventLog, erc20Abi } from 'viem';
import { baseSepolia } from 'viem/chains';
import { boundedJson } from '../_shared/runtime.js';
import { VELO_PERPS_V4_ABI as abi } from './generated/abi.js';
import { decodeConfirmedClose, tradeEventId } from '../../../src/services/tradeReceipts.ts';
import { V4_TRADING_MARKETS } from '../../../shared/markets.mjs';

const ENGINE = '0xe9aecfbc5814ce3b2db0107594d80f054e6db52f';
const TOKEN = '0x5efaf3f69b09bc2abf3439bdc0c93bf611026699';
const ZERO = '0x' + '0'.repeat(40);
const archiveClient = () => createPublicClient({ chain:baseSepolia,
  transport:http('https://base-sepolia-rpc.publicnode.com',{timeout:10000,retryCount:1}) });
const same = (a,b) => a?.toLowerCase() === b?.toLowerCase();

export function receiptStore(getEnv, fetchImpl = fetch) {
  const url=getEnv('SUPABASE_URL'),key=getEnv('SUPABASE_SERVICE_ROLE_KEY');
  if(url!=='https://btgfoekgvyvdflzjfehz.supabase.co'||!key)throw Error('Receipt store unavailable');
  return async(action,p)=>boundedJson(await fetchImpl(`${url}/rest/v1/rpc/velo_reconcile`,{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
    headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
    body:JSON.stringify({p_action:action,p}),
  }));
}

// Archive reads all share one block, including cash and refundable escrow.
// No current quote or historical price approximation enters a balance sample.
export async function balanceCheckpoint(client, perps, trader, block, token=TOKEN) {
  const read=(functionName,args=[])=>client.readContract({address:perps,abi,functionName,args,blockNumber:block.number});
  const [cash,ids,orders]=await Promise.all([
    client.readContract({address:token,abi:erc20Abi,functionName:'balanceOf',args:[trader],blockNumber:block.number}),
    read('getTraderTrades',[trader]),read('getTraderOrders',[trader]),
  ]);
  let amount=cash;
  for(const id of ids){
    const p=await read('getPosition',[id]);
    if(!same(p.owner,trader))throw Error('Invalid position ownership');
    amount+=p.collateralUSDC_6;
  }
  for(const id of orders){
    const o=await read('conditionalOrders',[id]);
    // Multiple ABI outputs decode as a tuple; getPosition returns one struct.
    if(!same(o.owner??o[0],trader)||!(o.active??o[11]))throw Error('Invalid escrow ownership');
    amount+=o.collateralUSDC_6??o[8];
  }
  return {timestamp:Number(block.timestamp)*1000,value:Number(amount)/1e6,
    blockNumber:String(block.number),blockHash:block.hash};
}

export async function reconcileReceipt({client,perps=ENGINE,hash,store}) {
  const receipt=await client.getTransactionReceipt({hash});
  if(receipt.status!=='success'||!same(receipt.transactionHash,hash))throw Error('Invalid receipt');
  const block=await client.getBlock({blockNumber:receipt.blockNumber});
  if(!same(block.hash,receipt.blockHash))throw Error('Receipt block changed');
  const events=receipt.logs.flatMap(log=>{
    if(!same(log.address,perps))return [];
    try{return [{...decodeEventLog({abi,data:log.data,topics:log.topics}),log}];}catch{return [];}
  });
  const traders=new Set(events.map(e=>e.args.trader).filter(Boolean).map(a=>a.toLowerCase()));
  // Collateral transfers outside the engine are indexed too (faucet/send/withdraw).
  for(const log of receipt.logs){
    if(!same(log.address,TOKEN))continue;
    try{
      const event=decodeEventLog({abi:erc20Abi,data:log.data,topics:log.topics});
      if(event.eventName==='Transfer')for(const address of [event.args.from,event.args.to])
        if(!same(address,ZERO)&&!same(address,perps))traders.add(address.toLowerCase());
    }catch{/* Ignore token events other than Transfer. */}
  }
  const accounts=[];
  const registered=await store('profiles',{engine:perps,traders:[...traders]});
  for(const trader of registered){
    const history=[],closes=[];
    for(const event of events.filter(e=>same(e.args.trader,trader))){
      if(!['PositionOpened','PositionClosed'].includes(event.eventName))continue;
      const a=event.args,market=V4_TRADING_MARKETS.find(m=>m.contractIndex===Number(a.pairIndex));
      if(!market)throw Error('Unknown receipt market');
      const opened=events.find(e=>e.eventName==='PositionOpened'&&e.args.tradeId===a.tradeId);
      let p;
      if(event.eventName==='PositionOpened'||opened){
        const terms=(opened??event).args;
        p={...terms,owner:trader,openedAt:block.timestamp,
          originalNotional_6:terms.collateralUSDC_6*BigInt(terms.leverage)};
      }else{
        p=await client.readContract({address:perps,abi,functionName:'getPosition',args:[a.tradeId],blockNumber:block.number-1n});
        if(!same(p.owner,trader))throw Error('Settlement opening state unavailable');
      }
      const close=event.eventName==='PositionClosed'?decodeConfirmedClose(receipt,perps,a.tradeId,trader):null;
      const time=Number(block.timestamp)*1000;
      history.push({id:tradeEventId(perps,hash,event.log.logIndex),pair:market.id,side:p.isLong?'LONG':'SHORT',
        entry_price:Number(p.entryPrice_E18)/1e18,exit_price:close?.exitPrice??null,
        size:Number(p.originalNotional_6)/1e6,pnl:close?.pnlUSDC??null,action:close?.action??'OPEN',
        leverage:Number(p.leverage),created_at:new Date(time).toISOString(),opened_at:new Date(Number(p.openedAt)*1000).toISOString(),
        velo_trade_id:String(a.tradeId),open_tx_hash:event.eventName==='PositionOpened'||opened?hash:null,
        close_tx_hash:close?hash:null,log_index:event.log.logIndex});
      if(close){
        const margin=close.payoutUSDC-close.pnlUSDC;
        closes.push({tradeId:String(a.tradeId),action:close.action,closedAt:time,pnl:close.pnlUSDC,
          pnlPct:margin>0?close.pnlUSDC/margin*100:0,collateral:margin,exitPrice:close.exitPrice,
          notificationId:tradeEventId(perps,hash,event.log.logIndex+1000000),
          message:`${market.id} ${p.isLong?'long':'short'} ${close.action==='LIQUIDATION'?'was liquidated':'closed'}. Realized PnL: ${close.pnlUSDC<0?'−':'+'}$${Math.abs(close.pnlUSDC).toFixed(2)}.`});
      }
    }
    accounts.push({trader,history,closes,balance:await balanceCheckpoint(client,perps,trader,block)});
  }
  // History, live post status, notifications, balance and acknowledgement are atomic.
  await store('apply',{engine:perps,hash,accounts});
  return accounts.length;
}

// Every scheduled liquidation run also indexes receipts, even when oracle reads
// fail. Cursor advancement and queue insertion commit together; failures retry.
export async function reconcileEngine(getEnv,{store=receiptStore(getEnv),client=archiveClient(),now=Date.now}={}) {
  const perps=getEnv('VITE_VELO_PERPS_V4_ADDRESS')?.toLowerCase();
  if(perps!==ENGINE)throw Error('Reconciliation engine not configured');
  const started=now(),owner=crypto.randomUUID();
  const head=(await client.getBlockNumber())-3n;
  const state=await store('begin',{engine:perps,head:String(head),owner});
  if(state.busy)return {busy:true};
  const result={scanned:0,synced:0,failed:0};
  try{
    const ingest=async(from,to,cursor)=>{
      if(from>to)return;
      const logs=await client.getLogs({address:perps,fromBlock:from,toBlock:to});
      const transfers=await client.getLogs({address:TOKEN,event:erc20Abi.find(e=>e.type==='event'&&e.name==='Transfer'),fromBlock:from,toBlock:to});
      const receipts=[...new Map([...logs,...transfers].filter(l=>!l.removed).map(l=>[l.transactionHash,{hash:l.transactionHash,block:String(l.blockNumber)}])).values()];
      await store('ingest',{engine:perps,owner,receipts,...cursor});result.scanned+=receipts.length;
    };
    const from=BigInt(state.next),to=from+49999n<head?from+49999n:head;
    await ingest(from,to,{next:String(to+1n)});
    if(now()-started<20000&&BigInt(state.backfill)<BigInt(state.backfillEnd)){
      const start=BigInt(state.backfill),end=start+49999n<BigInt(state.backfillEnd)?start+49999n:BigInt(state.backfillEnd)-1n;
      await ingest(start,end,{backfill:String(end+1n)});
    }
    const jobs=await store('claim',{engine:perps});
    for(const job of jobs){
      if(now()-started>65000)break; // Unprocessed leases expire and remain queued.
      try{await reconcileReceipt({client,perps,hash:job.hash,store});result.synced++;}
      catch{await store('retry',{engine:perps,hash:job.hash,error:'RECEIPT_SYNC_FAILED'});result.failed++;}
    }
    return result;
  }finally{await store('release',{engine:perps,owner});}
}
