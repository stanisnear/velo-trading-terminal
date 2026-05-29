// api/cron-conditional-orders.ts
//
// Keeper for VeloPerps V3 conditional orders (LIMIT/STOP, with reduce-only support).
//
// Scans every active conditional order and calls executeConditionalOrder on
// any whose trigger has fired. The contract itself enforces the trigger check
// — we just submit Pyth update data and let it revert when not triggered.

import { createPublicClient, createWalletClient, http, type Abi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

const V3_ABI: Abi = [
  { type: 'function', name: 'nextOrderId', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'VERSION', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint16' }] },
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
  { type: 'function', name: 'pairFeedId', stateMutability: 'view', inputs: [{ type: 'uint16' }], outputs: [{ type: 'bytes32' }] },
  {
    type: 'function', name: 'executeConditionalOrder', stateMutability: 'payable',
    inputs: [{ name: 'orderId', type: 'uint256' }, { name: 'pythUpdateData', type: 'bytes[]' }],
    outputs: [],
  },
];

const V3 = (process.env.VITE_VELO_PERPS_V3_ADDRESS as `0x${string}`) || '';
const HERMES_URL = process.env.VITE_PYTH_HERMES_URL || 'https://hermes.pyth.network';

// Pyth contract on Base Sepolia. The Velo contract enforces
// msg.value == PYTH.getUpdateFee(updateData) to the wei (PythFeeMismatch on miss),
// so the keeper MUST read the exact fee on-chain — never hardcode/estimate it.
const PYTH_ADDRESS = (process.env.VITE_PYTH_CONTRACT_ADDRESS as `0x${string}`) ||
  '0xA2aa501b19aff244D90cc15a4Cf739D2725B5729';
const PYTH_FEE_ABI: Abi = [
  { type: 'function', name: 'getUpdateFee', stateMutability: 'view',
    inputs: [{ name: 'updateData', type: 'bytes[]' }],
    outputs: [{ name: 'feeAmount', type: 'uint256' }] },
];

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
  if (!V3 || V3.length !== 42) {
    return res.status(200).json({ ok: true, skipped: true, reason: 'V3 address unset' });
  }

  const sponsorKey = process.env.VELO_SPONSOR_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (!sponsorKey) return res.status(500).json({ error: 'Sponsor not configured' });

  const rpcUrl = process.env.VITE_BASE_SEPOLIA_RPC_URL || process.env.BASE_SEPOLIA_RPC_URL || 'https://base-sepolia-rpc.publicnode.com';
  const publicClient: any = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
  const account = privateKeyToAccount(sponsorKey.startsWith('0x') ? sponsorKey as `0x${string}` : (`0x${sponsorKey}` as `0x${string}`));
  const walletClient: any = createWalletClient({ account, chain: baseSepolia, transport: http(rpcUrl) });

  try {
    const nextOrderId = await publicClient.readContract({ address: V3, abi: V3_ABI, functionName: 'nextOrderId' });
    const maxId = Number(nextOrderId);
    const executed: Array<{ orderId: number; txHash: string }> = [];
    const skipped: Array<{ orderId: number; reason: string }> = [];
    let activeCount = 0;

    for (let id = 1; id < maxId; id++) {
      try {
        const order: any = await publicClient.readContract({
          address: V3,
          abi: V3_ABI,
          functionName: 'conditionalOrders',
          args: [BigInt(id)],
        });
        if (!order || !order.active || order.owner === '0x0000000000000000000000000000000000000000') continue;
        activeCount++;

        const feedId = await publicClient.readContract({ address: V3, abi: V3_ABI, functionName: 'pairFeedId', args: [order.pairIndex] }) as string;
        const feedIdNoPrefix = feedId.startsWith('0x') ? feedId.slice(2) : feedId;

        const hermesRes = await fetch(`${HERMES_URL}/v2/updates/price/latest?ids[]=${feedIdNoPrefix}&encoding=hex`);
        if (!hermesRes.ok) {
          skipped.push({ orderId: id, reason: `hermes ${hermesRes.status}` });
          continue;
        }
        const hermes = await hermesRes.json();
        const blobs: string[] = hermes?.binary?.data ?? [];
        if (!blobs.length) {
          skipped.push({ orderId: id, reason: 'empty hermes payload' });
          continue;
        }

        const updateData = blobs.map((s) => (s.startsWith('0x') ? s : `0x${s}`)) as `0x${string}`[];
        // Read the exact fee the contract will demand for THIS updateData.
        const feeWei = await publicClient.readContract({
          address: PYTH_ADDRESS,
          abi: PYTH_FEE_ABI,
          functionName: 'getUpdateFee',
          args: [updateData],
        }) as bigint;

        // Let the contract decide whether triggered; revert on miss is expected.
        try {
          const txHash = await walletClient.writeContract({
            address: V3,
            abi: V3_ABI,
            functionName: 'executeConditionalOrder',
            args: [BigInt(id), updateData],
            value: feeWei,
          });
          await publicClient.waitForTransactionReceipt({ hash: txHash });
          executed.push({ orderId: id, txHash });
          console.log(`[cron-conditional-orders] executed orderId=${id} tx=${txHash}`);
        } catch (e: any) {
          const reason = e?.shortMessage || e?.message || 'execute revert';
          // OrderNotTriggered is normal — only log when something else.
          if (!/OrderNotTriggered/i.test(reason)) {
            skipped.push({ orderId: id, reason });
          }
        }
      } catch (e: any) {
        skipped.push({ orderId: id, reason: e?.shortMessage || e?.message || 'unknown' });
      }
    }

    return res.status(200).json({
      ok: true,
      perps: V3,
      scanned: Math.max(0, maxId - 1),
      activeOrders: activeCount,
      executed,
      skipped: skipped.slice(0, 20),
    });
  } catch (e: any) {
    console.error('[cron-conditional-orders] fatal:', e);
    return res.status(500).json({ error: e?.shortMessage || e?.message || 'keeper failed' });
  }
}
