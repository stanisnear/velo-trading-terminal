import { ActionContent } from './ProductMotion';
import React, { useEffect, useId, useRef, useState } from 'react';
import { RefreshCw, CheckCircle, AlertCircle, Info, X } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════
// VELO SHARED UI — Brand-aligned components
// ═══════════════════════════════════════════════════════════════

import { playInterfaceSound as playSound } from '../../services/interfaceSound';
export { playInterfaceSound as playSound } from '../../services/interfaceSound';

// --- Formatting ---
// ── Velo wordmark — THE brand mark (Fraunces italic, navbar treatment). ────
// shimmer=true adds the landing's wsheen sweep; never use a boxed "V".
export const VeloWordmark = ({ size = 28, shimmer = false, style = {} }: { size?: number; shimmer?: boolean; style?: React.CSSProperties }) => (
    <span className={shimmer ? 'velo-wshimmer' : undefined} style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: size, letterSpacing: '-0.04em', lineHeight: 1, color: 'var(--fg)', display: 'inline-block', userSelect: 'none', ...style }}>Velo</span>
);

export const formatMoney = (amount: number | undefined | null) => {
    if (amount === undefined || amount === null) return '0.00';
    return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
export const formatPrice = (price: number | undefined | null) => {
    if (price === undefined || price === null) return '0.00';
    if (price < 0.0001) return price.toFixed(8);
    if (price < 0.01) return price.toFixed(6);
    if (price < 1) return price.toFixed(4);
    if (price < 10) return price.toFixed(4);
    return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
// --- Verified ---
// Admin-controlled. Pass either a `reason` directly, OR `userId` + `traders`
// and the badge looks it up. If no reason is set, the badge renders nothing.
// Before build 80 the badge appeared for every Supabase UUID; that was the
// wrong default and is no longer used.
export const isVerifiedUser = (userId: string, traders?: any[]): boolean => {
    if (!traders) return false;
    const t = traders.find((tr: any) => tr.id === userId);
    return !!(t && t.verifiedReason);
};

const VERIFICATION_LABELS_LOCAL: Record<string, string> = {
    VELO_TEAM:       'VELO Team',
    FOUNDER:         'Founder',
    INVESTOR:        'Investor',
    CONTRIBUTOR:     'Contributor',
    VERIFIED_TESTER: 'Verified Tester',
    PARTNER:         'Partner',
};

export const calculateStats = (tradeHistory: any[]) => {
    if (!tradeHistory || tradeHistory.length === 0) return { winRate: 0, realizedPnl: 0, totalTrades: 0, fees: 0 };
    const closed = tradeHistory.filter(t => t.action === 'CLOSE' || (!t.action && t.pnl !== 0));
    const wins = closed.filter(t => t.pnl > 0).length;
    // Fees: 0.1% open + 0.1% close = 0.2% round-trip on the notional. Each
    // trade-history row's `size` is the notional. Cumulative fees ≈ Σ size × 0.002.
    const fees = closed.reduce((a, t) => a + ((t.size || 0) * 0.002), 0);
    return { winRate: closed.length > 0 ? (wins / closed.length) * 100 : 0, realizedPnl: closed.reduce((a, t) => a + t.pnl, 0), totalTrades: closed.length, fees };
};

// --- Glass Card (liquid glass panel) ---
// --- Button (brand-aligned) ---
// --- Input (glass) ---
// --- Toast ---
// --- Verified Badge (holographic) ---
interface VerifiedBadgeProps {
    userId?: string;
    traders?: any[];
    reason?: string | null;
    size?: number;
}
export const VerifiedBadge = ({ userId, traders, reason, size = 16 }: VerifiedBadgeProps) => {
    let resolvedReason: string | null | undefined = reason;
    if (!resolvedReason && userId && traders) {
        const t = traders.find((tr: any) => tr.id === userId);
        resolvedReason = t?.verifiedReason || null;
    }
    if (!resolvedReason) return null;
    const tooltip = VERIFICATION_LABELS_LOCAL[resolvedReason] || 'Verified';
    return (
        <span title={tooltip} aria-label={`Verified — ${tooltip}`} className="inline-flex items-center justify-center rounded-full shrink-0"
            style={{ width: size + 2, height: size + 2, background: 'var(--prism-vivid)', backgroundSize: '200% 100%', animation: 'prismSlide 14s linear infinite', cursor: 'help' }}>
            <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none" stroke="#0B0B0E" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
            </svg>
        </span>
    );
};

export const Bug = ({ size = 32 }: { size?: number }) => (
    <div className="bug" style={{ width: size, height: size }}>
        <span className="gl" style={{ fontSize: size * 0.6 }}>V</span>
    </div>
);

export const Wordmark = ({ size = 22, className = '' }: { size?: number, className?: string }) => (
    <span className={`wordmark ${className}`} style={{ fontSize: size }}>Velo</span>
);

export const VeloAssetIcon = ({ src, symbol, size = 32, className = '' }: { src?: string | null; symbol: string; size?: number; className?: string }) => {
  const highResolutionSrc = src?.replace('/standard/', '/large/') || null;
  const [imageSrc, setImageSrc] = useState<string | null>(highResolutionSrc);
  const [hasImage, setHasImage] = useState(false);

  useEffect(() => {
    setImageSrc(highResolutionSrc);
    setHasImage(false);
  }, [highResolutionSrc]);

  return (
    <span className={`velo-asset-icon${hasImage ? ' has-image' : ''} ${className}`} style={{ width: size, height: size }} role="img" aria-label={`${symbol} logo`}>
      <span className="velo-asset-icon__fallback" aria-hidden="true">{symbol.trim().slice(0, 1).toUpperCase()}</span>
      {imageSrc && <img src={imageSrc} alt="" aria-hidden="true" onLoad={() => setHasImage(true)} onError={() => {
        if (src && imageSrc !== src) setImageSrc(src);
        else { setImageSrc(null); setHasImage(false); }
      }} />}
    </span>
  );
};

export const Ico3D = ({ size = 40, tone = 'violet', children }: { size?: number, tone?: 'violet' | 'blue' | 'ice' | 'up' | 'down', children: React.ReactNode }) => {
    const backgrounds: Record<string, string> = {
        violet: 'linear-gradient(160deg, var(--accent), var(--velo-sage-deep))',
        blue: 'linear-gradient(160deg, #718a77, var(--velo-sage))',
        ice: 'linear-gradient(160deg, #cbd9ce, var(--velo-sage-bright))',
        up: 'linear-gradient(160deg, oklch(0.88 0.16 152), oklch(0.56 0.18 152))',
        down: 'linear-gradient(160deg, oklch(0.78 0.20 25), oklch(0.52 0.22 25))',
    };
    return (
        <div
            style={{
                width: size,
                height: size,
                borderRadius: Math.round(size * 0.3),
                display: 'grid',
                placeItems: 'center',
                position: 'relative',
                overflow: 'hidden',
                color: tone === 'ice' ? '#0A0B12' : '#fff',
                background: backgrounds[tone],
                boxShadow: '0 18px 40px -14px rgba(0,0,0,0.4)',
            }}
        >
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 80% at 30% 10%, rgba(255,255,255,0.55), transparent 55%)' }} />
            <div style={{ position: 'absolute', inset: 1, borderRadius: Math.round(size * 0.3) - 1, boxShadow: '0 1px 0 rgba(255,255,255,0.4) inset, 0 -1px 0 rgba(0,0,0,0.25) inset' }} />
            <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
        </div>
    );
};

// Backwards-compatible export used elsewhere in the app.
export const VeloLogoBug = Bug;

// ── Atoms migrated from App.tsx (stage 3 of the monolith decomposition) ──────
export const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export const ToastNotification = ({ message, type, onClose }: { message: string, type: 'SUCCESS' | 'ERROR' | 'INFO', onClose: () => void }) => {
    const closeRef = useRef(onClose);
    closeRef.current = onClose;
    useEffect(() => {
        playSound(type === 'SUCCESS' ? 'SUCCESS' : type === 'ERROR' ? 'ERROR' : 'CLICK');
        const timer = setTimeout(() => closeRef.current(), 4000);
        return () => clearTimeout(timer);
    }, [message, type]);

    const accentColor = type === 'SUCCESS' ? 'var(--pnl-up)' : type === 'ERROR' ? 'var(--pnl-down)' : 'var(--iris-violet)';
    const icons = {
        SUCCESS: <CheckCircle size={18} style={{ color: 'var(--pnl-up)' }} fill="currentColor" />,
        ERROR: <AlertCircle size={18} style={{ color: 'var(--pnl-down)' }} fill="currentColor" />,
        INFO: <Info size={18} style={{ color: 'var(--iris-violet)' }} fill="currentColor" />
    };

    return (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] w-auto pointer-events-none">
            <div className="velo-toast pointer-events-auto" role={type === 'ERROR' ? 'alert' : 'status'}>
                <div style={{ flexShrink: 0, color: accentColor }} aria-hidden="true">{icons[type]}</div>
                <span className="velo-toast__message">{message}</span>
                <button type="button" className="velo-toast__close" onClick={onClose} aria-label="Dismiss notification"><X size={14}/></button>
            </div>
        </div>
    )
}

