// api/protocol-stats.ts
//
// Returns aggregated protocol metrics by scanning on-chain events:
//   - total_volume_usd (lifetime sum of position notionals at open)
//   - total_open_fees_usd, total_close_fees_usd
//   - total_liquidations
//   - position_count_open, position_count_closed
//   - daily_buckets: [{ date, volume, fees, opens, closes, liquidations }, ...]
//
// Caller intent: the Admin panel uses this to render charts. External
// monitoring (Datadog, Grafana, etc.) can scrape it on a schedule.
//
// Performance note: every call walks all PositionOpened / PositionClosed /
// PositionLiquidated events from contract genesis. On testnet this is small.
// For mainnet, switch to a subgraph or incremental indexer.

import { createPublicClient, http, parseAbiItem } from 'viem';
import { baseSepolia } from 'viem/chains';

const VELO_PERPS_ADDRESS =
  (process.env.VITE_VELO_PERPS_ADDRESS as `0x${string}`) ||
  '0x28fE36d4ae72ab0E05fa6edafE1D6e11E9DD6163';

const EVENTS = {
  opened:      parseAbiItem('event PositionOpened(uint256 indexed tradeId, address indexed trader, uint16 indexed pairIndex, bool isLong, uint16 leverage, uint64 collateralUSDC_6, uint128 entryPrice_E18)'),
  closed:      parseAbiItem('event PositionClosed(uint256 indexed tradeId, address indexed trader, uint16 indexed pairIndex, uint128 exitPrice_E18, int256 pnl_6, uint64 payout_6, uint64 closeFee_6)'),
  liquidated:  parseAbiItem('event PositionLiquidated(uint256 indexed tradeId, address indexed trader, address indexed liquidator, uint128 markPrice_E18, uint64 bounty_6)'),
  feesWithdrawn: parseAbiItem('event FeesWithdrawn(address indexed to, uint256 amount_6)'),
};

interface DailyBucket {
  date: string;             // YYYY-MM-DD
  volume_usd: number;       // sum of opened notional that day
  open_fees_usd: number;    // 0.10% of opened notional
  close_fees_usd: number;   // sum of closeFee_6 / 1e6
  opens: number;
  closes: number;
  liquidations: number;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');

  const rpcUrl = process.env.VITE_BASE_SEPOLIA_RPC_URL || 'https://base-sepolia-rpc.publicnode.com';
  const publicClient: any = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });

  try {
    // Some RPCs have a block-range cap on getLogs. We'll do a single call with
    // fromBlock 0 — works for our testnet deployment because the contract is
    // only a few thousand blocks deep. For mainnet, paginate.
    const [openLogs, closeLogs, liqLogs, withdrawLogs] = await Promise.all([
      publicClient.getLogs({ address: VELO_PERPS_ADDRESS, event: EVENTS.opened, fromBlock: 0n }),
      publicClient.getLogs({ address: VELO_PERPS_ADDRESS, event: EVENTS.closed, fromBlock: 0n }),
      publicClient.getLogs({ address: VELO_PERPS_ADDRESS, event: EVENTS.liquidated, fromBlock: 0n }),
      publicClient.getLogs({ address: VELO_PERPS_ADDRESS, event: EVENTS.feesWithdrawn, fromBlock: 0n }),
    ]);

    // Bucket every event by date. Need the block timestamp for each log;
    // batch the block reads to avoid one RPC per log.
    const uniqueBlocks = new Set<bigint>();
    for (const l of [...openLogs, ...closeLogs, ...liqLogs, ...withdrawLogs]) {
      if (l.blockNumber) uniqueBlocks.add(l.blockNumber);
    }
    const blockTimestamps = new Map<bigint, number>();
    await Promise.all(
      Array.from(uniqueBlocks).map(async (bn) => {
        try {
          const b = await publicClient.getBlock({ blockNumber: bn });
          blockTimestamps.set(bn, Number(b.timestamp));
        } catch { /* skip */ }
      })
    );

    const dayKey = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 10);
    const bucket = (date: string, init?: Partial<DailyBucket>): DailyBucket => ({
      date,
      volume_usd: 0, open_fees_usd: 0, close_fees_usd: 0,
      opens: 0, closes: 0, liquidations: 0,
      ...init,
    });
    const buckets = new Map<string, DailyBucket>();
    const getBucket = (ts: number): DailyBucket => {
      const k = dayKey(ts);
      if (!buckets.has(k)) buckets.set(k, bucket(k));
      return buckets.get(k)!;
    };

    // Aggregates
    let totalVolume = 0;
    let totalOpenFees = 0;
    let totalCloseFees = 0;
    let totalLiquidations = 0;
    let totalLiquidationBounty = 0;

    for (const l of openLogs) {
      const ts = l.blockNumber ? (blockTimestamps.get(l.blockNumber) ?? 0) : 0;
      if (!ts) continue;
      const args = l.args as any;
      const collateral = Number(args.collateralUSDC_6) / 1e6;
      const leverage = Number(args.leverage);
      const notional = collateral * leverage;
      const openFee = collateral * 0.001; // 0.10%
      const b = getBucket(ts);
      b.volume_usd += notional;
      b.open_fees_usd += openFee;
      b.opens += 1;
      totalVolume += notional;
      totalOpenFees += openFee;
    }
    for (const l of closeLogs) {
      const ts = l.blockNumber ? (blockTimestamps.get(l.blockNumber) ?? 0) : 0;
      if (!ts) continue;
      const args = l.args as any;
      const closeFee = Number(args.closeFee_6) / 1e6;
      const b = getBucket(ts);
      b.close_fees_usd += closeFee;
      b.closes += 1;
      totalCloseFees += closeFee;
    }
    for (const l of liqLogs) {
      const ts = l.blockNumber ? (blockTimestamps.get(l.blockNumber) ?? 0) : 0;
      if (!ts) continue;
      const args = l.args as any;
      const bounty = Number(args.bounty_6) / 1e6;
      const b = getBucket(ts);
      b.liquidations += 1;
      totalLiquidations += 1;
      totalLiquidationBounty += bounty;
    }

    // Sort daily buckets chronologically
    const dailyBuckets = Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date));

    res.status(200).json({
      ok: true,
      contract: VELO_PERPS_ADDRESS,
      generated_at: new Date().toISOString(),
      lifetime: {
        total_volume_usd: totalVolume,
        total_open_fees_usd: totalOpenFees,
        total_close_fees_usd: totalCloseFees,
        total_fees_usd: totalOpenFees + totalCloseFees,
        total_opens: openLogs.length,
        total_closes: closeLogs.length,
        total_liquidations: totalLiquidations,
        total_liquidation_bounty_usd: totalLiquidationBounty,
        currently_open: openLogs.length - closeLogs.length - totalLiquidations,
        total_fee_withdrawals: withdrawLogs.length,
      },
      daily_buckets: dailyBuckets,
    });
  } catch (e: any) {
    console.error('[protocol-stats] error:', e);
    res.status(500).json({ error: e?.shortMessage || e?.message || 'Stats query failed' });
  }
}
