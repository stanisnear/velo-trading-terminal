import React, { useState, useEffect } from 'react';
import { Activity, ArrowDownCircle, ArrowUpCircle, Copy, Edit, History, TrendingUp, TrendingDown, User, Users, Zap, Star, Loader2, ExternalLink, Clock, AlertCircle, CheckCircle2, X, Link2 } from 'lucide-react';
import { PortfolioChart } from '@/components/PortfolioChart';
import { formatMoney, formatPrice, calculateStats } from '@/components/ui/shared';
import { Position } from '@/utils/types';
import { OrderDetailsModal } from '@/components/ui/OrderDetailsModal';

const S = {
  display: { fontFamily: 'var(--font-display)', fontStyle: 'italic' as const, letterSpacing: '-0.02em' },
  mono:    { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1', fontVariantNumeric: 'tabular-nums' as const },
  sans:    { fontFamily: 'var(--font-sans, system-ui, sans-serif)' },
  label:   { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)' } as React.CSSProperties,
};

const panel: React.CSSProperties = {
  background: 'var(--bg-base-2)',
  border: '1px solid var(--hairline)',
  borderRadius: 16,
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  boxShadow: 'var(--glass-shadow)',
  overflow: 'hidden',
};

const Ico3D = ({ bg, size = 28, children }: { bg: React.CSSProperties; size?: number; children: React.ReactNode }) => (
  <div style={{ position: 'relative', width: size, height: size, borderRadius: size * 0.3, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', isolation: 'isolate', flexShrink: 0, ...bg }}>
    <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 90% at 30% 8%, rgba(255,255,255,0.65), transparent 55%)', zIndex: 2, pointerEvents: 'none' }} />
    <div style={{ position: 'relative', zIndex: 1, color: '#fff', display: 'flex' }}>{children}</div>
  </div>
);

const iconBg = {
  orange:  { background: 'linear-gradient(160deg, oklch(0.90 0.16 75), oklch(0.60 0.18 50))' } as React.CSSProperties,
  lime:    { background: 'linear-gradient(160deg, oklch(0.90 0.18 130), oklch(0.60 0.20 145))' } as React.CSSProperties,
  magenta: { background: 'linear-gradient(160deg, oklch(0.80 0.22 340), oklch(0.50 0.24 340))' } as React.CSSProperties,
  violet:  { background: 'linear-gradient(160deg, oklch(0.76 0.22 295), oklch(0.44 0.22 295))' } as React.CSSProperties,
  cyan:    { background: 'linear-gradient(160deg, oklch(0.86 0.14 205), oklch(0.55 0.16 215))' } as React.CSSProperties,
};

// Solid primary action button — no animation
const BtnPrimary = ({ onClick, children, style }: any) => (
  <button onClick={onClick} style={{ padding: '11px 16px', borderRadius: 12, background: 'var(--fg)', border: 'none', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--bg-base)', cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase' as const, transition: 'opacity 0.15s', ...style }}
    onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.85'}
    onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}>
    {children}
  </button>
);

const BtnSecondary = ({ onClick, children, style }: any) => (
  <button onClick={onClick} style={{ padding: '11px 16px', borderRadius: 12, background: 'var(--chip-bg)', border: '1px solid var(--hairline-strong)', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--fg-muted)', cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase' as const, transition: 'background 0.15s', ...style }}
    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--chip-bg-hover)'}
    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--chip-bg)'}>
    {children}
  </button>
);

// Fake deposit/withdraw modal removed — all funds flow through Orderly on-chain