// --- Shared Components ---

export const GlassCard = ({ children, className = '', onClick }: { children: React.ReactNode, className?: string, onClick?: (e: any) => void }) => (
  <div 
    onClick={onClick}
    className={`glass-panel ${onClick ? 'glass-card-interactive cursor-pointer' : ''} rounded-2xl p-5 transition-all duration-300 border text-[var(--fg)]
    ${className}`}
    style={{
        background: 'var(--glass-bg)',
        borderColor: 'var(--glass-border)',
        backdropFilter: 'blur(22px) saturate(1.08)',
        WebkitBackdropFilter: 'blur(22px) saturate(1.08)',
        boxShadow: 'var(--glass-shadow)',
    }}
  >
    {children}
  </div>
);

type VeloButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  isLoading?: boolean;
};

export const Button = ({ children, onClick, variant = 'primary', className = '', disabled = false, isLoading = false, type = 'button', ...props }: VeloButtonProps) => {
  return (
    <button {...props} type={type} onClick={(e) => { playSound('CLICK'); onClick?.(e); }} disabled={disabled || isLoading} aria-busy={isLoading || undefined} className={`velo-button velo-button--${variant} ${className}`}>
      <ActionContent pending={isLoading}>{children}</ActionContent>
    </button>
  );
};

export const Input = ({ label, rightLabel, error, className = '', id, ...props }: any) => {
  const generatedId = useId();
  const inputId = id || generatedId;
  const errorId = `${inputId}-error`;
  return (
  <div className={`velo-field w-full group ${error ? 'velo-field--error' : ''}`}>
    <div className="velo-field__heading flex justify-between mb-1 ml-1">
        {label && <label htmlFor={inputId} className="block text-[10px] font-bold uppercase tracking-wider transition-colors">{label}</label>}
        {rightLabel && <span className="text-[10px]">{rightLabel}</span>}
    </div>
    <div className="relative">
        <input {...props} id={inputId} aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : props['aria-describedby']} className={`velo-input w-full px-4 py-2 rounded-xl font-mono font-medium text-sm ${className}`} />
    </div>
    {error && <p id={errorId} className="velo-field__error text-[10px] mt-1 ml-1 font-bold">{error}</p>}
  </div>
  );
};
