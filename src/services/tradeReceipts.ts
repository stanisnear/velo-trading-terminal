import { decodeEventLog, parseAbi, type Address, type PublicClient, type Hex, type TransactionReceipt } from 'viem';
import { v5 as uuidv5 } from 'uuid';

export const CLOSE_EVENTS = parseAbi([
  'event PositionClosed(uint256 indexed tradeId,address indexed trader,uint16 indexed pairIndex,uint128 exitPrice_E18,int256 pnlUSDC_6,uint64 payoutUSDC_6,uint64 feeUSDC_6)',
  'event PositionPartiallyClosed(uint256 indexed tradeId,address indexed trader,uint16 fractionBps,uint128 exitPrice_E18,int256 pnlUSDC_6,uint64 payoutUSDC_6,uint64 feeUSDC_6)',
  'event PositionLiquidated(uint256 indexed tradeId,address indexed trader,address indexed liquidator,uint128 exitPrice_E18,uint64 bountyUSDC_6)',
  'event TriggerFired(uint256 indexed tradeId,address indexed trader,address indexed keeper,bool wasTakeProfit,uint128 exitPrice_E18,uint64 keeperBounty_6)',
]);

export interface ConfirmedClose {
  id: string;
  txHash: Hex;
  tradeId: bigint;
  logIndex: number;
  blockNumber: bigint;
  action: 'CLOSE' | 'LIQUIDATION';
  reason: 'CLOSE' | 'TAKE_PROFIT' | 'STOP_LOSS' | 'LIQUIDATION';
  fractionBps: number;
  exitPrice: number;
  pnlUSDC: number;
  payoutUSDC: number;
  feeUSDC: number;
}

// Deterministic database identity across tabs, manual handlers and reconciliation.
export const tradeEventId = (contract: string, hash: string, logIndex: number) =>
  uuidv5(`84532:${contract.toLowerCase()}:${hash.toLowerCase()}:${logIndex}`, uuidv5.URL);

export function decodeConfirmedClose(receipt: TransactionReceipt, contract: Address, tradeId: bigint,
  trader: Address, collateralUSDC = 0, marginMode = 'ISOLATED'): ConfirmedClose | null {
  if (receipt.status !== 'success') throw new Error('Transaction reverted on-chain');
  const events = receipt.logs.flatMap(log => {
    if (log.address.toLowerCase() !== contract.toLowerCase()) return [];
    try {
      const decoded = decodeEventLog({ abi: CLOSE_EVENTS, data: log.data, topics: log.topics });
      if (decoded.args.tradeId !== tradeId || decoded.args.trader.toLowerCase() !== trader.toLowerCase()) return [];
      return [{ ...decoded, log }];
    } catch { return []; }
  });
  const liquidationEvent = events.find(e => e.eventName === 'PositionLiquidated');
  const settlementEvent = events.find(e => e.eventName === 'PositionClosed');
  const event = settlementEvent || events.find(e => e.eventName !== 'TriggerFired');
  if (!event) return null;
  const args = event.args as any;
  const liquidation = !!liquidationEvent;
  const legacyLiquidation = liquidation && !settlementEvent;
  const trigger = events.find(e => e.eventName === 'TriggerFired');
  return {
    id: tradeEventId(contract, receipt.transactionHash, event.log.logIndex),
    txHash: receipt.transactionHash, tradeId, logIndex: event.log.logIndex,
    blockNumber: receipt.blockNumber,
    action: liquidation ? 'LIQUIDATION' : 'CLOSE',
    reason: liquidation ? 'LIQUIDATION' : trigger ? ((trigger.args as any).wasTakeProfit ? 'TAKE_PROFIT' : 'STOP_LOSS') : 'CLOSE',
    fractionBps: event.eventName === 'PositionPartiallyClosed' ? Number(args.fractionBps) : 10000,
    exitPrice: Number(args.exitPrice_E18) / 1e18,
    // V3.1's known cross-ledger defect only debits the bounty on liquidation.
    // Never claim that defective contract actually forfeited all cross margin.
    pnlUSDC: legacyLiquidation ? (marginMode === 'CROSS' ? -Number(args.bountyUSDC_6) / 1e6 : -collateralUSDC) : Number(args.pnlUSDC_6) / 1e6,
    payoutUSDC: legacyLiquidation ? 0 : Number(args.payoutUSDC_6) / 1e6,
    feeUSDC: legacyLiquidation ? 0 : Number(args.feeUSDC_6) / 1e6,
  };
}

