/**
 * VeloUsernameModal — claim or change your on-chain handle.
 *
 * The handle is stored in the VeloRegistry contract (one-to-one with your
 * trading wallet address). Signed by the burner — silent if a burner exists,
 * else MetaMask popup.
 */
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { AtSign, CheckCircle2, ExternalLink, Loader2, X } from 'lucide-react';
import {
  claimUsername, validateUsername, resolveUsername, fetchUsernameForAddress,
} from '@/services/usernameService';
import { loadStoredBurner } from '@/services/veloBurnerWallet';
import { baseScanTxUrl } from '@/services/veloPerpsService';

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

type Step = 'IDLE' | 'CLAIMING' | 'DONE' | 'ERROR';
type Availability = 'unknown' | 'checking' | 'available' | 'taken' | 'invalid';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /**
   * If set, the modal locks the input to this handle (the one chosen during
   * AuthModal signup, stored in Supabase). The user can't claim a different
   * on-chain handle than their app handle — keeps things consistent.
   */
  lockedHandle?: string;
  onClaimed?: (handle: string, txHash: `0x${string}`) => void;
}

export const VeloUsernameModal: React.FC<Props> = ({ isOpen, onClose, lockedHandle, onClaimed }) => {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: mainWalletClient } = useWalletClient();

  const [currentHandle, setCurrentHandle] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [availability, setAvailability] = useState<Availability>('unknown');
  const [validationErr, setValidationErr] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('IDLE');
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Resolve current handle (if any) when modal opens
  useEffect(() => {
    if (!isOpen || !address || !publicClient) return;
    fetchUsernameForAddress(publicClient, address)
      .then((h) => setCurrentHandle(h))
      .catch(() => setCurrentHandle(null));
    // Pre-fill the input with the locked handle so the availability check runs
    if (lockedHandle) setInput(lockedHandle);
  }, [isOpen, address, publicClient, lockedHandle]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setInput('');
      setAvailability('unknown');
      setStep('IDLE');
      setTxHash(null);
      setErrorMsg('');
    }
  }, [isOpen]);

  // Live validation + availability check
  useEffect(() => {
    if (!input.trim()) {
      setAvailability('unknown');
      setValidationErr(null);
      return;
    }
    const normalized = input.startsWith('@') ? input.slice(1) : input;
    const err = validateUsername(normalized);
    if (err) {
      setValidationErr(err);
      setAvailability('invalid');
      return;
    }
    setValidationErr(null);

    if (!publicClient) return;
    setAvailability('checking');
    const handle = setTimeout(() => {
      resolveUsername(publicClient, normalized)
        .then((addr) => {
          if (!addr) setAvailability('available');
          else if (address && addr.toLowerCase() === address.toLowerCase()) setAvailability('available');
          else setAvailability('taken');
        })
        .catch(() => setAvailability('unknown'));
    }, 400);
    return () => clearTimeout(handle);
  }, [input, publicClient, address]);

  if (!isOpen) return null;

  const handleClaim = async () => {
    if (!publicClient || !address) return;
    const normalized = input.startsWith('@') ? input.slice(1) : input;
    setStep('CLAIMING');
    setErrorMsg('');

    try {
      // Prefer the burner wallet for signing (silent). Falls back to MetaMask.
      const burner = loadStoredBurner(address);
      let signingClient;
      let signerAddress: `0x${string}`;
      if (burner) {
        signingClient = createWalletClient({
          account: privateKeyToAccount(burner.privateKey),
          chain: baseSepolia,
          transport: http(BASE_SEPOLIA_RPC),
        });
        signerAddress = burner.veloAddress;
      } else if (mainWalletClient) {
        signingClient = mainWalletClient;
        signerAddress = address;
      } else {
        throw new Error('No wallet available');
      }

      // Pre-flight: make sure the signer has gas. If burner is empty, ping
      // the sponsor before attempting the on-chain write.
      const signerEth = await publicClient.getBalance({ address: signerAddress }).catch(() => 0n);
      if (signerEth < 1_000_000_000_000_000n /* 0.001 ETH */) {
        try {
          const response = await fetch('/api/sponsor-eth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ burnerAddress: signerAddress }),
          });
          const data = await response.json();
          if (response.ok && data.sponsored && data.txHash) {
            await publicClient.waitForTransactionReceipt({ hash: data.txHash });
          }
        } catch { /* keep going — the tx itself will surface a clearer error if it fails */ }
      }

      const hash = await claimUsername(signingClient as any, normalized);
      setTxHash(hash);
      await publicClient.waitForTransactionReceipt({ hash });
      setStep('DONE');
      onClaimed?.(normalized, hash);
    } catch (e: any) {
      const msg = e?.shortMessage || e?.message || 'Claim failed';
      if (/rejected|denied/i.test(msg)) setErrorMsg('You cancelled the signature.');
      else if (/UsernameTaken/i.test(msg)) setErrorMsg('That handle was just claimed by someone else.');
      else if (/exceeds the balance/i.test(msg) || /gas \* gas/i.test(msg) || /insufficient funds/i.test(msg)) {
        setErrorMsg("Your trading wallet doesn't have any ETH for gas. Open Settings → Move to Trading Wallet first.");
      }
      else setErrorMsg(msg);
      setStep('ERROR');
    }
  };

  const renderAvailability = () => {
    if (!input.trim()) return null;
    if (availability === 'invalid') return (
      <div style={{ ...S.mono, fontSize: 11, color: 'var(--pnl-down)', marginTop: 8 }}>{validationErr}</div>
    );
    if (availability === 'checking') return (
      <div style={{ ...S.mono, fontSize: 11, color: 'var(--fg-muted)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Loader2 size={11} className="animate-spin" /> Checking…
      </div>
    );
    if (availability === 'taken') return (
      <div style={{ ...S.mono, fontSize: 11, color: 'var(--pnl-down)', marginTop: 8 }}>Already taken.</div>
    );
    if (availability === 'available') return (
      <div style={{ ...S.mono, fontSize: 11, color: 'var(--pnl-up)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        <CheckCircle2 size={11} /> Available — claim it.
      </div>
    );
    return null;
  };

  const renderIdle = () => (
    <div style={{ padding: '24px 24px 24px' }}>
      <h3 style={{ ...S.display, fontSize: 24, color: 'var(--fg)', margin: '0 0 6px' }}>
        {currentHandle ? 'Already claimed' : 'Claim your @handle on-chain'}
      </h3>
      <p style={{ ...S.sans, fontSize: 13, color: 'var(--fg-muted)', margin: '0 0 20px', lineHeight: 1.5 }}>
        {currentHandle && currentHandle.toLowerCase() === input.toLowerCase()
          ? `You already own @${currentHandle} on-chain. Nothing else to do.`
          : lockedHandle
            ? `Register your Velo handle @${lockedHandle} on-chain so others can send you mUSDC and mention you. Costs gas only.`
            : 'A unique on-chain handle for your profile. 3–16 characters, lowercase letters, numbers, underscores.'}
      </p>

      <div style={{ ...S.label, marginBottom: 6 }}>{lockedHandle ? 'Your handle' : 'New handle'}</div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px', borderRadius: 12,
        background: lockedHandle ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.03)',
        border: '1px solid var(--hairline)',
        opacity: lockedHandle ? 0.75 : 1,
      }}>
        <AtSign size={14} style={{ color: 'var(--fg-muted)' }} />
        <input
          type="text"
          value={input}
          onChange={(e) => {
            if (lockedHandle) return; // locked
            setInput(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''));
          }}
          readOnly={!!lockedHandle}
          placeholder="yourname"
          maxLength={16}
          style={{
            ...S.mono, flex: 1, padding: 0, border: 'none', background: 'transparent',
            color: 'var(--fg)', fontSize: 14, outline: 'none',
            cursor: lockedHandle ? 'not-allowed' : 'text',
          }}
        />
      </div>
      {renderAvailability()}

      <button
        onClick={handleClaim}
        disabled={availability !== 'available'}
        style={{
          ...S.mono, width: '100%', padding: '14px 0', marginTop: 20, borderRadius: 12, border: 'none',
          background: availability === 'available'
            ? 'linear-gradient(100deg, oklch(0.68 0.22 295), oklch(0.70 0.22 340))'
            : 'var(--chip-bg)',
          color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase' as const,
          cursor: availability === 'available' ? 'pointer' : 'not-allowed',
          opacity: availability === 'available' ? 1 : 0.5,
        }}
      >
        {currentHandle ? 'Update on-chain' : 'Claim on-chain'}
      </button>
    </div>
  );

  const renderClaiming = () => (
    <div style={{ padding: '40px 24px', textAlign: 'center' as const }}>
      <Loader2 size={32} className="animate-spin" style={{ color: 'var(--iris-violet)', margin: '0 auto 20px' }} />
      <h3 style={{ ...S.display, fontSize: 22, color: 'var(--fg)', margin: '0 0 6px' }}>Claiming…</h3>
      <p style={{ ...S.sans, fontSize: 13, color: 'var(--fg-muted)', margin: 0 }}>
        Writing your handle to the VeloRegistry contract.
      </p>
      {txHash && (
        <a
          href={baseScanTxUrl(txHash)} target="_blank" rel="noopener noreferrer"
          style={{
            ...S.mono, fontSize: 11, color: 'var(--iris-violet)',
            display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 20, textDecoration: 'none',
          }}
        >
          View tx <ExternalLink size={11} />
        </a>
      )}
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
      <h3 style={{ ...S.display, fontSize: 24, color: 'var(--fg)', margin: '0 0 6px' }}>You're @{input}</h3>
      <p style={{ ...S.sans, fontSize: 13, color: 'var(--fg-muted)', margin: '0 0 20px' }}>
        Stored on-chain in the VeloRegistry contract.
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
      <h3 style={{ ...S.display, fontSize: 22, color: 'var(--fg)', margin: '0 0 8px' }}>Claim failed</h3>
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
      onClick={(e) => { if (e.target === e.currentTarget && step !== 'CLAIMING') onClose(); }}
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
        {step === 'CLAIMING' && renderClaiming()}
        {step === 'DONE' && renderDone()}
        {step === 'ERROR' && renderError()}
      </div>
    </div>,
    document.body,
  );
};
