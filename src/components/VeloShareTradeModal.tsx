/**
 * VeloShareTradeModal — appears after a successful on-chain close to invite
 * the user to share their trade to the feed. Has a default text and a button.
 */
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, ExternalLink, Share2, X } from 'lucide-react';

const S = {
  display: { fontFamily: 'var(--font-display)', fontStyle: 'italic' as const, letterSpacing: '-0.02em' },
  mono:    { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1', fontVariantNumeric: 'tabular-nums' as const },
  sans:    { fontFamily: 'var(--font-sans)' },
  label:   { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)' } as React.CSSProperties,
};

const cardStyle: React.CSSProperties = {
  width: 'min(420px, calc(100vw - 32px))',
  background: 'var(--glass-bg-strong)',
  border: '1px solid var(--glass-border)',
  borderRadius: 24,
  boxShadow: '0 32px 96px -16px rgba(0, 0, 0, 0.6), 0 1px 0 rgba(255,255,255,0.04) inset',
  backdropFilter: 'blur(40px) saturate(1.35)',
  WebkitBackdropFilter: 'blur(40px) saturate(1.35)',
  position: 'relative',
  overflow: 'hidden',
};

const holoGradient: React.CSSProperties = {
  position: 'absolute',
  top: 0, left: 0, right: 0,
  height: 2,
  background: 'linear-gradient(90deg, var(--iris-violet), var(--iris-magenta), var(--iris-coral), var(--iris-amber))',
  opacity: 0.9, zIndex: 1,
};

export interface ClosedTradeShareData {
  pair: string;            // e.g. "BTC/USD"
  side: 'LONG' | 'SHORT';
  leverage: number;
  pnlUSDC: number;
  entryPrice: number;
  exitPrice: number;
  collateralUSDC: number;
  txHash: `0x${string}`;
}

interface Props {
  isOpen: boolean;
  trade: ClosedTradeShareData | null;
  onClose: () => void;
  onShare: (content: string, tradeSignal: any) => void;
}

export const VeloShareTradeModal: React.FC<Props> = ({ isOpen, trade, onClose, onShare }) => {
  const [content, setContent] = useState('');

  React.useEffect(() => {
    if (!isOpen || !trade) return;
    const ticker = trade.pair.split('/')[0];
    const pnlStr = trade.pnlUSDC >= 0 ? `+$${trade.pnlUSDC.toFixed(2)}` : `-$${Math.abs(trade.pnlUSDC).toFixed(2)}`;
    const verb = trade.pnlUSDC >= 0 ? 'Booked' : 'Closed';
    setContent(`${verb} ${trade.side} ${trade.leverage}× $${ticker} for ${pnlStr}`);
  }, [isOpen, trade]);

  if (!isOpen || !trade) return null;

  const isWin = trade.pnlUSDC >= 0;
  const pnlPct = (trade.pnlUSDC / Math.max(trade.collateralUSDC, 0.01)) * 100;

  const handleShare = () => {
    onShare(content, {
      pair: trade.pair,
      side: trade.side,
      leverage: trade.leverage,
      pnl: trade.pnlUSDC,
      pnlPct,
      entryPrice: trade.entryPrice,
      exitPrice: trade.exitPrice,
      size: trade.collateralUSDC * trade.leverage,
      onChain: true,
      txHash: trade.txHash,
      txUrl: `https://sepolia.basescan.org/tx/${trade.txHash}`,
    });
    onClose();
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={cardStyle}>
        <div style={holoGradient} />

        {/* Header */}
        <button
          onClick={onClose}
          aria-label="Skip share"
          style={{
            position: 'absolute', top: 16, right: 16, zIndex: 3,
            width: 32, height: 32, borderRadius: 999,
            background: 'rgba(255,255,255,0.04)', border: '1px solid var(--hairline)',
            color: 'var(--fg-muted)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <X size={16} />
        </button>

        <div style={{ padding: '32px 24px 24px' }}>
          {/* Win/loss badge */}
          <div style={{
            width: 64, height: 64, margin: '0 auto 16px', borderRadius: 999,
            background: isWin
              ? 'linear-gradient(160deg, oklch(0.82 0.20 150), oklch(0.70 0.22 160))'
              : 'linear-gradient(160deg, oklch(0.72 0.18 28), oklch(0.62 0.20 18))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: isWin
              ? '0 12px 32px -8px oklch(0.78 0.18 150 / 0.5)'
              : '0 12px 32px -8px oklch(0.62 0.20 18 / 0.5)',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', inset: 0,
              background: 'radial-gradient(120% 80% at 30% 8%, rgba(255,255,255,0.55), transparent 55%)',
            }} />
            <CheckCircle2 size={32} style={{ color: '#fff', position: 'relative', zIndex: 1 }} strokeWidth={2.5} />
          </div>

          <h2 style={{ ...S.display, fontSize: 24, color: 'var(--fg)', margin: '0 0 4px', textAlign: 'center' as const }}>
            Position closed
          </h2>
          <div style={{
            ...S.mono, fontSize: 32, textAlign: 'center' as const,
            color: isWin ? 'var(--pnl-up)' : 'var(--pnl-down)',
            fontWeight: 700, marginBottom: 6,
          }}>
            {isWin ? '+' : ''}${trade.pnlUSDC.toFixed(2)}
          </div>
          <div style={{ ...S.mono, fontSize: 12, color: 'var(--fg-muted)', textAlign: 'center' as const, marginBottom: 20 }}>
            {trade.pair} · {trade.side} · {trade.leverage}× · {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
          </div>

          {/* Tx link */}
          <a
            href={`https://sepolia.basescan.org/tx/${trade.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              ...S.mono, fontSize: 11, color: 'var(--iris-violet)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              marginBottom: 20, textDecoration: 'none',
            }}
          >
            View on BaseScan <ExternalLink size={11} />
          </a>

          {/* Post composer */}
          <div style={{ ...S.label, marginBottom: 6 }}>Share to feed (optional)</div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={280}
            rows={3}
            style={{
              ...S.sans, width: '100%', padding: 12, borderRadius: 12,
              background: 'rgba(255,255,255,0.03)', border: '1px solid var(--hairline)',
              color: 'var(--fg)', fontSize: 13, resize: 'none' as const,
              boxSizing: 'border-box' as const, marginBottom: 16,
              outline: 'none',
            }}
            placeholder="Tell the feed what just happened…"
          />

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                ...S.mono, flex: 1, padding: '12px 0', borderRadius: 12,
                background: 'rgba(255,255,255,0.04)', border: '1px solid var(--hairline)',
                color: 'var(--fg-muted)', fontSize: 11, fontWeight: 700,
                letterSpacing: '0.1em', textTransform: 'uppercase' as const, cursor: 'pointer',
              }}
            >
              Skip
            </button>
            <button
              onClick={handleShare}
              disabled={!content.trim()}
              style={{
                ...S.mono, flex: 2, padding: '12px 0', borderRadius: 12, border: 'none',
                background: content.trim()
                  ? 'linear-gradient(100deg, oklch(0.68 0.22 295), oklch(0.70 0.22 340))'
                  : 'var(--chip-bg)',
                color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase' as const,
                cursor: content.trim() ? 'pointer' : 'not-allowed', opacity: content.trim() ? 1 : 0.5,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <Share2 size={12} /> Share to feed
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