export async function waitForSuccessfulReceipt(client: PublicClient, hash: Hex): Promise<TransactionReceipt> {
  let receipt: TransactionReceipt;
  try {
    // One additional block keeps immediate follow-up simulations from using
    // a lagging RPC replica that has not applied the preceding mint/approval.
    receipt = await client.waitForTransactionReceipt({ hash, pollingInterval: 1000, timeout: 45000, confirmations: 2 });
  } catch {
    const error = new Error('Transaction submitted; confirmation is delayed. Check its status before retrying.') as Error & { txHash: Hex };
    error.txHash = hash;
    throw error;
  }
  const { clearPendingTransaction } = await import('./baseTransport.mjs');
  clearPendingTransaction(receipt.from, hash);
  if (receipt.transactionHash.toLowerCase() !== hash.toLowerCase()) {
    throw new Error('The transaction was replaced. Check wallet activity before retrying this action.');
  }
  if (receipt.status !== 'success') throw new Error('Transaction reverted on-chain');
  return receipt;
}

export async function findRecentPositionClose(client: PublicClient, contract: Address, tradeId: bigint,
  trader: Address, collateralUSDC: number, marginMode: string): Promise<ConfirmedClose | null> {
  const latest = await client.getBlockNumber();
  const logs = await client.getLogs({ address: contract, events: [CLOSE_EVENTS[0], CLOSE_EVENTS[2]],
    fromBlock: latest > 10000n ? latest - 10000n : 0n, toBlock: latest, strict: true });
  const log = logs.find(l => l.args.tradeId === tradeId && l.args.trader?.toLowerCase() === trader.toLowerCase() && !l.removed);
  if (!log) return null; // Missing evidence is never a liquidation.
  const receipt = await client.getTransactionReceipt({ hash: log.transactionHash });
  return decodeConfirmedClose(receipt, contract, tradeId, trader, collateralUSDC, marginMode);
}

const ORDER_EVENTS = parseAbi([
  'event ConditionalOrderExecuted(uint256 indexed orderId,address indexed trader,uint256 linkedTradeId,uint128 markPrice_E18)',
  'event ConditionalOrderCancelled(uint256 indexed orderId,address indexed trader)',
  'event PositionOpened(uint256 indexed tradeId,address indexed trader,uint16 indexed pairIndex,bool isLong,uint16 leverage,uint8 marginMode,uint64 collateralUSDC_6,uint128 entryPrice_E18)',
]);

export function decodeOrderOutcome(receipt: TransactionReceipt, contract: Address, orderId: bigint, trader: Address) {
  if (receipt.status !== 'success') throw new Error('Transaction reverted on-chain');
  const events = receipt.logs.flatMap(log => {
    if (log.address.toLowerCase() !== contract.toLowerCase()) return [];
    try {
      const decoded = decodeEventLog({ abi: ORDER_EVENTS, topics: log.topics, data: log.data });
      return decoded.args.trader.toLowerCase() === trader.toLowerCase() ? [{ ...decoded, log }] : [];
    } catch { return []; }
  });
  if (events.some(e => e.eventName === 'ConditionalOrderCancelled' && e.args.orderId === orderId)) return { kind: 'cancelled' as const };
  const execution = events.find(e => e.eventName === 'ConditionalOrderExecuted' && e.args.orderId === orderId);
  if (!execution || execution.eventName !== 'ConditionalOrderExecuted') return null;
  const opened = events.find(e => e.eventName === 'PositionOpened' && e.args.tradeId === execution.args.linkedTradeId);
  if (!opened || opened.eventName !== 'PositionOpened') return { kind: 'reduced' as const };
  return { kind: 'opened' as const, id: tradeEventId(contract, receipt.transactionHash, opened.log.logIndex),
    txHash: receipt.transactionHash, tradeId: opened.args.tradeId, entryPrice: Number(opened.args.entryPrice_E18) / 1e18,
    size: Number(opened.args.collateralUSDC_6) / 1e6 * Number(opened.args.leverage), leverage: Number(opened.args.leverage),
    marginMode: opened.args.marginMode === 1 ? 'CROSS' : 'ISOLATED', isLong: opened.args.isLong };
}

export async function findRecentOrderOutcome(client: PublicClient, contract: Address, orderId: bigint, trader: Address) {
  const latest = await client.getBlockNumber();
  const logs = await client.getLogs({ address: contract, events: [ORDER_EVENTS[0], ORDER_EVENTS[1]],
    fromBlock: latest > 10000n ? latest - 10000n : 0n, toBlock: latest, strict: true });
  const log = logs.find(l => l.args.orderId === orderId && l.args.trader?.toLowerCase() === trader.toLowerCase() && !l.removed);
  return log ? decodeOrderOutcome(await client.getTransactionReceipt({ hash: log.transactionHash }), contract, orderId, trader) : null;
}
