import React, { useEffect } from 'react';
import { RefreshCw, CheckCircle, AlertCircle, Info } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════
// VELO SHARED UI — Brand-aligned components
// ═══════════════════════════════════════════════════════════════

// --- Sound Service ---
export const playSound = (type: 'SUCCESS' | 'ERROR' | 'OPEN' | 'CLOSE' | 'CLICK') => {
    try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        const now = ctx.currentTime;
        if (type === 'SUCCESS') { osc.type = 'sine'; osc.frequency.setValueAtTime(523.25, now); osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.1); gain.gain.setValueAtTime(0.05, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4); osc.start(now); osc.stop(now + 0.4); }
        else if (type === 'ERROR') { osc.type = 'triangle'; osc.frequency.setValueAtTime(150, now); osc.frequency.linearRampToValueAtTime(100, now + 0.15); gain.gain.setValueAtTime(0.05, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2); osc.start(now); osc.stop(now + 0.2); }
        else if (type === 'OPEN') { osc.type = 'sine'; osc.frequency.setValueAtTime(880, now); gain.gain.setValueAtTime(0.05, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15); osc.start(now); osc.stop(now + 0.15); }
        else if (type === 'CLOSE') { osc.type = 'sine'; osc.frequency.setValueAtTime(440, now); gain.gain.setValueAtTime(0.03, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1); osc.start(now); osc.stop(now + 0.1); }
        else { osc.type = 'sine'; osc.frequency.setValueAtTime(1200, now); gain.gain.setValueAtTime(0.01, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03); osc.start(now); osc.stop(now + 0.03); }
    } catch (e) { /* Ignore audio context errors */ }
};

// --- Formatting ---
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
export const formatTime = (timestamp: number) => new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

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
export const GlassCard = ({ children, className = '', onClick }: { children: React.ReactNode, className?: string, onClick?: (e: any) => void }) => (
    <div onClick={onClick}
        className={`glass-panel rounded-[22px] p-5 transition-all duration-200
        ${onClick ? 'cursor-pointer hover:-translate-y-[1px]' : ''}
        ${className}`}
        style={{ color: 'var(--fg)' }}>
        {children}
    </div>
);

// --- Button (brand-aligned) ---
export const Button = ({ children, onClick, variant = 'primary', className = '', disabled = false, isLoading = false, style }: any) => {
    const base = "px-5 py-2.5 rounded-[14px] font-medium text-sm transition-all duration-150 flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed border";
    const variantStyles: Record<string, React.CSSProperties> = {
        primary: {
            background: 'var(--prism-vivid)',
            backgroundSize: '200% 100%',
            animation: 'prismSlide 14s linear infinite',
            color: 'var(--velo-bone)',
            borderColor: 'transparent',
        },
        secondary: {
            background: 'var(--chip)',
            color: 'var(--fg)',
            borderColor: 'var(--hr-2)',
        },
        danger: {
            background: 'color-mix(in oklab, var(--pnl-down) 14%, transparent)',
            color: 'var(--pnl-down)',
            borderColor: 'color-mix(in oklab, var(--pnl-down) 32%, transparent)',
        },
        success: {
            background: 'var(--pnl-up)',
            color: '#0a1b06',
            borderColor: 'transparent',
        },
        long: {
            background: 'var(--pnl-up)',
            color: '#0a1b06',
            borderColor: 'transparent',
        },
        short: {
            background: 'var(--pnl-down)',
            color: '#ffffff',
            borderColor: 'transparent',
        },
        ghost: {
            background: 'transparent',
            color: 'var(--fg-2)',
            borderColor: 'transparent',
        },
    };
    return (
        <button onClick={(e) => { playSound('CLICK'); onClick && onClick(e); }} disabled={disabled || isLoading}
            className={`${base} ${className}`}
            style={{ ...(variantStyles[variant] || variantStyles.primary), ...style }}>
            {isLoading ? <RefreshCw className="animate-spin" size={16} /> : children}
        </button>
    );
};

// --- Input (glass) ---
export const Input = ({ label, rightLabel, error, className = '', ...props }: any) => (
    <div className="w-full group">
        <div className="flex justify-between mb-1 ml-1">
            {label && <label className="block text-[10px] font-semibold uppercase font-mono transition-colors" style={{ letterSpacing: '0.18em', color: error ? 'var(--pnl-down)' : 'var(--fg-2)' }}>{label}</label>}
            {rightLabel && <span className="text-[10px]" style={{ color: 'var(--fg-3)' }}>{rightLabel}</span>}
        </div>
        <input className={`w-full px-4 py-2 rounded-[12px] glass-input font-mono font-medium text-sm ${className}`} style={{ borderColor: error ? 'var(--pnl-down)' : undefined, color: 'var(--fg)' }} {...props} />
        {error && <p className="text-[10px] mt-1 ml-1 font-semibold" style={{ color: 'var(--pnl-down)' }}>{error}</p>}
    </div>
);

// --- Toast ---
export const ToastNotification = ({ message, type, onClose }: { message: string, type: 'SUCCESS' | 'ERROR' | 'INFO', onClose: () => void }) => {
    useEffect(() => {
        playSound(type === 'SUCCESS' ? 'SUCCESS' : type === 'ERROR' ? 'ERROR' : 'CLICK');
        const timer = setTimeout(onClose, 4000);
        return () => clearTimeout(timer);
    }, []);
    const icons: Record<string, React.ReactNode> = {
        SUCCESS: <CheckCircle size={20} style={{ color: 'var(--pnl-up)' }} />,
        ERROR: <AlertCircle size={20} style={{ color: 'var(--pnl-down)' }} />,
        INFO: <Info size={20} style={{ color: 'var(--velo-blue-ice)' }} />,
    };
    return (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] w-auto pointer-events-none">
            <div className="glass-panel px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 animate-bounce-in pointer-events-auto">
                <div className="shrink-0">{icons[type]}</div>
                <span className="text-sm font-semibold whitespace-nowrap" style={{ color: 'var(--fg)' }}>{message}</span>
            </div>
        </div>
    );
};

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

export const Ico3D = ({ size = 40, tone = 'violet', children }: { size?: number, tone?: 'violet' | 'blue' | 'ice' | 'up' | 'down', children: React.ReactNode }) => {
    const backgrounds: Record<string, string> = {
        violet: 'linear-gradient(160deg, oklch(0.66 0.24 295), oklch(0.34 0.22 285))',
        blue: 'linear-gradient(160deg, oklch(0.74 0.18 245), oklch(0.44 0.20 268))',
        ice: 'linear-gradient(160deg, oklch(0.92 0.06 245), oklch(0.68 0.12 240))',
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
