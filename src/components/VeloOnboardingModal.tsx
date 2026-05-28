// VeloOnboardingModal — new-user registration only.
//
// Shown ONLY when a wallet connects and has NO existing Velo account.
// Wallet connection is handled by Reown AppKit (triggered directly by the
// Connect Wallet button). This modal never shows AppKit or a splash screen.
//
// New-user flow:
//   USERNAME → EMAIL → REVIEW → CREATING → BURNER_SIGN → BURNER_SPONSOR
//   → BURNER_CONFIRM → SUCCESS_NEW
//
// Returning users see SUCCESS_RETURNING (passed via `returningName` prop
// from App.tsx after silent login) — auto-closes once, never twice.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAppKitAccount } from '@reown/appkit/react';
import { useAccount, useDisconnect, useChainId, usePublicClient, useWalletClient, useSwitchChain } from 'wagmi';
import { isConfigured as isSupabaseConfigured, supabase } from '../services/supabaseStore';
import { setupBurnerWallet, createBurnerWalletClient } from '../services/veloBurnerSetup';
import { fetchUsdcBalance } from '../services/veloUsdcService';
import { VELO_USDC_BASE, baseScanTxUrl } from '../services/veloPerpsService';
import { claimUsername, fetchUsernameForAddress } from '../services/usernameService';
import { ensureBurnerGas } from '../services/veloGasSponsor';

const EXPECTED_CHAIN_ID = 84532;

const DISMISSED_KEY = 'velo:welcomeDismissed';
function dismissedKeyFor(addr?: string | null) {
  return addr ? `velo:welcomeDismissed:${addr.toLowerCase()}` : DISMISSED_KEY;
}
function markDismissed(addr?: string | null) {
  try {
    localStorage.setItem(DISMISSED_KEY, '1');
    if (addr) localStorage.setItem(dismissedKeyFor(addr), '1');
  } catch {}
}
export function isDismissed(addr?: string | null) {
  try {
    if (localStorage.getItem(dismissedKeyFor(addr)) === '1') return true;
    if (localStorage.getItem(DISMISSED_KEY) === '1') return true;
  } catch {}
  return false;
}

function wPass(addr: string) { return `velo_w3_${addr.toLowerCase().slice(2, 20)}_xK9`; }

export interface VeloOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuth: (user: any, profile: any, isNewAccount?: boolean) => void;
  onFallbackLogin?: (username: string) => void;
  onBurnerReady?: (args: { burnerAddress: `0x${string}`; amount: number; txHash: `0x${string}` | null }) => void;
  onUsernameClaimed?: (handle: string, txHash: `0x${string}`) => void;
  required?: boolean;
  disconnectRef?: React.MutableRefObject<(() => void) | null>;
  /** Set to the username for SUCCESS_RETURNING screen (app-level silent login) */
  returningName?: string;
}

type Step =
  | 'USERNAME'
  | 'EMAIL'
  | 'REVIEW'
  | 'CREATING'
  | 'BURNER_SIGN'
  | 'BURNER_SPONSOR'
  | 'BURNER_CONFIRM'
  | 'SUCCESS_NEW'
  | 'SUCCESS_RETURNING'
  | 'WRONG_NETWORK';

const PROGRESS_IDX: Partial<Record<Step, number>> = {
  USERNAME: 0, EMAIL: 1, REVIEW: 2,
  CREATING: 2, BURNER_SIGN: 2, BURNER_SPONSOR: 2, BURNER_CONFIRM: 2,
};

// ─── Design tokens (modal always uses dark theme) ─────────────────────────────
const T = {
  fg:       '#F4F4F7',
  fgMuted:  'rgba(244,244,247,0.55)',
  fgSubtle: 'rgba(244,244,247,0.3)',
  bg:       '#0e0e14',
  hairline: 'rgba(255,255,255,0.07)',
  violet:   'oklch(0.55 0.24 295)',
  green:    '#34d399',
  mono:     "'JetBrains Mono','Fira Code',monospace",
  display:  'Georgia,serif',
  sans:     '-apple-system,BlinkMacSystemFont,sans-serif',
};

// ─── Micro components ─────────────────────────────────────────────────────────
const VLogo = ({ size = 48 }: { size?: number }) => (
  <div style={{
    width: size, height: size,
    borderRadius: Math.round(size * 0.24),
    background: 'linear-gradient(135deg, oklch(0.45 0.26 295) 0%, oklch(0.55 0.24 285) 40%, oklch(0.65 0.22 268) 80%, oklch(0.72 0.18 250) 100%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    position: 'relative', overflow: 'hidden', flexShrink: 0,
    boxShadow: `0 4px 20px oklch(0.55 0.24 295 / 0.45)`,
  }}>
    <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 80% at 28% 8%, rgba(255,255,255,0.42), transparent 55%)' }} />
    <span style={{ fontFamily: T.display, fontSize: size * 0.46, color: '#fff', fontStyle: 'italic', fontWeight: 700, lineHeight: 1, position: 'relative', zIndex: 1 }}>V</span>
  </div>
);

