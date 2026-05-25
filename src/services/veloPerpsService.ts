/**
 * veloPerpsService — wrapper around the VeloPerps contract.
 *
 * Pure functions that take a wagmi/viem walletClient or publicClient and:
 *   • read positions from the contract (single source of truth)
 *   • build + submit openPosition / closePosition / liquidate transactions
 *   • return tx hash + position id from event logs
 *
 * The hook (useVeloPerpsTrading.ts) polls these read functions every 5s and
 * exposes the write functions to UI. No optimistic state is ever inserted —
 * the array of positions IS what the contract says, period.
 */
import {
  type Address,
  type PublicClient,
  type WalletClient,
  decodeEventLog,
  parseUnits,
} from 'viem';
import { fetchPriceUpdate, PYTH_FEED_IDS } from './pythService';

// ── Contract address ──────────────────────────────────────────────────────────
// Verified deployment on Base Sepolia (chain 84532). Source-verified on BaseScan.
//
// V2 routing: if VITE_VELO_PERPS_V2_ADDRESS is set, all NEW positions open on V2.
// Existing V1 positions still load via VITE_VELO_PERPS_ADDRESS (the V1 address)
// so anyone who opened pre-V2 can still manage/close them. Frontend reads
// `version()` on each contract to pick the right ABI surface.
export const VELO_PERPS_V1_ADDRESS = (import.meta.env.VITE_VELO_PERPS_ADDRESS ||
  '0x28fE36d4ae72ab0E05fa6edafE1D6e11E9DD6163') as Address;

export const VELO_PERPS_V2_ADDRESS = (import.meta.env.VITE_VELO_PERPS_V2_ADDRESS ||
  '0x3C7cBCa2C675F1f788148aaD08eceab262298de8') as Address;

/** The contract address new positions are opened against. V2 if deployed, else V1. */
export const VELO_PERPS_ADDRESS: Address = (VELO_PERPS_V2_ADDRESS && VELO_PERPS_V2_ADDRESS.length === 42)
  ? VELO_PERPS_V2_ADDRESS
  : VELO_PERPS_V1_ADDRESS;

/** True when the frontend is routing to V2. */
export const IS_V2: boolean = VELO_PERPS_ADDRESS.toLowerCase() === VELO_PERPS_V2_ADDRESS.toLowerCase()
  && VELO_PERPS_V2_ADDRESS.length === 42;

export const VELO_USDC_BASE = (import.meta.env.VITE_VELO_USDC_BASE ||
  '0x5EFaF3F69b09bC2abF3439bDC0C93bf611026699') as Address;

// ── Domain types ──────────────────────────────────────────────────────────────

export type PairIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16;

export type VeloPairLabel =
  | 'BTC-USD'    | 'ETH-USD'    | 'SOL-USD'    | 'AVAX-USD'
  | 'LINK-USD'   | 'DOGE-USD'   | 'NEAR-USD'   | 'INJ-USD'
  | 'APT-USD'    | 'ARB-USD'    | 'OP-USD'     | 'SUI-USD'
  | 'TIA-USD'    | 'SEI-USD'    | 'RENDER-USD' | 'WLFI-USD'
  | 'POL-USD';

/**
 * On-chain pair indices. Must match what was registered on the VeloPerps
 * contract via DeployBaseSepolia + RegisterPairs scripts.
 *
 * Slots 0–5 are registered at deploy time (BTC/ETH/SOL/AVAX/LINK/DOGE).
 * Slots 6+ are registered via the Admin Panel's "Register all pending" flow
 * — they're known to the frontend but only become tradable once on-chain.
 */
export const PAIR_INDEX: Record<VeloPairLabel, PairIndex> = {
  'BTC-USD':    0,
  'ETH-USD':    1,
  'SOL-USD':    2,
  'AVAX-USD':   3,
  'LINK-USD':   4,
  'DOGE-USD':   5,
  'NEAR-USD':   6,
  'INJ-USD':    7,
  'APT-USD':    8,
  'ARB-USD':    9,
  'OP-USD':     10,
  'SUI-USD':    11,
  'TIA-USD':    12,
  'SEI-USD':    13,
  'RENDER-USD': 14,
  'WLFI-USD':   15,
  'POL-USD':    16,
};

