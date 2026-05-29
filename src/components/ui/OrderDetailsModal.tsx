import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Copy, X, Info, ExternalLink, Share2 } from 'lucide-react';
import { Button, formatMoney, formatPrice } from '@/components/ui/shared';
import { Position, OpenOrder, TradeHistoryItem, Transaction } from '@/utils/types';

const S = {
  display: { fontFamily: 'var(--font-display)', fontStyle: 'italic' as const, letterSpacing: '-0.02em' },
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
      border: '1px solid oklch(0.68 0.22 295/0.35)',
      background: 'oklch(0.68 0.22 295/0.08)',
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

// Row tooltip — anchored to the label via getBoundingClientRect so it never
// moves while visible. Enter/leave timers bridge the gap between the trigger
// and the tooltip so the cursor can travel between them without dismissal.
const Row = ({
  label, value, valueColor, tip, isSmall,
}: {
  label: string; value: React.ReactNode; valueColor?: string; tip?: string; isSmall: boolean;
}) => {
  const TOOLTIP_W = 260;
  const [rect, setRect] = React.useState<DOMRect | null>(null);
  const [hovered, setHovered] = React.useState(false);
  const triggerRef = React.useRef<HTMLDivElement>(null);
  const showTimer  = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer  = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
    showTimer.current = setTimeout(() => {
      if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
      setHovered(true);
    }, 60);
  };
  const hide = () => {
    if (showTimer.current) { clearTimeout(showTimer.current); showTimer.current = null; }
    hideTimer.current = setTimeout(() => { setRect(null); setHovered(false); }, 100);
  };

  React.useEffect(() => () => {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  const left = rect ? Math.min(Math.max(rect.left + rect.width / 2, TOOLTIP_W / 2 + 8), window.innerWidth - TOOLTIP_W / 2 - 8) : 0;
  const top  = rect ? rect.top - 10 : 0;

  return (
    <div
      onMouseEnter={tip ? show : undefined}
      onMouseLeave={tip ? hide : undefined}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: isSmall ? '9px 14px' : '10px 18px',
        borderBottom: '1px solid var(--hairline-strong)',
        gap: 12,
        transition: 'background 0.1s',
        background: hovered && tip ? 'var(--chip-bg)' : 'transparent',
        cursor: 'default',
        position: 'relative',
      }}
    >
      <div ref={triggerRef} style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--fg-muted)',
        }}>{label}</span>
        {tip && <Info size={9} style={{ color: 'var(--fg-subtle)', opacity: hovered ? 1 : 0.45, transition: 'opacity 0.1s', flexShrink: 0 }} />}
      </div>
      <span style={{
        fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1',
        fontVariantNumeric: 'tabular-nums', fontSize: 12, fontWeight: 600,
        color: valueColor || 'var(--fg)', textAlign: 'right', wordBreak: 'break-word' as const,
      }}>{value}</span>

      {tip && rect && ReactDOM.createPortal(
        <div
          onMouseEnter={show}
          onMouseLeave={hide}
          style={{
            position: 'fixed',
            left,
            top,
            transform: 'translate(-50%, -100%)',
            background: 'var(--glass-bg-strong)',
            border: '1px solid var(--hairline-strong)',
            borderRadius: 8,
            padding: '7px 11px',
            fontFamily: 'var(--font-sans, sans-serif)',
            fontSize: 11,
            fontWeight: 400,
            color: 'var(--fg)',
            boxShadow: 'var(--glass-shadow)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            zIndex: 99999,
            pointerEvents: 'auto',
            maxWidth: 260,
            whiteSpace: 'normal',
            lineHeight: 1.5,
            textTransform: 'none' as const,
            fontStyle: 'normal',
            letterSpacing: 0,
          }}>
          {tip}
          <div style={{
            position: 'absolute', top: '100%', left: '50%',
            transform: 'translateX(-50%)',
            width: 0, height: 0,
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderTop: '5px solid var(--glass-bg-strong)',
          }} />
        </div>,
        document.body
      )}
    </div>
  );
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

  useEffect(() => {
    setMounted(true);
    const check = () => setIsSmall(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (!payload) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [payload, onClose]);

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

  const R = (props: { label: string; value: React.ReactNode; valueColor?: string; tip?: string }) =>
    <Row {...props} isSmall={isSmall} />;

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
    const leverage   = t.leverage || 0;
    const marginUsed = leverage > 0 ? t.size / leverage : 0;
    const pnlPct     = marginUsed > 0 ? (t.pnl / marginUsed) * 100 : 0;
    const priceMove  = t.entryPrice > 0 ? ((t.exitPrice - t.entryPrice) / t.entryPrice) * 100 : 0;
    const durationMs = t.openedAt ? Math.max(0, t.timestamp - t.openedAt) : 0;
    const pnlUp      = t.pnl >= 0;

    hero = (
      <div style={{ padding: heroPadding, borderBottom: '1px solid var(--hairline-strong)', textAlign: 'center', background: pnlUp ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)' }}>
        <div style={{ ...S.label, fontSize: 10, marginBottom: 4, color: 'var(--fg-muted)' }}>Realized PnL</div>
        <div style={{ ...S.mono, fontSize: isSmall ? 26 : 30, fontWeight: 700, color: pnlUp ? 'var(--pnl-up)' : 'var(--pnl-down)' }}>
          {pnlUp ? '+' : ''}${formatMoney(t.pnl)}
        </div>
        {marginUsed > 0 && (
          <div style={{ ...S.mono, fontSize: 11, color: pnlUp ? 'var(--pnl-up)' : 'var(--pnl-down)', marginTop: 3, opacity: 0.85 }}>
            {pnlUp ? '+' : ''}{pnlPct.toFixed(2)}% on margin
          </div>
        )}
      </div>
    );
    body = (
      <>
        <R label="Entry Price"   value={`$${formatPrice(t.entryPrice)}`}   tip="The average price at which this position was opened." />
        <R label="Exit Price"    value={`$${formatPrice(t.exitPrice)}`}    tip="The price at which the position was closed." />
        <R label="Price Change"  value={`${priceMove >= 0 ? '+' : ''}${priceMove.toFixed(3)}%`} valueColor={priceMove >= 0 ? 'var(--pnl-up)' : 'var(--pnl-down)'} tip="% move in price from entry to exit." />
        <R label="Position Size" value={`$${formatMoney(t.size)}`}         tip="Total notional value of the position (margin × leverage)." />
        {leverage > 0 && <R label="Leverage"    value={`${leverage}×`}                   tip="Multiplier applied to your margin. Higher leverage = larger position but faster liquidation." />}
        {leverage > 0 && <R label="Margin Used" value={`$${formatMoney(marginUsed)}`}    tip="The collateral committed to this trade (size ÷ leverage)." />}
        {t.marginMode && <R label="Margin Mode" value={t.marginMode} tip={t.marginMode === 'CROSS' ? 'CROSS: your entire account balance backs this position. Losses can draw from other funds.' : 'ISOLATED: only the margin you set is at risk. Max loss = margin used.'} />}
        {t.liquidationPrice ? <R label="Liquidation Price" value={`$${formatPrice(t.liquidationPrice)}`} valueColor="var(--pnl-down)" tip="The price at which the position would have been force-closed." /> : null}
        <R label="Opened"   value={fmtDateTime(t.openedAt)} tip="When this position was first opened." />
        <R label="Closed"   value={fmtDateTime(t.timestamp)} tip="When this position was closed." />
        <R label="Duration" value={fmtDuration(durationMs)} tip="How long the position was open." />
        <R label="Order ID" value={<span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)' }}>{t.id}</span>} tip="Unique identifier for this trade." />
        {t.onChain && (
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
          <R label="Order ID" value={<span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)' }}>#{t.orderlyOrderId}</span>} tip="Velo Perps trade ID." />
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
    const pnl        = (mark - p.entryPrice) * (p.side === 'LONG' ? 1 : -1) * (p.size / p.entryPrice);
    const marginUsed = p.leverage > 0 ? p.size / p.leverage : 0;
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
          {pnlUp ? '+' : ''}${formatMoney(pnl)}
        </div>
        <div style={{ ...S.mono, fontSize: 11, color: pnlUp ? 'var(--pnl-up)' : 'var(--pnl-down)', marginTop: 3, opacity: 0.85 }}>
          {pnlUp ? '+' : ''}{roe.toFixed(2)}% ROE
        </div>
        {/* Buffer bar in hero */}
        <div style={{ marginTop: 10, padding: '0 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--fg-subtle)' }}>Liq. Buffer</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: bufferColor }}>{buffer.toFixed(1)}% · {bufferLabel}</span>
          </div>
          <div style={{ height: 4, borderRadius: 3, background: 'var(--hairline-strong)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, buffer * 5)}%`, background: bufferColor, borderRadius: 3, transition: 'width 0.3s' }} />
          </div>
        </div>
      </div>
    );
    body = (
      <>
        <R label="Entry Price"       value={p.entryPrice < 0.001 ? 'Corrupt (stale oracle)' : `$${formatPrice(p.entryPrice)}`} valueColor={p.entryPrice < 0.001 ? 'var(--pnl-down)' : 'var(--fg)'} tip="Entry price. A warning means the position was opened with stale Pyth data — close it." />
        <R label="Mark Price"        value={`$${formatPrice(mark)}`}          tip="Current fair-value price used to calculate PnL and liquidation. Updates every tick." />
        <R label="Price Change"      value={`${priceMove >= 0 ? '+' : ''}${priceMove.toFixed(3)}%`} valueColor={priceMove >= 0 ? 'var(--pnl-up)' : 'var(--pnl-down)'} tip="% move in mark price since entry." />
        <R label="Liquidation Price" value={`$${formatPrice(displayLiqPrice)}`} valueColor={bufferColor}
           tip={isCross
             ? `CROSS mode: estimated price at which your shared margin pool would be exhausted. Your entire account balance protects this position — the liq. price shifts as other positions' PnL changes.`
             : `ISOLATED mode: if mark price reaches this level, your position is force-closed and you lose the margin committed (${formatMoney(marginUsed)} USDT). Only this position's margin is at risk.`} />
        <R label="Liq. Buffer"       value={`${buffer.toFixed(2)}%`} valueColor={bufferColor}
           tip={isCross
             ? `Distance between current price and estimated liquidation price as a % of mark price. CROSS: reflects shared pool health — all cross positions contribute. ${buffer < 10 ? 'Consider reducing exposure.' : ''}`
             : `How far price must move before liquidation triggers. ${buffer < 5 ? 'Very close — consider adding margin or closing.' : buffer < 10 ? 'Moderate risk.' : 'Safe distance.'}`} />
        <R label="Position Size"     value={`$${formatMoney(p.size)}`}        tip="Total notional value of your position (margin × leverage). This is the actual exposure, not just the collateral." />
        <R label="Leverage"          value={`${p.leverage}×`}                 tip={`${p.leverage}× leverage means a 1% price move = ${p.leverage}% gain or loss on your margin.`} />
        <R label="Margin Used"       value={`$${formatMoney(marginUsed)}`}    tip={isCross ? "Margin committed from your account to back this position. In CROSS mode, your full balance can cover losses beyond this amount." : "Maximum you can lose on this position. In ISOLATED mode, losses are capped at this amount."} />
        <R label="Margin Mode"       value={<span style={{ color: isCross ? 'var(--iris-violet)' : 'oklch(0.78 0.18 150)' }}>{p.marginMode}</span>}
           tip={isCross
             ? "CROSS: your entire account balance backs this position. Gains on other positions help avoid liquidation here, but losses can consume your whole balance."
             : "ISOLATED: only the margin you assigned is at risk. This position can't draw on your other funds — max loss is capped at the margin used."} />
        <R label="Take Profit"       value={p.takeProfit && p.takeProfit > 0.00001 ? `$${formatPrice(p.takeProfit)}` : '—'} valueColor={p.takeProfit && p.takeProfit > 0.00001 ? 'var(--pnl-up)' : 'var(--fg)'} tip="Your position auto-closes in profit when mark price hits this level." />
        <R label="Stop Loss"         value={p.stopLoss && p.stopLoss > 0.00001   ? `$${formatPrice(p.stopLoss)}`   : '—'} valueColor={p.stopLoss && p.stopLoss > 0.00001   ? 'var(--pnl-down)' : 'var(--fg)'} tip="Your position auto-closes at a loss when mark price hits this level, protecting against further downside." />
        <R label="Opened"            value={fmtDateTime(p.timestamp)} tip="When this position was opened." />
        <R label="Open Duration"     value={fmtDuration(openDurMs)} tip="How long this position has been open." />
        <R label="Position ID"       value={<span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)' }}>{p.id}</span>} tip="Unique identifier for this position." />
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
          <R label="Trade ID" value={<span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)' }}>#{p.id.slice(5)}</span>} tip="Velo Perps on-chain trade ID." />
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
      <div style={{ padding: heroPadding, borderBottom: '1px solid var(--hairline-strong)', textAlign: 'center', background: 'rgba(107,70,255,0.06)' }}>
        <div style={{ ...S.label, fontSize: 10, marginBottom: 4, color: 'var(--fg-muted)' }}>{o.type.replace('_', ' ')} Trigger</div>
        <div style={{ ...S.mono, fontSize: isSmall ? 26 : 30, fontWeight: 700, color: 'var(--fg)' }}>
          ${formatPrice(o.price)}
        </div>
        <div style={{ ...S.mono, fontSize: 11, color: 'var(--fg-muted)', marginTop: 3 }}>
          {distance >= 0 ? '+' : ''}{distance.toFixed(3)}% from mark
        </div>
      </div>
    );
    body = (
      <>
        <R label="Order Type"    value={o.type.replace('_', ' ')} tip={isTpSl ? "Conditional order that triggers automatically when mark price reaches the trigger price." : "Limit or stop order waiting to be filled at the specified price."} />
        <R label="Trigger Price" value={`$${formatPrice(o.price)}`} tip="The price at which this order will execute." />
        <R label="Mark Price"    value={`$${formatPrice(mark)}`} tip="Current fair-value price. When mark reaches the trigger price, this order fires." />
        <R label="Distance"      value={`${distance >= 0 ? '+' : ''}${distance.toFixed(3)}%`} valueColor={distance >= 0 ? 'var(--pnl-up)' : 'var(--pnl-down)'} tip="How far mark price is from the trigger. Negative = price needs to fall to trigger." />
        <R label="Size"          value={`$${formatMoney(o.size)}`} tip="Notional size of the order that will execute." />
        {leverage > 0  && <R label="Leverage"    value={`${leverage}×`} tip={`${leverage}× leverage on this order.`} />}
        {!isTpSl && leverage > 0 && <R label="Margin Reserved" value={`$${formatMoney(marginUsed)}`} tip="Margin that will be locked when this order fills." />}
        {isTpSl && <R label="Margin Reserved" value="—" tip="TP/SL orders close an existing position — no additional margin is reserved." />}
        <R label="Placed"  value={fmtDateTime(o.timestamp)} tip="When this order was placed." />
        <R label="Waiting" value={fmtDuration(placedDurMs)} tip="How long this order has been waiting to fill." />
        {o.relatedPositionId && <R label="Linked Position" value={<span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)' }}>{o.relatedPositionId}</span>} tip="The position this TP/SL order is linked to." />}
        <R label="Order ID" value={<span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)' }}>{o.id}</span>} tip="Unique identifier for this order." />
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
          {isInflow ? '+' : '-'}${formatMoney(tx.amount)}
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
        <R label="Type"      value={tx.type}                  tip={typeTip} />
        <R label="Amount"    value={`$${formatMoney(tx.amount)}`} valueColor={isInflow ? 'var(--pnl-up)' : 'var(--pnl-down)'} tip="The amount transferred." />
        {counterpartyLabel && tx.counterparty && (
          <R label={counterpartyLabel} value={
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg)' }}>{tx.counterparty}</span>
          } tip={isSend ? 'Recipient address or @handle.' : 'Sender address or @handle.'} />
        )}
        <R label="Status"    value={tx.status || 'COMPLETED'} valueColor="var(--pnl-up)" tip="Current status of this transaction." />
        <R label="Time"      value={fmtDateTime(tx.timestamp)} tip="When this transaction was processed." />
        <R label="Transaction ID" value={<span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)' }}>{tx.id}</span>} tip="Unique identifier for this transaction." />
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

  const overlay = (
    <div
      className="animate-fade-in"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 120,
        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        display: 'flex', alignItems: isSmall ? 'flex-end' : 'center', justifyContent: 'center',
        padding: isSmall ? 0 : 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: isSmall ? '100%' : 460,
          maxHeight: isSmall ? '92dvh' : '88vh',
          display: 'flex', flexDirection: 'column',
          borderRadius: isSmall ? '24px 24px 0 0' : 24,
          background: 'var(--glass-bg-strong)',
          border: '1px solid var(--glass-border)',
          boxShadow: '0 32px 96px -16px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.04) inset',
          backdropFilter: 'blur(40px) saturate(1.35)',
          WebkitBackdropFilter: 'blur(40px) saturate(1.35)',
          overflow: 'hidden', position: 'relative',
        }}
      >
        {/* Brand accent top line */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--holo-linear)', backgroundSize: '220% 100%', animation: 'holoSlide 9s linear infinite', zIndex: 1 }} />

        {/* Header */}
        <div style={{
          padding: isSmall ? '16px 14px 12px' : '16px 18px 14px',
          borderBottom: '1px solid var(--hairline-strong)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexShrink: 0,
          paddingTop: isSmall ? 20 : 18,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap' as const }}>
            <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: isSmall ? 20 : 22, color: 'var(--fg)', letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
              {headerPair}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 6, background: sideUp ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: sideUp ? 'var(--pnl-up)' : 'var(--pnl-down)', border: `1px solid ${sideUp ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)'}` }}>{headerSide}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, padding: '3px 7px', borderRadius: 6, background: 'var(--chip-bg)', color: 'var(--fg-muted)', border: '1px solid var(--hairline-strong)' }}>{payload.kind === 'HISTORY' ? 'CLOSED' : payload.kind === 'POSITION' ? 'OPEN' : payload.kind === 'TRANSACTION' ? payload.item.type : 'PENDING'}</span>
            {copyId && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, padding: '3px 7px', borderRadius: 6, background: 'rgba(107,70,193,0.12)', color: 'var(--iris-violet)', border: '1px solid rgba(107,70,193,0.3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Copy size={9}/> COPY
              </span>
            )}
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'var(--chip-bg)', border: '1px solid var(--hairline-strong)', cursor: 'pointer', color: 'var(--fg-muted)', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, flexShrink: 0, transition: 'background 0.12s' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--chip-bg-hover)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--chip-bg)'; }}>
            <X size={14}/>
          </button>
        </div>

        {hero}

        <div className="custom-scrollbar" style={{ overflowY: 'auto', flex: 1, minHeight: 0, background: 'transparent', paddingBottom: 4 }}>
          {body}
        </div>

        <div style={{ padding: isSmall ? '12px 14px calc(12px + env(safe-area-inset-bottom))' : '12px 18px', borderTop: '1px solid var(--hairline-strong)', display: 'flex', gap: 8, flexShrink: 0, background: 'var(--bg-base-2)' }}>
          {footer}
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(overlay, document.body);
};

