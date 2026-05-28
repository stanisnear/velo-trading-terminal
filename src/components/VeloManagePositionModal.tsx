// VeloManagePositionModal.tsx — redesigned: glass, rounded, brand-consistent
import React, { useEffect, useState } from 'react';
import {
  TrendingUp, TrendingDown, CheckCircle2, ExternalLink,
  Loader2, X, AlertCircle, Plus, Minus, Percent,
} from 'lucide-react';
import { IS_V2, baseScanTxUrl } from '@/services/veloPerpsService';
import type { Position } from '@/utils/types';

const S = {
  display: { fontFamily: 'var(--font-display)', fontStyle: 'italic' as const, letterSpacing: '-0.02em' },
  mono:    { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1', fontVariantNumeric: 'tabular-nums' as const },
  sans:    { fontFamily: 'var(--font-sans)' },
  label:   { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700 as const, textTransform: 'uppercase' as const, letterSpacing: '0.10em', color: 'var(--fg-subtle)' },
};

type Tab = 'ADD' | 'REDUCE' | 'PARTIAL' | 'TRIGGERS';
type SuccessKind = 'close' | 'triggers' | 'add' | 'reduce';

interface Actions {
  addMargin:    (tradeId: bigint, amountUSDC: number) => Promise<{ txHash: `0x${string}`; explorerUrl: string }>;
  reduceMargin: (tradeId: bigint, amountUSDC: number, pair: string) => Promise<{ txHash: `0x${string}`; explorerUrl: string }>;
  partialClose: (tradeId: bigint, fractionBps: number, pair: string) => Promise<{ txHash: `0x${string}`; explorerUrl: string }>;
  setTriggers:  (tradeId: bigint, takeProfit: number, stopLoss: number) => Promise<{ txHash: `0x${string}`; explorerUrl: string }>;
}

interface Props {
  isOpen:         boolean;
  onClose:        () => void;
  position:       Position | null;
  currentPrice:   number;
  userBalance?:   number;
  actions:        Actions;
  initialTab?:    Tab;
}

export const VeloManagePositionModal: React.FC<Props> = ({
  isOpen, onClose, position, currentPrice, userBalance = 0, actions, initialTab,
}) => {
  const [tab,          setTab]          = useState<Tab>(initialTab || 'PARTIAL');
  const [busy,         setBusy]         = useState(false);
  const [error,        setError]        = useState('');
  const [lastTx,       setLastTx]       = useState<`0x${string}` | null>(null);
  const [addAmount,    setAddAmount]    = useState('');
  const [reduceAmount, setReduceAmount] = useState('');
  const [closePct,     setClosePct]     = useState(100);
  const [tp,           setTp]           = useState('');
  const [sl,           setSl]           = useState('');
  const [closing,      setClosing]      = useState(false);
  const [success,      setSuccess]      = useState<{ txHash: `0x${string}`; kind: SuccessKind; pct?: number; amount?: number } | null>(null);

  const dismiss = React.useCallback((delay = 0) => {
    setTimeout(() => {
      setClosing(true);
      setTimeout(() => { setClosing(false); onClose(); }, 350);
    }, delay);
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    setTab(initialTab || 'PARTIAL');
    setBusy(false); setError(''); setLastTx(null); setClosing(false); setSuccess(null);
    setAddAmount(''); setReduceAmount(''); setClosePct(100);
    if (position) {
      setTp(position.takeProfit && position.takeProfit > 0 ? String(position.takeProfit) : '');
      setSl(position.stopLoss   && position.stopLoss   > 0 ? String(position.stopLoss)   : '');
    }
  }, [isOpen, position, initialTab]);

  if (!isOpen && !closing) return null;
  if (!position) return null;

  const collateral  = position.size / position.leverage;
  const entryValid  = position.entryPrice > 0.0001;
  const pnl         = entryValid
    ? (currentPrice - position.entryPrice) * (position.side === 'LONG' ? 1 : -1) * (position.size / position.entryPrice)
    : 0;
  const pnlPct      = entryValid && collateral > 0 ? (pnl / collateral) * 100 : 0;
  const tradeId     = position.onChainTradeId ? BigInt(position.onChainTradeId) : 0n;
  const isV1        = !position.onChain || tradeId === 0n;
  const ok          = IS_V2 && !isV1;

  // TP/SL expected PnL previews
  const tpNum = parseFloat(tp) || 0;
  const slNum = parseFloat(sl) || 0;
  const sizeInUnits = entryValid ? position.size / position.entryPrice : 0;
  const tpPnl = tpNum > 0 && entryValid
    ? (tpNum - position.entryPrice) * (position.side === 'LONG' ? 1 : -1) * sizeInUnits
    : null;
  const slPnl = slNum > 0 && entryValid
    ? (slNum - position.entryPrice) * (position.side === 'LONG' ? 1 : -1) * sizeInUnits
    : null;
  const tpPct = tpPnl !== null && collateral > 0 ? (tpPnl / collateral) * 100 : null;
  const slPct = slPnl !== null && collateral > 0 ? (slPnl / collateral) * 100 : null;

  const handle = async (kind: Tab) => {
    setBusy(true); setError(''); setLastTx(null);
    try {
      let res: { txHash: `0x${string}` };
      if (kind === 'ADD') {
        const amt = parseFloat(addAmount);
        if (!(amt > 0)) throw new Error('Enter an amount');
        res = await actions.addMargin(tradeId, amt);
        setLastTx(res.txHash);
        setSuccess({ txHash: res.txHash, kind: 'add', amount: amt });
        dismiss(2600);
      } else if (kind === 'REDUCE') {
        const amt = parseFloat(reduceAmount);
        if (!(amt > 0)) throw new Error('Enter an amount');
        if (amt >= collateral) throw new Error('Cannot withdraw all collateral — use Close instead');
        res = await actions.reduceMargin(tradeId, amt, position.pair);
        setLastTx(res.txHash);
        setSuccess({ txHash: res.txHash, kind: 'reduce', amount: amt });
        dismiss(2600);
      } else if (kind === 'PARTIAL') {
        if (closePct <= 0 || closePct > 100) throw new Error('Invalid %');
        res = await actions.partialClose(tradeId, Math.round(closePct * 100), position.pair);
        setLastTx(res.txHash);
        setSuccess({ txHash: res.txHash, kind: 'close', pct: closePct });
        dismiss(2800);
      } else {
        const tpV = parseFloat(tp) || 0;
        const slV = parseFloat(sl) || 0;
        if (position.side === 'LONG') {
          if (tpV && tpV <= position.entryPrice) throw new Error('TP must be above entry for a long');
          if (slV && slV >= position.entryPrice) throw new Error('SL must be below entry for a long');
        } else {
          if (tpV && tpV >= position.entryPrice) throw new Error('TP must be below entry for a short');
          if (slV && slV <= position.entryPrice) throw new Error('SL must be above entry for a short');
        }
        res = await actions.setTriggers(tradeId, tpV, slV);
        setLastTx(res.txHash);
        setSuccess({ txHash: res.txHash, kind: 'triggers' });
        dismiss(2600);
      }
    } catch (e: any) {
      setError(e?.shortMessage || e?.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const tabs: { id: Tab; icon: React.ReactNode; label: string }[] = [
    { id: 'PARTIAL',  icon: <Percent size={13} />,    label: 'Close' },
    { id: 'TRIGGERS', icon: <TrendingUp size={13} />, label: 'TP / SL' },
    { id: 'ADD',      icon: <Plus size={13} />,       label: 'Add' },
    { id: 'REDUCE',   icon: <Minus size={13} />,      label: 'Reduce' },
  ];

  const successTitle = () => {
    if (!success) return '';
    if (success.kind === 'close') return success.pct === 100 ? 'Position Closed' : `${success.pct}% Closed`;
    if (success.kind === 'triggers') return 'Triggers Saved';
    if (success.kind === 'add') return `+$${(success.amount || 0).toFixed(2)} Added`;
    return `$${(success.amount || 0).toFixed(2)} Withdrawn`;
  };
  const successSub = () => {
    if (!success) return '';
    if (success.kind === 'close') return `${position.pair} · ${position.side} · ${position.leverage}×`;
    if (success.kind === 'triggers') return 'On-chain triggers updated';
    if (success.kind === 'add') return 'Collateral added · liquidation risk lowered';
    return 'Collateral withdrawn to trading wallet';
  };
  const successColor = () => {
    if (!success) return 'oklch(0.78 0.18 150)';
    if (success.kind === 'close' && pnl < 0) return 'oklch(0.65 0.22 15)';
    if (success.kind === 'reduce') return 'oklch(0.68 0.22 295)';
    return 'oklch(0.78 0.18 150)';
  };

  return (
    <>
      <style>{`
        @keyframes velo-modal-in  { from { opacity:0; transform:scale(0.96) translateY(12px) } to { opacity:1; transform:scale(1) translateY(0) } }
        @keyframes velo-modal-out { from { opacity:1; transform:scale(1) translateY(0) } to { opacity:0; transform:scale(0.94) translateY(20px) } }
        @keyframes velo-bg-in     { from { opacity:0 } to { opacity:1 } }
        @keyframes velo-bg-out    { from { opacity:1 } to { opacity:0 } }
        @keyframes velo-check-pop { from { opacity:0; transform:scale(0.5) } to { opacity:1; transform:scale(1) } }
        @keyframes velo-check-draw { from { stroke-dashoffset:28 } to { stroke-dashoffset:0 } }
        @keyframes velo-pnl-in { from { opacity:0; transform:translateY(4px) } to { opacity:1; transform:translateY(0) } }
      `}</style>
      <div
        onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
        style={{
          position: 'fixed', inset: 0, zIndex: 65,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20,
          background: 'rgba(7,7,10,0.75)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          animation: closing ? 'velo-bg-out 0.35s ease forwards' : 'velo-bg-in 0.2s ease forwards',
        }}
      >
        <div style={{
          width: '100%', maxWidth: 420,
          borderRadius: 24,
          background: 'var(--glass-bg-strong)',
          border: '1px solid var(--glass-border)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04) inset',
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
          overflow: 'hidden',
          animation: closing ? 'velo-modal-out 0.35s cubic-bezier(0.4,0,1,1) forwards' : 'velo-modal-in 0.25s cubic-bezier(0,0,0.2,1) forwards',
        }}>

        {/* gradient top accent */}
        <div style={{
          height: 2,
          background: position.side === 'LONG'
            ? 'linear-gradient(90deg, oklch(0.78 0.18 150), oklch(0.68 0.22 295), oklch(0.72 0.20 240))'
            : 'linear-gradient(90deg, oklch(0.65 0.22 15), oklch(0.68 0.22 295), oklch(0.72 0.20 240))',
        }} />

        {/* SUCCESS SCREEN */}
        {success ? (
          <div style={{
            padding: '40px 28px 36px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0,
            animation: 'velo-modal-in 0.3s cubic-bezier(0,0,0.2,1) forwards',
          }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              background: `color-mix(in oklch, ${successColor()} 12%, transparent)`,
              border: `1.5px solid color-mix(in oklch, ${successColor()} 40%, transparent)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 20,
              animation: 'velo-check-pop 0.4s cubic-bezier(0.175,0.885,0.32,1.275) 0.1s both',
            }}>
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path d="M8 16.5l5.5 5.5 10.5-11" stroke={successColor()} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ strokeDasharray: 28, strokeDashoffset: 0, animation: 'velo-check-draw 0.35s ease 0.3s both' }} />
              </svg>
            </div>
            <div style={{ ...S.display, fontSize: 26, color: 'var(--fg)', marginBottom: 6 }}>
              {successTitle()}
            </div>
            <div style={{ ...S.mono, fontSize: 12, color: 'var(--fg-muted)', marginBottom: 28, textAlign: 'center' }}>
              {successSub()}
            </div>
            <a
              href={`https://sepolia.basescan.org/tx/${success.txHash}`}
              target="_blank" rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                ...S.mono, fontSize: 11, fontWeight: 700,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                color: 'oklch(0.68 0.22 295)',
                padding: '10px 20px', borderRadius: 12,
                background: 'oklch(0.68 0.22 295 / 0.08)',
                border: '1px solid oklch(0.68 0.22 295 / 0.25)',
                textDecoration: 'none',
              }}
            >
              <ExternalLink size={12} /> View on BaseScan
            </a>
            <div style={{ marginTop: 20, ...S.mono, fontSize: 11, color: 'var(--fg-subtle)', opacity: 0.6 }}>
              Closing…
            </div>
          </div>
        ) : (
        <>
        {/* Header */}
        <div style={{ padding: '18px 20px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ ...S.display, fontSize: 22, color: 'var(--fg)' }}>{position.pair}</span>
              <span style={{
                ...S.mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                padding: '2px 8px', borderRadius: 20,
                background: position.side === 'LONG' ? 'oklch(0.78 0.18 150 / 0.12)' : 'oklch(0.65 0.22 15 / 0.12)',
                border: `1px solid ${position.side === 'LONG' ? 'oklch(0.78 0.18 150 / 0.3)' : 'oklch(0.65 0.22 15 / 0.3)'}`,
                color: position.side === 'LONG' ? 'var(--pnl-up)' : 'var(--pnl-down)',
              }}>
                {position.side}
              </span>
              <span style={{ ...S.mono, fontSize: 10, color: 'var(--fg-subtle)' }}>{position.leverage}×</span>
            </div>
            <div style={{ display: 'flex', gap: 16, ...S.mono, fontSize: 11 }}>
              <span style={{ color: 'var(--fg-muted)' }}>
                Entry <span style={{ color: 'var(--fg)', fontWeight: 700 }}>${position.entryPrice.toLocaleString('en-US', { maximumFractionDigits: 4 })}</span>
              </span>
              <span style={{ color: 'var(--fg-muted)' }}>
                Mark <span style={{ color: 'var(--fg)', fontWeight: 700 }}>${currentPrice.toLocaleString('en-US', { maximumFractionDigits: 4 })}</span>
              </span>
              <span style={{ color: entryValid ? (pnl >= 0 ? 'var(--pnl-up)' : 'var(--pnl-down)') : 'var(--fg-subtle)', fontWeight: 700 }}>
                {entryValid ? `${pnl >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%` : 'Entry N/A'}
              </span>
            </div>
          </div>
          <button onClick={() => dismiss()} style={{ background: 'var(--chip-bg)', border: '1px solid var(--hairline)', borderRadius: 10, padding: '6px 7px', cursor: 'pointer', color: 'var(--fg-muted)', display: 'flex', alignItems: 'center', marginTop: 2 }}>
            <X size={14} />
          </button>
        </div>

        {/* V1 warning */}
        {isV1 && (
          <div style={{ margin: '0 16px 12px', padding: '10px 14px', borderRadius: 12, background: 'oklch(0.85 0.15 80 / 0.08)', border: '1px solid oklch(0.85 0.15 80 / 0.2)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <AlertCircle size={14} style={{ color: 'oklch(0.85 0.15 80)', flexShrink: 0, marginTop: 1 }} />
            <span style={{ ...S.sans, fontSize: 12, color: 'var(--fg)', lineHeight: 1.5 }}>
              V1 position — add margin, partial close, and TP/SL are V2 only.
            </span>
          </div>
        )}

        {/* Tab pills */}
        <div style={{ padding: '0 16px 14px', display: 'flex', gap: 6 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} disabled={!ok && t.id !== 'PARTIAL'}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column' as const,
                alignItems: 'center', gap: 4, padding: '8px 4px',
                borderRadius: 14, border: 'none', cursor: ok || t.id === 'PARTIAL' ? 'pointer' : 'not-allowed',
                background: tab === t.id
                  ? 'linear-gradient(135deg, oklch(0.68 0.22 295 / 0.18), oklch(0.72 0.20 240 / 0.12))'
                  : 'rgba(255,255,255,0.03)',
                boxShadow: tab === t.id ? '0 0 0 1px oklch(0.68 0.22 295 / 0.4) inset' : '0 0 0 1px var(--hairline) inset',
                color: tab === t.id ? 'var(--iris-violet)' : (!ok && t.id !== 'PARTIAL') ? 'var(--fg-subtle)' : 'var(--fg-muted)',
                opacity: (!ok && t.id !== 'PARTIAL') ? 0.4 : 1,
                transition: 'all 0.15s ease',
              }}
            >
              {t.icon}
              <span style={{ ...S.label, fontSize: 9, color: 'inherit', letterSpacing: '0.06em' }}>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ padding: '0 16px 20px' }}>

          {lastTx && !success && (
            <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 14, background: 'oklch(0.78 0.18 150 / 0.08)', border: '1px solid oklch(0.78 0.18 150 / 0.25)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ ...S.mono, fontSize: 11, color: 'var(--pnl-up)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={13} /> Confirmed on-chain
              </span>
              <a href={baseScanTxUrl(lastTx)} target="_blank" rel="noopener noreferrer"
                style={{ ...S.mono, fontSize: 10, color: 'var(--iris-violet)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                BaseScan <ExternalLink size={10} />
              </a>
            </div>
          )}

          {error && (
            <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 12, background: 'oklch(0.65 0.22 15 / 0.06)', border: '1px solid oklch(0.65 0.22 15 / 0.2)', ...S.mono, fontSize: 11, color: 'var(--pnl-down)' }}>
              {error}
            </div>
          )}

          {/* CLOSE % */}
          {tab === 'PARTIAL' && (
            <>
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <div style={{ ...S.display, fontSize: 52, color: 'var(--fg)', lineHeight: 1 }}>{closePct}%</div>
                <div style={{ ...S.mono, fontSize: 11, color: 'var(--fg-subtle)', marginTop: 4 }}>
                  ${((position.size * closePct) / 100).toFixed(2)} of ${position.size.toFixed(2)}
                </div>
              </div>
              <input type="range" min="1" max="100" value={closePct}
                onChange={(e) => setClosePct(parseInt(e.target.value))}
                style={{ width: '100%', accentColor: 'oklch(0.68 0.22 295)', marginBottom: 14 }} />
              <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                {[25, 50, 75, 100].map((p) => (
                  <button key={p} onClick={() => setClosePct(p)} style={{
                    flex: 1, padding: '8px 0', borderRadius: 12, border: 'none', cursor: 'pointer',
                    ...S.mono, fontSize: 11, fontWeight: 700,
                    background: closePct === p ? 'oklch(0.68 0.22 295 / 0.18)' : 'rgba(255,255,255,0.04)',
                    boxShadow: closePct === p ? '0 0 0 1px oklch(0.68 0.22 295 / 0.45) inset' : '0 0 0 1px var(--hairline) inset',
                    color: closePct === p ? 'var(--iris-violet)' : 'var(--fg-muted)',
                  }}>{p}%</button>
                ))}
              </div>
              {/* Est PnL row */}
              <div style={{ padding: '10px 14px', borderRadius: 12, marginBottom: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--hairline)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ ...S.label }}>Est. PnL on close</span>
                <span style={{ ...S.mono, fontSize: 13, fontWeight: 700, color: entryValid ? (pnl >= 0 ? 'var(--pnl-up)' : 'var(--pnl-down)') : 'var(--fg-subtle)' }}>
                  {entryValid
                    ? `${(pnl * closePct / 100) >= 0 ? '+' : ''}$${Math.abs(pnl * closePct / 100).toFixed(2)}`
                    : '—'}
                </span>
              </div>
              <ActionBtn busy={busy} disabled={!ok} onClick={() => handle('PARTIAL')}
                label={closePct === 100 ? 'Close position' : `Close ${closePct}%`} danger={closePct === 100} />
            </>
          )}

          {/* TP / SL */}
          {tab === 'TRIGGERS' && (
            <>
              {(position.takeProfit || position.stopLoss) && (
                <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--hairline)', display: 'flex', gap: 16 }}>
                  <span style={{ ...S.label }}>Active</span>
                  {position.takeProfit && position.takeProfit > 0 && (
                    <span style={{ ...S.mono, fontSize: 11, color: 'var(--pnl-up)', fontWeight: 700 }}>
                      TP ${position.takeProfit.toLocaleString('en-US', { maximumFractionDigits: 4 })}
                    </span>
                  )}
                  {position.stopLoss && position.stopLoss > 0 && (
                    <span style={{ ...S.mono, fontSize: 11, color: 'var(--pnl-down)', fontWeight: 700 }}>
                      SL ${position.stopLoss.toLocaleString('en-US', { maximumFractionDigits: 4 })}
                    </span>
                  )}
                </div>
              )}

              {/* TP input + preview */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ ...S.label, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <TrendingUp size={10} style={{ color: 'var(--pnl-up)' }} /> Take profit
                </div>
                <PriceInput value={tp} onChange={setTp} placeholder="Price — 0 to clear" disabled={!ok} accent="green" />
                {tpPnl !== null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', marginTop: 6, borderRadius: 10, background: 'oklch(0.78 0.18 150 / 0.06)', border: '1px solid oklch(0.78 0.18 150 / 0.2)', animation: 'velo-pnl-in 0.2s ease' }}>
                    <span style={{ ...S.label, fontSize: 9 }}>Expected profit</span>
                    <span style={{ ...S.mono, fontSize: 12, fontWeight: 700, color: tpPnl >= 0 ? 'var(--pnl-up)' : 'var(--pnl-down)' }}>
                      {tpPnl >= 0 ? '+' : ''}${Math.abs(tpPnl).toFixed(2)}
                      <span style={{ fontSize: 10, opacity: 0.7 }}> ({tpPct !== null ? (tpPct >= 0 ? '+' : '') + tpPct.toFixed(1) : '—'}%)</span>
                    </span>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 5, marginTop: 7 }}>
                  {[25, 50, 100, 200, 500].map((pct) => (
                    <button key={pct} onClick={() => {
                      const sign = position.side === 'LONG' ? 1 : -1;
                      setTp(((position.entryPrice) + (pct / 100 / position.leverage) * position.entryPrice * sign).toFixed(4));
                    }} disabled={!ok} style={chipStyle('green')}>+{pct}%</button>
                  ))}
                </div>
              </div>

              {/* SL input + preview */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ ...S.label, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <TrendingDown size={10} style={{ color: 'var(--pnl-down)' }} /> Stop loss
                </div>
                <PriceInput value={sl} onChange={setSl} placeholder="Price — 0 to clear" disabled={!ok} accent="red" />
                {slPnl !== null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', marginTop: 6, borderRadius: 10, background: 'oklch(0.65 0.22 15 / 0.06)', border: '1px solid oklch(0.65 0.22 15 / 0.2)', animation: 'velo-pnl-in 0.2s ease' }}>
                    <span style={{ ...S.label, fontSize: 9 }}>Max loss</span>
                    <span style={{ ...S.mono, fontSize: 12, fontWeight: 700, color: slPnl >= 0 ? 'var(--pnl-up)' : 'var(--pnl-down)' }}>
                      {slPnl >= 0 ? '+' : '-'}${Math.abs(slPnl).toFixed(2)}
                      <span style={{ fontSize: 10, opacity: 0.7 }}> ({slPct !== null ? (slPct >= 0 ? '+' : '') + slPct.toFixed(1) : '—'}%)</span>
                    </span>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 5, marginTop: 7 }}>
                  {[10, 25, 50, 75, 90].map((pct) => (
                    <button key={pct} onClick={() => {
                      const sign = position.side === 'LONG' ? 1 : -1;
                      setSl(((position.entryPrice) - (pct / 100 / position.leverage) * position.entryPrice * sign).toFixed(4));
                    }} disabled={!ok} style={chipStyle('red')}>-{pct}%</button>
                  ))}
                </div>
              </div>
              <ActionBtn busy={busy} disabled={!ok} onClick={() => handle('TRIGGERS')} label="Save triggers" />
            </>
          )}

          {/* ADD MARGIN */}
          {tab === 'ADD' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--hairline)', marginBottom: 12 }}>
                <span style={{ ...S.label, fontSize: 9 }}>Trading wallet</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ ...S.mono, fontSize: 12, fontWeight: 700, color: 'var(--pnl-up)' }}>${userBalance.toFixed(2)} available</span>
                  <button onClick={() => setAddAmount(userBalance.toFixed(2))} disabled={!ok || userBalance <= 0} style={{ ...S.mono, fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 7, border: 'none', cursor: 'pointer', background: 'oklch(0.68 0.22 295 / 0.12)', color: 'var(--iris-violet)' }}>MAX</button>
                </div>
              </div>
              <div style={{ ...S.label, marginBottom: 6 }}>Amount (mUSDC)</div>
              <PriceInput value={addAmount} onChange={setAddAmount} placeholder="0.00" disabled={!ok} accent="violet" />
              <div style={{ display: 'flex', gap: 5, marginTop: 8, marginBottom: 2 }}>
                {[10, 25, 50, 100].map(amt => (
                  <button key={amt} onClick={() => setAddAmount(String(Math.min(amt, userBalance)))} disabled={!ok || userBalance < amt} style={{ flex: 1, padding: '6px 0', borderRadius: 9, border: 'none', cursor: userBalance >= amt ? 'pointer' : 'not-allowed', ...S.mono, fontSize: 10, fontWeight: 700, background: 'rgba(255,255,255,0.04)', boxShadow: '0 0 0 1px var(--hairline) inset', color: userBalance >= amt ? 'var(--fg-muted)' : 'var(--fg-subtle)', opacity: userBalance >= amt ? 1 : 0.4 }}>${amt}</button>
                ))}
              </div>
              {parseFloat(addAmount) > 0 && entryValid && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', marginTop: 8, borderRadius: 10, background: 'oklch(0.68 0.22 295 / 0.06)', border: '1px solid oklch(0.68 0.22 295 / 0.18)', animation: 'velo-pnl-in 0.2s ease' }}>
                  <span style={{ ...S.label, fontSize: 9 }}>New collateral</span>
                  <span style={{ ...S.mono, fontSize: 12, fontWeight: 700, color: 'var(--iris-violet)' }}>
                    ${(collateral + (parseFloat(addAmount) || 0)).toFixed(2)}
                    <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--fg-subtle)', marginLeft: 4 }}>
                      (was ${collateral.toFixed(2)})
                    </span>
                  </span>
                </div>
              )}
              <ActionBtn busy={busy} disabled={!ok || !(parseFloat(addAmount) > 0)} onClick={() => handle('ADD')}
                label={`Add $${(parseFloat(addAmount) || 0).toFixed(2)}`} />
            </>
          )}

          {/* REDUCE MARGIN */}
          {tab === 'REDUCE' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--hairline)', marginBottom: 12 }}>
                <span style={{ ...S.label, fontSize: 9 }}>Current collateral</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ ...S.mono, fontSize: 12, fontWeight: 700, color: 'var(--fg)' }}>${collateral.toFixed(2)}</span>
                  <button onClick={() => {
                    // Leave 20% of collateral as maintenance margin buffer
                    const maxWithdraw = Math.max(0, collateral * 0.8);
                    setReduceAmount(maxWithdraw.toFixed(2));
                  }} disabled={!ok || collateral <= 0} style={{ ...S.mono, fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 7, border: 'none', cursor: 'pointer', background: 'oklch(0.68 0.22 295 / 0.12)', color: 'var(--iris-violet)' }}>MAX</button>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ ...S.label }}>Amount (mUSDC)</span>
                <span style={{ ...S.mono, fontSize: 9, color: 'var(--fg-subtle)' }}>Max 80% · contract keeps 20% buffer</span>
              </div>
              <PriceInput value={reduceAmount} onChange={setReduceAmount} placeholder="0.00" disabled={!ok} accent="violet" />
              <div style={{ display: 'flex', gap: 5, marginTop: 8, marginBottom: 2 }}>
                {[25, 50, 75].map(pct => {
                  const maxSafe = collateral * 0.8;
                  const amt = Math.min(collateral * pct / 100, maxSafe);
                  return (
                    <button key={pct} onClick={() => setReduceAmount(amt.toFixed(2))} disabled={!ok} style={{ flex: 1, padding: '6px 0', borderRadius: 9, border: 'none', cursor: 'pointer', ...S.mono, fontSize: 10, fontWeight: 700, background: 'rgba(255,255,255,0.04)', boxShadow: '0 0 0 1px var(--hairline) inset', color: 'var(--fg-muted)' }}>{pct}%</button>
                  );
                })}
                <button onClick={() => setReduceAmount((collateral * 0.8).toFixed(2))} disabled={!ok} style={{ flex: 1, padding: '6px 0', borderRadius: 9, border: 'none', cursor: 'pointer', ...S.mono, fontSize: 10, fontWeight: 700, background: 'rgba(255,255,255,0.04)', boxShadow: '0 0 0 1px var(--hairline) inset', color: 'var(--fg-muted)' }}>MAX</button>
              </div>
              {parseFloat(reduceAmount) > 0 && (() => {
                const remaining = Math.max(0, collateral - (parseFloat(reduceAmount) || 0));
                const tooLow = remaining < collateral * 0.2;
                return (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', marginTop: 8, borderRadius: 10, background: tooLow ? 'oklch(0.65 0.22 15 / 0.06)' : 'oklch(0.68 0.22 295 / 0.06)', border: `1px solid ${tooLow ? 'oklch(0.65 0.22 15 / 0.3)' : 'oklch(0.68 0.22 295 / 0.18)'}`, animation: 'velo-pnl-in 0.2s ease' }}>
                    <span style={{ ...S.label, fontSize: 9 }}>{tooLow ? '⚠ Below min buffer' : 'Remaining collateral'}</span>
                    <span style={{ ...S.mono, fontSize: 12, fontWeight: 700, color: tooLow ? 'var(--pnl-down)' : 'var(--iris-violet)' }}>
                      ${remaining.toFixed(2)}
                    </span>
                  </div>
                );
              })()}
              <ActionBtn busy={busy} disabled={!ok || !(parseFloat(reduceAmount) > 0)} onClick={() => handle('REDUCE')}
                label={`Withdraw $${(parseFloat(reduceAmount) || 0).toFixed(2)}`} />
            </>
          )}

        </div>
        </>)}
      </div>
    </div>
    </>
  );
};

