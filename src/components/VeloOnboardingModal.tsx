// VeloOnboardingModal — new-user registration only.
//
// Shown ONLY when a wallet connects and has NO existing Velo account.
// Wallet connection is handled by Reown AppKit. This modal does NOT open AppKit.
//
// Steps:
//   HELLO          → Apple-style animated welcome splash
//   USERNAME       → pick a handle
//   EMAIL          → optional email
//   REVIEW         → confirm + create account
//   CREATING / BURNER_SIGN / BURNER_SPONSOR / BURNER_CONFIRM → progress
//   SUCCESS_NEW    → funded, done
//   SUCCESS_RETURNING → welcome back (auto-closes)

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
  returningName?: string;
}

type Step =
  | 'HELLO'
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

// ─── Micro components — all use CSS vars for light/dark theme ────────────────

const VLogo = ({ size = 48 }: { size?: number }) => (
  <div style={{
    width: size, height: size,
    borderRadius: Math.round(size * 0.24),
    background: 'linear-gradient(135deg, oklch(0.45 0.26 295) 0%, oklch(0.55 0.24 285) 40%, oklch(0.65 0.22 268) 80%, oklch(0.72 0.18 250) 100%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    position: 'relative', overflow: 'hidden', flexShrink: 0,
    boxShadow: `0 4px 20px oklch(0.55 0.24 295 / 0.4)`,
  }}>
    <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 80% at 28% 8%, rgba(255,255,255,0.38), transparent 55%)' }} />
    <span style={{ fontFamily: 'Georgia,serif', fontSize: size * 0.46, color: '#fff', fontStyle: 'italic', fontWeight: 700, lineHeight: 1, position: 'relative', zIndex: 1 }}>V</span>
  </div>
);

const HoloBar = ({ step, total = 3 }: { step: number; total?: number }) => (
  <div style={{ display: 'flex', gap: 5, marginBottom: 24 }}>
    {Array.from({ length: total }).map((_, i) => (
      <div key={i} style={{
        height: 2.5, flex: 1, borderRadius: 2,
        background: i <= step ? 'oklch(0.55 0.24 295)' : 'var(--hairline, rgba(0,0,0,0.08))',
        opacity: i < step ? 0.4 : 1,
        transition: 'background 0.4s, opacity 0.4s',
      }} />
    ))}
  </div>
);

const PrimaryBtn = ({ onClick, children, disabled = false }: {
  onClick: () => void; children: React.ReactNode; disabled?: boolean;
}) => (
  <button onClick={onClick} disabled={disabled} style={{
    width: '100%', padding: 14,
    background: disabled ? 'var(--chip-bg, rgba(0,0,0,0.05))' : 'linear-gradient(135deg, oklch(0.45 0.26 295) 0%, oklch(0.55 0.24 285) 40%, oklch(0.65 0.22 268) 80%, oklch(0.72 0.18 250) 100%)',
    border: 'none', borderRadius: 13,
    fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 12, fontWeight: 700,
    color: disabled ? 'var(--fg-subtle, rgba(0,0,0,0.3))' : '#fff',
    cursor: disabled ? 'not-allowed' : 'pointer',
    letterSpacing: '0.08em', textTransform: 'uppercase' as const,
    boxShadow: disabled ? 'none' : '0 6px 24px -6px oklch(0.55 0.24 295 / 0.45)',
    transition: 'transform 0.14s, box-shadow 0.14s',
    opacity: disabled ? 0.5 : 1,
  }}
  onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; }}
  >{children}</button>
);

