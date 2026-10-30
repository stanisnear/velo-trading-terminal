import { AnimatedText } from './AnimatedValue';
import React, { useState, useEffect } from 'react';
import { TradingDialog } from './TradingDialog';
import { AnimatedPanel } from './ProductMotion';
import { Info, ExternalLink, Share2, ChevronDown, ShieldCheck } from 'lucide-react';
import { Button, formatMoney, formatPrice } from '@/components/ui/shared';
import { Position, OpenOrder, TradeHistoryItem, Transaction } from '@/utils/types';

const S = {
  display: { fontFamily: 'var(--font-sans)', fontStyle: 'normal' as const, letterSpacing: '-0.02em' },
  mono:    { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1', fontVariantNumeric: 'tabular-nums' as const },
  label:   { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)' } as React.CSSProperties,
};

// On-chain link button — BaseScan or Orderly Portfolio
const ChainLink = ({ href, label }: { href: string; label: string }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
      color: 'var(--iris-violet)', textDecoration: 'none',
      padding: '3px 8px', borderRadius: 6,
      border: '1px solid color-mix(in oklab, var(--accent) 35%, transparent)',
      background: 'color-mix(in oklab, var(--accent) 8%, transparent)',
    }}
  >
    {label} <ExternalLink size={9} />
  </a>
);


export type DetailsPayload =
  | { kind: 'HISTORY';     item: TradeHistoryItem }
  | { kind: 'POSITION';    item: Position }
  | { kind: 'ORDER';       item: OpenOrder }
  | { kind: 'TRANSACTION'; item: Transaction };

// Inline explanations remain inside the native dialog's focus/top layer.
const Row = ({ label, value, valueColor, tip }: {
  label:string; value:React.ReactNode; valueColor?:string; tip?:string; isSmall:boolean;
}) => {
  const [explained, setExplained] = useState(false);
  return <div className="trade-detail-fact">
    <div className="trade-detail-fact__label"><span>{label}</span>{tip && <button type="button" aria-label={`About ${label}`} aria-expanded={explained}
      onClick={()=>setExplained(!explained)}><Info size={12}/></button>}</div>
    <div className="trade-detail-fact__value" style={{color:valueColor || 'var(--fg)'}}>{typeof value === 'string' && /[0-9]/.test(value) ? <AnimatedText text={value}/> : value}</div>
    {tip && <AnimatedPanel activeKey={explained ? 'explanation' : 'market'}><p className="trade-detail-fact__help">{tip}</p></AnimatedPanel>}
  </div>;
};