export const PAIR_LABEL: Record<PairIndex, VeloPairLabel> = {
  0:  'BTC-USD',
  1:  'ETH-USD',
  2:  'SOL-USD',
  3:  'AVAX-USD',
  4:  'LINK-USD',
  5:  'DOGE-USD',
  6:  'NEAR-USD',
  7:  'INJ-USD',
  8:  'APT-USD',
  9:  'ARB-USD',
  10: 'OP-USD',
  11: 'SUI-USD',
  12: 'TIA-USD',
  13: 'SEI-USD',
  14: 'RENDER-USD',
  15: 'WLFI-USD',
  16: 'POL-USD',
};

/**
 * Convert a UI pair id (e.g. "BTC/USD") to a Velo pair label ("BTC-USD"),
 * returning null if the pair isn't supported on-chain.
 */
export function uiPairToVeloPair(uiPair: string): VeloPairLabel | null {
  const normalized = uiPair.replace('/', '-') as VeloPairLabel;
  return normalized in PAIR_INDEX ? normalized : null;
}

/**
 * Convert a Velo pair label back to UI format. "BTC-USD" -> "BTC/USD".
 */
export function veloPairToUiPair(veloPair: VeloPairLabel): string {
  return veloPair.replace('-', '/');
}

/**
 * Mirror of the on-chain `Position` struct with native JS numbers/strings.
 * Decimals: collateral is in 6dp USDC, prices in 18dp ("E18").
 * pnl is computed off-chain from the current oracle price at read time.
 */
export interface VeloPosition {
  tradeId: bigint;
  owner: Address;
  pairIndex: PairIndex;
  pair: VeloPairLabel;
  isLong: boolean;
  leverage: number;
  collateralUSDC_6: bigint;   // raw 1e6 USDC units
  collateralUSDC: number;     // 1.0 = $1 (display)
  entryPrice_E18: bigint;     // raw 1e18 units
  entryPrice: number;         // display
  openedAt: number;           // unix seconds
  openTxHash?: `0x${string}`; // populated from event scan; optional pre-rewire
}