// helpers
const chipStyle = (color: 'green' | 'red'): React.CSSProperties => ({
  flex: 1, padding: '5px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
  fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
  background: color === 'green' ? 'rgba(34,197,94,0.07)' : 'rgba(255,80,80,0.07)',
  boxShadow: color === 'green' ? '0 0 0 1px rgba(34,197,94,0.22) inset' : '0 0 0 1px rgba(255,80,80,0.22) inset',
  color: color === 'green' ? 'var(--pnl-up)' : 'var(--pnl-down)',
});

const PriceInput: React.FC<{
  value: string; onChange: (v: string) => void;
  placeholder?: string; disabled?: boolean; accent?: 'green' | 'red' | 'violet';
}> = ({ value, onChange, placeholder, disabled, accent }) => {
  const accentColor = accent === 'green'
    ? 'oklch(0.78 0.18 150 / 0.35)'
    : accent === 'red'
    ? 'oklch(0.65 0.22 15 / 0.35)'
    : 'oklch(0.68 0.22 295 / 0.35)';
  return (
    <input
      type="number" value={value} onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder} inputMode="decimal" step="any" disabled={disabled}
      style={{
        fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
        width: '100%', padding: '12px 14px', borderRadius: 14, boxSizing: 'border-box' as const,
        background: 'rgba(255,255,255,0.04)',
        border: `1px solid ${value ? accentColor : 'var(--hairline)'}`,
        color: 'var(--fg)', fontSize: 15, fontWeight: 700, outline: 'none',
        opacity: disabled ? 0.45 : 1, cursor: disabled ? 'not-allowed' : 'text',
        transition: 'border-color 0.15s',
      }}
    />
  );
};

const ActionBtn: React.FC<{
  busy: boolean; disabled: boolean; onClick: () => void; label: string; danger?: boolean;
}> = ({ busy, disabled, onClick, label, danger }) => (
  <button onClick={onClick} disabled={busy || disabled}
    style={{
      width: '100%', padding: '13px 0', borderRadius: 16, border: 'none', marginTop: 14,
      fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
      letterSpacing: '0.08em', textTransform: 'uppercase' as const,
      cursor: (busy || disabled) ? 'not-allowed' : 'pointer',
      opacity: (busy || disabled) ? 0.45 : 1,
      background: (busy || disabled)
        ? 'var(--chip-bg)'
        : danger
          ? 'linear-gradient(135deg, oklch(0.55 0.20 15), oklch(0.58 0.22 25))'
          : 'linear-gradient(135deg, oklch(0.68 0.22 295), oklch(0.72 0.20 240))',
      color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
      boxShadow: (busy || disabled) ? 'none' : danger
        ? '0 4px 16px oklch(0.55 0.20 15 / 0.35)'
        : '0 4px 16px oklch(0.68 0.22 295 / 0.35)',
    }}
  >
    {busy ? <><Loader2 className="animate-spin" size={14} /> Working…</> : label}
  </button>
);
