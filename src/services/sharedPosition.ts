import { createPublicClient, decodeEventLog, parseAbiItem, type Address, type Hex } from 'viem';
import { baseSepolia } from 'viem/chains';
import { baseSepoliaTransport } from './baseTransport.mjs';
import { VELO_PERPS_V4_ABI } from './veloPerpsV4Abi';
import { V4_TRADING_MARKETS } from '../../shared/markets.mjs';
import { decodeConfirmedClose } from './tradeReceipts';
import type { TradeShare } from '../utils/tradeShare';

export const SHARED_ENGINE = '0xe9aecfbc5814ce3b2db0107594d80f054e6db52f';
const closeEvent = parseAbiItem('event PositionClosed(uint256 indexed tradeId,address indexed trader,uint16 indexed pairIndex,uint128 exitPrice_E18,int256 pnlUSDC_6,uint64 payoutUSDC_6,uint64 feeUSDC_6)');
const client = createPublicClient({ chain: baseSepolia, transport: baseSepoliaTransport() });
const scanCursor = new Map<string, bigint>();
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
    const logs = await rpc.getLogs({ address, event: closeEvent, args: { tradeId, trader }, fromBlock: from, toBlock: to, strict: true });
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
  return { ...data, status: closed.action === 'LIQUIDATION' ? 'LIQUIDATED' : 'CLOSED', closePrice: closed.exitPrice,
    collateral, pnl: closed.pnlUSDC, pnlPct: collateral > 0 ? closed.pnlUSDC / collateral * 100 : 0,
    txHash: closed.txHash, updatedAt: Date.now() };
}