const HoloBar = ({ step, total = 3 }: { step: number; total?: number }) => (
  <div style={{ display: 'flex', gap: 5, marginBottom: 24 }}>
    {Array.from({ length: total }).map((_, i) => (
      <div key={i} style={{
        height: 2.5, flex: 1, borderRadius: 2,
        background: i <= step ? T.violet : 'rgba(255,255,255,0.08)',
        opacity: i < step ? 0.4 : 1,
        transition: 'background 0.4s, opacity 0.4s',
      }} />
    ))}
  </div>
);

const HoloBtn = ({ onClick, children, disabled = false, variant = 'primary' }: {
  onClick: () => void; children: React.ReactNode; disabled?: boolean; variant?: 'primary' | 'ghost';
}) => variant === 'ghost' ? (
  <button onClick={onClick} style={{
    width: '100%', padding: 11, background: 'none', borderRadius: 12,
    border: `1px solid rgba(255,255,255,0.1)`,
    fontFamily: T.mono, fontSize: 11, fontWeight: 700,
    color: 'rgba(255,255,255,0.4)', cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase',
    transition: 'border-color 0.15s, color 0.15s',
  }}
  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.25)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.7)'; }}
  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.4)'; }}
  >{children}</button>
) : (
  <button onClick={onClick} disabled={disabled} style={{
    width: '100%', padding: 14,
    background: disabled ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, oklch(0.45 0.26 295) 0%, oklch(0.55 0.24 285) 40%, oklch(0.65 0.22 268) 80%, oklch(0.72 0.18 250) 100%)',
    border: 'none', borderRadius: 13,
    fontFamily: T.mono, fontSize: 12, fontWeight: 700,
    color: disabled ? 'rgba(255,255,255,0.25)' : '#fff',
    cursor: disabled ? 'not-allowed' : 'pointer',
    letterSpacing: '0.08em', textTransform: 'uppercase',
    boxShadow: disabled ? 'none' : `0 6px 24px -6px oklch(0.55 0.24 295 / 0.5)`,
    transition: 'transform 0.14s, box-shadow 0.14s',
    opacity: disabled ? 0.5 : 1,
  }}
  onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; }}
  >{children}</button>
);

const Field = ({ label, value, onChange, placeholder, type = 'text', autoFocus, error, onKeyDown, optional, hint }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder: string; type?: string; autoFocus?: boolean; error?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void; optional?: boolean; hint?: string;
}) => {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
        <span style={{ fontFamily: T.mono, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: T.fgSubtle }}>{label}</span>
        {optional && <span style={{ fontFamily: T.mono, fontSize: 9, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Optional</span>}
      </div>
      <input type={type} value={value} placeholder={placeholder} autoFocus={autoFocus}
        onChange={e => onChange(e.target.value)} onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{
          width: '100%', padding: '12px 14px', boxSizing: 'border-box',
          background: 'rgba(255,255,255,0.04)',
          border: `1.5px solid ${error ? 'oklch(0.62 0.22 25)' : focused ? T.violet : T.hairline}`,
          borderRadius: 12, fontFamily: T.mono, fontSize: 14,
          color: T.fg, outline: 'none', transition: 'border-color 0.18s',
        }}
      />
      {hint && !error && <p style={{ fontFamily: T.mono, fontSize: 10, color: 'rgba(255,255,255,0.3)', margin: '5px 0 0' }}>{hint}</p>}
      {error && <p style={{ fontFamily: T.mono, fontSize: 11, color: 'oklch(0.62 0.22 25)', margin: '5px 0 0' }}>{error}</p>}
    </div>
  );
};

const WalletPill = ({ address }: { address: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 13px', background: 'oklch(0.78 0.18 150 / 0.07)', border: '1px solid oklch(0.78 0.18 150 / 0.2)', borderRadius: 11 }}>
    <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.green, flexShrink: 0 }} />
    <span style={{ fontFamily: T.mono, fontSize: 12, color: T.fg, fontWeight: 600, flex: 1 }}>{address.slice(0, 10)}…{address.slice(-8)}</span>
    <span style={{ fontFamily: T.mono, fontSize: 9, color: T.green, letterSpacing: '0.07em', textTransform: 'uppercase' }}>Connected</span>
  </div>
);

