// VeloShareCard.tsx — Velo branded share card (v2)
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
    const sideColor = data.side === 'LONG' ? (isLight ? '#16a34a' : '#22c55e') : (isLight ? '#dc2626' : '#ff5050');
    const pnlColor  = pnlUp ? (isLight ? '#16a34a' : '#22c55e') : (isLight ? '#dc2626' : '#ff5050');
    const fgPrimary = isLight ? '#0f1117' : '#F4F1E8';
    const fgMuted   = isLight ? 'rgba(15,17,23,0.46)' : 'rgba(236,237,241,0.44)';
    const fgSubtle  = isLight ? 'rgba(15,17,23,0.28)' : 'rgba(236,237,241,0.24)';

    // ── Background ──────────────────────────────────────────────────────
    if (isLight) {
      ctx.fillStyle = '#F7F6F2';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(15,17,23,0.025)';
      for (let x = 0; x < W; x += 32) for (let y = 0; y < H; y += 32) { ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill(); }
      const ambL = ctx.createRadialGradient(0, 0, 0, 0, 0, 500);
      ambL.addColorStop(0, pnlUp ? 'rgba(22,163,74,0.07)' : 'rgba(220,38,38,0.07)');
      ambL.addColorStop(1, 'transparent');
      ctx.fillStyle = ambL; ctx.fillRect(0, 0, W, H);
    } else if (bgStyle === 'gradient') {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#0e0b1a'); g.addColorStop(0.5, '#0c1436'); g.addColorStop(1, '#060810');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const gAccent = ctx.createRadialGradient(W * 0.15, H * 0.15, 0, W * 0.15, H * 0.15, W * 0.75);
      gAccent.addColorStop(0, 'rgba(123,60,232,0.28)'); gAccent.addColorStop(0.5, 'rgba(59,91,255,0.12)'); gAccent.addColorStop(1, 'transparent');
      ctx.fillStyle = gAccent; ctx.fillRect(0, 0, W, H);
    } else if (bgStyle === 'hologram') {
      ctx.fillStyle = '#07080f'; ctx.fillRect(0, 0, W, H);
      const hg = ctx.createRadialGradient(W * 0.72, H * 0.2, 0, W * 0.72, H * 0.2, W * 0.9);
      hg.addColorStop(0, 'rgba(123,60,232,0.32)'); hg.addColorStop(0.4, 'rgba(59,91,255,0.14)'); hg.addColorStop(1, 'transparent');
      ctx.fillStyle = hg; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(168,200,255,0.028)'; ctx.lineWidth = 1;
      for (let y = 0; y < H; y += 6) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    } else {
      ctx.fillStyle = '#06070c'; ctx.fillRect(0, 0, W, H);
    }

    if (!isLight) {
      const bL = ctx.createRadialGradient(100, 100, 0, 100, 100, 420);
      bL.addColorStop(0, 'rgba(123,60,232,0.16)'); bL.addColorStop(1, 'transparent');
      ctx.fillStyle = bL; ctx.fillRect(0, 0, W, H);
      const bR = ctx.createRadialGradient(W - 100, H - 80, 0, W - 100, H - 80, 380);
      bR.addColorStop(0, 'rgba(59,91,255,0.12)'); bR.addColorStop(1, 'transparent');
      ctx.fillStyle = bR; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,0.016)'; ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    }

    // ── Side accent bar (left edge) ─────────────────────────────────────
    ctx.fillStyle = sideColor;
    ctx.fillRect(0, 0, 7, H);
    const barGlow = ctx.createLinearGradient(0, 0, 80, 0);
    barGlow.addColorStop(0, data.side === 'LONG' ? (isLight ? 'rgba(22,163,74,0.10)' : 'rgba(34,197,94,0.14)') : (isLight ? 'rgba(220,38,38,0.10)' : 'rgba(255,80,80,0.14)'));
    barGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = barGlow; ctx.fillRect(7, 0, 80, H);

    // ── Logo wordmark ────────────────────────────────────────────────────
    const LX = 52, LY = 44;
    const bugG = ctx.createLinearGradient(LX, LY, LX + 40, LY + 40);
    bugG.addColorStop(0, '#7B3CE8'); bugG.addColorStop(0.6, '#3B5BFF'); bugG.addColorStop(1, '#2744B8');
    ctx.fillStyle = bugG;
    ctx.beginPath(); (ctx as any).roundRect(LX, LY, 40, 40, 12); ctx.fill();
    const bugHL = ctx.createRadialGradient(LX + 12, LY + 8, 0, LX + 12, LY + 8, 30);
    bugHL.addColorStop(0, 'rgba(255,255,255,0.38)'); bugHL.addColorStop(1, 'transparent');
    ctx.fillStyle = bugHL; ctx.beginPath(); (ctx as any).roundRect(LX, LY, 40, 40, 12); ctx.fill();
    ctx.fillStyle = '#F4F1E8'; ctx.font = 'italic 400 23px "Fraunces", "Times New Roman", serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('V', LX + 20, LY + 20);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = fgPrimary;
    ctx.font = 'italic 400 42px "Fraunces", "Times New Roman", serif';
    ctx.fillText('Velo', LX + 50, LY - 2);
    ctx.fillStyle = fgMuted; ctx.font = '600 10px "Geist Mono", monospace';
    ctx.fillText('PERPETUALS · SOCIAL LAYER', LX + 52, LY + 44);

    // ── Testnet pill (top right) ─────────────────────────────────────────
    const pillW = 240, pillH = 36, pillX = W - pillW - 48, pillY = LY + 2;
    ctx.fillStyle = isLight ? 'rgba(230,100,50,0.10)' : 'rgba(226,111,76,0.14)';
    ctx.beginPath(); (ctx as any).roundRect(pillX, pillY, pillW, pillH, 10); ctx.fill();
    ctx.strokeStyle = isLight ? 'rgba(230,100,50,0.28)' : 'rgba(226,111,76,0.28)'; ctx.lineWidth = 1;
    ctx.beginPath(); (ctx as any).roundRect(pillX, pillY, pillW, pillH, 10); ctx.stroke();
    ctx.font = '700 11px "Geist Mono", monospace'; ctx.fillStyle = '#E26F4C';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('TESTNET · BASE SEPOLIA', pillX + pillW / 2, pillY + pillH / 2);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = '500 10px "Geist Mono", monospace'; ctx.fillStyle = fgMuted;
    ctx.textAlign = 'center';
    ctx.fillText('Provable. Social. On-chain.', pillX + pillW / 2, pillY + pillH + 8);
    ctx.textAlign = 'left';

    // ── Divider ──────────────────────────────────────────────────────────
    ctx.strokeStyle = isLight ? 'rgba(15,17,23,0.08)' : 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(48, 122); ctx.lineTo(W - 48, 122); ctx.stroke();

    // ── Status badge ─────────────────────────────────────────────────────
    const badge = data.status === 'LIQUIDATED' ? 'LIQUIDATED'
      : data.status === 'CLOSED' ? (pnlUp ? 'CLOSED IN PROFIT' : 'CLOSED AT LOSS')
      : 'OPEN POSITION';
    ctx.font = '700 10px "Geist Mono", monospace'; ctx.fillStyle = pnlColor;
    ctx.textBaseline = 'top';
    ctx.fillText('● ' + badge, 52, 142);

    // ── Pair + Side + Leverage ────────────────────────────────────────────
    if (visibleFields.pair || visibleFields.side) {
      let x = 52; const y = 178;
      ctx.textBaseline = 'top';
      if (visibleFields.pair) {
        ctx.font = 'italic 400 76px "Fraunces", "Times New Roman", serif';
        ctx.fillStyle = fgPrimary;
        ctx.fillText(data.pair, x, y);
        x += ctx.measureText(data.pair).width + 22;
      }
      const tagY = y + 36;
      if (visibleFields.side) {
        ctx.font = '700 22px "Geist Mono", monospace'; ctx.fillStyle = sideColor;
        ctx.fillText(data.side, x, tagY);
        x += ctx.measureText(data.side).width + 12;
      }
      if (visibleFields.leverage) {
        ctx.font = '700 22px "Geist Mono", monospace'; ctx.fillStyle = fgMuted;
        ctx.fillText(`${data.leverage}×`, x, tagY);
      }
    }

    // ── PnL hero ─────────────────────────────────────────────────────────
    if (visibleFields.pnl) {
      const pnlY = 308;
      ctx.font = '700 10px "Geist Mono", monospace'; ctx.fillStyle = fgMuted; ctx.textBaseline = 'top';
      ctx.fillText(data.status === 'OPEN' ? 'UNREALISED PnL' : 'REALISED PnL', 52, pnlY);
      const pnlStr = (pnlUp ? '+' : '') + '$' + Math.abs(data.pnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      ctx.font = 'italic 400 96px "Fraunces", "Times New Roman", serif'; ctx.fillStyle = pnlColor;
      ctx.fillText(pnlStr, 52, pnlY + 22);
      const pnlW = ctx.measureText(pnlStr).width;
      const pctStr = (data.pnlPct >= 0 ? '+' : '') + data.pnlPct.toFixed(2) + '%';
      ctx.font = '700 26px "Geist Mono", monospace'; ctx.fillStyle = pnlColor;
      ctx.fillText(pctStr, 52 + pnlW + 20, pnlY + 22 + 58);
    }

    // ── Stat strip ────────────────────────────────────────────────────────
    const stats: { label: string; value: string }[] = [];
    if (visibleFields.entryPrice) stats.push({ label: 'ENTRY', value: '$' + data.entryPrice.toLocaleString('en-US', { maximumFractionDigits: 4 }) });
    if (visibleFields.closePrice && data.closePrice != null) stats.push({ label: 'CLOSE', value: '$' + data.closePrice.toLocaleString('en-US', { maximumFractionDigits: 4 }) });
    if (visibleFields.markPrice && data.markPrice != null && data.status === 'OPEN') stats.push({ label: 'MARK', value: '$' + data.markPrice.toLocaleString('en-US', { maximumFractionDigits: 4 }) });
    if (visibleFields.size) stats.push({ label: 'SIZE', value: '$' + data.size.toLocaleString('en-US', { maximumFractionDigits: 2 }) });
    if (visibleFields.collateral) stats.push({ label: 'COLLATERAL', value: '$' + data.collateral.toLocaleString('en-US', { maximumFractionDigits: 2 }) });

    if (stats.length > 0) {
      const stripY = 516, stripX = 48, stripW = W - 96;
      const gap = 12, colW = (stripW - gap * (stats.length - 1)) / stats.length;
      stats.forEach((s, i) => {
        const cx = stripX + (colW + gap) * i;
        ctx.fillStyle = isLight ? 'rgba(15,17,23,0.05)' : 'rgba(255,255,255,0.04)';
        ctx.beginPath(); (ctx as any).roundRect(cx, stripY, colW, 80, 14); ctx.fill();
        ctx.strokeStyle = isLight ? 'rgba(15,17,23,0.09)' : 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
        ctx.beginPath(); (ctx as any).roundRect(cx, stripY, colW, 80, 14); ctx.stroke();
        ctx.font = '700 10px "Geist Mono", monospace'; ctx.fillStyle = fgMuted; ctx.textBaseline = 'top';
        ctx.fillText(s.label, cx + 16, stripY + 16);
        ctx.font = '700 20px "Geist Mono", monospace'; ctx.fillStyle = fgPrimary;
        ctx.fillText(s.value, cx + 16, stripY + 42);
      });
    }

    // ── Footer ────────────────────────────────────────────────────────────
    if (visibleFields.handle && data.traderHandle) {
      ctx.font = '700 13px "Geist Mono", monospace'; ctx.fillStyle = isLight ? '#5b5cf6' : '#A8C8FF';
      ctx.textBaseline = 'bottom'; ctx.textAlign = 'left';
      const handle = data.traderHandle.startsWith('@') ? data.traderHandle : '@' + data.traderHandle;
      ctx.fillText(handle, 52, H - 32);
    }
    ctx.font = '500 10px "Geist Mono", monospace'; ctx.fillStyle = fgSubtle;
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText('Velo Perps Testnet · For illustrative purposes only', W - 48, H - 32);
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

  const BG_OPTIONS: { id: BgStyle; label: string; dot: string }[] = [
    { id: 'obsidian', label: 'Obsidian', dot: '#1e2030' },
    { id: 'gradient', label: 'Gradient', dot: '#7B3CE8' },
    { id: 'hologram', label: 'Hologram', dot: '#3B5BFF' },
    { id: 'light',    label: 'Light',    dot: '#e8e4d8' },
  ];

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(16px)' }}>
      <div style={{ width: '100%', maxWidth: 720, borderRadius: 20, background: 'var(--glass-bg-strong)', border: '1px solid var(--glass-border)', boxShadow: 'var(--glass-shadow)', backdropFilter: 'blur(32px)', overflow: 'hidden', maxHeight: '92vh', display: 'flex', flexDirection: 'column' as const }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--hairline)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Share2 size={14} style={{ color: 'var(--velo-violet)' }} />
            <span style={{ ...S.mono, fontSize: 11, fontWeight: 700, color: 'var(--fg)', letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>Share Trade Card</span>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--fg-muted)' }}><X size={16} /></button>
        </div>

        {/* Preview */}
        <div style={{ padding: 16, background: 'rgba(0,0,0,0.35)', overflowY: 'auto' as const }}>
          <canvas ref={canvasRef} width={1200} height={675}
            style={{ width: '100%', height: 'auto', borderRadius: 12, display: 'block', boxShadow: '0 12px 48px rgba(0,0,0,0.55)' }} />
        </div>

        {/* Controls */}
        <div style={{ padding: '12px 14px', borderTop: '1px solid var(--hairline)', display: 'flex', flexDirection: 'column' as const, gap: 8 }}>

          {/* Action row — always visible at top of controls */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleDownload}
              style={{ ...S.mono, flex: 1, padding: '12px 0', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--hairline)', color: 'var(--fg)', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Download size={12} /> Download PNG
            </button>
            <button onClick={handleShare}
              style={{ ...S.mono, flex: 2, padding: '12px 0', borderRadius: 10, border: 'none', background: 'linear-gradient(100deg, oklch(0.55 0.26 295), oklch(0.65 0.22 310))', color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: '0 4px 20px oklch(0.55 0.26 295 / 0.35)' }}>
              {copied ? <><Check size={12} /> Copied!</> : <><Share2 size={12} /> Share</>}
            </button>
          </div>

          {/* Customize toggle */}
          <button onClick={() => setTweakOpen((p) => !p)}
            style={{ ...S.mono, width: '100%', padding: '7px 12px', borderRadius: 10, background: tweakOpen ? 'oklch(0.68 0.22 295 / 0.10)' : 'var(--chip-bg)', border: `1px solid ${tweakOpen ? 'oklch(0.68 0.22 295 / 0.35)' : 'var(--hairline)'}`, color: tweakOpen ? 'var(--iris-violet)' : 'var(--fg-muted)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Settings size={11} /> {tweakOpen ? 'Hide Options' : 'Customize'}
          </button>

          {tweakOpen && (
            <div style={{ paddingTop: 4 }}>
              {/* Background */}
              <div style={{ ...S.label, marginBottom: 8 }}>Theme</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                {BG_OPTIONS.map(({ id, label, dot }) => (
                  <button key={id} onClick={() => setBgStyle(id)}
                    style={{ ...S.mono, flex: 1, padding: '8px 6px', borderRadius: 8, background: bgStyle === id ? 'oklch(0.68 0.22 295 / 0.18)' : 'rgba(255,255,255,0.02)', border: `1px solid ${bgStyle === id ? 'oklch(0.68 0.22 295 / 0.5)' : 'var(--hairline)'}`, color: bgStyle === id ? 'var(--iris-violet)' : 'var(--fg-muted)', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase' as const, cursor: 'pointer', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 20, height: 20, borderRadius: 6, background: dot, border: '1px solid rgba(255,255,255,0.12)', display: 'block' }} />
                    {label}
                  </button>
                ))}
              </div>

              {/* Fields */}
              <div style={{ ...S.label, marginBottom: 8 }}>Visible Fields</div>
              <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 5 }}>
                {(Object.keys(FIELD_LABELS) as FieldKey[]).map((k) => (
                  <button key={k} onClick={() => toggleField(k)}
                    style={{ ...S.mono, padding: '5px 9px', borderRadius: 6, background: visibleFields[k] ? 'oklch(0.68 0.22 295 / 0.15)' : 'rgba(255,255,255,0.02)', border: `1px solid ${visibleFields[k] ? 'oklch(0.68 0.22 295 / 0.4)' : 'var(--hairline)'}`, color: visibleFields[k] ? 'var(--iris-violet)' : 'var(--fg-subtle)', fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase' as const, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
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
