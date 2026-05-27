/**
 * veloPerpsService — wrapper around the VeloPerps contract (V3-primary).
 *
 * V3 is the active contract. V2 / V1 fallbacks exist only so positions opened
 * on legacy versions still surface in the UI (read-only). All new writes go
 * through V3.
 *
 * V3 adds (over V2):
 *   - dual margin modes (ISOLATED, CROSS)
 *   - on-chain cross-margin account (depositCross / withdrawCross)
 *   - on-chain LIMIT/STOP conditional orders (reduce-only supported)
 *   - editable TP/SL still on-chain via setTriggers
 *
 * Routing precedence (highest to lowest):
 *   VITE_VELO_PERPS_V3_ADDRESS → VITE_VELO_PERPS_V2_ADDRESS →
 *   VITE_VELO_PERPS_ADDRESS    → hardcoded V1 fallback (read-only).
 */
import {
  type Address,
  type PublicClient,
  type WalletClient,
  decodeEventLog,
  parseUnits,
} from 'viem';
import { fetchPriceUpdate, PYTH_FEED_IDS } from './pythService';

// ── Contract addresses ───────────────────────────────────────────────────────

/** V1 deployment (legacy — read-only fallback). */
export const VELO_PERPS_V1_ADDRESS = (import.meta.env.VITE_VELO_PERPS_ADDRESS ||
  '0x28fE36d4ae72ab0E05fa6edafE1D6e11E9DD6163') as Address;

/** V2 deployment (legacy). */
export const VELO_PERPS_V2_ADDRESS = (import.meta.env.VITE_VELO_PERPS_V2_ADDRESS || '') as Address;

/** V3 deployment (active). Setting this routes all new positions/orders here. */
export const VELO_PERPS_V3_ADDRESS = (import.meta.env.VITE_VELO_PERPS_V3_ADDRESS || '') as Address;

/** The contract new positions/orders open against. V3 → V2 → V1. */
export const VELO_PERPS_ADDRESS: Address =
  (VELO_PERPS_V3_ADDRESS && VELO_PERPS_V3_ADDRESS.length === 42) ? VELO_PERPS_V3_ADDRESS :
  (VELO_PERPS_V2_ADDRESS && VELO_PERPS_V2_ADDRESS.length === 42) ? VELO_PERPS_V2_ADDRESS :
  VELO_PERPS_V1_ADDRESS;

/** True when frontend writes are routing to V3. */
export const IS_V3: boolean = VELO_PERPS_V3_ADDRESS.length === 42
  && VELO_PERPS_ADDRESS.toLowerCase() === VELO_PERPS_V3_ADDRESS.toLowerCase();

/** True when frontend writes are routing to V2 (or V3 — both have margin / TP-SL / partial close). */
export const IS_V2: boolean = IS_V3
  || (VELO_PERPS_V2_ADDRESS.length === 42
      && VELO_PERPS_ADDRESS.toLowerCase() === VELO_PERPS_V2_ADDRESS.toLowerCase());

export const VELO_USDC_BASE = (import.meta.env.VITE_VELO_USDC_BASE ||
  '0x5EFaF3F69b09bC2abF3439bDC0C93bf611026699') as Address;

/** Pyth oracle on Base Sepolia. Used to query exact update fees. */
export const PYTH_CONTRACT_ADDRESS = (import.meta.env.VITE_PYTH_CONTRACT_ADDRESS ||
  '0xA2aa501b19aff244D90cc15a4Cf739D2725B5729') as Address;

/**
 * Get the EXACT ETH fee the Pyth contract requires for this updateData.
 * VeloPerps enforces msg.value == getUpdateFee(updateData) to the wei.
 * Never estimate this — always read it on-chain.
 */
async function getExactPythFee(
  publicClient: PublicClient,
  updateData: `0x${string}`[],
): Promise<bigint> {
  const fee = await publicClient.readContract({
    address: PYTH_CONTRACT_ADDRESS,
    abi: [{ type: 'function', name: 'getUpdateFee', stateMutability: 'view',
      inputs: [{ name: 'updateData', type: 'bytes[]' }],
      outputs: [{ name: 'feeAmount', type: 'uint256' }] }] as const,
    functionName: 'getUpdateFee',
    args: [updateData],
  }) as bigint;
  return fee;
}

// ── Domain types ─────────────────────────────────────────────────────────────

export type PairIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16;

export type VeloPairLabel =
  | 'BTC-USD'    | 'ETH-USD'    | 'SOL-USD'    | 'AVAX-USD'
  | 'LINK-USD'   | 'DOGE-USD'   | 'NEAR-USD'   | 'INJ-USD'
  | 'APT-USD'    | 'ARB-USD'    | 'OP-USD'     | 'SUI-USD'
  | 'TIA-USD'    | 'SEI-USD'    | 'RENDER-USD' | 'WLFI-USD'
  | 'POL-USD';

export const PAIR_INDEX: Record<VeloPairLabel, PairIndex> = {
  'BTC-USD': 0, 'ETH-USD': 1, 'SOL-USD': 2, 'AVAX-USD': 3, 'LINK-USD': 4, 'DOGE-USD': 5,
  'NEAR-USD': 6, 'INJ-USD': 7, 'APT-USD': 8, 'ARB-USD': 9, 'OP-USD': 10, 'SUI-USD': 11,
  'TIA-USD': 12, 'SEI-USD': 13, 'RENDER-USD': 14, 'WLFI-USD': 15, 'POL-USD': 16,
};

export const PAIR_LABEL: Record<PairIndex, VeloPairLabel> = {
  0: 'BTC-USD', 1: 'ETH-USD', 2: 'SOL-USD', 3: 'AVAX-USD', 4: 'LINK-USD', 5: 'DOGE-USD',
  6: 'NEAR-USD', 7: 'INJ-USD', 8: 'APT-USD', 9: 'ARB-USD', 10: 'OP-USD', 11: 'SUI-USD',
  12: 'TIA-USD', 13: 'SEI-USD', 14: 'RENDER-USD', 15: 'WLFI-USD', 16: 'POL-USD',
};

export function uiPairToVeloPair(uiPair: string): VeloPairLabel | null {
  const normalized = uiPair.replace('/', '-') as VeloPairLabel;
  return normalized in PAIR_INDEX ? normalized : null;
}

export function veloPairToUiPair(veloPair: VeloPairLabel): string {
  return veloPair.replace('-', '/');
}

