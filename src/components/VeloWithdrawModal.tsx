// VeloWithdrawModal.tsx
//
// A real withdraw flow for Velo. The burner trading wallet is where mUSDC
// actually lives after onboarding; this modal sends mUSDC from the burner
// back to:
//   - the user's main MetaMask wallet (default)
//   - any arbitrary 0x address (advanced)
//
// The burner signs the ERC-20 transfer locally with its stored private key,
// so this is silent — no MetaMask popup. The user just clicks Withdraw and
// it works. Same UX pattern as the Send modal.
//
// Open positions are NOT auto-closed here. If the user wants to withdraw
// more than their idle balance, they must close positions first. The modal
// surfaces this clearly.
import React, { useEffect, useState } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import {
  createWalletClient, http, parseUnits, formatUnits, isAddress, type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { ArrowDownToLine, CheckCircle2, ExternalLink, Loader2, X, Wallet, AlertCircle } from 'lucide-react';
import { loadStoredBurner } from '@/services/veloBurnerWallet';
import { fetchUsdcBalance, transferUsdc } from '@/services/veloUsdcService';
import { VELO_USDC_BASE, baseScanTxUrl } from '@/services/veloPerpsService';

const BASE_SEPOLIA_RPC =
  import.meta.env.VITE_BASE_SEPOLIA_RPC_URL || 'https://base-sepolia-rpc.publicnode.com';

const S = {
  display: { fontFamily: 'var(--font-display)', fontStyle: 'italic' as const, letterSpacing: '-0.02em' },
  mono:    { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1', fontVariantNumeric: 'tabular-nums' as const },
  sans:    { fontFamily: 'var(--font-sans)' },
  label:   { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700 as const, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)' },
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (txHash: `0x${string}`, amount: number) => void;
}

type Step = 'IDLE' | 'SENDING' | 'CONFIRMING' | 'DONE' | 'ERROR';
type Destination = 'main' | 'custom';

export const VeloWithdrawModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
  const { address: mainAddress } = useAccount();
  const publicClient = usePublicClient();

  const [burnerBalance, setBurnerBalance] = useState(0);
  const [burnerAddress, setBurnerAddress] = useState<Address | null>(null);
  const [destination, setDestination] = useState<Destination>('main');
  const [customAddress, setCustomAddress] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [step, setStep] = useState<Step>('IDLE');
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [error, setError] = useState('');

  // Resolve burner address + balance on open
  useEffect(() => {
    if (!isOpen || !mainAddress || !publicClient) return;
    const burner = loadStoredBurner(mainAddress);
    if (!burner) {
      setError('No trading wallet found. Complete onboarding first.');
      setStep('ERROR');
      return;
    }
    setBurnerAddress(burner.veloAddress);
    fetchUsdcBalance(publicClient, VELO_USDC_BASE, burner.veloAddress)
      .then(setBurnerBalance)
      .catch((e) => console.warn('[withdraw] balance read failed', e));
  }, [isOpen, mainAddress, publicClient]);

  if (!isOpen) return null;

  const targetAddress: Address | null =
    destination === 'main' ? (mainAddress ?? null)
    : (isAddress(customAddress) ? (customAddress as Address) : null);

  const amount = parseFloat(amountInput) || 0;
  const canSubmit = amount > 0 && amount <= burnerBalance && !!targetAddress && step === 'IDLE';

  const handleWithdraw = async () => {
    if (!mainAddress || !publicClient || !targetAddress) return;
    const burner = loadStoredBurner(mainAddress);
    if (!burner) { setError('Trading wallet not found'); setStep('ERROR'); return; }
    setError('');

    try {
      setStep('SENDING');
      const burnerWalletClient = createWalletClient({
        account: privateKeyToAccount(burner.privateKey),
        chain: baseSepolia,
        transport: http(BASE_SEPOLIA_RPC),
      });
      const hash = await transferUsdc(
        burnerWalletClient as any,
        VELO_USDC_BASE,
        targetAddress,
        amount,
      );
      setTxHash(hash);
      setStep('CONFIRMING');
      await publicClient.waitForTransactionReceipt({ hash });
      setStep('DONE');
      onSuccess?.(hash, amount);

      // Refresh balance
      const newBal = await fetchUsdcBalance(publicClient, VELO_USDC_BASE, burner.veloAddress);
      setBurnerBalance(newBal);
    } catch (e: any) {
      setError(e?.shortMessage || e?.message || 'Withdraw failed');
      setStep('ERROR');
    }
  };

  const reset = () => {
    setStep('IDLE'); setTxHash(null); setError(''); setAmountInput('');
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)',
      }}>
      <div style={{
        width: '100%', maxWidth: 440, borderRadius: 20,
        background: 'var(--glass-bg-strong)', border: '1px solid var(--glass-border)',
        boxShadow: 'var(--glass-shadow)', backdropFilter: 'blur(32px)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: '1px solid var(--hairline)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ArrowDownToLine size={16} style={{ color: 'var(--iris-violet)' }} />
            <span style={{ ...S.mono, fontSize: 11, fontWeight: 700, color: 'var(--fg)', letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>
              Withdraw mUSDC
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--fg-muted)' }}>
            <X size={16} />
          </button>
        </div>

        {step === 'DONE' && txHash ? (
          <div style={{ padding: 32, textAlign: 'center' as const }}>
            <CheckCircle2 size={36} style={{ color: 'var(--pnl-up)', margin: '0 auto 16px' }} />
            <h3 style={{ ...S.display, fontSize: 24, color: 'var(--fg)', margin: '0 0 8px' }}>Withdrawal complete</h3>
            <p style={{ ...S.sans, fontSize: 13, color: 'var(--fg-muted)', margin: '0 0 20px' }}>
              ${amount.toFixed(2)} mUSDC sent to {destination === 'main' ? 'your main wallet' : 'the destination address'}.
            </p>
            <a href={baseScanTxUrl(txHash)} target="_blank" rel="noopener noreferrer"
              style={{ ...S.mono, fontSize: 11, color: 'var(--iris-violet)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 20 }}>
              View on BaseScan <ExternalLink size={11} />
            </a>
            <button onClick={reset}
              style={{ ...S.mono, width: '100%', padding: '12px 0', borderRadius: 10, border: 'none', background: 'var(--chip-bg)', color: 'var(--fg)', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, cursor: 'pointer' }}>
              Withdraw more
            </button>
          </div>
        ) : (
          <div style={{ padding: 20 }}>
            {/* Balance card */}
            <div style={{ padding: 14, borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--hairline)', marginBottom: 16 }}>
              <div style={S.label}>Available in Trading Wallet</div>
              <div style={{ ...S.display, fontSize: 28, color: 'var(--fg)', marginTop: 4 }}>
                ${burnerBalance.toLocaleString('en-US', { maximumFractionDigits: 2 })}
              </div>
              {burnerAddress && (
                <div style={{ ...S.mono, fontSize: 10, color: 'var(--fg-subtle)', marginTop: 4 }}>
                  {burnerAddress.slice(0, 6)}…{burnerAddress.slice(-4)}
                </div>
              )}
            </div>

            {/* Destination picker */}
            <div style={S.label}>Send to</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, marginBottom: 12 }}>
              <button
                onClick={() => setDestination('main')}
                style={{
                  ...S.mono, flex: 1, padding: '10px', borderRadius: 10,
                  background: destination === 'main' ? 'oklch(0.68 0.22 295 / 0.18)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${destination === 'main' ? 'oklch(0.68 0.22 295 / 0.45)' : 'var(--hairline)'}`,
                  color: destination === 'main' ? 'var(--iris-violet)' : 'var(--fg-muted)',
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                }}>
                <Wallet size={11} /> Main wallet
              </button>
              <button
                onClick={() => setDestination('custom')}
                style={{
                  ...S.mono, flex: 1, padding: '10px', borderRadius: 10,
                  background: destination === 'custom' ? 'oklch(0.68 0.22 295 / 0.18)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${destination === 'custom' ? 'oklch(0.68 0.22 295 / 0.45)' : 'var(--hairline)'}`,
                  color: destination === 'custom' ? 'var(--iris-violet)' : 'var(--fg-muted)',
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const,
                  cursor: 'pointer',
                }}>
                Custom 0x…
              </button>
            </div>

            {destination === 'main' && mainAddress && (
              <div style={{ padding: 10, borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--hairline)', marginBottom: 16, ...S.mono, fontSize: 11, color: 'var(--fg)' }}>
                {mainAddress.slice(0, 8)}…{mainAddress.slice(-6)}
              </div>
            )}
            {destination === 'custom' && (
              <input
                type="text" value={customAddress}
                onChange={(e) => setCustomAddress(e.target.value.trim())}
                placeholder="0x…"
                style={{ ...S.mono, width: '100%', padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: `1px solid ${customAddress && !isAddress(customAddress) ? 'var(--pnl-down)' : 'var(--hairline)'}`, color: 'var(--fg)', fontSize: 11, outline: 'none', marginBottom: 16, boxSizing: 'border-box' as const }}
              />
            )}

            {/* Amount input */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span style={S.label}>Amount (mUSDC)</span>
              <button
                onClick={() => setAmountInput(burnerBalance.toFixed(2))}
                style={{ ...S.mono, fontSize: 9, color: 'var(--iris-violet)', background: 'transparent', border: 'none', cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase' as const, padding: 0 }}>
                Max
              </button>
            </div>
            <input
              type="number" value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              placeholder="0.00" inputMode="decimal" step="0.01" min="0"
              style={{ ...S.mono, width: '100%', padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--hairline)', color: 'var(--fg)', fontSize: 18, fontWeight: 700, outline: 'none', boxSizing: 'border-box' as const }}
            />

            {amount > burnerBalance && (
              <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: 'rgba(255,80,80,0.06)', border: '1px solid rgba(255,80,80,0.2)', ...S.mono, fontSize: 10, color: 'var(--pnl-down)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertCircle size={11} /> Insufficient — close positions to free up collateral.
              </div>
            )}
            {error && (
              <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: 'rgba(255,80,80,0.06)', border: '1px solid rgba(255,80,80,0.2)', ...S.mono, fontSize: 10, color: 'var(--pnl-down)' }}>
                {error}
              </div>
            )}

            <button
              onClick={handleWithdraw}
              disabled={!canSubmit}
              style={{
                ...S.mono, width: '100%', padding: '14px 0', marginTop: 16, borderRadius: 12, border: 'none',
                background: canSubmit
                  ? 'linear-gradient(100deg, oklch(0.68 0.22 295), oklch(0.70 0.22 340))'
                  : 'var(--chip-bg)',
                color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase' as const,
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                opacity: canSubmit ? 1 : 0.5,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
              {step === 'SENDING' && <><Loader2 className="animate-spin" size={12} /> Signing transfer…</>}
              {step === 'CONFIRMING' && <><Loader2 className="animate-spin" size={12} /> Confirming on-chain…</>}
              {(step === 'IDLE' || step === 'ERROR') && <><ArrowDownToLine size={12} /> Withdraw ${amount > 0 ? amount.toFixed(2) : '0.00'}</>}
            </button>

            <p style={{ ...S.sans, fontSize: 11, color: 'var(--fg-subtle)', marginTop: 12, lineHeight: 1.4, textAlign: 'center' as const }}>
              Sent from your trading wallet. Silent signature — no MetaMask popup.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
