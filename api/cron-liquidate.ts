// api/cron-liquidate.ts
//
// Liquidation keeper for VeloPerps. Supports V3 (preferred), then V2/V1 fallback.

import { createPublicClient, createWalletClient, http, type Abi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

const CORE_ABI: Abi = [
  { type: 'function', name: 'nextTradeId', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'version', stateMutability: 'pure', inputs: [], outputs: [{ type: 'uint16' }] },
  { type: 'function', name: 'LIQUIDATION_THRESHOLD_BPS', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'pairFeedId', stateMutability: 'view', inputs: [{ type: 'uint16' }], outputs: [{ type: 'bytes32' }] },
  {
    type: 'function', name: 'quoteUnrealisedPnL', stateMutability: 'view',
    inputs: [{ name: 'tradeId', type: 'uint256' }], outputs: [{ name: 'pnl_6', type: 'int256' }, { name: 'markPrice_E18', type: 'uint256' }],
  },
  {
    type: 'function', name: 'liquidate', stateMutability: 'payable',
    inputs: [{ name: 'tradeId', type: 'uint256' }, { name: 'pythUpdateData', type: 'bytes[]' }], outputs: [],
  },
];

const POSITION_V2_ABI: Abi = [
  {
    type: 'function', name: 'getPosition', stateMutability: 'view',
    inputs: [{ type: 'uint256' }],
    outputs: [{
      type: 'tuple',
      components: [
        { name: 'owner', type: 'address' },
        { name: 'pairIndex', type: 'uint16' },
        { name: 'isLong', type: 'bool' },
        { name: 'leverage', type: 'uint16' },
        { name: 'collateralUSDC_6', type: 'uint64' },
        { name: 'entryPrice_E18', type: 'uint128' },
        { name: 'openedAt', type: 'uint64' },
      ],
    }],
  },
];

const POSITION_V3_ABI: Abi = [
  {
    type: 'function', name: 'getPosition', stateMutability: 'view',
    inputs: [{ type: 'uint256' }],
    outputs: [{
      type: 'tuple',
      components: [
        { name: 'owner', type: 'address' },
        { name: 'pairIndex', type: 'uint16' },
        { name: 'isLong', type: 'bool' },
        { name: 'leverage', type: 'uint16' },
        { name: 'marginMode', type: 'uint8' },
        { name: 'collateralUSDC_6', type: 'uint64' },
        { name: 'notionalUSDC_6', type: 'uint128' },
        { name: 'entryPrice_E18', type: 'uint128' },
        { name: 'fundingEntry_E18', type: 'int128' },
        { name: 'openedAt', type: 'uint64' },
      ],
    }],
  },
];

const V3 = (process.env.VITE_VELO_PERPS_V3_ADDRESS as `0x${string}`) || '';
const V2 = (process.env.VITE_VELO_PERPS_V2_ADDRESS as `0x${string}`) || '';
const FALLBACK = (process.env.VITE_VELO_PERPS_ADDRESS as `0x${string}`) || '0x28fE36d4ae72ab0E05fa6edafE1D6e11E9DD6163';
const PERPS = (V3 && V3.length === 42) ? V3 : ((V2 && V2.length === 42) ? V2 : FALLBACK);
const HERMES_URL = process.env.VITE_PYTH_HERMES_URL || 'https://hermes.pyth.network';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const bearer = req.headers?.authorization as string | undefined;
    const xSecret = req.headers?.['x-cron-secret'] as string | undefined;
    const qSecret = req.query?.secret as string | undefined;
    const ok = bearer === `Bearer ${cronSecret}` || xSecret === cronSecret || qSecret === cronSecret;
    if (!ok) {
      res.status(401).json({ error: 'Unauthorized cron call' });
      return;
    }
  }

  const sponsorKey = process.env.VELO_SPONSOR_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (!sponsorKey) {
    res.status(500).json({ error: 'Sponsor not configured' });
    return;
  }
  const rpcUrl = process.env.VITE_BASE_SEPOLIA_RPC_URL || process.env.BASE_SEPOLIA_RPC_URL || 'https://base-sepolia-rpc.publicnode.com';
  const publicClient: any = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
  const account = privateKeyToAccount(sponsorKey.startsWith('0x') ? sponsorKey as `0x${string}` : (`0x${sponsorKey}` as `0x${string}`));
  const walletClient: any = createWalletClient({ account, chain: baseSepolia, transport: http(rpcUrl) });

  try {
    const version = Number(await publicClient.readContract({ address: PERPS, abi: CORE_ABI, functionName: 'version' }));
    const posAbi = version >= 3 ? POSITION_V3_ABI : POSITION_V2_ABI;

    const [nextTradeId, thresholdBps] = await Promise.all([
      publicClient.readContract({ address: PERPS, abi: CORE_ABI, functionName: 'nextTradeId' }),
      publicClient.readContract({ address: PERPS, abi: CORE_ABI, functionName: 'LIQUIDATION_THRESHOLD_BPS' }),
    ]);
    const maxId = Number(nextTradeId);
    const threshold = Number(thresholdBps);
    const liquidated: Array<{ tradeId: number; txHash: string; bounty: number }> = [];
    const checked: number[] = [];

    for (let id = 1; id < maxId; id++) {
      try {
        const position: any = await publicClient.readContract({
          address: PERPS, abi: posAbi,
          functionName: 'getPosition', args: [BigInt(id)],
        });
        if (!position || position.owner === '0x0000000000000000000000000000000000000000') continue;
        checked.push(id);

        const [pnl_6] = await publicClient.readContract({
          address: PERPS, abi: CORE_ABI,
          functionName: 'quoteUnrealisedPnL', args: [BigInt(id)],
        }) as readonly [bigint, bigint];

        const collateral = BigInt(position.collateralUSDC_6);
        const thresholdLoss = -(collateral * BigInt(threshold)) / 10_000n;
        if (pnl_6 > thresholdLoss) continue;

        const feedId = await publicClient.readContract({
          address: PERPS, abi: CORE_ABI,
          functionName: 'pairFeedId', args: [position.pairIndex],
        }) as string;
        const feedIdNoPrefix = feedId.startsWith('0x') ? feedId.slice(2) : feedId;
        const hermesRes = await fetch(`${HERMES_URL}/v2/updates/price/latest?ids[]=${feedIdNoPrefix}&encoding=hex`);
        if (!hermesRes.ok) continue;
        const hermes = await hermesRes.json();
        const blobs: string[] = hermes?.binary?.data ?? [];
        if (!blobs.length) continue;
        const updateData = blobs.map((s) => (s.startsWith('0x') ? s : `0x${s}`)) as `0x${string}`[];

        const feeWei = BigInt(updateData.length) * 1_000_000_000_000_000n;

        const txHash = await walletClient.writeContract({
          address: PERPS,
          abi: CORE_ABI,
          functionName: 'liquidate',
          args: [BigInt(id), updateData],
          value: feeWei,
        });
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        const bountyEst = Number(collateral) / 1e6 * 0.01;
        liquidated.push({ tradeId: id, txHash, bounty: bountyEst });
        console.log(`[cron-liquidate] liquidated tradeId=${id} bounty≈$${bountyEst.toFixed(2)} tx=${txHash}`);
      } catch (e: any) {
        console.warn(`[cron-liquidate] tradeId=${id} skipped:`, e?.shortMessage || e?.message);
      }
    }

    res.status(200).json({
      ok: true,
      version,
      perps: PERPS,
      checked: checked.length,
      liquidated,
      maxTradeId: maxId,
    });
  } catch (e: any) {
    console.error('[cron-liquidate] fatal:', e);
    res.status(500).json({ error: e?.shortMessage || e?.message || 'Cron failed' });
  }
}
