// VeloShareCard.tsx — Velo branded share card (v3)
// Renders on a hidden <canvas> at 1200×675 (Twitter/OG optimal).
// Four themes: obsidian · gradient · hologram · light
// Long = green accent, Short = red accent, side-bar on left edge.

import React, { useEffect, useRef, useState } from 'react';
import { Download, Share2, X, Check, Settings, Eye, EyeOff } from 'lucide-react';

const S = {
  mono:  { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1', fontVariantNumeric: 'tabular-nums' as const },
  label: { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700 as const, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)' },
};

export type ShareCardData = {
  pair: string;
  side: 'LONG' | 'SHORT';
  leverage: number;
  entryPrice: number;
  closePrice?: number;
  markPrice?: number;
  size: number;
  collateral: number;
  pnl: number;
  pnlPct: number;
  traderHandle?: string;
  status: 'OPEN' | 'CLOSED' | 'LIQUIDATED';
};

interface Props { isOpen: boolean; onClose: () => void; data: ShareCardData; }

type BgStyle = 'obsidian' | 'gradient' | 'hologram' | 'light';

const FIELD_LABELS = {
  pair: 'Pair', side: 'Side', leverage: 'Leverage',
  entryPrice: 'Entry', closePrice: 'Close', markPrice: 'Mark',
  size: 'Size', collateral: 'Collateral', pnl: 'PnL', handle: 'Trader',
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

  useEffect(() => { if (isOpen) renderToCanvas(); }, [isOpen, bgStyle, visibleFields, data]); // eslint-disable-line

  const renderToCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;

    const isLight   = bgStyle === 'light';
    const pnlUp     = data.pnl >= 0;
    const sideColor = data.side === 'LONG' ? (isLight ? '#398356' : '#77c995') : (isLight ? '#c65c5a' : '#df7774');
    const pnlColor  = pnlUp ? (isLight ? '#398356' : '#77c995') : (isLight ? '#c65c5a' : '#df7774');
    const accent    = isLight ? '#557a62' : '#91b99f';
    const fgPrimary = isLight ? '#19241d' : '#edf2ee';
    const fgMuted   = isLight ? 'rgba(25,36,29,0.66)' : 'rgba(237,242,238,0.66)';
    const fgSubtle  = isLight ? 'rgba(25,36,29,0.44)' : 'rgba(237,242,238,0.42)';
    const cardBg    = isLight ? 'rgba(49,83,59,0.055)' : 'rgba(225,238,228,0.055)';
    const cardBorder= isLight ? 'rgba(44,75,53,0.14)' : 'rgba(224,238,228,0.12)';

    // ── Background ──────────────────────────────────────────────────────
    if (isLight) {
      ctx.fillStyle = '#e2ebe3';
      ctx.fillRect(0, 0, W, H);
      // Subtle dot matrix
      ctx.fillStyle = 'rgba(44,75,53,0.045)';
      for (let x = 24; x < W; x += 28) for (let y = 24; y < H; y += 28) {
        ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill();
      }
      // Ambient glow from PnL color
      const amb = ctx.createRadialGradient(W * 0.12, H * 0.15, 0, W * 0.12, H * 0.15, W * 0.6);
      amb.addColorStop(0, pnlUp ? 'rgba(57,131,86,0.08)' : 'rgba(198,92,90,0.07)');
      amb.addColorStop(1, 'transparent');
      ctx.fillStyle = amb; ctx.fillRect(0, 0, W, H);
    } else if (bgStyle === 'gradient') {
      // Restrained Velo forest gradient
      const g = ctx.createLinearGradient(0, 0, W * 0.7, H);
      g.addColorStop(0, '#111a14'); g.addColorStop(0.5, '#1d2a21'); g.addColorStop(1, '#0a0e0c');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // Soft sage bloom top-left
      const vBloom = ctx.createRadialGradient(W * 0.08, H * 0.1, 0, W * 0.08, H * 0.1, W * 0.65);
      vBloom.addColorStop(0, 'rgba(145,185,159,0.2)'); vBloom.addColorStop(0.5, 'rgba(85,122,98,0.1)'); vBloom.addColorStop(1, 'transparent');
      ctx.fillStyle = vBloom; ctx.fillRect(0, 0, W, H);
      // Secondary warm bloom bottom-right
      const wBloom = ctx.createRadialGradient(W * 0.9, H * 0.85, 0, W * 0.9, H * 0.85, W * 0.5);
      wBloom.addColorStop(0, pnlUp ? 'rgba(34,197,94,0.12)' : 'rgba(255,80,80,0.12)'); wBloom.addColorStop(1, 'transparent');
      ctx.fillStyle = wBloom; ctx.fillRect(0, 0, W, H);
    } else if (bgStyle === 'hologram') {
      ctx.fillStyle = '#0b100d'; ctx.fillRect(0, 0, W, H);
      // Layered sage bloom
      const hg1 = ctx.createRadialGradient(W * 0.75, H * 0.2, 0, W * 0.75, H * 0.2, W * 0.8);
      hg1.addColorStop(0, 'rgba(180,213,191,0.18)'); hg1.addColorStop(0.4, 'rgba(85,122,98,0.12)'); hg1.addColorStop(1, 'transparent');
      ctx.fillStyle = hg1; ctx.fillRect(0, 0, W, H);
      const hg2 = ctx.createRadialGradient(W * 0.2, H * 0.8, 0, W * 0.2, H * 0.8, W * 0.5);
      hg2.addColorStop(0, 'rgba(145,185,159,0.12)'); hg2.addColorStop(1, 'transparent');
      ctx.fillStyle = hg2; ctx.fillRect(0, 0, W, H);
      // Scan lines
      ctx.strokeStyle = 'rgba(223,239,227,0.025)'; ctx.lineWidth = 1;
      for (let y = 0; y < H; y += 5) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    } else {
      // Obsidian — very dark with faint grid
      ctx.fillStyle = '#0a0e0c'; ctx.fillRect(0, 0, W, H);
    }

    // Shared: dark-mode subtle grid overlay
    if (!isLight) {
      // Corner bloom — Velo sage
      const bL = ctx.createRadialGradient(80, 80, 0, 80, 80, 400);
      bL.addColorStop(0, 'rgba(145,185,159,0.12)'); bL.addColorStop(1, 'transparent');
      ctx.fillStyle = bL; ctx.fillRect(0, 0, W, H);
      // Faint grid
      ctx.strokeStyle = 'rgba(255,255,255,0.013)'; ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 52) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += 52) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    }

    // ── Velo accent bar ──────────────────────────────────────────────────
    const topGrad = ctx.createLinearGradient(0, 0, W, 0);
    if (isLight) {
      topGrad.addColorStop(0, '#557a62');
      topGrad.addColorStop(0.65, '#91b99f');
      topGrad.addColorStop(1, pnlColor);
    } else {
      topGrad.addColorStop(0, '#557a62');
      topGrad.addColorStop(0.65, '#91b99f');
      topGrad.addColorStop(1, pnlColor);
    }
    ctx.fillStyle = topGrad; ctx.fillRect(0, 0, W, 4);

    // ── Side accent bar ─────────────────────────────────────────────────
    const sideGrad = ctx.createLinearGradient(0, 0, 0, H);
    sideGrad.addColorStop(0, sideColor);
    sideGrad.addColorStop(0.6, sideColor);
    sideGrad.addColorStop(1, sideColor + '40');
    ctx.fillStyle = sideGrad; ctx.fillRect(0, 4, 5, H - 4);
    // Glow behind bar
    const barGlow = ctx.createLinearGradient(0, 0, 90, 0);
    barGlow.addColorStop(0, data.side === 'LONG' ? (isLight ? 'rgba(22,163,74,0.12)' : 'rgba(34,197,94,0.15)') : (isLight ? 'rgba(220,38,38,0.12)' : 'rgba(255,80,80,0.15)'));
    barGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = barGlow; ctx.fillRect(5, 4, 90, H);

    // ── Logo area ────────────────────────────────────────────────────────
    const LX = 52, LY = 38;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = fgPrimary;
    ctx.font = 'italic 400 44px "Fraunces", "Times New Roman", serif';
    ctx.fillText('Velo', LX, LY);
    const wordW = ctx.measureText('Velo').width;
    // Dot after wordmark
    ctx.beginPath();
    ctx.arc(LX + wordW + 7, LY + 10, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.fillStyle = fgMuted;
    ctx.font = '700 9px "Geist Mono", monospace';
    ctx.fillText('PERPETUALS · SOCIAL LAYER', LX + 1, LY + 52);

    // ── Testnet badge (top right) ─────────────────────────────────────────
    const badgeW = 210, badgeH = 28, badgeX = W - badgeW - 44, badgeY = LY + 8;
    ctx.fillStyle = isLight ? 'rgba(85,122,98,0.08)' : 'rgba(145,185,159,0.12)';
    ctx.beginPath(); (ctx as any).roundRect(badgeX, badgeY, badgeW, badgeH, 8); ctx.fill();
    ctx.strokeStyle = isLight ? 'rgba(85,122,98,0.24)' : 'rgba(145,185,159,0.3)'; ctx.lineWidth = 1;
    ctx.beginPath(); (ctx as any).roundRect(badgeX, badgeY, badgeW, badgeH, 8); ctx.stroke();
    ctx.font = '700 10px "Geist Mono", monospace';
    ctx.fillStyle = accent;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('TESTNET · BASE SEPOLIA', badgeX + badgeW / 2, badgeY + badgeH / 2);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = '500 9px "Geist Mono", monospace'; ctx.fillStyle = fgSubtle;
    ctx.textAlign = 'center';
    ctx.fillText('Provable. Social. On-chain.', badgeX + badgeW / 2, badgeY + badgeH + 6);
    ctx.textAlign = 'left';

    // ── Divider ──────────────────────────────────────────────────────────
    ctx.strokeStyle = isLight ? 'rgba(15,17,23,0.09)' : 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(48, 118); ctx.lineTo(W - 48, 118); ctx.stroke();

    // ── Status badge ─────────────────────────────────────────────────────
    const badge = data.status === 'LIQUIDATED' ? '● LIQUIDATED'
      : data.status === 'CLOSED' ? (pnlUp ? '● CLOSED IN PROFIT' : '● CLOSED AT LOSS')
      : '● OPEN POSITION';
    // Pill background for status
    ctx.font = '700 9px "Geist Mono", monospace';
    const statusW = ctx.measureText(badge).width + 18;
    ctx.fillStyle = pnlUp
      ? (isLight ? 'rgba(22,163,74,0.1)' : 'rgba(34,197,94,0.1)')
      : (isLight ? 'rgba(220,38,38,0.1)' : 'rgba(255,80,80,0.1)');
    ctx.beginPath(); (ctx as any).roundRect(48, 134, statusW, 20, 5); ctx.fill();
    ctx.fillStyle = pnlColor; ctx.textBaseline = 'middle';
    ctx.fillText(badge, 57, 144);

    // ── Pair + Side + Leverage ────────────────────────────────────────────
    if (visibleFields.pair || visibleFields.side) {
      let x = 52; const y = 174;
      ctx.textBaseline = 'top';
      if (visibleFields.pair) {
        ctx.font = 'italic 400 80px "Fraunces", "Times New Roman", serif';
        ctx.fillStyle = fgPrimary;
        ctx.fillText(data.pair, x, y);
        x += ctx.measureText(data.pair).width + 20;
      }
      const tagY = y + 40;
      if (visibleFields.side) {
        // Side pill
        ctx.font = '700 20px "Geist Mono", monospace';
        const sw = ctx.measureText(data.side).width;
        ctx.fillStyle = data.side === 'LONG'
          ? (isLight ? 'rgba(22,163,74,0.12)' : 'rgba(34,197,94,0.12)')
          : (isLight ? 'rgba(220,38,38,0.12)' : 'rgba(255,80,80,0.12)');
        ctx.beginPath(); (ctx as any).roundRect(x - 6, tagY - 4, sw + 22, 34, 8); ctx.fill();
        ctx.fillStyle = sideColor;
        ctx.fillText(data.side, x + 5, tagY);
        x += sw + 32;
      }
      if (visibleFields.leverage) {
        ctx.font = '700 20px "Geist Mono", monospace'; ctx.fillStyle = fgMuted;
        ctx.fillText(`${data.leverage}×`, x, tagY);
      }
    }

    // ── PnL hero ─────────────────────────────────────────────────────────
    if (visibleFields.pnl) {
      const pnlY = 302;
      ctx.font = '700 9px "Geist Mono", monospace'; ctx.fillStyle = fgMuted; ctx.textBaseline = 'top';
      ctx.fillText(data.status === 'OPEN' ? 'UNREALISED PnL' : 'REALISED PnL', 52, pnlY);

      const pnlStr = (pnlUp ? '+' : '-') + '$' + Math.abs(data.pnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      ctx.font = 'italic 400 100px "Fraunces", "Times New Roman", serif'; ctx.fillStyle = pnlColor;
      ctx.textBaseline = 'top';
      ctx.fillText(pnlStr, 52, pnlY + 18);
      const pnlW = ctx.measureText(pnlStr).width;

      // Percentage badge
      const pctStr = (data.pnlPct >= 0 ? '+' : '') + data.pnlPct.toFixed(2) + '%';
      ctx.font = '700 22px "Geist Mono", monospace';
      const pctW = ctx.measureText(pctStr).width;
      const pctX = 52 + pnlW + 18, pctY = pnlY + 18 + 66;
      ctx.fillStyle = pnlUp
        ? (isLight ? 'rgba(22,163,74,0.12)' : 'rgba(34,197,94,0.12)')
        : (isLight ? 'rgba(220,38,38,0.12)' : 'rgba(255,80,80,0.12)');
      ctx.beginPath(); (ctx as any).roundRect(pctX - 8, pctY - 4, pctW + 22, 36, 10); ctx.fill();
      ctx.fillStyle = pnlColor;
      ctx.fillText(pctStr, pctX + 3, pctY);
    }

    // ── Stat strip ────────────────────────────────────────────────────────
    const stats: { label: string; value: string }[] = [];
    if (visibleFields.entryPrice) stats.push({ label: 'ENTRY', value: '$' + data.entryPrice.toLocaleString('en-US', { maximumFractionDigits: 4 }) });
    if (visibleFields.closePrice && data.closePrice != null) stats.push({ label: 'CLOSE', value: '$' + data.closePrice.toLocaleString('en-US', { maximumFractionDigits: 4 }) });
    if (visibleFields.markPrice && data.markPrice != null && data.status === 'OPEN') stats.push({ label: 'MARK', value: '$' + data.markPrice.toLocaleString('en-US', { maximumFractionDigits: 4 }) });
    if (visibleFields.size) stats.push({ label: 'SIZE', value: '$' + data.size.toLocaleString('en-US', { maximumFractionDigits: 2 }) });
    if (visibleFields.collateral) stats.push({ label: 'COLLATERAL', value: '$' + data.collateral.toLocaleString('en-US', { maximumFractionDigits: 2 }) });

    if (stats.length > 0) {
      const stripY = 510, stripX = 48, stripW = W - 96;
      const gap = 10, colW = (stripW - gap * (stats.length - 1)) / stats.length;
      stats.forEach((s, i) => {
        const cx = stripX + (colW + gap) * i;
        // Card body
        ctx.fillStyle = cardBg;
        ctx.beginPath(); (ctx as any).roundRect(cx, stripY, colW, 88, 14); ctx.fill();
        // Top shimmer line
        const shimmer = ctx.createLinearGradient(cx, stripY, cx + colW, stripY);
        shimmer.addColorStop(0, 'transparent');
        shimmer.addColorStop(0.5, isLight ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.1)');
        shimmer.addColorStop(1, 'transparent');
        ctx.fillStyle = shimmer;
        ctx.beginPath(); (ctx as any).roundRect(cx + 1, stripY, colW - 2, 2, 2); ctx.fill();
        // Border
        ctx.strokeStyle = cardBorder; ctx.lineWidth = 1;
        ctx.beginPath(); (ctx as any).roundRect(cx, stripY, colW, 88, 14); ctx.stroke();
        // Label
        ctx.font = '700 9px "Geist Mono", monospace'; ctx.fillStyle = fgMuted; ctx.textBaseline = 'top';
        ctx.fillText(s.label, cx + 18, stripY + 18);
        // Value
        ctx.font = '700 22px "Geist Mono", monospace'; ctx.fillStyle = fgPrimary;
        ctx.fillText(s.value, cx + 18, stripY + 44);
      });
    }

    // ── Footer ────────────────────────────────────────────────────────────
    // Subtle divider above footer
    ctx.strokeStyle = isLight ? 'rgba(15,17,23,0.07)' : 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(48, H - 52); ctx.lineTo(W - 48, H - 52); ctx.stroke();

    if (visibleFields.handle && data.traderHandle) {
      const handle = data.traderHandle.startsWith('@') ? data.traderHandle : '@' + data.traderHandle;
      ctx.font = '700 12px "Geist Mono", monospace'; ctx.fillStyle = accent;
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillText(handle, 52, H - 28);
    }
    ctx.font = '500 9px "Geist Mono", monospace'; ctx.fillStyle = fgSubtle;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText('Velo Perps Testnet · For illustrative purposes only', W - 48, H - 28);
    ctx.textAlign = 'left';
  };

  const handleDownload = () => {
    const canvas = canvasRef.current; if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `velo-${data.pair.replace('/', '-')}-${data.side}-${Date.now()}.png`;
      a.click(); URL.revokeObjectURL(url);
    }, 'image/png');
  };

  const handleShare = async () => {
    const canvas = canvasRef.current; if (!canvas) return;
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `velo-${data.pair.replace('/', '-')}.png`, { type: 'image/png' });
      const navAny = navigator as any;
      if (navAny.share && navAny.canShare?.({ files: [file] })) {
        try { await navAny.share({ title: `${data.pair} ${data.side} ${data.leverage}× on Velo`, text: `${(data.pnl >= 0 ? '+' : '') + '$' + Math.abs(data.pnl).toFixed(2)} on Velo Perps testnet.`, files: [file] }); }
        catch { /* dismissed */ }
      } else {
        try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); setCopied(true); setTimeout(() => setCopied(false), 2000); }
        catch { handleDownload(); }
      }
    }, 'image/png');
  };

  const toggleField = (k: FieldKey) => setVisibleFields((p) => ({ ...p, [k]: !p[k] }));
  if (!isOpen) return null;

  const BG_OPTIONS: { id: BgStyle; label: string; swatch: string }[] = [
    { id: 'obsidian', label: 'Obsidian', swatch: 'linear-gradient(135deg, #090d0b 0%, #19211c 100%)' },
    { id: 'gradient', label: 'Forest', swatch: 'linear-gradient(135deg, #111a14 0%, #1d2a21 52%, #557a64 100%)' },
    { id: 'hologram', label: 'Sage Glass', swatch: 'linear-gradient(135deg, #0b100d 0%, #27382d 52%, #91b99f 100%)' },
    { id: 'light',    label: 'Light',    swatch: 'linear-gradient(135deg, #e2ebe3 0%, #cfdfd1 100%)' },
  ];

  return (
    <div className="velo-modal-enter-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'var(--overlay)', backdropFilter: 'blur(22px) saturate(1.28)' }}>
      <div className="velo-modal-enter-card" style={{ width: '100%', maxWidth: 720, borderRadius: 20, background: 'var(--glass-bg-strong)', border: '1px solid var(--glass-border)', boxShadow: 'var(--glass-shadow)', backdropFilter: 'blur(32px)', overflow: 'hidden', maxHeight: '92vh', display: 'flex', flexDirection: 'column' as const }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--hairline)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Share2 size={14} style={{ color: 'var(--velo-violet)' }} />
            <span style={{ ...S.mono, fontSize: 11, fontWeight: 700, color: 'var(--fg)', letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>Share Trade Card</span>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--fg-muted)', display: 'flex', alignItems: 'center', padding: 4 }}><X size={16} /></button>
        </div>

        {/* Canvas Preview */}
        <div style={{ padding: '14px 14px 10px', background: 'var(--surface-inset)', overflowY: 'auto' as const }}>
          <canvas ref={canvasRef} width={1200} height={675}
            style={{ width: '100%', height: 'auto', borderRadius: 10, display: 'block', boxShadow: '0 16px 60px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.06)' }} />
        </div>

        {/* Controls */}
        <div style={{ padding: '10px 14px 14px', borderTop: '1px solid var(--hairline)', display: 'flex', flexDirection: 'column' as const, gap: 8 }}>

          {/* Action row */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleDownload}
              style={{ ...S.mono, flex: 1, padding: '11px 0', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--hairline)', color: 'var(--fg)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Download size={11} /> Download PNG
            </button>
            <button onClick={handleShare}
              style={{ ...S.mono, flex: 2, padding: '11px 0', borderRadius: 10, border: '1px solid var(--control-border)', background: 'var(--primary-bg)', color: 'var(--primary-fg)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: '0 4px 20px color-mix(in oklab, var(--accent) 24%, transparent)' }}>
              {copied ? <><Check size={11} /> Copied!</> : <><Share2 size={11} /> Share</>}
            </button>
          </div>

          {/* Customize toggle */}
          <button onClick={() => setTweakOpen((p) => !p)}
            style={{ ...S.mono, width: '100%', padding: '7px 12px', borderRadius: 10, background: tweakOpen ? 'color-mix(in oklab, var(--accent) 10%, transparent)' : 'var(--chip-bg)', border: `1px solid ${tweakOpen ? 'color-mix(in oklab, var(--accent) 35%, transparent)' : 'var(--hairline)'}`, color: tweakOpen ? 'var(--iris-violet)' : 'var(--fg-muted)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Settings size={11} /> {tweakOpen ? 'Hide Options' : 'Customize'}
          </button>

          {tweakOpen && (
            <div style={{ paddingTop: 4 }}>
              {/* Theme */}
              <div style={{ ...S.label, marginBottom: 8 }}>Theme</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                {BG_OPTIONS.map(({ id, label, swatch }) => (
                  <button key={id} onClick={() => setBgStyle(id)}
                    style={{ ...S.mono, flex: 1, padding: '8px 6px', borderRadius: 8, background: bgStyle === id ? 'color-mix(in oklab, var(--accent) 18%, transparent)' : 'rgba(255,255,255,0.02)', border: `1px solid ${bgStyle === id ? 'color-mix(in oklab, var(--accent) 50%, transparent)' : 'var(--hairline)'}`, color: bgStyle === id ? 'var(--iris-violet)' : 'var(--fg-muted)', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase' as const, cursor: 'pointer', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 24, height: 24, borderRadius: 7, background: swatch, border: '1px solid rgba(255,255,255,0.14)', display: 'block', flexShrink: 0 }} />
                    {label}
                  </button>
                ))}
              </div>

              {/* Fields */}
              <div style={{ ...S.label, marginBottom: 8 }}>Visible Fields</div>
              <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 5 }}>
                {(Object.keys(FIELD_LABELS) as FieldKey[]).map((k) => (
                  <button key={k} onClick={() => toggleField(k)}
                    style={{ ...S.mono, padding: '5px 9px', borderRadius: 6, background: visibleFields[k] ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : 'rgba(255,255,255,0.02)', border: `1px solid ${visibleFields[k] ? 'color-mix(in oklab, var(--accent) 40%, transparent)' : 'var(--hairline)'}`, color: visibleFields[k] ? 'var(--iris-violet)' : 'var(--fg-subtle)', fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase' as const, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                    {visibleFields[k] ? <Eye size={9} /> : <EyeOff size={9} />} {FIELD_LABELS[k]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