const GhostBtn = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button onClick={onClick} style={{
    width: '100%', padding: 11, background: 'none', borderRadius: 12,
    border: '1px solid var(--hairline-strong, rgba(0,0,0,0.1))',
    fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 11, fontWeight: 700,
    color: 'var(--fg-subtle)', cursor: 'pointer', letterSpacing: '0.06em',
    textTransform: 'uppercase' as const, transition: 'border-color 0.15s, color 0.15s',
  }}
  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'oklch(0.55 0.24 295)'; (e.currentTarget as HTMLElement).style.color = 'var(--fg)'; }}
  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--hairline-strong, rgba(0,0,0,0.1))'; (e.currentTarget as HTMLElement).style.color = 'var(--fg-subtle)'; }}
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
        <span style={{ fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)' }}>{label}</span>
        {optional && <span style={{ fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 9, color: 'var(--fg-subtle)', letterSpacing: '0.08em', textTransform: 'uppercase' as const, opacity: 0.6 }}>Optional</span>}
      </div>
      <input type={type} value={value} placeholder={placeholder} autoFocus={autoFocus}
        onChange={e => onChange(e.target.value)} onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{
          width: '100%', padding: '12px 14px', boxSizing: 'border-box' as const,
          background: 'var(--chip-bg, rgba(0,0,0,0.04))',
          border: `1.5px solid ${error ? 'oklch(0.62 0.22 25)' : focused ? 'oklch(0.55 0.24 295)' : 'var(--hairline-strong)'}`,
          borderRadius: 12,
          fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 14,
          color: 'var(--fg)', outline: 'none', transition: 'border-color 0.18s',
        }}
      />
      {hint && !error && <p style={{ fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 10, color: 'var(--fg-subtle)', margin: '5px 0 0', opacity: 0.7 }}>{hint}</p>}
      {error && <p style={{ fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 11, color: 'oklch(0.62 0.22 25)', margin: '5px 0 0' }}>{error}</p>}
    </div>
  );
};

const WalletPill = ({ address }: { address: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 13px', background: 'oklch(0.78 0.18 150 / 0.07)', border: '1px solid oklch(0.78 0.18 150 / 0.2)', borderRadius: 11 }}>
    <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'oklch(0.78 0.18 150)', flexShrink: 0 }} />
    <span style={{ fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 12, color: 'var(--fg)', fontWeight: 600, flex: 1 }}>{address.slice(0, 10)}…{address.slice(-8)}</span>
    <span style={{ fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 9, color: 'oklch(0.78 0.18 150)', letterSpacing: '0.07em', textTransform: 'uppercase' as const }}>Connected</span>
  </div>
);

