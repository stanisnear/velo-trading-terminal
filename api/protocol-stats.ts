// api/protocol-stats.ts
//
// Returns aggregated protocol metrics by scanning on-chain events across every
// deployed VeloPerps contract version (V1 + V2 + V3):
//   - lifetime: total_volume_usd, fees, opens/closes, liquidations, currently_open
//   - rollups:  volume / trades / fees over the trailing 24h, 7d, and 30d
//   - daily_buckets: [{ date, volume, fees, opens, closes, liquidations }, ...]
//
// Caller intent: the Admin panel renders the cards + charts from this payload.
// External monitoring (Datadog, Grafana, etc.) can scrape it on a schedule.
//
// Two correctness fixes over the old single-shot version:
//   1. We scan ALL contract addresses (V1/V2/V3), not just the legacy fallback,
//      so activity that routed to the active contract is no longer dropped.
//   2. getLogs is PAGINATED in block-range chunks. Base Sepolia's public RPC
//      rejects an unbounded fromBlock:0 → latest range, which previously made
//      the whole endpoint 500 (and the UI render "—"). We walk in CHUNK_SIZE
//      windows from START_BLOCK to the head.

import { createPublicClient, http, parseAbiItem } from 'viem';
import { baseSepolia } from 'viem/chains';

// Every version we've deployed. Empty/duplicate entries are filtered out.
const CANDIDATE_ADDRESSES = [
  process.env.VITE_VELO_PERPS_V3_ADDRESS,
  process.env.VITE_VELO_PERPS_V2_ADDRESS,
  process.env.VITE_VELO_PERPS_ADDRESS,
  '0x28fE36d4ae72ab0E05fa6edafE1D6e11E9DD6163', // V1 hardcoded fallback
]
  .filter((a): a is string => !!a && a.startsWith('0x') && a.length === 42)
  .map((a) => a.toLowerCase());

const VELO_PERPS_ADDRESSES = Array.from(new Set(CANDIDATE_ADDRESSES)) as `0x${string}`[];

// Block window for getLogs pagination. Base Sepolia public RPCs cap ranges
// (commonly 10k blocks); 9k keeps us safely under. START_BLOCK lets you skip
// scanning pre-deployment history once the contracts are settled.
const CHUNK_SIZE = BigInt(process.env.STATS_LOG_CHUNK || '9000');
const START_BLOCK = BigInt(process.env.STATS_START_BLOCK || '0');

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

