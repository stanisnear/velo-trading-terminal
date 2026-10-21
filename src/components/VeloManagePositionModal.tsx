import React, { useEffect, useRef, useState } from 'react';
import { positionSettlement, liquidationEstimate, triggerPriceForRoe } from '@/services/positionValuation.mjs';
import { CheckCircle2, ExternalLink, Loader2, ShieldCheck, SlidersHorizontal, XCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { Dialog } from './ui/Dialog';
import { formatMoney, formatPrice } from './ui/shared';
import { baseScanTxUrl } from '@/services/veloPerpsService';
import type { Position } from '@/utils/types';
import './VeloManagePositionModal.css';

type Result = { txHash: `0x${string}`; explorerUrl: string };
interface Actions {
  addMargin?: (id: bigint, amount: number) => Promise<Result>;
  reduceMargin?: (id: bigint, amount: number, pair: string) => Promise<Result>;
  partialClose: (id: bigint, fraction: number, pair: string) => Promise<Result>;
  setTriggers: (id: bigint, tp: number, sl: number) => Promise<Result>;
}
interface Props {
  isOpen: boolean; onClose: () => void; position: Position | null; currentPrice: number;
  userBalance?: number; actions: Actions; initialTab?: 'ADD' | 'REDUCE' | 'PARTIAL' | 'TRIGGERS';
}
const signedMoney = (value: number) => `${value >= 0 ? '+' : '-'}$${formatMoney(Math.abs(value))}`;

export function VeloManagePositionModal({ isOpen, onClose, position, currentPrice, actions, initialTab }: Props) {
  const [tab, setTab] = useState<'CLOSE' | 'TRIGGERS'>('CLOSE');
  const [tp, setTp] = useState(''), [sl, setSl] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [hash, setHash] = useState<`0x${string}` | null>(null), [success, setSuccess] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    if (!isOpen) return;
    setTab(initialTab === 'TRIGGERS' ? 'TRIGGERS' : 'CLOSE');
    setTp(position?.takeProfit ? String(position.takeProfit) : '');
    setSl(position?.stopLoss ? String(position.stopLoss) : '');
    setError(''); setHash(null); setSuccess(false);
  }, [isOpen, position?.id, initialTab]);
  if (!position) return null;
  const p = position, now = Date.now();
  const estimate = positionSettlement(p, currentPrice, now);
  const margin = estimate.collateral + estimate.openFee;
  const roe = margin > 0 ? estimate.pnl / margin * 100 : 0;
  const liquidation = liquidationEstimate(p, now);
  const direction = p.side === 'LONG' ? 1 : -1;
  const triggerError = (value: string, kind: 'TP' | 'SL') => {
    if (!value.trim()) return '';
    const price = Number(value);
    if (!Number.isFinite(price) || price <= 0) return 'Enter a positive price, or clear the field.';
    if ((price - p.entryPrice) * direction * (kind === 'TP' ? 1 : -1) <= 0)
      return `${kind} must be ${kind === 'TP' ? (direction > 0 ? 'above' : 'below') : (direction > 0 ? 'below' : 'above')} entry.`;
    return '';
  };
  const validation = triggerError(tp, 'TP') || triggerError(sl, 'SL');
  const disabled = busy || !!hash;
  const submit = async () => {
    if (lock.current || hash) return;
    if (tab === 'TRIGGERS' && validation) { setError(validation); return; }
    lock.current = true; setBusy(true); setError('');
    try {
      if (!p.onChainTradeId) throw new Error('Position has no confirmed trade ID.');
      const id = BigInt(p.onChainTradeId);
      const result = tab === 'CLOSE' ? await actions.partialClose(id, 10000, p.pair)
        : await actions.setTriggers(id, Number(tp) || 0, Number(sl) || 0);
      setHash(result.txHash); setSuccess(true);
    } catch (e: unknown) {
      const failure = e as { message?: string; txHash?: `0x${string}` };
      if (failure.txHash) setHash(failure.txHash);
      setError(failure.message || 'The action was not confirmed.');
    } finally { lock.current = false; setBusy(false); }
  };
  const renderTrigger = (kind: 'TP' | 'SL', value: string, setValue: (value: string) => void) => {
    const profit = kind === 'TP', label = profit ? 'Take profit' : 'Stop loss';
    const valid = Number(value) > 0 && !triggerError(value, kind);
    const projected = valid ? positionSettlement(p, Number(value), now, true).pnl : null;
    const percent = projected !== null && margin > 0 ? projected / margin * 100 : 0;
    const max = profit ? Math.min(300, p.leverage * 100 - 5) : 90;
    const hit = valid && (profit ? (currentPrice - Number(value)) * direction >= 0 : (currentPrice - Number(value)) * direction <= 0);
    return <div className={`velo-trigger-field ${profit ? 'is-profit' : 'is-loss'}`}>
      <div className="velo-trigger-heading"><label htmlFor={`manage-${kind}`}>{profit ? <TrendingUp size={15} /> : <TrendingDown size={15} />}{label}</label>
        <button type="button" disabled={disabled || !value} onClick={() => setValue('')}>Clear</button></div>
      <div className="velo-trigger-input"><span>$</span><input id={`manage-${kind}`} type="number" min="0" step="any" inputMode="decimal" value={value} disabled={disabled}
        aria-invalid={!!triggerError(value, kind)} aria-describedby={`manage-${kind}-preview`} onChange={e => setValue(e.target.value)} placeholder="Not set" /></div>
      <div id={`manage-${kind}-preview`} className="velo-trigger-preview">
        <span>{p.v4 ? 'Est. net PnL' : 'Est. PnL before fees'}</span>
        <strong style={{ color: projected === null ? 'var(--fg-muted)' : projected >= 0 ? 'var(--pnl-up)' : 'var(--pnl-down)' }}>{projected === null ? 'Not set' : `${signedMoney(projected)} (${percent > 0 ? '+' : ''}${percent.toFixed(1)}%)`}</strong>
      </div>
      <input aria-label={`${label} return slider`} type="range" min="0" max={max} step="1" disabled={disabled}
        value={Math.min(max, Math.max(0, profit ? percent : -percent))} onChange={e => {
          const target = Number(e.target.value);
          const minimumLoss = -positionSettlement(p, p.entryPrice, now, true).pnl / margin * 100 + .05;
          const price = triggerPriceForRoe(p, profit ? target : -Math.max(target, minimumLoss), now);
          setValue(target === 0 ? '' : String(Number(price.toPrecision(10))));
        }} />
      <div className="velo-trigger-scale"><span>0%</span><span>{profit ? '+' : '-'}{max}% on margin</span></div>
      {triggerError(value, kind) ? <p className="velo-manage-error">{triggerError(value, kind)}</p> : hit
        ? <p className="velo-manage-note">Mark has crossed this price. Saving can make it eligible for immediate keeper execution.</p> : null}
    </div>;
  };
  return <Dialog open={isOpen} onClose={onClose} title={p.pair} busy={busy} className="velo-glass-dialog velo-position-dialog">
    <div className="velo-manage">
      <div className="velo-manage-overview">
        <div className="velo-manage-direction"><span style={{ color: p.side === 'LONG' ? 'var(--pnl-up)' : 'var(--pnl-down)' }}>{p.side}</span><span>{p.leverage}x</span><span>Isolated</span></div>
        <div className="velo-manage-pnl"><span>{p.v4 ? 'Estimated net PnL' : 'PnL before fees'}</span><strong style={{ color: estimate.pnl >= 0 ? 'var(--pnl-up)' : 'var(--pnl-down)' }}>{signedMoney(estimate.pnl)}</strong><small>{roe >= 0 ? '+' : ''}{roe.toFixed(2)}% return on margin</small></div>
        <dl className="velo-manage-quotes"><div><dt>Entry</dt><dd>${formatPrice(p.entryPrice)}</dd></div><div><dt>Mark</dt><dd>${formatPrice(currentPrice)}</dd></div><div><dt>Margin</dt><dd>${formatMoney(margin)}</dd></div></dl>
      </div>
      {success ? <div role="status" className="velo-manage-success"><CheckCircle2 size={40} /><h3>{tab === 'CLOSE' ? 'Position closed' : 'Protection updated'}</h3><p>{tab === 'CLOSE' ? 'Settlement confirmed on Base Sepolia.' : 'Your TP and SL settings are confirmed on-chain.'}</p></div> : <>
        <div role="tablist" aria-label="Position action" className="velo-manage-tabs">
          {(['CLOSE', 'TRIGGERS'] as const).map(mode => <button key={mode} role="tab" aria-selected={tab === mode} aria-controls="velo-manage-panel" disabled={disabled}
            onClick={() => { setTab(mode); setError(''); }}>{mode === 'CLOSE' ? <XCircle size={16} /> : <SlidersHorizontal size={16} />}{mode === 'CLOSE' ? 'Close position' : 'Take profit / Stop loss'}</button>)}
        </div>
        <div key={tab} id="velo-manage-panel" role="tabpanel" aria-label={tab === 'CLOSE' ? 'Close position' : 'Take profit / Stop loss'} className="velo-manage-panel">
          {tab === 'CLOSE' ? <>
            <div className="velo-manage-close-label"><span>Closing in full</span><strong>100%</strong></div>
            <div className="velo-manage-close-track"><span /></div>
            <dl className="velo-manage-breakdown">
              <div><dt>Position size</dt><dd>${formatMoney(p.size)}</dd></div>
              <div><dt>Liquidation estimate</dt><dd>${formatPrice(liquidation)}</dd></div>
              {p.v4 && <><div><dt>Closing fee</dt><dd>${formatMoney(estimate.closeFee)}</dd></div><div><dt>Accrued borrow fee</dt><dd>${formatMoney(estimate.borrowFee)}</dd></div></>}
              <div className="is-total"><dt>Est. returned to wallet</dt><dd>${formatMoney(estimate.payout)}</dd></div>
            </dl>
            <p className="velo-manage-note">The entire position settles at the execution price. Its take-profit and stop-loss settings are removed when it closes.</p>
          </> : <><div className="velo-trigger-fields">{renderTrigger('TP', tp, setTp)}{renderTrigger('SL', sl, setSl)}</div>
            <p className="velo-manage-note"><ShieldCheck size={15} />Triggers follow the oracle mark. Estimates include current spread, accrued fees and the keeper fee; the fill can differ. Clear a field to remove that trigger.</p></>}
        </div>
      </>}
      <footer className="velo-manage-footer">
        {busy && <div role="status" className="velo-manage-progress"><Loader2 size={15} className="velo-pending-spinner" />Confirming on-chain<span /></div>}
        {error && <p role="alert" className="velo-manage-error">{error}</p>}
        {hash && <a href={baseScanTxUrl(hash)} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} />{success ? 'View confirmed transaction' : 'Check pending transaction'}</a>}
        {success ? <button className="velo-manage-action" onClick={onClose}>Done</button> : <button className={`velo-manage-action ${tab === 'CLOSE' ? 'is-close' : ''}`} disabled={disabled || (tab === 'TRIGGERS' && !!validation)} onClick={() => void submit()}>
          {busy ? <Loader2 size={17} className="velo-pending-spinner" /> : tab === 'CLOSE' ? <XCircle size={17} /> : <ShieldCheck size={17} />}
          {busy ? 'Waiting for confirmation' : tab === 'CLOSE' ? 'Close entire position' : 'Save TP/SL'}
        </button>}
      </footer>
    </div>
  </Dialog>;
}
