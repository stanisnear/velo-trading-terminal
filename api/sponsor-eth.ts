// api/sponsor-eth.ts
//
// Vercel serverless endpoint. POST with { burnerAddress: "0x..." } and the
// sponsor wallet sends a tiny amount of Base Sepolia ETH so the burner can
// pay gas for its first few trades.
//
// Constraints:
//   • Only sends if recipient currently has < SPONSOR_AMOUNT/2 ETH already
//     (prevents repeated calls from draining the sponsor).
//   • Hard cap: SPONSOR_AMOUNT = 0.005 ETH per address.
//   • In-memory rate limit: 1 sponsor per IP per 60 seconds.
//
// Environment variables required (Vercel → Settings → Environment Variables):
//   VELO_SPONSOR_PRIVATE_KEY  — private key of the funded ops wallet
//   VITE_BASE_SEPOLIA_RPC_URL — optional, defaults to PublicNode
//
// Note: VELO_SPONSOR_PRIVATE_KEY does NOT have a VITE_ prefix because this
// is server-side only. It never reaches the browser.
import { createWalletClient, createPublicClient, http, parseEther, formatEther, isAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

const SPONSOR_AMOUNT_ETH = '0.005';
const MIN_TOPUP_THRESHOLD_ETH = '0.002'; // only sponsor if recipient has less than this

// Simple in-memory rate limiter. Resets on cold start, which is fine —
// determined attackers can be defeated by the threshold check above.
const recentRequests = new Map<string, number>();
const RATE_LIMIT_MS = 60_000;

export default async function handler(req: any, res: any) {
  // CORS — allow the production frontend to hit this from the browser
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const ip = (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown') as string;
  const ipKey = ip.split(',')[0].trim();
  const last = recentRequests.get(ipKey);
  if (last && Date.now() - last < RATE_LIMIT_MS) {
    res.status(429).json({ error: 'Rate limited — try again in a minute' });
    return;
  }

  let burnerAddress: string;
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    burnerAddress = body?.burnerAddress;
  } catch {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  if (!burnerAddress || !isAddress(burnerAddress)) {
    res.status(400).json({ error: 'Invalid burnerAddress' });
    return;
  }

  const sponsorKey = process.env.VELO_SPONSOR_PRIVATE_KEY;
  if (!sponsorKey) {
    res.status(500).json({ error: 'Sponsor not configured' });
    return;
  }

  const rpcUrl = process.env.VITE_BASE_SEPOLIA_RPC_URL || 'https://base-sepolia-rpc.publicnode.com';
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });

  try {
    // Threshold check — already-funded wallets don't need sponsorship
    const existingBalance = await publicClient.getBalance({ address: burnerAddress as `0x${string}` });
    const threshold = parseEther(MIN_TOPUP_THRESHOLD_ETH);
    if (existingBalance >= threshold) {
      res.status(200).json({
        sponsored: false,
        reason: 'Already funded',
        existingBalance: formatEther(existingBalance),
      });
      return;
    }

    const account = privateKeyToAccount(sponsorKey.startsWith('0x') ? sponsorKey as `0x${string}` : (`0x${sponsorKey}` as `0x${string}`));
    // Cast to `any` to avoid viem version-specific param type churn (e.g.
    // authorizationList going from optional → required). The runtime call
    // is unchanged.
    const walletClient: any = createWalletClient({ account, chain: baseSepolia, transport: http(rpcUrl) });

    // Mark this IP as having requested before we actually send, so a stuck
    // tx doesn't let them retry instantly.
    recentRequests.set(ipKey, Date.now());

    const txHash = await walletClient.sendTransaction({
      account,
      chain: baseSepolia,
      to: burnerAddress as `0x${string}`,
      value: parseEther(SPONSOR_AMOUNT_ETH),
    });

    res.status(200).json({
      sponsored: true,
      txHash,
      amount: SPONSOR_AMOUNT_ETH,
    });
  } catch (e: any) {
    console.error('[sponsor-eth] error:', e);
    res.status(500).json({ error: e?.shortMessage || e?.message || 'Sponsor failed' });
  }
}
