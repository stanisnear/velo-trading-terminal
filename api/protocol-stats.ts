// api/protocol-stats.ts
//
// Protocol trading metrics for the Admin dashboard.
//
// SOURCE OF TRUTH = the app's own records in Supabase (trade_history +
// positions). This is fast, version-agnostic (every trade is recorded
// regardless of which VeloPerps contract it routed to: V1/V2/V3/V3.1), and —
// unlike scanning PositionOpened events — never times out. Base Sepolia is
// ~20M blocks deep; paginating getLogs from genesis on a serverless function
// is not viable, and the contracts don't keep a cumulative-volume counter
// on-chain, so events were the only on-chain path and they don't scale here.
//
// We DO read three O(1) values from the active contract for cross-reference:
//   VERSION       → so the dashboard shows the right contract version (3.1, …)
//   nextTradeId   → lifetime opens as counted on-chain (sanity check vs db)
//   feeBalance    → accrued fees (USDC, 6dp)
//
// Returns:
//   lifetime: volume, fees-from-history, opens/closes, liquidations, open count
//   rollups:  volume / trades / liquidations over trailing 24h / 7d / 30d
//   onchain:  { version, version_label, active_address, next_trade_id, fee_balance_usd }
//   daily_buckets: [{ date, volume_usd, opens, closes, liquidations }, ...]

import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';

