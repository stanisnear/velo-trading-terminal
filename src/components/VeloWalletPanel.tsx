// VeloWalletPanel — Velo trading wallet display, deep glass branded
import React, { useState } from 'react';
import { Copy, Check, Eye, EyeOff, AlertTriangle, KeyRound, RefreshCw, ShieldCheck } from 'lucide-react';
import { exportPrivateKey, shortAddr, type VeloBurnerWallet } from '../services/veloBurnerWallet';

interface Props {
  burner: VeloBurnerWallet;
  ethBal: number;
  usdcBal: number;
  onRederive?: () => void;
  compact?: boolean;
}

const M = {
  mono:    { fontFamily: 'var(--font-mono)' } as React.CSSProperties,
  display: { fontFamily: 'var(--font-display)', fontStyle: 'italic' as const, letterSpacing: '-0.02em' } as React.CSSProperties,
  label:   { fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)' } as React.CSSProperties,
};

export const VeloWalletPanel: React.FC<Props> = ({ burner, ethBal, usdcBal, onRederive, compact }) => {
  const [revealed,   setRevealed]   = useState(false);
  const [confirmed,  setConfirmed]  = useState(false);
  const [copiedAddr, setCopiedAddr] = useState(false);
  const [copiedKey,  setCopiedKey]  = useState(false);

  const privateKey = revealed ? exportPrivateKey(burner.ownerAddress) : null;

  const copyAddr = async () => {
    await navigator.clipboard.writeText(burner.veloAddress).catch(() => {});
    setCopiedAddr(true); setTimeout(() => setCopiedAddr(false), 1500);
  };
  const copyKey = async () => {
    if (!privateKey) return;
    await navigator.clipboard.writeText(privateKey).catch(() => {});
    setCopiedKey(true); setTimeout(() => setCopiedKey(false), 1500);
  };

  return (
    <div style={{
      padding: compact ? 12 : 16,
      borderRadius: 20,
      background: 'linear-gradient(145deg, oklch(0.45 0.26 295 / 0.08), oklch(0.65 0.22 268 / 0.03))',
      border: '1px solid oklch(0.45 0.26 295 / 0.2)',
      boxShadow: '0 2px 16px -8px oklch(0.55 0.24 295 / 0.18)',
      display: 'flex', flexDirection: 'column', gap: compact ? 10 : 14,
      position: 'relative', overflow: 'hidden',
    }}>
      {/* 3D depth shimmer */}
      <div style={{ position: 'absolute', top: -30, right: -30, width: 130, height: 130, borderRadius: '50%', background: 'radial-gradient(circle, oklch(0.55 0.24 295 / 0.07) 0%, transparent 70%)', pointerEvents: 'none' }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}>
        <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg, oklch(0.45 0.26 295), oklch(0.65 0.22 268))', boxShadow: '0 4px 12px oklch(0.55 0.24 295 / 0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 80% at 25% 10%, rgba(255,255,255,0.28), transparent 55%)' }} />
          <ShieldCheck size={16} color="#fff" style={{ position: 'relative', zIndex: 1 }} />
        </div>
        <span style={{ ...M.display, fontSize: compact ? 13 : 15, color: 'var(--fg)' }}>Velo Trading Wallet</span>
        <span style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: 999, background: 'oklch(0.80 0.18 150 / 0.1)', border: '1px solid oklch(0.80 0.18 150 / 0.25)', color: 'var(--pnl-up)', fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, fontFamily: 'var(--font-mono)' }}>Active</span>
      </div>

      {!compact && (
        <p style={{ ...M.mono, fontSize: 11, color: 'var(--fg-subtle)', lineHeight: 1.55, margin: 0 }}>
          Derived from your main wallet. Holds trading funds and signs orders locally — no popups while trading.
        </p>
      )}

      {/* Address */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={M.label}>Velo Address</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: 'oklch(0 0 0 / 0.06)', border: '1px solid var(--hairline)', borderRadius: 10 }}>
          <span style={{ ...M.mono, fontSize: 11, color: 'var(--fg)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{burner.veloAddress}</span>
          <button onClick={copyAddr} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: copiedAddr ? 'var(--pnl-up)' : 'var(--fg-subtle)', display: 'flex', padding: 2 }}>
            {copiedAddr ? <Check size={13}/> : <Copy size={13}/>}
          </button>
        </div>
        <span style={{ ...M.mono, fontSize: 9, color: 'var(--fg-subtle)' }}>Owner: {shortAddr(burner.ownerAddress)}</span>
      </div>

      {/* Balances */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[
          { label: 'ETH (gas)', value: ethBal.toFixed(5), hi: false },
          { label: 'USDC', value: usdcBal.toFixed(2), hi: usdcBal > 0 },
        ].map(({ label, value, hi }) => (
          <div key={label} style={{ padding: '10px 12px', background: 'oklch(0 0 0 / 0.05)', border: '1px solid var(--hairline)', borderRadius: 10 }}>
            <div style={M.label}>{label}</div>
            <div style={{ ...M.mono, fontSize: 14, color: hi ? 'var(--pnl-up)' : parseFloat(value) === 0 ? 'var(--fg-subtle)' : 'var(--fg)', fontWeight: 700, marginTop: 3 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
        {!revealed ? (
          <GhostBtn onClick={() => setConfirmed(true)} style={{ flex: 1, minWidth: 130 }}><KeyRound size={11}/> Reveal Private Key</GhostBtn>
        ) : (
          <GhostBtn onClick={() => { setRevealed(false); setConfirmed(false); }} style={{ flex: 1, minWidth: 130 }}><EyeOff size={11}/> Hide Key</GhostBtn>
        )}
        {onRederive && <GhostBtn onClick={onRederive} style={{ flex: 1, minWidth: 130 }}><RefreshCw size={11}/> Re-derive</GhostBtn>}
      </div>

      {/* Confirm gate */}
      {confirmed && !revealed && (
        <div style={{ padding: 12, background: 'oklch(0.66 0.22 25 / 0.07)', border: '1px solid oklch(0.66 0.22 25 / 0.25)', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <AlertTriangle size={14} style={{ color: 'var(--pnl-down)', flexShrink: 0, marginTop: 1 }}/>
            <div style={{ ...M.mono, fontSize: 11, color: 'var(--fg-muted)', lineHeight: 1.55 }}>
              Anyone with this key controls your Velo funds. Only reveal to import into MetaMask or Rabby. Never share it.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => { setRevealed(true); setConfirmed(false); }} style={{ flex: 1, padding: '9px 12px', borderRadius: 10, background: 'oklch(0.66 0.22 25 / 0.12)', border: '1px solid oklch(0.66 0.22 25 / 0.4)', color: 'oklch(0.85 0.18 25)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              <Eye size={11}/> I understand — show me
            </button>
            <GhostBtn onClick={() => setConfirmed(false)} style={{ flex: 1 }}>Cancel</GhostBtn>
          </div>
        </div>
      )}

      {/* Private key */}
      {revealed && privateKey && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 12, background: 'oklch(0.66 0.22 25 / 0.07)', border: '1px solid oklch(0.66 0.22 25 / 0.28)', borderRadius: 12 }}>
          <span style={{ ...M.label, color: 'var(--pnl-down)' }}>Private Key (KEEP SECRET)</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ ...M.mono, fontSize: 11, color: 'var(--fg)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{privateKey}</span>
            <button onClick={copyKey} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: copiedKey ? 'var(--pnl-up)' : 'var(--fg-subtle)', display: 'flex', padding: 2 }}>
              {copiedKey ? <Check size={13}/> : <Copy size={13}/>}
            </button>
          </div>
          <span style={{ ...M.mono, fontSize: 9, color: 'var(--fg-subtle)' }}>
            MetaMask: Account menu → Add account → Import account → Paste
          </span>
        </div>
      )}
    </div>
  );
};

const GhostBtn: React.FC<{ onClick: () => void; children: React.ReactNode; style?: React.CSSProperties }> = ({ onClick, children, style }) => (
  <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 12px', borderRadius: 10, background: 'var(--chip-bg)', border: '1px solid var(--hairline-strong)', color: 'var(--fg-muted)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const, transition: 'background 0.14s', ...style }}
    onMouseEnter={e=>(e.currentTarget.style.background='var(--chip-bg-hover)')} onMouseLeave={e=>(e.currentTarget.style.background='var(--chip-bg)')}>
    {children}
  </button>
);
