// VeloDepositModal.tsx
//
// Redesigned (batch 5): clean two-tab modal matching Velo's dark aesthetic.
//
// Tab 1 — Deposit: moves mUSDC from main wallet → trading wallet.
//   • If main wallet has mUSDC: shows amount input + one-click transfer button.
//   • Always shows the trading wallet address with a copy button (works for any external source).
//
// Tab 2 — Withdraw: moves mUSDC from trading wallet → main wallet or custom address.
//   • Silent burner signature, no MetaMask popup needed.
//
// This is NOT a cross-chain bridge — that's VeloBridgeModal.

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import {
  createWalletClient, http, parseUnits, isAddress, type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import {
  X, Copy, Check, ArrowDownToLine, ArrowUpFromLine,
  ExternalLink, Loader2, AlertCircle, QrCode,
} from 'lucide-react';
import { fetchUsdcBalance, transferUsdc } from '@/services/veloUsdcService';
import { VELO_USDC_BASE, baseScanAddressUrl, baseScanTxUrl } from '@/services/veloPerpsService';
import { loadStoredBurner } from '@/services/veloBurnerWallet';
import { ensureBurnerGas } from '@/services/veloGasSponsor';

const BASE_SEPOLIA_RPC =
  import.meta.env.VITE_BASE_SEPOLIA_RPC_URL || 'https://base-sepolia-rpc.publicnode.com';

const S = {
  mono:  { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1', fontVariantNumeric: 'tabular-nums' as const },
  label: { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700 as const, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)' } as React.CSSProperties,
  display: { fontFamily: 'var(--font-display)', fontStyle: 'italic' as const, letterSpacing: '-0.02em' },
};

type Tab = 'deposit' | 'withdraw';
type TxStep = 'IDLE' | 'PENDING' | 'SUCCESS' | 'ERROR';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: Tab;
  onSuccess?: (txHash: `0x${string}`, amount: number, type: Tab) => void;
}

export const VeloDepositModal: React.FC<Props> = ({ isOpen, onClose, defaultTab = 'deposit', onSuccess }) => {
  const { address: mainAddress } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [tab, setTab] = useState<Tab>(defaultTab);
  const [burnerAddress, setBurnerAddress] = useState<`0x${string}` | null>(null);
  const [mainBalance, setMainBalance] = useState(0);
  const [tradingBalance, setTradingBalance] = useState(0);

  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<TxStep>('IDLE');
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [errMsg, setErrMsg] = useState('');
  const [copied, setCopied] = useState(false);

  // Withdraw-specific
  const [withdrawDest, setWithdrawDest] = useState<'main' | 'custom'>('main');
  const [customAddress, setCustomAddress] = useState('');

  const reset = () => { setStep('IDLE'); setErrMsg(''); setTxHash(null); setAmount(''); };

  useEffect(() => {
    if (!isOpen) return;
    setTab(defaultTab);
    reset();
    if (!mainAddress || !publicClient) return;
    const burner = loadStoredBurner(mainAddress);
    if (!burner) { setBurnerAddress(null); return; }
    setBurnerAddress(burner.veloAddress);
    fetchUsdcBalance(publicClient, mainAddress).then(setMainBalance).catch(() => {});
    fetchUsdcBalance(publicClient, burner.veloAddress).then(setTradingBalance).catch(() => {});
  }, [isOpen, mainAddress, publicClient]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshBalances = () => {
    if (!publicClient || !mainAddress || !burnerAddress) return;
    fetchUsdcBalance(publicClient, mainAddress).then(setMainBalance).catch(() => {});
    fetchUsdcBalance(publicClient, burnerAddress).then(setTradingBalance).catch(() => {});
  };

  const handleCopy = () => {
    if (!burnerAddress) return;
    navigator.clipboard.writeText(burnerAddress).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDeposit = async () => {
    if (!walletClient || !publicClient || !burnerAddress || !mainAddress) return;
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) { setErrMsg('Enter an amount'); return; }
    if (parsed > mainBalance) { setErrMsg(`Max available: ${mainBalance.toFixed(2)} mUSDC`); return; }
    setStep('PENDING'); setErrMsg('');
    try {
      const hash = await transferUsdc(walletClient as any, VELO_USDC_BASE, burnerAddress, parsed);
      setTxHash(hash);
      await publicClient.waitForTransactionReceipt({ hash });
      setStep('SUCCESS');
      onSuccess?.(hash, parsed, 'deposit');
      refreshBalances();
    } catch (e: any) {
      const msg = e?.shortMessage || e?.message || 'Transfer failed';
      if (msg.toLowerCase().includes('user rejected') || msg.toLowerCase().includes('user denied')) {
        setStep('IDLE');
      } else {
        setStep('ERROR'); setErrMsg(msg);
      }
    }
  };

  const handleWithdraw = async () => {
    if (!mainAddress || !publicClient) return;
    const burner = loadStoredBurner(mainAddress);
    if (!burner) { setErrMsg('Trading wallet not found'); setStep('ERROR'); return; }
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) { setErrMsg('Enter an amount'); return; }
    if (parsed > tradingBalance) { setErrMsg(`Max available: ${tradingBalance.toFixed(2)} mUSDC`); return; }
    const target: Address | null = withdrawDest === 'main'
      ? (mainAddress ?? null)
      : (isAddress(customAddress) ? (customAddress as Address) : null);
    if (!target) { setErrMsg('Enter a valid address'); return; }
    setStep('PENDING'); setErrMsg('');
    try {
      await ensureBurnerGas(publicClient, burner.veloAddress);
      const burnerWalletClient = createWalletClient({
        account: privateKeyToAccount(burner.privateKey),
        chain: baseSepolia,
        transport: http(BASE_SEPOLIA_RPC),
      });
      const hash = await transferUsdc(burnerWalletClient as any, VELO_USDC_BASE, target, parsed);
      setTxHash(hash);
      await publicClient.waitForTransactionReceipt({ hash });
      setStep('SUCCESS');
      onSuccess?.(hash, parsed, 'withdraw');
      refreshBalances();
    } catch (e: any) {
      setStep('ERROR'); setErrMsg(e?.shortMessage || e?.message || 'Withdraw failed');
    }
  };

  if (!isOpen) return null;

  const activeBalance = tab === 'deposit' ? mainBalance : tradingBalance;
  const isDeposit = tab === 'deposit';

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(16px)' }}
      onClick={onClose}>
      <div
        style={{ width: '100%', maxWidth: 440, borderRadius: 20, background: 'var(--glass-bg-strong)', border: '1px solid var(--glass-border)', boxShadow: 'var(--glass-shadow)', backdropFilter: 'blur(32px)', overflow: 'hidden', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}>

        {/* Holo top bar */}
        <div style={{ height: 2, background: 'var(--holo-linear)', backgroundSize: '220% 100%', animation: 'holoSlide 9s linear infinite', flexShrink: 0 }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', flexShrink: 0 }}>
          <span style={{ ...S.mono, fontSize: 13, fontWeight: 700, color: 'var(--fg)' }}>Funds</span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--fg-muted)', padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', margin: '0 18px 16px', background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 3, gap: 3, flexShrink: 0 }}>
          {(['deposit', 'withdraw'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); reset(); }}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                ...S.mono, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const,
                background: tab === t ? 'var(--bg-base-2)' : 'transparent',
                color: tab === t ? 'var(--fg)' : 'var(--fg-subtle)',
                boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,0.3)' : 'none',
                transition: 'all 0.15s',
              }}>
              {t === 'deposit' ? '↓ Deposit' : '↑ Withdraw'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ padding: '0 18px 18px', overflowY: 'auto', flex: 1 }}>

          {/* Balance summary */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            {[
              { label: 'Main Wallet', val: mainBalance },
              { label: 'Trading Wallet', val: tradingBalance },
            ].map(({ label, val }) => (
              <div key={label} style={{ flex: 1, padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--hairline)' }}>
                <div style={S.label}>{label}</div>
                <div style={{ ...S.mono, fontSize: 15, fontWeight: 700, color: 'var(--fg)', marginTop: 4 }}>${val.toFixed(2)}</div>
                <div style={{ ...S.mono, fontSize: 9, color: 'var(--fg-subtle)', marginTop: 2 }}>mUSDC</div>
              </div>
            ))}
          </div>

          {/* SUCCESS state */}
          {step === 'SUCCESS' && txHash ? (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', margin: '0 auto 14px', background: 'rgba(34,197,94,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid rgba(34,197,94,0.4)' }}>
                <Check size={24} style={{ color: 'var(--pnl-up)' }} />
              </div>
              <div style={{ ...S.display, fontSize: 20, color: 'var(--fg)', marginBottom: 6 }}>
                {isDeposit ? 'Deposit complete' : 'Withdrawal complete'}
              </div>
              <div style={{ ...S.mono, fontSize: 12, color: 'var(--fg-muted)', marginBottom: 16 }}>
                ${parseFloat(amount).toFixed(2)} mUSDC {isDeposit ? 'moved to your trading wallet' : 'sent to destination'}
              </div>
              <a href={baseScanTxUrl(txHash)} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, ...S.mono, fontSize: 11, color: 'var(--iris-violet)', textDecoration: 'none', fontWeight: 700, marginBottom: 18, padding: '6px 12px', borderRadius: 8, background: 'rgba(180,110,255,0.12)', border: '1px solid rgba(180,110,255,0.3)' }}>
                View on BaseScan <ExternalLink size={10} />
              </a>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={reset} style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid var(--hairline)', background: 'transparent', color: 'var(--fg)', ...S.mono, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, cursor: 'pointer' }}>
                  Again
                </button>
                <button onClick={onClose} style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: 'linear-gradient(100deg, oklch(0.78 0.20 295), oklch(0.72 0.24 330))', color: '#fff', ...S.mono, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, cursor: 'pointer' }}>
                  Done
                </button>
              </div>
            </div>
          ) : isDeposit ? (
            // ─── DEPOSIT ────────────────────────────────────────────────────
            <>
              {/* Amount input */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={S.label}>Amount</span>
                  <button onClick={() => setAmount(mainBalance.toFixed(2))} style={{ ...S.mono, fontSize: 9, color: 'var(--iris-violet)', background: 'transparent', border: 'none', cursor: 'pointer', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>Max</button>
                </div>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', ...S.mono, fontSize: 14, color: 'var(--fg-muted)' }}>$</span>
                  <input
                    type="number" value={amount} onChange={e => setAmount(e.target.value)}
                    placeholder="0.00" disabled={step === 'PENDING'}
                    style={{ ...S.mono, width: '100%', padding: '13px 14px 13px 28px', borderRadius: 12, border: '1px solid var(--hairline)', background: 'rgba(255,255,255,0.04)', color: 'var(--fg)', fontSize: 16, boxSizing: 'border-box' as const, outline: 'none' }}
                  />
                </div>
              </div>

              {/* Quick amounts */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                {[10, 50, 100, 500].map(a => (
                  <button key={a} onClick={() => setAmount(String(a))} disabled={a > mainBalance || step === 'PENDING'}
                    style={{ ...S.mono, flex: 1, padding: '7px 0', borderRadius: 8, border: '1px solid var(--hairline)', background: 'rgba(255,255,255,0.03)', color: 'var(--fg-muted)', fontSize: 10, fontWeight: 700, cursor: a > mainBalance ? 'not-allowed' : 'pointer', opacity: a > mainBalance ? 0.35 : 1 }}>
                    ${a}
                  </button>
                ))}
              </div>

              {errMsg && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', marginBottom: 12, borderRadius: 8, background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.25)' }}>
                  <AlertCircle size={12} style={{ color: 'var(--pnl-down)' }} />
                  <span style={{ ...S.mono, fontSize: 11, color: 'var(--pnl-down)' }}>{errMsg}</span>
                </div>
              )}

              <button
                onClick={handleDeposit}
                disabled={step === 'PENDING' || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > mainBalance}
                style={{
                  width: '100%', padding: 14, borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(100deg, oklch(0.78 0.20 295), oklch(0.72 0.24 330))',
                  color: '#fff', ...S.mono, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
                  textTransform: 'uppercase' as const, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  opacity: (step === 'PENDING' || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > mainBalance) ? 0.5 : 1,
                  transition: 'opacity 0.15s',
                }}>
                {step === 'PENDING' ? <><Loader2 size={13} className="animate-spin" /> Confirming…</> : <>↓ Deposit ${amount || '0'}</>}
              </button>

              {/* Divider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0' }}>
                <div style={{ flex: 1, height: 1, background: 'var(--hairline)' }} />
                <span style={{ ...S.label, opacity: 0.6 }}>Or send from anywhere</span>
                <div style={{ flex: 1, height: 1, background: 'var(--hairline)' }} />
              </div>

              {/* Copy trading wallet address */}
              {burnerAddress ? (
                <div style={{ padding: 14, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--hairline)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ ...S.label, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <QrCode size={11} /> Trading Wallet Address
                    </div>
                    <a href={baseScanAddressUrl(burnerAddress)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--fg-subtle)', lineHeight: 1 }}>
                      <ExternalLink size={11} />
                    </a>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <code style={{ ...S.mono, fontSize: 11, color: 'var(--fg)', wordBreak: 'break-all' as const, flex: 1 }}>{burnerAddress}</code>
                    <button onClick={handleCopy} style={{ flexShrink: 0, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--hairline)', background: copied ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.04)', cursor: 'pointer', color: copied ? 'var(--pnl-up)' : 'var(--fg-muted)', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {copied ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  </div>
                  <div style={{ ...S.mono, fontSize: 10, color: 'rgba(255,180,60,0.8)', marginTop: 8 }}>
                    ⚠ Base Sepolia only · mUSDC only
                  </div>
                </div>
              ) : (
                <div style={{ ...S.mono, fontSize: 12, color: 'var(--fg-muted)', textAlign: 'center' as const }}>
                  Complete onboarding to get your trading wallet address.
                </div>
              )}
            </>
          ) : (
            // ─── WITHDRAW ───────────────────────────────────────────────────
            <>
              {/* Destination picker */}
              <div style={{ marginBottom: 14 }}>
                <div style={S.label as React.CSSProperties}>Send to</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  {(['main', 'custom'] as const).map(d => (
                    <button key={d} onClick={() => setWithdrawDest(d)}
                      style={{ ...S.mono, flex: 1, padding: '9px 0', borderRadius: 10, cursor: 'pointer', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const,
                        background: withdrawDest === d ? 'oklch(0.68 0.22 295 / 0.18)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${withdrawDest === d ? 'oklch(0.68 0.22 295 / 0.45)' : 'var(--hairline)'}`,
                        color: withdrawDest === d ? 'var(--iris-violet)' : 'var(--fg-muted)',
                      }}>
                      {d === 'main' ? 'Main Wallet' : 'Custom Address'}
                    </button>
                  ))}
                </div>
                {withdrawDest === 'main' && mainAddress && (
                  <div style={{ marginTop: 8, padding: '9px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--hairline)', ...S.mono, fontSize: 11, color: 'var(--fg)' }}>
                    {mainAddress.slice(0, 8)}…{mainAddress.slice(-6)}
                  </div>
                )}
                {withdrawDest === 'custom' && (
                  <input
                    type="text" value={customAddress} onChange={e => setCustomAddress(e.target.value.trim())}
                    placeholder="0x…"
                    style={{ marginTop: 8, ...S.mono, width: '100%', padding: '9px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: `1px solid ${customAddress && !isAddress(customAddress) ? 'var(--pnl-down)' : 'var(--hairline)'}`, color: 'var(--fg)', fontSize: 11, outline: 'none', boxSizing: 'border-box' as const }}
                  />
                )}
              </div>

              {/* Amount input */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={S.label}>Amount</span>
                  <button onClick={() => setAmount(tradingBalance.toFixed(2))} style={{ ...S.mono, fontSize: 9, color: 'var(--iris-violet)', background: 'transparent', border: 'none', cursor: 'pointer', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>Max</button>
                </div>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', ...S.mono, fontSize: 14, color: 'var(--fg-muted)' }}>$</span>
                  <input
                    type="number" value={amount} onChange={e => setAmount(e.target.value)}
                    placeholder="0.00" disabled={step === 'PENDING'}
                    style={{ ...S.mono, width: '100%', padding: '13px 14px 13px 28px', borderRadius: 12, border: '1px solid var(--hairline)', background: 'rgba(255,255,255,0.04)', color: 'var(--fg)', fontSize: 16, boxSizing: 'border-box' as const, outline: 'none' }}
                  />
                </div>
              </div>

              {errMsg && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', marginBottom: 12, borderRadius: 8, background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.25)' }}>
                  <AlertCircle size={12} style={{ color: 'var(--pnl-down)' }} />
                  <span style={{ ...S.mono, fontSize: 11, color: 'var(--pnl-down)' }}>{errMsg}</span>
                </div>
              )}

              <button
                onClick={handleWithdraw}
                disabled={step === 'PENDING' || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > tradingBalance || (withdrawDest === 'custom' && !isAddress(customAddress))}
                style={{
                  width: '100%', padding: 14, borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(100deg, oklch(0.68 0.22 295), oklch(0.70 0.22 340))',
                  color: '#fff', ...S.mono, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
                  textTransform: 'uppercase' as const, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  opacity: (step === 'PENDING' || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > tradingBalance) ? 0.5 : 1,
                  transition: 'opacity 0.15s',
                }}>
                {step === 'PENDING' ? <><Loader2 size={13} className="animate-spin" /> Confirming…</> : <>↑ Withdraw ${amount || '0'}</>}
              </button>

              <p style={{ ...S.mono, fontSize: 10, color: 'var(--fg-subtle)', marginTop: 12, textAlign: 'center' as const }}>
                Silent — no wallet popup required.
              </p>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

// VeloWithdrawModal is now just an alias that opens the deposit modal on the withdraw tab.
// This keeps all the old call sites working without changes.
export const VeloWithdrawModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (txHash: `0x${string}`, amount: number) => void;
}> = ({ isOpen, onClose, onSuccess }) => (
  <VeloDepositModal
    isOpen={isOpen}
    onClose={onClose}
    defaultTab="withdraw"
    onSuccess={(hash, amount) => onSuccess?.(hash, amount)}
  />
);
