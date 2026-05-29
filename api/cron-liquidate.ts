// api/cron-liquidate.ts
//
// Liquidation keeper for VeloPerps. V3-primary; falls back to V2.
//
// For each open position, compares unrealised PnL against the configured
// liquidation threshold. When pnl <= -threshold * collateral, calls
// liquidate(tradeId, pythUpdateData). Liquidator earns 1% bounty of collateral.

import { createPublicClient, createWalletClient, http, type Abi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

const CORE_ABI: Abi = [
  { type: 'function', name: 'nextTradeId', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'VERSION', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint16' }] },
  { type: 'function', name: 'version', stateMutability: 'pure', inputs: [], outputs: [{ type: 'uint16' }] },
  { type: 'function', name: 'LIQUIDATION_THRESHOLD_BPS', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'pairFeedId', stateMutability: 'view', inputs: [{ type: 'uint16' }], outputs: [{ type: 'bytes32' }] },
  {
    type: 'function', name: 'quoteUnrealisedPnL', stateMutability: 'view',
    inputs: [{ name: 'tradeId', type: 'uint256' }],
    outputs: [{ name: 'pnl_6', type: 'int256' }, { name: 'markPrice_E18', type: 'uint256' }],
  },
  {
    type: 'function', name: 'liquidate', stateMutability: 'payable',
    inputs: [{ name: 'tradeId', type: 'uint256' }, { name: 'pythUpdateData', type: 'bytes[]' }],
    outputs: [],
  },
];

// V3 Position struct — MUST match contracts/src/VeloPerpsV3.sol layout.
const POSITION_V3_ABI: Abi = [
  {
    type: 'function', name: 'getPosition', stateMutability: 'view',
    inputs: [{ type: 'uint256' }],
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
];

const POSITION_V2_ABI: Abi = [
  {
    type: 'function', name: 'getPosition', stateMutability: 'view',
    inputs: [{ type: 'uint256' }],
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
];

const V3 = (process.env.VITE_VELO_PERPS_V3_ADDRESS as `0x${string}`) || '';
const V2 = (process.env.VITE_VELO_PERPS_V2_ADDRESS as `0x${string}`) || '';
const FALLBACK = (process.env.VITE_VELO_PERPS_ADDRESS as `0x${string}`) || '0x28fE36d4ae72ab0E05fa6edafE1D6e11E9DD6163';
const PERPS = (V3 && V3.length === 42) ? V3 : ((V2 && V2.length === 42) ? V2 : FALLBACK);
const HERMES_URL = process.env.VITE_PYTH_HERMES_URL || 'https://hermes.pyth.network';

// Pyth contract on Base Sepolia. liquidate routes through _extractPrice, which
// enforces msg.value == PYTH.getUpdateFee(updateData) exactly. Read it on-chain.
const PYTH_ADDRESS = (process.env.VITE_PYTH_CONTRACT_ADDRESS as `0x${string}`) ||
  '0xA2aa501b19aff244D90cc15a4Cf739D2725B5729';
const PYTH_FEE_ABI: Abi = [
  { type: 'function', name: 'getUpdateFee', stateMutability: 'view',
    inputs: [{ name: 'updateData', type: 'bytes[]' }],
    outputs: [{ name: 'feeAmount', type: 'uint256' }] },
];

// Mirror of PerpsMath.normalisePythPrice — (price, expo) -> 18-dec fixed point.
function normalisePythPriceE18(price: bigint, expo: number): bigint {
  if (price <= 0n) throw new Error('bad pyth price');
  if (expo > 0) throw new Error('bad pyth expo');
  const absExpo = -expo;
  return absExpo <= 18
    ? price * 10n ** BigInt(18 - absExpo)
    : price / 10n ** BigInt(absExpo - 18);
}

// Mirror of PerpsMath.computePnL — signed 1e6 USDC. Lets the keeper decide on a
// FRESH price rather than the on-chain quoteUnrealisedPnL view, which reverts
// once the cached Pyth price is >60s stale on a quiet testnet.
function computePnL6(
  collateralUSDC_6: bigint,
  leverage: bigint,
  entryPrice_E18: bigint,
  markPrice_E18: bigint,
  isLong: boolean,
): bigint {
  if (entryPrice_E18 === 0n) return 0n;
  let delta = markPrice_E18 - entryPrice_E18;
  if (!isLong) delta = -delta;
  const abs = delta >= 0n ? delta : -delta;
  const magnitude = (collateralUSDC_6 * leverage * abs) / entryPrice_E18;
  return delta >= 0n ? magnitude : -magnitude;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const bearer = req.headers?.authorization as string | undefined;
    const xSecret = req.headers?.['x-cron-secret'] as string | undefined;
    const qSecret = req.query?.secret as string | undefined;
    const ok = bearer === `Bearer ${cronSecret}` || xSecret === cronSecret || qSecret === cronSecret;
    if (!ok) return res.status(401).json({ error: 'Unauthorized cron call' });
  }

  const sponsorKey = process.env.VELO_SPONSOR_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (!sponsorKey) return res.status(500).json({ error: 'Sponsor not configured' });

  const rpcUrl = process.env.VITE_BASE_SEPOLIA_RPC_URL || process.env.BASE_SEPOLIA_RPC_URL || 'https://base-sepolia-rpc.publicnode.com';
  const publicClient: any = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
  const account = privateKeyToAccount(sponsorKey.startsWith('0x') ? sponsorKey as `0x${string}` : (`0x${sponsorKey}` as `0x${string}`));
  const walletClient: any = createWalletClient({ account, chain: baseSepolia, transport: http(rpcUrl) });

  try {
    let version = 0;
    try {
      version = Number(await publicClient.readContract({ address: PERPS, abi: CORE_ABI, functionName: 'VERSION' }));
    } catch {
      try {
        version = Number(await publicClient.readContract({ address: PERPS, abi: CORE_ABI, functionName: 'version' }));
      } catch {
        version = (V3 && PERPS.toLowerCase() === V3.toLowerCase()) ? 3 : 2;
      }
    }
    const posAbi = version >= 3 ? POSITION_V3_ABI : POSITION_V2_ABI;

    const [nextTradeId, thresholdBps] = await Promise.all([
      publicClient.readContract({ address: PERPS, abi: CORE_ABI, functionName: 'nextTradeId' }),
      publicClient.readContract({ address: PERPS, abi: CORE_ABI, functionName: 'LIQUIDATION_THRESHOLD_BPS' }),
    ]);
    const maxId = Number(nextTradeId);
    const threshold = Number(thresholdBps);
    const liquidated: Array<{ tradeId: number; txHash: string; bounty: number }> = [];
    const pendingTx: Array<{ tradeId: number; hash: `0x${string}`; bounty: number }> = [];
    const errors: Array<{ tradeId: number; reason: string }> = [];
    const checked: number[] = [];

    // Per-run cache keyed by pairIndex: fresh Hermes blob + normalised mark.
    const priceCache = new Map<number, { updateData: `0x${string}`[]; markE18: bigint }>();
    async function freshPrice(pairIndex: number): Promise<{ updateData: `0x${string}`[]; markE18: bigint }> {
      const cached = priceCache.get(pairIndex);
      if (cached) return cached;
      const feedId = await publicClient.readContract({
        address: PERPS, abi: CORE_ABI, functionName: 'pairFeedId', args: [pairIndex],
      }) as string;
      const feedIdNoPrefix = feedId.startsWith('0x') ? feedId.slice(2) : feedId;
      const hermesRes = await fetch(`${HERMES_URL}/v2/updates/price/latest?ids[]=${feedIdNoPrefix}&encoding=hex`);
      if (!hermesRes.ok) throw new Error(`hermes ${hermesRes.status}`);
      const hermes = await hermesRes.json();
      const blobs: string[] = hermes?.binary?.data ?? [];
      if (!blobs.length) throw new Error('empty hermes payload');
      const parsed = hermes?.parsed?.[0]?.price;
      if (!parsed) throw new Error('no parsed price');
      const updateData = blobs.map((s) => (s.startsWith('0x') ? s : `0x${s}`)) as `0x${string}`[];
      const markE18 = normalisePythPriceE18(BigInt(parsed.price), Number(parsed.expo));
      const out = { updateData, markE18 };
      priceCache.set(pairIndex, out);
      return out;
    }

    for (let id = 1; id < maxId; id++) {
      try {
        const position: any = await publicClient.readContract({
          address: PERPS, abi: posAbi,
          functionName: 'getPosition', args: [BigInt(id)],
        });
        if (!position || position.owner === '0x0000000000000000000000000000000000000000') continue;
        checked.push(id);

        const collateral = BigInt(position.collateralUSDC_6);

        // Decide on a FRESH off-chain price + PnL so a stale on-chain cache can't block us.
        const { updateData, markE18 } = await freshPrice(Number(position.pairIndex));
        const pnl_6 = computePnL6(
          collateral,
          BigInt(position.leverage),
          BigInt(position.entryPrice_E18),
          markE18,
          position.isLong,
        );

        const thresholdLoss = -(collateral * BigInt(threshold)) / 10_000n;
        if (pnl_6 > thresholdLoss) continue;

        const feeWei = await publicClient.readContract({
          address: PYTH_ADDRESS,
          abi: PYTH_FEE_ABI,
          functionName: 'getUpdateFee',
          args: [updateData],
        }) as bigint;

        const txHash = await walletClient.writeContract({
          address: PERPS,
          abi: CORE_ABI,
          functionName: 'liquidate',
          args: [BigInt(id), updateData],
          value: feeWei,
        });
        const bountyEst = Number(collateral) / 1e6 * 0.01;
        pendingTx.push({ tradeId: id, hash: txHash, bounty: bountyEst });
      } catch (e: any) {
        const reason = e?.shortMessage || e?.message || 'unknown';
        errors.push({ tradeId: id, reason });
        console.warn(`[cron-liquidate] tradeId=${id} skipped:`, reason);
      }
    }

    // Wait for all submitted liquidations in parallel.
    await Promise.all(pendingTx.map(async (p) => {
      try {
        await publicClient.waitForTransactionReceipt({ hash: p.hash });
        liquidated.push({ tradeId: p.tradeId, txHash: p.hash, bounty: p.bounty });
        console.log(`[cron-liquidate] liquidated tradeId=${p.tradeId} bounty≈$${p.bounty.toFixed(2)} tx=${p.hash}`);
      } catch (e: any) {
        errors.push({ tradeId: p.tradeId, reason: `receipt: ${e?.shortMessage || e?.message || 'failed'}` });
      }
    }));

    return res.status(200).json({
      ok: true,
      version,
      perps: PERPS,
      checked: checked.length,
      liquidated,
      errors: errors.slice(0, 20),
      maxTradeId: maxId,
    });
  } catch (e: any) {
    console.error('[cron-liquidate] fatal:', e);
    return res.status(500).json({ error: e?.shortMessage || e?.message || 'Cron failed' });
  }
}
