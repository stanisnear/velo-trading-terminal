import { builderAttribution } from '../services/baseBuilderAttribution.mjs';
/**
 * VeloSendModal — peer-to-peer mUSDC transfer.
 *
 * Recipient can be a wallet address OR a @username registered in
 * VeloRegistry. Live resolution + validation. Signs with the burner if one
 * exists (silent), else MetaMask popup.
 */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { createWalletClient, isAddress, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { AtSign, ArrowRight, CheckCircle2, ExternalLink, Loader2, X } from 'lucide-react';
import { resolveUsername, validateUsername } from '@/services/usernameService';
import { loadStoredBurner } from '@/services/veloBurnerWallet';
import { ensureBurnerGas } from '@/services/veloGasSponsor';
import { VELO_USDC_BASE, baseScanTxUrl } from '@/services/veloPerpsService';
import { fetchUsdcBalance, VELO_USDC_ABI } from '@/services/veloUsdcService';
import { publicSupabase } from '@/services/supabaseStore';
import { baseSepoliaTransport, submittedTransactionHash } from '@/services/baseTransport.mjs';
import { waitForSuccessfulReceipt } from '@/services/tradeReceipts';
import { readPendingTransfer, savePendingTransfer, clearPendingTransfer } from '@/services/transferOutbox.mjs';

const BASE_SEPOLIA_RPC =
  import.meta.env.VITE_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';

const S = {
  display: { fontFamily: 'var(--font-display)', fontStyle: 'italic' as const, letterSpacing: '-0.02em' },
  mono:    { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1', fontVariantNumeric: 'tabular-nums' as const },
  sans:    { fontFamily: 'var(--font-sans)' },
  label:   { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)' } as React.CSSProperties,
};

const cardStyle: React.CSSProperties = {
  width: 'min(420px, calc(100vw - 32px))',
  background: 'var(--modal-bg, var(--modal-bg))',
  border: '1px solid var(--hairline-strong)',
  borderRadius: 28,
  boxShadow: '0 0 0 1px color-mix(in oklab, var(--accent) 10%, transparent), 0 40px 100px -20px rgba(0,0,0,0.65), 0 1px 0 oklch(1 0 0 / 0.06) inset',
  backdropFilter: 'blur(48px) saturate(1.5)',
  WebkitBackdropFilter: 'blur(48px) saturate(1.5)',
  position: 'relative', overflow: 'hidden',
};

const holoGradient: React.CSSProperties = {
  position: 'absolute', top: 0, left: 0, right: 0, height: 2,
  background: 'var(--brand-gradient)',
  opacity: 0.9, zIndex: 1,
};

type Step = 'IDLE' | 'SENDING' | 'DONE' | 'ERROR';
type ResolveState = 'idle' | 'checking' | 'address' | 'username_found' | 'username_unknown' | 'invalid';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Fallback wallet address from the Supabase profile — used when wagmi
   * hasn't reconnected yet (email-auth users, slow reconnect). Allows the
   * burner wallet to be loaded and used for signing even if useAccount()
   * returns undefined on the current render cycle.
   */
  walletAddress?: `0x${string}` | string;
  /**
   * Fires once the transfer is confirmed on-chain. Lets the host (App.tsx)
   * persist a notification row for both the sender and the recipient.
   */
  onSuccess?: (info: {
    txHash: `0x${string}`;
    recipientAddress: `0x${string}`;
    recipientHandle?: string;          // present if the recipient is a Velo user
    amount: number;                    // mUSDC, human-readable
  }) => void | Promise<void>;
}

export const VeloSendModal: React.FC<Props> = ({ isOpen, onClose, walletAddress: walletAddressProp, onSuccess }) => {
  const { address: wagmiAddress } = useAccount();
  const publicClient = usePublicClient({ chainId: 84532 });
  const { data: mainWalletClient } = useWalletClient();

  // Use wagmi address first; fall back to Supabase profile address so that
  // email-auth users (wagmi not yet reconnected) can still use their burner.
  const address = wagmiAddress ?? (walletAddressProp as `0x${string}` | undefined);

  const [recipientInput, setRecipientInput] = useState('');
  const [resolvedAddress, setResolvedAddress] = useState<`0x${string}` | null>(null);
  // The address we actually send to — prefers the recipient's trading (burner) wallet
  const [sendToAddress, setSendToAddress] = useState<`0x${string}` | null>(null);
  const [resolveState, setResolveState] = useState<ResolveState>('idle');
  const [amount, setAmount] = useState('');
  const [available, setAvailable] = useState(0);
  const [step, setStep] = useState<Step>('IDLE');
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const sendLock = useRef(false);

  // Determine which wallet is sending (burner if exists, else main)
  const burner = address ? loadStoredBurner(address) : null;
  const senderAddress = burner?.veloAddress ?? address;
  const activeSender = useRef(senderAddress);
  activeSender.current = senderAddress;

  useEffect(() => {
    if (!isOpen || !senderAddress) return;
    setTxHash(null); setAmount(''); setRecipientInput(''); setStep('IDLE'); setErrorMsg('');
    const saved = readPendingTransfer(localStorage, senderAddress);
    if (!saved) return;
    setTxHash(saved.txHash); setAmount(String(saved.amount));
    setRecipientInput(saved.recipientAddress); setSendToAddress(saved.recipientAddress);
    setStep('ERROR'); setErrorMsg('A previous transfer is awaiting confirmation. Check it before sending another.');
  }, [isOpen, senderAddress]);

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
      setSendToAddress(null);
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
    let active = true;
    setResolvedAddress(null); setSendToAddress(null);
    if (!raw) { setResolveState('idle'); setResolvedAddress(null); return; }

    // Wallet address path
    if (raw.startsWith('0x') || raw.length === 42) {
      if (isAddress(raw)) {
        setResolvedAddress(raw as `0x${string}`);
        setSendToAddress(raw as `0x${string}`);
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
      // Profiles are authoritative for Velo handles. On-chain registration is
      // optional, and a typed address must never be silently redirected.
      (async () => {
        const { data, error } = await publicSupabase.from('profiles')
          .select('wallet_address,velo_wallet_address').ilike('username', normalized).maybeSingle();
        if (error) throw error;
        if (data) return data.velo_wallet_address || data.wallet_address;
        return resolveUsername(publicClient, normalized);
      })()
        .then((addr) => {
          if (!active) return;
          if (addr && isAddress(addr)) { setResolvedAddress(addr as `0x${string}`); setSendToAddress(addr as `0x${string}`); setResolveState('username_found'); }
          else { setResolvedAddress(null); setResolveState('username_unknown'); }
        })
        .catch(() => { if (active) { setResolvedAddress(null); setResolveState('username_unknown'); } });
    }, 400);
    return () => { active = false; clearTimeout(handle); };
  }, [recipientInput, publicClient]);

  if (!isOpen) return null;

  const amountNum = parseFloat(amount) || 0;
  // canSend: a burner-wallet session can sign without MetaMask being connected
  // at the wagmi layer. The only hard requirement is publicClient (for reading
  // balance and waiting for receipts) and a signing path (burner OR wagmi wallet).
  const hasSigningCapability = !!(burner || mainWalletClient);
  const canSend = resolvedAddress
    && sendToAddress
    && resolveState !== 'invalid'
    && resolveState !== 'username_unknown'
    && resolveState !== 'checking'
    && amountNum > 0
    && amountNum <= available
    && hasSigningCapability
    && publicClient;

  const confirmTransfer = async (hash: `0x${string}`) => {
    if (!publicClient || !senderAddress || !sendToAddress) return;
    await waitForSuccessfulReceipt(publicClient, hash);
    clearPendingTransfer(localStorage, senderAddress, hash);
    if (activeSender.current !== senderAddress) return;
    setStep('DONE');
    try {
      await onSuccess?.({ txHash: hash, recipientAddress: sendToAddress,
        recipientHandle: resolveState === 'username_found' ? recipientInput.replace(/^@/, '').toLowerCase() : undefined,
        amount: amountNum });
    } catch { setErrorMsg('Transfer confirmed. Activity history could not refresh yet.'); }
  };

  const checkConfirmation = async () => {
    if (!txHash || sendLock.current) return;
    sendLock.current = true; setStep('SENDING'); setErrorMsg('');
    try { await confirmTransfer(txHash); }
    catch (error: any) {
      if (error.message === 'Transaction reverted on-chain') {
        if (senderAddress) clearPendingTransfer(localStorage, senderAddress, txHash);
        setTxHash(null);
      }
      setErrorMsg(error.message || 'Confirmation is still unavailable.'); setStep('ERROR');
    } finally { sendLock.current = false; }
  };

  const handleSend = async () => {
    if (!sendToAddress || !publicClient || sendLock.current || !canSend || txHash) return;
    if (!burner && !mainWalletClient) {
      setErrorMsg('No wallet available to sign. Connect your wallet in the top-right corner first.');
      setStep('ERROR');
      return;
    }
    setStep('SENDING');
    setErrorMsg('');
    sendLock.current = true;
    try {
      // Pick signing client — burner preferred for silent UX, MetaMask fallback
      let signingClient;
      if (burner) {
        signingClient = createWalletClient({
          account: privateKeyToAccount(burner.privateKey),
          chain: baseSepolia,
          transport: baseSepoliaTransport(BASE_SEPOLIA_RPC),
        });
      } else if (mainWalletClient) {
        signingClient = mainWalletClient;
      } else {
        throw new Error('No wallet available to sign.');
      }

      // Pre-flight: make sure the signer has ETH for gas. If sending from the
      // burner and it's low, the sponsor tops it up before we transfer.
      if (burner) {
        const gas = await ensureBurnerGas(publicClient, burner.veloAddress);
        if (!gas.ok) throw new Error(gas.reason || 'Unable to fund transaction gas.');
      }

      const amountWei = parseUnits(amountNum.toFixed(6), 6);
      const hash = await signingClient.writeContract({ ...builderAttribution(signingClient.chain?.id),
        address: VELO_USDC_BASE,
        abi: VELO_USDC_ABI,
        functionName: 'transfer',
        args: [sendToAddress, amountWei],
        account: signingClient.account!,
        chain: baseSepolia,
      });
      setTxHash(hash);
      if (senderAddress) savePendingTransfer(localStorage, senderAddress, { txHash: hash, recipientAddress: sendToAddress, amount: amountNum });
      await confirmTransfer(hash);
    } catch (e: any) {
      const pendingHash = submittedTransactionHash(e);
      if (pendingHash) {
        setTxHash(pendingHash);
        try { if (senderAddress) savePendingTransfer(localStorage, senderAddress, { txHash: pendingHash, recipientAddress: sendToAddress, amount: amountNum }); } catch { /* The signed journal still guards the wallet. */ }
      }
      const msg = e?.shortMessage || e?.message || 'Send failed';
      if (/rejected|denied/i.test(msg)) setErrorMsg('You cancelled the transfer.');
      else if (/insufficient/i.test(msg)) setErrorMsg('Insufficient funds for this transfer.');
      else if (/exceeds the balance/i.test(msg)) setErrorMsg("Trading wallet doesn't have enough ETH for gas. Top up from main wallet.");
      else setErrorMsg(msg);
      setStep('ERROR');
    } finally { sendLock.current = false; }
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
        Could not resolve this Velo handle. Check the handle or use a wallet address.
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
            ? 'linear-gradient(100deg, var(--accent), var(--velo-sage-bright))'
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
      {errorMsg && <p role="status" style={{ ...S.sans, color: 'var(--fg-muted)', fontSize: 13 }}>{errorMsg}</p>}
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
      <h3 style={{ ...S.display, fontSize: 22, color: 'var(--fg)', margin: '0 0 8px' }}>{txHash ? 'Awaiting confirmation' : 'Send failed'}</h3>
      <p style={{ ...S.sans, fontSize: 13, color: 'var(--fg-muted)', margin: '0 0 20px' }}>{errorMsg}</p>
      {txHash && <a href={baseScanTxUrl(txHash)} target="_blank" rel="noopener noreferrer" style={{ display: 'block', marginBottom: 16, color: 'var(--accent)' }}>View transaction</a>}
      <button
        onClick={() => txHash ? void checkConfirmation() : setStep('IDLE')}
        style={{
          ...S.mono, width: '100%', padding: '14px 0', borderRadius: 12, border: 'none',
          background: 'var(--fg)', color: 'var(--bg-base)',
          fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase' as const, cursor: 'pointer',
        }}
      >
        {txHash ? 'Check confirmation' : 'Try again'}
      </button>
    </div>
  );

  return createPortal(
    <div
      role="dialog" aria-modal="true"
      className="velo-modal-enter-backdrop"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget && step !== 'SENDING') onClose(); }}
    >
      <div className="velo-modal-enter-card" style={cardStyle}>
        <div style={holoGradient} />
        <button
          onClick={onClose}
          disabled={step === 'SENDING'}
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