export const OrderDetailsModal = ({
  payload,
  onClose,
  marketPrices,
  onClosePosition,
  onEditPosition,
  handleCancelOrder,
  onShareHistory,
  onSharePosition,
}: {
  payload: DetailsPayload | null;
  onClose: () => void;
  marketPrices: Record<string, number>;
  onClosePosition: (id: string) => void;
  onEditPosition: (p: Position) => void;
  handleCancelOrder: (id: string) => void;
  onShareHistory?: (t: any) => void;
  onSharePosition?: (p: any) => void;
}) => {
  const [mounted, setMounted] = useState(false);
  const [isSmall, setIsSmall] = useState(false);
  const dialogKey = payload ? `${payload.kind}:${payload.item.id}` : null;
  const [expanded, setExpanded] = useState(false);
  useEffect(()=>setExpanded(false),[dialogKey]);
  useEffect(() => {
    setMounted(true);
    const check = () => setIsSmall(window.innerWidth < 640);
    check(); window.addEventListener('resize',check);
    return () => window.removeEventListener('resize',check);
  }, []);

  if (!payload || !mounted) return null;

  const fmtDuration = (ms: number) => {
    if (!ms || ms < 0) return '—';
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (d) return `${d}d ${h}h ${m}m`;
    if (h) return `${h}h ${m}m`;
    if (m) return `${m}m ${sec}s`;
    return `${sec}s`;
  };

  const fmtDateTime = (ts?: number) => {
    if (!ts) return '—';
    const d = new Date(ts);
    return `${d.toLocaleDateString()} · ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  };



  // ── Header text per kind ────────────────────────────────────────────────
  // Transactions show one of four labels: Deposit / Withdrawal / Sent / Received.
  // SEND and RECEIVE are peer-to-peer mUSDC transfers; treat RECEIVE like a
  // deposit (money in, green) and SEND like a withdrawal (money out, amber).
  const txKindLabel = payload.kind === 'TRANSACTION'
    ? (payload.item.type === 'DEPOSIT'  ? 'Deposit'
     : payload.item.type === 'WITHDRAW' ? 'Withdrawal'
     : payload.item.type === 'RECEIVE'  ? 'Received'
     :                                     'Sent')
    : '';
  const txIsInflow = payload.kind === 'TRANSACTION'
    && (payload.item.type === 'DEPOSIT' || payload.item.type === 'RECEIVE');

  const headerPair = payload.kind === 'TRANSACTION' ? txKindLabel : payload.item.pair;
  const headerSide = payload.kind === 'TRANSACTION' ? (txIsInflow ? 'IN' : 'OUT') : payload.item.side;
  const sideUp = payload.kind === 'TRANSACTION' ? txIsInflow : payload.item.side === 'LONG';
  const copyId = payload.kind !== 'TRANSACTION' ? (payload.item as any).copyTraderId as string | undefined : undefined;

  let hero: React.ReactNode = null;
  let body: React.ReactNode = null;
  let footer: React.ReactNode = null;

  const heroPadding = isSmall ? '12px 14px' : '16px 18px';

  if (payload.kind === 'HISTORY') {
    const t          = payload.item;
    const isOpenEntry = (t as any).action === 'OPEN';
    const leverage   = t.leverage || 0;
    const marginUsed = leverage > 0 ? t.size / leverage : 0;
    const pnlPct     = marginUsed > 0 ? (t.pnl / marginUsed) * 100 : 0;
    const priceMove  = (!isOpenEntry && t.entryPrice > 0) ? ((t.exitPrice - t.entryPrice) / t.entryPrice) * 100 : 0;
    const durationMs = t.openedAt ? Math.max(0, t.timestamp - t.openedAt) : 0;
    const pnlUp      = t.pnl >= 0;

    hero = (
      <div style={{ padding: heroPadding, borderBottom: '1px solid var(--hairline-strong)', textAlign: 'center', background: isOpenEntry ? 'color-mix(in oklab, var(--accent) 6%, transparent)' : (pnlUp ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)') }}>
        {isOpenEntry ? (
          <>
            <div style={{ ...S.label, fontSize: 10, marginBottom: 4, color: 'var(--fg-muted)' }}>Position Opened</div>
            <div style={{ ...S.mono, fontSize: isSmall ? 22 : 26, fontWeight: 700, color: 'var(--pnl-up)' }}>
              {t.side} @ ${<AnimatedText text={formatPrice(t.entryPrice)}/>}
            </div>
          </>
        ) : (
          <>
            <div style={{ ...S.label, fontSize: 10, marginBottom: 4, color: 'var(--fg-muted)' }}>Realized PnL</div>
            <div style={{ ...S.mono, fontSize: isSmall ? 26 : 30, fontWeight: 700, color: pnlUp ? 'var(--pnl-up)' : 'var(--pnl-down)' }}>
              {pnlUp ? '+' : ''}${<AnimatedText text={formatMoney(t.pnl)}/>}
            </div>
            {marginUsed > 0 && (
              <div style={{ ...S.mono, fontSize: 11, color: pnlUp ? 'var(--pnl-up)' : 'var(--pnl-down)', marginTop: 3, opacity: 0.85 }}>
                {pnlUp ? '+' : ''}{<AnimatedText text={pnlPct.toFixed(2)}/>}% on margin
              </div>
            )}
          </>
        )}
      </div>
    );
    body = (
      <>
        <Row isSmall={isSmall} label="Entry Price"   value={`$${formatPrice(t.entryPrice)}`}   tip="The average price at which this position was opened." />
        {!isOpenEntry && <Row isSmall={isSmall} label="Exit Price"    value={`$${formatPrice(t.exitPrice)}`}    tip="The price at which the position was closed." />}
        {!isOpenEntry && <Row isSmall={isSmall} label="Price Change"  value={`${priceMove >= 0 ? '+' : ''}${priceMove.toFixed(3)}%`} valueColor={priceMove >= 0 ? 'var(--pnl-up)' : 'var(--pnl-down)'} tip="% move in price from entry to exit." />}
        <Row isSmall={isSmall} label="Position Size" value={`$${formatMoney(t.size)}`}         tip="Total notional value of the position (margin × leverage)." />
        {leverage > 0 && <Row isSmall={isSmall} label="Leverage"    value={`${leverage}×`}                   tip="Multiplier applied to your margin. Higher leverage = larger position but faster liquidation." />}
        {leverage > 0 && <Row isSmall={isSmall} label="Margin Used" value={`$${formatMoney(marginUsed)}`}    tip="The collateral committed to this trade (size ÷ leverage)." />}
        {t.marginMode && <Row isSmall={isSmall} label="Margin Mode" value={t.marginMode} tip={t.marginMode === 'CROSS' ? 'CROSS: your entire account balance backs this position. Losses can draw from other funds.' : 'ISOLATED: only the margin you set is at risk. Max loss = margin used.'} />}
        {t.liquidationPrice ? <Row isSmall={isSmall} label="Liquidation Price" value={`$${formatPrice(t.liquidationPrice)}`} valueColor="var(--pnl-down)" tip="The price at which the position would have been force-closed." /> : null}
        <Row isSmall={isSmall} label={isOpenEntry ? "Opened" : "Opened"}   value={fmtDateTime(t.openedAt)} tip="When this position was first opened." />
        {!isOpenEntry && <Row isSmall={isSmall} label="Closed"   value={fmtDateTime(t.timestamp)} tip="When this position was closed." />}
        {!isOpenEntry && <Row isSmall={isSmall} label="Duration" value={fmtDuration(durationMs)} tip="How long the position was open." />}
        <Row isSmall={isSmall} label="Order ID" value={<span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)' }}>{t.id}</span>} tip="Unique identifier for this trade." />
        {t.onChain && (t.orderlyOrderUrl || t.txHash) && (
          <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--hairline-strong)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--fg-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--pnl-up)', boxShadow: '0 0 5px var(--pnl-up)', display: 'inline-block' }} />
              On-Chain
            </span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {t.orderlyOrderUrl && <ChainLink href={t.orderlyOrderUrl} label="BaseScan" />}
              {t.txHash && t.txHash !== t.orderlyOrderUrl && <ChainLink href={`https://sepolia.basescan.org/tx/${t.txHash}`} label="BaseScan" />}
            </div>
          </div>
        )}
        {t.orderlyOrderId && (
          <Row isSmall={isSmall} label="Order ID" value={<span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)' }}>#{t.orderlyOrderId}</span>} tip="Velo Perps trade ID." />
        )}
      </>
    );
    footer = onShareHistory ? (
      <>
        <Button onClick={() => { onShareHistory(t); onClose(); }} className="flex-1 h-9 text-[11px]" variant="secondary"><Share2 size={12}/> Share</Button>
        <Button onClick={onClose} className="flex-1 h-9 text-[11px]">Close</Button>
      </>
    ) : <Button onClick={onClose} className="flex-1 h-9 text-[11px]">Close</Button>;
  }

  if (payload.kind === 'POSITION') {
    const p          = payload.item;
    const mark       = marketPrices[p.pair] || p.entryPrice;
    const pnl        = positionPnl(p, mark);
    const marginUsed = p.v4 ? p.v4.collateral + p.v4.openFee : p.leverage > 0 ? p.size / p.leverage : 0;
    const roe        = marginUsed > 0 ? (pnl / marginUsed) * 100 : 0;
    const priceMove  = p.entryPrice > 0 ? ((mark - p.entryPrice) / p.entryPrice) * 100 : 0;
    const openDurMs  = Math.max(0, Date.now() - p.timestamp);
    const pnlUp      = pnl >= 0;
    const isCross    = p.marginMode === 'CROSS';

    // Liq price + buffer — for cross use pool ratio, for isolated use stored liq price
    const displayLiqPrice = p.liquidationPrice;
    const buffer = displayLiqPrice > 0 ? Math.abs((mark - displayLiqPrice) / mark) * 100 : 0;
    const bufferColor = buffer < 5 ? 'var(--pnl-down)' : buffer < 10 ? '#f97316' : 'var(--pnl-up)';
    const bufferLabel = buffer < 2 ? 'EXTREME RISK' : buffer < 5 ? 'HIGH RISK' : buffer < 10 ? 'MEDIUM RISK' : 'LOW RISK';

    hero = (
      <div style={{ padding: heroPadding, borderBottom: '1px solid var(--hairline-strong)', textAlign: 'center', background: pnlUp ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)' }}>
        <div style={{ ...S.label, fontSize: 10, marginBottom: 4, color: 'var(--fg-muted)' }}>Unrealized PnL</div>
        <div style={{ ...S.mono, fontSize: isSmall ? 26 : 30, fontWeight: 700, color: pnlUp ? 'var(--pnl-up)' : 'var(--pnl-down)' }}>
          {pnlUp ? '+' : ''}${<AnimatedText text={formatMoney(pnl)}/>}
        </div>
        <div style={{ ...S.mono, fontSize: 11, color: pnlUp ? 'var(--pnl-up)' : 'var(--pnl-down)', marginTop: 3, opacity: 0.85 }}>
          {pnlUp ? '+' : ''}{<AnimatedText text={roe.toFixed(2)}/>}% ROE
        </div>
        {/* Buffer bar in hero */}
        <div className="trade-details-buffer" style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', marginTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px 16px', marginBottom: 6 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--fg-subtle)' }}>Liq. Buffer</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: bufferColor, marginLeft: 'auto', whiteSpace: 'nowrap' }}>{<AnimatedText text={buffer.toFixed(1)}/>}% · {bufferLabel}</span>
          </div>
          <div style={{ height: 4, borderRadius: 3, background: 'var(--hairline-strong)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, buffer * 5)}%`, background: bufferColor, borderRadius: 3, transition: 'width 0.3s' }} />
          </div>
        </div>
      </div>
    );
    body = (
      <>
        <Row isSmall={isSmall} label="Entry Price"       value={p.entryPrice < 0.001 ? 'Corrupt (stale oracle)' : `$${formatPrice(p.entryPrice)}`} valueColor={p.entryPrice < 0.001 ? 'var(--pnl-down)' : 'var(--fg)'} tip="Entry price. A warning means the position was opened with stale Pyth data — close it." />
        <Row isSmall={isSmall} label="Mark Price"        value={`$${formatPrice(mark)}`}          tip="Current fair-value price used to calculate PnL and liquidation. Updates every tick." />
        <Row isSmall={isSmall} label="Price Change"      value={`${priceMove >= 0 ? '+' : ''}${priceMove.toFixed(3)}%`} valueColor={priceMove >= 0 ? 'var(--pnl-up)' : 'var(--pnl-down)'} tip="% move in mark price since entry." />
        <Row isSmall={isSmall} label="Liquidation Price" value={`$${formatPrice(displayLiqPrice)}`} valueColor={bufferColor}
           tip={isCross
             ? `CROSS mode: estimated price at which your shared margin pool would be exhausted. Your entire account balance protects this position — the liq. price shifts as other positions' PnL changes.`
             : `ISOLATED mode: if mark price reaches this level, your position is force-closed and you lose the margin committed (${formatMoney(marginUsed)} mUSDC). Only this position's margin is at risk.`} />
        <Row isSmall={isSmall} label="Liq. Buffer"       value={`${buffer.toFixed(2)}%`} valueColor={bufferColor}
           tip={isCross
             ? `Distance between current price and estimated liquidation price as a % of mark price. CROSS: reflects shared pool health — all cross positions contribute. ${buffer < 10 ? 'Consider reducing exposure.' : ''}`
             : `How far price must move before liquidation triggers. ${buffer < 5 ? 'Very close — consider reducing exposure or closing.' : buffer < 10 ? 'Moderate risk.' : 'Safe distance.'}`} />
        <Row isSmall={isSmall} label="Position Size"     value={`$${formatMoney(p.size)}`}        tip="Total notional value of your position (margin × leverage). This is the actual exposure, not just the collateral." />
        <Row isSmall={isSmall} label="Leverage"          value={`${p.leverage}×`}                 tip={`${p.leverage}× leverage means a 1% price move = ${p.leverage}% gain or loss on your margin.`} />
        <Row isSmall={isSmall} label="Margin Used"       value={`$${formatMoney(marginUsed)}`}    tip={isCross ? "Margin committed from your account to back this position. In CROSS mode, your full balance can cover losses beyond this amount." : "Maximum you can lose on this position. In ISOLATED mode, losses are capped at this amount."} />
        <Row isSmall={isSmall} label="Margin Mode"       value={<span style={{ color: isCross ? 'var(--iris-violet)' : 'oklch(0.78 0.18 150)' }}>{p.marginMode}</span>}
           tip={isCross
             ? "CROSS: your entire account balance backs this position. Gains on other positions help avoid liquidation here, but losses can consume your whole balance."
             : "ISOLATED: only the margin you assigned is at risk. This position can't draw on your other funds — max loss is capped at the margin used."} />
        <Row isSmall={isSmall} label="Take Profit"       value={p.takeProfit && p.takeProfit > 0.00001 ? `$${formatPrice(p.takeProfit)}` : '—'} valueColor={p.takeProfit && p.takeProfit > 0.00001 ? 'var(--pnl-up)' : 'var(--fg)'} tip="Your position auto-closes in profit when mark price hits this level." />
        <Row isSmall={isSmall} label="Stop Loss"         value={p.stopLoss && p.stopLoss > 0.00001   ? `$${formatPrice(p.stopLoss)}`   : '—'} valueColor={p.stopLoss && p.stopLoss > 0.00001   ? 'var(--pnl-down)' : 'var(--fg)'} tip="Your position auto-closes at a loss when mark price hits this level, protecting against further downside." />
        <Row isSmall={isSmall} label="Opened"            value={fmtDateTime(p.timestamp)} tip="When this position was opened." />
        <Row isSmall={isSmall} label="Open Duration"     value={fmtDuration(openDurMs)} tip="How long this position has been open." />
        <Row isSmall={isSmall} label="Position ID"       value={<span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)' }}>{p.id}</span>} tip="Unique identifier for this position." />
        {p.onChain && (
          <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--hairline-strong)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--fg-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--pnl-up)', boxShadow: '0 0 5px var(--pnl-up)', display: 'inline-block' }} />
              On-Chain · Velo Perps
            </span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {(p as any).orderlyOrderUrl
                ? <ChainLink href={(p as any).orderlyOrderUrl} label="View TX" />
                : <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-subtle)' }}>—</span>}
            </div>
          </div>
        )}
        {p.id?.startsWith('velo_') && (
          <Row isSmall={isSmall} label="Trade ID" value={<span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)' }}>#{p.id.slice(5)}</span>} tip="Velo Perps on-chain trade ID." />
        )}
      </>
    );
    footer = (
      <>
        <Button onClick={() => { onEditPosition(p); onClose(); }} className="flex-1 h-9 text-[11px]" variant="secondary">Edit TP/SL</Button>
        <Button
          onClick={() => { onClosePosition(p.id); onClose(); }}
          className="flex-1 h-9 text-[11px]"
          variant="danger"
          disabled={!!p.copyTraderId}
        >{p.copyTraderId ? 'Copy Trade' : 'Close Position'}</Button>
      </>
    );
  }

  if (payload.kind === 'ORDER') {
    const o           = payload.item;
    const mark        = marketPrices[o.pair] || o.price;
    const leverage    = o.leverage || 0;
    const marginUsed  = leverage > 0 ? o.size / leverage : 0;
    const distance    = mark > 0 ? ((o.price - mark) / mark) * 100 : 0;
    const placedDurMs = Math.max(0, Date.now() - o.timestamp);
    const isTpSl      = o.type === 'TAKE_PROFIT' || o.type === 'STOP_LOSS';

    hero = (
      <div style={{ padding: heroPadding, borderBottom: '1px solid var(--hairline-strong)', textAlign: 'center', background: 'color-mix(in oklab, var(--accent) 7%, transparent)' }}>
        <div style={{ ...S.label, fontSize: 10, marginBottom: 4, color: 'var(--fg-muted)' }}>{o.type.replace('_', ' ')} Trigger</div>
        <div style={{ ...S.mono, fontSize: isSmall ? 26 : 30, fontWeight: 700, color: 'var(--fg)' }}>
          ${<AnimatedText text={formatPrice(o.price)}/>}
        </div>
        <div style={{ ...S.mono, fontSize: 11, color: 'var(--fg-muted)', marginTop: 3 }}>
          {distance >= 0 ? '+' : ''}{<AnimatedText text={distance.toFixed(3)}/>}% from mark
        </div>
      </div>
    );
    body = (
      <>
        <Row isSmall={isSmall} label="Order Type"    value={o.type.replace('_', ' ')} tip={isTpSl ? "Conditional order that triggers automatically when mark price reaches the trigger price." : "Limit or stop order waiting to be filled at the specified price."} />
        <Row isSmall={isSmall} label="Trigger Price" value={`$${formatPrice(o.price)}`} tip="The price at which this order will execute." />
        <Row isSmall={isSmall} label="Mark Price"    value={`$${formatPrice(mark)}`} tip="Current fair-value price. When mark reaches the trigger price, this order fires." />
        <Row isSmall={isSmall} label="Distance"      value={`${distance >= 0 ? '+' : ''}${distance.toFixed(3)}%`} valueColor={distance >= 0 ? 'var(--pnl-up)' : 'var(--pnl-down)'} tip="How far mark price is from the trigger. Negative = price needs to fall to trigger." />
        <Row isSmall={isSmall} label="Size"          value={`$${formatMoney(o.size)}`} tip="Notional size of the order that will execute." />
        {leverage > 0  && <Row isSmall={isSmall} label="Leverage"    value={`${leverage}×`} tip={`${leverage}× leverage on this order.`} />}
        {!isTpSl && leverage > 0 && <Row isSmall={isSmall} label="Margin Reserved" value={`$${formatMoney(marginUsed)}`} tip="Margin that will be locked when this order fills." />}
        {isTpSl && <Row isSmall={isSmall} label="Margin Reserved" value="—" tip="TP/SL orders close an existing position — no additional margin is reserved." />}
        <Row isSmall={isSmall} label="Placed"  value={fmtDateTime(o.timestamp)} tip="When this order was placed." />
        <Row isSmall={isSmall} label="Waiting" value={fmtDuration(placedDurMs)} tip="How long this order has been waiting to fill." />
        {o.relatedPositionId && <Row isSmall={isSmall} label="Linked Position" value={<span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)' }}>{o.relatedPositionId}</span>} tip="The position this TP/SL order is linked to." />}
        <Row isSmall={isSmall} label="Order ID" value={<span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)' }}>{o.id}</span>} tip="Unique identifier for this order." />
      </>
    );
    footer = (
      <>
        <Button onClick={onClose} className="flex-1 h-9 text-[11px]" variant="secondary">Back</Button>
        <Button
          onClick={() => { handleCancelOrder(o.id); onClose(); }}
          className="flex-1 h-9 text-[11px]"
          variant="danger"
          disabled={!!o.copyTraderId}
        >{o.copyTraderId ? 'Copy Trade' : 'Cancel Order'}</Button>
      </>
    );
  }

  if (payload.kind === 'TRANSACTION') {
    const tx = payload.item;
    const isDeposit  = tx.type === 'DEPOSIT';
    const isWithdraw = tx.type === 'WITHDRAW';
    const isSend     = tx.type === 'SEND';
    const isReceive  = tx.type === 'RECEIVE';
    const isInflow   = isDeposit || isReceive;
    // Hero header label per type.
    const heroLabel = isDeposit  ? 'Amount Deposited'
                    : isWithdraw ? 'Amount Withdrawn'
                    : isReceive  ? 'Amount Received'
                    :              'Amount Sent';
    // Row tip for the Type cell.
    const typeTip = isDeposit  ? 'Funds added to your trading account.'
                  : isWithdraw ? 'Funds withdrawn from your trading account.'
                  : isReceive  ? 'mUSDC received from another Velo wallet.'
                  :              'mUSDC sent to another Velo wallet.';
    // "From" / "To" label for the counterparty row. The activity feed already
    // stores `counterparty` as a display string (@handle or short address).
    const counterpartyLabel = isSend    ? 'To'
                            : isReceive ? 'From'
                            :             null;
    hero = (
      <div style={{ padding: heroPadding, borderBottom: '1px solid var(--hairline-strong)', textAlign: 'center', background: isInflow ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)' }}>
        <div style={{ ...S.label, fontSize: 10, marginBottom: 4, color: 'var(--fg-muted)' }}>{heroLabel}</div>
        <div style={{ ...S.mono, fontSize: isSmall ? 26 : 30, fontWeight: 700, color: isInflow ? 'var(--pnl-up)' : 'var(--pnl-down)' }}>
          {isInflow ? '+' : '-'}${<AnimatedText text={formatMoney(tx.amount)}/>}
        </div>
        {tx.counterparty && (
          <div style={{ ...S.mono, fontSize: 11, color: 'var(--fg-muted)', marginTop: 6 }}>
            {isSend ? '→ ' : isReceive ? '← ' : ''}{tx.counterparty}
          </div>
        )}
      </div>
    );
    body = (
      <>
        <Row isSmall={isSmall} label="Type"      value={tx.type}                  tip={typeTip} />
        <Row isSmall={isSmall} label="Amount"    value={`$${formatMoney(tx.amount)}`} valueColor={isInflow ? 'var(--pnl-up)' : 'var(--pnl-down)'} tip="The amount transferred." />
        {counterpartyLabel && tx.counterparty && (
          <Row isSmall={isSmall} label={counterpartyLabel} value={
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg)' }}>{tx.counterparty}</span>
          } tip={isSend ? 'Recipient address or @handle.' : 'Sender address or @handle.'} />
        )}
        <Row isSmall={isSmall} label="Status"    value={tx.status || 'COMPLETED'} valueColor="var(--pnl-up)" tip="Current status of this transaction." />
        <Row isSmall={isSmall} label="Time"      value={fmtDateTime(tx.timestamp)} tip="When this transaction was processed." />
        <Row isSmall={isSmall} label="Transaction ID" value={<span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)' }}>{tx.id}</span>} tip="Unique identifier for this transaction." />
        {tx.onChain && tx.txHash && (() => {
          // Faucet credits use the format `faucet:<address>` (no real BaseScan tx
          // — the faucet is server-side). Link to BaseScan's address page for
          // the burner wallet so the user can see their on-chain identity and
          // any vault interactions. Real deposits/sends are 0x tx hashes — link to
          // BaseScan tx page directly.
          const isFaucet = tx.txHash.startsWith('faucet:');
          const addr = isFaucet ? tx.txHash.slice('faucet:'.length) : null;
          const href = isFaucet
            ? `https://sepolia.basescan.org/address/${addr}`
            : `https://sepolia.basescan.org/tx/${tx.txHash}`;
          const label = 'View on BaseScan';
          const proofLabel = isFaucet ? 'Velo Faucet (Testnet)' : 'On-Chain';
          return (
            <>
              <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--hairline-strong)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--fg-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--pnl-up)', boxShadow: '0 0 5px var(--pnl-up)', display: 'inline-block' }} />
                  {proofLabel}
                </span>
                <ChainLink href={href} label={label} />
              </div>
              {!isFaucet && (
                <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--hairline-strong)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--fg-muted)' }}>TX Hash</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)' }}>{tx.txHash.slice(0, 10)}…{tx.txHash.slice(-8)}</span>
                </div>
              )}
            </>
          );
        })()}
      </>
    );
    footer = <Button onClick={onClose} className="flex-1 h-9 text-[11px]">Close</Button>;
  }

  const facts = React.Children.toArray((body as React.ReactElement<{children:React.ReactNode}>).props.children).filter(Boolean);
  const summaryLabels = new Set(['Entry Price','Mark Price','Liquidation Price','Position Size','Leverage','Margin Used','Take Profit','Stop Loss','Trigger Price','Size','Margin Reserved','Amount','Type','Status','Time']);
  const isSummary = (node:React.ReactNode) => React.isValidElement<{label?:string}>(node) && node.type === Row && summaryLabels.has(node.props.label || '');
  const primary = facts.filter(isSummary), details = facts.filter(node=>!isSummary(node));
  const status = payload.kind === 'POSITION' ? 'Open' : payload.kind === 'ORDER' ? 'Pending' : payload.kind === 'HISTORY' ? payload.item.action === 'OPEN' ? 'Opened' : payload.item.action === 'LIQUIDATION' ? 'Liquidated' : 'Closed' : payload.item.status || 'Completed';
  return <TradingDialog open={!!payload} onClose={onClose} title={headerPair} className="trade-details-dialog" footer={footer} identity={<>
    <span className="trade-details-side" data-up={sideUp}>{headerSide}</span><span className="trade-details-status"><i/>{status}</span>{copyId && <span>Copy trade</span>}<span className="trade-details-network"><ShieldCheck size={12}/> Base Sepolia</span></>}>
      {React.isValidElement(hero) ? React.cloneElement(hero as React.ReactElement<{className:string;style:React.CSSProperties}>,{className:'trade-details-hero trade-dialog-hero',style:{}}) : hero}
      <div className="trade-details-facts">{primary}</div>
      {details.length > 0 && <section className="trade-details-more">
        <button type="button" aria-expanded={expanded} aria-controls="trade-execution-facts" onClick={()=>setExpanded(!expanded)}>
          <span>Execution details</span><ChevronDown size={16} style={{transform:expanded?'rotate(180deg)':'none'}}/>
        </button>
        <AnimatedPanel activeKey={expanded ? 'details' : 'market'}><div id="trade-execution-facts" className="trade-details-facts trade-details-facts--execution">{details}</div></AnimatedPanel>
      </section>}
  </TradingDialog>;
};

import { positionPnl } from '@/services/positionValuation.mjs';
