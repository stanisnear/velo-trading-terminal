/**
 * VeloAdminPanel — protocol owner dashboard.
 *
 * Reads the contract's `owner()` and compares to the connected wallet.
 * If they don't match, renders a "not authorized" screen with no data.
 *
 * Owner-visible features:
 *   - Pair registry table (index, label, feed ID, tradable status)
 *   - Register pair form (and a one-click "register all queued pairs" button)
 *   - Toggle pair tradable on/off
 *   - Accrued fees viewer + withdraw button
 *   - Pool reserves viewer
 *   - Contract metadata (addresses, fees, leverage cap)
 */
import React, { useEffect, useState } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import {
  ArrowDownToLine, CheckCircle2, ChevronRight, ExternalLink, Loader2,
  Pause, Play, PlusCircle, RefreshCw, Shield, X, TrendingUp, Activity,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import {
  VELO_PERPS_ADDRESS, VELO_PERPS_V1_ADDRESS, VELO_PERPS_V2_ADDRESS, IS_V2,
  VELO_PERPS_ABI, VELO_USDC_BASE,
  fetchPoolBalance, baseScanAddressUrl, baseScanTxUrl,
  PAIR_LABEL, type VeloPairLabel, type PairIndex,
} from '@/services/veloPerpsService';

const VELO_USDC_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'mint',      stateMutability: 'nonpayable', inputs: [], outputs: [] },
  // Owner-only — no cooldown, no cap. Use for seeding pools and admin distributions.
  { type: 'function', name: 'mintTo',    stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'transfer',  stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'lastFaucetClaim', stateMutability: 'view', inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'FAUCET_COOLDOWN',  stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'FAUCET_AMOUNT',    stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
] as const;
import { PYTH_FEED_IDS } from '@/services/pythService';

// Protocol stats payload from /api/protocol-stats
interface ProtocolStats {
  ok: boolean;
  lifetime: {
    total_volume_usd: number;
    total_open_fees_usd: number;
    total_close_fees_usd: number;
    total_fees_usd: number;
    total_opens: number;
    total_closes: number;
    total_liquidations: number;
    total_liquidation_bounty_usd: number;
    currently_open: number;
    total_fee_withdrawals: number;
  };
  daily_buckets: Array<{
    date: string;
    volume_usd: number;
    open_fees_usd: number;
    close_fees_usd: number;
    opens: number;
    closes: number;
    liquidations: number;
  }>;
}