export const Dashboard = ({ user, positions, marketPrices, handleClosePosition, traders, handleDeposit, handleWithdraw, onEditPosition, onViewProfile, handleCopyTrade, totalEquity: equityProp, totalLockedMargin: lockedMarginProp, totalUnrealizedPnl: unrealizedProp, buyingPower: buyingPowerProp, onOpenOrderlyOnboarding, onOpenDeposit, onOpenWithdraw, onOpenSend, onOpenBridge, pendingDeposits, onResumeOnboarding, onClaimTestnetUsdc, claimingFaucet, theme = 'dark' }: any) => {
  const [chartPeriod, setChartPeriod] = useState<'1D'|'1W'|'1M'|'1Y'|'ALL'>('ALL');
  const [detailsItem, setDetailsItem] = useState<any>(null);
  const [pendingDepositDetail, setPendingDepositDetail] = useState<any>(null);
  const [activityPage, setActivityPage] = useState(1);
  const ACTIVITY_PER_PAGE = 8;

  // Use pre-computed values from App when available (single source of truth),
  // fall back to local calculation for backwards compatibility.
  const allPositionsPnl = unrealizedProp !== undefined ? unrealizedProp : positions.reduce((acc: number, p: Position) => {
    const cp = marketPrices[p.pair] || p.entryPrice;
    return acc + (p.side === 'LONG' ? (cp - p.entryPrice) / p.entryPrice * p.size : (p.entryPrice - cp) / p.entryPrice * p.size);
  }, 0);
  const totalMarginUsed = lockedMarginProp !== undefined ? lockedMarginProp : positions.reduce((acc: number, p: Position) => acc + (p.size / p.leverage), 0);
  const equity = equityProp !== undefined ? equityProp : user.balance + totalMarginUsed + allPositionsPnl;
  const totalPnl = user.realizedPnL + allPositionsPnl;
  const stats = calculateStats(user.tradeHistory);
  const pnlColor = totalPnl >= 0 ? 'var(--pnl-up)' : 'var(--pnl-down)';

  // Only expose periods the account is old enough to have data for
  const joinedMs = user.joinedDate ? new Date(user.joinedDate).getTime() : Date.now();
  const ageMs = Date.now() - joinedMs;
  const periodMs: Record<string, number> = { '1D': 86400000, '1W': 604800000, '1M': 2592000000, '1Y': 31536000000 };
  const allPeriods: Array<'1D'|'1W'|'1M'|'1Y'|'ALL'> = ['1D','1W','1M','1Y','ALL'];
  const availablePeriods = allPeriods.filter(p => p === 'ALL' || ageMs >= periodMs[p]);

  const getChartData = () => {
    const history = [...user.pnlHistory];
    const now = new Date();
    const nowEntry = { time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), value: equity, timestamp: now.getTime() };
    if (history.length === 0 || history[history.length - 1].value !== equity) history.push(nowEntry);
    else history[history.length - 1] = nowEntry;
    if (chartPeriod === 'ALL') return history;
    const cutoff = Date.now() - periodMs[chartPeriod];
    return history.filter((d: any) => (d.timestamp || 0) >= cutoff);
  };

  // ── Pending Deposit Detail Modal ────────────────────────────────────────────
  const PendingDepositDetailModal = ({ deposit, onClose }: { deposit: any; onClose: () => void }) => {
    const credited = deposit.status === 'CREDITED';
    const failed = deposit.status === 'FAILED';
    const settling = deposit.status === 'PENDING_CONFIRM' || deposit.status === 'CONFIRMED_AWAITING_CREDIT';
    const statusColor = credited ? 'var(--pnl-up)' : failed ? 'var(--pnl-down)' : 'var(--iris-violet)';
    const statusLabel = credited ? 'Credited' : failed ? 'Failed' : settling ? 'Settling' : 'Pending';
    const Row = ({ label, value, extra }: { label: string; value: React.ReactNode; extra?: React.ReactNode }) => (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 20px', borderBottom: '1px solid var(--hairline-strong)' }}>
        <span style={{ ...S.label, fontSize: 10 }}>{label}</span>
        <span style={{ ...S.mono, fontSize: 12, color: 'var(--fg-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>{value}{extra}</span>
      </div>
    );
    return (
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(7,7,10,0.85)', backdropFilter: 'blur(16px)' }}>
        <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, background: 'var(--glass-bg-strong)', border: '1px solid var(--hairline-strong)', borderRadius: 20, overflow: 'hidden', boxShadow: 'var(--glass-shadow)' }}>
          {/* Header */}
          <div style={{ padding: '18px 20px 16px', borderBottom: '1px solid var(--hairline-strong)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, boxShadow: `0 0 6px ${statusColor}` }} />
              <span style={{ ...S.mono, fontSize: 13, fontWeight: 700, color: 'var(--fg)', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Deposit</span>
              <span style={{ ...S.mono, fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: 'var(--chip-bg)', color: statusColor, border: `1px solid ${statusColor}40` }}>{statusLabel}</span>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-subtle)', display: 'flex', padding: 4 }}><X size={16} /></button>
          </div>
          {/* Amount hero */}
          <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid var(--hairline-strong)', textAlign: 'center', background: 'rgba(34,197,94,0.05)' }}>
            <div style={{ ...S.label, fontSize: 10, marginBottom: 4 }}>Amount</div>
            <div style={{ ...S.mono, fontSize: 32, fontWeight: 700, color: 'var(--pnl-up)' }}>+${formatMoney(deposit.amount ?? 0)}</div>
            <div style={{ ...S.sans, fontSize: 12, color: 'var(--fg-subtle)', marginTop: 4 }}>USDC → Velo Trading Wallet</div>
          </div>
          {/* Details */}
          <Row label="Status" value={<span style={{ color: statusColor }}>{statusLabel}</span>} />
          <Row label="Network" value="Base Sepolia" />
          <Row label="Time" value={deposit.timestamp ? new Date(deposit.timestamp).toLocaleString() : '—'} />
          {deposit.depositTx && (
            <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--hairline-strong)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ ...S.label, fontSize: 10 }}>TX ID (Deposit)</span>
              <a href={`https://sepolia.basescan.org/tx/${deposit.depositTx}`} target="_blank" rel="noopener noreferrer"
                style={{ ...S.mono, fontSize: 10, color: 'var(--iris-violet)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
                {deposit.depositTx.slice(0, 8)}…{deposit.depositTx.slice(-6)} <ExternalLink size={10} />
              </a>
            </div>
          )}
          {deposit.approveTx && (
            <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--hairline-strong)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ ...S.label, fontSize: 10 }}>TX ID (Approval)</span>
              <a href={`https://sepolia.basescan.org/tx/${deposit.approveTx}`} target="_blank" rel="noopener noreferrer"
                style={{ ...S.mono, fontSize: 10, color: 'var(--iris-violet)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
                {deposit.approveTx.slice(0, 8)}…{deposit.approveTx.slice(-6)} <ExternalLink size={10} />
              </a>
            </div>
          )}
          {!deposit.depositTx && !deposit.approveTx && (
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--hairline-strong)' }}>
              <div style={{ ...S.label, fontSize: 10, marginBottom: 6 }}>TX ID</div>
              <div style={{ ...S.mono, fontSize: 11, color: 'var(--fg-subtle)', display: 'flex', alignItems: 'center', gap: 6 }}>
                {settling ? <><Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> Waiting for confirmation…</> : '—'}
              </div>
            </div>
          )}
          {/* Footer */}
          <div style={{ padding: '14px 20px' }}>
            <a href="https://sepolia.basescan.org" target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, ...S.mono, fontSize: 11, color: 'var(--fg-muted)', textDecoration: 'none', padding: '9px 16px', borderRadius: 10, background: 'var(--chip-bg)', border: '1px solid var(--hairline-strong)' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--iris-violet)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--fg-muted)'}>
              <Link2 size={11} /> View on BaseScan Explorer
            </a>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }} className="animate-fade-in">
      {/* Pending Deposit Detail Modal */}
      {pendingDepositDetail && <PendingDepositDetailModal deposit={pendingDepositDetail} onClose={() => setPendingDepositDetail(null)} />}
      {/* On-chain deposit/withdraw handled by OrderlyOnboardingModal in App.tsx */}
      <OrderDetailsModal
        payload={detailsItem}
        onClose={() => setDetailsItem(null)}
        marketPrices={marketPrices}
        onClosePosition={handleClosePosition}
        onEditPosition={onEditPosition}
        handleCancelOrder={() => {}}
      />

      {/* Top row */}
      <div className="dash-grid-main">
        {/* Portfolio card */}
        <div style={{ ...panel, display: 'flex', flexDirection: 'column', minHeight: 320 }}>
          <div className="dash-panel-inner" style={{ padding: '20px 22px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' as const }}>
            <div>
              <p style={{ ...S.label, marginBottom: 5 }}>Total Equity</p>
              <p style={{ ...S.display, fontSize: 'clamp(32px, 4vw, 48px)', color: 'var(--fg)', lineHeight: 1, marginBottom: 8 }}>${formatMoney(equity)}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' as const }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, ...S.mono, fontSize: 12, fontWeight: 700, color: pnlColor }}>
                  {totalPnl >= 0 ? <TrendingUp size={13}/> : <TrendingDown size={13}/>}
                  ${formatMoney(Math.abs(totalPnl))} ({equity > 0 ? (totalPnl / (equity - totalPnl) * 100).toFixed(2) : '0.00'}%)
                </span>
                <span style={{ ...S.mono, fontSize: 11, color: 'var(--fg-subtle)' }}>
                  Buying Power <span style={{ color: 'var(--fg-muted)' }}>${formatMoney(buyingPowerProp !== undefined ? buyingPowerProp : user.balance)}</span>
                </span>
              </div>
            </div>
            {availablePeriods.length > 1 && (
              <div style={{ display: 'flex', gap: 3, background: 'var(--chip-bg)', borderRadius: 9, padding: 3, flexShrink: 0, alignSelf: 'flex-start' }}>
                {availablePeriods.map(p => (
                  <button key={p} onClick={() => setChartPeriod(p)} style={{ padding: '4px 9px', borderRadius: 6, border: 'none', cursor: 'pointer', ...S.mono, fontSize: 11, fontWeight: 700, transition: 'all 0.15s', background: chartPeriod === p ? 'var(--bg-base)' : 'transparent', color: chartPeriod === p ? 'var(--fg)' : 'var(--fg-subtle)', boxShadow: chartPeriod === p ? '0 1px 4px rgba(0,0,0,0.15)' : 'none' }}>{p}</button>
                ))}
              </div>
            )}
          </div>
          <div className="dash-portfolio-chart" style={{ flex: 1, padding: '8px 0', minHeight: 160 }}>
            <PortfolioChart data={getChartData()} theme={theme} />
          </div>
          {/* Pending deposit pill — visible whenever there's a deposit settling.
              Persistent across reloads (state lives in localStorage), so the user
              always knows where their money is. */}
          {(() => {
            const inFlight = (pendingDeposits ?? []).filter((d: any) =>
              d.status === 'PENDING_CONFIRM' || d.status === 'CONFIRMED_AWAITING_CREDIT');
            const failed   = (pendingDeposits ?? []).filter((d: any) => d.status === 'FAILED');
            if (inFlight.length === 0 && failed.length === 0) return null;
            return (
              <div style={{ padding: '0 22px 12px' }}>
                {inFlight.map((d: any) => (
                  <PendingDepositPill key={d.id} deposit={d} onClick={onResumeOnboarding} />
                ))}
                {failed.slice(0, 1).map((d: any) => (
                  <FailedDepositPill key={d.id} deposit={d}
                    onClaimTestnetUsdc={onClaimTestnetUsdc}
                    claimingFaucet={claimingFaucet} />
                ))}
              </div>
            );
          })()}
          <div className="dash-action-btns" style={{ padding: '0 22px 18px', display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
            <button onClick={() => (onOpenDeposit ?? onOpenOrderlyOnboarding)?.() } style={{ flex: '1 1 110px', padding: '10px', borderRadius: 11, background: 'var(--pnl-up)', border: 'none', ...S.mono, fontSize: 12, fontWeight: 700, color: '#061108', cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase' as const, transition: 'opacity 0.15s' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.85'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}>Deposit</button>
            <BtnSecondary onClick={() => onOpenWithdraw?.()} style={{ flex: '1 1 110px', padding: '10px' }}>Withdraw</BtnSecondary>
            {/* SEND — peer-to-peer mUSDC by @handle or 0x address. Visible at all
                times because it's a core SocialFi action: pay or tip another user
                without ever leaving the app. */}
            {onOpenSend && (
              <BtnSecondary onClick={() => onOpenSend?.()} style={{ flex: '1 1 110px', padding: '10px' }}>Send</BtnSecondary>
            )}
            {/* BRIDGE — cross-chain mUSDC via LayerZero. Less frequent action,
                lighter visual weight. */}
            {onOpenBridge && (
              <BtnSecondary onClick={() => onOpenBridge?.()} style={{ flex: '1 1 110px', padding: '10px', opacity: 0.85 }}>Bridge</BtnSecondary>
            )}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Performance */}
          <div style={panel}>
            <div style={{ padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <Ico3D bg={iconBg.orange}><Star size={13}/></Ico3D>
                <span style={S.label}>Performance</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ ...S.mono, fontSize: 12, color: 'var(--fg-muted)' }}>Win Rate</span>
                <span style={{ ...S.mono, fontSize: 13, fontWeight: 700, color: 'var(--fg)' }}>{stats.winRate.toFixed(1)}%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ ...S.mono, fontSize: 12, color: 'var(--fg-muted)' }}>Realized PnL</span>
                <span style={{ ...S.mono, fontSize: 13, fontWeight: 700, color: stats.realizedPnl >= 0 ? 'var(--pnl-up)' : 'var(--pnl-down)' }}>${formatMoney(stats.realizedPnl)}</span>
              </div>
            </div>
          </div>

          {/* Active Strategies */}
          <div style={{ ...panel, flex: 1 }}>
            <div style={{ padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <Ico3D bg={iconBg.lime}><Zap size={13}/></Ico3D>
                <span style={S.label}>Copying</span>
              </div>
              {(user.copying?.length ?? 0) === 0 ? (
                <div>
                  <p style={{ ...S.mono, fontSize: 11, color: 'var(--fg-subtle)', marginBottom: 12 }}>You aren't copying any traders yet.</p>
                  <p style={{ ...S.mono, fontSize: 10, color: 'var(--fg-subtle)', opacity: 0.7 }}>Visit the Leaderboard to find a trader to copy.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {(user.copying ?? []).map((traderId: string) => {
                    const trader = traders.find((t: any) => t.id === traderId);
                    return trader ? (
                      <div key={traderId} onClick={() => onViewProfile(trader)}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 9px', borderRadius: 9, background: 'var(--chip-bg)', border: '1px solid var(--hairline)', cursor: 'pointer', transition: 'background 0.1s' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--chip-bg-hover)'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--chip-bg)'}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <img src={trader.avatar} style={{ width: 20, height: 20, borderRadius: '50%', border: '1px solid var(--hairline)', flexShrink: 0 }}/>
                          <span style={{ ...S.mono, fontSize: 11, fontWeight: 700, color: 'var(--fg)' }}>{trader.username}</span>
                        </div>
                        <span style={{ ...S.label, fontSize: 9, background: 'oklch(0.68 0.22 295/0.1)', color: 'var(--iris-violet)', padding: '2px 6px', borderRadius: 5, border: '1px solid oklch(0.68 0.22 295/0.2)' }}>Copying</span>
                      </div>
                    ) : null;
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Signal Stats */}
          <div style={panel}>
            <div style={{ padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <Ico3D bg={iconBg.magenta}><Users size={13}/></Ico3D>
                <span style={S.label}>Signal Stats</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <p style={S.label}>Copiers</p>
                  <p style={{ ...S.display, fontSize: 26, color: 'var(--fg)', marginTop: 3 }}>{user.copierCount || 0}</p>
                </div>
                <div>
                  <p style={S.label}>Fees Earned</p>
                  <p style={{ ...S.display, fontSize: 26, color: 'var(--pnl-up)', marginTop: 3 }}>${formatMoney(user.earnedFees || 0)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Active Positions */}
      <div style={{ ...panel, overflowX: 'auto' }}>
        <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Ico3D bg={iconBg.violet}><Activity size={13}/></Ico3D>
            <span style={{ ...S.display, fontSize: 15, color: 'var(--fg)' }}>All active positions</span>
          </div>
          <span style={{ ...S.mono, fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: positions.length > 0 ? 'oklch(0.68 0.22 295/0.15)' : 'var(--chip-bg)', border: `1px solid ${positions.length > 0 ? 'oklch(0.68 0.22 295/0.3)' : 'var(--hairline-strong)'}`, color: positions.length > 0 ? 'var(--iris-violet)' : 'var(--fg-muted)' }}>{positions.length} Open</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' as const, whiteSpace: 'nowrap' as const }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--hairline)' }}>
                {['Source','Pair','Side','Size','Entry','Mark','TP / SL','PnL',''].map((h,i) => (
                  <th key={h+i} style={{ padding: '8px 14px', textAlign: 'left' as const, ...S.label }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {positions.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: '28px', textAlign: 'center' as const, ...S.mono, fontSize: 12, color: 'var(--fg-subtle)' }}>No active positions running.</td></tr>
              ) : positions.map((p: Position) => {
                const cp = marketPrices[p.pair] || p.entryPrice;
                const pnl = (cp - p.entryPrice) * (p.side === 'LONG' ? 1 : -1) * (p.size / p.entryPrice);
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--hairline)', cursor: 'pointer' }}
                    onClick={() => setDetailsItem({ kind: 'POSITION', item: p })}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--chip-bg)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                    <td style={{ padding: '9px 14px', ...S.mono, fontSize: 11, color: 'var(--fg-muted)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        {p.isCopyTrade ? <Copy size={11} style={{ color: 'var(--iris-cyan)' }}/> : <User size={11}/>}
                        {p.isCopyTrade ? 'Copy' : 'Manual'}
                      </div>
                    </td>
                    <td style={{ padding: '9px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ ...S.display, fontSize: 13, color: 'var(--fg)' }}>{p.pair}</span>
                        <span style={{ ...S.mono, fontSize: 9, color: 'var(--fg-subtle)', padding: '1px 4px', borderRadius: 4, background: 'var(--chip-bg)' }}>{p.leverage}x</span>
                        <span style={{ padding: '1px 5px', borderRadius: 4, fontSize: 8, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' as const, background: p.marginMode === 'CROSS' ? 'oklch(0.68 0.22 295/0.12)' : 'oklch(0.78 0.18 150/0.10)', color: p.marginMode === 'CROSS' ? 'var(--iris-violet)' : 'oklch(0.78 0.18 150)', border: `1px solid ${p.marginMode === 'CROSS' ? 'oklch(0.68 0.22 295/0.25)' : 'oklch(0.78 0.18 150/0.25)'}` }}>
                          {p.marginMode === 'CROSS' ? 'CROSS' : 'ISO'}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '9px 14px', ...S.mono, fontSize: 11, fontWeight: 700, color: p.side === 'LONG' ? 'var(--pnl-up)' : 'var(--pnl-down)' }}>{p.side}</td>
                    <td style={{ padding: '9px 14px', ...S.mono, fontSize: 12, color: 'var(--fg)' }}>${formatMoney(p.size)}</td>
                    <td style={{ padding: '9px 14px', ...S.mono, fontSize: 12, color: 'var(--fg-muted)' }}>${formatPrice(p.entryPrice)}</td>
                    <td style={{ padding: '9px 14px', ...S.mono, fontSize: 12, color: 'var(--fg)' }}>${formatPrice(cp)}</td>
                    <td style={{ padding: '9px 14px', ...S.mono, fontSize: 12, color: 'var(--fg-muted)' }}>
                      {p.takeProfit ? formatPrice(p.takeProfit) : '--'} / {p.stopLoss ? formatPrice(p.stopLoss) : '--'}
                      <button onClick={() => onEditPosition(p)} style={{ marginLeft: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-subtle)', padding: 2, opacity: 0.5 }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '0.5'}><Edit size={10}/></button>
                    </td>
                    <td style={{ padding: '9px 14px', ...S.mono, fontSize: 12, fontWeight: 700, color: pnl >= 0 ? 'var(--pnl-up)' : 'var(--pnl-down)' }}>{pnl >= 0 ? '+' : ''}${formatMoney(pnl)}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'right' as const }}>
                      <button onClick={() => handleClosePosition(p.id)} style={{ padding: '3px 9px', borderRadius: 6, background: 'oklch(0.66 0.22 25/0.1)', border: '1px solid oklch(0.66 0.22 25/0.2)', ...S.mono, fontSize: 10, color: 'var(--pnl-down)', cursor: 'pointer', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' as const }}>Close</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Activity */}
      <div style={{ ...panel, overflowX: 'auto' }}>
        <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', gap: 9 }}>
          <Ico3D bg={iconBg.cyan}><History size={13}/></Ico3D>
          <span style={{ ...S.display, fontSize: 15, color: 'var(--fg)' }}>Recent Activity</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' as const, whiteSpace: 'nowrap' as const }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--hairline)' }}>
                {['Type','Details','Amount / PnL','Time'].map((h,i) => (
                  <th key={h} style={{ padding: '8px 14px', textAlign: i === 3 ? 'right' as const : 'left' as const, ...S.label }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(() => {
                // Build unified activity feed: transactions + ALL trade events (open & close) + pending deposits
                const txRows = (user.transactionHistory ?? []).map((t: any) => ({ ...t, kind: 'TX' }));
                const tradeRows = (user.tradeHistory ?? []).map((t: any) => ({ ...t, kind: 'TRADE' }));
                // Map pending deposits into the same shape
                const pendRows = (pendingDeposits ?? []).map((d: any) => ({
                  kind: 'PENDING_DEPOSIT',
                  id: d.id,
                  amount: d.amount,
                  status: d.status,
                  depositTx: d.depositTx,
                  approveTx: d.approveTx,
                  errorMsg: d.errorMsg,
                  timestamp: d.submittedAt,
                  type: 'DEPOSIT',
                }));
                const feed = [...txRows, ...tradeRows, ...pendRows].sort((a: any, b: any) => b.timestamp - a.timestamp);
                const totalPages = Math.max(1, Math.ceil(feed.length / ACTIVITY_PER_PAGE));
                const safePage = Math.min(activityPage, totalPages);
                const paginated = feed.slice((safePage - 1) * ACTIVITY_PER_PAGE, safePage * ACTIVITY_PER_PAGE);

                if (feed.length === 0) {
                  return (
                    <tr><td colSpan={4} style={{ padding: '28px', textAlign: 'center' as const, ...S.mono, fontSize: 12, color: 'var(--fg-subtle)' }}>No activity yet.</td></tr>
                  );
                }

                return paginated.map((t: any) => {
                  // Determine if this OPEN trade still has an active position (so modal can show live data)
                  const isOpen = t.kind === 'TRADE' && t.action === 'OPEN';
                  const isClose = t.kind === 'TRADE' && t.action === 'CLOSE';
                  const isTx = t.kind === 'TX';
                  const isPending = t.kind === 'PENDING_DEPOSIT';
                  const isDeposit = isTx && t.type === 'DEPOSIT';
                  const isWithdraw = isTx && t.type === 'WITHDRAW';
                  const isSend = isTx && t.type === 'SEND';
                  const isReceive = isTx && t.type === 'RECEIVE';

                  // Pending deposits get their own row treatment — show status,
                  // animated spinner / failure icon, and clickable to see detail modal.
                  if (isPending) {
                    const settling = t.status === 'PENDING_CONFIRM' || t.status === 'CONFIRMED_AWAITING_CREDIT';
                    const credited = t.status === 'CREDITED';
                    const failed   = t.status === 'FAILED';
                    const statusLabel = credited ? 'Credited'
                                       : failed   ? 'Failed'
                                       : t.status === 'CONFIRMED_AWAITING_CREDIT' ? 'Settling'
                                       : 'Pending';
                    const statusColor = credited ? 'var(--pnl-up)'
                                       : failed   ? 'var(--pnl-down)'
                                       : 'var(--iris-violet)';
                    return (
                      <tr key={`pending-${t.id}`}
                        style={{ borderBottom: '1px solid var(--hairline)', cursor: 'pointer', transition: 'background 0.1s' }}
                        onClick={() => setPendingDepositDetail(t)}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--chip-bg)'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                        <td style={{ padding: '11px 14px', ...S.mono, fontSize: 11.5, color: statusColor, fontWeight: 700, letterSpacing: '0.04em' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            {settling && <Loader2 size={11} style={{ animation: 'velo-pill-spin 1.2s linear infinite' }} />}
                            {credited && <CheckCircle2 size={11} />}
                            {failed && <AlertCircle size={11} />}
                            DEPOSIT
                          </span>
                        </td>
                        <td style={{ padding: '11px 14px', ...S.sans, fontSize: 12, color: 'var(--fg-muted)' }}>
                          {statusLabel} · USDC → Velo Trading Wallet
                          {t.depositTx && (
                            <a href={`https://sepolia.basescan.org/tx/${t.depositTx}`} target="_blank" rel="noreferrer noopener"
                               onClick={e => e.stopPropagation()}
                               style={{ marginLeft: 8, color: 'var(--fg-subtle)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5 }}
                               onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--iris-violet)'}
                               onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--fg-subtle)'}>
                              tx <ExternalLink size={10} />
                            </a>
                          )}
                        </td>
                        <td style={{ padding: '11px 14px', ...S.mono, fontSize: 12, fontWeight: 700, color: credited ? 'var(--pnl-up)' : 'var(--fg-muted)' }}>
                          +${formatMoney(t.amount ?? 0)}
                        </td>
                        <td style={{ padding: '11px 14px', textAlign: 'right' as const, ...S.mono, fontSize: 11, color: 'var(--fg-subtle)' }}>
                          {(() => {
                            const sec = Math.floor((Date.now() - t.timestamp) / 1000);
                            if (sec < 60) return `${sec}s ago`;
                            if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
                            return `${Math.floor(sec / 3600)}h ago`;
                          })()}
                        </td>
                      </tr>
                    );
                  }

                  // Color logic
                  let typeColor = 'var(--fg-muted)';
                  if (isDeposit) typeColor = 'var(--pnl-up)';
                  else if (isReceive) typeColor = 'var(--pnl-up)';
                  else if (isWithdraw) typeColor = 'var(--iris-amber)';
                  else if (isSend) typeColor = 'var(--iris-amber)';
                  else if (isOpen) typeColor = 'var(--iris-violet)';
                  else if (isClose) typeColor = t.pnl >= 0 ? 'var(--pnl-up)' : 'var(--pnl-down)';

                  // Amount display
                  let amountStr = '—';
                  let amountColor = 'var(--fg-muted)';
                  if (isTx) {
                    const positive = isDeposit || isReceive;
                    const sign = positive ? '+' : '-';
                    amountStr = `${sign}$${formatMoney(t.amount ?? 0)}`;
                    amountColor = positive ? 'var(--pnl-up)' : 'var(--pnl-down)';
                  } else if (isClose) {
                    amountStr = `${t.pnl >= 0 ? '+' : ''}$${formatMoney(t.pnl)}`;
                    amountColor = t.pnl >= 0 ? 'var(--pnl-up)' : 'var(--pnl-down)';
                  } else if (isOpen) {
                    const margin = t.leverage > 0 ? t.size / t.leverage : t.size;
                    amountStr = `$${formatMoney(margin)} margin`;
                    amountColor = 'var(--fg-subtle)';
                  }

                  // Details text
                  let details = '—';
                  if (isOpen) details = `Open ${t.pair} ${t.side} · ${t.leverage ? `${t.leverage}×` : '—'}`;
                  else if (isClose) details = `Close ${t.pair} ${t.side} · ${t.leverage ? `${t.leverage}×` : '—'}`;
                  else if (isSend) details = `Sent to ${t.counterparty || 'wallet'}`;
                  else if (isReceive) details = `Received from ${t.counterparty || 'wallet'}`;
                  else if (isWithdraw) details = `Withdraw to wallet`;
                  else if (isDeposit) details = `Deposit`;

                  // Click handler
                  const handleClick = () => {
                    if (isClose) setDetailsItem({ kind: 'HISTORY', item: t });
                    else if (isOpen) {
                      // Only open the live position modal if positionId matches exactly,
                      // or fall back to timestamp proximity (for legacy entries without positionId).
                      // Never show a different position just because it shares pair/side.
                      let livePos: any = undefined;
                      if (t.positionId) {
                        livePos = positions.find((p: any) => p.id === t.positionId);
                      } else {
                        // Legacy: match by pair/side AND timestamp closeness (within 5 seconds)
                        livePos = positions.find((p: any) =>
                          p.pair === t.pair &&
                          p.side === t.side &&
                          Math.abs(p.timestamp - t.timestamp) < 5000
                        );
                      }
                      if (livePos) setDetailsItem({ kind: 'POSITION', item: livePos });
                      // If no matching live position, this OPEN entry belongs to an already-closed
                      // trade cycle — do nothing (the row is still informational).
                    } else if (isTx) {
                      setDetailsItem({ kind: 'TRANSACTION', item: t } as any);
                    }
                  };

                  // Determine if this row is clickable
                  const hasLivePos = isOpen && (
                    t.positionId
                      ? positions.some((p: any) => p.id === t.positionId)
                      : positions.some((p: any) => p.pair === t.pair && p.side === t.side && Math.abs(p.timestamp - t.timestamp) < 5000)
                  );
                  const isClickable = isClose || isTx || hasLivePos;

                  return (
                    <tr key={t.id}
                      style={{ borderBottom: '1px solid var(--hairline)', cursor: isClickable ? 'pointer' : 'default', transition: 'background 0.1s' }}
                      onClick={handleClick}
                      onMouseEnter={e => { if (isClickable) (e.currentTarget as HTMLElement).style.background = 'var(--chip-bg)'; }}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                      <td style={{ padding: '9px 14px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, ...S.mono, fontSize: 11, fontWeight: 700, color: typeColor }}>
                          {isDeposit && <ArrowDownCircle size={11}/>}
                          {isWithdraw && <ArrowUpCircle size={11}/>}
                          {isOpen && <TrendingUp size={11}/>}
                          {isClose && <History size={11}/>}
                          {isTx ? t.type : (isOpen ? 'OPEN' : 'CLOSE')}
                          {t.onChain && <span title="On-chain" style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3, background: 'oklch(0.68 0.22 295/0.15)', color: 'var(--iris-violet)', border: '1px solid oklch(0.68 0.22 295/0.25)', fontWeight: 700, letterSpacing: '0.04em' }}>⛓</span>}
                        </span>
                      </td>
                      <td style={{ padding: '9px 14px', ...S.mono, fontSize: 11, color: 'var(--fg-muted)' }}>
                        {details}
                        {t.onChain && t.txHash && (() => {
                          const isFaucet = String(t.txHash).startsWith('faucet:');
                          // Faucet — link to BaseScan address page for the burner.
                          // Real deposit/withdraw — link to BaseScan tx page.
                          // Both work; both are real verifiable on-chain pages.
                          const href = isFaucet
                            ? `https://sepolia.basescan.org/address/${String(t.txHash).slice('faucet:'.length)}`
                            : `https://sepolia.basescan.org/tx/${t.txHash}`;
                          return (
                            <a href={href} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ marginLeft: 6, fontSize: 9, color: 'var(--iris-violet)', textDecoration: 'none', verticalAlign: 'middle' }}>↗ BaseScan</a>
                          );
                        })()}
                      </td>
                      <td style={{ padding: '9px 14px', ...S.mono, fontSize: 12, fontWeight: 700, color: amountColor }}>{amountStr}</td>
                      <td style={{ padding: '9px 14px', textAlign: 'right' as const, ...S.mono, fontSize: 11, color: 'var(--fg-subtle)' }}>
                        {new Date(t.timestamp).toLocaleDateString()} {new Date(t.timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
        {/* Pagination footer */}
        {(() => {
          const txRows2 = (user.transactionHistory ?? []).map((t: any) => ({ ...t, kind: 'TX' }));
          const tradeRows2 = (user.tradeHistory ?? []).map((t: any) => ({ ...t, kind: 'TRADE' }));
          const totalItems = txRows2.length + tradeRows2.length;
          const totalPages = Math.max(1, Math.ceil(totalItems / ACTIVITY_PER_PAGE));
          if (totalPages <= 1) return null;
          const safePage = Math.min(activityPage, totalPages);
          const pageNums = (() => {
            if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
            if (safePage <= 3) return [1, 2, 3, 4, 5];
            if (safePage >= totalPages - 2) return [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
            return [safePage - 2, safePage - 1, safePage, safePage + 1, safePage + 2];
          })();
          const btnBase: React.CSSProperties = { padding: '4px 10px', borderRadius: 7, border: '1px solid var(--hairline)', background: 'var(--chip-bg)', ...S.mono, fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all 0.1s' };
          return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px', borderTop: '1px solid var(--hairline)' }}>
              <span style={{ ...S.mono, fontSize: 11, color: 'var(--fg-subtle)' }}>
                Page {safePage} of {totalPages} · {totalItems} events
              </span>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <button disabled={safePage <= 1} onClick={() => setActivityPage(p => Math.max(1, p - 1))}
                  style={{ ...btnBase, color: safePage <= 1 ? 'var(--fg-subtle)' : 'var(--fg)', opacity: safePage <= 1 ? 0.4 : 1, cursor: safePage <= 1 ? 'default' : 'pointer' }}>← Prev</button>
                {pageNums.map(page => (
                  <button key={page} onClick={() => setActivityPage(page)}
                    style={{ width: 30, height: 28, borderRadius: 7, border: 'none', background: page === safePage ? 'var(--fg)' : 'transparent', ...S.mono, fontSize: 11, fontWeight: 700, color: page === safePage ? 'var(--bg-base)' : 'var(--fg-muted)', cursor: 'pointer', transition: 'all 0.1s' }}>
                    {page}
                  </button>
                ))}
                <button disabled={safePage >= totalPages} onClick={() => setActivityPage(p => Math.min(totalPages, p + 1))}
                  style={{ ...btnBase, color: safePage >= totalPages ? 'var(--fg-subtle)' : 'var(--fg)', opacity: safePage >= totalPages ? 0.4 : 1, cursor: safePage >= totalPages ? 'default' : 'pointer' }}>Next →</button>
              </div>
            </div>
          );
        })()}
      </div>

      <style>{`
        .dash-grid-main {
          display: grid;
          grid-template-columns: 1fr clamp(300px, 22vw, 360px);
          gap: 12px;
        }
        @media (max-width: 900px) {
          .dash-grid-main {
            grid-template-columns: 1fr;
          }
        }
        @keyframes velo-pill-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

// ─── Pending Deposit Pills ───────────────────────────────────────────────────
// Shows whenever a deposit is mid-settlement. Click to reopen onboarding.

const PendingDepositPill: React.FC<{ deposit: any; onClick?: () => void }> = ({ deposit, onClick }) => {
  const elapsed = Math.max(0, Math.floor((Date.now() - deposit.submittedAt) / 1000));
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  const elapsedStr = m > 0 ? `${m}m ${s}s` : `${s}s`;
  const isConfirmed = deposit.status === 'CONFIRMED_AWAITING_CREDIT';
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', marginBottom: 8, borderRadius: 11,
        background: 'oklch(0.78 0.18 295 / 0.08)',
        border: '1px solid oklch(0.78 0.18 295 / 0.28)',
        color: 'var(--fg)', cursor: onClick ? 'pointer' : 'default',
        textAlign: 'left' as const,
        fontFamily: 'var(--font-mono)', fontSize: 11.5,
        transition: 'background 140ms',
      }}
      onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLElement).style.background = 'oklch(0.78 0.18 295 / 0.14)'; }}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'oklch(0.78 0.18 295 / 0.08)'}
    >
      <Loader2 size={13} style={{ animation: 'velo-pill-spin 1.2s linear infinite', color: 'oklch(0.78 0.18 295)', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, color: 'var(--fg)', fontSize: 12 }}>
          ${deposit.amount.toFixed(2)} USDC settling
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--fg-muted)', letterSpacing: '0.02em', marginTop: 2 }}>
          {isConfirmed ? 'Confirmed on-chain · awaiting credit' : 'Waiting for confirmation'} · {elapsedStr}
        </div>
      </div>
      {deposit.depositTx && (
        <a
          href={`https://sepolia.basescan.org/tx/${deposit.depositTx}`}
          target="_blank" rel="noreferrer noopener"
          onClick={e => e.stopPropagation()}
          aria-label="View on BaseScan"
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '5px 8px', borderRadius: 7,
            background: 'oklch(1 0 0 / 0.05)',
            color: 'var(--fg-muted)', textDecoration: 'none',
            fontSize: 10, fontWeight: 600,
          }}
        >
          TX <ExternalLink size={10} />
        </a>
      )}
    </button>
  );
};

const FailedDepositPill: React.FC<{ deposit: any; onClaimTestnetUsdc?: () => void; claimingFaucet?: boolean }> = ({ deposit, onClaimTestnetUsdc, claimingFaucet }) => (
  <div style={{
    width: '100%',
    padding: '12px 14px', marginBottom: 8, borderRadius: 11,
    background: 'oklch(0.66 0.22 25 / 0.08)',
    border: '1px solid oklch(0.66 0.22 25 / 0.28)',
    fontFamily: 'var(--font-mono)', fontSize: 11.5,
  }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <AlertCircle size={13} style={{ color: 'oklch(0.78 0.20 25)', flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, color: 'var(--fg)', fontSize: 12 }}>
          ${deposit.amount.toFixed(2)} USDC — credit didn't arrive
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--fg-muted)', letterSpacing: '0.02em', marginTop: 2, lineHeight: 1.5 }}>
          Cross-chain settlement timed out. Funds may still arrive — or use the testnet faucet to fund your trading account directly.
        </div>
      </div>
      {deposit.depositTx && (
        <a
          href={`https://sepolia.basescan.org/tx/${deposit.depositTx}`}
          target="_blank" rel="noreferrer noopener"
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '5px 8px', borderRadius: 7, flexShrink: 0,
            background: 'oklch(1 0 0 / 0.05)',
            color: 'var(--fg-muted)', textDecoration: 'none',
            fontSize: 10, fontWeight: 600,
          }}
        >
          TX <ExternalLink size={10} />
        </a>
      )}
    </div>
    {onClaimTestnetUsdc && (
      <button
        onClick={onClaimTestnetUsdc}
        disabled={claimingFaucet}
        style={{
          width: '100%', marginTop: 10,
          padding: '9px 12px', borderRadius: 9,
          background: claimingFaucet ? 'oklch(0.78 0.18 295 / 0.25)' : 'linear-gradient(180deg, oklch(0.82 0.18 295), oklch(0.72 0.20 295))',
          color: '#fff', border: 'none',
          cursor: claimingFaucet ? 'wait' : 'pointer',
          fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          textTransform: 'uppercase' as const,
          boxShadow: claimingFaucet ? 'none' : '0 4px 14px oklch(0.72 0.20 295 / 0.35)',
        }}
      >
        {claimingFaucet
          ? <><Loader2 size={12} style={{ animation: 'velo-pill-spin 1s linear infinite' }} /> Claiming…</>
          : <>⚡ Claim 1,000 USDC instantly (testnet)</>}
      </button>
    )}
  </div>
);
