/**
 * VeloSendModal — peer-to-peer mUSDC transfer.
 *
 * Recipient can be a wallet address OR a @username registered in
 * VeloRegistry. Live resolution + validation. Signs with the burner if one
 * exists (silent), else MetaMask popup.
 */
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { createWalletClient, http, isAddress, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { AtSign, ArrowRight, CheckCircle2, ExternalLink, Loader2, X } from 'lucide-react';
import { resolveUsername, validateUsername } from '@/services/usernameService';
import { loadStoredBurner } from '@/services/veloBurnerWallet';
import { VELO_USDC_BASE, baseScanTxUrl } from '@/services/veloPerpsService';
import { fetchUsdcBalance, VELO_USDC_ABI } from '@/services/veloUsdcService';

const BASE_SEPOLIA_RPC =
  import.meta.env.VITE_BASE_SEPOLIA_RPC_URL || 'https://base-sepolia-rpc.publicnode.com';

const S = {
  display: { fontFamily: 'var(--font-display)', fontStyle: 'italic' as const, letterSpacing: '-0.02em' },
  mono:    { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1', fontVariantNumeric: 'tabular-nums' as const },
  sans:    { fontFamily: 'var(--font-sans)' },
  label:   { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)' } as React.CSSProperties,
};

const cardStyle: React.CSSProperties = {
  width: 'min(420px, calc(100vw - 32px))',
  background: 'var(--bg-base-2)',
  border: '1px solid var(--hairline)',
  borderRadius: 24,
  boxShadow: '0 32px 96px -16px rgba(0, 0, 0, 0.6), 0 1px 0 rgba(255,255,255,0.04) inset',
  position: 'relative', overflow: 'hidden',
};

const holoGradient: React.CSSProperties = {
  position: 'absolute', top: 0, left: 0, right: 0, height: 2,
  background: 'linear-gradient(90deg, var(--iris-violet), var(--iris-magenta), var(--iris-coral), var(--iris-amber))',
  opacity: 0.9, zIndex: 1,
};

type Step = 'IDLE' | 'SENDING' | 'DONE' | 'ERROR';
type ResolveState = 'idle' | 'checking' | 'address' | 'username_found' | 'username_unknown' | 'invalid';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const VeloSendModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: mainWalletClient } = useWalletClient();

  const [recipientInput, setRecipientInput] = useState('');
  const [resolvedAddress, setResolvedAddress] = useState<`0x${string}` | null>(null);
  const [resolveState, setResolveState] = useState<ResolveState>('idle');
  const [amount, setAmount] = useState('');
  const [available, setAvailable] = useState(0);
  const [step, setStep] = useState<Step>('IDLE');
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Determine which wallet is sending (burner if exists, else main)
  const burner = address ? loadStoredBurner(address) : null;
  const senderAddress = burner?.veloAddress ?? address;

  // Read sender's mUSDC balance on open
  useEffect(() => {
    if (!isOpen || !publicClient || !senderAddress) return;
    fetchUsdcBalance(publicClient, VELO_USDC_BASE, senderAddress)
      .then(setAvailable)
      .catch(() => setAvailable(0));
  }, [isOpen, publicClient, senderAddress]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setRecipientInput('');
      setResolvedAddress(null);
      setResolveState('idle');
      setAmount('');
      setStep('IDLE');
      setTxHash(null);
      setErrorMsg('');
    }
  }, [isOpen]);

  // Live resolve recipient
  useEffect(() => {
    const raw = recipientInput.trim();
    if (!raw) { setResolveState('idle'); setResolvedAddress(null); return; }

    // Wallet address path
    if (raw.startsWith('0x') || raw.length === 42) {
      if (isAddress(raw)) {
        setResolvedAddress(raw as `0x${string}`);
        setResolveState('address');
      } else {
        setResolvedAddress(null);
        setResolveState('invalid');
      }
      return;
    }

    // Username path
    const normalized = raw.startsWith('@') ? raw.slice(1).toLowerCase() : raw.toLowerCase();
    const err = validateUsername(normalized);
    if (err) { setResolveState('invalid'); setResolvedAddress(null); return; }
    if (!publicClient) return;
    setResolveState('checking');
    const handle = setTimeout(() => {
      resolveUsername(publicClient, normalized)
        .then((addr) => {
          if (addr) { setResolvedAddress(addr as `0x${string}`); setResolveState('username_found'); }
          else { setResolvedAddress(null); setResolveState('username_unknown'); }
        })
        .catch(() => { setResolvedAddress(null); setResolveState('username_unknown'); });
    }, 400);
    return () => clearTimeout(handle);
  }, [recipientInput, publicClient]);

  if (!isOpen) return null;

  const amountNum = parseFloat(amount) || 0;
  const canSend = resolvedAddress
    && resolveState !== 'invalid'
    && resolveState !== 'username_unknown'
    && resolveState !== 'checking'
    && amountNum > 0
    && amountNum <= available
    && address
    && publicClient;

  const handleSend = async () => {
    if (!resolvedAddress || !publicClient || !address) return;
    setStep('SENDING');
    setErrorMsg('');
    try {
      // Pick signing client — burner preferred for silent UX, MetaMask fallback
      let signingClient;
      if (burner) {
        signingClient = createWalletClient({
          account: privateKeyToAccount(burner.privateKey),
          chain: baseSepolia,
          transport: http(BASE_SEPOLIA_RPC),
        });
      } else if (mainWalletClient) {
        signingClient = mainWalletClient;
      } else {
        throw new Error('No wallet available to sign.');
      }

      const amountWei = parseUnits(amountNum.toFixed(6), 6);
      const hash = await signingClient.writeContract({
        address: VELO_USDC_BASE,
        abi: VELO_USDC_ABI,
        functionName: 'transfer',
        args: [resolvedAddress, amountWei],
        account: signingClient.account!,
        chain: baseSepolia,
      });
      setTxHash(hash);
      await publicClient.waitForTransactionReceipt({ hash });
      setStep('DONE');
    } catch (e: any) {
      const msg = e?.shortMessage || e?.message || 'Send failed';
      if (/rejected|denied/i.test(msg)) setErrorMsg('You cancelled the transfer.');
      else if (/insufficient/i.test(msg)) setErrorMsg('Insufficient funds for this transfer.');
      else if (/exceeds the balance/i.test(msg)) setErrorMsg("Trading wallet doesn't have enough ETH for gas. Top up from main wallet.");
      else setErrorMsg(msg);
      setStep('ERROR');
    }
  };

  // ── Render helpers ────────────────────────────────────────────────────────
  const renderResolveHint = () => {
    if (!recipientInput.trim()) return null;
    if (resolveState === 'invalid') return (
      <div style={{ ...S.mono, fontSize: 10, color: 'var(--pnl-down)', marginTop: 6 }}>
        Invalid address or username.
      </div>
    );
    if (resolveState === 'checking') return (
      <div style={{ ...S.mono, fontSize: 10, color: 'var(--fg-muted)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Loader2 size={10} className="animate-spin" /> Looking up @{recipientInput.replace('@', '')}…
      </div>
    );
    if (resolveState === 'username_unknown') return (
      <div style={{ ...S.mono, fontSize: 10, color: 'var(--pnl-down)', marginTop: 6 }}>
        Username not registered on-chain.
      </div>
    );
    if (resolveState === 'username_found' && resolvedAddress) return (
      <div style={{ ...S.mono, fontSize: 10, color: 'var(--pnl-up)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
        <CheckCircle2 size={10} /> Resolves to {resolvedAddress.slice(0, 6)}…{resolvedAddress.slice(-4)}
      </div>
    );
    if (resolveState === 'address' && resolvedAddress) return (
      <div style={{ ...S.mono, fontSize: 10, color: 'var(--pnl-up)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
        <CheckCircle2 size={10} /> Valid address
      </div>
    );
    return null;
  };

  const renderIdle = () => (
    <div style={{ padding: '24px 24px 24px' }}>
      <h3 style={{ ...S.display, fontSize: 24, color: 'var(--fg)', margin: '0 0 6px' }}>Send mUSDC</h3>
      <p style={{ ...S.sans, fontSize: 13, color: 'var(--fg-muted)', margin: '0 0 20px', lineHeight: 1.5 }}>
        Send to a @username or 0x… address. Signed by your trading wallet — silent if a burner exists.
      </p>

      {/* Recipient */}
      <div style={{ ...S.label, marginBottom: 6 }}>To</div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px', borderRadius: 12,
        background: 'rgba(255,255,255,0.03)', border: '1px solid var(--hairline)',
      }}>
        <AtSign size={14} style={{ color: 'var(--fg-muted)' }} />
        <input
          type="text"
          value={recipientInput}
          onChange={(e) => setRecipientInput(e.target.value)}
          placeholder="@username or 0x..."
          style={{
            ...S.mono, flex: 1, padding: 0, border: 'none', background: 'transparent',
            color: 'var(--fg)', fontSize: 13, outline: 'none',
          }}
        />
      </div>
      {renderResolveHint()}

      {/* Amount */}
      <div style={{ ...S.label, marginTop: 16, marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
        <span>Amount</span>
        <button
          onClick={() => setAmount(available.toFixed(2))}
          style={{
            ...S.mono, fontSize: 10, color: 'var(--iris-violet)',
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            letterSpacing: '0.1em', textTransform: 'uppercase' as const,
          }}
        >
          Max ${available.toFixed(2)}
        </button>
      </div>
      <input
        type="text"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
        placeholder="0.00"
        style={{
          ...S.mono, width: '100%', padding: '14px', borderRadius: 12,
          background: 'rgba(255,255,255,0.03)', border: '1px solid var(--hairline)',
          color: 'var(--fg)', fontSize: 16, boxSizing: 'border-box' as const, outline: 'none',
        }}
      />
      {amountNum > available && (
        <div style={{ ...S.mono, fontSize: 10, color: 'var(--pnl-down)', marginTop: 6 }}>
          Exceeds your trading wallet balance.
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleSend}
        disabled={!canSend}
        style={{
          ...S.mono, width: '100%', padding: '14px 0', marginTop: 20, borderRadius: 12, border: 'none',
          background: canSend
            ? 'linear-gradient(100deg, oklch(0.68 0.22 295), oklch(0.70 0.22 340))'
            : 'var(--chip-bg)',
          color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase' as const,
          cursor: canSend ? 'pointer' : 'not-allowed', opacity: canSend ? 1 : 0.5,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        Send <ArrowRight size={14} />
      </button>
    </div>
  );

  const renderSending = () => (
    <div style={{ padding: '40px 24px', textAlign: 'center' as const }}>
      <Loader2 size={32} className="animate-spin" style={{ color: 'var(--iris-violet)', margin: '0 auto 20px' }} />
      <h3 style={{ ...S.display, fontSize: 22, color: 'var(--fg)', margin: '0 0 6px' }}>Sending…</h3>
      <p style={{ ...S.sans, fontSize: 13, color: 'var(--fg-muted)', margin: 0 }}>
        Transferring ${amountNum.toFixed(2)} mUSDC.
      </p>
    </div>
  );

  const renderDone = () => (
    <div style={{ padding: '40px 24px', textAlign: 'center' as const }}>
      <div style={{
        width: 64, height: 64, borderRadius: 999,
        background: 'linear-gradient(160deg, oklch(0.82 0.20 150), oklch(0.70 0.22 160))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 20px',
      }}>
        <CheckCircle2 size={32} style={{ color: '#fff' }} strokeWidth={2.5} />
      </div>
      <h3 style={{ ...S.display, fontSize: 24, color: 'var(--fg)', margin: '0 0 6px' }}>Sent</h3>
      <p style={{ ...S.sans, fontSize: 13, color: 'var(--fg-muted)', margin: '0 0 20px' }}>
        ${amountNum.toFixed(2)} mUSDC delivered.
      </p>
      {txHash && (
        <a
          href={baseScanTxUrl(txHash)} target="_blank" rel="noopener noreferrer"
          style={{
            ...S.mono, fontSize: 11, color: 'var(--iris-violet)',
            display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 20, textDecoration: 'none',
          }}
        >
          View on BaseScan <ExternalLink size={11} />
        </a>
      )}
      <button
        onClick={onClose}
        style={{
          ...S.mono, width: '100%', padding: '14px 0', borderRadius: 12, border: 'none',
          background: 'var(--fg)', color: 'var(--bg-base)',
          fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase' as const, cursor: 'pointer',
        }}
      >
        Done
      </button>
    </div>
  );

  const renderError = () => (
    <div style={{ padding: '40px 24px', textAlign: 'center' as const }}>
      <X size={32} style={{ color: 'var(--pnl-down)', margin: '0 auto 20px' }} />
      <h3 style={{ ...S.display, fontSize: 22, color: 'var(--fg)', margin: '0 0 8px' }}>Send failed</h3>
      <p style={{ ...S.sans, fontSize: 13, color: 'var(--fg-muted)', margin: '0 0 20px' }}>{errorMsg}</p>
      <button
        onClick={() => setStep('IDLE')}
        style={{
          ...S.mono, width: '100%', padding: '14px 0', borderRadius: 12, border: 'none',
          background: 'var(--fg)', color: 'var(--bg-base)',
          fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase' as const, cursor: 'pointer',
        }}
      >
        Try again
      </button>
    </div>
  );

  return createPortal(
    <div
      role="dialog" aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget && step !== 'SENDING') onClose(); }}
    >
      <div style={cardStyle}>
        <div style={holoGradient} />
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute', top: 16, right: 16, zIndex: 3,
            width: 32, height: 32, borderRadius: 999,
            background: 'rgba(255,255,255,0.04)', border: '1px solid var(--hairline)',
            color: 'var(--fg-muted)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <X size={16} />
        </button>
        {step === 'IDLE' && renderIdle()}
        {step === 'SENDING' && renderSending()}
        {step === 'DONE' && renderDone()}
        {step === 'ERROR' && renderError()}
      </div>
    </div>,
    document.body,
  );
};
