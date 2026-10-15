// VeloShareCard.tsx — Velo branded share card (v3)
// Renders on a hidden <canvas> at 1200×675 (Twitter/OG optimal).
// Four themes: obsidian · gradient · hologram · light
// Long = green accent, Short = red accent, side-bar on left edge.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

const finite = (value: unknown, fallback = 0) =>
  Number.isFinite(typeof value === 'number' ? value : Number(value))
    ? Number(value)
    : fallback;

const roundedPath = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) => {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
};

const canvasPng = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => {
  const fromDataUrl = () => {
    const base64 = canvas.toDataURL('image/png').split(',')[1];
    if (!base64) throw new Error('PNG export returned an empty image.');
    const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
    return new Blob([bytes], { type: 'image/png' });
  };
  try {
    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else {
          try { resolve(fromDataUrl()); } catch (error) { reject(error); }
        }
      }, 'image/png');
      return;
    }
    resolve(fromDataUrl());
  } catch (error) {
    reject(error);
  }
});

const safeFilePart = (value: string) => value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '') || 'trade';

export const VeloShareCard: React.FC<Props> = ({ isOpen, onClose, data }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const copyTimerRef = useRef<number | null>(null);
  const requestCloseRef = useRef<() => void>(() => {});
  const exportingRef = useRef(false);
  const renderedPngRef = useRef<Blob | null>(null);
  const renderVersionRef = useRef(0);
  const [closing, setClosing] = useState(false);
  const [bgStyle, setBgStyle] = useState<BgStyle>('obsidian');
  const [visibleFields, setVisibleFields] = useState<Record<FieldKey, boolean>>({
    pair: true, side: true, leverage: true,
    entryPrice: true, closePrice: true, markPrice: true,
    size: true, collateral: false, pnl: true, handle: !!data.traderHandle,
  });
  const [copied, setCopied] = useState(false);
  const [tweakOpen, setTweakOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pngReady, setPngReady] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [feedbackError, setFeedbackError] = useState(false);

  const safeData = useMemo<ShareCardData>(() => ({
    ...data,
    pair: typeof data.pair === 'string' && data.pair.trim() ? data.pair.trim() : 'Market',
    side: data.side === 'SHORT' ? 'SHORT' : 'LONG',
    leverage: finite(data.leverage),
    entryPrice: finite(data.entryPrice),
    closePrice: data.closePrice == null ? undefined : finite(data.closePrice),
    markPrice: data.markPrice == null ? undefined : finite(data.markPrice),
    size: finite(data.size),
    collateral: finite(data.collateral),
    pnl: finite(data.pnl),
    pnlPct: finite(data.pnlPct),
    status: data.status === 'CLOSED' || data.status === 'LIQUIDATED' ? data.status : 'OPEN',
  }), [data]);

  const requestClose = useCallback(() => {
    if (closing || exporting) return;
    setClosing(true);
    window.setTimeout(onClose, 180);
  }, [closing, exporting, onClose]);

  useEffect(() => { requestCloseRef.current = requestClose; }, [requestClose]);
  useEffect(() => { exportingRef.current = exporting; }, [exporting]);

  useEffect(() => {
    if (!isOpen) return;
    setClosing(false);
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !exportingRef.current) requestCloseRef.current();
      if (event.key !== 'Tab') return;
      const panel = canvasRef.current?.closest('[role="dialog"]');
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex="-1"])'));
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKeyDown);
    requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus();
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
    };
  }, [isOpen]);

  const renderToCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas preview is unavailable in this browser.');
    const W = canvas.width, H = canvas.height;

    const isLight   = bgStyle === 'light';
    const pnlUp     = safeData.pnl >= 0;
    const sideColor = safeData.side === 'LONG' ? (isLight ? '#398356' : '#77c995') : (isLight ? '#c65c5a' : '#df7774');
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
    barGlow.addColorStop(0, safeData.side === 'LONG' ? (isLight ? 'rgba(22,163,74,0.12)' : 'rgba(34,197,94,0.15)') : (isLight ? 'rgba(220,38,38,0.12)' : 'rgba(255,80,80,0.15)'));
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
    roundedPath(ctx, badgeX, badgeY, badgeW, badgeH, 8); ctx.fill();
    ctx.strokeStyle = isLight ? 'rgba(85,122,98,0.24)' : 'rgba(145,185,159,0.3)'; ctx.lineWidth = 1;
    roundedPath(ctx, badgeX, badgeY, badgeW, badgeH, 8); ctx.stroke();
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
    const badge = safeData.status === 'LIQUIDATED' ? '● LIQUIDATED'
      : safeData.status === 'CLOSED' ? (pnlUp ? '● CLOSED IN PROFIT' : '● CLOSED AT LOSS')
      : '● OPEN POSITION';
    // Pill background for status
    ctx.font = '700 9px "Geist Mono", monospace';
    const statusW = ctx.measureText(badge).width + 18;
    ctx.fillStyle = pnlUp
      ? (isLight ? 'rgba(22,163,74,0.1)' : 'rgba(34,197,94,0.1)')
      : (isLight ? 'rgba(220,38,38,0.1)' : 'rgba(255,80,80,0.1)');
    roundedPath(ctx, 48, 134, statusW, 20, 5); ctx.fill();
    ctx.fillStyle = pnlColor; ctx.textBaseline = 'middle';
    ctx.fillText(badge, 57, 144);

    // ── Pair + Side + Leverage ────────────────────────────────────────────
    if (visibleFields.pair || visibleFields.side) {
      let x = 52; const y = 174;
      ctx.textBaseline = 'top';
      if (visibleFields.pair) {
        ctx.font = 'italic 400 80px "Fraunces", "Times New Roman", serif';
        ctx.fillStyle = fgPrimary;
        ctx.fillText(safeData.pair, x, y);
        x += ctx.measureText(safeData.pair).width + 20;
      }
      const tagY = y + 40;
      if (visibleFields.side) {
        // Side pill
        ctx.font = '650 18px "Geist Sans", system-ui, sans-serif';
        const sw = ctx.measureText(safeData.side).width;
        ctx.fillStyle = safeData.side === 'LONG'
          ? (isLight ? 'rgba(22,163,74,0.12)' : 'rgba(34,197,94,0.12)')
          : (isLight ? 'rgba(220,38,38,0.12)' : 'rgba(255,80,80,0.12)');
        roundedPath(ctx, x - 6, tagY - 4, sw + 22, 34, 8); ctx.fill();
        ctx.fillStyle = sideColor;
        ctx.fillText(safeData.side, x + 5, tagY);
        x += sw + 32;
      }
      if (visibleFields.leverage) {
        ctx.font = '600 18px "Geist Sans", system-ui, sans-serif'; ctx.fillStyle = fgMuted;
        ctx.fillText(`${safeData.leverage}×`, x, tagY);
      }
    }

    // ── PnL hero ─────────────────────────────────────────────────────────
    if (visibleFields.pnl) {
      const pnlY = 270;
      ctx.font = '700 9px "Geist Mono", monospace'; ctx.fillStyle = fgMuted; ctx.textBaseline = 'top';
      ctx.textAlign = 'center';
      ctx.fillText(safeData.status === 'OPEN' ? 'UNREALISED PnL' : 'REALISED PnL', W / 2, pnlY);

      const pnlStr = (pnlUp ? '+' : '-') + '$' + Math.abs(safeData.pnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      ctx.font = 'italic 400 92px "Fraunces", "Times New Roman", serif'; ctx.fillStyle = pnlColor;
      ctx.textBaseline = 'top';
      const pnlWidth = ctx.measureText(pnlStr).width;
      if (pnlWidth > W - 160) {
        ctx.font = `italic 400 ${Math.floor(92 * (W - 160) / pnlWidth)}px "Fraunces", "Times New Roman", serif`;
      }
      ctx.fillText(pnlStr, W / 2, pnlY + 18);

      // Percentage badge
      const pctStr = (safeData.pnlPct >= 0 ? '+' : '') + safeData.pnlPct.toFixed(2) + '%';
      ctx.font = '600 20px "Geist Sans", system-ui, sans-serif';
      const pctW = ctx.measureText(pctStr).width;
      const pctX = W / 2 - (pctW + 22) / 2, pctY = pnlY + 18 + 90;
      ctx.fillStyle = pnlUp
        ? (isLight ? 'rgba(22,163,74,0.12)' : 'rgba(34,197,94,0.12)')
        : (isLight ? 'rgba(220,38,38,0.12)' : 'rgba(255,80,80,0.12)');
      roundedPath(ctx, pctX, pctY - 4, pctW + 22, 36, 10); ctx.fill();
      ctx.fillStyle = pnlColor;
      ctx.fillText(pctStr, W / 2, pctY);
      ctx.textAlign = 'left';
    }

    // ── Stat strip ────────────────────────────────────────────────────────
    const stats: { label: string; value: string }[] = [];
    if (visibleFields.entryPrice) stats.push({ label: 'ENTRY', value: '$' + safeData.entryPrice.toLocaleString('en-US', { maximumFractionDigits: 4 }) });
    if (visibleFields.closePrice && safeData.closePrice != null) stats.push({ label: 'CLOSE', value: '$' + safeData.closePrice.toLocaleString('en-US', { maximumFractionDigits: 4 }) });
    if (visibleFields.markPrice && safeData.markPrice != null && safeData.status === 'OPEN') stats.push({ label: 'MARK', value: '$' + safeData.markPrice.toLocaleString('en-US', { maximumFractionDigits: 4 }) });
    if (visibleFields.size) stats.push({ label: 'SIZE', value: '$' + safeData.size.toLocaleString('en-US', { maximumFractionDigits: 2 }) });
    if (visibleFields.collateral) stats.push({ label: 'COLLATERAL', value: '$' + safeData.collateral.toLocaleString('en-US', { maximumFractionDigits: 2 }) });

    if (stats.length > 0) {
      const stripY = 510, stripX = 48, stripW = W - 96;
      const gap = 10, colW = (stripW - gap * (stats.length - 1)) / stats.length;
      stats.forEach((s, i) => {
        const cx = stripX + (colW + gap) * i;
        // Card body
        ctx.fillStyle = cardBg;
        roundedPath(ctx, cx, stripY, colW, 88, 14); ctx.fill();
        // Top shimmer line
        const shimmer = ctx.createLinearGradient(cx, stripY, cx + colW, stripY);
        shimmer.addColorStop(0, 'transparent');
        shimmer.addColorStop(0.5, isLight ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.1)');
        shimmer.addColorStop(1, 'transparent');
        ctx.fillStyle = shimmer;
        roundedPath(ctx, cx + 1, stripY, colW - 2, 2, 2); ctx.fill();
        // Border
        ctx.strokeStyle = cardBorder; ctx.lineWidth = 1;
        roundedPath(ctx, cx, stripY, colW, 88, 14); ctx.stroke();
        // Label
        ctx.font = '700 9px "Geist Mono", monospace'; ctx.fillStyle = fgMuted; ctx.textBaseline = 'top';
        ctx.fillText(s.label, cx + 18, stripY + 18);
        // Value
        ctx.font = '600 22px "Geist Sans", system-ui, sans-serif'; ctx.fillStyle = fgPrimary;
        ctx.fillText(s.value, cx + 18, stripY + 44);
      });
    }

    // ── Footer ────────────────────────────────────────────────────────────
    // Subtle divider above footer
    ctx.strokeStyle = isLight ? 'rgba(15,17,23,0.07)' : 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(48, H - 52); ctx.lineTo(W - 48, H - 52); ctx.stroke();

    if (visibleFields.handle && safeData.traderHandle) {
      const handle = safeData.traderHandle.startsWith('@') ? safeData.traderHandle : '@' + safeData.traderHandle;
      ctx.font = '700 12px "Geist Mono", monospace'; ctx.fillStyle = accent;
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillText(handle, 52, H - 28);
    }
    ctx.font = '500 9px "Geist Mono", monospace'; ctx.fillStyle = fgSubtle;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText('Velo Perps Testnet · For illustrative purposes only', W - 48, H - 28);
    ctx.textAlign = 'left';
  }, [bgStyle, visibleFields, safeData]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    const draw = () => {
      if (!active) return;
      const renderVersion = ++renderVersionRef.current;
      renderedPngRef.current = null;
      setPngReady(false);
      try {
        renderToCanvas();
        setFeedback('');
        setFeedbackError(false);
        const canvas = canvasRef.current;
        if (canvas) {
          void canvasPng(canvas).then(blob => {
            if (!active || renderVersion !== renderVersionRef.current) return;
            renderedPngRef.current = blob;
            setPngReady(true);
          }).catch(error => {
            if (!active || renderVersion !== renderVersionRef.current) return;
            console.error('[velo] share card image preparation failed:', error);
          });
        }
      } catch (error) {
        console.error('[velo] share card render failed:', error);
        setFeedback('Preview could not be rendered in this browser. You can still try downloading the card.');
        setFeedbackError(true);
      }
    };
    draw();
    if ('fonts' in document) void document.fonts.ready.then(draw);
    return () => { active = false; };
  }, [isOpen, renderToCanvas]);

  const fileName = `velo-${safeFilePart(safeData.pair.replace('/', '-'))}-${safeData.side.toLowerCase()}.png`;

  const downloadBlob = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleDownload = async () => {
    const canvas = canvasRef.current;
    if (!canvas || exporting) return;
    setExporting(true);
    setFeedback('Preparing your Velo trade card…');
    setFeedbackError(false);
    try {
      downloadBlob(renderedPngRef.current ?? await canvasPng(canvas));
      setFeedback('PNG downloaded.');
    } catch (error) {
      console.error('[velo] share card download failed:', error);
      setFeedback('The card could not be exported. Please try again in a supported browser.');
      setFeedbackError(true);
    } finally {
      setExporting(false);
    }
  };

  const handleShare = async () => {
    const canvas = canvasRef.current;
    if (!canvas || exporting) return;
    setExporting(true);
    setFeedback('Preparing your Velo trade card…');
    setFeedbackError(false);
    try {
      const blob = renderedPngRef.current ?? await canvasPng(canvas);
      const file = new File([blob], fileName, { type: 'image/png' });
      const navAny = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean;
        share?: (data: ShareData) => Promise<void>;
      };
      if (navAny.share && (!navAny.canShare || navAny.canShare({ files: [file] }))) {
        try {
          const sharePromise = navAny.share({
            title: `${safeData.pair} ${safeData.side} on Velo`,
            text: `${safeData.pnl >= 0 ? '+' : '-'}$${Math.abs(safeData.pnl).toFixed(2)} · ${safeData.leverage}× · Velo testnet`,
            files: [file],
          });
          await sharePromise;
          setFeedback('Trade card shared.');
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            setFeedback('');
          } else {
            throw error;
          }
        }
      } else if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setCopied(true);
        setFeedback('Image copied. Paste it into your post or message.');
        if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
        copyTimerRef.current = window.setTimeout(() => setCopied(false), 2200);
      } else {
        downloadBlob(blob);
        setFeedback('PNG downloaded. Attach it to your post or message.');
      }
    } catch (error) {
      console.error('[velo] share card export failed:', error);
      try {
        downloadBlob(await canvasPng(canvas));
        setFeedback('Sharing is unavailable here, so the PNG was downloaded instead.');
      } catch (downloadError) {
        console.error('[velo] share card fallback failed:', downloadError);
        setFeedback('Could not create the trade card. Please try again.');
        setFeedbackError(true);
      }
    } finally {
      setExporting(false);
    }
  };

  const toggleField = (k: FieldKey) => setVisibleFields((p) => ({ ...p, [k]: !p[k] }));
  if (!isOpen) return null;

  const BG_OPTIONS: { id: BgStyle; label: string; swatch: string }[] = [
    { id: 'obsidian', label: 'Obsidian', swatch: 'linear-gradient(135deg, #090d0b 0%, #19211c 100%)' },
    { id: 'gradient', label: 'Forest', swatch: 'linear-gradient(135deg, #111a14 0%, #1d2a21 52%, #557a64 100%)' },
    { id: 'hologram', label: 'Sage Glass', swatch: 'linear-gradient(135deg, #0b100d 0%, #27382d 52%, #91b99f 100%)' },
    { id: 'light',    label: 'Light',    swatch: 'linear-gradient(135deg, #e2ebe3 0%, #cfdfd1 100%)' },
  ];

  return createPortal((
    <div role="dialog" aria-modal="true" aria-labelledby="velo-share-title" aria-describedby="velo-share-feedback"
      className={`velo-modal-enter-backdrop${closing ? ' velo-modal-closing' : ''}`}
      onClick={(e) => { if (e.target === e.currentTarget) requestClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'var(--overlay)', backdropFilter: 'blur(22px) saturate(1.18)' }}>
      <div className="velo-modal-enter-card" style={{ width: '100%', maxWidth: 760, borderRadius: 20, background: 'var(--glass-bg-strong)', border: '1px solid var(--glass-border)', boxShadow: 'var(--glass-shadow)', backdropFilter: 'blur(32px)', overflow: 'hidden', maxHeight: 'min(92dvh, 860px)', display: 'flex', flexDirection: 'column' as const }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 18px', borderBottom: '1px solid var(--hairline)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Share2 size={15} style={{ color: 'var(--accent-text)' }} />
            <div>
              <div id="velo-share-title" style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', color: 'var(--fg)', fontSize: 18, lineHeight: 1.15 }}>Share trade</div>
              <div style={{ ...S.label, marginTop: 3 }}>{safeData.pair} · {safeData.side} · {safeData.status.toLowerCase()}</div>
            </div>
          </div>
          <button ref={closeButtonRef} onClick={requestClose} aria-label="Close share trade dialog" title="Close" className="velo-modal-icon-button"><X size={17} /></button>
        </div>

        {/* Canvas Preview */}
        <div style={{ padding: '16px clamp(12px, 3vw, 22px)', background: 'var(--surface-inset)', overflowY: 'auto' as const, flex: '1 1 auto', minHeight: 0 }}>
          <canvas ref={canvasRef} width={1200} height={675}
            aria-label={`Preview of ${safeData.pair} ${safeData.side} trade card`}
            style={{ width: '100%', height: 'auto', borderRadius: 10, display: 'block', background: '#0a0e0c', boxShadow: '0 18px 44px -28px rgba(0,0,0,0.62), 0 0 0 1px var(--glass-border)' }} />
        </div>

        {/* Controls */}
        <div style={{ padding: '12px 16px max(14px, env(safe-area-inset-bottom))', borderTop: '1px solid var(--hairline)', display: 'flex', flexDirection: 'column' as const, gap: 9, flexShrink: 0 }}>

          {/* Action row */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleDownload} disabled={exporting} className="velo-button velo-button--secondary" style={{ flex: 1 }}>
              <Download size={14} /> Download PNG
            </button>
            <button onClick={handleShare} disabled={exporting || !pngReady} className="velo-button velo-button--primary" style={{ flex: 1.4 }}>
              {exporting || !pngReady ? <><span className="velo-inline-spinner" aria-hidden="true" /> Preparing…</> : copied ? <><Check size={14} /> Copied</> : <><Share2 size={14} /> Share card</>}
            </button>
          </div>

          <div id="velo-share-feedback" role="status" aria-live="polite" style={{ minHeight: 16, font: '500 12px/1.35 var(--font-sans)', color: feedbackError ? 'var(--pnl-down)' : 'var(--fg-subtle)' }}>
            {feedback}
          </div>

          {/* Customize toggle */}
          <button onClick={() => setTweakOpen((p) => !p)} aria-expanded={tweakOpen} className="velo-button velo-button--secondary" style={{ width: '100%' }}>
            <Settings size={14} /> {tweakOpen ? 'Hide options' : 'Customize card'}
          </button>

          {tweakOpen && (
            <div className="velo-share-options" style={{ paddingTop: 8, animation: 'veloModalContentIn 180ms cubic-bezier(.2,.7,.2,1) both' }}>
              {/* Theme */}
              <div style={{ ...S.label, marginBottom: 8 }}>Theme</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                {BG_OPTIONS.map(({ id, label, swatch }) => (
                  <button key={id} onClick={() => setBgStyle(id)} aria-pressed={bgStyle === id}
                    style={{ ...S.mono, flex: 1, minWidth: 0, padding: '8px 6px', borderRadius: 8, background: bgStyle === id ? 'color-mix(in oklab, var(--accent) 13%, var(--control-bg))' : 'var(--control-bg)', border: `1px solid ${bgStyle === id ? 'color-mix(in oklab, var(--accent) 48%, var(--control-border))' : 'var(--control-border)'}`, color: bgStyle === id ? 'var(--accent-text)' : 'var(--fg-muted)', fontSize: 9, letterSpacing: '0.04em', textTransform: 'uppercase' as const, cursor: 'pointer', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 24, height: 24, borderRadius: 7, background: swatch, border: '1px solid rgba(255,255,255,0.14)', display: 'block', flexShrink: 0 }} />
                    {label}
                  </button>
                ))}
              </div>

              {/* Fields */}
              <div style={{ ...S.label, marginBottom: 8 }}>Visible Fields</div>
              <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 5 }}>
                {(Object.keys(FIELD_LABELS) as FieldKey[]).map((k) => (
                  <button key={k} onClick={() => toggleField(k)} aria-pressed={visibleFields[k]}
                    style={{ ...S.mono, padding: '7px 10px', borderRadius: 7, background: visibleFields[k] ? 'color-mix(in oklab, var(--accent) 12%, var(--control-bg))' : 'var(--control-bg)', border: `1px solid ${visibleFields[k] ? 'color-mix(in oklab, var(--accent) 38%, var(--control-border))' : 'var(--control-border)'}`, color: visibleFields[k] ? 'var(--accent-text)' : 'var(--fg-subtle)', fontSize: 9, letterSpacing: '0.03em', textTransform: 'uppercase' as const, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                    {visibleFields[k] ? <Eye size={9} /> : <EyeOff size={9} />} {FIELD_LABELS[k]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  ), document.body);
};
