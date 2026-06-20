/**
 * VeloCrossAccountModal — manage the V3 on-chain cross-margin account.
 *
 * Deposit: pulls mUSDC from the trader's wallet into the cross ledger. Used as
 *          collateral for any CROSS-mode positions.
 * Withdraw: pulls mUSDC back to the trader's wallet. Only the free portion
 *           (total - locked) is withdrawable; the rest is held against open
 *           cross positions.
 *
 * All ops are real on-chain transactions on Base Sepolia.
 */
import React, { useEffect, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, CheckCircle2, ExternalLink, Loader2, X, AlertCircle } from 'lucide-react';

const S = {
  display: { fontFamily: 'var(--font-display)', fontStyle: 'italic' as const, letterSpacing: '-0.02em' },
  mono:    { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1', fontVariantNumeric: 'tabular-nums' as const },
  sans:    { fontFamily: 'var(--font-sans)' },
  label:   { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700 as const, textTransform: 'uppercase' as const, letterSpacing: '0.10em', color: 'var(--fg-subtle)' },
};

type Tab = 'DEPOSIT' | 'WITHDRAW';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  walletBalance: number;     // Wallet mUSDC (idle)
  crossFree: number;         // Free cross balance
  crossTotal: number;        // Total cross balance
  crossLocked: number;       // Locked against open cross positions
  deposit:  (amount: number) => Promise<{ txHash: `0x${string}`; explorerUrl: string }>;
  withdraw: (amount: number) => Promise<{ txHash: `0x${string}`; explorerUrl: string }>;
  initialTab?: Tab;
}