const SpinRing = () => (
  <div style={{ position: 'relative', width: 52, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid oklch(0.55 0.24 295)', opacity: 0.25, animation: 'vOnbPulseRing 1.5s ease-in-out infinite' }} />
    <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid var(--hairline-strong)', borderTopColor: 'oklch(0.55 0.24 295)', animation: 'vOnbSpin 0.85s linear infinite' }} />
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

  const [step, setStep] = useState<Step>('HELLO');
  const [visible, setVisible] = useState(false);
  const [helloPhase, setHelloPhase] = useState(0);

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [fallbackInput, setFallbackInput] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [globalError, setGlobalError] = useState('');

  const [claimTxHash, setClaimTxHash] = useState<`0x${string}` | null>(null);
  const [claimBalance, setClaimBalance] = useState(0);
  const [burnerAddr, setBurnerAddr] = useState<string | null>(null);

  const completedRef = useRef(false);
  const usernameCheckRef = useRef<string | null>(null);
  const flowAbortedRef = useRef(false);

  useEffect(() => { if (disconnectRef) disconnectRef.current = disconnect; }, [disconnect, disconnectRef]);

  // HELLO splash animation — 3 phases
  useEffect(() => {
    if (!isOpen || step !== 'HELLO') return;
    setHelloPhase(0);
    const t1 = setTimeout(() => setHelloPhase(1), 500);
    const t2 = setTimeout(() => setHelloPhase(2), 1100);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [step, isOpen]);

  useEffect(() => {
    if (isOpen) {
      const initialStep: Step = returningName
        ? 'SUCCESS_RETURNING'
        : chainId !== EXPECTED_CHAIN_ID
        ? 'WRONG_NETWORK'
        : 'HELLO';
      setStep(initialStep);
      setHelloPhase(0);
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

  useEffect(() => {
    if (!isOpen || step !== 'WRONG_NETWORK') return;
    if (chainId === EXPECTED_CHAIN_ID) setStep('HELLO');
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
    if (step === 'HELLO') { setStep('USERNAME'); return; }
    if (step === 'USERNAME') {
      const err = validateHandle(username);
      if (err) { setFieldError(err); return; }
      if (supabaseReady) {
        const uname = username.trim().toLowerCase();
        if (usernameCheckRef.current !== uname) {
          usernameCheckRef.current = uname;
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
    if (step === 'USERNAME') { setStep('HELLO'); return; }
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
      await supabase.from('profiles').update({
        username: uname,
        handle: `@${uname}`,
        wallet_address: address.toLowerCase(),
        auth_method: 'WALLET',
        ...(contactEmail ? { email: contactEmail } : {}),
      }).eq('id', authUser.id);
      let { data: profile } = await supabase.from('profiles').select('*').eq('id', authUser.id).single();

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
      const { data: profileWithBurner } = await supabase
        .from('profiles')
        .update({ velo_wallet_address: result.burner.veloAddress.toLowerCase() })
        .eq('id', authUser.id)
        .select()
        .single();
      if (profileWithBurner) profile = profileWithBurner;

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
      try { bal = await fetchUsdcBalance(publicClient, VELO_USDC_BASE, result.burner.veloAddress); setClaimBalance(bal); }
      catch { setClaimBalance(1000); }

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
        setGlobalError('You cancelled the signature. Your account was saved — tap "Create account" to try again.');
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

  if (!isOpen) return null;
  const progIdx = PROGRESS_IDX[step] ?? null;

  return createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget && showClose) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(14px) saturate(130%)',
        WebkitBackdropFilter: 'blur(14px) saturate(130%)',
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
          // CSS vars — adapts to light/dark automatically from tokens.css
          background: 'var(--modal-bg, var(--glass-bg-strong, rgba(255,255,255,0.98)))',
          borderRadius: 26,
          border: '1px solid var(--hairline-strong)',
          boxShadow: 'var(--glass-shadow, 0 32px 96px rgba(0,0,0,0.18))',
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
          overflow: 'hidden',
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(18px) scale(0.97)',
          transition: 'transform 0.4s cubic-bezier(0.22,1,0.36,1)',
          color: 'var(--fg)',
        }}
      >
        {/* Holo top stripe */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2.5, zIndex: 2,
          background: 'linear-gradient(90deg, oklch(0.45 0.26 295), oklch(0.62 0.22 268), oklch(0.72 0.18 250), oklch(0.78 0.18 150))',
        }} />

        {/* Close button */}
        {showClose && (
          <button onClick={onClose} aria-label="Close" style={{
            position: 'absolute', top: 16, right: 16, zIndex: 10,
            width: 30, height: 30, borderRadius: 999,
            background: 'var(--chip-bg)', border: '1px solid var(--hairline-strong)',
            color: 'var(--fg-subtle)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        )}

        <div style={{ padding: '28px 28px 30px' }}>
          {progIdx !== null && step !== 'HELLO' && <HoloBar step={progIdx} total={3} />}

          {/* ══ HELLO — Apple-style splash ══ */}
          {step === 'HELLO' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '32px 0 28px', minHeight: 340 }}>
              {/* Animated logo with orbit rings */}
              <div style={{
                position: 'relative', width: 96, height: 96, marginBottom: 32,
                opacity: helloPhase >= 0 ? 1 : 0,
                transform: helloPhase >= 0 ? 'scale(1) translateY(0)' : 'scale(0.6) translateY(12px)',
                transition: 'opacity 0.7s cubic-bezier(0.22,1,0.36,1), transform 0.7s cubic-bezier(0.22,1,0.36,1)',
              }}>
                <div style={{ position: 'absolute', inset: -8, borderRadius: '50%', border: '1px solid oklch(0.55 0.24 295 / 0.2)', animation: 'vOnbOrbit 4s linear infinite' }} />
                <div style={{ position: 'absolute', inset: -14, borderRadius: '50%', border: '1px dashed oklch(0.55 0.24 295 / 0.1)', animation: 'vOnbOrbitRev 7s linear infinite' }} />
                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'oklch(0.55 0.24 295 / 0.12)', filter: 'blur(16px)', transform: 'scale(1.3)' }} />
                <VLogo size={96} />
              </div>

              <div style={{
                opacity: helloPhase >= 1 ? 1 : 0,
                transform: helloPhase >= 1 ? 'translateY(0)' : 'translateY(14px)',
                transition: 'opacity 0.6s ease 0.1s, transform 0.6s ease 0.1s',
              }}>
                <h1 style={{ fontFamily: 'Georgia,serif', fontStyle: 'italic', fontSize: 36, fontWeight: 700, color: 'var(--fg)', margin: '0 0 10px', letterSpacing: '-0.02em', lineHeight: 1 }}>
                  Hello.
                </h1>
                <p style={{ fontFamily: '-apple-system,BlinkMacSystemFont,sans-serif', fontSize: 15, color: 'var(--fg-muted)', margin: '0 0 6px', lineHeight: 1.6, maxWidth: 300 }}>
                  Welcome to Velo — real on-chain perps with up to 25× leverage.
                </p>
                <p style={{ fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 11, color: 'var(--fg-subtle)', margin: 0, letterSpacing: '0.06em' }}>
                  1,000 mUSDC · Base Sepolia · Non-custodial
                </p>
              </div>

              <div style={{
                width: '100%', marginTop: 36,
                opacity: helloPhase >= 2 ? 1 : 0,
                transform: helloPhase >= 2 ? 'translateY(0)' : 'translateY(10px)',
                transition: 'opacity 0.5s ease, transform 0.5s ease',
              }}>
                <PrimaryBtn onClick={advance}>Get started →</PrimaryBtn>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 18 }}>
                  {[['25×', 'Leverage'], ['0.1%', 'Fee / side'], ['Pyth', 'Oracle']].map(([v, l]) => (
                    <div key={l} style={{ textAlign: 'center' }}>
                      <div style={{ fontFamily: 'Georgia,serif', fontStyle: 'italic', fontSize: 15, fontWeight: 700, color: 'oklch(0.55 0.24 295)', lineHeight: 1 }}>{v}</div>
                      <div style={{ fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 9, color: 'var(--fg-subtle)', textTransform: 'uppercase' as const, letterSpacing: '0.1em', marginTop: 3 }}>{l}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ══ WRONG NETWORK ══ */}
          {step === 'WRONG_NETWORK' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ textAlign: 'center', padding: '8px 0' }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'oklch(0.74 0.18 30 / 0.1)', border: '1.5px solid oklch(0.74 0.18 30 / 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="oklch(0.74 0.18 30)" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                </div>
                <p style={{ fontFamily: 'Georgia,serif', fontSize: 18, fontStyle: 'italic', fontWeight: 700, color: 'var(--fg)', margin: '0 0 6px' }}>Wrong network</p>
                <p style={{ fontSize: 12.5, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.6 }}>
                  Velo runs on <strong style={{ color: 'var(--fg)' }}>Base Sepolia</strong>. Please switch your wallet.
                </p>
              </div>
              {address && <WalletPill address={address} />}
              <button onClick={() => switchChain({ chainId: EXPECTED_CHAIN_ID })} style={{ width: '100%', padding: '12px 0', borderRadius: 12, border: 'none', background: 'var(--fg)', color: 'var(--bg)', fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, cursor: 'pointer' }}>
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
                  <p style={{ fontFamily: 'Georgia,serif', fontSize: 17, fontStyle: 'italic', fontWeight: 700, color: 'var(--fg)', margin: 0, lineHeight: 1.2 }}>Pick your handle</p>
                  <p style={{ fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 9, color: 'var(--fg-subtle)', margin: '3px 0 0', letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>New account · Step 1 of 3</p>
                </div>
              </div>
              <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.65 }}>
                This is how you'll appear on leaderboards, the social feed, and copy trading rankings.
              </p>
              {address && <WalletPill address={address} />}
              <Field label="Username" value={username} onChange={v => { setUsername(v); setFieldError(''); }} placeholder="e.g. alpha_trader" autoFocus error={fieldError} hint="3–20 chars · letters, numbers, underscores" onKeyDown={e => e.key === 'Enter' && advance()} />
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 13px', borderRadius: 12, background: 'oklch(0.55 0.24 295 / 0.06)', border: '1px solid oklch(0.55 0.24 295 / 0.15)' }}>
                <span style={{ color: 'oklch(0.55 0.24 295)', fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 13, fontWeight: 700, lineHeight: 1.4, flexShrink: 0, marginTop: 1 }}>@</span>
                <p style={{ fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 10.5, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.6 }}>Your handle is registered <span style={{ color: 'oklch(0.55 0.24 295)', fontWeight: 700 }}>on-chain</span> in the Velo Name Registry and tied permanently to your wallet.</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <PrimaryBtn onClick={advance} disabled={!username.trim()}>Continue →</PrimaryBtn>
                <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 14 }}>
                  <p style={{ fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 9, color: 'var(--fg-subtle)', textAlign: 'center', letterSpacing: '0.08em', textTransform: 'uppercase' as const, margin: '0 0 10px', opacity: 0.6 }}>or use demo mode</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="text" placeholder="Demo username" value={fallbackInput} onChange={e => setFallbackInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && fallbackInput.trim() && (onFallbackLogin?.(fallbackInput.trim()), onClose())} style={{ flex: 1, padding: '10px 12px', background: 'var(--chip-bg)', border: '1px solid var(--hairline-strong)', borderRadius: 10, fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 12, color: 'var(--fg)', outline: 'none' }} />
                    <button onClick={() => { if (fallbackInput.trim()) { onFallbackLogin?.(fallbackInput.trim()); onClose(); }}} disabled={!fallbackInput.trim()} style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--chip-bg)', border: '1px solid var(--hairline-strong)', fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 11, fontWeight: 700, color: 'var(--fg-subtle)', cursor: fallbackInput.trim() ? 'pointer' : 'not-allowed', letterSpacing: '0.06em', textTransform: 'uppercase' as const, opacity: fallbackInput.trim() ? 1 : 0.5 }}>Demo</button>
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
                  <p style={{ fontFamily: 'Georgia,serif', fontSize: 17, fontStyle: 'italic', fontWeight: 700, color: 'var(--fg)', margin: 0, lineHeight: 1.2 }}>Stay in the loop</p>
                  <p style={{ fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 9, color: 'var(--fg-subtle)', margin: '3px 0 0', letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>Step 2 of 3</p>
                </div>
              </div>
              <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.65 }}>
                Get notified when positions are filled, liquidated, or copied. You can add this later in Settings.
              </p>
              <Field label="Email" value={email} onChange={v => { setEmail(v); setFieldError(''); }} placeholder="your@email.com" type="email" autoFocus optional error={fieldError} onKeyDown={e => e.key === 'Enter' && advance()} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <PrimaryBtn onClick={advance}>{email.trim() ? 'Continue →' : 'Skip for now →'}</PrimaryBtn>
                <GhostBtn onClick={back}>← Back</GhostBtn>
              </div>
            </div>
          )}

          {/* ══ REVIEW ══ */}
          {step === 'REVIEW' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, animation: 'vOnbSlideUp 0.32s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                <VLogo size={36} />
                <div>
                  <p style={{ fontFamily: 'Georgia,serif', fontSize: 17, fontStyle: 'italic', fontWeight: 700, color: 'var(--fg)', margin: 0, lineHeight: 1.2 }}>Ready to launch</p>
                  <p style={{ fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 9, color: 'var(--fg-subtle)', margin: '3px 0 0', letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>Step 3 of 3</p>
                </div>
              </div>
              {globalError && <div style={{ padding: '10px 13px', borderRadius: 10, background: 'oklch(0.62 0.22 25 / 0.08)', border: '1px solid oklch(0.62 0.22 25 / 0.25)', color: 'oklch(0.62 0.22 25)', fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 12, lineHeight: 1.5 }}>{globalError}</div>}
              <div style={{ borderRadius: 14, border: '1px solid var(--hairline-strong)', overflow: 'hidden' }}>
                {[
                  { lbl: 'Wallet', val: address ? `${address.slice(0,10)}…${address.slice(-8)}` : '—' },
                  { lbl: 'Handle', val: `@${username}` },
                  { lbl: 'Email', val: email.trim() || '—' },
                  { lbl: 'Network', val: 'Base Sepolia' },
                  { lbl: 'Starting balance', val: '1,000 mUSDC' },
                ].map(({ lbl, val }, i, arr) => (
                  <div key={lbl} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 15px', borderBottom: i < arr.length - 1 ? '1px solid var(--hairline)' : 'none', background: i % 2 === 0 ? 'var(--chip-bg)' : 'transparent' }}>
                    <span style={{ fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 10, color: 'var(--fg-subtle)', letterSpacing: '0.07em', textTransform: 'uppercase' as const }}>{lbl}</span>
                    <span style={{ fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 12, color: lbl === 'Starting balance' ? 'oklch(0.78 0.18 150)' : 'var(--fg)', fontWeight: 600, textAlign: 'right' as const, maxWidth: '58%', wordBreak: 'break-all' as const }}>{val}</span>
                  </div>
                ))}
              </div>
              <div style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--chip-bg)', border: '1px solid var(--hairline-strong)' }}>
                <p style={{ fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 10, color: 'var(--fg-subtle)', margin: 0, lineHeight: 1.65 }}>
                  Tapping "Create account" asks MetaMask for <strong style={{ color: 'var(--fg-muted)' }}>one gas-free signature</strong> to derive your trading wallet. No ETH is spent at this step.
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <PrimaryBtn onClick={handleCreate}>Create account →</PrimaryBtn>
                <GhostBtn onClick={back}>← Edit details</GhostBtn>
              </div>
            </div>
          )}

          {/* ══ IN-PROGRESS ══ */}
          {step === 'CREATING' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, padding: '24px 0' }}>
              <SpinRing />
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontFamily: 'Georgia,serif', fontStyle: 'italic', fontSize: 20, color: 'var(--fg)', margin: '0 0 6px', fontWeight: 700 }}>Creating @{username}</p>
                <p style={{ fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 11, color: 'var(--fg-muted)', margin: 0 }}>Setting up your account…</p>
              </div>
            </div>
          )}
          {step === 'BURNER_SIGN' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, padding: '24px 0' }}>
              <SpinRing />
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontFamily: 'Georgia,serif', fontStyle: 'italic', fontSize: 20, color: 'var(--fg)', margin: '0 0 6px', fontWeight: 700 }}>One signature needed</p>
                <p style={{ fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 11, color: 'var(--fg-muted)', margin: 0 }}>Derives your trading wallet — no gas, no ETH spent.</p>
              </div>
              <div style={{ display: 'flex', gap: 8, padding: '10px 16px', borderRadius: 10, background: 'oklch(0.55 0.24 295 / 0.06)', border: '1px solid oklch(0.55 0.24 295 / 0.18)' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="oklch(0.55 0.24 295)" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <span style={{ fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 10, color: 'var(--fg-muted)', letterSpacing: '0.04em' }}>Check MetaMask for the signature request</span>
              </div>
            </div>
          )}
          {step === 'BURNER_SPONSOR' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, padding: '24px 0' }}>
              <SpinRing />
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontFamily: 'Georgia,serif', fontStyle: 'italic', fontSize: 20, color: 'var(--fg)', margin: '0 0 6px', fontWeight: 700 }}>Topping up gas</p>
                <p style={{ fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 11, color: 'var(--fg-muted)', margin: 0 }}>Sending your trading wallet a little ETH…</p>
              </div>
            </div>
          )}
          {step === 'BURNER_CONFIRM' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, padding: '24px 0' }}>
              <SpinRing />
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontFamily: 'Georgia,serif', fontStyle: 'italic', fontSize: 20, color: 'var(--fg)', margin: '0 0 6px', fontWeight: 700 }}>Claiming 1,000 mUSDC</p>
                <p style={{ fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 11, color: 'var(--fg-muted)', margin: 0 }}>Minting your testnet USDC on Base Sepolia…</p>
              </div>
              {claimTxHash && (
                <a href={baseScanTxUrl(claimTxHash)} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 11, color: 'oklch(0.55 0.24 295)', display: 'flex', alignItems: 'center', gap: 5, textDecoration: 'none' }}>
                  View on BaseScan <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </a>
              )}
            </div>
          )}

          {/* ══ SUCCESS NEW ══ */}
          {step === 'SUCCESS_NEW' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '12px 0 4px', animation: 'vOnbSlideUp 0.4s ease' }}>
              <div style={{ position: 'relative', width: 80, height: 80, marginBottom: 26 }}>
                <svg viewBox="0 0 80 80" width="80" height="80" style={{ position: 'absolute', inset: 0 }}>
                  <circle cx="40" cy="40" r="32" fill="none" stroke="oklch(0.78 0.18 150 / 0.15)" strokeWidth="1.5" />
                  <circle cx="40" cy="40" r="32" fill="none" stroke="oklch(0.78 0.18 150)" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="201" strokeDashoffset="201" transform="rotate(-90 40 40)" style={{ animation: 'vOnbDrawArc 0.6s cubic-bezier(0.4,0,0.2,1) 0.1s both' }} />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'vOnbCheckIn 0.35s cubic-bezier(0.34,1.4,0.64,1) 0.65s both' }}>
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="oklch(0.78 0.18 150)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 11 9 16 18 6"/></svg>
                </div>
              </div>
              <p style={{ fontFamily: 'Georgia,serif', fontSize: 26, fontStyle: 'italic', fontWeight: 700, color: 'var(--fg)', margin: '0 0 6px', letterSpacing: '-0.02em', animation: 'vOnbSlideUp 0.4s ease 0.85s both' }}>You're live.</p>
              <p style={{ fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 11, color: 'var(--fg-muted)', margin: '0 0 22px', letterSpacing: '0.04em', animation: 'vOnbSlideUp 0.35s ease 1.0s both' }}>@{username} · trading wallet funded</p>
              <div style={{ width: '100%', borderRadius: 16, border: '1px solid var(--hairline-strong)', background: 'var(--chip-bg)', overflow: 'hidden', marginBottom: 16, animation: 'vOnbSlideUp 0.35s ease 1.15s both' }}>
                <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--hairline)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 10, color: 'var(--fg-subtle)', letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>Balance credited</span>
                  <span style={{ fontFamily: 'Georgia,serif', fontStyle: 'italic', fontSize: 26, fontWeight: 700, color: 'oklch(0.78 0.18 150)' }}>${(claimBalance || 1000).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                </div>
                {burnerAddr && (
                  <div style={{ padding: '11px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 10, color: 'var(--fg-subtle)', letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>Trading wallet</span>
                    <span style={{ fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 11, color: 'var(--fg-muted)' }}>{burnerAddr.slice(0,6)}…{burnerAddr.slice(-4)}</span>
                  </div>
                )}
              </div>
              {claimTxHash && (
                <a href={baseScanTxUrl(claimTxHash)} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 11, color: 'oklch(0.55 0.24 295)', display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 20, textDecoration: 'none', animation: 'vOnbSlideUp 0.35s ease 1.3s both' }}>
                  Claim tx on BaseScan <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </a>
              )}
              <div style={{ width: '100%', animation: 'vOnbSlideUp 0.35s ease 1.45s both' }}>
                <button onClick={() => { completedRef.current = true; onClose(); }} style={{ width: '100%', padding: 14, borderRadius: 13, border: 'none', background: 'var(--fg)', color: 'var(--bg)', fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, cursor: 'pointer' }}>
                  Start trading →
                </button>
              </div>
            </div>
          )}

          {/* ══ SUCCESS RETURNING ══ */}
          {step === 'SUCCESS_RETURNING' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '16px 0 8px', animation: 'vOnbSlideUp 0.4s ease' }}>
              <div style={{ position: 'relative', width: 72, height: 72, marginBottom: 24 }}>
                <svg viewBox="0 0 72 72" width="72" height="72" style={{ position: 'absolute', inset: 0 }}>
                  <circle cx="36" cy="36" r="28" fill="none" stroke="oklch(0.55 0.24 295 / 0.15)" strokeWidth="1.5" />
                  <circle cx="36" cy="36" r="28" fill="none" stroke="oklch(0.55 0.24 295)" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="176" strokeDashoffset="176" transform="rotate(-90 36 36)" style={{ animation: 'vOnbDrawArc 0.55s cubic-bezier(0.4,0,0.2,1) 0.1s both' }} />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'vOnbCheckIn 0.35s cubic-bezier(0.34,1.4,0.64,1) 0.6s both' }}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="oklch(0.55 0.24 295)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 10 8 14 16 6"/></svg>
                </div>
              </div>
              <p style={{ fontFamily: 'Georgia,serif', fontSize: 22, fontStyle: 'italic', fontWeight: 700, color: 'var(--fg)', margin: '0 0 6px', letterSpacing: '-0.02em', animation: 'vOnbSlideUp 0.4s ease 0.82s both' }}>
                Welcome back{returningName ? `, ${returningName}` : ''}.
              </p>
              <p style={{ fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 11, color: 'var(--fg-muted)', margin: '0 0 20px', letterSpacing: '0.04em', animation: 'vOnbSlideUp 0.38s ease 1.0s both' }}>
                Restoring your session…
              </p>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 12px 6px 9px', borderRadius: 6, background: 'oklch(0.55 0.24 295 / 0.07)', border: '1px solid oklch(0.55 0.24 295 / 0.18)', animation: 'vOnbSlideUp 0.36s ease 1.2s both' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'oklch(0.55 0.24 295)', animation: 'vOnbLiveDot 1.8s ease-in-out infinite' }} />
                <span style={{ fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 10, color: 'oklch(0.55 0.24 295)', letterSpacing: '0.08em', textTransform: 'uppercase' as const, fontWeight: 600 }}>Velo · Authenticated</span>
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
          @keyframes vOnbOrbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes vOnbOrbitRev { from { transform: rotate(0deg); } to { transform: rotate(-360deg); } }
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