/** Margin mode — matches V3 enum (ISOLATED=0, CROSS=1). */
export type VeloMarginMode = 'ISOLATED' | 'CROSS';
export const MARGIN_MODE_TO_U8 = { ISOLATED: 0, CROSS: 1 } as const;
export const U8_TO_MARGIN_MODE: Record<number, VeloMarginMode> = { 0: 'ISOLATED', 1: 'CROSS' };

/** Conditional order trigger kind — matches V3 enum (LIMIT=0, STOP=1). */
export type VeloTriggerKind = 'LIMIT' | 'STOP';
export const TRIGGER_KIND_TO_U8 = { LIMIT: 0, STOP: 1 } as const;
export const U8_TO_TRIGGER_KIND: Record<number, VeloTriggerKind> = { 0: 'LIMIT', 1: 'STOP' };

export interface VeloPosition {
  tradeId: bigint;
  owner: Address;
  pairIndex: PairIndex;
  pair: VeloPairLabel;
  isLong: boolean;
  leverage: number;
  marginMode: VeloMarginMode;     // V3 only — defaults to ISOLATED on V1/V2 reads
  collateralUSDC_6: bigint;
  collateralUSDC: number;
  entryPrice_E18: bigint;
  entryPrice: number;
  openedAt: number;
  takeProfit?: number;            // V2/V3 only (1e18 → display)
  stopLoss?: number;
  openTxHash?: `0x${string}`;
}

export interface VeloConditionalOrder {
  orderId: bigint;
  owner: Address;
  pairIndex: PairIndex;
  pair: VeloPairLabel;
  isLong: boolean;
  leverage: number;
  marginMode: VeloMarginMode;
  triggerKind: VeloTriggerKind;
  reduceOnly: boolean;
  reduceBps: number;
  collateralUSDC: number;
  triggerPrice: number;
  createdAt: number;
  active: boolean;
}

// ── ABIs ─────────────────────────────────────────────────────────────────────
// V3 is the primary ABI used by all write functions and most reads. V2/V1
// fallback ABIs are minimal — only enough to surface legacy positions read-only.