// ── Supabase REST ──────────────────────────────────────────────────────────
const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL ||
  'https://btgfoekgvyvdflzjfehz.supabase.co';
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY || '';
const REST = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1`;

function sbHeaders(extra: Record<string, string> = {}) {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...extra };
}
async function countRows(table: string, filter = ''): Promise<number> {
  const url = `${REST}/${table}?select=id${filter ? `&${filter}` : ''}`;
  const res = await fetch(url, { headers: sbHeaders({ Prefer: 'count=exact', Range: '0-0' }) });
  if (!res.ok) return 0;
  const cr = res.headers.get('content-range') || '';
  const total = cr.split('/')[1];
  return total && total !== '*' ? parseInt(total, 10) : 0;
}

// ── Active contract (version resolution mirrors veloPerpsService) ────────────
function activeAddress(): `0x${string}` | null {
  const v3 = process.env.VITE_VELO_PERPS_V3_ADDRESS || '';
  const v2 = process.env.VITE_VELO_PERPS_V2_ADDRESS || '';
  const v1 = process.env.VITE_VELO_PERPS_ADDRESS || '0x28fE36d4ae72ab0E05fa6edafE1D6e11E9DD6163';
  const pick = [v3, v2, v1].find((a) => a && a.startsWith('0x') && a.length === 42);
  return (pick as `0x${string}`) || null;
}
const VERSION_ABI = [
  { type: 'function', name: 'VERSION',     stateMutability: 'view', inputs: [], outputs: [{ type: 'uint16' }] },
  { type: 'function', name: 'nextTradeId', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'feeBalance',  stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
] as const;

function versionLabel(v: number): string {
  if (!v) return 'unknown';
  if (v >= 10) return `v${Math.floor(v / 10)}.${v % 10}`; // 31 → v3.1
  return `v${v}`;                                          // 3 → v3
}

const isoDaysAgo = (d: number) => new Date(Date.now() - d * 86400_000).toISOString();
const dayStr = (d: Date) => d.toISOString().slice(0, 10);

interface TradeRow {
  size: number | null;
  action: string | null;
  pnl: number | null;
  leverage: number | null;
  exit_price: number | null;
  liquidation_price: number | null;
  created_at: string;
}

// A close is treated as a liquidation when the exit landed on the liquidation
// price, or (fallback) when the loss wiped ~the entire margin.
function isLiquidation(r: TradeRow): boolean {
  if (r.action !== 'CLOSE') return false;
  if (r.liquidation_price != null && r.exit_price != null &&
      Math.abs(r.exit_price - r.liquidation_price) < 1e-9) return true;
  if (r.leverage && r.leverage > 0 && r.size && r.pnl != null) {
    const margin = r.size / r.leverage;
    if (r.pnl <= -margin * 0.999) return true;
  }
  return false;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');

  const out: any = { ok: true, generated_at: new Date().toISOString(), source: 'supabase' };

  // ── On-chain cross-reference (O(1), best-effort) ───────────────────────────
  try {
    const addr = activeAddress();
    if (addr) {
      const rpcUrl = process.env.VITE_BASE_SEPOLIA_RPC_URL || process.env.BASE_SEPOLIA_RPC_URL || 'https://base-sepolia-rpc.publicnode.com';
      const client: any = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
      const [version, nextId, fee] = await Promise.all([
        client.readContract({ address: addr, abi: VERSION_ABI, functionName: 'VERSION' }).catch(() => 0),
        client.readContract({ address: addr, abi: VERSION_ABI, functionName: 'nextTradeId' }).catch(() => 0n),
        client.readContract({ address: addr, abi: VERSION_ABI, functionName: 'feeBalance' }).catch(() => 0n),
      ]);
      out.onchain = {
        active_address: addr,
        version: Number(version),
        version_label: versionLabel(Number(version)),
        next_trade_id: Number(nextId),
        onchain_total_opens: Math.max(0, Number(nextId) - 1),
        fee_balance_usd: Number(fee) / 1e6,
      };
    }
  } catch (e: any) {
    console.warn('[protocol-stats] on-chain read failed:', e?.message);
  }

  // ── Trading metrics from Supabase ──────────────────────────────────────────
  if (!SERVICE_KEY) {
    res.status(200).json({ ...out, ok: false, error: 'Supabase key not configured', lifetime: emptyLifetime(), rollups: emptyRollups(), daily_buckets: [] });
    return;
  }

  try {
    // Pull trade history (testnet volumes are small; cap generously).
    const url = `${REST}/trade_history?select=size,action,pnl,leverage,exit_price,liquidation_price,created_at&order=created_at.asc&limit=100000`;
    const thRes = await fetch(url, { headers: sbHeaders() });
    if (!thRes.ok) throw new Error(`trade_history HTTP ${thRes.status}`);
    const rows: TradeRow[] = await thRes.json();

    // Current open positions = live count of the positions table.
    const currentlyOpen = await countRows('positions');

    const nowSec = Math.floor(Date.now() / 1000);
    const within = (iso: string, days: number) => new Date(iso).getTime() / 1000 >= nowSec - days * 86400;

    let totalVolume = 0, totalOpens = 0, totalCloses = 0, totalLiquidations = 0;
    let realizedPnl = 0;
    const roll = { v24: 0, v7: 0, v30: 0, t24: 0, t7: 0, t30: 0, liq24: 0, liq7: 0, liq30: 0 };
    const buckets = new Map<string, { date: string; volume_usd: number; opens: number; closes: number; liquidations: number }>();
    const getB = (iso: string) => {
      const k = dayStr(new Date(iso));
      if (!buckets.has(k)) buckets.set(k, { date: k, volume_usd: 0, opens: 0, closes: 0, liquidations: 0 });
      return buckets.get(k)!;
    };

    for (const r of rows) {
      const size = Number(r.size || 0);
      const b = getB(r.created_at);
      if (r.action === 'OPEN') {
        totalVolume += size; totalOpens += 1;
        b.volume_usd += size; b.opens += 1;
        if (within(r.created_at, 1))  { roll.v24 += size; roll.t24 += 1; }
        if (within(r.created_at, 7))  { roll.v7  += size; roll.t7  += 1; }
        if (within(r.created_at, 30)) { roll.v30 += size; roll.t30 += 1; }
      } else if (r.action === 'CLOSE') {
        totalCloses += 1; b.closes += 1;
        realizedPnl += Number(r.pnl || 0);
        if (isLiquidation(r)) {
          totalLiquidations += 1; b.liquidations += 1;
          if (within(r.created_at, 1))  roll.liq24 += 1;
          if (within(r.created_at, 7))  roll.liq7  += 1;
          if (within(r.created_at, 30)) roll.liq30 += 1;
        }
      }
    }

    const dailyBuckets = Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date));

    res.status(200).json({
      ...out,
      lifetime: {
        total_volume_usd: totalVolume,
        total_opens: totalOpens,
        total_closes: totalCloses,
        total_liquidations: totalLiquidations,
        currently_open: currentlyOpen,
        realized_pnl_usd: realizedPnl,
        // Fee estimate from volume (open-side, 0.10%). Live accrued fees come
        // from the contract read above (out.onchain.fee_balance_usd).
        total_open_fees_usd: totalVolume * 0.001,
        total_fees_usd: totalVolume * 0.001,
      },
      rollups: {
        volume_24h: roll.v24, volume_7d: roll.v7, volume_30d: roll.v30,
        trades_24h: roll.t24, trades_7d: roll.t7, trades_30d: roll.t30,
        liquidations_24h: roll.liq24, liquidations_7d: roll.liq7, liquidations_30d: roll.liq30,
        fees_24h: roll.v24 * 0.001, fees_7d: roll.v7 * 0.001, fees_30d: roll.v30 * 0.001,
      },
      daily_buckets: dailyBuckets,
    });
  } catch (e: any) {
    console.error('[protocol-stats] error:', e);
    res.status(500).json({ ...out, ok: false, error: e?.message || 'Stats query failed', lifetime: emptyLifetime(), rollups: emptyRollups(), daily_buckets: [] });
  }
}

function emptyLifetime() {
  return { total_volume_usd: 0, total_opens: 0, total_closes: 0, total_liquidations: 0, currently_open: 0, realized_pnl_usd: 0, total_open_fees_usd: 0, total_fees_usd: 0 };
}
function emptyRollups() {
  return { volume_24h: 0, volume_7d: 0, volume_30d: 0, trades_24h: 0, trades_7d: 0, trades_30d: 0, liquidations_24h: 0, liquidations_7d: 0, liquidations_30d: 0, fees_24h: 0, fees_7d: 0, fees_30d: 0 };
}
