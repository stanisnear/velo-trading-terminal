// VeloManagePositionModal.tsx
//
// Single modal that lets the user manage an open position with all the V2
// contract functions. Four tabs:
//
//   • Add margin       → useVeloPerpsTrading.addMargin
//   • Reduce margin    → useVeloPerpsTrading.reduceMargin
//   • Partial close    → useVeloPerpsTrading.partialClose
//   • TP / SL          → useVeloPerpsTrading.setTriggers
//
// Each tab signs silently with the trading wallet (no MetaMask popup) and
// shows the BaseScan link on success. The modal pulls the position's current
// state every render so the user sees fresh collateral / effective leverage
// numbers as the operation completes.
import React, { useEffect, useState } from 'react';
import {
  ArrowUpFromLine, ArrowDownToLine, Scissors, Target, CheckCircle2,
  ExternalLink, Loader2, X, AlertCircle, TrendingUp, TrendingDown,
} from 'lucide-react';
import { IS_V2, baseScanTxUrl } from '@/services/veloPerpsService';
import type { Position } from '@/utils/types';

const S = {
  display: { fontFamily: 'var(--font-display)', fontStyle: 'italic' as const, letterSpacing: '-0.02em' },
  mono:    { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1', fontVariantNumeric: 'tabular-nums' as const },
  sans:    { fontFamily: 'var(--font-sans)' },
  label:   { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700 as const, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)' },
};

type Tab = 'ADD' | 'REDUCE' | 'PARTIAL' | 'TRIGGERS';

interface Actions {
  addMargin:    (tradeId: bigint, amountUSDC: number) => Promise<{ txHash: `0x${string}`; explorerUrl: string }>;
  reduceMargin: (tradeId: bigint, amountUSDC: number, pair: string) => Promise<{ txHash: `0x${string}`; explorerUrl: string }>;
  partialClose: (tradeId: bigint, fractionBps: number, pair: string) => Promise<{ txHash: `0x${string}`; explorerUrl: string }>;
  setTriggers:  (tradeId: bigint, takeProfit: number, stopLoss: number) => Promise<{ txHash: `0x${string}`; explorerUrl: string }>;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  position: Position | null;
  currentPrice: number;
  actions: Actions;
  initialTab?: Tab;
}

export const VeloManagePositionModal: React.FC<Props> = ({ isOpen, onClose, position, currentPrice, actions, initialTab }) => {
  const [tab, setTab] = useState<Tab>(initialTab || 'ADD');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastTx, setLastTx] = useState<`0x${string}` | null>(null);

  // Inputs (reset when modal opens)
  const [addAmount, setAddAmount] = useState('');
  const [reduceAmount, setReduceAmount] = useState('');
  const [closePct, setClosePct] = useState(100);
  const [tp, setTp] = useState('');
  const [sl, setSl] = useState('');
  // Partial close % for TP and SL triggers (what % of position to close when triggered)
  const [tpClosePct, setTpClosePct] = useState(100);
  const [slClosePct, setSlClosePct] = useState(100);

  useEffect(() => {
    if (isOpen) {
      setTab(initialTab || 'ADD'); setBusy(false); setError(''); setLastTx(null);
      setAddAmount(''); setReduceAmount(''); setClosePct(100);
      setTpClosePct(100); setSlClosePct(100);
      // Pre-fill TP/SL fields with the position's current triggers if any
      if (position) {
        setTp(position.takeProfit && position.takeProfit > 0 ? String(position.takeProfit) : '');
        setSl(position.stopLoss   && position.stopLoss   > 0 ? String(position.stopLoss)   : '');
      }
    }
  }, [isOpen, position, initialTab]);

  if (!isOpen || !position) return null;

  const collateral = position.size / position.leverage;
  const pnl = (currentPrice - position.entryPrice) * (position.side === 'LONG' ? 1 : -1) * (position.size / position.entryPrice);
  const pnlPct = (pnl / collateral) * 100;
  const tradeId = position.onChainTradeId ? BigInt(position.onChainTradeId) : 0n;

  // V1 positions can't use these actions
  const isV1Position = !position.onChain || tradeId === 0n;
  const v2Available = IS_V2 && !isV1Position;

  const handle = async (kind: Tab) => {
    setBusy(true); setError(''); setLastTx(null);
    try {
      let res: { txHash: `0x${string}` };
      if (kind === 'ADD') {
        const amt = parseFloat(addAmount);
        if (!(amt > 0)) throw new Error('Enter amount');
        res = await actions.addMargin(tradeId, amt);
      } else if (kind === 'REDUCE') {
        const amt = parseFloat(reduceAmount);
        if (!(amt > 0)) throw new Error('Enter amount');
        if (amt >= collateral) throw new Error('Cannot withdraw all collateral — use Close instead');
        res = await actions.reduceMargin(tradeId, amt, position.pair);
      } else if (kind === 'PARTIAL') {
        if (closePct <= 0 || closePct > 100) throw new Error('Invalid percentage');
        res = await actions.partialClose(tradeId, Math.round(closePct * 100), position.pair);
      } else {
        const tpNum = parseFloat(tp) || 0;
        const slNum = parseFloat(sl) || 0;
        // Direction check (the contract also enforces this)
        if (position.side === 'LONG') {
          if (tpNum && tpNum <= position.entryPrice) throw new Error('TP must be above entry on a long');
          if (slNum && slNum >= position.entryPrice) throw new Error('SL must be below entry on a long');
        } else {
          if (tpNum && tpNum >= position.entryPrice) throw new Error('TP must be below entry on a short');
          if (slNum && slNum <= position.entryPrice) throw new Error('SL must be above entry on a short');
        }
        res = await actions.setTriggers(tradeId, tpNum, slNum);
      }
      setLastTx(res.txHash);
    } catch (e: any) {
      setError(e?.shortMessage || e?.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 65,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)',
      }}>
      <div style={{
        width: '100%', maxWidth: 460, borderRadius: 20,
        background: 'var(--glass-bg-strong)', border: '1px solid var(--glass-border)',
        boxShadow: 'var(--glass-shadow)', backdropFilter: 'blur(32px)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--hairline)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ ...S.display, fontSize: 20, color: 'var(--fg)' }}>{position.pair}</span>
            <span style={{ ...S.mono, fontSize: 10, fontWeight: 700, color: position.side === 'LONG' ? 'var(--pnl-up)' : 'var(--pnl-down)', letterSpacing: '0.1em' }}>
              {position.side} · {position.leverage}×
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--fg-muted)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Snapshot strip */}
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--hairline)', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <Cell label="Entry" value={`$${position.entryPrice.toLocaleString('en-US', { maximumFractionDigits: 4 })}`} />
          <Cell label="Mark" value={`$${currentPrice.toLocaleString('en-US', { maximumFractionDigits: 4 })}`} />
          <Cell label="PnL" value={`${pnl >= 0 ? '+' : ''}$${Math.abs(pnl).toFixed(2)}`} accent={pnl >= 0 ? 'up' : 'down'} sub={`${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`} />
          <Cell label="Collateral" value={`$${collateral.toFixed(2)}`} />
          <Cell label="Size" value={`$${position.size.toFixed(2)}`} />
          <Cell label="Status" value={isV1Position ? 'V1' : 'V2'} accent={isV1Position ? 'down' : 'up'} />
        </div>

        {isV1Position && (
          <div style={{ padding: 16, background: 'rgba(255,200,50,0.08)', borderBottom: '1px solid rgba(255,200,50,0.2)' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <AlertCircle size={14} style={{ color: 'oklch(0.85 0.15 80)', flexShrink: 0, marginTop: 2 }} />
              <div style={{ ...S.sans, fontSize: 12, color: 'var(--fg)', lineHeight: 1.4 }}>
                This is a V1 position. Add margin, partial close, and on-chain triggers are V2-only.
                You can close this position normally, or open a new one which will land on V2.
              </div>
            </div>
          </div>
        )}

        {!v2Available && !isV1Position && (
          <div style={{ padding: 16, background: 'rgba(255,200,50,0.08)', borderBottom: '1px solid rgba(255,200,50,0.2)' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <AlertCircle size={14} style={{ color: 'oklch(0.85 0.15 80)', flexShrink: 0, marginTop: 2 }} />
              <div style={{ ...S.sans, fontSize: 12, color: 'var(--fg)', lineHeight: 1.4 }}>
                VeloPerps V2 isn't deployed yet. Owner needs to deploy <code style={{ ...S.mono, fontSize: 11 }}>VeloPerpsV2.sol</code> and set <code style={{ ...S.mono, fontSize: 11 }}>VITE_VELO_PERPS_V2_ADDRESS</code>.
              </div>
            </div>
          </div>
        )}

        {/* Tab bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: '1px solid var(--hairline)' }}>
          <TabBtn icon={<ArrowUpFromLine size={11} />} label="Add" active={tab === 'ADD'} onClick={() => setTab('ADD')} disabled={!v2Available} />
          <TabBtn icon={<ArrowDownToLine size={11} />} label="Reduce" active={tab === 'REDUCE'} onClick={() => setTab('REDUCE')} disabled={!v2Available} />
          <TabBtn icon={<Scissors size={11} />} label="Close %" active={tab === 'PARTIAL'} onClick={() => setTab('PARTIAL')} disabled={!v2Available} />
          <TabBtn icon={<Target size={11} />} label="TP/SL" active={tab === 'TRIGGERS'} onClick={() => setTab('TRIGGERS')} disabled={!v2Available} />
        </div>

        {/* Body */}
        <div style={{ padding: 18 }}>
          {lastTx && (
            <div style={{ padding: 12, borderRadius: 10, background: 'oklch(0.78 0.18 150 / 0.08)', border: '1px solid oklch(0.78 0.18 150 / 0.25)', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ ...S.mono, fontSize: 11, color: 'var(--fg)' }}>
                <CheckCircle2 size={11} style={{ color: 'var(--pnl-up)', display: 'inline', marginRight: 6, verticalAlign: -1 }} />
                Done
              </span>
              <a href={baseScanTxUrl(lastTx)} target="_blank" rel="noopener noreferrer"
                style={{ ...S.mono, fontSize: 10, color: 'var(--iris-violet)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                BaseScan <ExternalLink size={10} />
              </a>
            </div>
          )}
          {error && (
            <div style={{ padding: 10, borderRadius: 8, marginBottom: 12, background: 'rgba(255,80,80,0.06)', border: '1px solid rgba(255,80,80,0.2)', ...S.mono, fontSize: 11, color: 'var(--pnl-down)' }}>
              {error}
            </div>
          )}

          {tab === 'ADD' && (
            <>
              <p style={{ ...S.sans, fontSize: 12, color: 'var(--fg-muted)', margin: '0 0 12px' }}>
                Adding collateral lowers your liquidation risk and effective leverage. Your position size stays the same.
              </p>
              <Field label="Amount (mUSDC)" value={addAmount} onChange={setAddAmount} disabled={!v2Available} placeholder="0.00" />
              <Submit busy={busy} disabled={!v2Available || !(parseFloat(addAmount) > 0)} onClick={() => handle('ADD')} icon={<ArrowUpFromLine size={12} />} label={`Add $${(parseFloat(addAmount) || 0).toFixed(2)}`} />
            </>
          )}
          {tab === 'REDUCE' && (
            <>
              <p style={{ ...S.sans, fontSize: 12, color: 'var(--fg-muted)', margin: '0 0 12px' }}>
                Removing collateral raises your effective leverage and liquidation risk. The contract rejects if effective leverage would exceed 25× or if you'd be liquidated at the current mark.
              </p>
              <Field label={`Amount (max $${collateral.toFixed(2)})`} value={reduceAmount} onChange={setReduceAmount} disabled={!v2Available} placeholder="0.00" />
              <Submit busy={busy} disabled={!v2Available || !(parseFloat(reduceAmount) > 0)} onClick={() => handle('REDUCE')} icon={<ArrowDownToLine size={12} />} label={`Withdraw $${(parseFloat(reduceAmount) || 0).toFixed(2)}`} />
            </>
          )}
          {tab === 'PARTIAL' && (
            <>
              <p style={{ ...S.sans, fontSize: 12, color: 'var(--fg-muted)', margin: '0 0 12px' }}>
                Close part of your position now and let the rest run. PnL on the closed portion is realised immediately.
              </p>
              <div style={{ ...S.label, marginBottom: 6 }}>Close {closePct}% · ${((position.size * closePct) / 100).toFixed(2)} notional</div>
              <input type="range" min="1" max="100" value={closePct} disabled={!v2Available}
                onChange={(e) => setClosePct(parseInt(e.target.value))}
                style={{ width: '100%', accentColor: 'oklch(0.68 0.22 295)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', ...S.mono, fontSize: 10, color: 'var(--fg-subtle)', marginTop: 2 }}>
                <span>1%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' as const }}>
                {[10, 20, 25, 50, 75, 100].map((p) => (
                  <button key={p} onClick={() => setClosePct(p)} disabled={!v2Available} style={{
                    ...S.mono, flex: '1 1 60px', padding: '6px 0', borderRadius: 6,
                    background: closePct === p ? 'oklch(0.68 0.22 295 / 0.18)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${closePct === p ? 'oklch(0.68 0.22 295 / 0.4)' : 'var(--hairline)'}`,
                    color: closePct === p ? 'var(--iris-violet)' : 'var(--fg-muted)',
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', cursor: v2Available ? 'pointer' : 'not-allowed',
                  }}>{p}%</button>
                ))}
              </div>
              {/* Estimated PnL preview */}
              {(() => {
                const fracPnl = pnl * closePct / 100;
                return (
                  <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--hairline)', display: 'flex', justifyContent: 'space-between', ...S.mono, fontSize: 11 }}>
                    <span style={{ color: 'var(--fg-subtle)' }}>Est. PnL on close</span>
                    <span style={{ fontWeight: 700, color: fracPnl >= 0 ? 'var(--pnl-up)' : 'var(--pnl-down)' }}>
                      {fracPnl >= 0 ? '+' : ''}${Math.abs(fracPnl).toFixed(2)}
                    </span>
                  </div>
                );
              })()}
              <Submit busy={busy} disabled={!v2Available} onClick={() => handle('PARTIAL')} icon={<Scissors size={12} />} label={closePct === 100 ? 'Close full position' : `Close ${closePct}% of position`} color={closePct === 100 ? 'red' : undefined} />
            </>
          )}
          {tab === 'TRIGGERS' && (
            <>
              <p style={{ ...S.sans, fontSize: 12, color: 'var(--fg-muted)', margin: '0 0 12px' }}>
                On-chain take profit and stop loss. The keeper closes your position when the mark crosses either trigger. Use 0 to clear.
              </p>

              {/* ── Take Profit ── */}
              <Field
                label={`Take Profit (${position.side === 'LONG' ? 'above' : 'below'} $${position.entryPrice.toFixed(2)})`}
                value={tp} onChange={setTp} disabled={!v2Available} placeholder="0 = no TP"
                icon={<TrendingUp size={11} style={{ color: 'var(--pnl-up)' }} />}
              />
              {/* Quick-pick TP at +X% PnL on collateral */}
              <div style={{ ...S.label, marginBottom: 5, marginTop: -4 }}>QUICK · % PnL on collateral</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' as const }}>
                {[25, 50, 100, 200, 500].map((pct) => (
                  <button key={pct} onClick={() => {
                    const sign = position.side === 'LONG' ? 1 : -1;
                    const markDelta = (pct / 100 / position.leverage) * position.entryPrice * sign;
                    const tpPrice = position.entryPrice + markDelta;
                    setTp(tpPrice.toFixed(4));
                  }} disabled={!v2Available} style={{
                    ...S.mono, padding: '5px 10px', borderRadius: 6,
                    background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
                    color: 'var(--pnl-up)', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                    cursor: v2Available ? 'pointer' : 'not-allowed', opacity: v2Available ? 1 : 0.5,
                  }}>+{pct}%</button>
                ))}
              </div>
              {/* TP: partial close % */}
              {tp && parseFloat(tp) > 0 && (
                <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 8, background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.2)' }}>
                  <div style={{ ...S.label, marginBottom: 6, color: 'var(--pnl-up)' }}>CLOSE {tpClosePct}% at TP</div>
                  <input type="range" min="1" max="100" value={tpClosePct} disabled={!v2Available}
                    onChange={(e) => setTpClosePct(parseInt(e.target.value))}
                    style={{ width: '100%', accentColor: 'rgba(34,197,94,0.9)' }} />
                  <div style={{ display: 'flex', gap: 5, marginTop: 7, flexWrap: 'wrap' as const }}>
                    {[25, 50, 75, 100].map((p) => (
                      <button key={p} onClick={() => setTpClosePct(p)} disabled={!v2Available} style={{
                        ...S.mono, flex: '1 1 40px', padding: '4px 0', borderRadius: 5,
                        background: tpClosePct === p ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${tpClosePct === p ? 'rgba(34,197,94,0.5)' : 'var(--hairline)'}`,
                        color: tpClosePct === p ? 'var(--pnl-up)' : 'var(--fg-muted)',
                        fontSize: 9, fontWeight: 700, cursor: v2Available ? 'pointer' : 'not-allowed',
                      }}>{p}%</button>
                    ))}
                  </div>
                  {tpClosePct < 100 && (
                    <div style={{ ...S.mono, fontSize: 10, color: 'var(--fg-subtle)', marginTop: 5 }}>
                      Closes {tpClosePct}% — remaining {100 - tpClosePct}% position stays open
                    </div>
                  )}
                </div>
              )}

              {/* ── Stop Loss ── */}
              <Field
                label={`Stop Loss (${position.side === 'LONG' ? 'below' : 'above'} $${position.entryPrice.toFixed(2)})`}
                value={sl} onChange={setSl} disabled={!v2Available} placeholder="0 = no SL"
                icon={<TrendingDown size={11} style={{ color: 'var(--pnl-down)' }} />}
              />
              <div style={{ ...S.label, marginBottom: 5, marginTop: -4 }}>QUICK · % loss on collateral</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' as const }}>
                {[10, 25, 50, 75, 90].map((pct) => (
                  <button key={pct} onClick={() => {
                    const sign = position.side === 'LONG' ? 1 : -1;
                    const markDelta = (pct / 100 / position.leverage) * position.entryPrice * sign;
                    const slPrice = position.entryPrice - markDelta;
                    setSl(slPrice.toFixed(4));
                  }} disabled={!v2Available} style={{
                    ...S.mono, padding: '5px 10px', borderRadius: 6,
                    background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.25)',
                    color: 'var(--pnl-down)', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                    cursor: v2Available ? 'pointer' : 'not-allowed', opacity: v2Available ? 1 : 0.5,
                  }}>-{pct}%</button>
                ))}
              </div>
              {/* SL: partial close % */}
              {sl && parseFloat(sl) > 0 && (
                <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 8, background: 'rgba(255,80,80,0.05)', border: '1px solid rgba(255,80,80,0.2)' }}>
                  <div style={{ ...S.label, marginBottom: 6, color: 'var(--pnl-down)' }}>CLOSE {slClosePct}% at SL</div>
                  <input type="range" min="1" max="100" value={slClosePct} disabled={!v2Available}
                    onChange={(e) => setSlClosePct(parseInt(e.target.value))}
                    style={{ width: '100%', accentColor: 'rgba(255,80,80,0.9)' }} />
                  <div style={{ display: 'flex', gap: 5, marginTop: 7, flexWrap: 'wrap' as const }}>
                    {[25, 50, 75, 100].map((p) => (
                      <button key={p} onClick={() => setSlClosePct(p)} disabled={!v2Available} style={{
                        ...S.mono, flex: '1 1 40px', padding: '4px 0', borderRadius: 5,
                        background: slClosePct === p ? 'rgba(255,80,80,0.15)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${slClosePct === p ? 'rgba(255,80,80,0.5)' : 'var(--hairline)'}`,
                        color: slClosePct === p ? 'var(--pnl-down)' : 'var(--fg-muted)',
                        fontSize: 9, fontWeight: 700, cursor: v2Available ? 'pointer' : 'not-allowed',
                      }}>{p}%</button>
                    ))}
                  </div>
                  {slClosePct < 100 && (
                    <div style={{ ...S.mono, fontSize: 10, color: 'var(--fg-subtle)', marginTop: 5 }}>
                      Closes {slClosePct}% — remaining {100 - slClosePct}% position stays open
                    </div>
                  )}
                </div>
              )}

              {/* Summary of active triggers */}
              {(position.takeProfit || position.stopLoss) && (
                <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: 'rgba(180,110,255,0.06)', border: '1px solid rgba(180,110,255,0.2)' }}>
                  <div style={{ ...S.label, marginBottom: 4 }}>ACTIVE ON-CHAIN TRIGGERS</div>
                  <div style={{ display: 'flex', gap: 12, ...S.mono, fontSize: 11 }}>
                    {position.takeProfit && position.takeProfit > 0 && (
                      <span style={{ color: 'var(--pnl-up)' }}>TP ${position.takeProfit.toLocaleString('en-US', { maximumFractionDigits: 4 })}</span>
                    )}
                    {position.stopLoss && position.stopLoss > 0 && (
                      <span style={{ color: 'var(--pnl-down)' }}>SL ${position.stopLoss.toLocaleString('en-US', { maximumFractionDigits: 4 })}</span>
                    )}
                  </div>
                </div>
              )}

              <Submit busy={busy} disabled={!v2Available} onClick={() => handle('TRIGGERS')} icon={<Target size={12} />} label="Save triggers" />
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Helpers ─────────────────────────────────────────────────────────────

const Cell: React.FC<{ label: string; value: string; sub?: string; accent?: 'up' | 'down' }> = ({ label, value, sub, accent }) => (
  <div>
    <div style={S.label}>{label}</div>
    <div style={{ ...S.mono, fontSize: 13, fontWeight: 700, color: accent === 'up' ? 'var(--pnl-up)' : accent === 'down' ? 'var(--pnl-down)' : 'var(--fg)', marginTop: 2 }}>
      {value}
    </div>
    {sub && (
      <div style={{ ...S.mono, fontSize: 9, color: accent === 'up' ? 'var(--pnl-up)' : accent === 'down' ? 'var(--pnl-down)' : 'var(--fg-subtle)' }}>
        {sub}
      </div>
    )}
  </div>
);

const TabBtn: React.FC<{ icon: React.ReactNode; label: string; active: boolean; onClick: () => void; disabled?: boolean }> = ({ icon, label, active, onClick, disabled }) => (
  <button onClick={onClick} disabled={disabled}
    style={{
      ...S.mono, padding: '12px 0', border: 'none',
      background: active ? 'rgba(180,110,255,0.08)' : 'transparent',
      borderBottom: `2px solid ${active ? 'var(--iris-violet)' : 'transparent'}`,
      color: active ? 'var(--iris-violet)' : disabled ? 'var(--fg-subtle)' : 'var(--fg-muted)',
      fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const,
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
      display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 3,
    }}>
    {icon}
    {label}
  </button>
);

const Field: React.FC<{ label: string; value: string; onChange: (s: string) => void; disabled?: boolean; placeholder?: string; icon?: React.ReactNode }> = ({ label, value, onChange, disabled, placeholder, icon }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ ...S.label, marginBottom: 5, display: 'flex', alignItems: 'center', gap: 4 }}>
      {icon} {label}
    </div>
    <input type="number" value={value} disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder} inputMode="decimal" step="0.01"
      style={{
        ...S.mono, width: '100%', padding: '10px 12px', borderRadius: 10,
        background: 'rgba(255,255,255,0.03)', border: '1px solid var(--hairline)',
        color: 'var(--fg)', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const,
        opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'text',
      }} />
  </div>
);

const Submit: React.FC<{ busy: boolean; disabled: boolean; onClick: () => void; icon: React.ReactNode; label: string; color?: 'red' }> = ({ busy, disabled, onClick, icon, label, color }) => (
  <button onClick={onClick} disabled={busy || disabled}
    style={{
      ...S.mono, width: '100%', padding: '12px 0', marginTop: 12, borderRadius: 10, border: 'none',
      background: (busy || disabled)
        ? 'var(--chip-bg)'
        : color === 'red'
          ? 'linear-gradient(100deg, oklch(0.55 0.20 15), oklch(0.55 0.22 30))'
          : 'linear-gradient(100deg, oklch(0.68 0.22 295), oklch(0.70 0.22 340))',
      color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
      textTransform: 'uppercase' as const, cursor: (busy || disabled) ? 'not-allowed' : 'pointer',
      opacity: (busy || disabled) ? 0.5 : 1,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    }}>
    {busy ? <><Loader2 className="animate-spin" size={12} /> Working…</> : <>{icon} {label}</>}
  </button>
);