export const VeloCrossAccountModal: React.FC<Props> = ({
  isOpen, onClose, walletBalance, crossFree, crossTotal, crossLocked,
  deposit, withdraw, initialTab,
}) => {
  const [tab, setTab] = useState<Tab>(initialTab || 'DEPOSIT');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastTx, setLastTx] = useState<{ hash: `0x${string}`; url: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setTab(initialTab || 'DEPOSIT');
    setAmount('');
    setError('');
    setLastTx(null);
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const amt = parseFloat(amount);
  const cap = tab === 'DEPOSIT' ? walletBalance : crossFree;
  const valid = !isNaN(amt) && amt >= 1 && amt <= cap;

  const submit = async () => {
    if (!valid) return;
    setBusy(true); setError(''); setLastTx(null);
    try {
      const res = tab === 'DEPOSIT' ? await deposit(amt) : await withdraw(amt);
      setLastTx({ hash: res.txHash, url: res.explorerUrl });
      setAmount('');
    } catch (e: any) {
      setError(e?.shortMessage || e?.message || 'Transaction failed');
    } finally {
      setBusy(false);
    }
  };

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div onClick={onClose} className="velo-modal-overlay">
      <div onClick={(e) => e.stopPropagation()} className="velo-modal-card" style={{
        width: '100%', maxWidth: 420, padding: 20, color: 'var(--fg)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ ...S.display, fontSize: 22 }}>Cross Account</div>
            <div style={{ ...S.label, marginTop: 2 }}>On-chain cross margin ledger</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--fg-subtle)', cursor: 'pointer', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* Balance summary */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
          <div style={{ padding: 10, borderRadius: 10, background: 'var(--glass-bg)', border: '1px solid var(--hairline-strong)' }}>
            <div style={S.label}>Free</div>
            <div style={{ ...S.mono, fontSize: 16, marginTop: 2 }}>${fmt(crossFree)}</div>
          </div>
          <div style={{ padding: 10, borderRadius: 10, background: 'var(--glass-bg)', border: '1px solid var(--hairline-strong)' }}>
            <div style={S.label}>Locked</div>
            <div style={{ ...S.mono, fontSize: 16, marginTop: 2 }}>${fmt(crossLocked)}</div>
          </div>
          <div style={{ padding: 10, borderRadius: 10, background: 'var(--glass-bg)', border: '1px solid var(--hairline-strong)' }}>
            <div style={S.label}>Total</div>
            <div style={{ ...S.mono, fontSize: 16, marginTop: 2 }}>${fmt(crossTotal)}</div>
          </div>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 14, padding: 4, background: 'var(--glass-bg)', borderRadius: 10 }}>
          {(['DEPOSIT', 'WITHDRAW'] as Tab[]).map((t) => (
            <button key={t} onClick={() => { setTab(t); setError(''); setLastTx(null); setAmount(''); }}
              style={{
                flex: 1, padding: '8px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                ...S.label,
                background: tab === t ? 'var(--glass-bg-strong)' : 'transparent',
                color: tab === t ? 'var(--fg)' : 'var(--fg-subtle)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
              {t === 'DEPOSIT' ? <ArrowDownCircle size={12} /> : <ArrowUpCircle size={12} />} {t}
            </button>
          ))}
        </div>

        {/* Amount input */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={S.label}>{tab === 'DEPOSIT' ? 'Amount (mUSDC from wallet)' : 'Amount (mUSDC to wallet)'}</div>
            <button onClick={() => setAmount(cap.toFixed(2))} style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              ...S.label, color: 'var(--accent)',
            }}>MAX ${fmt(cap)}</button>
          </div>
          <div style={{ position: 'relative' }}>
            <input
              type="number" step="0.01" min="1" max={cap}
              value={amount} onChange={(e) => { setAmount(e.target.value); setError(''); }}
              placeholder="0.00"
              style={{
                width: '100%', padding: '14px 56px 14px 14px', borderRadius: 10,
                background: 'var(--glass-bg)', border: '1px solid var(--hairline-strong)',
                color: 'var(--fg)', fontSize: 18, ...S.mono, outline: 'none',
              }}
            />
            <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', ...S.label }}>USDC</div>
          </div>
          <div style={{ ...S.label, marginTop: 6 }}>
            {tab === 'DEPOSIT'
              ? `Wallet has $${fmt(walletBalance)} mUSDC available.`
              : `Free cross balance: $${fmt(crossFree)}. Locked against open positions cannot be withdrawn.`}
          </div>
        </div>

        {error && (
          <div style={{ display: 'flex', gap: 8, padding: 10, borderRadius: 10, background: 'oklch(0.55 0.18 25 / 0.10)', border: '1px solid oklch(0.55 0.18 25 / 0.30)', color: 'oklch(0.75 0.18 25)', marginBottom: 12 }}>
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ ...S.sans, fontSize: 13 }}>{error}</div>
          </div>
        )}

        {lastTx && (
          <a href={lastTx.url} target="_blank" rel="noopener noreferrer" style={{
            display: 'flex', gap: 8, padding: 10, borderRadius: 10,
            background: 'oklch(0.78 0.18 150 / 0.10)', border: '1px solid oklch(0.78 0.18 150 / 0.30)',
            color: 'oklch(0.85 0.18 150)', textDecoration: 'none', marginBottom: 12, alignItems: 'center',
          }}>
            <CheckCircle2 size={14} />
            <div style={{ ...S.sans, fontSize: 13, flex: 1 }}>Transaction confirmed</div>
            <ExternalLink size={12} />
          </a>
        )}

        <button onClick={submit} disabled={!valid || busy} style={{
          width: '100%', padding: '12px 16px', borderRadius: 10,
          background: valid && !busy ? 'var(--accent)' : 'var(--glass-bg)',
          color: valid && !busy ? 'var(--bg)' : 'var(--fg-subtle)',
          border: 'none', cursor: valid && !busy ? 'pointer' : 'not-allowed',
          ...S.label, fontSize: 13, letterSpacing: '0.10em',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : null}
          {busy ? 'Submitting…' : (tab === 'DEPOSIT' ? 'Deposit to cross' : 'Withdraw from cross')}
        </button>
      </div>
    </div>
  );
};