export const VELO_PERPS_V3_ABI = [
  // Constants
  { type: 'function', name: 'VERSION',                     stateMutability: 'view', inputs: [], outputs: [{ type: 'uint16' }] },
  { type: 'function', name: 'MAX_LEVERAGE',                stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'LIQUIDATION_THRESHOLD_BPS',   stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'OPEN_FEE_BPS',                stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'CLOSE_FEE_BPS',               stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'owner',                       stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'feeBalance',                  stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'nextTradeId',                 stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'nextOrderId',                 stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'poolBalance',                 stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },

  // Pair registry
  { type: 'function', name: 'pairFeedId',  stateMutability: 'view', inputs: [{ type: 'uint16' }], outputs: [{ type: 'bytes32' }] },
  { type: 'function', name: 'pairLabel',   stateMutability: 'view', inputs: [{ type: 'uint16' }], outputs: [{ type: 'string'  }] },
  { type: 'function', name: 'pairTradable',stateMutability: 'view', inputs: [{ type: 'uint16' }], outputs: [{ type: 'bool'    }] },

  // Cross-margin account
  { type: 'function', name: 'crossBalanceUSDC_6', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'crossLockedUSDC_6',  stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'crossFreeBalance',   stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'depositCross',  stateMutability: 'nonpayable', inputs: [{ name: 'amountUSDC_6', type: 'uint64' }], outputs: [] },
  { type: 'function', name: 'withdrawCross', stateMutability: 'nonpayable', inputs: [{ name: 'amountUSDC_6', type: 'uint64' }], outputs: [] },

  // Position writes
  {
    type: 'function', name: 'openPosition', stateMutability: 'payable',
    inputs: [
      { name: 'pairIndex',        type: 'uint16'  },
      { name: 'isLong',           type: 'bool'    },
      { name: 'collateralUSDC_6', type: 'uint64'  },
      { name: 'leverage',         type: 'uint16'  },
      { name: 'marginMode',       type: 'uint8'   },
      { name: 'pythUpdateData',   type: 'bytes[]' },
    ],
    outputs: [{ name: 'tradeId', type: 'uint256' }],
  },
  {
    type: 'function', name: 'closePosition', stateMutability: 'payable',
    inputs: [{ name: 'tradeId', type: 'uint256' }, { name: 'pythUpdateData', type: 'bytes[]' }],
    outputs: [],
  },
  {
    type: 'function', name: 'partialClose', stateMutability: 'payable',
    inputs: [
      { name: 'tradeId',        type: 'uint256' },
      { name: 'fractionBps',    type: 'uint16'  },
      { name: 'pythUpdateData', type: 'bytes[]' },
    ],
    outputs: [],
  },
  {
    type: 'function', name: 'liquidate', stateMutability: 'payable',
    inputs: [{ name: 'tradeId', type: 'uint256' }, { name: 'pythUpdateData', type: 'bytes[]' }],
    outputs: [],
  },
  {
    type: 'function', name: 'increaseCollateral', stateMutability: 'nonpayable',
    inputs: [{ name: 'tradeId', type: 'uint256' }, { name: 'amountUSDC_6', type: 'uint64' }],
    outputs: [],
  },
  {
    type: 'function', name: 'decreaseCollateral', stateMutability: 'payable',
    inputs: [
      { name: 'tradeId',        type: 'uint256' },
      { name: 'amountUSDC_6',   type: 'uint64'  },
      { name: 'pythUpdateData', type: 'bytes[]' },
    ],
    outputs: [],
  },
  {
    type: 'function', name: 'setTriggers', stateMutability: 'nonpayable',
    inputs: [
      { name: 'tradeId',         type: 'uint256' },
      { name: 'takeProfit_E18',  type: 'uint128' },
      { name: 'stopLoss_E18',    type: 'uint128' },
    ],
    outputs: [],
  },
  {
    type: 'function', name: 'closeIfTriggered', stateMutability: 'payable',
    inputs: [{ name: 'tradeId', type: 'uint256' }, { name: 'pythUpdateData', type: 'bytes[]' }],
    outputs: [],
  },

  // Conditional orders
  {
    type: 'function', name: 'placeConditionalOrder', stateMutability: 'nonpayable',
    inputs: [{
      name: 'p', type: 'tuple',
      components: [
        { name: 'pairIndex',        type: 'uint16'  },
        { name: 'isLong',           type: 'bool'    },
        { name: 'leverage',         type: 'uint16'  },
        { name: 'marginMode',       type: 'uint8'   },
        { name: 'triggerKind',      type: 'uint8'   },
        { name: 'triggerPrice_E18', type: 'uint128' },
        { name: 'collateralUSDC_6', type: 'uint64'  },
        { name: 'reduceOnly',       type: 'bool'    },
        { name: 'reduceBps',        type: 'uint16'  },
      ],
    }],
    outputs: [{ name: 'orderId', type: 'uint256' }],
  },
  {
    type: 'function', name: 'cancelConditionalOrder', stateMutability: 'nonpayable',
    inputs: [{ name: 'orderId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function', name: 'executeConditionalOrder', stateMutability: 'payable',
    inputs: [{ name: 'orderId', type: 'uint256' }, { name: 'pythUpdateData', type: 'bytes[]' }],
    outputs: [],
  },

  // Reads
  {
    type: 'function', name: 'getTraderTrades', stateMutability: 'view',
    inputs: [{ name: 'trader', type: 'address' }],
    outputs: [{ type: 'uint256[]' }],
  },
  {
    type: 'function', name: 'getTraderOrders', stateMutability: 'view',
    inputs: [{ name: 'trader', type: 'address' }],
    outputs: [{ type: 'uint256[]' }],
  },
  {
    type: 'function', name: 'getPosition', stateMutability: 'view',
    inputs: [{ name: 'tradeId', type: 'uint256' }],
    outputs: [{
      type: 'tuple',
      components: [
        { name: 'owner',              type: 'address' },
        { name: 'pairIndex',          type: 'uint16'  },
        { name: 'isLong',             type: 'bool'    },
        { name: 'leverage',           type: 'uint16'  },
        { name: 'marginMode',         type: 'uint8'   },
        { name: 'collateralUSDC_6',   type: 'uint64'  },
        { name: 'entryPrice_E18',     type: 'uint128' },
        { name: 'openedAt',           type: 'uint64'  },
        { name: 'takeProfit_E18',     type: 'uint128' },
        { name: 'stopLoss_E18',       type: 'uint128' },
        { name: 'originalNotional_6', type: 'uint128' },
      ],
    }],
  },
  {
    type: 'function', name: 'conditionalOrders', stateMutability: 'view',
    inputs: [{ type: 'uint256' }],
    outputs: [{
      type: 'tuple',
      components: [
        { name: 'owner',            type: 'address' },
        { name: 'pairIndex',        type: 'uint16'  },
        { name: 'isLong',           type: 'bool'    },
        { name: 'leverage',         type: 'uint16'  },
        { name: 'marginMode',       type: 'uint8'   },
        { name: 'triggerKind',      type: 'uint8'   },
        { name: 'reduceOnly',       type: 'bool'    },
        { name: 'reduceBps',        type: 'uint16'  },
        { name: 'collateralUSDC_6', type: 'uint64'  },
        { name: 'triggerPrice_E18', type: 'uint128' },
        { name: 'createdAt',        type: 'uint64'  },
        { name: 'active',           type: 'bool'    },
      ],
    }],
  },
  {
    type: 'function', name: 'quoteUnrealisedPnL', stateMutability: 'view',
    inputs: [{ name: 'tradeId', type: 'uint256' }],
    outputs: [
      { name: 'pnl_6',         type: 'int256'  },
      { name: 'markPrice_E18', type: 'uint256' },
    ],
  },
  {
    type: 'function', name: 'effectiveLeverage', stateMutability: 'view',
    inputs: [{ name: 'tradeId', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
  },

  // Owner-only
  {
    type: 'function', name: 'registerPair', stateMutability: 'nonpayable',
    inputs: [
      { name: 'pairIndex', type: 'uint16'  },
      { name: 'feedId',    type: 'bytes32' },
      { name: 'label',     type: 'string'  },
    ],
    outputs: [],
  },
  {
    type: 'function', name: 'setPairTradable', stateMutability: 'nonpayable',
    inputs: [
      { name: 'pairIndex', type: 'uint16' },
      { name: 'tradable',  type: 'bool'   },
    ],
    outputs: [],
  },
  {
    type: 'function', name: 'withdrawFees', stateMutability: 'nonpayable',
    inputs: [
      { name: 'to',           type: 'address' },
      { name: 'amountUSDC_6', type: 'uint256' },
    ],
    outputs: [],
  },

  // Events
  {
    type: 'event', name: 'PositionOpened',
    inputs: [
      { indexed: true,  name: 'tradeId',          type: 'uint256' },
      { indexed: true,  name: 'trader',           type: 'address' },
      { indexed: true,  name: 'pairIndex',        type: 'uint16'  },
      { indexed: false, name: 'isLong',           type: 'bool'    },
      { indexed: false, name: 'leverage',         type: 'uint16'  },
      { indexed: false, name: 'marginMode',       type: 'uint8'   },
      { indexed: false, name: 'collateralUSDC_6', type: 'uint64'  },
      { indexed: false, name: 'entryPrice_E18',   type: 'uint128' },
    ],
  },
  {
    type: 'event', name: 'PositionClosed',
    inputs: [
      { indexed: true,  name: 'tradeId',       type: 'uint256' },
      { indexed: true,  name: 'trader',        type: 'address' },
      { indexed: true,  name: 'pairIndex',     type: 'uint16'  },
      { indexed: false, name: 'exitPrice_E18', type: 'uint128' },
      { indexed: false, name: 'pnlUSDC_6',     type: 'int256'  },
      { indexed: false, name: 'payoutUSDC_6',  type: 'uint64'  },
      { indexed: false, name: 'feeUSDC_6',     type: 'uint64'  },
    ],
  },
  {
    type: 'event', name: 'ConditionalOrderPlaced',
    inputs: [
      { indexed: true,  name: 'orderId',          type: 'uint256' },
      { indexed: true,  name: 'trader',           type: 'address' },
      { indexed: true,  name: 'pairIndex',        type: 'uint16'  },
      { indexed: false, name: 'isLong',           type: 'bool'    },
      { indexed: false, name: 'triggerKind',      type: 'uint8'   },
      { indexed: false, name: 'marginMode',       type: 'uint8'   },
      { indexed: false, name: 'reduceOnly',       type: 'bool'    },
      { indexed: false, name: 'reduceBps',        type: 'uint16'  },
      { indexed: false, name: 'triggerPrice_E18', type: 'uint128' },
      { indexed: false, name: 'collateralUSDC_6', type: 'uint64'  },
      { indexed: false, name: 'leverage',         type: 'uint16'  },
    ],
  },
  {
    type: 'event', name: 'ConditionalOrderCancelled',
    inputs: [
      { indexed: true, name: 'orderId', type: 'uint256' },
      { indexed: true, name: 'trader',  type: 'address' },
    ],
  },
  {
    type: 'event', name: 'ConditionalOrderExecuted',
    inputs: [
      { indexed: true,  name: 'orderId',       type: 'uint256' },
      { indexed: true,  name: 'trader',        type: 'address' },
      { indexed: false, name: 'linkedTradeId', type: 'uint256' },
      { indexed: false, name: 'markPrice_E18', type: 'uint128' },
    ],
  },
] as const;

/** Alias for callers that import the legacy name. */
export const VELO_PERPS_ABI = VELO_PERPS_V3_ABI;

// V2 Position ABI (no marginMode field). Used as fallback for legacy reads.
const GET_POSITION_V2_ABI = [
  {
    type: 'function', name: 'getPosition', stateMutability: 'view',
    inputs: [{ name: 'tradeId', type: 'uint256' }],
    outputs: [{
      type: 'tuple',
      components: [
        { name: 'owner',              type: 'address' },
        { name: 'pairIndex',          type: 'uint16'  },
        { name: 'isLong',             type: 'bool'    },
        { name: 'leverage',           type: 'uint16'  },
        { name: 'collateralUSDC_6',   type: 'uint64'  },
        { name: 'entryPrice_E18',     type: 'uint128' },
        { name: 'openedAt',           type: 'uint64'  },
        { name: 'takeProfit_E18',     type: 'uint128' },
        { name: 'stopLoss_E18',       type: 'uint128' },
        { name: 'originalNotional_6', type: 'uint128' },
      ],
    }],
  },
] as const;

// V1 Position ABI (7 fields). Used as last-resort fallback.
const GET_POSITION_V1_ABI = [
  {
    type: 'function', name: 'getPosition', stateMutability: 'view',
    inputs: [{ name: 'tradeId', type: 'uint256' }],
    outputs: [{
      type: 'tuple',
      components: [
        { name: 'owner',            type: 'address' },
        { name: 'pairIndex',        type: 'uint16'  },
        { name: 'isLong',           type: 'bool'    },
        { name: 'leverage',         type: 'uint16'  },
        { name: 'collateralUSDC_6', type: 'uint64'  },
        { name: 'entryPrice_E18',   type: 'uint128' },
        { name: 'openedAt',         type: 'uint64'  },
      ],
    }],
  },
] as const;

const GET_TRADER_TRADES_ABI = [
  {
    type: 'function', name: 'getTraderTrades', stateMutability: 'view',
    inputs: [{ name: 'trader', type: 'address' }],
    outputs: [{ type: 'uint256[]' }],
  },
] as const;

// ── Decimal helpers ──────────────────────────────────────────────────────────
const USDC_DECIMALS = 6;
const PRICE_DECIMALS = 18;
const fromUsdc6 = (v: bigint) => Number(v) / 10 ** USDC_DECIMALS;
const fromE18   = (v: bigint) => Number(v) / 10 ** PRICE_DECIMALS;
const toUsdc6   = (v: number)  => BigInt(Math.floor(v * 10 ** USDC_DECIMALS));
const toE18     = (v: number)  => BigInt(Math.floor(v * 10 ** PRICE_DECIMALS));

const pairIndexToLabel = (idx: number): VeloPairLabel => {
  const label = PAIR_LABEL[idx as PairIndex];
  if (!label) throw new Error(`Unknown pairIndex: ${idx}`);
  return label;
};

// ── Reads ────────────────────────────────────────────────────────────────────

/**
 * Fetch all open positions for `trader` from the contract.
 *
 * Tries V3 ABI first (with marginMode). Falls back to V2 then V1 ABI per-row,
 * so positions opened on legacy contracts still surface read-only. The frontend
 * pin to V3 means new positions are always V3 — fallbacks exist only for
 * mid-migration users with leftover legacy positions.
 */
export async function fetchOpenPositions(
  publicClient: PublicClient,
  trader: Address,
): Promise<VeloPosition[]> {
  let tradeIds: readonly bigint[] = [];
  try {
    tradeIds = await publicClient.readContract({
      address: VELO_PERPS_ADDRESS,
      abi: GET_TRADER_TRADES_ABI,
      functionName: 'getTraderTrades',
      args: [trader],
    });
  } catch (e) {
    console.warn('[veloPerps] getTraderTrades failed', e);
    return [];
  }

  if (tradeIds.length === 0) return [];

  const positions = await Promise.allSettled(
    tradeIds.map(async (id) => {
      let raw: any;
      let marginMode: VeloMarginMode = 'ISOLATED';
      try {
        raw = await publicClient.readContract({
          address: VELO_PERPS_ADDRESS,
          abi: VELO_PERPS_V3_ABI,
          functionName: 'getPosition',
          args: [id],
        });
        // V3 returns marginMode as uint8.
        if (raw.marginMode != null) {
          marginMode = U8_TO_MARGIN_MODE[Number(raw.marginMode)] || 'ISOLATED';
        }
      } catch {
        try {
          raw = await publicClient.readContract({
            address: VELO_PERPS_ADDRESS,
            abi: GET_POSITION_V2_ABI,
            functionName: 'getPosition',
            args: [id],
          });
        } catch {
          raw = await publicClient.readContract({
            address: VELO_PERPS_ADDRESS,
            abi: GET_POSITION_V1_ABI,
            functionName: 'getPosition',
            args: [id],
          });
        }
      }
      const pairIndex = Number(raw.pairIndex) as PairIndex;
      const tpRaw: bigint = raw.takeProfit_E18 != null ? BigInt(raw.takeProfit_E18) : 0n;
      const slRaw: bigint = raw.stopLoss_E18   != null ? BigInt(raw.stopLoss_E18)   : 0n;
      return {
        tradeId:           id,
        owner:             raw.owner,
        pairIndex,
        pair:              pairIndexToLabel(pairIndex),
        isLong:            raw.isLong,
        leverage:          Number(raw.leverage),
        marginMode,
        collateralUSDC_6:  raw.collateralUSDC_6,
        collateralUSDC:    fromUsdc6(raw.collateralUSDC_6),
        entryPrice_E18:    raw.entryPrice_E18,
        entryPrice:        fromE18(raw.entryPrice_E18),
        openedAt:          Number(raw.openedAt),
        takeProfit:        tpRaw > 0n ? fromE18(tpRaw) : undefined,
        stopLoss:          slRaw > 0n ? fromE18(slRaw) : undefined,
      } satisfies VeloPosition;
    }),
  );

  return positions
    .filter((r): r is PromiseFulfilledResult<VeloPosition> => r.status === 'fulfilled')
    .map((r) => r.value);
}

/** Fetch active conditional orders for a trader (V3 only). */
export async function fetchConditionalOrders(
  publicClient: PublicClient,
  trader: Address,
): Promise<VeloConditionalOrder[]> {
  if (!IS_V3) return [];
  let orderIds: readonly bigint[] = [];
  try {
    orderIds = await publicClient.readContract({
      address: VELO_PERPS_ADDRESS,
      abi: VELO_PERPS_V3_ABI,
      functionName: 'getTraderOrders',
      args: [trader],
    });
  } catch (e) {
    console.warn('[veloPerps] getTraderOrders failed', e);
    return [];
  }
  if (orderIds.length === 0) return [];

  const orders = await Promise.allSettled(
    orderIds.map(async (id) => {
      const raw: any = await publicClient.readContract({
        address: VELO_PERPS_ADDRESS,
        abi: VELO_PERPS_V3_ABI,
        functionName: 'conditionalOrders',
        args: [id],
      });
      const pairIndex = Number(raw.pairIndex) as PairIndex;
      return {
        orderId:        id,
        owner:          raw.owner,
        pairIndex,
        pair:           pairIndexToLabel(pairIndex),
        isLong:         raw.isLong,
        leverage:       Number(raw.leverage),
        marginMode:     U8_TO_MARGIN_MODE[Number(raw.marginMode)] || 'ISOLATED',
        triggerKind:    U8_TO_TRIGGER_KIND[Number(raw.triggerKind)] || 'LIMIT',
        reduceOnly:     raw.reduceOnly,
        reduceBps:      Number(raw.reduceBps),
        collateralUSDC: fromUsdc6(BigInt(raw.collateralUSDC_6)),
        triggerPrice:   fromE18(BigInt(raw.triggerPrice_E18)),
        createdAt:      Number(raw.createdAt),
        active:         raw.active,
      } satisfies VeloConditionalOrder;
    }),
  );

  return orders
    .filter((r): r is PromiseFulfilledResult<VeloConditionalOrder> => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((o) => o.active);
}

/** Cross-margin free balance for a trader (V3 only). 0 if not on V3. */
export async function fetchCrossFreeBalance(
  publicClient: PublicClient,
  trader: Address,
): Promise<number> {
  if (!IS_V3) return 0;
  try {
    const raw = await publicClient.readContract({
      address: VELO_PERPS_ADDRESS,
      abi: VELO_PERPS_V3_ABI,
      functionName: 'crossFreeBalance',
      args: [trader],
    });
    return fromUsdc6(raw);
  } catch {
    return 0;
  }
}

/** Cross-margin total balance (free + locked). */
export async function fetchCrossTotalBalance(
  publicClient: PublicClient,
  trader: Address,
): Promise<{ free: number; locked: number; total: number }> {
  if (!IS_V3) return { free: 0, locked: 0, total: 0 };
  try {
    const [total6, locked6] = await Promise.all([
      publicClient.readContract({
        address: VELO_PERPS_ADDRESS, abi: VELO_PERPS_V3_ABI,
        functionName: 'crossBalanceUSDC_6', args: [trader],
      }) as Promise<bigint>,
      publicClient.readContract({
        address: VELO_PERPS_ADDRESS, abi: VELO_PERPS_V3_ABI,
        functionName: 'crossLockedUSDC_6', args: [trader],
      }) as Promise<bigint>,
    ]);
    const total = fromUsdc6(total6);
    const locked = fromUsdc6(locked6);
    return { total, locked, free: Math.max(0, total - locked) };
  } catch {
    return { free: 0, locked: 0, total: 0 };
  }
}

export async function fetchPoolBalance(publicClient: PublicClient): Promise<number> {
  try {
    const raw = await publicClient.readContract({
      address: VELO_PERPS_ADDRESS,
      abi: VELO_PERPS_V3_ABI,
      functionName: 'poolBalance',
    });
    return fromUsdc6(raw);
  } catch {
    return 0;
  }
}

// ── Writes ───────────────────────────────────────────────────────────────────

export interface OpenPositionArgs {
  pair: VeloPairLabel;
  isLong: boolean;
  collateralUSDC: number;
  leverage: number;
  marginMode?: VeloMarginMode;   // V3 only. Defaults to ISOLATED.
}

export interface OpenPositionResult {
  txHash: `0x${string}`;
  tradeId: bigint;
  entryPrice: number;
}

/**
 * Open a new market position.
 *
 * On V3: takes marginMode (ISOLATED/CROSS). For CROSS, collateral is pulled
 * For ISOLATED: approves the contract then calls openPosition (collateral
 * pulled from wallet via safeTransferFrom).
 * For CROSS: checks cross free balance first; if insufficient, auto-deposits
 * the shortfall from the wallet (approve + depositCross) so the user never
 * has to manually manage a separate cross account. Then calls openPosition.
 */
export async function openPosition(
  walletClient: WalletClient,
  publicClient: PublicClient,
  args: OpenPositionArgs,
): Promise<OpenPositionResult> {
  const account = walletClient.account;
  if (!account) throw new Error('Wallet not connected');

  const pairIndex = PAIR_INDEX[args.pair];
  const feedId = PYTH_FEED_IDS[args.pair];
  if (!feedId) throw new Error(`No Pyth feed for ${args.pair}`);

  let { updateData, parsedPrice } = await fetchPriceUpdate([feedId]);
  if (parsedPrice > 0) console.debug(`[velo] openPosition ${args.pair} oracle price: $${parsedPrice.toFixed(4)}`);

  // ── Pre-flight price check: verify Pyth on-chain cache will have a sane price ──
  // The Pyth testnet contract (Base Sepolia) silently no-ops updatePriceFeeds when
  // incoming data is older than the cached value. _readPrice then returns whatever
  // stale (possibly near-zero) value is cached, creating phantom corrupt entry prices.
  //
  // We read the CURRENT on-chain Pyth price, compare it to what Hermes says. If they
  // deviate by >15% (or the on-chain call reverts = stale cache), we wait and re-fetch
  // up to 3 times before aborting with a user-visible error.
  if (parsedPrice > 1) {
    const GET_PRICE_ABI = [{
      type: 'function', name: 'getPriceNoOlderThan', stateMutability: 'view',
      inputs: [{ name: 'id', type: 'bytes32' }, { name: 'age', type: 'uint256' }],
      outputs: [{ type: 'tuple', components: [
        { name: 'price',       type: 'int64'   },
        { name: 'conf',        type: 'uint64'  },
        { name: 'expo',        type: 'int32'   },
        { name: 'publishTime', type: 'uint256' },
      ]}],
    }] as const;

    let priceCheckPassed = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const pp = await publicClient.readContract({
          address: PYTH_CONTRACT_ADDRESS,
          abi: GET_PRICE_ABI,
          functionName: 'getPriceNoOlderThan',
          args: [feedId as `0x${string}`, BigInt(60)],
        }) as { price: bigint; conf: bigint; expo: number; publishTime: bigint };

        const onChainPrice = Number(pp.price) * Math.pow(10, Number(pp.expo));
        const cacheAge = Math.floor(Date.now() / 1000) - Number(pp.publishTime);
        console.debug(`[velo] Pyth on-chain: $${onChainPrice.toFixed(4)}, age=${cacheAge}s`);

        const deviation = Math.abs(onChainPrice - parsedPrice) / parsedPrice;
        if (onChainPrice > 1 && deviation < 0.15) {
          priceCheckPassed = true;
          break;
        }
        console.warn(`[velo] On-chain Pyth ($${onChainPrice.toFixed(6)}) deviates ${(deviation * 100).toFixed(1)}% from Hermes ($${parsedPrice.toFixed(4)}) — attempt ${attempt}/3, refreshing...`);
      } catch {
        // getPriceNoOlderThan reverts when cache is stale — this is the corrupt case
        console.warn(`[velo] getPriceNoOlderThan reverted (stale/cold cache, attempt ${attempt}/3)`);
      }
      await new Promise(r => setTimeout(r, 1500));
      const fresh = await fetchPriceUpdate([feedId]);
      updateData = fresh.updateData;
      parsedPrice = fresh.parsedPrice;
    }

    if (!priceCheckPassed) {
      throw new Error(
        `Pyth oracle on-chain price is stale or corrupt after 3 attempts. ` +
        `The Base Sepolia testnet Pyth contract cache may be cold. ` +
        `Please wait 30–60 seconds and try again.`
      );
    }
  }

  let feeWei = await getExactPythFee(publicClient, updateData);
  const collateral_6 = parseUnits(args.collateralUSDC.toString(), USDC_DECIMALS);

  // ── Shared approve helper ─────────────────────────────────────────────────
  const usdcAbi = [
    { type: 'function', name: 'allowance', stateMutability: 'view',
      inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
    { type: 'function', name: 'approve', stateMutability: 'nonpayable',
      inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
  ] as const;

  async function ensureApproval(amount: bigint) {
    const allowance = await publicClient.readContract({
      address: VELO_USDC_BASE,
      abi: usdcAbi,
      functionName: 'allowance',
      args: [account!.address, VELO_PERPS_ADDRESS],
    }) as bigint;
    if (allowance < amount) {
      const approveTx = await walletClient.writeContract({
        address: VELO_USDC_BASE,
        abi: usdcAbi,
        functionName: 'approve',
        args: [VELO_PERPS_ADDRESS, amount * 10n], // approve 10× for UX
        account,
        chain: walletClient.chain,
      });
      await publicClient.waitForTransactionReceipt({ hash: approveTx });
    }
  }

  let txHash: `0x${string}`;

  if (IS_V3) {
    const mm = args.marginMode || 'ISOLATED';

    if (mm === 'ISOLATED') {
      // ISOLATED: contract pulls collateral from wallet via safeTransferFrom —
      // must approve first.
      await ensureApproval(collateral_6);
    } else {
      // CROSS: contract uses the trader's cross ledger balance.
      // Auto-top-up: if cross free balance < collateral, deposit the shortfall
      // from the wallet so the user never has to manage the cross account manually.
      const crossFree = await publicClient.readContract({
        address: VELO_PERPS_ADDRESS,
        abi: VELO_PERPS_V3_ABI,
        functionName: 'crossFreeBalance',
        args: [account.address],
      }) as bigint;
      if (crossFree < collateral_6) {
        const shortfall = collateral_6 - crossFree;
        await ensureApproval(shortfall);
        const depositHash = await walletClient.writeContract({
          address: VELO_PERPS_ADDRESS,
          abi: [{ type: 'function', name: 'depositCross', stateMutability: 'nonpayable',
            inputs: [{ name: 'amountUSDC_6', type: 'uint64' }], outputs: [] }] as const,
          functionName: 'depositCross',
          args: [shortfall],
          account,
          chain: walletClient.chain,
        });
        await publicClient.waitForTransactionReceipt({ hash: depositHash });
      }
    }

    txHash = await walletClient.writeContract({
      address: VELO_PERPS_ADDRESS,
      abi: VELO_PERPS_V3_ABI,
      functionName: 'openPosition',
      args: [pairIndex, args.isLong, collateral_6, args.leverage, MARGIN_MODE_TO_U8[mm], updateData],
      value: feeWei,
      account,
      chain: walletClient.chain,
    });
  } else {
    // Legacy V1/V2 ABI (no marginMode parameter).
    const legacyAbi = [
      {
        type: 'function', name: 'openPosition', stateMutability: 'payable',
        inputs: [
          { name: 'pairIndex',         type: 'uint16'   },
          { name: 'isLong',            type: 'bool'     },
          { name: 'collateralUSDC_6',  type: 'uint64'   },
          { name: 'leverage',          type: 'uint16'   },
          { name: 'pythUpdateData',    type: 'bytes[]'  },
        ],
        outputs: [{ name: 'tradeId', type: 'uint256' }],
      },
    ] as const;
    txHash = await walletClient.writeContract({
      address: VELO_PERPS_ADDRESS,
      abi: legacyAbi,
      functionName: 'openPosition',
      args: [pairIndex, args.isLong, collateral_6, args.leverage, updateData],
      value: feeWei,
      account,
      chain: walletClient.chain,
    });
  }

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  let tradeId: bigint | null = null;
  let entryPrice = 0;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== VELO_PERPS_ADDRESS.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({ abi: VELO_PERPS_V3_ABI, data: log.data, topics: log.topics });
      if (decoded.eventName === 'PositionOpened') {
        tradeId = (decoded.args as any).tradeId;
        entryPrice = fromE18((decoded.args as any).entryPrice_E18);
        break;
      }
    } catch { /* not our event */ }
  }
  if (tradeId == null) {
    throw new Error('Transaction confirmed but PositionOpened event not found');
  }
  return { txHash, tradeId, entryPrice };
}

export interface ClosePositionResult {
  txHash: `0x${string}`;
  pnlUSDC: number;
  payoutUSDC: number;
  exitPrice: number;
}

export async function closePosition(
  walletClient: WalletClient,
  publicClient: PublicClient,
  tradeId: bigint,
  pair: VeloPairLabel,
): Promise<ClosePositionResult> {
  const account = walletClient.account;
  if (!account) throw new Error('Wallet not connected');

  const feedId = PYTH_FEED_IDS[pair];
  const { updateData, parsedPrice: closeParsedPrice } = await fetchPriceUpdate([feedId]);
  if (closeParsedPrice > 0) console.debug(`[velo] closePosition ${pair} oracle price: $${closeParsedPrice.toFixed(4)}`);
  const feeWei = await getExactPythFee(publicClient, updateData);

  const txHash = await walletClient.writeContract({
    address: VELO_PERPS_ADDRESS,
    abi: VELO_PERPS_V3_ABI,
    functionName: 'closePosition',
    args: [tradeId, updateData],
    value: feeWei,
    account,
    chain: walletClient.chain,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  let pnlUSDC = 0, payoutUSDC = 0, exitPrice = 0;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== VELO_PERPS_ADDRESS.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({ abi: VELO_PERPS_V3_ABI, data: log.data, topics: log.topics });
      if (decoded.eventName === 'PositionClosed') {
        pnlUSDC    = Number((decoded.args as any).pnlUSDC_6) / 10 ** USDC_DECIMALS;
        payoutUSDC = fromUsdc6((decoded.args as any).payoutUSDC_6);
        exitPrice  = fromE18((decoded.args as any).exitPrice_E18);
        break;
      }
    } catch { /* not our event */ }
  }
  return { txHash, pnlUSDC, payoutUSDC, exitPrice };
}

export const baseScanTxUrl = (txHash: string) => `https://sepolia.basescan.org/tx/${txHash}`;
export const baseScanAddressUrl = (addr: string) => `https://sepolia.basescan.org/address/${addr}`;

// ─────────────────────────────────────────────────────────────────────────────
//  V2/V3 helpers (require IS_V2)
// ─────────────────────────────────────────────────────────────────────────────

export async function addMargin(
  walletClient: WalletClient,
  publicClient: PublicClient,
  tradeId: bigint,
  amountUSDC: number,
): Promise<{ txHash: `0x${string}` }> {
  const account = walletClient.account;
  if (!account) throw new Error('Wallet not connected');
  const amount_6 = toUsdc6(amountUSDC);

  // For V3, increaseCollateral on a CROSS position pulls from cross balance;
  // on ISOLATED it does safeTransferFrom. Approval is only needed for ISOLATED.
  // We check allowance and approve if needed — harmless on CROSS (the tx still
  // succeeds with the cross-balance path).
  const allowance = await publicClient.readContract({
    address: VELO_USDC_BASE,
    abi: [{ type: 'function', name: 'allowance', stateMutability: 'view',
      inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] }],
    functionName: 'allowance',
    args: [account.address, VELO_PERPS_ADDRESS],
  }) as bigint;
  if (allowance < amount_6) {
    const approveTx = await walletClient.writeContract({
      address: VELO_USDC_BASE,
      abi: [{ type: 'function', name: 'approve', stateMutability: 'nonpayable',
        inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] }],
      functionName: 'approve',
      args: [VELO_PERPS_ADDRESS, amount_6 * 2n],
      account, chain: walletClient.chain,
    });
    await publicClient.waitForTransactionReceipt({ hash: approveTx });
  }

  const txHash = await walletClient.writeContract({
    address: VELO_PERPS_ADDRESS,
    abi: VELO_PERPS_V3_ABI,
    functionName: 'increaseCollateral',
    args: [tradeId, amount_6],
    account, chain: walletClient.chain,
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return { txHash };
}

export async function reduceMargin(
  walletClient: WalletClient,
  publicClient: PublicClient,
  tradeId: bigint,
  amountUSDC: number,
  pythUpdateData: `0x${string}`[],
  pythFee: bigint,
): Promise<{ txHash: `0x${string}` }> {
  const account = walletClient.account;
  if (!account) throw new Error('Wallet not connected');
  const amount_6 = toUsdc6(amountUSDC);

  const txHash = await walletClient.writeContract({
    address: VELO_PERPS_ADDRESS,
    abi: VELO_PERPS_V3_ABI,
    functionName: 'decreaseCollateral',
    args: [tradeId, amount_6, pythUpdateData],
    value: pythFee,
    account, chain: walletClient.chain,
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return { txHash };
}

export async function partialClose(
  walletClient: WalletClient,
  publicClient: PublicClient,
  tradeId: bigint,
  fractionBps: number,
  pythUpdateData: `0x${string}`[],
  pythFee: bigint,
): Promise<{ txHash: `0x${string}` }> {
  const account = walletClient.account;
  if (!account) throw new Error('Wallet not connected');
  if (fractionBps < 1 || fractionBps > 10_000) throw new Error('fractionBps out of range');

  const txHash = await walletClient.writeContract({
    address: VELO_PERPS_ADDRESS,
    abi: VELO_PERPS_V3_ABI,
    functionName: 'partialClose',
    args: [tradeId, fractionBps, pythUpdateData],
    value: pythFee,
    account, chain: walletClient.chain,
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return { txHash };
}

export async function setTriggers(
  walletClient: WalletClient,
  publicClient: PublicClient,
  tradeId: bigint,
  takeProfit: number,
  stopLoss: number,
): Promise<{ txHash: `0x${string}` }> {
  const account = walletClient.account;
  if (!account) throw new Error('Wallet not connected');
  const tp_E18 = toE18(takeProfit);
  const sl_E18 = toE18(stopLoss);

  const txHash = await walletClient.writeContract({
    address: VELO_PERPS_ADDRESS,
    abi: VELO_PERPS_V3_ABI,
    functionName: 'setTriggers',
    args: [tradeId, tp_E18, sl_E18],
    account, chain: walletClient.chain,
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return { txHash };
}

// ─────────────────────────────────────────────────────────────────────────────
//  V3-only helpers (cross account + conditional orders)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deposit mUSDC into the cross-margin account. Caller must have approved the
 * contract for at least amountUSDC. Returns the approve tx hash (if any) and
 * the deposit tx hash.
 */
export async function depositCross(
  walletClient: WalletClient,
  publicClient: PublicClient,
  amountUSDC: number,
): Promise<{ txHash: `0x${string}` }> {
  if (!IS_V3) throw new Error('depositCross requires V3');
  const account = walletClient.account;
  if (!account) throw new Error('Wallet not connected');
  const amount_6 = toUsdc6(amountUSDC);

  const allowance = await publicClient.readContract({
    address: VELO_USDC_BASE,
    abi: [{ type: 'function', name: 'allowance', stateMutability: 'view',
      inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] }],
    functionName: 'allowance',
    args: [account.address, VELO_PERPS_ADDRESS],
  }) as bigint;
  if (allowance < amount_6) {
    const approveTx = await walletClient.writeContract({
      address: VELO_USDC_BASE,
      abi: [{ type: 'function', name: 'approve', stateMutability: 'nonpayable',
        inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] }],
      functionName: 'approve',
      args: [VELO_PERPS_ADDRESS, amount_6 * 2n],
      account, chain: walletClient.chain,
    });
    await publicClient.waitForTransactionReceipt({ hash: approveTx });
  }

  const txHash = await walletClient.writeContract({
    address: VELO_PERPS_ADDRESS,
    abi: VELO_PERPS_V3_ABI,
    functionName: 'depositCross',
    args: [amount_6],
    account, chain: walletClient.chain,
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return { txHash };
}

export async function withdrawCross(
  walletClient: WalletClient,
  publicClient: PublicClient,
  amountUSDC: number,
): Promise<{ txHash: `0x${string}` }> {
  if (!IS_V3) throw new Error('withdrawCross requires V3');
  const account = walletClient.account;
  if (!account) throw new Error('Wallet not connected');
  const amount_6 = toUsdc6(amountUSDC);

  const txHash = await walletClient.writeContract({
    address: VELO_PERPS_ADDRESS,
    abi: VELO_PERPS_V3_ABI,
    functionName: 'withdrawCross',
    args: [amount_6],
    account, chain: walletClient.chain,
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return { txHash };
}

export interface PlaceConditionalOrderArgs {
  pair: VeloPairLabel;
  isLong: boolean;
  leverage: number;
  marginMode: VeloMarginMode;
  triggerKind: VeloTriggerKind;
  triggerPrice: number;
  collateralUSDC: number;   // ignored if reduceOnly
  reduceOnly: boolean;
  reduceBps?: number;       // required if reduceOnly. 1..10000.
}

export interface PlaceConditionalOrderResult {
  txHash: `0x${string}`;
  orderId: bigint;
}

/**
 * Place a conditional order. For non-reduceOnly ISOLATED orders, mUSDC
 * collateral is escrowed in the contract until the order executes or is
 * cancelled. For CROSS orders, collateral is only checked at place time
 * and locked at execute time (matches V3 behaviour).
 */
export async function placeConditionalOrder(
  walletClient: WalletClient,
  publicClient: PublicClient,
  args: PlaceConditionalOrderArgs,
): Promise<PlaceConditionalOrderResult> {
  if (!IS_V3) throw new Error('placeConditionalOrder requires V3');
  const account = walletClient.account;
  if (!account) throw new Error('Wallet not connected');

  const pairIndex = PAIR_INDEX[args.pair];
  const collateral_6 = args.reduceOnly ? 0n : toUsdc6(args.collateralUSDC);
  const reduceBps = args.reduceOnly ? (args.reduceBps ?? 10_000) : 0;

  // For non-reduceOnly ISOLATED, the contract pulls collateral up-front;
  // approve first.
  if (!args.reduceOnly && args.marginMode === 'ISOLATED' && collateral_6 > 0n) {
    const allowance = await publicClient.readContract({
      address: VELO_USDC_BASE,
      abi: [{ type: 'function', name: 'allowance', stateMutability: 'view',
        inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] }],
      functionName: 'allowance',
      args: [account.address, VELO_PERPS_ADDRESS],
    }) as bigint;
    if (allowance < collateral_6) {
      const approveTx = await walletClient.writeContract({
        address: VELO_USDC_BASE,
        abi: [{ type: 'function', name: 'approve', stateMutability: 'nonpayable',
          inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] }],
        functionName: 'approve',
        args: [VELO_PERPS_ADDRESS, collateral_6 * 2n],
        account, chain: walletClient.chain,
      });
      await publicClient.waitForTransactionReceipt({ hash: approveTx });
    }
  }

  const txHash = await walletClient.writeContract({
    address: VELO_PERPS_ADDRESS,
    abi: VELO_PERPS_V3_ABI,
    functionName: 'placeConditionalOrder',
    args: [{
      pairIndex,
      isLong: args.isLong,
      leverage: args.leverage,
      marginMode: MARGIN_MODE_TO_U8[args.marginMode],
      triggerKind: TRIGGER_KIND_TO_U8[args.triggerKind],
      triggerPrice_E18: toE18(args.triggerPrice),
      collateralUSDC_6: collateral_6,
      reduceOnly: args.reduceOnly,
      reduceBps,
    }],
    account, chain: walletClient.chain,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  let orderId: bigint | null = null;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== VELO_PERPS_ADDRESS.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({ abi: VELO_PERPS_V3_ABI, data: log.data, topics: log.topics });
      if (decoded.eventName === 'ConditionalOrderPlaced') {
        orderId = (decoded.args as any).orderId;
        break;
      }
    } catch { /* not our event */ }
  }
  if (orderId == null) {
    throw new Error('Transaction confirmed but ConditionalOrderPlaced event not found');
  }
  return { txHash, orderId };
}

export async function cancelConditionalOrder(
  walletClient: WalletClient,
  publicClient: PublicClient,
  orderId: bigint,
): Promise<{ txHash: `0x${string}` }> {
  if (!IS_V3) throw new Error('cancelConditionalOrder requires V3');
  const account = walletClient.account;
  if (!account) throw new Error('Wallet not connected');

  const txHash = await walletClient.writeContract({
    address: VELO_PERPS_ADDRESS,
    abi: VELO_PERPS_V3_ABI,
    functionName: 'cancelConditionalOrder',
    args: [orderId],
    account, chain: walletClient.chain,
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return { txHash };
}
