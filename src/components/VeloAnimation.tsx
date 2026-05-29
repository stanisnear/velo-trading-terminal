import React, { useEffect, useRef } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// VeloAnimation — a single, on-brand overlay used across every flow that
// previously had its own bespoke effect. Login, sign-up, logout, deposit,
// withdrawal, order open, and order close all route through this one
// component with a different `kind` prop so the motion language is
// consistent with the VELO brand system (holo foil + radial ambient glow).
// ═══════════════════════════════════════════════════════════════════════════

export type VeloAnimationKind =
  | 'LOGIN'
  | 'REGISTER'
  | 'LOGOUT'
  | 'DEPOSIT'
  | 'WITHDRAW'
  | 'ORDER_OPEN'
  | 'ORDER_CLOSE';

interface VeloAnimationProps {
  kind: VeloAnimationKind | null;
  onDone: () => void;
  // Optional subtitle: e.g. user name on login, pair+side on order
  label?: string;
  sublabel?: string;
  // Some flows want a slightly longer display
  durationMs?: number;
}

const CONFIG: Record<VeloAnimationKind, { icon: string; tint: string; title: string; accent: string }> = {
  LOGIN:       { icon: '→',  tint: 'oklch(0.68 0.22 295)', title: 'Welcome back',    accent: '#a78bfa' },
  REGISTER:    { icon: '✦',  tint: 'oklch(0.70 0.22 340)', title: 'Account created', accent: '#d946ef' },
  LOGOUT:      { icon: '←',  tint: 'oklch(0.80 0.14 205)', title: 'Signed out',      accent: '#22d3ee' },
  DEPOSIT:     { icon: '↓',  tint: 'oklch(0.78 0.18 150)', title: 'Deposit confirmed',    accent: '#4ade80' },
  WITHDRAW:    { icon: '↑',  tint: 'oklch(0.74 0.18 30)',  title: 'Withdrawal confirmed', accent: '#f97316' },
  ORDER_OPEN:  { icon: '⊕',  tint: 'oklch(0.68 0.22 295)', title: 'Order filled',    accent: '#a78bfa' },
  ORDER_CLOSE: { icon: '⊖',  tint: 'oklch(0.82 0.16 75)',  title: 'Position closed', accent: '#eab308' },
};

export const VeloAnimation: React.FC<VeloAnimationProps> = ({ kind, onDone, label, sublabel, durationMs = 1800 }) => {
  // Keep the latest onDone in a ref so we can call it without putting it in
  // the effect deps. Callers often pass inline arrow functions, which would
  // otherwise retrigger the effect on every parent render and prevent the
  // overlay from ever dismissing.
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  useEffect(() => {
    if (!kind) return;
    const t = setTimeout(() => onDoneRef.current?.(), durationMs);
    return () => clearTimeout(t);
  }, [kind, durationMs]);

  if (!kind) return null;
  const c = CONFIG[kind];

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(7,7,10,0.42)',
        backdropFilter: 'blur(22px) saturate(1.2)',
        WebkitBackdropFilter: 'blur(22px) saturate(1.2)',
        pointerEvents: 'none',
        animation: 'veloAnimFade 0.25s ease',
      }}
    >
      {/* Container */}
      <div
        style={{
          position: 'relative',
          minWidth: 280,
          padding: '30px 36px',
          borderRadius: 22,
          background: 'rgba(14,14,19,0.82)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: `0 24px 64px -20px ${c.tint}, 0 0 0 1px rgba(255,255,255,0.02) inset`,
          overflow: 'hidden',
          animation: 'veloAnimPop 0.45s cubic-bezier(0.34,1.56,0.64,1)',
          textAlign: 'center',
        }}
      >
        {/* Holo foil line at top */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 1,
          background: 'var(--holo-linear)',
          backgroundSize: '220% 100%',
          animation: 'holoSlide 9s linear infinite',
        }} />
        {/* Radial tint glow */}
        <div style={{
          position: 'absolute', inset: 0,
          background: `radial-gradient(circle at 50% 30%, ${c.tint.replace(')', ' / 0.18)')} 0%, transparent 65%)`,
          pointerEvents: 'none',
        }} />

        {/* Animated ring + glyph */}
        <div style={{ position: 'relative', width: 72, height: 72, margin: '0 auto 18px' }}>
          <svg viewBox="0 0 72 72" style={{ width: 72, height: 72, transform: 'rotate(-90deg)' }}>
            <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
            <circle
              cx="36" cy="36" r="30" fill="none"
              stroke={c.accent} strokeWidth="3"
              strokeDasharray="188.5" strokeDashoffset="188.5"
              strokeLinecap="round"
              style={{ animation: 'veloAnimDash 0.7s ease forwards' }}
            />
          </svg>
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'veloAnimGlyph 0.4s 0.5s cubic-bezier(0.34,1.56,0.64,1) both',
            fontFamily: 'var(--font-display)', fontStyle: 'italic',
            fontSize: 34, color: c.accent, lineHeight: 1,
          }}>
            {c.icon}
          </div>
        </div>

        <p style={{
          fontFamily: 'var(--font-display)', fontStyle: 'italic',
          fontSize: 22, fontWeight: 400, letterSpacing: '-0.02em',
          color: '#F4F4F7', marginBottom: label ? 6 : 0,
          animation: 'veloAnimUp 0.4s 0.45s ease both',
        }}>
          {c.title}
        </p>
        {label && (
          <p style={{
            fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600,
            color: c.accent, letterSpacing: '0.06em', textTransform: 'uppercase',
            marginBottom: sublabel ? 4 : 0,
            animation: 'veloAnimUp 0.4s 0.55s ease both',
          }}>
            {label}
          </p>
        )}
        {sublabel && (
          <p style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 500,
            color: 'rgba(244,244,247,0.55)', letterSpacing: '0.04em',
            animation: 'veloAnimUp 0.4s 0.62s ease both',
          }}>
            {sublabel}
          </p>
        )}

        {/* Accent particles — six spokes radiating out */}
        {[...Array(6)].map((_, i) => {
          const a = (i * 60 + 15) * (Math.PI / 180);
          const r = 56;
          const x = Math.cos(a) * r;
          const y = Math.sin(a) * r;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                top: '28%', left: '50%',
                width: 5, height: 5, borderRadius: '50%',
                background: c.accent,
                animation: `veloAnimPart${i} 0.95s ${0.2 + i * 0.06}s ease-out both`,
                ['--tx' as any]: `${x}px`,
                ['--ty' as any]: `${y}px`,
                pointerEvents: 'none',
              }}
            />
          );
        })}
      </div>

      {/* Global keyframes — scoped with unique names so they don't clash */}
      <style>{`
        @keyframes veloAnimFade  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes veloAnimPop   { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
        @keyframes veloAnimDash  { to { stroke-dashoffset: 0; } }
        @keyframes veloAnimGlyph { from { transform: scale(0); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes veloAnimUp    { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        ${[...Array(6)].map((_, i) => `
          @keyframes veloAnimPart${i} {
            from { transform: translate(-50%, -50%) scale(0); opacity: 1; }
            to   { transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) scale(1); opacity: 0; }
          }
        `).join('')}
      `}</style>
    </div>
  );
};
