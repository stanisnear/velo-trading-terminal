// ═══════════════════════════════════════════════════════════════════════════════
// VeloWalletPanel — visual representation of the user's Velo trading wallet
// (the dYdX-style burner wallet derived deterministically from MetaMask).
//
// Renders:
//   • The Velo address (different from MetaMask)
//   • Balances on Velo wallet (ETH for gas, USDC for trading)
//   • A "Reveal Private Key" button that gates the secret behind a confirmation
//   • A "Re-derive from main wallet" button to recover from another device
// ═══════════════════════════════════════════════════════════════════════════════

import React, { useState } from 'react';
import { Copy, Check, Eye, EyeOff, AlertTriangle, KeyRound, RefreshCw, ShieldCheck } from 'lucide-react';
import { exportPrivateKey, shortAddr, type VeloBurnerWallet } from '../services/veloBurnerWallet';

interface Props {
  burner:       VeloBurnerWallet;
  ethBal:       number;
  usdcBal:      number;
  /** Triggered when user clicks "re-derive from main wallet" — host should call rederiveVeloBurner */
  onRederive?:  () => void;
  /** Compact mode for embedded use inside the onboarding modal */
  compact?:     boolean;
}

const M = {
  mono: { fontFamily: 'var(--font-mono)' } as React.CSSProperties,
  display: { fontFamily: 'var(--font-display)', fontStyle: 'italic' as const, letterSpacing: '-0.02em' } as React.CSSProperties,
  label: { fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)' } as React.CSSProperties,
  card: { background: 'oklch(1 0 0/0.03)', border: '1px solid oklch(1 0 0/0.08)', borderRadius: 12 } as React.CSSProperties,
};

const buttonGhost: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '8px 12px', borderRadius: 8,
  background: 'oklch(1 0 0/0.04)',
  border: '1px solid oklch(1 0 0/0.08)',
  color: 'var(--fg-muted)', cursor: 'pointer',
  fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
  letterSpacing: '0.06em', textTransform: 'uppercase',
};

const buttonDanger: React.CSSProperties = {
  ...buttonGhost,
  background: 'oklch(0.66 0.22 25/0.08)',
  border:     '1px solid oklch(0.66 0.22 25/0.25)',
  color:      'var(--pnl-down)',
};

export const VeloWalletPanel: React.FC<Props> = ({ burner, ethBal, usdcBal, onRederive, compact }) => {
  const [revealed, setRevealed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
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
    <div style={{ ...M.card, padding: compact ? 12 : 16, display: 'flex', flexDirection: 'column', gap: compact ? 10 : 14 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ShieldCheck size={14} style={{ color: 'var(--iris-violet)', flexShrink: 0 }} />
        <span style={{ ...M.display, fontSize: compact ? 13 : 15, color: 'var(--fg)' }}>Velo Trading Wallet</span>
        <span style={{
          marginLeft: 'auto',
          padding:   '2px 7px',
          borderRadius: 999,
          background: 'oklch(0.78 0.18 150/0.10)',
          border:     '1px solid oklch(0.78 0.18 150/0.25)',
          color:      'var(--pnl-up)',
          fontSize:   8,
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          fontFamily: 'var(--font-mono)',
        }}>
          Active
        </span>
      </div>

      {!compact && (
        <p style={{ ...M.mono, fontSize: 11, color: 'var(--fg-subtle)', lineHeight: 1.5, margin: 0 }}>
          A separate wallet derived from your main wallet. Holds your trading funds and signs orders locally — no popups while trading.
        </p>
      )}

      {/* Velo Address row */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={M.label}>Velo Address</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'oklch(1 0 0/0.04)', borderRadius: 8 }}>
          <span style={{ ...M.mono, fontSize: 11, color: 'var(--fg)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {burner.veloAddress}
          </span>
          <button onClick={copyAddr} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: copiedAddr ? 'var(--pnl-up)' : 'var(--fg-subtle)', display: 'flex' }}>
            {copiedAddr ? <Check size={13} /> : <Copy size={13} />}
          </button>
        </div>
        <span style={{ ...M.mono, fontSize: 9, color: 'var(--fg-subtle)' }}>
          Owner: {shortAddr(burner.ownerAddress)}
        </span>
      </div>

      {/* Balances */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div style={{ padding: '10px 12px', background: 'oklch(1 0 0/0.03)', borderRadius: 8 }}>
          <div style={M.label}>ETH (gas)</div>
          <div style={{ ...M.mono, fontSize: 14, color: ethBal > 0 ? 'var(--fg)' : 'var(--fg-subtle)', fontWeight: 700, marginTop: 2 }}>
            {ethBal.toFixed(5)}
          </div>
        </div>
        <div style={{ padding: '10px 12px', background: 'oklch(1 0 0/0.03)', borderRadius: 8 }}>
          <div style={M.label}>USDC</div>
          <div style={{ ...M.mono, fontSize: 14, color: usdcBal > 0 ? 'var(--pnl-up)' : 'var(--fg-subtle)', fontWeight: 700, marginTop: 2 }}>
            {usdcBal.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Action row */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {!revealed ? (
          <button onClick={() => setConfirmed(true)} style={{ ...buttonGhost, flex: 1, minWidth: 130 }}>
            <KeyRound size={11} /> Reveal Private Key
          </button>
        ) : (
          <button onClick={() => { setRevealed(false); setConfirmed(false); }} style={{ ...buttonGhost, flex: 1, minWidth: 130 }}>
            <EyeOff size={11} /> Hide Key
          </button>
        )}
        {onRederive && (
          <button onClick={onRederive} style={{ ...buttonGhost, flex: 1, minWidth: 130 }}>
            <RefreshCw size={11} /> Re-derive
          </button>
        )}
      </div>

      {/* Confirmation gate before showing the key */}
      {confirmed && !revealed && (
        <div style={{ padding: 12, background: 'oklch(0.66 0.22 25/0.08)', border: '1px solid oklch(0.66 0.22 25/0.25)', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <AlertTriangle size={14} style={{ color: 'var(--pnl-down)', flexShrink: 0, marginTop: 1 }} />
            <div style={{ ...M.mono, fontSize: 11, color: 'var(--fg-muted)', lineHeight: 1.55 }}>
              Anyone with this private key controls your Velo trading funds. Only reveal it if you want to import this wallet into MetaMask, Rabby, or back it up. Never paste it into a website or share it.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => { setRevealed(true); setConfirmed(false); }} style={{ ...buttonDanger, flex: 1 }}>
              <Eye size={11} /> I understand — show me
            </button>
            <button onClick={() => setConfirmed(false)} style={{ ...buttonGhost, flex: 1 }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* The actual key, when revealed */}
      {revealed && privateKey && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 12, background: 'oklch(0.66 0.22 25/0.08)', border: '1px solid oklch(0.66 0.22 25/0.30)', borderRadius: 10 }}>
          <span style={{ ...M.label, color: 'var(--pnl-down)' }}>Private Key (KEEP SECRET)</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ ...M.mono, fontSize: 11, color: 'var(--fg)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {privateKey}
            </span>
            <button onClick={copyKey} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: copiedKey ? 'var(--pnl-up)' : 'var(--fg-subtle)', display: 'flex' }}>
              {copiedKey ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>
          <span style={{ ...M.mono, fontSize: 9, color: 'var(--fg-subtle)' }}>
            Tip: Import into MetaMask via "Add account → Import account → Paste private key"
          </span>
        </div>
      )}

    </div>
  );
};