const S = {
  display: { fontFamily: 'var(--font-display)', fontStyle: 'italic' as const, letterSpacing: '-0.02em' },
  mono:    { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1', fontVariantNumeric: 'tabular-nums' as const },
  sans:    { fontFamily: 'var(--font-sans)' },
  label:   { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)' } as React.CSSProperties,
};

const KNOWN_PAIRS: { index: PairIndex; label: VeloPairLabel; feedId: string; pythId: keyof typeof PYTH_FEED_IDS }[] = [
  { index: 0,  label: 'BTC-USD',    pythId: 'BTC-USD',    feedId: PYTH_FEED_IDS['BTC-USD']    },
  { index: 1,  label: 'ETH-USD',    pythId: 'ETH-USD',    feedId: PYTH_FEED_IDS['ETH-USD']    },
  { index: 2,  label: 'SOL-USD',    pythId: 'SOL-USD',    feedId: PYTH_FEED_IDS['SOL-USD']    },
  { index: 3,  label: 'AVAX-USD',   pythId: 'AVAX-USD',   feedId: PYTH_FEED_IDS['AVAX-USD']   },
  { index: 4,  label: 'LINK-USD',   pythId: 'LINK-USD',   feedId: PYTH_FEED_IDS['LINK-USD']   },
  { index: 5,  label: 'DOGE-USD',   pythId: 'DOGE-USD',   feedId: PYTH_FEED_IDS['DOGE-USD']   },
  { index: 6,  label: 'NEAR-USD',   pythId: 'NEAR-USD',   feedId: PYTH_FEED_IDS['NEAR-USD']   },
  { index: 7,  label: 'INJ-USD',    pythId: 'INJ-USD',    feedId: PYTH_FEED_IDS['INJ-USD']    },
  { index: 8,  label: 'APT-USD',    pythId: 'APT-USD',    feedId: PYTH_FEED_IDS['APT-USD']    },
  { index: 9,  label: 'ARB-USD',    pythId: 'ARB-USD',    feedId: PYTH_FEED_IDS['ARB-USD']    },
  { index: 10, label: 'OP-USD',     pythId: 'OP-USD',     feedId: PYTH_FEED_IDS['OP-USD']     },
  { index: 11, label: 'SUI-USD',    pythId: 'SUI-USD',    feedId: PYTH_FEED_IDS['SUI-USD']    },
  { index: 12, label: 'TIA-USD',    pythId: 'TIA-USD',    feedId: PYTH_FEED_IDS['TIA-USD']    },
  { index: 13, label: 'SEI-USD',    pythId: 'SEI-USD',    feedId: PYTH_FEED_IDS['SEI-USD']    },
  { index: 14, label: 'RENDER-USD', pythId: 'RENDER-USD', feedId: PYTH_FEED_IDS['RENDER-USD'] },
  { index: 15, label: 'WLFI-USD',   pythId: 'WLFI-USD',   feedId: PYTH_FEED_IDS['WLFI-USD']   },
  { index: 16, label: 'POL-USD',    pythId: 'POL-USD',    feedId: PYTH_FEED_IDS['POL-USD']    },
];

interface PairState {
  index: PairIndex;
  label: VeloPairLabel;
  expectedFeedId: string;
  onChainFeedId: string;
  registered: boolean;
  tradable: boolean;
}

export const VeloAdminPanel: React.FC = () => {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [contractOwner, setContractOwner] = useState<string | null>(null);
  const [pairs, setPairs] = useState<PairState[]>([]);
  const [feeBalance, setFeeBalance] = useState(0);
  const [poolBalance, setPoolBalance] = useState(0);
  const [adminUsdcBalance, setAdminUsdcBalance] = useState(0);
  const [faucetCooldownEnd, setFaucetCooldownEnd] = useState(0);
  const [seedAmount, setSeedAmount] = useState('1000');
  // Admin mintTo: owner-only, no cooldown. Default target = self.
  const [adminMintAmount, setAdminMintAmount] = useState('10000');
  const [adminMintTo, setAdminMintTo] = useState('');
  const [openFeeBps, setOpenFeeBps] = useState(0);
  const [closeFeeBps, setCloseFeeBps] = useState(0);
  const [maxLeverage, setMaxLeverage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<{ hash: `0x${string}`; label: string } | null>(null);
  const [stats, setStats] = useState<ProtocolStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const isOwner = !!address && !!contractOwner && address.toLowerCase() === contractOwner.toLowerCase();

  const refresh = async () => {
    if (!publicClient) return;
    setLoading(true);
    try {
      const [owner, openFee, closeFee, maxLev, fees, pool] = await Promise.all([
        publicClient.readContract({ address: VELO_PERPS_ADDRESS, abi: VELO_PERPS_ABI, functionName: 'owner' }),
        publicClient.readContract({ address: VELO_PERPS_ADDRESS, abi: VELO_PERPS_ABI, functionName: 'OPEN_FEE_BPS' }),
        publicClient.readContract({ address: VELO_PERPS_ADDRESS, abi: VELO_PERPS_ABI, functionName: 'CLOSE_FEE_BPS' }),
        publicClient.readContract({ address: VELO_PERPS_ADDRESS, abi: VELO_PERPS_ABI, functionName: 'MAX_LEVERAGE' }),
        publicClient.readContract({ address: VELO_PERPS_ADDRESS, abi: VELO_PERPS_ABI, functionName: 'feeBalance' }),
        fetchPoolBalance(publicClient),
      ]);
      setContractOwner(owner as string);
      setOpenFeeBps(Number(openFee));
      setCloseFeeBps(Number(closeFee));
      setMaxLeverage(Number(maxLev));
      setFeeBalance(Number(formatUnits(fees as bigint, 6)));
      setPoolBalance(pool);

      // Admin wallet mUSDC balance + faucet cooldown
      if (address) {
        const [adminBal, lastClaim, cooldown] = await Promise.all([
          publicClient.readContract({ address: VELO_USDC_BASE, abi: VELO_USDC_ABI, functionName: 'balanceOf', args: [address] }),
          publicClient.readContract({ address: VELO_USDC_BASE, abi: VELO_USDC_ABI, functionName: 'lastFaucetClaim', args: [address] }),
          publicClient.readContract({ address: VELO_USDC_BASE, abi: VELO_USDC_ABI, functionName: 'FAUCET_COOLDOWN' }),
        ]);
        setAdminUsdcBalance(Number(formatUnits(adminBal as bigint, 6)));
        const cooldownEnd = Number(lastClaim) + Number(cooldown);
        setFaucetCooldownEnd(cooldownEnd);
      }

      // Pair states
      const pairResults: PairState[] = await Promise.all(
        KNOWN_PAIRS.map(async (p) => {
          const [feedId, tradable] = await Promise.all([
            publicClient.readContract({
              address: VELO_PERPS_ADDRESS, abi: VELO_PERPS_ABI,
              functionName: 'pairFeedId', args: [p.index],
            }) as Promise<string>,
            publicClient.readContract({
              address: VELO_PERPS_ADDRESS, abi: VELO_PERPS_ABI,
              functionName: 'pairTradable', args: [p.index],
            }) as Promise<boolean>,
          ]);
          const registered = feedId !== '0x0000000000000000000000000000000000000000000000000000000000000000';
          return {
            index: p.index, label: p.label,
            expectedFeedId: p.feedId, onChainFeedId: feedId,
            registered, tradable,
          };
        })
      );
      setPairs(pairResults);
    } catch (e) {
      console.error('[admin] refresh failed:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [publicClient, address]);

  // Fetch /api/protocol-stats for charts. Re-runs when admin refreshes.
  const fetchStats = async () => {
    setStatsLoading(true);
    try {
      const res = await fetch('/api/protocol-stats');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ProtocolStats = await res.json();
      setStats(data);
    } catch (e) {
      console.warn('[admin] stats fetch failed', e);
      setStats(null);
    } finally {
      setStatsLoading(false);
    }
  };
  useEffect(() => { if (isOwner) fetchStats(); }, [isOwner]);

  const handleRegisterPair = async (pair: PairState) => {
    if (!walletClient || !publicClient) return;
    setActionBusy(`register-${pair.index}`);
    setActionError(null);
    try {
      const hash = await walletClient.writeContract({
        address: VELO_PERPS_ADDRESS, abi: VELO_PERPS_ABI,
        functionName: 'registerPair',
        args: [pair.index, pair.expectedFeedId as `0x${string}`, pair.label.replace('-', '/')],
      });
      setLastTx({ hash, label: `Registered ${pair.label}` });
      await publicClient.waitForTransactionReceipt({ hash });
      await refresh();
    } catch (e: any) {
      setActionError(e?.shortMessage || e?.message || 'Register failed');
    } finally {
      setActionBusy(null);
    }
  };

  const handleRegisterAll = async () => {
    if (!walletClient || !publicClient) return;
    const toRegister = pairs.filter(p => !p.registered);
    if (toRegister.length === 0) return;
    setActionBusy('register-all');
    setActionError(null);
    try {
      for (const p of toRegister) {
        const hash = await walletClient.writeContract({
          address: VELO_PERPS_ADDRESS, abi: VELO_PERPS_ABI,
          functionName: 'registerPair',
          args: [p.index, p.expectedFeedId as `0x${string}`, p.label.replace('-', '/')],
        });
        setLastTx({ hash, label: `Registered ${p.label}` });
        await publicClient.waitForTransactionReceipt({ hash });
      }
      await refresh();
    } catch (e: any) {
      setActionError(e?.shortMessage || e?.message || 'Bulk register failed');
    } finally {
      setActionBusy(null);
    }
  };

  const handleToggleTradable = async (pair: PairState) => {
    if (!walletClient || !publicClient) return;
    setActionBusy(`toggle-${pair.index}`);
    setActionError(null);
    try {
      const hash = await walletClient.writeContract({
        address: VELO_PERPS_ADDRESS, abi: VELO_PERPS_ABI,
        functionName: 'setPairTradable',
        args: [pair.index, !pair.tradable],
      });
      setLastTx({ hash, label: `${pair.tradable ? 'Paused' : 'Resumed'} ${pair.label}` });
      await publicClient.waitForTransactionReceipt({ hash });
      await refresh();
    } catch (e: any) {
      setActionError(e?.shortMessage || e?.message || 'Toggle failed');
    } finally {
      setActionBusy(null);
    }
  };

  const handleMintFaucet = async () => {
    if (!walletClient || !publicClient) return;
    setActionBusy('faucet');
    setActionError(null);
    try {
      const hash = await walletClient.writeContract({
        address: VELO_USDC_BASE,
        abi: VELO_USDC_ABI,
        functionName: 'mint',
        args: [],
      });
      setLastTx({ hash, label: 'Minted 1,000 mUSDC from faucet' });
      await publicClient.waitForTransactionReceipt({ hash });
      await refresh();
    } catch (e: any) {
      const msg = e?.shortMessage || e?.message || '';
      if (/FaucetCooldown/i.test(msg) || msg.includes('0x9ad22e0f')) {
        setActionError('Faucet cooldown active — wait 6 hours between mints.');
      } else if (/FaucetBalanceCap/i.test(msg)) {
        setActionError('Balance cap reached (10,000 mUSDC). Send some to the pool first.');
      } else {
        setActionError(msg || 'Faucet mint failed');
      }
    } finally {
      setActionBusy(null);
    }
  };

  const handleSeedPool = async () => {
    if (!walletClient || !publicClient || !address) return;
    const amount = parseFloat(seedAmount);
    if (!amount || amount <= 0) { setActionError('Enter a valid amount to seed.'); return; }
    if (amount > adminUsdcBalance) { setActionError(`You only have ${adminUsdcBalance.toFixed(2)} mUSDC. Mint more first.`); return; }
    setActionBusy('seed');
    setActionError(null);
    try {
      const raw = parseUnits(amount.toFixed(6), 6);
      const hash = await walletClient.writeContract({
        address: VELO_USDC_BASE,
        abi: VELO_USDC_ABI,
        functionName: 'transfer',
        args: [VELO_PERPS_ADDRESS, raw],
      });
      setLastTx({ hash, label: `Seeded pool with ${amount.toLocaleString()} mUSDC` });
      await publicClient.waitForTransactionReceipt({ hash });
      await refresh();
    } catch (e: any) {
      setActionError(e?.shortMessage || e?.message || 'Seed failed');
    } finally {
      setActionBusy(null);
    }
  };

  /**
   * Owner-only mint. Bypasses the public faucet cooldown by calling
   * mintTo(to, amount) on VeloMockUSDC. Useful for seeding pools directly
   * (mint straight into the pool contract) or topping up the admin wallet
   * for testing without waiting 6 hours between faucet calls.
   */
  const handleAdminMint = async () => {
    if (!walletClient || !publicClient || !address) return;
    const amount = parseFloat(adminMintAmount);
    if (!amount || amount <= 0) { setActionError('Enter a valid amount to mint.'); return; }
    const target = (adminMintTo.trim() || address) as `0x${string}`;
    if (!/^0x[0-9a-fA-F]{40}$/.test(target)) { setActionError('Recipient must be a valid 0x address.'); return; }
    setActionBusy('adminMint');
    setActionError(null);
    try {
      const raw = parseUnits(amount.toFixed(6), 6);
      const hash = await walletClient.writeContract({
        address: VELO_USDC_BASE,
        abi: VELO_USDC_ABI,
        functionName: 'mintTo',
        args: [target, raw],
      });
      setLastTx({ hash, label: `Admin minted ${amount.toLocaleString()} mUSDC to ${target.slice(0, 6)}…${target.slice(-4)}` });
      await publicClient.waitForTransactionReceipt({ hash });
      await refresh();
    } catch (e: any) {
      setActionError(e?.shortMessage || e?.message || 'Admin mint failed');
    } finally {
      setActionBusy(null);
    }
  };

  const handleWithdrawFees = async () => {
    if (!walletClient || !publicClient || !address || feeBalance <= 0) return;
    setActionBusy('withdraw');
    setActionError(null);
    try {
      const amount = parseUnits(feeBalance.toFixed(6), 6);
      const hash = await walletClient.writeContract({
        address: VELO_PERPS_ADDRESS, abi: VELO_PERPS_ABI,
        functionName: 'withdrawFees',
        args: [address, amount],
      });
      setLastTx({ hash, label: `Withdrew $${feeBalance.toFixed(2)}` });
      await publicClient.waitForTransactionReceipt({ hash });
      await refresh();
    } catch (e: any) {
      setActionError(e?.shortMessage || e?.message || 'Withdraw failed');
    } finally {
      setActionBusy(null);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center' as const }}>
        <Loader2 className="animate-spin" size={28} style={{ color: 'var(--fg-muted)', margin: '0 auto 16px' }} />
        <div style={{ ...S.mono, fontSize: 12, color: 'var(--fg-muted)', letterSpacing: '0.1em' }}>
          Loading contract state…
        </div>
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div style={{ padding: 48, textAlign: 'center' as const, maxWidth: 480, margin: '0 auto' }}>
        <Shield size={36} style={{ color: 'var(--fg-muted)', margin: '0 auto 20px' }} />
        <h2 style={{ ...S.display, fontSize: 28, color: 'var(--fg)', margin: '0 0 12px' }}>
          Owner-only area
        </h2>
        <p style={{ ...S.sans, fontSize: 14, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
          This page is reserved for the protocol owner wallet. Connect with{' '}
          {contractOwner ? (
            <code style={{ ...S.mono, fontSize: 12, color: 'var(--fg)' }}>
              {contractOwner.slice(0, 6)}…{contractOwner.slice(-4)}
            </code>
          ) : 'the owner wallet'} to manage pairs, fees, and protocol settings.
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 24 }}>
        <div>
          <h1 style={{ ...S.display, fontSize: 40, color: 'var(--fg)', margin: 0 }}>Protocol Admin</h1>
          <p style={{ ...S.mono, fontSize: 11, color: 'var(--fg-muted)', margin: '4px 0 0', letterSpacing: '0.05em' }}>
            VeloPerps · Base Sepolia
          </p>
        </div>
        <button
          onClick={refresh}
          style={{
            ...S.mono, padding: '8px 14px', borderRadius: 10,
            background: 'rgba(255,255,255,0.04)', border: '1px solid var(--hairline)',
            color: 'var(--fg)', fontSize: 11, letterSpacing: '0.1em',
            textTransform: 'uppercase' as const, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <RefreshCw size={11} /> Refresh
        </button>
      </div>

      {/* Top stats row — current contract state */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 12 }}>
        <StatCard label="Accrued fees" value={`$${feeBalance.toFixed(2)}`} accent={feeBalance > 0} />
        <StatCard label="Pool reserves" value={`$${poolBalance.toLocaleString('en-US', { maximumFractionDigits: 2 })}`} />
        <StatCard label="Fee per side" value={`${(openFeeBps / 100).toFixed(2)}%`} />
        <StatCard label="Max leverage" value={`${maxLeverage}×`} />
      </div>

      {/* Lifetime stats row — pulled from /api/protocol-stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
        <StatCard
          label="Lifetime volume"
          value={statsLoading ? '…' : stats ? `$${stats.lifetime.total_volume_usd.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—'}
        />
        <StatCard
          label="Lifetime fees"
          value={statsLoading ? '…' : stats ? `$${stats.lifetime.total_fees_usd.toFixed(2)}` : '—'}
        />
        <StatCard
          label="Open positions"
          value={statsLoading ? '…' : stats ? `${stats.lifetime.currently_open}` : '—'}
        />
        <StatCard
          label="Liquidations"
          value={statsLoading ? '…' : stats ? `${stats.lifetime.total_liquidations}` : '—'}
        />
      </div>

      {/* Charts — volume and fees over time */}
      {stats && stats.daily_buckets.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 24 }}>
          <ChartCard title="Daily volume" icon={<TrendingUp size={13} style={{ color: 'var(--iris-violet)' }} />}>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={stats.daily_buckets}>
                <defs>
                  <linearGradient id="volumeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.68 0.22 295)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="oklch(0.68 0.22 295)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline)" opacity={0.3} />
                <XAxis dataKey="date" stroke="var(--fg-subtle)" style={{ fontFamily: 'var(--font-mono)', fontSize: 9 }} tickFormatter={(d) => d.slice(5)} />
                <YAxis stroke="var(--fg-subtle)" style={{ fontFamily: 'var(--font-mono)', fontSize: 9 }} tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)}`} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-base-2)', border: '1px solid var(--hairline)', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 11 }}
                  labelStyle={{ color: 'var(--fg)' }}
                  formatter={(value: any) => [`$${Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })}`, 'Volume']}
                />
                <Area type="monotone" dataKey="volume_usd" stroke="oklch(0.68 0.22 295)" strokeWidth={2} fill="url(#volumeGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Daily fees" icon={<Activity size={13} style={{ color: 'var(--iris-coral)' }} />}>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={stats.daily_buckets.map(b => ({ ...b, total_fees: b.open_fees_usd + b.close_fees_usd }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline)" opacity={0.3} />
                <XAxis dataKey="date" stroke="var(--fg-subtle)" style={{ fontFamily: 'var(--font-mono)', fontSize: 9 }} tickFormatter={(d) => d.slice(5)} />
                <YAxis stroke="var(--fg-subtle)" style={{ fontFamily: 'var(--font-mono)', fontSize: 9 }} tickFormatter={(v) => `$${Number(v).toFixed(0)}`} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-base-2)', border: '1px solid var(--hairline)', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 11 }}
                  labelStyle={{ color: 'var(--fg)' }}
                  formatter={(value: any) => [`$${Number(value).toFixed(2)}`, 'Fees']}
                />
                <Bar dataKey="total_fees" fill="oklch(0.70 0.22 340)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Daily opens & closes" icon={<ChevronRight size={13} style={{ color: 'var(--iris-lime)' }} />}>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={stats.daily_buckets}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline)" opacity={0.3} />
                <XAxis dataKey="date" stroke="var(--fg-subtle)" style={{ fontFamily: 'var(--font-mono)', fontSize: 9 }} tickFormatter={(d) => d.slice(5)} />
                <YAxis stroke="var(--fg-subtle)" style={{ fontFamily: 'var(--font-mono)', fontSize: 9 }} />
                <Tooltip contentStyle={{ background: 'var(--bg-base-2)', border: '1px solid var(--hairline)', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 11 }} />
                <Bar dataKey="opens" fill="oklch(0.78 0.20 150)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="closes" fill="oklch(0.65 0.22 25)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Daily liquidations" icon={<Shield size={13} style={{ color: 'var(--pnl-down)' }} />}>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={stats.daily_buckets}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline)" opacity={0.3} />
                <XAxis dataKey="date" stroke="var(--fg-subtle)" style={{ fontFamily: 'var(--font-mono)', fontSize: 9 }} tickFormatter={(d) => d.slice(5)} />
                <YAxis stroke="var(--fg-subtle)" style={{ fontFamily: 'var(--font-mono)', fontSize: 9 }} />
                <Tooltip contentStyle={{ background: 'var(--bg-base-2)', border: '1px solid var(--hairline)', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 11 }} />
                <Bar dataKey="liquidations" fill="oklch(0.65 0.22 25)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}

      {/* Data endpoint hint */}
      <div style={{
        padding: 12, marginBottom: 16, borderRadius: 10,
        background: 'rgba(255,255,255,0.02)', border: '1px solid var(--hairline)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ ...S.mono, fontSize: 10, color: 'var(--fg-muted)', letterSpacing: '0.06em' }}>
          ENDPOINT  <code style={{ color: 'var(--fg)' }}>/api/protocol-stats</code>  ·  Datadog, Grafana, or custom dashboards can scrape this URL on a schedule.
        </span>
        <a href="/api/protocol-stats" target="_blank" rel="noopener noreferrer"
          style={{ ...S.mono, fontSize: 10, color: 'var(--iris-violet)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
          View JSON <ExternalLink size={10} />
        </a>
      </div>

      {/* Last tx + errors */}
      {lastTx && (
        <div style={{
          padding: 12, borderRadius: 12, marginBottom: 12,
          background: 'oklch(0.78 0.18 150 / 0.08)', border: '1px solid oklch(0.78 0.18 150 / 0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ ...S.mono, fontSize: 12, color: 'var(--fg)' }}>
            <CheckCircle2 size={12} style={{ color: 'var(--pnl-up)', display: 'inline', marginRight: 6, verticalAlign: -1 }} />
            {lastTx.label}
          </span>
          <a
            href={baseScanTxUrl(lastTx.hash)} target="_blank" rel="noopener noreferrer"
            style={{ ...S.mono, fontSize: 10, color: 'var(--iris-violet)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            BaseScan <ExternalLink size={10} />
          </a>
        </div>
      )}
      {actionError && (
        <div style={{
          padding: 12, borderRadius: 12, marginBottom: 12,
          background: 'rgba(255, 80, 80, 0.08)', border: '1px solid rgba(255, 80, 80, 0.25)',
          ...S.mono, fontSize: 11, color: 'var(--pnl-down)',
        }}>
          {actionError}
        </div>
      )}

      {/* Pair registry */}
      <div style={{
        padding: 20, borderRadius: 16, marginBottom: 16,
        background: 'rgba(255,255,255,0.02)', border: '1px solid var(--hairline)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ ...S.display, fontSize: 22, color: 'var(--fg)', margin: 0 }}>Trading pairs</h2>
          {pairs.some(p => !p.registered) && (
            <button
              onClick={handleRegisterAll}
              disabled={actionBusy !== null}
              style={{
                ...S.mono, padding: '10px 16px', borderRadius: 10,
                background: actionBusy === 'register-all'
                  ? 'var(--chip-bg)'
                  : 'linear-gradient(100deg, oklch(0.68 0.22 295), oklch(0.70 0.22 340))',
                border: 'none', color: '#fff',
                fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase' as const, cursor: actionBusy ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {actionBusy === 'register-all'
                ? <><Loader2 className="animate-spin" size={11} /> Registering…</>
                : <><PlusCircle size={11} /> Register all pending</>
              }
            </button>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pairs.map((p) => (
            <div key={p.index} style={{
              padding: '14px 16px', borderRadius: 12,
              background: 'rgba(255,255,255,0.02)', border: '1px solid var(--hairline)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                <span style={{ ...S.label, color: 'var(--fg-muted)', minWidth: 24 }}>#{p.index}</span>
                <span style={{ ...S.display, fontSize: 18, color: 'var(--fg)', minWidth: 110 }}>
                  {p.label.replace('-', '/')}
                </span>
                <code style={{ ...S.mono, fontSize: 10, color: 'var(--fg-subtle)' }}>
                  {p.expectedFeedId.slice(0, 10)}…{p.expectedFeedId.slice(-8)}
                </code>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {p.registered ? (
                  <>
                    <span style={{
                      ...S.mono, fontSize: 9, padding: '4px 10px', borderRadius: 999,
                      background: p.tradable ? 'oklch(0.78 0.18 150 / 0.15)' : 'rgba(255,200,50,0.12)',
                      color: p.tradable ? 'var(--pnl-up)' : 'oklch(0.85 0.15 80)',
                      letterSpacing: '0.1em', textTransform: 'uppercase' as const, fontWeight: 700,
                    }}>
                      {p.tradable ? 'LIVE' : 'PAUSED'}
                    </span>
                    <button
                      onClick={() => handleToggleTradable(p)}
                      disabled={actionBusy !== null}
                      style={{
                        ...S.mono, padding: '7px 12px', borderRadius: 8,
                        background: 'rgba(255,255,255,0.04)', border: '1px solid var(--hairline)',
                        color: 'var(--fg)', fontSize: 10, letterSpacing: '0.08em',
                        textTransform: 'uppercase' as const, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 5,
                      }}
                    >
                      {actionBusy === `toggle-${p.index}` ? <Loader2 className="animate-spin" size={10} />
                        : p.tradable ? <Pause size={10} /> : <Play size={10} />}
                      {p.tradable ? 'Pause' : 'Resume'}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleRegisterPair(p)}
                    disabled={actionBusy !== null}
                    style={{
                      ...S.mono, padding: '7px 14px', borderRadius: 8,
                      background: 'linear-gradient(100deg, oklch(0.68 0.22 295), oklch(0.70 0.22 340))',
                      border: 'none', color: '#fff',
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                      textTransform: 'uppercase' as const, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}
                  >
                    {actionBusy === `register-${p.index}` ? <Loader2 className="animate-spin" size={10} />
                      : <PlusCircle size={10} />}
                    Register
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Fees panel */}
      <div style={{
        padding: 20, borderRadius: 16, marginBottom: 16,
        background: 'rgba(255,255,255,0.02)', border: '1px solid var(--hairline)',
      }}>
        <h2 style={{ ...S.display, fontSize: 22, color: 'var(--fg)', margin: '0 0 16px' }}>Protocol fees</h2>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={S.label}>Accrued (claimable)</div>
            <div style={{ ...S.display, fontSize: 32, color: 'var(--fg)', marginTop: 4 }}>
              ${feeBalance.toFixed(2)}
            </div>
            <div style={{ ...S.mono, fontSize: 11, color: 'var(--fg-muted)', marginTop: 4 }}>
              Open {(openFeeBps / 100).toFixed(2)}% + Close {(closeFeeBps / 100).toFixed(2)}% per trade
            </div>
          </div>
          <button
            onClick={handleWithdrawFees}
            disabled={feeBalance <= 0 || actionBusy !== null}
            style={{
              ...S.mono, padding: '12px 20px', borderRadius: 12,
              background: feeBalance > 0
                ? 'linear-gradient(100deg, oklch(0.68 0.22 295), oklch(0.70 0.22 340))'
                : 'var(--chip-bg)',
              border: 'none', color: '#fff',
              fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase' as const,
              cursor: feeBalance > 0 ? 'pointer' : 'not-allowed',
              opacity: feeBalance > 0 ? 1 : 0.5,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {actionBusy === 'withdraw'
              ? <><Loader2 className="animate-spin" size={11} /> Withdrawing…</>
              : <><ArrowDownToLine size={11} /> Withdraw to owner</>
            }
          </button>
        </div>
      </div>

      {/* Pool management */}
      <div style={{
        padding: 20, borderRadius: 16, marginBottom: 16,
        background: 'rgba(255,255,255,0.02)', border: '1px solid var(--hairline)',
      }}>
        <h2 style={{ ...S.display, fontSize: 22, color: 'var(--fg)', margin: '0 0 4px' }}>Liquidity pool</h2>
        <p style={{ ...S.sans, fontSize: 12, color: 'var(--fg-muted)', margin: '0 0 20px', lineHeight: 1.5 }}>
          The pool pays out winning trades. Keep it funded or closes revert with InsufficientPool.
          Faucet mints 1,000 mUSDC per call (6-hour cooldown, 10k cap per wallet).
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <div style={{ padding: 16, borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--hairline)' }}>
            <div style={S.label}>Pool reserves</div>
            <div style={{ ...S.display, fontSize: 28, color: poolBalance < 500 ? 'var(--pnl-down)' : 'var(--pnl-up)', marginTop: 6 }}>
              ${poolBalance.toLocaleString('en-US', { maximumFractionDigits: 2 })}
            </div>
            {poolBalance < 500 && (
              <div style={{ ...S.mono, fontSize: 10, color: 'var(--pnl-down)', marginTop: 4 }}>Low - seed more</div>
            )}
          </div>
          <div style={{ padding: 16, borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--hairline)' }}>
            <div style={S.label}>Your mUSDC balance</div>
            <div style={{ ...S.display, fontSize: 28, color: 'var(--fg)', marginTop: 6 }}>
              ${adminUsdcBalance.toLocaleString('en-US', { maximumFractionDigits: 2 })}
            </div>
            {faucetCooldownEnd > 0 && faucetCooldownEnd > Date.now() / 1000 && (
              <div style={{ ...S.mono, fontSize: 10, color: 'var(--fg-muted)', marginTop: 4 }}>
                Faucet ready in {Math.ceil((faucetCooldownEnd - Date.now() / 1000) / 3600)}h
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' as const }}>
          <button
            onClick={handleMintFaucet}
            disabled={actionBusy !== null}
            style={{
              ...S.mono, padding: '12px 20px', borderRadius: 12, border: 'none',
              background: 'linear-gradient(100deg, oklch(0.68 0.22 295), oklch(0.70 0.22 340))',
              color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase' as const, cursor: actionBusy ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' as const,
            }}
          >
            {actionBusy === 'faucet' ? <><Loader2 className="animate-spin" size={11} /> Minting...</> : '+ Mint 1,000 mUSDC'}
          </button>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, minWidth: 240 }}>
            <div style={{ position: 'relative' as const, flex: 1 }}>
              <span style={{ position: 'absolute' as const, left: 12, top: '50%', transform: 'translateY(-50%)', ...S.mono, fontSize: 13, color: 'var(--fg-muted)' }}>$</span>
              <input
                type="number" value={seedAmount} onChange={e => setSeedAmount(e.target.value)}
                min="1" max={adminUsdcBalance}
                style={{
                  ...S.mono, width: '100%', padding: '12px 12px 12px 24px', borderRadius: 12,
                  border: '1px solid var(--hairline)', background: 'rgba(255,255,255,0.04)',
                  color: 'var(--fg)', fontSize: 13, boxSizing: 'border-box' as const, outline: 'none',
                }}
              />
            </div>
            <button
              onClick={handleSeedPool}
              disabled={actionBusy !== null || adminUsdcBalance <= 0}
              style={{
                ...S.mono, padding: '12px 20px', borderRadius: 12, border: 'none',
                background: adminUsdcBalance > 0 ? 'linear-gradient(100deg, oklch(0.78 0.20 150), oklch(0.65 0.22 180))' : 'var(--chip-bg)',
                color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase' as const, cursor: actionBusy || adminUsdcBalance <= 0 ? 'not-allowed' : 'pointer',
                opacity: adminUsdcBalance > 0 ? 1 : 0.5,
                display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' as const,
              }}
            >
              {actionBusy === 'seed' ? <><Loader2 className="animate-spin" size={11} /> Seeding...</> : 'Seed pool'}
            </button>
          </div>
        </div>

        {/* ── Owner-only mintTo — no cooldown ────────────────────────── */}
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px dashed var(--hairline)' }}>
          <h3 style={{ ...S.mono, fontSize: 11, color: 'var(--fg-muted)', margin: '0 0 8px', letterSpacing: '0.1em', textTransform: 'uppercase' as const, fontWeight: 700 }}>
            Admin mint · no cooldown
          </h3>
          <p style={{ ...S.sans, fontSize: 12, color: 'var(--fg-muted)', margin: '0 0 12px', lineHeight: 1.4 }}>
            Owner-only path that bypasses the 6-hour faucet cooldown. Leave the recipient blank to mint to yourself, or paste any address (e.g. paste the V2 pool address to seed it directly without a second transfer step).
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const }}>
            <div style={{ position: 'relative' as const, flex: '0 0 160px' }}>
              <span style={{ position: 'absolute' as const, left: 12, top: '50%', transform: 'translateY(-50%)', ...S.mono, fontSize: 13, color: 'var(--fg-muted)' }}>$</span>
              <input
                type="number" value={adminMintAmount} onChange={e => setAdminMintAmount(e.target.value)}
                min="1" placeholder="10000"
                style={{
                  ...S.mono, width: '100%', padding: '12px 12px 12px 24px', borderRadius: 12,
                  border: '1px solid var(--hairline)', background: 'rgba(255,255,255,0.04)',
                  color: 'var(--fg)', fontSize: 13, boxSizing: 'border-box' as const, outline: 'none',
                }}
              />
            </div>
            <input
              type="text" value={adminMintTo} onChange={e => setAdminMintTo(e.target.value)}
              placeholder="0x… (blank = mint to yourself)"
              style={{
                ...S.mono, flex: 1, minWidth: 240, padding: '12px', borderRadius: 12,
                border: '1px solid var(--hairline)', background: 'rgba(255,255,255,0.04)',
                color: 'var(--fg)', fontSize: 11, boxSizing: 'border-box' as const, outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => { setAdminMintTo(VELO_PERPS_V2_ADDRESS); setAdminMintAmount('50000'); }}
                disabled={!VELO_PERPS_V2_ADDRESS || VELO_PERPS_V2_ADDRESS.length !== 42}
                title="Pre-fill: 50,000 mUSDC straight into V2 pool"
                style={{
                  ...S.mono, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--hairline)',
                  background: 'rgba(255,255,255,0.02)', color: 'var(--fg-muted)', fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.08em', textTransform: 'uppercase' as const, cursor: 'pointer', whiteSpace: 'nowrap' as const,
                }}>
                → V2 pool
              </button>
              <button
                onClick={handleAdminMint}
                disabled={actionBusy !== null || !isOwner}
                style={{
                  ...S.mono, padding: '12px 18px', borderRadius: 12, border: 'none',
                  background: isOwner ? 'linear-gradient(100deg, oklch(0.78 0.20 60), oklch(0.70 0.22 30))' : 'var(--chip-bg)',
                  color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
                  textTransform: 'uppercase' as const, cursor: actionBusy || !isOwner ? 'not-allowed' : 'pointer',
                  opacity: isOwner ? 1 : 0.5, whiteSpace: 'nowrap' as const,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                {actionBusy === 'adminMint' ? <><Loader2 className="animate-spin" size={11} /> Minting...</> : 'Mint'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Contract metadata */}
      <div style={{
        padding: 20, borderRadius: 16,
        background: 'rgba(255,255,255,0.02)', border: '1px solid var(--hairline)',
      }}>
        <h2 style={{ ...S.display, fontSize: 22, color: 'var(--fg)', margin: '0 0 16px' }}>Contract metadata</h2>
        <MetadataRow label="VeloPerps V2 (active)" value={VELO_PERPS_V2_ADDRESS} link={baseScanAddressUrl(VELO_PERPS_V2_ADDRESS)} />
        <MetadataRow label="VeloPerps V1 (legacy)" value={VELO_PERPS_V1_ADDRESS} link={baseScanAddressUrl(VELO_PERPS_V1_ADDRESS)} />
        <MetadataRow label="mUSDC" value={VELO_USDC_BASE} link={baseScanAddressUrl(VELO_USDC_BASE)} />
        <MetadataRow label="Owner" value={contractOwner || '-'} />
        <MetadataRow label="Connected" value={address || '-'} />
        <div style={{ marginTop: 12, padding: '10px 0', borderTop: '1px solid var(--hairline)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ ...S.mono, fontSize: 10, color: 'var(--fg-muted)' }}>V2: add/reduce margin, partial close, on-chain TP/SL, 0.25% keeper bounty</span>
          {IS_V2 && <span style={{ ...S.mono, fontSize: 10, color: 'var(--pnl-up)', fontWeight: 700 }}>ROUTING TO V2</span>}
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: string; accent?: boolean }> = ({ label, value, accent }) => (
  <div style={{
    padding: 16, borderRadius: 14,
    background: 'rgba(255,255,255,0.02)', border: '1px solid var(--hairline)',
  }}>
    <div style={S.label}>{label}</div>
    <div style={{
      ...S.display, fontSize: 26, marginTop: 6,
      color: accent ? 'var(--pnl-up)' : 'var(--fg)',
    }}>
      {value}
    </div>
  </div>
);

const ChartCard: React.FC<{ title: string; icon?: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <div style={{
    padding: 16, borderRadius: 14,
    background: 'rgba(255,255,255,0.02)', border: '1px solid var(--hairline)',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
      {icon}
      <span style={S.label}>{title}</span>
    </div>
    {children}
  </div>
);

const MetadataRow: React.FC<{ label: string; value: string; link?: string }> = ({ label, value, link }) => (
  <div style={{
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 0', borderBottom: '1px solid var(--hairline)',
  }}>
    <span style={S.label}>{label}</span>
    {link ? (
      <a href={link} target="_blank" rel="noopener noreferrer"
        style={{ ...S.mono, fontSize: 11, color: 'var(--iris-violet)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
        {value.slice(0, 6)}…{value.slice(-4)} <ExternalLink size={10} />
      </a>
    ) : (
      <span style={{ ...S.mono, fontSize: 11, color: 'var(--fg)' }}>
        {value.slice(0, 6)}…{value.slice(-4)}
      </span>
    )}
  </div>
);
