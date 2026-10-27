import { createPublicClient, decodeEventLog, http, parseAbiItem, type Address, type Hex } from 'viem';
import { baseSepolia } from 'viem/chains';
import { baseSepoliaTransport } from './baseTransport.mjs';
import { VELO_PERPS_V4_ABI } from './veloPerpsV4Abi';
import { V4_TRADING_MARKETS } from '../../shared/markets.mjs';
import { decodeConfirmedClose } from './tradeReceipts';
import type { TradeShare } from '../utils/tradeShare';

export const SHARED_ENGINE = '0xe9aecfbc5814ce3b2db0107594d80f054e6db52f';
const closeEvent = parseAbiItem('event PositionClosed(uint256 indexed tradeId,address indexed trader,uint16 indexed pairIndex,uint128 exitPrice_E18,int256 pnlUSDC_6,uint64 payoutUSDC_6,uint64 feeUSDC_6)');
const client = createPublicClient({ chain: baseSepolia, transport: baseSepoliaTransport() });
// The primary RPC limits eth_getLogs to 200 blocks. Wider settlement scans use
// the existing public backup as a read-only history source; trading is unchanged.
const historyClient = createPublicClient({ chain: baseSepolia, transport: http('https://base-sepolia-rpc.publicnode.com',{timeout:6000,retryCount:0}) });
const positionLogs = (query: any, rpc: any) => rpc === client && query.toBlock - query.fromBlock > 180n ? historyClient.getLogs(query) : rpc.getLogs(query);
const scanCursor = new Map<string, bigint>();
const openEvent = VELO_PERPS_V4_ABI.find(event => event.type === 'event' && event.name === 'PositionOpened')!;
export type PositionEvidence = { openTxHash?: string; closeTxHash?: string; openedAt?: number; closedAt?: number; opening?: Pick<TradeShare,'pair'|'side'|'leverage'|'entryPrice'|'size'> };
const evidenceCache = new Map<string, { at: number; promise: Promise<PositionEvidence> }>();
// Receipt lookups run on demand in the details dialog, never for every feed tick.
export async function readPositionEvidence(data: TradeShare, rpc: any = client): Promise<PositionEvidence> {
  if (!hasPositionReference(data) || !data.tradeId) return {};
  const key = `${data.tradeId}:${data.trader}:${data.openTxHash || ''}:${data.txHash || ''}:${data.openedAt || ''}`;
  if (rpc === client) {
    const cached = evidenceCache.get(key);
    if (cached && Date.now() - cached.at < 60_000) return cached.promise;
    const promise = positionEvidence(data,rpc);evidenceCache.set(key,{at:Date.now(),promise});
    if(evidenceCache.size>100)evidenceCache.delete(evidenceCache.keys().next().value!);
    promise.catch(()=>evidenceCache.delete(key));return promise;
  }
  return positionEvidence(data,rpc);
}
async function positionEvidence(data: TradeShare, rpc: any): Promise<PositionEvidence> {
  const result: PositionEvidence = {};
  const inspect = async (hash: string | undefined, eventName: 'PositionOpened' | 'PositionClosed') => {
    if (!hash || !/^0x[0-9a-f]{64}$/i.test(hash)) return false;
    const receipt = await rpc.getTransactionReceipt({hash});
    if(receipt.status !== 'success')return false;
    let opening: any;
    const match = receipt.logs.some((log: any)=>{
      if(log.removed || log.address.toLowerCase() !== SHARED_ENGINE)return false;
      try {const event=decodeEventLog({abi:VELO_PERPS_V4_ABI,data:log.data,topics:log.topics});
        const args=event.args as any;
        const matches=event.eventName===eventName && args.tradeId===BigInt(data.tradeId!) && args.trader.toLowerCase()===data.trader!.toLowerCase();
        if(matches && eventName==='PositionOpened')opening=args;
        return matches;
      }catch{return false;}
    });
    if(!match)return false;
    if(opening){const market=V4_TRADING_MARKETS.find(m=>m.contractIndex===Number(opening.pairIndex));if(market)result.opening={pair:market.id,side:opening.isLong?'LONG':'SHORT',leverage:Number(opening.leverage),entryPrice:Number(opening.entryPrice_E18)/1e18,size:Number(opening.collateralUSDC_6)/1e6*Number(opening.leverage)};}
    const kind=eventName==='PositionOpened'?'open':'close';
    result[kind==='open'?'openTxHash':'closeTxHash']=receipt.transactionHash;
    if(rpc.getBlock)try{const block=await rpc.getBlock({blockNumber:receipt.blockNumber});result[kind==='open'?'openedAt':'closedAt']=Number(block.timestamp)*1000;}catch{/* The verified hash is still useful. */}
    return true;
  };
  await Promise.allSettled([inspect(data.openTxHash,'PositionOpened'),data.status!=='OPEN'?inspect(data.txHash,'PositionClosed'):Promise.resolve(false)]);
  if(!result.openTxHash && data.openedAt && rpc.getBlock && rpc.getLogs)try{
    // Estimate a small log window from observed block timestamps. Matching the
    // engine, owner and trade ID still requires receipt verification below.
    const latest=await rpc.getBlock();
    const earlierNumber=latest.number>1000n?latest.number-1000n:0n;
    const earlier=await rpc.getBlock({blockNumber:earlierNumber});
    const interval=Number(latest.timestamp-earlier.timestamp)/Number(latest.number-earlierNumber);
    const age=Number(latest.timestamp)-data.openedAt/1000;
    if(interval>0 && age>=0){
      const estimated=latest.number-BigInt(Math.round(age/interval));
      const from=estimated>64n?estimated-64n:0n;
      const to=estimated+64n<latest.number?estimated+64n:latest.number;
      if(to>=from){const logs=await positionLogs({address:SHARED_ENGINE,event:openEvent,args:{tradeId:BigInt(data.tradeId!),trader:data.trader},fromBlock:from,toBlock:to,strict:true},rpc);
        const found=logs.find((log:any)=>!log.removed);if(found)await inspect(found.transactionHash,'PositionOpened');}
    }
  }catch{/* Show an unavailable receipt rather than an unverified link. */}
  return result;
}
export function hasPositionReference(data: Partial<TradeShare>) {
  return data.chainId === 84532 && data.contract?.toLowerCase() === SHARED_ENGINE &&
    (/^[0-9]{1,20}$/.test(data.tradeId || '') || /^0x[0-9a-f]{64}$/i.test(data.txHash || '')) && /^0x[0-9a-f]{40}$/i.test(data.trader || '');
}
// Only the fixed V4 engine is read. A user-controlled post cannot select an RPC
// host/contract or turn disappearance, an RPC failure, or stale data into a close.
const recentReads = new Map<string, {at:number;promise:Promise<TradeShare>}>();
export async function readSharedPosition(data: TradeShare, mark?: number, rpc: any = client): Promise<TradeShare> {
  if (rpc !== client) return readPosition(data, mark, rpc);
  const key = `${data.contract}:${data.tradeId}:${data.trader}:${data.txHash || ''}`;
  let entry = recentReads.get(key);
  if (!entry || Date.now() - entry.at > 8500) {
    const promise = readPosition(data, mark, rpc);
    entry = {at:Date.now(),promise};recentReads.set(key,entry);
    promise.catch(()=>{if(recentReads.get(key)?.promise === promise)recentReads.delete(key);});
    if(recentReads.size > 100)recentReads.delete(recentReads.keys().next().value!);
  }
  return {...await entry.promise,traderHandle:data.traderHandle};
}
async function readPosition(data: TradeShare, mark?: number, rpc: any = client): Promise<TradeShare> {
  if (!hasPositionReference(data)) throw new Error('This post has no linked V4 position.');
  const address = data.contract as Address, trader = data.trader as Address;
  let tradeId: bigint, knownReceipt: any;
  if (data.tradeId) tradeId = BigInt(data.tradeId);
  else {
    knownReceipt = await rpc.getTransactionReceipt({hash:data.txHash as Hex});
    const closed = knownReceipt.logs.flatMap((log: any) => {
      if (log.address.toLowerCase() !== SHARED_ENGINE) return [];
      try { const decoded = decodeEventLog({abi:[closeEvent],data:log.data,topics:log.topics});return decoded.args.trader.toLowerCase() === trader.toLowerCase() ? [decoded.args] : []; } catch { return []; }
    });
    if (!closed.length) throw new Error('This receipt has no matching V4 settlement.');
    tradeId = closed[0].tradeId;
    data = {...data,tradeId:tradeId.toString()};
  }
  const raw = await rpc.readContract({ address, abi: VELO_PERPS_V4_ABI, functionName: 'getPosition', args: [tradeId] });
  if (raw.owner !== '0x0000000000000000000000000000000000000000') {
    if (raw.owner.toLowerCase() !== trader.toLowerCase()) throw new Error('Position owner does not match this share.');
    const market = V4_TRADING_MARKETS.find(m => m.contractIndex === Number(raw.pairIndex));
    if (!market) throw new Error('Unknown market.');
    const price = Number(raw.entryPrice_E18) / 1e18;
    const current = mark && Number.isFinite(mark) && mark > 0 ? mark : data.markPrice || price;
    const [risk, openFee, quote] = await Promise.all([
      rpc.readContract({ address, abi: VELO_PERPS_V4_ABI, functionName: 'marketRisk', args: [Number(raw.pairIndex)] }),
      rpc.readContract({ address, abi: VELO_PERPS_V4_ABI, functionName: 'positionOpenFee', args: [tradeId] }),
      rpc.readContract({ address, abi: VELO_PERPS_V4_ABI, functionName: 'quoteClose', args: [tradeId, BigInt(Math.round(current * 1e18)), false] }),
    ]);
    const collateral = Number(raw.collateralUSDC_6) / 1e6, fee = Number(openFee) / 1e6;
    const pnl = Number(quote.pnl) / 1e6 - fee;
    return { ...data, pair: market.id, side: raw.isLong ? 'LONG' : 'SHORT', leverage: Number(raw.leverage),
      entryPrice: price, markPrice: current, size: Number(raw.originalNotional_6) / 1e6, collateral: collateral + fee,
      openedAt: Number(raw.openedAt) * 1000, pnl, pnlPct: pnl / (collateral + fee) * 100, status: 'OPEN', updatedAt: Date.now(),
      v4: { collateral, openFee: fee, spreadRatio: Math.abs(Number(quote.price) / 1e18 - current) / current,
        borrowBpsPerHour: Number(risk[6]), maintenanceBps: Number(risk[4]) } };
  }
  let hash = data.txHash;
  const key = `${address}:${tradeId}`;
  if (!hash) {
    const latest = await rpc.getBlockNumber();
    const to = scanCursor.get(key) ?? latest;
    const from = to > 9999n ? to - 9999n : 0n;
    const logs = await positionLogs({ address, event: closeEvent, args: { tradeId, trader }, fromBlock: from, toBlock: to, strict: true },rpc);
    hash = logs.find((log: any) => !log.removed)?.transactionHash;
    if (!hash) { scanCursor.set(key, from > 0n ? from - 1n : latest); throw new Error('Refreshing settlement from the chain.'); }
  }
  const receipt = knownReceipt || await rpc.getTransactionReceipt({ hash: hash as Hex });
  const closed = decodeConfirmedClose(receipt, address, tradeId, trader, data.collateral);
  if (!closed) throw new Error('Refreshing settlement from the chain.');
  scanCursor.delete(key);
  // V4 emits net PnL including the opening fee: payout - net PnL is the
  // original gross margin, so a post cannot supply its own return denominator.
  const collateral = closed.payoutUSDC - closed.pnlUSDC;
  const settlement = receipt.logs.flatMap((log:any)=>{if(log.address.toLowerCase()!==SHARED_ENGINE)return [];try{const event=decodeEventLog({abi:[closeEvent],data:log.data,topics:log.topics});return event.args.tradeId===tradeId && event.args.trader.toLowerCase()===trader.toLowerCase()?[event.args]:[];}catch{return [];}})[0];
  const market = V4_TRADING_MARKETS.find(m=>m.contractIndex===Number(settlement?.pairIndex));
  return { ...data, pair: market?.id || data.pair, status: closed.action === 'LIQUIDATION' ? 'LIQUIDATED' : 'CLOSED', closePrice: closed.exitPrice,
    collateral, pnl: closed.pnlUSDC, pnlPct: collateral > 0 ? closed.pnlUSDC / collateral * 100 : 0,
    txHash: closed.txHash, updatedAt: Date.now() };
}
