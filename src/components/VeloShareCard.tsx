// VeloShareCard.tsx
//
// Generates a branded shareable PNG for any open or closed Velo position.
// Inspired by the Hyperliquid / Binance share cards but with Velo's
// liquid-glass aesthetic and an unmissable TESTNET watermark.
//
// Architecture:
//   - Renders on a hidden <canvas> at 1200x675 (Twitter optimal)
//   - User can toggle which fields appear (pair, side, leverage, PnL, etc.)
//   - User can pick a background style (dark, gradient, hologram)
//   - "Share" uses the Web Share API where supported (mobile), falls back to
//     copying to clipboard + downloading on desktop
//
// Why a canvas instead of an HTML-to-image library: zero dependencies, full
// control over typography rendering, and works identically across browsers.

import React, { useEffect, useRef, useState } from 'react';
import { Download, Share2, X, Check, Settings, Eye, EyeOff } from 'lucide-react';

const S = {
  display: { fontFamily: 'var(--font-display)', fontStyle: 'italic' as const, letterSpacing: '-0.02em' },
  mono:    { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1', fontVariantNumeric: 'tabular-nums' as const },
  sans:    { fontFamily: 'var(--font-sans)' },
  label:   { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700 as const, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)' },
};

export type ShareCardData = {
  pair: string;                  // "BTC/USD"
  side: 'LONG' | 'SHORT';
  leverage: number;              // 25
  entryPrice: number;            // 64200
  closePrice?: number;           // 68500 — present means closed
  markPrice?: number;            // current mark (open positions)
  size: number;                  // collateral × leverage
  collateral: number;            // mUSDC
  pnl: number;                   // realised or unrealised
  pnlPct: number;                // percent
  traderHandle?: string;         // "@alice"
  status: 'OPEN' | 'CLOSED' | 'LIQUIDATED';
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  data: ShareCardData;
}

type BgStyle = 'obsidian' | 'gradient' | 'hologram';

const FIELD_LABELS = {
  pair: 'Pair',
  side: 'Side',
  leverage: 'Leverage',
  entryPrice: 'Entry',
  closePrice: 'Close',
  markPrice: 'Mark',
  size: 'Size',
  collateral: 'Collateral',
  pnl: 'PnL',
  handle: 'Trader',
} as const;
type FieldKey = keyof typeof FIELD_LABELS;

export const VeloShareCard: React.FC<Props> = ({ isOpen, onClose, data }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [bgStyle, setBgStyle] = useState<BgStyle>('obsidian');
  const [visibleFields, setVisibleFields] = useState<Record<FieldKey, boolean>>({
    pair: true, side: true, leverage: true,
    entryPrice: true, closePrice: true, markPrice: true,
    size: true, collateral: false, pnl: true, handle: !!data.traderHandle,
  });
  const [copied, setCopied] = useState(false);
  const [tweakOpen, setTweakOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    renderToCanvas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, bgStyle, visibleFields, data]);

  const renderToCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    // ── Background ───────────────────────────────────────────────────────
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, W, H);

    if (bgStyle === 'gradient') {
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, '#1a0533');
      grad.addColorStop(0.5, '#0a0a0a');
      grad.addColorStop(1, '#33051a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    } else if (bgStyle === 'hologram') {
      // Iris/violet/coral wash
      const grad = ctx.createRadialGradient(W * 0.7, H * 0.3, 0, W * 0.7, H * 0.3, W * 0.8);
      grad.addColorStop(0, 'rgba(180, 110, 255, 0.35)');
      grad.addColorStop(0.5, 'rgba(255, 90, 160, 0.15)');
      grad.addColorStop(1, 'rgba(10, 10, 10, 0)');
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    // Subtle grid texture
    ctx.strokeStyle = 'rgba(255,255,255,0.025)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    // ── Velo wordmark (top-left) ─────────────────────────────────────────
    ctx.fillStyle = '#ffffff';
    ctx.font = 'italic 700 56px "Instrument Serif", "Times New Roman", serif';
    ctx.textBaseline = 'top';
    ctx.fillText('Velo', 50, 40);
    ctx.fillStyle = 'rgba(180, 110, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(160, 68, 5, 0, Math.PI * 2);
    ctx.fill();

    // Tag (top-right) — TESTNET watermark, unmistakable
    ctx.font = '700 16px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(255, 90, 90, 0.95)';
    ctx.textAlign = 'right';
    ctx.fillText('TESTNET · BASE SEPOLIA', W - 50, 50);
    ctx.font = '500 12px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fillText('velo-trading-terminal.vercel.app', W - 50, 75);
    ctx.textAlign = 'left';

    // ── Status badge ─────────────────────────────────────────────────────
    const badge = data.status === 'LIQUIDATED' ? 'LIQUIDATED'
      : data.status === 'CLOSED' ? (data.pnl >= 0 ? 'CLOSED PROFIT' : 'CLOSED LOSS')
      : 'OPEN POSITION';
    const badgeColor = data.status === 'LIQUIDATED' ? '#ff5050'
      : data.pnl >= 0 ? '#22c55e' : '#ff5050';
    ctx.font = '700 14px "JetBrains Mono", monospace';
    ctx.fillStyle = badgeColor;
    ctx.fillText(badge, 50, 150);

    // ── Pair + side line (huge) ──────────────────────────────────────────
    if (visibleFields.pair || visibleFields.side) {
      let x = 50;
      const y = 195;
      ctx.textBaseline = 'top';
      if (visibleFields.pair) {
        ctx.font = 'italic 700 92px "Instrument Serif", "Times New Roman", serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(data.pair, x, y);
        x += ctx.measureText(data.pair).width + 28;
      }
      if (visibleFields.side) {
        ctx.font = '700 32px "JetBrains Mono", monospace';
        ctx.fillStyle = data.side === 'LONG' ? '#22c55e' : '#ff5050';
        ctx.fillText(data.side, x, y + 30);
        if (visibleFields.leverage) {
          x += ctx.measureText(data.side).width + 16;
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.fillText(`${data.leverage}×`, x, y + 30);
        }
      } else if (visibleFields.leverage) {
        ctx.font = '700 32px "JetBrains Mono", monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText(`${data.leverage}×`, x, y + 30);
      }
    }

    // ── PnL hero ─────────────────────────────────────────────────────────
    if (visibleFields.pnl) {
      const pnlY = 340;
      ctx.font = '700 16px "JetBrains Mono", monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText(data.status === 'OPEN' ? 'UNREALISED PnL' : 'REALISED PnL', 50, pnlY);

      const pnlStr = (data.pnl >= 0 ? '+' : '') + '$' + Math.abs(data.pnl).toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
      ctx.font = 'italic 700 110px "Instrument Serif", "Times New Roman", serif';
      ctx.fillStyle = data.pnl >= 0 ? '#22c55e' : '#ff5050';
      ctx.fillText(pnlStr, 50, pnlY + 30);

      const pctStr = (data.pnlPct >= 0 ? '+' : '') + data.pnlPct.toFixed(2) + '%';
      ctx.font = '700 36px "JetBrains Mono", monospace';
      ctx.fillStyle = data.pnl >= 0 ? '#22c55e' : '#ff5050';
      const pnlW = ctx.measureText(pnlStr).width;
      ctx.font = 'italic 700 110px "Instrument Serif", "Times New Roman", serif';
      const pnlTextW = ctx.measureText(pnlStr).width;
      ctx.font = '700 36px "JetBrains Mono", monospace';
      ctx.fillText(pctStr, 50 + pnlTextW + 24, pnlY + 100);
    }

    // ── Bottom stat strip ────────────────────────────────────────────────
    const stats: Array<{ label: string; value: string }> = [];
    if (visibleFields.entryPrice) stats.push({ label: 'ENTRY', value: '$' + data.entryPrice.toLocaleString('en-US', { maximumFractionDigits: 4 }) });
    if (visibleFields.closePrice && data.closePrice != null) stats.push({ label: 'CLOSE', value: '$' + data.closePrice.toLocaleString('en-US', { maximumFractionDigits: 4 }) });
    if (visibleFields.markPrice && data.markPrice != null && data.status === 'OPEN') stats.push({ label: 'MARK', value: '$' + data.markPrice.toLocaleString('en-US', { maximumFractionDigits: 4 }) });
    if (visibleFields.size) stats.push({ label: 'SIZE', value: '$' + data.size.toLocaleString('en-US', { maximumFractionDigits: 2 }) });
    if (visibleFields.collateral) stats.push({ label: 'COLLATERAL', value: '$' + data.collateral.toLocaleString('en-US', { maximumFractionDigits: 2 }) });

    const stripY = 540;
    const stripX = 50;
    const stripW = W - 100;
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(stripX, stripY); ctx.lineTo(stripX + stripW, stripY); ctx.stroke();

    const colW = stripW / Math.max(stats.length, 1);
    stats.forEach((s, i) => {
      const cx = stripX + colW * i;
      ctx.font = '700 12px "JetBrains Mono", monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText(s.label, cx, stripY + 18);
      ctx.font = '700 22px "JetBrains Mono", monospace';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(s.value, cx, stripY + 38);
    });

    // ── Handle footer ────────────────────────────────────────────────────
    if (visibleFields.handle && data.traderHandle) {
      ctx.font = '700 16px "JetBrains Mono", monospace';
      ctx.fillStyle = 'rgba(180, 110, 255, 0.95)';
      ctx.textBaseline = 'bottom';
      ctx.textAlign = 'left';
      ctx.fillText(data.traderHandle.startsWith('@') ? data.traderHandle : '@' + data.traderHandle, 50, H - 35);
    }
    // Disclaimer
    ctx.font = '500 11px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.textAlign = 'right';
    ctx.fillText('Testnet trade · No real-money risk · Educational only', W - 50, H - 35);
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `velo-${data.pair.replace('/', '-')}-${data.side}-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  const handleShare = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `velo-${data.pair.replace('/', '-')}.png`, { type: 'image/png' });
      const navAny = navigator as any;
      if (navAny.share && navAny.canShare?.({ files: [file] })) {
        try {
          await navAny.share({
            title: `${data.pair} ${data.side} ${data.leverage}× on Velo`,
            text: `${(data.pnl >= 0 ? '+' : '') + '$' + Math.abs(data.pnl).toFixed(2)} on Velo Perps testnet.`,
            files: [file],
          });
        } catch { /* user dismissed */ }
      } else {
        // Fallback — copy to clipboard
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Last resort — just download
          handleDownload();
        }
      }
    }, 'image/png');
  };

  const toggleField = (k: FieldKey) => setVisibleFields((p) => ({ ...p, [k]: !p[k] }));

  if (!isOpen) return null;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 70,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(16px)',
      }}>
      <div style={{
        width: '100%', maxWidth: 720, borderRadius: 20,
        background: 'var(--glass-bg-strong)', border: '1px solid var(--glass-border)',
        boxShadow: 'var(--glass-shadow)', backdropFilter: 'blur(32px)',
        overflow: 'hidden', maxHeight: '92vh', display: 'flex', flexDirection: 'column' as const,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--hairline)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Share2 size={14} style={{ color: 'var(--iris-violet)' }} />
            <span style={{ ...S.mono, fontSize: 11, fontWeight: 700, color: 'var(--fg)', letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>
              Share trade card
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--fg-muted)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Preview */}
        <div style={{ padding: 16, background: 'rgba(0,0,0,0.4)', overflow: 'auto' }}>
          <canvas
            ref={canvasRef}
            width={1200} height={675}
            style={{ width: '100%', height: 'auto', borderRadius: 12, display: 'block', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}
          />
        </div>

        {/* Customizer */}
        <div style={{ padding: 14, borderTop: '1px solid var(--hairline)' }}>
          <button
            onClick={() => setTweakOpen((p) => !p)}
            style={{ ...S.mono, width: '100%', padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--hairline)', color: 'var(--fg)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: tweakOpen ? 12 : 0 }}>
            <Settings size={11} /> {tweakOpen ? 'Hide customization' : 'Customize'}
          </button>

          {tweakOpen && (
            <>
              <div style={{ ...S.label, marginBottom: 6 }}>Background</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                {(['obsidian', 'gradient', 'hologram'] as BgStyle[]).map((b) => (
                  <button key={b} onClick={() => setBgStyle(b)}
                    style={{
                      ...S.mono, flex: 1, padding: '7px 10px', borderRadius: 7,
                      background: bgStyle === b ? 'oklch(0.68 0.22 295 / 0.2)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${bgStyle === b ? 'oklch(0.68 0.22 295 / 0.5)' : 'var(--hairline)'}`,
                      color: bgStyle === b ? 'var(--iris-violet)' : 'var(--fg-muted)',
                      fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase' as const, cursor: 'pointer',
                    }}>
                    {b}
                  </button>
                ))}
              </div>

              <div style={{ ...S.label, marginBottom: 6 }}>Fields shown</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {(Object.keys(FIELD_LABELS) as FieldKey[]).map((k) => (
                  <button key={k} onClick={() => toggleField(k)}
                    style={{
                      ...S.mono, padding: '5px 9px', borderRadius: 6,
                      background: visibleFields[k] ? 'oklch(0.68 0.22 295 / 0.15)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${visibleFields[k] ? 'oklch(0.68 0.22 295 / 0.4)' : 'var(--hairline)'}`,
                      color: visibleFields[k] ? 'var(--iris-violet)' : 'var(--fg-subtle)',
                      fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase' as const,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                    {visibleFields[k] ? <Eye size={9} /> : <EyeOff size={9} />}
                    {FIELD_LABELS[k]}
                  </button>
                ))}
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleDownload}
              style={{
                ...S.mono, flex: 1, padding: '12px 0', borderRadius: 10,
                background: 'rgba(255,255,255,0.04)', border: '1px solid var(--hairline)',
                color: 'var(--fg)', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase' as const, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
              <Download size={12} /> Download PNG
            </button>
            <button onClick={handleShare}
              style={{
                ...S.mono, flex: 1, padding: '12px 0', borderRadius: 10, border: 'none',
                background: 'linear-gradient(100deg, oklch(0.68 0.22 295), oklch(0.70 0.22 340))',
                color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase' as const, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
              {copied ? <><Check size={12} /> Copied!</> : <><Share2 size={12} /> Share</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
