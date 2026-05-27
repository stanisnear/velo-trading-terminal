// api/cron-conditional-orders.ts
// Keeper for VeloPerpsV3 conditional orders (LIMIT/STOP, including reduce-only).

import { createPublicClient, createWalletClient, http, type Abi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

const V3_ABI: Abi = [
  { type: 'function', name: 'nextOrderId', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'version', stateMutability: 'pure', inputs: [], outputs: [{ type: 'uint16' }] },
  {
    type: 'function', name: 'conditionalOrders', stateMutability: 'view',
    inputs: [{ type: 'uint256' }],
    outputs: [{
      type: 'tuple',
      components: [
        { name: 'owner', type: 'address' },
        { name: 'pairIndex', type: 'uint16' },
        { name: 'isLong', type: 'bool' },
        { name: 'leverage', type: 'uint16' },
        { name: 'marginMode', type: 'uint8' },
        { name: 'triggerKind', type: 'uint8' },
        { name: 'reduceOnly', type: 'bool' },
        { name: 'reduceBps', type: 'uint16' },
        { name: 'collateralUSDC_6', type: 'uint64' },
        { name: 'triggerPrice_E18', type: 'uint128' },
        { name: 'createdAt', type: 'uint64' },
        { name: 'active', type: 'bool' },
      ],
    }],
  },
  { type: 'function', name: 'pairFeedId', stateMutability: 'view', inputs: [{ type: 'uint16' }], outputs: [{ type: 'bytes32' }] },
  {
    type: 'function', name: 'quoteUnrealisedPnL', stateMutability: 'view',
    inputs: [{ name: 'tradeId', type: 'uint256' }], outputs: [{ name: 'pnl_6', type: 'int256' }, { name: 'markPrice_E18', type: 'uint256' }],
  },
  {
    type: 'function', name: 'executeConditionalOrder', stateMutability: 'payable',
    inputs: [{ name: 'orderId', type: 'uint256' }, { name: 'pythUpdateData', type: 'bytes[]' }], outputs: [],
  },
];

const V3 = (process.env.VITE_VELO_PERPS_V3_ADDRESS as `0x${string}`) || '';
const HERMES_URL = process.env.VITE_PYTH_HERMES_URL || 'https://hermes.pyth.network';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!V3 || V3.length !== 42) return res.status(200).json({ ok: true, skipped: true, reason: 'V3 address unset' });

  const sponsorKey = process.env.VELO_SPONSOR_PRIVATE_KEY;
  if (!sponsorKey) return res.status(500).json({ error: 'Sponsor not configured' });

  const rpcUrl = process.env.VITE_BASE_SEPOLIA_RPC_URL || 'https://base-sepolia-rpc.publicnode.com';
  const publicClient: any = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
  const account = privateKeyToAccount(sponsorKey.startsWith('0x') ? sponsorKey as `0x${string}` : (`0x${sponsorKey}` as `0x${string}`));
  const walletClient: any = createWalletClient({ account, chain: baseSepolia, transport: http(rpcUrl) });

  try {
    const nextOrderId = await publicClient.readContract({ address: V3, abi: V3_ABI, functionName: 'nextOrderId' });
    const maxId = Number(nextOrderId);
    const executed: Array<{ orderId: number; txHash: string }> = [];

    for (let id = 1; id < maxId; id++) {
      try {
        const order: any = await publicClient.readContract({
          address: V3,
          abi: V3_ABI,
          functionName: 'conditionalOrders',
          args: [BigInt(id)],
        });
        if (!order || !order.active || order.owner === '0x0000000000000000000000000000000000000000') continue;

        const feedId = await publicClient.readContract({ address: V3, abi: V3_ABI, functionName: 'pairFeedId', args: [order.pairIndex] }) as string;
        const feedIdNoPrefix = feedId.startsWith('0x') ? feedId.slice(2) : feedId;

        const hermesRes = await fetch(`${HERMES_URL}/v2/updates/price/latest?ids[]=${feedIdNoPrefix}&encoding=hex`);
        if (!hermesRes.ok) continue;
        const hermes = await hermesRes.json();
        const blobs: string[] = hermes?.binary?.data ?? [];
        if (!blobs.length) continue;

        const updateData = blobs.map((s) => (s.startsWith('0x') ? s : `0x${s}`)) as `0x${string}`[];
        const feeWei = BigInt(updateData.length) * 1_000_000_000_000_000n;

        // Let the contract decide whether triggered; skip on revert.
        const txHash = await walletClient.writeContract({
          address: V3,
          abi: V3_ABI,
          functionName: 'executeConditionalOrder',
          args: [BigInt(id), updateData],
          value: feeWei,
        });
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        executed.push({ orderId: id, txHash });
      } catch {
        // not triggered or failed; continue scanning
      }
    }

    return res.status(200).json({ ok: true, executed, scanned: maxId - 1 });
  } catch (e: any) {
    console.error('[cron-conditional-orders] fatal:', e);
    return res.status(500).json({ error: e?.shortMessage || e?.message || 'keeper failed' });
  }
}
