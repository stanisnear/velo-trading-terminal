// api/cron-tp-sl.ts
//
// TP/SL keeper for VeloPerps. V3-primary; falls back to V2.
//
// Scans every open position, checks its on-chain takeProfit / stopLoss against
// the current Pyth mark, and calls closeIfTriggered(tradeId, pythUpdateData)
// when a trigger has fired. Keepers earn a 0.25% bounty of the payout (V3).

import { createPublicClient, createWalletClient, http, type Abi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

const CORE_ABI: Abi = [
  { type: 'function', name: 'nextTradeId', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'VERSION', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint16' }] },
  { type: 'function', name: 'version', stateMutability: 'pure', inputs: [], outputs: [{ type: 'uint16' }] },
  { type: 'function', name: 'pairFeedId', stateMutability: 'view', inputs: [{ type: 'uint16' }], outputs: [{ type: 'bytes32' }] },
  {
    type: 'function', name: 'quoteUnrealisedPnL', stateMutability: 'view',
    inputs: [{ name: 'tradeId', type: 'uint256' }],
    outputs: [{ name: 'pnl_6', type: 'int256' }, { name: 'markPrice_E18', type: 'uint256' }],
  },
  {
    type: 'function', name: 'closeIfTriggered', stateMutability: 'payable',
    inputs: [{ name: 'tradeId', type: 'uint256' }, { name: 'pythUpdateData', type: 'bytes[]' }],
    outputs: [],
  },
];

// V3 Position struct — MUST match contracts/src/VeloPerpsV3.sol Position layout.
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

// V2 Position struct — used when env points to a V2 contract.
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
const PERPS = (V3 && V3.length === 42) ? V3 : ((V2 && V2.length === 42) ? V2 : '');
const HERMES_URL = process.env.VITE_PYTH_HERMES_URL || 'https://hermes.pyth.network';

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

  if (!PERPS || PERPS.length !== 42) {
    return res.status(200).json({ ok: true, skipped: true, reason: 'Perps address unset (V2/V3)' });
  }

  const sponsorKey = process.env.VELO_SPONSOR_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (!sponsorKey) return res.status(500).json({ error: 'Sponsor not configured' });

  const rpcUrl = process.env.VITE_BASE_SEPOLIA_RPC_URL || process.env.BASE_SEPOLIA_RPC_URL || 'https://base-sepolia-rpc.publicnode.com';
  const publicClient: any = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
  const account = privateKeyToAccount(sponsorKey.startsWith('0x') ? sponsorKey as `0x${string}` : (`0x${sponsorKey}` as `0x${string}`));
  const walletClient: any = createWalletClient({ account, chain: baseSepolia, transport: http(rpcUrl) });

  try {
    // V3 exposes VERSION (uint16 public constant). V2 exposes version() (pure).
    // Try V3 first; if it reverts, fall back to v2 detection or default by env.
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

    const nextTradeId = await publicClient.readContract({
      address: PERPS, abi: CORE_ABI, functionName: 'nextTradeId',
    });
    const maxId = Number(nextTradeId);
    const fired: Array<{ tradeId: number; trigger: 'TP' | 'SL'; txHash: string }> = [];
    const errors: Array<{ tradeId: number; reason: string }> = [];
    let checked = 0;

    for (let id = 1; id < maxId; id++) {
      try {
        const position: any = await publicClient.readContract({
          address: PERPS, abi: posAbi,
          functionName: 'getPosition', args: [BigInt(id)],
        });
        if (!position || position.owner === '0x0000000000000000000000000000000000000000') continue;

        const tp = BigInt(position.takeProfit_E18 ?? 0);
        const sl = BigInt(position.stopLoss_E18 ?? 0);
        if (tp === 0n && sl === 0n) continue;
        checked++;

        const quote = await publicClient.readContract({
          address: PERPS, abi: CORE_ABI,
          functionName: 'quoteUnrealisedPnL', args: [BigInt(id)],
        }) as readonly [bigint, bigint];
        const mark = quote[1];

        const isLong: boolean = position.isLong;
        let triggered: 'TP' | 'SL' | null = null;
        if (isLong) {
          if (tp !== 0n && mark >= tp) triggered = 'TP';
          else if (sl !== 0n && mark <= sl) triggered = 'SL';
        } else {
          if (tp !== 0n && mark <= tp) triggered = 'TP';
          else if (sl !== 0n && mark >= sl) triggered = 'SL';
        }
        if (!triggered) continue;

        const feedId = await publicClient.readContract({
          address: PERPS, abi: CORE_ABI,
          functionName: 'pairFeedId', args: [position.pairIndex],
        }) as string;
        const feedIdNoPrefix = feedId.startsWith('0x') ? feedId.slice(2) : feedId;
        const hermesRes = await fetch(`${HERMES_URL}/v2/updates/price/latest?ids[]=${feedIdNoPrefix}&encoding=hex`);
        if (!hermesRes.ok) {
          errors.push({ tradeId: id, reason: `hermes ${hermesRes.status}` });
          continue;
        }
        const hermes = await hermesRes.json();
        const blobs: string[] = hermes?.binary?.data ?? [];
        if (!blobs.length) {
          errors.push({ tradeId: id, reason: 'empty hermes payload' });
          continue;
        }
        const updateData = blobs.map((s) => (s.startsWith('0x') ? s : `0x${s}`)) as `0x${string}`[];
        const feeWei = BigInt(updateData.length) * 1_000_000_000_000_000n;

        const txHash = await walletClient.writeContract({
          address: PERPS,
          abi: CORE_ABI,
          functionName: 'closeIfTriggered',
          args: [BigInt(id), updateData],
          value: feeWei,
        });
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        fired.push({ tradeId: id, trigger: triggered, txHash });
        console.log(`[cron-tp-sl] fired tradeId=${id} ${triggered} tx=${txHash}`);
      } catch (e: any) {
        const reason = e?.shortMessage || e?.message || 'unknown';
        errors.push({ tradeId: id, reason });
        console.warn(`[cron-tp-sl] tradeId=${id} skipped:`, reason);
      }
    }

    return res.status(200).json({ ok: true, version, perps: PERPS, checked, fired, errors: errors.slice(0, 20), maxTradeId: maxId });
  } catch (e: any) {
    console.error('[cron-tp-sl] fatal:', e);
    return res.status(500).json({ error: e?.shortMessage || e?.message || 'TP/SL keeper failed' });
  }
}
