// api/cron-liquidate.ts
//
// Vercel serverless endpoint — driven by external cron (GitHub Actions, cron-job.org).
// Walks all open positions and liquidates underwater ones (loss ≥ 90% of collateral).
//
// Signing wallet: VELO_SPONSOR_PRIVATE_KEY. Earned bounty (1% of liquidated
// collateral) flows back to this wallet, so the keeper self-funds.
//
// GET-callable for easy external scheduling.
import { createPublicClient, createWalletClient, http, type Abi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

// Wide-typed ABI. We pass it as `Abi` instead of the narrow tuple so viem's
// generic inference doesn't choke on the union of all function names, and so
// we're resilient to viem minor-version type changes (e.g. authorizationList
// becoming required in newer SendTransaction types).
const VELO_PERPS_ABI: Abi = [
  { type: 'function', name: 'nextTradeId', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'LIQUIDATION_THRESHOLD_BPS', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'pairFeedId', stateMutability: 'view', inputs: [{ type: 'uint16' }], outputs: [{ type: 'bytes32' }] },
  {
    type: 'function', name: 'getPosition', stateMutability: 'view',
    inputs: [{ type: 'uint256' }],
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
];

const VELO_PERPS_ADDRESS =
  (process.env.VITE_VELO_PERPS_ADDRESS as `0x${string}`) ||
  '0x28fE36d4ae72ab0E05fa6edafE1D6e11E9DD6163';

const HERMES_URL = process.env.VITE_PYTH_HERMES_URL || 'https://hermes.pyth.network';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const sponsorKey = process.env.VELO_SPONSOR_PRIVATE_KEY;
  if (!sponsorKey) {
    res.status(500).json({ error: 'Sponsor not configured' });
    return;
  }
  const rpcUrl = process.env.VITE_BASE_SEPOLIA_RPC_URL || 'https://base-sepolia-rpc.publicnode.com';
  const publicClient: any = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
  const account = privateKeyToAccount(sponsorKey.startsWith('0x') ? sponsorKey as `0x${string}` : (`0x${sponsorKey}` as `0x${string}`));
  const walletClient: any = createWalletClient({ account, chain: baseSepolia, transport: http(rpcUrl) });

  try {
    const [nextTradeId, thresholdBps] = await Promise.all([
      publicClient.readContract({ address: VELO_PERPS_ADDRESS, abi: VELO_PERPS_ABI, functionName: 'nextTradeId' }),
      publicClient.readContract({ address: VELO_PERPS_ADDRESS, abi: VELO_PERPS_ABI, functionName: 'LIQUIDATION_THRESHOLD_BPS' }),
    ]);
    const maxId = Number(nextTradeId);
    const threshold = Number(thresholdBps);
    const liquidated: Array<{ tradeId: number; txHash: string; bounty: number }> = [];
    const checked: number[] = [];

    for (let id = 1; id < maxId; id++) {
      try {
        const position: any = await publicClient.readContract({
          address: VELO_PERPS_ADDRESS, abi: VELO_PERPS_ABI,
          functionName: 'getPosition', args: [BigInt(id)],
        });
        if (!position || position.owner === '0x0000000000000000000000000000000000000000') continue;
        checked.push(id);

        const pnlResult = await publicClient.readContract({
          address: VELO_PERPS_ADDRESS, abi: VELO_PERPS_ABI,
          functionName: 'quoteUnrealisedPnL', args: [BigInt(id)],
        }) as readonly [bigint, bigint];
        const pnl_6 = pnlResult[0];

        const collateral = BigInt(position.collateralUSDC_6);
        const thresholdLoss = -(collateral * BigInt(threshold)) / 10_000n;
        if (pnl_6 > thresholdLoss) continue;

        const feedId = await publicClient.readContract({
          address: VELO_PERPS_ADDRESS, abi: VELO_PERPS_ABI,
          functionName: 'pairFeedId', args: [position.pairIndex],
        }) as string;
        const feedIdNoPrefix = feedId.startsWith('0x') ? feedId.slice(2) : feedId;
        const hermesRes = await fetch(`${HERMES_URL}/v2/updates/price/latest?ids[]=${feedIdNoPrefix}&encoding=hex`);
        if (!hermesRes.ok) { console.warn('[cron-liquidate] Hermes failed for', id); continue; }
        const hermes = await hermesRes.json();
        const blobs: string[] = hermes?.binary?.data ?? [];
        if (!blobs.length) continue;
        const updateData = blobs.map((s) => (s.startsWith('0x') ? s : `0x${s}`)) as `0x${string}`[];

        const feeWei = BigInt(updateData.length) * 1_000_000_000_000_000n;

        const txHash = await walletClient.writeContract({
          address: VELO_PERPS_ADDRESS, abi: VELO_PERPS_ABI,
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
        continue;
      }
    }

    res.status(200).json({
      ok: true,
      checked: checked.length,
      liquidated,
      maxTradeId: maxId,
    });
  } catch (e: any) {
    console.error('[cron-liquidate] fatal:', e);
    res.status(500).json({ error: e?.shortMessage || e?.message || 'Cron failed' });
  }
}