const SpinRing = () => (
  <div style={{ position: 'relative', width: 52, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid oklch(0.55 0.24 295 / 0.3)`, animation: 'vOnbPulseRing 1.5s ease-in-out infinite' }} />
    <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.08)', borderTopColor: T.violet, animation: 'vOnbSpin 0.85s linear infinite' }} />
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────
export const VeloOnboardingModal: React.FC<VeloOnboardingModalProps> = ({
  isOpen, onClose, onAuth, onFallbackLogin, onBurnerReady, onUsernameClaimed,
  required = false, disconnectRef, returningName,
}) => {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { embeddedWalletInfo } = useAppKitAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { switchChain } = useSwitchChain();

  const socialEmail: string = (embeddedWalletInfo as any)?.user?.email ?? '';
  const supabaseReady = isSupabaseConfigured();

  const [step, setStep] = useState<Step>('USERNAME');
  const [visible, setVisible] = useState(false);

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [fallbackInput, setFallbackInput] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [globalError, setGlobalError] = useState('');

  const [claimTxHash, setClaimTxHash] = useState<`0x${string}` | null>(null);
  const [claimBalance, setClaimBalance] = useState(0);
  const [burnerAddr, setBurnerAddr] = useState<string | null>(null);

  // completedRef: guards against SUCCESS_RETURNING onClose firing twice
  const completedRef = useRef(false);
  const usernameCheckRef = useRef<string | null>(null);
  const flowAbortedRef = useRef(false);

  useEffect(() => { if (disconnectRef) disconnectRef.current = disconnect; }, [disconnect, disconnectRef]);

  useEffect(() => {
    if (isOpen) {
      const initialStep: Step = returningName
        ? 'SUCCESS_RETURNING'
        : chainId !== EXPECTED_CHAIN_ID
        ? 'WRONG_NETWORK'
        : 'USERNAME';
      setStep(initialStep);
      setUsername(''); setEmail(''); setFallbackInput('');
      setFieldError(''); setGlobalError('');
      completedRef.current = false;
      usernameCheckRef.current = null;
      flowAbortedRef.current = false;
      setClaimTxHash(null); setBurnerAddr(null); setClaimBalance(0);
      if (!email && socialEmail) setEmail(socialEmail);
      setTimeout(() => setVisible(true), 10);
    } else {
      setVisible(false);
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Network switch recovery
  useEffect(() => {
    if (!isOpen || step !== 'WRONG_NETWORK') return;
    if (chainId === EXPECTED_CHAIN_ID) setStep('USERNAME');
  }, [chainId, step, isOpen]);

  // SUCCESS_RETURNING auto-close — fires exactly once
  useEffect(() => {
    if (!isOpen || step !== 'SUCCESS_RETURNING') return;
    if (completedRef.current) return;
    const t = setTimeout(() => {
      if (completedRef.current) return;
      completedRef.current = true;
      onClose();
    }, 2400);
    return () => clearTimeout(t);
  }, [step, isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Navigation ────────────────────────────────────────────────────────────
  const advance = async () => {
    if (step === 'USERNAME') {
      const err = validateHandle(username);
      if (err) { setFieldError(err); return; }
      if (supabaseReady) {
        const uname = username.trim().toLowerCase();
        if (usernameCheckRef.current !== uname) {
          usernameCheckRef.current = uname;
          setFieldError('');
          const { data: existing } = await supabase.from('profiles').select('id').ilike('username', uname).maybeSingle();
          if (existing) { setFieldError('Username already taken — try another'); usernameCheckRef.current = null; return; }
        }
      }
      setFieldError(''); setStep('EMAIL'); return;
    }
    if (step === 'EMAIL') {
      if (email.trim() && supabaseReady) {
        const { data: existingEmail } = await supabase.from('profiles').select('id').eq('email', email.trim().toLowerCase()).maybeSingle();
        if (existingEmail) { setFieldError('Email already registered with another account'); return; }
      }
      setFieldError(''); setStep('REVIEW'); return;
    }
    if (step === 'REVIEW') { handleCreate(); return; }
  };

  const back = () => {
    if (step === 'EMAIL') { setStep('USERNAME'); return; }
    if (step === 'REVIEW') { setStep('EMAIL'); return; }
  };

  const validateHandle = (v: string) => {
    if (!v.trim()) return 'Username is required';
    if (v.trim().length < 3) return 'Minimum 3 characters';
    if (v.trim().length > 20) return 'Maximum 20 characters';
    if (!/^[a-zA-Z0-9_]+$/.test(v.trim())) return 'Letters, numbers and underscores only';
    return '';
  };

  // ── Account creation ──────────────────────────────────────────────────────
  const handleCreate = useCallback(async () => {
    if (!address || !walletClient || !publicClient) return;
    const uname = username.trim();
    const contactEmail = email.trim() || null;
    setGlobalError('');
    flowAbortedRef.current = false;

    setStep('CREATING');
    try {
      if (supabaseReady) {
        const { data: taken } = await supabase.from('profiles').select('id').ilike('username', uname).maybeSingle();
        if (taken) { setGlobalError(`@${uname} is already taken — go back and choose another`); setStep('REVIEW'); return; }
      }
      const pseudoEmail = `${address.toLowerCase()}@wallet.velo`;
      const password = wPass(address);
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: pseudoEmail, password,
        options: { data: { username: uname, wallet_address: address.toLowerCase() } },
      });
      let authUser = signUpData?.user;
      if (signUpError) {
        if (signUpError.message?.includes('already') || signUpError.message?.includes('registered')) {
          const { data: si } = await supabase.auth.signInWithPassword({ email: pseudoEmail, password });
          authUser = si?.user;
        } else throw signUpError;
      }
      if (!authUser) throw new Error('No user returned from signup');
      const { data: si2 } = await supabase.auth.signInWithPassword({ email: pseudoEmail, password });
      if (si2?.user) authUser = si2.user;
      await supabase.from('profiles').update({ username: uname, handle: `@${uname}`, ...(contactEmail ? { email: contactEmail } : {}) }).eq('id', authUser.id);
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', authUser.id).single();

      setStep('BURNER_SIGN');
      const result = await setupBurnerWallet({
        walletClient, publicClient, ownerAddress: address,
        onStep: (s: string) => {
          if (s === 'SIGNING') setStep('BURNER_SIGN');
          if (s === 'SPONSOR_REQUEST') setStep('BURNER_SPONSOR');
          if (s === 'FUNDING_ETH_FALLBACK') setStep('BURNER_SPONSOR');
          if (s === 'CLAIMING_FAUCET') setStep('BURNER_CONFIRM');
        },
      });
      setBurnerAddr(result.burner.veloAddress);
      setClaimTxHash(result.faucetTxHash ?? null);

      if (uname) {
        try {
          const existing = await fetchUsernameForAddress(publicClient, address);
          if (!existing) {
            await ensureBurnerGas(publicClient, result.burner.veloAddress as `0x${string}`);
            const burnerWc = createBurnerWalletClient(result.burner.privateKey);
            const unameTx = await claimUsername(burnerWc as any, uname);
            await publicClient.waitForTransactionReceipt({ hash: unameTx });
            onUsernameClaimed?.(uname, unameTx);
          }
        } catch (e) { console.warn('[velo] on-chain username claim skipped:', e); }
      }

      let bal = 1000;
      try {
        bal = await fetchUsdcBalance(publicClient, VELO_USDC_BASE, result.burner.veloAddress);
        setClaimBalance(bal);
      } catch { setClaimBalance(1000); }

      if (flowAbortedRef.current) return;

      markDismissed(address);
      setStep('SUCCESS_NEW');
      onBurnerReady?.({ burnerAddress: result.burner.veloAddress, amount: bal, txHash: result.faucetTxHash ?? null });

      setTimeout(() => {
        if (completedRef.current) return;
        completedRef.current = true;
        onAuth(authUser, profile || { id: authUser!.id, username: uname, handle: `@${uname}`, balance: 0 }, true);
      }, 3200);

    } catch (e: any) {
      const msg: string = e?.shortMessage || e?.message || 'Something went wrong.';
      if (/rejected|denied|cancelled|user rejected/i.test(msg)) {
        flowAbortedRef.current = true;
        setGlobalError('You cancelled the signature. Your account was saved — tap "Set up wallet" to try again.');
        setStep('REVIEW');
      } else if (/cooldown/i.test(msg)) {
        setGlobalError('Faucet cooldown active — come back in 6 hours.'); setStep('REVIEW');
      } else {
        setGlobalError(msg); setStep('REVIEW');
      }
    }
  }, [address, username, email, walletClient, publicClient, supabaseReady, onAuth, onBurnerReady, onUsernameClaimed]);

  const isInProgress = ['CREATING', 'BURNER_SIGN', 'BURNER_SPONSOR', 'BURNER_CONFIRM'].includes(step);
  const isTerminal = step === 'SUCCESS_NEW' || step === 'SUCCESS_RETURNING';
  const showClose = (!required || isTerminal) && !isInProgress;

  const handleClose = () => { if (showClose) onClose(); };

  if (!isOpen) return null;
  const progIdx = PROGRESS_IDX[step] ?? null;

  return createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(16px) saturate(140%)',
        WebkitBackdropFilter: 'blur(16px) saturate(140%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.3s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative', width: '100%', maxWidth: 460,
          background: 'rgba(14,14,20,0.97)',
          borderRadius: 26,
          border: '1px solid rgba(255,255,255,0.07)',
          boxShadow: '0 32px 96px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.04) inset',
          backdropFilter: 'blur(40px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(40px) saturate(1.4)',
          overflow: 'hidden',
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(18px) scale(0.97)',
          transition: 'transform 0.4s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        {/* Holo top stripe */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, zIndex: 2,
          background: 'linear-gradient(90deg, oklch(0.45 0.26 295), oklch(0.62 0.22 268), oklch(0.72 0.18 250), oklch(0.78 0.18 150))',
          opacity: 0.9 }} />

        {/* Close button */}
        {showClose && (
          <button onClick={handleClose} aria-label="Close" style={{
            position: 'absolute', top: 16, right: 16, zIndex: 10,
            width: 30, height: 30, borderRadius: 999,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.4)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        )}

        <div style={{ padding: '28px 28px 30px' }}>
          {progIdx !== null && <HoloBar step={progIdx} total={3} />}

          {/* ══ WRONG NETWORK ══ */}
          {step === 'WRONG_NETWORK' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'vOnbSlideUp 0.3s ease' }}>
              <div style={{ textAlign: 'center', padding: '8px 0' }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'oklch(0.74 0.18 30 / 0.1)', border: '1.5px solid oklch(0.74 0.18 30 / 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="oklch(0.74 0.18 30)" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                </div>
                <p style={{ fontFamily: T.display, fontSize: 18, fontStyle: 'italic', fontWeight: 700, color: T.fg, margin: '0 0 6px' }}>Wrong network</p>
                <p style={{ fontFamily: T.sans, fontSize: 12.5, color: T.fgMuted, margin: 0, lineHeight: 1.6 }}>
                  Velo runs on <strong style={{ color: T.fg }}>Base Sepolia</strong>. Please switch your wallet.
                </p>
              </div>
              {address && <WalletPill address={address} />}
              <button onClick={() => switchChain({ chainId: EXPECTED_CHAIN_ID })} style={{ width: '100%', padding: '12px 0', borderRadius: 12, border: 'none', background: T.fg, color: '#0B0B0E', fontFamily: T.mono, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                Switch to Base Sepolia
              </button>
            </div>
          )}

          {/* ══ USERNAME ══ */}
          {step === 'USERNAME' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, animation: 'vOnbSlideUp 0.32s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                <VLogo size={36} />
                <div>
                  <p style={{ fontFamily: T.display, fontSize: 17, fontStyle: 'italic', fontWeight: 700, color: T.fg, margin: 0, lineHeight: 1.2 }}>Pick your handle</p>
                  <p style={{ fontFamily: T.mono, fontSize: 9, color: T.fgSubtle, margin: '3px 0 0', letterSpacing: '0.1em', textTransform: 'uppercase' }}>New account · Step 1 of 3</p>
                </div>
              </div>
              <p style={{ fontFamily: T.sans, fontSize: 13, color: T.fgMuted, margin: 0, lineHeight: 1.65 }}>
                This is how you'll appear on leaderboards, the social feed, and copy trading rankings.
              </p>
              {address && <WalletPill address={address} />}
              <Field label="Username" value={username} onChange={v => { setUsername(v); setFieldError(''); }} placeholder="e.g. alpha_trader" autoFocus error={fieldError} hint="3–20 chars · letters, numbers, underscores" onKeyDown={e => e.key === 'Enter' && advance()} />
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 13px', borderRadius: 12, background: 'oklch(0.55 0.24 295 / 0.07)', border: '1px solid oklch(0.55 0.24 295 / 0.18)' }}>
                <span style={{ color: T.violet, fontFamily: T.mono, fontSize: 13, fontWeight: 700, lineHeight: 1.4, flexShrink: 0, marginTop: 1 }}>@</span>
                <p style={{ fontFamily: T.mono, fontSize: 10.5, color: 'rgba(255,255,255,0.5)', margin: 0, lineHeight: 1.6 }}>Your handle is registered <span style={{ color: T.violet, fontWeight: 700 }}>on-chain</span> in the Velo Name Registry and tied permanently to your wallet.</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <HoloBtn onClick={advance} disabled={!username.trim()}>Continue →</HoloBtn>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 14 }}>
                  <p style={{ fontFamily: T.mono, fontSize: 9, color: 'rgba(255,255,255,0.2)', textAlign: 'center', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 10px' }}>or use demo mode</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="text" placeholder="Demo username" value={fallbackInput} onChange={e => setFallbackInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && fallbackInput.trim() && (onFallbackLogin?.(fallbackInput.trim()), onClose())} style={{ flex: 1, padding: '10px 12px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.hairline}`, borderRadius: 10, fontFamily: T.mono, fontSize: 12, color: T.fg, outline: 'none' }} />
                    <button onClick={() => { if (fallbackInput.trim()) { onFallbackLogin?.(fallbackInput.trim()); onClose(); }}} disabled={!fallbackInput.trim()} style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: `1px solid ${T.hairline}`, fontFamily: T.mono, fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', cursor: fallbackInput.trim() ? 'pointer' : 'not-allowed', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: fallbackInput.trim() ? 1 : 0.4 }}>Demo</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══ EMAIL ══ */}
          {step === 'EMAIL' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, animation: 'vOnbSlideUp 0.32s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                <VLogo size={36} />
                <div>
                  <p style={{ fontFamily: T.display, fontSize: 17, fontStyle: 'italic', fontWeight: 700, color: T.fg, margin: 0, lineHeight: 1.2 }}>Stay in the loop</p>
                  <p style={{ fontFamily: T.mono, fontSize: 9, color: T.fgSubtle, margin: '3px 0 0', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Step 2 of 3</p>
                </div>
              </div>
              <p style={{ fontFamily: T.sans, fontSize: 13, color: T.fgMuted, margin: 0, lineHeight: 1.65 }}>
                Get notified when positions are filled, liquidated, or copied. You can add this later in Settings.
              </p>
              <Field label="Email" value={email} onChange={v => { setEmail(v); setFieldError(''); }} placeholder="your@email.com" type="email" autoFocus optional error={fieldError} onKeyDown={e => e.key === 'Enter' && advance()} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <HoloBtn onClick={advance}>{email.trim() ? 'Continue →' : 'Skip for now →'}</HoloBtn>
                <HoloBtn variant="ghost" onClick={back}>← Back</HoloBtn>
              </div>
            </div>
          )}

          {/* ══ REVIEW ══ */}
          {step === 'REVIEW' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, animation: 'vOnbSlideUp 0.32s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                <VLogo size={36} />
                <div>
                  <p style={{ fontFamily: T.display, fontSize: 17, fontStyle: 'italic', fontWeight: 700, color: T.fg, margin: 0, lineHeight: 1.2 }}>Ready to launch</p>
                  <p style={{ fontFamily: T.mono, fontSize: 9, color: T.fgSubtle, margin: '3px 0 0', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Step 3 of 3</p>
                </div>
              </div>
              {globalError && <div style={{ padding: '10px 13px', borderRadius: 10, background: 'oklch(0.62 0.22 25 / 0.1)', border: '1px solid oklch(0.62 0.22 25 / 0.3)', color: 'oklch(0.62 0.22 25)', fontFamily: T.mono, fontSize: 12, lineHeight: 1.5 }}>{globalError}</div>}
              <div style={{ borderRadius: 14, border: `1px solid ${T.hairline}`, overflow: 'hidden' }}>
                {[
                  { lbl: 'Wallet', val: address ? `${address.slice(0,10)}…${address.slice(-8)}` : '—' },
                  { lbl: 'Handle', val: `@${username}` },
                  { lbl: 'Email', val: email.trim() || '—' },
                  { lbl: 'Network', val: 'Base Sepolia' },
                  { lbl: 'Starting balance', val: '1,000 mUSDC' },
                ].map(({ lbl, val }, i, arr) => (
                  <div key={lbl} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 15px', borderBottom: i < arr.length - 1 ? `1px solid rgba(255,255,255,0.05)` : 'none', background: i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                    <span style={{ fontFamily: T.mono, fontSize: 10, color: T.fgSubtle, letterSpacing: '0.07em', textTransform: 'uppercase' }}>{lbl}</span>
                    <span style={{ fontFamily: T.mono, fontSize: 12, color: lbl === 'Starting balance' ? T.green : T.fg, fontWeight: 600, textAlign: 'right', maxWidth: '58%', wordBreak: 'break-all' }}>{val}</span>
                  </div>
                ))}
              </div>
              <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.025)', border: `1px solid ${T.hairline}` }}>
                <p style={{ fontFamily: T.mono, fontSize: 10, color: T.fgSubtle, margin: 0, lineHeight: 1.65 }}>
                  Tapping "Create account" asks MetaMask for <strong style={{ color: 'rgba(255,255,255,0.65)' }}>one gas-free signature</strong> to derive your trading wallet. No ETH is spent at this step.
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <HoloBtn onClick={handleCreate}>Create account →</HoloBtn>
                <HoloBtn variant="ghost" onClick={back}>← Edit details</HoloBtn>
              </div>
            </div>
          )}

          {/* ══ IN-PROGRESS ══ */}
          {step === 'CREATING' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, padding: '24px 0', animation: 'vOnbSlideUp 0.3s ease' }}>
              <SpinRing />
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontFamily: T.display, fontStyle: 'italic', fontSize: 20, color: T.fg, margin: '0 0 6px', fontWeight: 700 }}>Creating @{username}</p>
                <p style={{ fontFamily: T.mono, fontSize: 11, color: T.fgMuted, margin: 0 }}>Setting up your account…</p>
              </div>
            </div>
          )}
          {step === 'BURNER_SIGN' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, padding: '24px 0', animation: 'vOnbSlideUp 0.3s ease' }}>
              <SpinRing />
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontFamily: T.display, fontStyle: 'italic', fontSize: 20, color: T.fg, margin: '0 0 6px', fontWeight: 700 }}>One signature needed</p>
                <p style={{ fontFamily: T.mono, fontSize: 11, color: T.fgMuted, margin: 0 }}>Derives your trading wallet — no gas, no ETH spent.</p>
              </div>
              <div style={{ display: 'flex', gap: 8, padding: '10px 16px', borderRadius: 10, background: 'oklch(0.55 0.24 295 / 0.08)', border: `1px solid oklch(0.55 0.24 295 / 0.2)` }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.violet} strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <span style={{ fontFamily: T.mono, fontSize: 10, color: T.fgMuted, letterSpacing: '0.04em' }}>Check MetaMask for the signature request</span>
              </div>
            </div>
          )}
          {step === 'BURNER_SPONSOR' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, padding: '24px 0', animation: 'vOnbSlideUp 0.3s ease' }}>
              <SpinRing />
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontFamily: T.display, fontStyle: 'italic', fontSize: 20, color: T.fg, margin: '0 0 6px', fontWeight: 700 }}>Topping up gas</p>
                <p style={{ fontFamily: T.mono, fontSize: 11, color: T.fgMuted, margin: 0 }}>Sending your trading wallet a little ETH…</p>
              </div>
            </div>
          )}
          {step === 'BURNER_CONFIRM' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, padding: '24px 0', animation: 'vOnbSlideUp 0.3s ease' }}>
              <SpinRing />
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontFamily: T.display, fontStyle: 'italic', fontSize: 20, color: T.fg, margin: '0 0 6px', fontWeight: 700 }}>Claiming 1,000 mUSDC</p>
                <p style={{ fontFamily: T.mono, fontSize: 11, color: T.fgMuted, margin: 0 }}>Minting your testnet USDC on Base Sepolia…</p>
              </div>
              {claimTxHash && (
                <a href={baseScanTxUrl(claimTxHash)} target="_blank" rel="noopener noreferrer" style={{ fontFamily: T.mono, fontSize: 11, color: T.violet, display: 'flex', alignItems: 'center', gap: 5, textDecoration: 'none' }}>
                  View on BaseScan <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </a>
              )}
            </div>
          )}

          {/* ══ SUCCESS NEW ══ */}
          {step === 'SUCCESS_NEW' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '12px 0 4px', animation: 'vOnbSlideUp 0.4s ease' }}>
              <div style={{ position: 'relative', width: 80, height: 80, marginBottom: 26 }}>
                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.12)' }} />
                <svg viewBox="0 0 80 80" width="80" height="80" style={{ position: 'absolute', inset: 0 }}>
                  <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(52,211,153,0.12)" strokeWidth="1.5" />
                  <circle cx="40" cy="40" r="32" fill="none" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="201" strokeDashoffset="201" transform="rotate(-90 40 40)" style={{ animation: 'vOnbDrawArc 0.6s cubic-bezier(0.4,0,0.2,1) 0.1s both' }} />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'vOnbCheckIn 0.35s cubic-bezier(0.34,1.4,0.64,1) 0.65s both' }}>
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 11 9 16 18 6"/></svg>
                </div>
              </div>
              <p style={{ fontFamily: T.display, fontSize: 26, fontStyle: 'italic', fontWeight: 700, color: T.fg, margin: '0 0 6px', letterSpacing: '-0.02em', animation: 'vOnbSlideUp 0.4s ease 0.85s both' }}>
                You're live.
              </p>
              <p style={{ fontFamily: T.mono, fontSize: 11, color: T.fgMuted, margin: '0 0 22px', letterSpacing: '0.04em', animation: 'vOnbSlideUp 0.35s ease 1.0s both' }}>
                @{username} · trading wallet funded
              </p>
              <div style={{ width: '100%', borderRadius: 16, border: `1px solid ${T.hairline}`, background: 'rgba(255,255,255,0.025)', overflow: 'hidden', marginBottom: 16, animation: 'vOnbSlideUp 0.35s ease 1.15s both' }}>
                <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: T.mono, fontSize: 10, color: T.fgSubtle, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Balance credited</span>
                  <span style={{ fontFamily: T.display, fontStyle: 'italic', fontSize: 26, fontWeight: 700, color: T.green }}>${(claimBalance || 1000).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                </div>
                {burnerAddr && (
                  <div style={{ padding: '11px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: T.mono, fontSize: 10, color: T.fgSubtle, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Trading wallet</span>
                    <span style={{ fontFamily: T.mono, fontSize: 11, color: T.fgMuted }}>{burnerAddr.slice(0,6)}…{burnerAddr.slice(-4)}</span>
                  </div>
                )}
              </div>
              {claimTxHash && (
                <a href={baseScanTxUrl(claimTxHash)} target="_blank" rel="noopener noreferrer" style={{ fontFamily: T.mono, fontSize: 11, color: T.violet, display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 20, textDecoration: 'none', animation: 'vOnbSlideUp 0.35s ease 1.3s both' }}>
                  Claim tx on BaseScan <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </a>
              )}
              <div style={{ width: '100%', animation: 'vOnbSlideUp 0.35s ease 1.45s both' }}>
                <button onClick={() => { if (!completedRef.current) { completedRef.current = true; } onClose(); }} style={{ width: '100%', padding: 14, borderRadius: 13, border: 'none', background: T.fg, color: '#0B0B0E', fontFamily: T.mono, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  Start trading →
                </button>
              </div>
            </div>
          )}

          {/* ══ SUCCESS RETURNING ══ */}
          {step === 'SUCCESS_RETURNING' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '16px 0 8px', animation: 'vOnbSlideUp 0.4s ease' }}>
              <div style={{ position: 'relative', width: 72, height: 72, marginBottom: 24 }}>
                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.12)' }} />
                <svg viewBox="0 0 72 72" width="72" height="72" style={{ position: 'absolute', inset: 0 }}>
                  <circle cx="36" cy="36" r="28" fill="none" stroke="rgba(167,139,250,0.12)" strokeWidth="1.5" />
                  <circle cx="36" cy="36" r="28" fill="none" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="176" strokeDashoffset="176" transform="rotate(-90 36 36)" style={{ animation: 'vOnbDrawArc 0.55s cubic-bezier(0.4,0,0.2,1) 0.1s both' }} />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'vOnbCheckIn 0.35s cubic-bezier(0.34,1.4,0.64,1) 0.6s both' }}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#a78bfa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 10 8 14 16 6"/></svg>
                </div>
              </div>
              <p style={{ fontFamily: T.display, fontSize: 22, fontStyle: 'italic', fontWeight: 700, color: T.fg, margin: '0 0 6px', letterSpacing: '-0.02em', animation: 'vOnbSlideUp 0.4s ease 0.82s both' }}>
                Welcome back{returningName ? `, ${returningName}` : ''}.
              </p>
              <p style={{ fontFamily: T.mono, fontSize: 11, color: T.fgMuted, margin: '0 0 20px', letterSpacing: '0.04em', animation: 'vOnbSlideUp 0.38s ease 1.0s both' }}>
                Restoring your session…
              </p>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 12px 6px 9px', borderRadius: 6, background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.2)', animation: 'vOnbSlideUp 0.36s ease 1.2s both' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#a78bfa', animation: 'vOnbLiveDot 1.8s ease-in-out infinite' }} />
                <span style={{ fontFamily: T.mono, fontSize: 10, color: '#a78bfa', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>Velo · Authenticated</span>
              </div>
            </div>
          )}

        </div>

        <style>{`
          @keyframes vOnbSpin { to { transform: rotate(360deg); } }
          @keyframes vOnbPulseRing { 0%,100% { transform:scale(0.86);opacity:0.5; } 50% { transform:scale(1.12);opacity:0.15; } }
          @keyframes vOnbSlideUp { from { opacity:0;transform:translateY(12px); } to { opacity:1;transform:translateY(0); } }
          @keyframes vOnbDrawArc { from { stroke-dashoffset:201; } to { stroke-dashoffset:0; } }
          @keyframes vOnbCheckIn { from { opacity:0;transform:scale(0.4) translateY(2px); } to { opacity:1;transform:scale(1) translateY(0); } }
          @keyframes vOnbLiveDot { 0%,100% { opacity:1;transform:scale(1); } 50% { opacity:0.35;transform:scale(0.65); } }
        `}</style>
      </div>
    </div>,
    document.body
  );
};

export function shouldShowOnboarding(args: {
  isConnected: boolean; chainId?: number; address?: string | null;
  isRegistered?: boolean; hasBurner?: boolean; usdcBalance?: number;
}): boolean {
  if (!args.isConnected) return false;
  if (args.chainId !== undefined && args.chainId !== EXPECTED_CHAIN_ID) return false;
  if (args.isRegistered) return false;
  if (args.hasBurner && (args.usdcBalance ?? 0) > 0) return false;
  return !isDismissed(args.address);
}

export function useOnboardingGuard(_user: any, _setLoginOpen: (v: boolean) => void) {}
export { markDismissed as markWelcomeDismissed };
