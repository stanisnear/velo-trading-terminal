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

// ── Atoms migrated from App.tsx (stage 3 of the monolith decomposition) ──────
export const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export const ToastNotification = ({ message, type, onClose }: { message: string, type: 'SUCCESS' | 'ERROR' | 'INFO', onClose: () => void }) => {
    useEffect(() => {
        playSound(type === 'SUCCESS' ? 'SUCCESS' : type === 'ERROR' ? 'ERROR' : 'CLICK');
        const timer = setTimeout(onClose, 4000);
        return () => clearTimeout(timer);
    }, []);

    const accentColor = type === 'SUCCESS' ? 'var(--pnl-up)' : type === 'ERROR' ? 'var(--pnl-down)' : 'var(--iris-violet)';
    const icons = {
        SUCCESS: <CheckCircle size={18} style={{ color: 'var(--pnl-up)' }} fill="currentColor" />,
        ERROR: <AlertCircle size={18} style={{ color: 'var(--pnl-down)' }} fill="currentColor" />,
        INFO: <Info size={18} style={{ color: 'var(--iris-violet)' }} fill="currentColor" />
    };

    return (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] w-auto pointer-events-none">
            <div className="animate-bounce-in pointer-events-auto" style={{
                background: 'var(--glass-bg-strong)',
                border: `1px solid ${accentColor}40`,
                borderRadius: 999,
                boxShadow: `var(--glass-shadow), 0 0 20px ${accentColor}20`,
                backdropFilter: 'blur(16px) saturate(1.3)',
                padding: '10px 20px',
                display: 'flex', alignItems: 'center', gap: 10,
            }}>
                <div style={{ flexShrink: 0 }}>{icons[type]}</div>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 500, color: 'var(--fg)', whiteSpace: 'nowrap' }}>{message}</span>
            </div>
        </div>
    )
}

// --- Shared Components ---

export const GlassCard = ({ children, className = '', onClick }: { children: React.ReactNode, className?: string, onClick?: (e: any) => void }) => (
  <div 
    onClick={onClick}
    className={`glass-panel rounded-3xl p-5 transition-all duration-300 backdrop-blur-3xl border 
    bg-white/60 dark:bg-[#0a0a0a]/60 border-white/40 dark:border-white/10 shadow-2xl shadow-black/5 dark:shadow-black/40
    text-gray-900 dark:text-white backdrop-saturate-150
    ${onClick ? 'cursor-pointer hover:border-purple-500/30 hover:bg-white/70 dark:hover:bg-[#121212]/70' : ''}
    ${className}`}
    style={{
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05), 0 20px 40px -10px rgba(0,0,0,0.1)'
    }}
  >
    {children}
  </div>
);

export const Button = ({ children, onClick, variant = 'primary', className = '', disabled = false, isLoading = false }: any) => {
  const base = "px-5 py-2.5 rounded-xl font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-iris-violet hover:brightness-110 text-white shadow-lg shadow-purple-500/20",
    secondary: "bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-white/10 border border-gray-200 dark:border-white/5",
    danger: "bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/10",
    success: "bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/20",
  };
  return (
    <button onClick={(e) => { playSound('CLICK'); onClick && onClick(e); }} disabled={disabled || isLoading} className={`${base} ${variants[variant as keyof typeof variants]} ${className}`}>
      {isLoading ? <RefreshCw className="animate-spin" size={16}/> : children}
    </button>
  );
};

export const Input = ({ label, rightLabel, error, className = '', ...props }: any) => (
  <div className="w-full group">
    <div className="flex justify-between mb-1 ml-1">
        {label && <label className={`block text-[10px] font-bold uppercase tracking-wider transition-colors ${error ? 'text-red-500' : 'text-gray-500 group-focus-within:text-purple-400'}`}>{label}</label>}
        {rightLabel && <span className="text-[10px] text-gray-400">{rightLabel}</span>}
    </div>
    <div className="relative">
        <input className={`w-full px-4 py-2 rounded-xl bg-gray-50 dark:bg-[#1A1A1A] border focus:border-purple-500 outline-none text-gray-900 dark:text-white placeholder-gray-500 transition-all font-mono font-medium text-sm ${error ? 'border-red-500' : 'border-gray-200 dark:border-white/5'} ${className}`} {...props} />
    </div>
    {error && <p className="text-[10px] text-red-500 mt-1 ml-1 font-bold">{error}</p>}
  </div>
);
