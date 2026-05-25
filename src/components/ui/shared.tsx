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
export const isVerifiedUser = (userId: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);

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
        className={`glass-panel rounded-[20px] p-5 transition-all duration-300
        text-gray-900 dark:text-white
        ${onClick ? 'cursor-pointer hover:border-white/20 dark:hover:border-white/15' : ''}
        ${className}`}>
        {children}
    </div>
);

// --- Button (brand-aligned) ---
export const Button = ({ children, onClick, variant = 'primary', className = '', disabled = false, isLoading = false }: any) => {
    const base = "px-5 py-2.5 rounded-[14px] font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed";
    const variants: Record<string, string> = {
        primary: "bg-[var(--iris-violet)] hover:brightness-110 text-white shadow-lg shadow-purple-500/20",
        secondary: "bg-[var(--chip-bg)] text-[var(--fg)] hover:bg-[var(--chip-bg-hover)] border border-[var(--hairline-strong)]",
        danger: "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/10",
        success: "bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/20",
        ghost: "bg-transparent text-[var(--fg-muted)] hover:text-white hover:bg-white/5",
    };
    return (
        <button onClick={(e) => { playSound('CLICK'); onClick && onClick(e); }} disabled={disabled || isLoading}
            className={`${base} ${variants[variant] || variants.primary} ${className}`}>
            {isLoading ? <RefreshCw className="animate-spin" size={16} /> : children}
        </button>
    );
};

// --- Input (glass) ---
export const Input = ({ label, rightLabel, error, className = '', ...props }: any) => (
    <div className="w-full group">
        <div className="flex justify-between mb-1 ml-1">
            {label && <label className={`block text-[10px] font-semibold uppercase tracking-wider font-mono transition-colors ${error ? 'text-red-400' : 'text-[var(--fg-muted)] group-focus-within:text-[var(--iris-violet)]'}`}>{label}</label>}
            {rightLabel && <span className="text-[10px] text-[var(--fg-subtle)]">{rightLabel}</span>}
        </div>
        <input className={`w-full px-4 py-2 rounded-[12px] glass-input text-white placeholder-[var(--fg-subtle)] font-mono font-medium text-sm ${error ? 'border-red-500' : ''} ${className}`} {...props} />
        {error && <p className="text-[10px] text-red-400 mt-1 ml-1 font-semibold">{error}</p>}
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
        SUCCESS: <CheckCircle size={20} className="text-emerald-400" />,
        ERROR: <AlertCircle size={20} className="text-red-400" />,
        INFO: <Info size={20} className="text-[var(--iris-cyan)]" />,
    };
    return (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] w-auto pointer-events-none">
            <div className="glass-panel px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 animate-bounce-in pointer-events-auto">
                <div className="shrink-0">{icons[type]}</div>
                <span className="text-sm font-semibold text-white whitespace-nowrap">{message}</span>
            </div>
        </div>
    );
};

// --- Verified Badge (holographic) ---
export const VerifiedBadge = ({ userId, size = 16 }: { userId: string, size?: number }) => {
    if (!isVerifiedUser(userId)) return null;
    return (
        <span title="Verified" className="inline-flex items-center justify-center rounded-full shrink-0"
            style={{ width: size + 2, height: size + 2, background: 'var(--holo-linear)', backgroundSize: '220% 100%', animation: 'holoSlide 9s linear infinite' }}>
            <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none" stroke="#0B0B0E" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
            </svg>
        </span>
    );
};

// --- Velo Logo Bug (holographic squircle with italic V) ---
export const VeloLogoBug = ({ size = 32 }: { size?: number }) => (
    <div className="velo-logo-bug" style={{ width: size, height: size }}>
        <span className="relative z-10 text-[#0B0B0E] font-display italic leading-none" style={{ fontSize: size * 0.6, letterSpacing: '-0.06em' }}>V</span>
    </div>
);
