// VeloDepositModal.tsx
//
// "Deposit" in Velo means moving mUSDC from your main wallet (MetaMask) to
// your Velo Trading Wallet (the burner derived on first login). This is the
// step that unlocks trading — the trading wallet needs collateral to open
// positions, and the burner is what signs every trade silently.
//
// Two paths offered:
//   1. One-click transfer via MetaMask (current chain must be Base Sepolia)
//   2. Copy the trading wallet address and send manually from any source
//      (CEX withdrawal, another wallet, etc.)
//
// This is NOT a cross-chain bridge — that's a different modal (VeloBridgeModal).
// A deposit is a same-chain ERC-20 transfer between two wallets the user owns.

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { parseUnits } from 'viem';
import { X, Copy, Check, Wallet, ArrowDown, ExternalLink, Loader2, AlertCircle } from 'lucide-react';
import { fetchUsdcBalance, transferUsdc } from '@/services/veloUsdcService';
import { VELO_USDC_BASE, baseScanAddressUrl, baseScanTxUrl } from '@/services/veloPerpsService';
import { loadStoredBurner } from '@/services/veloBurnerWallet';

// Inline typography token map — same pattern as the other Velo modals.
// (ui/shared doesn't export an `S` object; the convention is for each modal
// to keep its own. If these ever drift, lift them into ui/shared.)
const S = {
  display: { fontFamily: 'var(--font-display)', fontStyle: 'italic' as const, letterSpacing: '-0.02em' },
  mono:    { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1', fontVariantNumeric: 'tabular-nums' as const },
  sans:    { fontFamily: 'var(--font-sans)' },
  label:   { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700 as const, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)' },
};

const QUICK_AMOUNTS = [10, 50, 100, 500];

export interface VeloDepositSuccess {
  txHash: `0x${string}`;
  amount: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (info: VeloDepositSuccess) => void;
}

export const VeloDepositModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [burnerAddress, setBurnerAddress] = useState<`0x${string}` | null>(null);
  const [mainBalance, setMainBalance] = useState(0);
  const [tradingBalance, setTradingBalance] = useState(0);
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<'IDLE' | 'PENDING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [errMsg, setErrMsg] = useState('');
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [copied, setCopied] = useState(false);

  // Resolve burner on open + refresh balances each time the modal is shown
  useEffect(() => {
    if (!isOpen || !address || !publicClient) return;
    setStep('IDLE'); setErrMsg(''); setTxHash(null); setAmount('');

    const burner = loadStoredBurner(address);
    if (!burner) {
      setBurnerAddress(null);
      return;
    }
    setBurnerAddress(burner.veloAddress);

    fetchUsdcBalance(publicClient, address).then(setMainBalance).catch(() => {});
    fetchUsdcBalance(publicClient, burner.veloAddress).then(setTradingBalance).catch(() => {});
  }, [isOpen, address, publicClient]);

  const handleCopyAddress = () => {
    if (!burnerAddress) return;
    navigator.clipboard.writeText(burnerAddress).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleTransfer = async () => {
    if (!walletClient || !publicClient || !burnerAddress) return;
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) { setErrMsg('Enter a valid amount'); return; }
    if (parsed > mainBalance) { setErrMsg(`Insufficient. Available: ${mainBalance.toFixed(2)} mUSDC`); return; }

    setStep('PENDING'); setErrMsg('');
    try {
      // Standard ERC-20 transfer signed by the main wallet (one MetaMask popup).
      // Note: the trading wallet doesn't need to be involved here — main wallet
      // is the signer, mUSDC moves from main to burner on the same chain.
      const hash = await transferUsdc(walletClient as any, VELO_USDC_BASE, burnerAddress, parsed);
      setTxHash(hash);
      await publicClient.waitForTransactionReceipt({ hash });
      setStep('SUCCESS');
      onSuccess?.({ txHash: hash, amount: parsed });
      // Refresh balances after settlement so the user sees the new state
      fetchUsdcBalance(publicClient, address!).then(setMainBalance).catch(() => {});
      fetchUsdcBalance(publicClient, burnerAddress).then(setTradingBalance).catch(() => {});
    } catch (e: any) {
      const msg = e?.shortMessage || e?.message || 'Transfer failed';
      // User rejected → close gracefully without a scary error screen
      if (msg.toLowerCase().includes('user rejected') || msg.toLowerCase().includes('user denied')) {
        setStep('IDLE'); setErrMsg('');
      } else {
        setStep('ERROR'); setErrMsg(msg);
      }
    }
  };

  if (!isOpen) return null;
  if (!address || !burnerAddress) {
    return createPortal(
      <div style={overlay} onClick={onClose}>
        <div style={shell} onClick={(e) => e.stopPropagation()}>
          <Header onClose={onClose} />
          <div style={{ padding: 24, textAlign: 'center' as const }}>
            <p style={{ ...S.sans, color: 'var(--fg-muted)', fontSize: 13 }}>
              Connect your wallet and complete the one-time setup signature to enable deposits.
            </p>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div style={overlay} onClick={onClose}>
      <div style={shell} onClick={(e) => e.stopPropagation()}>
        <Header onClose={onClose} />

        {/* Balance summary */}
        <div style={{ padding: '14px 18px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--hairline)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={S.label}>MAIN WALLET</span>
            <span style={{ ...S.mono, fontSize: 13, color: 'var(--fg)' }}>${mainBalance.toFixed(2)} mUSDC</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0', color: 'var(--fg-subtle)' }}>
            <ArrowDown size={14} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={S.label}>TRADING WALLET</span>
            <span style={{ ...S.mono, fontSize: 13, color: 'var(--pnl-up)', fontWeight: 700 }}>${tradingBalance.toFixed(2)} mUSDC</span>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: 18, overflowY: 'auto' as const, flex: 1 }}>
          {step === 'SUCCESS' ? (
            <SuccessView amount={parseFloat(amount)} txHash={txHash} onClose={onClose} onAgain={() => setStep('IDLE')} />
          ) : (
            <>
              {/* Path A: one-click MetaMask transfer */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ ...S.label, marginBottom: 8 }}>OPTION A · TRANSFER FROM METAMASK</div>
                <p style={{ ...S.sans, fontSize: 12, color: 'var(--fg-muted)', margin: '0 0 12px' }}>
                  Move mUSDC from your main wallet to the trading wallet. Signed once by your MetaMask.
                </p>

                <div style={{ position: 'relative' as const, marginBottom: 10 }}>
                  <span style={{ position: 'absolute' as const, left: 14, top: '50%', transform: 'translateY(-50%)', ...S.mono, fontSize: 14, color: 'var(--fg-muted)' }}>$</span>
                  <input
                    type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00" min="0" step="0.01" max={mainBalance}
                    disabled={step === 'PENDING'}
                    style={{
                      ...S.mono, width: '100%', padding: '14px 60px 14px 28px', borderRadius: 12,
                      border: '1px solid var(--hairline)', background: 'rgba(255,255,255,0.04)',
                      color: 'var(--fg)', fontSize: 16, boxSizing: 'border-box' as const, outline: 'none',
                    }}
                  />
                  <button
                    onClick={() => setAmount(mainBalance.toFixed(2))}
                    style={{
                      position: 'absolute' as const, right: 10, top: '50%', transform: 'translateY(-50%)',
                      ...S.mono, padding: '4px 10px', borderRadius: 6, border: 'none',
                      background: 'rgba(180,110,255,0.15)', color: 'var(--iris-violet)',
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer',
                    }}>MAX</button>
                </div>

                <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' as const }}>
                  {QUICK_AMOUNTS.map((a) => (
                    <button key={a} onClick={() => setAmount(String(a))} disabled={step === 'PENDING' || a > mainBalance} style={{
                      ...S.mono, padding: '6px 10px', borderRadius: 8,
                      background: 'rgba(255,255,255,0.04)', border: '1px solid var(--hairline)',
                      color: 'var(--fg-muted)', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                      cursor: (step === 'PENDING' || a > mainBalance) ? 'not-allowed' : 'pointer',
                      opacity: a > mainBalance ? 0.4 : 1,
                    }}>${a}</button>
                  ))}
                </div>

                {errMsg && step === 'ERROR' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', marginBottom: 10, borderRadius: 8, background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.25)' }}>
                    <AlertCircle size={12} style={{ color: 'var(--pnl-down)' }} />
                    <span style={{ ...S.mono, fontSize: 11, color: 'var(--pnl-down)' }}>{errMsg}</span>
                  </div>
                )}

                <button
                  onClick={handleTransfer}
                  disabled={step === 'PENDING' || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > mainBalance}
                  style={{
                    width: '100%', padding: '14px', borderRadius: 12, border: 'none',
                    background: step === 'PENDING'
                      ? 'rgba(180,110,255,0.4)'
                      : 'linear-gradient(100deg, oklch(0.78 0.20 295), oklch(0.72 0.24 330))',
                    color: '#fff', ...S.mono, fontSize: 12, fontWeight: 700, letterSpacing: '0.12em',
                    textTransform: 'uppercase' as const,
                    cursor: step === 'PENDING' ? 'wait' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    opacity: (!amount || parseFloat(amount) <= 0 || parseFloat(amount) > mainBalance) ? 0.5 : 1,
                  }}>
                  {step === 'PENDING'
                    ? <><Loader2 size={14} className="animate-spin" /> Confirming…</>
                    : <><Wallet size={14} /> Deposit ${amount || '0'}</>}
                </button>
              </div>

              {/* Divider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
                <div style={{ flex: 1, height: 1, background: 'var(--hairline)' }} />
                <span style={{ ...S.label, opacity: 0.7 }}>OR</span>
                <div style={{ flex: 1, height: 1, background: 'var(--hairline)' }} />
              </div>

              {/* Path B: copy address for external sources */}
              <div>
                <div style={{ ...S.label, marginBottom: 8 }}>OPTION B · SEND FROM ELSEWHERE</div>
                <p style={{ ...S.sans, fontSize: 12, color: 'var(--fg-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
                  Send mUSDC on <strong style={{ color: 'var(--fg)' }}>Base Sepolia</strong> to the trading wallet address below. From a CEX, another wallet, or anywhere that holds Base Sepolia mUSDC.
                </p>

                <div style={{ padding: 14, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--hairline)', marginBottom: 10 }}>
                  <div style={{ ...S.label, marginBottom: 6 }}>TRADING WALLET ADDRESS</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <code style={{ ...S.mono, fontSize: 11, color: 'var(--fg)', wordBreak: 'break-all' as const, flex: 1 }}>
                      {burnerAddress}
                    </code>
                    <button onClick={handleCopyAddress} title="Copy address" style={{
                      padding: '6px 8px', borderRadius: 6, border: '1px solid var(--hairline)',
                      background: 'rgba(255,255,255,0.04)', cursor: 'pointer',
                      color: copied ? 'var(--pnl-up)' : 'var(--fg-muted)',
                    }}>
                      {copied ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>

                <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(255,180,60,0.08)', border: '1px solid rgba(255,180,60,0.25)' }}>
                  <p style={{ ...S.mono, fontSize: 10.5, color: 'rgba(255,180,60,0.95)', margin: 0, lineHeight: 1.5 }}>
                    ⚠ Base Sepolia testnet only · mUSDC contract: <code style={{ fontSize: 10 }}>{VELO_USDC_BASE.slice(0, 6)}…{VELO_USDC_BASE.slice(-4)}</code>
                  </p>
                </div>

                <a href={baseScanAddressUrl(burnerAddress)} target="_blank" rel="noopener noreferrer" style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 10,
                  ...S.mono, fontSize: 10, color: 'var(--iris-violet)', textDecoration: 'none',
                  fontWeight: 700, letterSpacing: '0.06em',
                }}>
                  View on BaseScan <ExternalLink size={9} />
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

const Header: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--hairline)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Wallet size={14} style={{ color: 'var(--iris-violet)' }} />
      <span style={{ ...S.mono, fontSize: 11, fontWeight: 700, color: 'var(--fg)', letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>
        Deposit mUSDC
      </span>
    </div>
    <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--fg-muted)' }}>
      <X size={16} />
    </button>
  </div>
);

const SuccessView: React.FC<{
  amount: number;
  txHash: `0x${string}` | null;
  onClose: () => void;
  onAgain: () => void;
}> = ({ amount, txHash, onClose, onAgain }) => (
  <div style={{ textAlign: 'center' as const, padding: '12px 4px' }}>
    <div style={{
      width: 56, height: 56, borderRadius: '50%', margin: '0 auto 16px',
      background: 'rgba(34,197,94,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: '2px solid rgba(34,197,94,0.4)',
    }}>
      <Check size={28} style={{ color: 'var(--pnl-up)' }} />
    </div>
    <h3 style={{ ...S.display, fontSize: 22, color: 'var(--fg)', margin: '0 0 6px' }}>
      Deposit complete
    </h3>
    <p style={{ ...S.mono, fontSize: 13, color: 'var(--fg-muted)', margin: '0 0 16px' }}>
      ${amount.toFixed(2)} mUSDC moved to your trading wallet
    </p>
    {txHash && (
      <a href={baseScanTxUrl(txHash)} target="_blank" rel="noopener noreferrer" style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, ...S.mono, fontSize: 11,
        color: 'var(--iris-violet)', textDecoration: 'none', fontWeight: 700,
        marginBottom: 18, padding: '6px 12px', borderRadius: 8,
        background: 'rgba(180,110,255,0.12)', border: '1px solid rgba(180,110,255,0.3)',
      }}>
        View on BaseScan <ExternalLink size={10} />
      </a>
    )}
    <div style={{ display: 'flex', gap: 8 }}>
      <button onClick={onAgain} style={{
        flex: 1, padding: '12px', borderRadius: 10, border: '1px solid var(--hairline)',
        background: 'rgba(255,255,255,0.04)', color: 'var(--fg)',
        ...S.mono, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
        textTransform: 'uppercase' as const, cursor: 'pointer',
      }}>Deposit more</button>
      <button onClick={onClose} style={{
        flex: 1, padding: '12px', borderRadius: 10, border: 'none',
        background: 'linear-gradient(100deg, oklch(0.78 0.20 295), oklch(0.72 0.24 330))',
        color: '#fff', ...S.mono, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
        textTransform: 'uppercase' as const, cursor: 'pointer',
      }}>Done</button>
    </div>
  </div>
);

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 70,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(16px)',
};

const shell: React.CSSProperties = {
  width: '100%', maxWidth: 460, borderRadius: 20,
  background: 'var(--glass-bg-strong)', border: '1px solid var(--glass-border)',
  boxShadow: 'var(--glass-shadow)', backdropFilter: 'blur(32px)',
  overflow: 'hidden' as const, maxHeight: '92vh',
  display: 'flex', flexDirection: 'column' as const,
};