// ── ABI ───────────────────────────────────────────────────────────────────────
// Minimal — only the symbols the frontend touches. Keeps bundle small and
// makes the surface explicit.
export const VELO_PERPS_ABI = [
  // ── Constants (view) ──
  { type: 'function', name: 'MAX_LEVERAGE',                stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'LIQUIDATION_THRESHOLD_BPS',   stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'OPEN_FEE_BPS',                stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'CLOSE_FEE_BPS',               stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  // ── Ownership + fees ──
  { type: 'function', name: 'owner',                       stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'feeBalance',                  stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'nextTradeId',                 stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    type: 'function', name: 'quoteUnrealisedPnL', stateMutability: 'view',
    inputs: [{ name: 'tradeId', type: 'uint256' }],
    outputs: [
      { name: 'pnl_6', type: 'int256' },
      { name: 'markPrice_E18', type: 'uint256' },
    ],
  },
  {
    type: 'function', name: 'liquidate', stateMutability: 'payable',
    inputs: [
      { name: 'tradeId', type: 'uint256' },
      { name: 'pythUpdateData', type: 'bytes[]' },
    ],
    outputs: [],
  },
  // ── Pair registry ──
  { type: 'function', name: 'pairFeedId',  stateMutability: 'view', inputs: [{ type: 'uint16' }], outputs: [{ type: 'bytes32' }] },
  { type: 'function', name: 'pairLabel',   stateMutability: 'view', inputs: [{ type: 'uint16' }], outputs: [{ type: 'string'  }] },
  { type: 'function', name: 'pairTradable',stateMutability: 'view', inputs: [{ type: 'uint16' }], outputs: [{ type: 'bool'    }] },
  // ── Owner-only writes ──
  {
    type: 'function', name: 'registerPair', stateMutability: 'nonpayable',
    inputs: [
      { name: 'pairIndex', type: 'uint16' },
      { name: 'feedId',    type: 'bytes32' },
      { name: 'label',     type: 'string' },
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
  // ── V2-only methods (revert on V1) ────────────────────────────────────
  { type: 'function', name: 'version', stateMutability: 'pure', inputs: [], outputs: [{ type: 'uint16' }] },
  {
    type: 'function', name: 'increaseCollateral', stateMutability: 'nonpayable',
    inputs: [
      { name: 'tradeId',        type: 'uint256' },
      { name: 'amountUSDC_6',   type: 'uint64' },
    ],
    outputs: [],
  },
  {
    type: 'function', name: 'decreaseCollateral', stateMutability: 'payable',
    inputs: [
      { name: 'tradeId',        type: 'uint256' },
      { name: 'amountUSDC_6',   type: 'uint64' },
      { name: 'pythUpdateData', type: 'bytes[]' },
    ],
    outputs: [],
  },
  {
    type: 'function', name: 'partialClose', stateMutability: 'payable',
    inputs: [
      { name: 'tradeId',        type: 'uint256' },
      { name: 'fractionBps',    type: 'uint16' },
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
    inputs: [
      { name: 'tradeId',        type: 'uint256' },
      { name: 'pythUpdateData', type: 'bytes[]' },
    ],
    outputs: [],
  },
  {
    type: 'function', name: 'effectiveLeverage', stateMutability: 'view',
    inputs: [{ name: 'tradeId', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
  },
  // ── Reads ──
  {
    type: 'function', name: 'getTraderTrades', stateMutability: 'view',
    inputs: [{ name: 'trader', type: 'address' }],
    outputs: [{ type: 'uint256[]' }],
  },
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
  {
    type: 'function', name: 'quoteUnrealisedPnL', stateMutability: 'view',
    inputs: [{ name: 'tradeId', type: 'uint256' }],
    outputs: [
      { name: 'pnl_6',         type: 'int256'  },
      { name: 'markPrice_E18', type: 'uint256' },
    ],
  },
  { type: 'function', name: 'poolBalance', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  // ── Writes ──
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
  {
    type: 'function', name: 'closePosition', stateMutability: 'payable',
    inputs: [
      { name: 'tradeId',         type: 'uint256' },
      { name: 'pythUpdateData',  type: 'bytes[]' },
    ],
    outputs: [],
  },
  {
    type: 'function', name: 'liquidate', stateMutability: 'payable',
    inputs: [
      { name: 'tradeId',         type: 'uint256' },
      { name: 'pythUpdateData',  type: 'bytes[]' },
    ],
    outputs: [],
  },
  // ── Events ──
  {
    type: 'event', name: 'PositionOpened',
    inputs: [
      { indexed: true,  name: 'tradeId',          type: 'uint256' },
      { indexed: true,  name: 'trader',           type: 'address' },
      { indexed: true,  name: 'pairIndex',        type: 'uint16'  },
      { indexed: false, name: 'isLong',           type: 'bool'    },
      { indexed: false, name: 'leverage',         type: 'uint16'  },
      { indexed: false, name: 'collateralUSDC_6', type: 'uint64'  },
      { indexed: false, name: 'entryPrice_E18',   type: 'uint128' },
    ],
  },
  {
    type: 'event', name: 'PositionClosed',
    inputs: [
      { indexed: true,  name: 'tradeId',         type: 'uint256' },
      { indexed: true,  name: 'trader',          type: 'address' },
      { indexed: true,  name: 'pairIndex',       type: 'uint16'  },
      { indexed: false, name: 'exitPrice_E18',   type: 'uint128' },
      { indexed: false, name: 'pnlUSDC_6',       type: 'int256'  },
      { indexed: false, name: 'payoutUSDC_6',    type: 'uint64'  },
      { indexed: false, name: 'feeUSDC_6',       type: 'uint64'  },
    ],
  },
] as const;

// ── Decimal helpers ───────────────────────────────────────────────────────────
const USDC_DECIMALS = 6;
const PRICE_DECIMALS = 18;

const fromUsdc6 = (v: bigint) => Number(v) / 10 ** USDC_DECIMALS;
const fromE18   = (v: bigint) => Number(v) / 10 ** PRICE_DECIMALS;

const pairIndexToLabel = (idx: number): VeloPairLabel => {
  const label = PAIR_LABEL[idx as PairIndex];
  if (!label) throw new Error(`Unknown pairIndex: ${idx}`);
  return label;
};

// ── Reads ─────────────────────────────────────────────────────────────────────

/**
 * Fetch all open positions for `trader` from the contract.
 * Two-step pattern because there's no `getAllPositions(trader)` reader on the
 * contract — we first ask for the list of trade ids, then resolve each one.
 *
 * Returns an empty array if the trader has no open positions or any call fails.
 */
export async function fetchOpenPositions(
  publicClient: PublicClient,
  trader: Address,
): Promise<VeloPosition[]> {
  let tradeIds: readonly bigint[] = [];
  try {
    tradeIds = await publicClient.readContract({
      address: VELO_PERPS_ADDRESS,
      abi: VELO_PERPS_ABI,
      functionName: 'getTraderTrades',
      args: [trader],
    });
  } catch (e) {
    console.warn('[veloPerps] getTraderTrades failed', e);
    return [];
  }

  if (tradeIds.length === 0) return [];

  // Resolve each id in parallel. Failure of one row doesn't blow up the rest.
  const positions = await Promise.allSettled(
    tradeIds.map(async (id) => {
      const raw = await publicClient.readContract({
        address: VELO_PERPS_ADDRESS,
        abi: VELO_PERPS_ABI,
        functionName: 'getPosition',
        args: [id],
      });
      // The struct uses BigInt for several fields; we narrow to safer JS types.
      const pairIndex = Number(raw.pairIndex) as PairIndex;
      return {
        tradeId:           id,
        owner:             raw.owner,
        pairIndex,
        pair:              pairIndexToLabel(pairIndex),
        isLong:            raw.isLong,
        leverage:          Number(raw.leverage),
        collateralUSDC_6:  raw.collateralUSDC_6,
        collateralUSDC:    fromUsdc6(raw.collateralUSDC_6),
        entryPrice_E18:    raw.entryPrice_E18,
        entryPrice:        fromE18(raw.entryPrice_E18),
        openedAt:          Number(raw.openedAt),
      } satisfies VeloPosition;
    }),
  );

  return positions
    .filter((r): r is PromiseFulfilledResult<VeloPosition> => r.status === 'fulfilled')
    .map((r) => r.value);
}

/** Pool reserves in display USDC (display = pretty-printable as $1234.56). */
export async function fetchPoolBalance(publicClient: PublicClient): Promise<number> {
  try {
    const raw = await publicClient.readContract({
      address: VELO_PERPS_ADDRESS,
      abi: VELO_PERPS_ABI,
      functionName: 'poolBalance',
    });
    return fromUsdc6(raw);
  } catch {
    return 0;
  }
}

// ── Writes ────────────────────────────────────────────────────────────────────

export interface OpenPositionArgs {
  pair: VeloPairLabel;
  isLong: boolean;
  collateralUSDC: number;    // human-readable, e.g. 100 for $100
  leverage: number;          // 1..25
}

export interface OpenPositionResult {
  txHash: `0x${string}`;
  tradeId: bigint;
  entryPrice: number;
}

/**
 * Open a new market position.
 *
 * Fetches a fresh Pyth update from Hermes, then submits the tx with the
 * required Pyth update fee in msg.value. Returns the new trade id parsed
 * out of the PositionOpened event.
 *
 * Caller is responsible for USDC.approve() in advance — see veloUsdcService.
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

  // 1. Pull a fresh price update from Hermes. Pyth charges a tiny fee
  //    (typically < 0.0001 ETH) which we'll send as msg.value.
  const { updateData, feeWei } = await fetchPriceUpdate([feedId]);

  // 2. Convert collateral to 1e6 USDC units. uint64 max is ~1.8e19, easily
  //    fits any sensible trade size.
  const collateral_6 = parseUnits(args.collateralUSDC.toString(), USDC_DECIMALS);

  // 3. Submit. Caller's wallet pays gas + Pyth fee in one tx.
  const txHash = await walletClient.writeContract({
    address: VELO_PERPS_ADDRESS,
    abi: VELO_PERPS_ABI,
    functionName: 'openPosition',
    args: [pairIndex, args.isLong, collateral_6, args.leverage, updateData],
    value: feeWei,
    account,
    chain: walletClient.chain,
  });

  // 4. Wait for receipt + decode the PositionOpened event for the trade id.
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  let tradeId: bigint | null = null;
  let entryPrice = 0;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== VELO_PERPS_ADDRESS.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({ abi: VELO_PERPS_ABI, data: log.data, topics: log.topics });
      if (decoded.eventName === 'PositionOpened') {
        tradeId = decoded.args.tradeId;
        entryPrice = fromE18(decoded.args.entryPrice_E18);
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

/** Close a position fully. Only the position owner may call this. */
export async function closePosition(
  walletClient: WalletClient,
  publicClient: PublicClient,
  tradeId: bigint,
  pair: VeloPairLabel,
): Promise<ClosePositionResult> {
  const account = walletClient.account;
  if (!account) throw new Error('Wallet not connected');

  const feedId = PYTH_FEED_IDS[pair];
  const { updateData, feeWei } = await fetchPriceUpdate([feedId]);

  const txHash = await walletClient.writeContract({
    address: VELO_PERPS_ADDRESS,
    abi: VELO_PERPS_ABI,
    functionName: 'closePosition',
    args: [tradeId, updateData],
    value: feeWei,
    account,
    chain: walletClient.chain,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  // Decode the PositionClosed event for the realised PnL + payout.
  let pnlUSDC = 0, payoutUSDC = 0, exitPrice = 0;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== VELO_PERPS_ADDRESS.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({ abi: VELO_PERPS_ABI, data: log.data, topics: log.topics });
      if (decoded.eventName === 'PositionClosed') {
        pnlUSDC    = Number(decoded.args.pnlUSDC_6) / 10 ** USDC_DECIMALS;
        payoutUSDC = fromUsdc6(decoded.args.payoutUSDC_6);
        exitPrice  = fromE18(decoded.args.exitPrice_E18);
        break;
      }
    } catch { /* not our event */ }
  }
  return { txHash, pnlUSDC, payoutUSDC, exitPrice };
}

/** BaseScan tx URL helper — used by UI everywhere a tx hash is rendered. */
export const baseScanTxUrl = (txHash: string) => `https://sepolia.basescan.org/tx/${txHash}`;
export const baseScanAddressUrl = (addr: string) => `https://sepolia.basescan.org/address/${addr}`;

// ═══════════════════════════════════════════════════════════════════════════
//  V2-only helpers
// ═══════════════════════════════════════════════════════════════════════════
//
// Each of these reverts on the V1 contract. UI must gate on IS_V2 before
// surfacing the corresponding button. The keeper for closeIfTriggered runs
// server-side in api/cron-tp-sl.ts.

/** Add margin to an open position. Lowers liquidation risk + effective leverage. */
export async function addMargin(
  walletClient: WalletClient,
  publicClient: PublicClient,
  tradeId: bigint,
  amountUSDC: number,
): Promise<{ txHash: `0x${string}` }> {
  const account = walletClient.account;
  if (!account) throw new Error('Wallet not connected');
  const amount_6 = BigInt(Math.floor(amountUSDC * 10 ** USDC_DECIMALS));

  // Approve first if needed (collateral pulled via safeTransferFrom)
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
      args: [VELO_PERPS_ADDRESS, amount_6 * 2n], // headroom
      account, chain: walletClient.chain,
    });
    await publicClient.waitForTransactionReceipt({ hash: approveTx });
  }

  const txHash = await walletClient.writeContract({
    address: VELO_PERPS_ADDRESS,
    abi: VELO_PERPS_ABI,
    functionName: 'increaseCollateral',
    args: [tradeId, amount_6],
    account, chain: walletClient.chain,
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return { txHash };
}

/** Remove margin from an open position. Raises liquidation risk. */
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
  const amount_6 = BigInt(Math.floor(amountUSDC * 10 ** USDC_DECIMALS));

  const txHash = await walletClient.writeContract({
    address: VELO_PERPS_ADDRESS,
    abi: VELO_PERPS_ABI,
    functionName: 'decreaseCollateral',
    args: [tradeId, amount_6, pythUpdateData],
    value: pythFee,
    account, chain: walletClient.chain,
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return { txHash };
}

/** Partial close — fractionBps in [1, 10000]. 10000 == full close. */
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
    abi: VELO_PERPS_ABI,
    functionName: 'partialClose',
    args: [tradeId, fractionBps, pythUpdateData],
    value: pythFee,
    account, chain: walletClient.chain,
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return { txHash };
}

/**
 * Write TP/SL trigger prices to the contract. Pass 0 to clear either.
 * Direction is enforced on-chain (TP > entry for longs, TP < entry for shorts).
 */
export async function setTriggers(
  walletClient: WalletClient,
  publicClient: PublicClient,
  tradeId: bigint,
  takeProfit: number,  // 0 to clear
  stopLoss: number,    // 0 to clear
): Promise<{ txHash: `0x${string}` }> {
  const account = walletClient.account;
  if (!account) throw new Error('Wallet not connected');
  const tp_E18 = BigInt(Math.floor(takeProfit * 1e18));
  const sl_E18 = BigInt(Math.floor(stopLoss   * 1e18));

  const txHash = await walletClient.writeContract({
    address: VELO_PERPS_ADDRESS,
    abi: VELO_PERPS_ABI,
    functionName: 'setTriggers',
    args: [tradeId, tp_E18, sl_E18],
    account, chain: walletClient.chain,
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return { txHash };
}