// Paginated getLogs across a single address for one event. Tolerates RPCs that
// reject wide ranges by chunking; individual chunk failures are skipped rather
// than failing the whole scan.
async function getLogsPaged(
  client: any,
  address: `0x${string}`,
  event: any,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<any[]> {
  const out: any[] = [];
  for (let start = fromBlock; start <= toBlock; start += CHUNK_SIZE) {
    const end = start + CHUNK_SIZE - 1n > toBlock ? toBlock : start + CHUNK_SIZE - 1n;
    try {
      const logs = await client.getLogs({ address, event, fromBlock: start, toBlock: end });
      if (logs.length) out.push(...logs);
    } catch (err) {
      // Some RPCs still complain — narrow the window once and retry in halves.
      try {
        const mid = start + (end - start) / 2n;
        const [a, b] = await Promise.all([
          client.getLogs({ address, event, fromBlock: start, toBlock: mid }),
          client.getLogs({ address, event, fromBlock: mid + 1n, toBlock: end }),
        ]);
        out.push(...a, ...b);
      } catch {
        // Give up on this window; keep going so partial data still renders.
        console.warn(`[protocol-stats] getLogs window ${start}-${end} failed for ${address}`);
      }
    }
  }
  return out;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');

  const rpcUrl = process.env.VITE_BASE_SEPOLIA_RPC_URL || process.env.BASE_SEPOLIA_RPC_URL || 'https://base-sepolia-rpc.publicnode.com';
  const publicClient: any = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });

  if (VELO_PERPS_ADDRESSES.length === 0) {
    res.status(200).json({ ok: false, error: 'No VeloPerps address configured', lifetime: emptyLifetime(), rollups: emptyRollups(), daily_buckets: [] });
    return;
  }

  try {
    const head = await publicClient.getBlockNumber();
    const fromBlock = START_BLOCK;

    // Scan every contract version for every event type, paginated.
    const perAddress = await Promise.all(
      VELO_PERPS_ADDRESSES.map(async (addr) => {
        const [openLogs, closeLogs, liqLogs, withdrawLogs] = await Promise.all([
          getLogsPaged(publicClient, addr, EVENTS.opened, fromBlock, head),
          getLogsPaged(publicClient, addr, EVENTS.closed, fromBlock, head),
          getLogsPaged(publicClient, addr, EVENTS.liquidated, fromBlock, head),
          getLogsPaged(publicClient, addr, EVENTS.feesWithdrawn, fromBlock, head),
        ]);
        return { openLogs, closeLogs, liqLogs, withdrawLogs };
      })
    );

    const openLogs   = perAddress.flatMap((p) => p.openLogs);
    const closeLogs  = perAddress.flatMap((p) => p.closeLogs);
    const liqLogs    = perAddress.flatMap((p) => p.liqLogs);
    const withdrawLogs = perAddress.flatMap((p) => p.withdrawLogs);

    // Resolve block timestamps once per unique block.
    const uniqueBlocks = new Set<bigint>();
    for (const l of [...openLogs, ...closeLogs, ...liqLogs, ...withdrawLogs]) {
      if (l.blockNumber) uniqueBlocks.add(l.blockNumber);
    }
    const blockTimestamps = new Map<bigint, number>();
    // Batch in groups to avoid hammering the RPC with thousands of parallel calls.
    const blockList = Array.from(uniqueBlocks);
    const BATCH = 25;
    for (let i = 0; i < blockList.length; i += BATCH) {
      const slice = blockList.slice(i, i + BATCH);
      await Promise.all(slice.map(async (bn) => {
        try {
          const b = await publicClient.getBlock({ blockNumber: bn });
          blockTimestamps.set(bn, Number(b.timestamp));
        } catch { /* skip */ }
      }));
    }

    const dayKey = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 10);
    const mkBucket = (date: string): DailyBucket => ({
      date, volume_usd: 0, open_fees_usd: 0, close_fees_usd: 0, opens: 0, closes: 0, liquidations: 0,
    });
    const buckets = new Map<string, DailyBucket>();
    const getBucket = (ts: number): DailyBucket => {
      const k = dayKey(ts);
      if (!buckets.has(k)) buckets.set(k, mkBucket(k));
      return buckets.get(k)!;
    };

    const nowSec = Math.floor(Date.now() / 1000);
    const DAY = 86400;
    const within = (ts: number, days: number) => ts >= nowSec - days * DAY;

    // Rolling-window aggregates.
    const roll = {
      v24: 0, v7: 0, v30: 0,
      t24: 0, t7: 0, t30: 0,   // trades opened
      f24: 0, f7: 0, f30: 0,   // open fees
      liq24: 0, liq7: 0, liq30: 0,
    };

    let totalVolume = 0, totalOpenFees = 0, totalCloseFees = 0;
    let totalLiquidations = 0, totalLiquidationBounty = 0;

    for (const l of openLogs) {
      const ts = l.blockNumber ? (blockTimestamps.get(l.blockNumber) ?? 0) : 0;
      if (!ts) continue;
      const args = l.args as any;
      const collateral = Number(args.collateralUSDC_6) / 1e6;
      const leverage = Number(args.leverage);
      const notional = collateral * leverage;
      const openFee = collateral * 0.001; // 0.10%
      const b = getBucket(ts);
      b.volume_usd += notional; b.open_fees_usd += openFee; b.opens += 1;
      totalVolume += notional; totalOpenFees += openFee;
      if (within(ts, 1))  { roll.v24 += notional; roll.t24 += 1; roll.f24 += openFee; }
      if (within(ts, 7))  { roll.v7  += notional; roll.t7  += 1; roll.f7  += openFee; }
      if (within(ts, 30)) { roll.v30 += notional; roll.t30 += 1; roll.f30 += openFee; }
    }
    for (const l of closeLogs) {
      const ts = l.blockNumber ? (blockTimestamps.get(l.blockNumber) ?? 0) : 0;
      if (!ts) continue;
      const args = l.args as any;
      const closeFee = Number(args.closeFee_6) / 1e6;
      const b = getBucket(ts);
      b.close_fees_usd += closeFee; b.closes += 1;
      totalCloseFees += closeFee;
    }
    for (const l of liqLogs) {
      const ts = l.blockNumber ? (blockTimestamps.get(l.blockNumber) ?? 0) : 0;
      if (!ts) continue;
      const args = l.args as any;
      const bounty = Number(args.bounty_6) / 1e6;
      const b = getBucket(ts);
      b.liquidations += 1;
      totalLiquidations += 1; totalLiquidationBounty += bounty;
      if (within(ts, 1))  roll.liq24 += 1;
      if (within(ts, 7))  roll.liq7  += 1;
      if (within(ts, 30)) roll.liq30 += 1;
    }

    const dailyBuckets = Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date));

    res.status(200).json({
      ok: true,
      contracts: VELO_PERPS_ADDRESSES,
      scanned_from_block: Number(fromBlock),
      scanned_to_block: Number(head),
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
        currently_open: Math.max(0, openLogs.length - closeLogs.length - totalLiquidations),
        total_fee_withdrawals: withdrawLogs.length,
      },
      rollups: {
        volume_24h: roll.v24, volume_7d: roll.v7, volume_30d: roll.v30,
        trades_24h: roll.t24, trades_7d: roll.t7, trades_30d: roll.t30,
        fees_24h: roll.f24, fees_7d: roll.f7, fees_30d: roll.f30,
        liquidations_24h: roll.liq24, liquidations_7d: roll.liq7, liquidations_30d: roll.liq30,
      },
      daily_buckets: dailyBuckets,
    });
  } catch (e: any) {
    console.error('[protocol-stats] error:', e);
    res.status(500).json({ error: e?.shortMessage || e?.message || 'Stats query failed' });
  }
}

function emptyLifetime() {
  return {
    total_volume_usd: 0, total_open_fees_usd: 0, total_close_fees_usd: 0, total_fees_usd: 0,
    total_opens: 0, total_closes: 0, total_liquidations: 0, total_liquidation_bounty_usd: 0,
    currently_open: 0, total_fee_withdrawals: 0,
  };
}
function emptyRollups() {
  return {
    volume_24h: 0, volume_7d: 0, volume_30d: 0,
    trades_24h: 0, trades_7d: 0, trades_30d: 0,
    fees_24h: 0, fees_7d: 0, fees_30d: 0,
    liquidations_24h: 0, liquidations_7d: 0, liquidations_30d: 0,
  };
}
