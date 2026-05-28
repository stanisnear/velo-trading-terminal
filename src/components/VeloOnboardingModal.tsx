// VeloOnboardingModal — unified onboarding.
//
// One modal handles the full journey, start to finish:
//
//   WELCOME         → animated splash, stats, "Get started"
//   CONNECT         → wallet connection (MetaMask / WalletConnect / Coinbase)
//   CHECKING        → verifying session / returning vs new
//   WRONG_NETWORK   → switch to Base Sepolia
//   WRONG_WALLET    → session mismatch resolution
//   USERNAME        → pick a handle (uniqueness checked)
//   EMAIL           → optional email for notifications
//   REVIEW          → summary card before committing
//   CREATING        → Supabase signUp in progress
//   BURNER_SIGN     → waiting for MetaMask sig to derive trading wallet
//   BURNER_SPONSOR  → gas sponsor topping up ETH
//   BURNER_CONFIRM  → faucet tx mining on-chain
//   SUCCESS_NEW     → "$1,000 claimed" Apple-style celebration + tx link
//   SUCCESS_RETURNING → welcome back animation, auto-closes
//
// Returning wallets go directly to SUCCESS_RETURNING.
// MetaMask cancel → ERROR screen, never SUCCESS.
// Required for new users — cannot close until finished.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAppKit, useAppKitState, useAppKitAccount } from '@reown/appkit/react';
import { useAccount, useDisconnect, useChainId, usePublicClient, useWalletClient, useSwitchChain } from 'wagmi';
import { isConfigured as isSupabaseConfigured, supabase } from '../services/supabaseStore';
import { setupBurnerWallet, createBurnerWalletClient } from '../services/veloBurnerSetup';
import { fetchUsdcBalance, fetchFaucetCooldown } from '../services/veloUsdcService';
import { VELO_USDC_BASE, VELO_PERPS_ADDRESS, baseScanTxUrl, baseScanAddressUrl } from '../services/veloPerpsService';
import { claimUsername, fetchUsernameForAddress, validateUsername as validateUsernameOnChain } from '../services/usernameService';
import { ensureBurnerGas } from '../services/veloGasSponsor';

const EXPECTED_CHAIN_ID = 84532;

// ─── Storage helpers ──────────────────────────────────────────────────────────
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

// ─── Props ────────────────────────────────────────────────────────────────────
export interface VeloOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuth: (user: any, profile: any, isNewAccount?: boolean) => void;
  onFallbackLogin?: (username: string) => void;
  onBurnerReady?: (args: { burnerAddress: `0x${string}`; amount: number; txHash: `0x${string}` | null }) => void;
  onUsernameClaimed?: (handle: string, txHash: `0x${string}`) => void;
  required?: boolean;
  disconnectRef?: React.MutableRefObject<(() => void) | null>;
}

// ─── Steps ────────────────────────────────────────────────────────────────────
type Step =
  | 'WELCOME'
  | 'CONNECT'
  | 'CHECKING'
  | 'WRONG_NETWORK'
  | 'WRONG_WALLET'
  | 'USERNAME'
  | 'EMAIL'
  | 'REVIEW'
  | 'CREATING'
  | 'BURNER_SIGN'
  | 'BURNER_SPONSOR'
  | 'BURNER_CONFIRM'
  | 'SUCCESS_NEW'
  | 'SUCCESS_RETURNING';

// Progress bar index (null = hidden)
const PROGRESS_IDX: Partial<Record<Step, number>> = {
  USERNAME: 0, EMAIL: 1, REVIEW: 2,
  CREATING: 2, BURNER_SIGN: 2, BURNER_SPONSOR: 2, BURNER_CONFIRM: 2,
};

// ─── Micro-components ─────────────────────────────────────────────────────────

const VLogo = ({ size = 48, glow = false }: { size?: number; glow?: boolean }) => (
  <div style={{
    width: size, height: size,
    borderRadius: Math.round(size * 0.24),
    flexShrink: 0,
    // Correct Velo brand gradient: deep violet → blue-violet (matches tokens.css --prism-vivid)
    background: 'linear-gradient(135deg, oklch(0.45 0.26 295) 0%, oklch(0.55 0.24 285) 40%, oklch(0.65 0.22 268) 80%, oklch(0.72 0.18 250) 100%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    position: 'relative', overflow: 'hidden',
    boxShadow: glow
      ? '0 0 0 8px oklch(0.55 0.24 295 / 0.18), 0 0 0 22px oklch(0.55 0.24 295 / 0.07), 0 8px 32px oklch(0.55 0.24 295 / 0.6)'
      : '0 4px 20px oklch(0.55 0.24 295 / 0.5)',
    transition: 'box-shadow 0.7s ease',
  }}>
    <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 80% at 28% 8%, rgba(255,255,255,0.45), transparent 55%)' }} />
    <span style={{ fontFamily: 'var(--font-display, Georgia, serif)', fontSize: size * 0.46, color: '#fff', fontStyle: 'italic', fontWeight: 700, lineHeight: 1, position: 'relative', zIndex: 1 }}>V</span>
  </div>
);

const HoloBar = ({ step, total = 3 }: { step: number; total?: number }) => (
  <div style={{ display: 'flex', gap: 5, marginBottom: 24 }}>
    {Array.from({ length: total }).map((_, i) => (
      <div key={i} style={{
        height: 2.5, flex: 1, borderRadius: 2,
        background: i <= step ? 'var(--iris-violet, oklch(0.68 0.22 295))' : 'rgba(255,255,255,0.08)',
        opacity: i < step ? 0.4 : 1,
        transition: 'background 0.4s ease, opacity 0.4s ease',
      }} />
    ))}
  </div>
);

const HoloButton = ({ onClick, children, disabled = false, variant = 'primary' }: {
  onClick: () => void; children: React.ReactNode; disabled?: boolean; variant?: 'primary' | 'ghost';
}) => variant === 'ghost' ? (
  <button onClick={onClick} style={{
    width: '100%', padding: '11px', background: 'none', borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.1)',
    fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
    color: 'rgba(255,255,255,0.4)', cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase',
    transition: 'border-color 0.15s, color 0.15s',
  }}
  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.25)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.7)'; }}
  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.4)'; }}
  >{children}</button>
) : (
  <button onClick={onClick} disabled={disabled} style={{
    width: '100%', padding: '14px',
    background: disabled ? 'rgba(255,255,255,0.06)' : 'var(--holo-linear, linear-gradient(100deg, oklch(0.68 0.22 295), oklch(0.70 0.22 340), oklch(0.74 0.18 30)))',
    backgroundSize: disabled ? '100%' : '220% 100%',
    animation: disabled ? 'none' : 'holoSlide 9s linear infinite',
    border: 'none', borderRadius: 13,
    fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
    color: disabled ? 'rgba(255,255,255,0.25)' : '#0B0B0E',
    cursor: disabled ? 'not-allowed' : 'pointer',
    letterSpacing: '0.08em', textTransform: 'uppercase',
    boxShadow: disabled ? 'none' : '0 6px 24px -6px oklch(0.68 0.22 295 / 0.5)',
    transition: 'transform 0.14s, box-shadow 0.14s',
    opacity: disabled ? 0.5 : 1,
  }}
  onMouseEnter={e => { if (!disabled) { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 10px 30px -6px oklch(0.68 0.22 295 / 0.65)'; }}}
  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = disabled ? 'none' : '0 6px 24px -6px oklch(0.68 0.22 295 / 0.5)'; }}
  >{children}</button>
);

const InputField = ({ label, value, onChange, placeholder, type = 'text', autoFocus, error, onKeyDown, optional = false, hint }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder: string; type?: string; autoFocus?: boolean; error?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void; optional?: boolean; hint?: string;
}) => {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.4)' }}>{label}</span>
        {optional && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Optional</span>}
      </div>
      <input type={type} value={value} placeholder={placeholder} autoFocus={autoFocus}
        onChange={e => onChange(e.target.value)} onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{
          width: '100%', padding: '12px 14px', boxSizing: 'border-box',
          background: 'rgba(255,255,255,0.04)',
          border: `1.5px solid ${error ? 'oklch(0.62 0.22 25)' : focused ? 'oklch(0.68 0.22 295)' : 'rgba(255,255,255,0.1)'}`,
          borderRadius: 12, fontFamily: 'var(--font-mono)', fontSize: 14,
          color: 'var(--fg)', outline: 'none', transition: 'border-color 0.18s',
        }}
      />
      {hint && !error && <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'rgba(255,255,255,0.3)', margin: '5px 0 0', letterSpacing: '0.02em' }}>{hint}</p>}
      {error && <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'oklch(0.62 0.22 25)', margin: '5px 0 0' }}>{error}</p>}
    </div>
  );
};

const WalletPill = ({ address }: { address: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 13px', background: 'oklch(0.78 0.18 150 / 0.07)', border: '1px solid oklch(0.78 0.18 150 / 0.2)', borderRadius: 11 }}>
    <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--pnl-up, #34d399)', flexShrink: 0 }} />
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)', fontWeight: 600, flex: 1 }}>{address.slice(0, 10)}…{address.slice(-8)}</span>
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--pnl-up, #34d399)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>Connected</span>
  </div>
);

const SpinRing = () => (
  <div style={{ position: 'relative', width: 52, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid oklch(0.68 0.22 295 / 0.3)', animation: 'vOnbPulseRing 1.5s ease-in-out infinite' }} />
    <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.08)', borderTopColor: 'oklch(0.68 0.22 295)', animation: 'vOnbSpin 0.85s linear infinite' }} />
  </div>
);

const TypeReveal = ({ text, size = 28, italic = false, onDone }: { text: string; size?: number; italic?: boolean; onDone?: () => void }) => {
  const words = text.split(' ');
  const [shown, setShown] = useState(0);
  const doneRef = useRef(false);
  useEffect(() => {
    setShown(0); doneRef.current = false; let i = 0;
    const iv = setInterval(() => { i++; setShown(i); if (i >= words.length) { clearInterval(iv); if (!doneRef.current) { doneRef.current = true; onDone?.(); } } }, 110);
    return () => clearInterval(iv);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <p style={{ fontFamily: 'var(--font-display, Georgia, serif)', fontSize: size, fontStyle: italic ? 'italic' : 'normal', fontWeight: 700, color: 'var(--fg)', margin: 0, lineHeight: 1.2 }}>
      {words.map((w, i) => (
        <span key={i} style={{ display: 'inline-block', opacity: i < shown ? 1 : 0, transform: i < shown ? 'translateY(0)' : 'translateY(6px)', transition: 'opacity 0.3s ease, transform 0.3s ease', marginRight: '0.28em' }}>{w}</span>
      ))}
    </p>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
export const VeloOnboardingModal: React.FC<VeloOnboardingModalProps> = ({
  isOpen, onClose, onAuth, onFallbackLogin, onBurnerReady, onUsernameClaimed,
  required = false, disconnectRef,
}) => {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { open: openAppKit } = useAppKit();
  const { open: appKitOpen } = useAppKitState();
  const { embeddedWalletInfo } = useAppKitAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { switchChain } = useSwitchChain();

  const socialEmail: string = (embeddedWalletInfo as any)?.user?.email ?? '';
  const supabaseReady = isSupabaseConfigured();

  const [step, setStep] = useState<Step>('WELCOME');
  const [visible, setVisible] = useState(false);
  const [splashPhase, setSplashPhase] = useState(0);

  // Form state
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [fallbackInput, setFallbackInput] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [globalError, setGlobalError] = useState('');

  // Success state
  const [claimTxHash, setClaimTxHash] = useState<`0x${string}` | null>(null);
  const [claimBalance, setClaimBalance] = useState(0);
  const [burnerAddr, setBurnerAddr] = useState<string | null>(null);
  const [returningName, setReturningName] = useState('');

  // Wrong wallet
  const [wrongWalletInfo, setWrongWalletInfo] = useState<{ connected: string; expected: string } | null>(null);

  // Refs
  const checkedRef = useRef<string | null>(null);
  const completedRef = useRef(false);
  const usernameCheckRef = useRef<string | null>(null);
  const flowAbortedRef = useRef(false);

  // Expose disconnect
  useEffect(() => { if (disconnectRef) disconnectRef.current = disconnect; }, [disconnect, disconnectRef]);

  // Open/close
  useEffect(() => {
    if (isOpen) {
      // Always start at CONNECT so the wallet picker (Reown/AppKit) shows first.
      // WELCOME splash is only shown AFTER we confirm the wallet is brand new
      // (the CHECKING step routes new wallets → WELCOME → USERNAME, returning
      // wallets → SUCCESS_RETURNING which auto-closes).
      const initialStep: Step = (isConnected && address) ? 'CHECKING' : 'CONNECT';
      setStep(initialStep); setUsername(''); setEmail(''); setFallbackInput('');
      setFieldError(''); setGlobalError(''); setReturningName('');
      setWrongWalletInfo(null); setSplashPhase(0);
      checkedRef.current = null; completedRef.current = false;
      usernameCheckRef.current = null; flowAbortedRef.current = false;
      setClaimTxHash(null); setBurnerAddr(null); setClaimBalance(0);
      setTimeout(() => setVisible(true), 10);
    } else {
      setVisible(false);
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // AppKit closes → restore visibility.
  // This covers both "user closed without connecting" (CONNECT step, not connected)
  // and "user just connected" (step transitions to CHECKING). In both cases the
  // Velo modal should be visible again — it was hidden so AppKit could overlay it.
  useEffect(() => {
    if (!isOpen) return;
    if (!appKitOpen) setVisible(true);
  }, [appKitOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Wallet connected → check returning vs new
  useEffect(() => {
    if (!isOpen || !isConnected || !address) return;
    // Allow triggering from both CONNECT (user just connected) and CHECKING
    // (modal opened with wallet already connected — we skipped WELCOME/CONNECT)
    if (step !== 'CONNECT' && step !== 'CHECKING') return;
    if (checkedRef.current === address) return;
    checkedRef.current = address;

    const check = async () => {
      if (chainId !== EXPECTED_CHAIN_ID) { setStep('WRONG_NETWORK'); return; }
      setStep('CHECKING');
      if (!supabaseReady) {
        const shortAddr = `${address.slice(0, 6)}...${address.slice(-4)}`;
        onAuth({ id: address, user_metadata: { username: shortAddr, wallet_address: address } }, null, false);
        onClose(); return;
      }
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const sessionWallet = (session.user.email ?? '').replace('@wallet.velo', '');
          if (sessionWallet && sessionWallet !== address.toLowerCase()) {
            setWrongWalletInfo({ connected: address, expected: sessionWallet });
            setStep('WRONG_WALLET'); return;
          }
          const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
          if (profile?.username) {
            setReturningName(profile.username);
            setStep('SUCCESS_RETURNING');
            setTimeout(() => {
              if (completedRef.current) return;
              completedRef.current = true;
              onAuth(session.user, profile, false); onClose();
            }, 2400);
            return;
          }
        }
        const pseudoEmail = `${address.toLowerCase()}@wallet.velo`;
        const { data, error: signInErr } = await supabase.auth.signInWithPassword({ email: pseudoEmail, password: wPass(address) });
        if (data?.user && !signInErr) {
          const { data: profile } = await supabase.from('profiles').select('*').eq('id', data.user.id).single();
          if (profile?.username) {
            setReturningName(profile.username);
            setStep('SUCCESS_RETURNING');
            setTimeout(() => {
              if (completedRef.current) return;
              completedRef.current = true;
              onAuth(data.user, profile, false); onClose();
            }, 2400);
            return;
          }
        }
        // Brand new — show the welcome splash first, then username
        if (!email && socialEmail) setEmail(socialEmail);
        // Fast-forward splash animation since wallet is already connected
        setTimeout(() => setSplashPhase(2), 300);
        setStep('WELCOME');
      } catch {
        setGlobalError('Connection failed. Please try again.');
        setStep('CONNECT');
        checkedRef.current = null;
        disconnect();
      }
    };
    check();
  }, [isConnected, address, step, isOpen, chainId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Network switch recovery
  useEffect(() => {
    if (!isOpen || step !== 'WRONG_NETWORK') return;
    if (chainId === EXPECTED_CHAIN_ID) { checkedRef.current = null; setStep('CONNECT'); }
  }, [chainId, step, isOpen]);

  // ── Navigation ────────────────────────────────────────────────────────────
  const advance = async () => {
    if (step === 'WELCOME') {
      // If wallet is already connected (we came here from CHECKING), go straight
      // to USERNAME. Otherwise open the wallet picker.
      if (isConnected && address) { setStep('USERNAME'); }
      else { setStep('CONNECT'); }
      return;
    }
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
    if (step === 'USERNAME') { disconnect(); checkedRef.current = null; setStep('CONNECT'); return; }
  };

  const validateHandle = (v: string) => {
    if (!v.trim()) return 'Username is required';
    if (v.trim().length < 3) return 'Minimum 3 characters';
    if (v.trim().length > 20) return 'Maximum 20 characters';
    if (!/^[a-zA-Z0-9_]+$/.test(v.trim())) return 'Letters, numbers and underscores only';
    return '';
  };

  // ── Account + burner creation ─────────────────────────────────────────────
  const handleCreate = useCallback(async () => {
    if (!address || !walletClient || !publicClient) return;
    const uname = username.trim();
    const contactEmail = email.trim() || null;
    setGlobalError('');
    flowAbortedRef.current = false;

    // Phase 1: Supabase account
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

      // Phase 2: Trading wallet (burner) + faucet
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

      // Phase 3: On-chain username claim — uses the burner wallet so MetaMask
      // is never asked for ETH. The burner was already funded by the sponsor.
      if (uname) {
        try {
          const existing = await fetchUsernameForAddress(publicClient, address);
          if (!existing) {
            // Confirm burner still has gas (top-up if needed)
            await ensureBurnerGas(publicClient, result.burner.veloAddress as `0x${string}`);
            // Build a burner-signed wallet client — no MetaMask popup, no dynamic import
            const burnerWc = createBurnerWalletClient(result.burner.privateKey);
            const unameTx = await claimUsername(burnerWc as any, uname);
            await publicClient.waitForTransactionReceipt({ hash: unameTx });
            onUsernameClaimed?.(uname, unameTx);
          }
        } catch (e) { console.warn('[velo] on-chain username claim skipped:', e); }
      }

      // Phase 4: Final balance
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
  }, [address, username, email, walletClient, publicClient, supabaseReady, onAuth, onBurnerReady, onUsernameClaimed, onClose]);

  // ── Close / misc ──────────────────────────────────────────────────────────
  const isTerminal = step === 'SUCCESS_NEW' || step === 'SUCCESS_RETURNING';
  const isInProgress = ['CREATING', 'BURNER_SIGN', 'BURNER_SPONSOR', 'BURNER_CONFIRM'].includes(step);
  const showClose = (!required || isTerminal) && !isInProgress;

  const handleClose = () => {
    if (!showClose) return;
    onClose();
  };

  const openWallet = () => { setVisible(false); setTimeout(() => openAppKit(), 50); };

  if (!isOpen) return null;
  const progIdx = PROGRESS_IDX[step] ?? null;

  // ── Render ────────────────────────────────────────────────────────────────
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
          // Hard-coded dark background so the modal looks correct in both
          // light and dark app themes without needing the mode-dark class.
          background: 'rgba(14,14,20,0.97)',
          borderRadius: 26,
          border: '1px solid rgba(255,255,255,0.07)',
          boxShadow: '0 32px 96px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.04) inset',
          backdropFilter: 'blur(40px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(40px) saturate(1.4)',
          overflow: 'hidden',
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(18px) scale(0.97)',
          transition: 'transform 0.4s cubic-bezier(0.22,1,0.36,1)',
          // Inject dark-mode CSS vars so all child inline styles that reference
          // them resolve to the correct dark values regardless of theme.
          '--fg': '#F4F4F7',
          '--fg-muted': 'rgba(244,244,247,0.55)',
          '--fg-subtle': 'rgba(244,244,247,0.3)',
          '--bg-base': '#0B0B0E',
          '--hairline': 'rgba(255,255,255,0.07)',
          '--pnl-up': '#34d399',
          '--iris-violet': 'oklch(0.55 0.24 295)',
          '--iris-magenta': 'oklch(0.72 0.16 320)',
          '--glass-bg-strong': 'rgba(14,14,20,0.92)',
          '--holo-linear': 'linear-gradient(135deg, oklch(0.45 0.26 295) 0%, oklch(0.55 0.24 285) 40%, oklch(0.65 0.22 268) 80%, oklch(0.72 0.18 250) 100%)',
        } as React.CSSProperties}
      >
        {/* Holo top bar */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, zIndex: 2, background: 'linear-gradient(90deg, oklch(0.68 0.22 295), oklch(0.70 0.22 340), oklch(0.74 0.22 30), oklch(0.72 0.20 160))', opacity: 0.9 }} />

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

          {/* ══ WELCOME ══ */}
          {step === 'WELCOME' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0 4px', minHeight: 280, textAlign: 'center', animation: 'vOnbSlideUp 0.4s ease' }}>
              <div style={{ animation: 'vOnbLogoPop 0.7s cubic-bezier(0.22,1,0.36,1) forwards', marginBottom: 28 }}
                onAnimationEnd={() => { if (splashPhase < 1) setTimeout(() => setSplashPhase(1), 0); }}>
                <VLogo size={72} glow={splashPhase >= 1} />
              </div>
              <div style={{ minHeight: 42, marginBottom: 10 }}>
                {splashPhase >= 1 && <TypeReveal text="Welcome to Velo." size={28} italic onDone={() => { if (splashPhase < 2) setTimeout(() => setSplashPhase(2), 250); }} />}
              </div>
              <div style={{ minHeight: 20, marginBottom: 24, opacity: splashPhase >= 2 ? 1 : 0, transition: 'opacity 0.5s ease' }}>
                <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'rgba(255,255,255,0.45)', margin: 0, lineHeight: 1.6 }}>
                  Real on-chain perps. 1,000 mUSDC to start. Set up in 60 seconds.
                </p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, width: '100%', marginBottom: 28, opacity: splashPhase >= 2 ? 1 : 0, transition: 'opacity 0.5s ease 0.15s' }}>
                {[['25×','Leverage'],['Pyth','Oracle'],['0.1%','Fee/side']].map(([val, lbl]) => (
                  <div key={val} style={{ padding: '13px 8px', borderRadius: 12, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-display,Georgia,serif)', fontStyle: 'italic', fontSize: 20, fontWeight: 700, color: 'var(--fg)', lineHeight: 1 }}>{val}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginTop: 5 }}>{lbl}</div>
                  </div>
                ))}
              </div>
              <div style={{ width: '100%', opacity: splashPhase >= 2 ? 1 : 0, animation: splashPhase >= 2 ? 'vOnbSlideUp 0.5s ease 0.4s both' : 'none' }}>
                <HoloButton onClick={advance}>Get started →</HoloButton>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 16, opacity: splashPhase >= 2 ? 0.6 : 0, transition: 'opacity 0.5s ease 0.5s' }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="oklch(0.78 0.18 150)" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Non-custodial · Base Sepolia</span>
              </div>
            </div>
          )}

          {/* ══ CONNECT ══ */}
          {step === 'CONNECT' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'vOnbSlideUp 0.32s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 4 }}>
                <VLogo size={40} />
                <div>
                  <p style={{ fontFamily: 'var(--font-display,Georgia,serif)', fontSize: 18, fontStyle: 'italic', fontWeight: 700, color: 'var(--fg)', margin: 0, lineHeight: 1.2 }}>Connect your wallet</p>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'rgba(255,255,255,0.3)', margin: '3px 0 0', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Step 1 of 3</p>
                </div>
              </div>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'rgba(255,255,255,0.45)', margin: 0, lineHeight: 1.65 }}>
                Connect your wallet to create your Velo account. No email or password needed.
              </p>
              {globalError && <div style={{ padding: '10px 13px', borderRadius: 10, background: 'oklch(0.62 0.22 25 / 0.1)', border: '1px solid oklch(0.62 0.22 25 / 0.3)', color: 'oklch(0.62 0.22 25)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{globalError}</div>}
              <HoloButton onClick={openWallet}>Connect Wallet</HoloButton>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
                {['MetaMask','WalletConnect','Coinbase'].map(w => <span key={w} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{w}</span>)}
              </div>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 14 }}>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'rgba(255,255,255,0.2)', textAlign: 'center', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 10px' }}>or demo</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="text" placeholder="Demo username" value={fallbackInput} onChange={e => setFallbackInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && fallbackInput.trim() && (onFallbackLogin?.(fallbackInput.trim()), onClose())} style={{ flex: 1, padding: '10px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)', outline: 'none' }} />
                  <button onClick={() => { if (fallbackInput.trim()) { onFallbackLogin?.(fallbackInput.trim()); onClose(); }}} disabled={!fallbackInput.trim()} style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', cursor: fallbackInput.trim() ? 'pointer' : 'not-allowed', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: fallbackInput.trim() ? 1 : 0.4 }}>Demo</button>
                </div>
              </div>
            </div>
          )}

          {/* ══ CHECKING ══ */}
          {step === 'CHECKING' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, padding: '20px 0', animation: 'vOnbSlideUp 0.3s ease' }}>
              <SpinRing />
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)', letterSpacing: '0.06em', margin: '0 0 5px', fontWeight: 600 }}>Verifying wallet</p>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(255,255,255,0.35)', margin: 0 }}>Checking your account…</p>
              </div>
              {address && <WalletPill address={address} />}
            </div>
          )}

          {/* ══ WRONG NETWORK ══ */}
          {step === 'WRONG_NETWORK' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'vOnbSlideUp 0.3s ease' }}>
              <div style={{ textAlign: 'center', padding: '8px 0' }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'oklch(0.74 0.18 30 / 0.1)', border: '1.5px solid oklch(0.74 0.18 30 / 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="oklch(0.74 0.18 30)" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                </div>
                <p style={{ fontFamily: 'var(--font-display,Georgia,serif)', fontSize: 18, fontStyle: 'italic', fontWeight: 700, color: 'var(--fg)', margin: '0 0 6px' }}>Wrong network</p>
                <p style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'rgba(255,255,255,0.45)', margin: 0, lineHeight: 1.6 }}>
                  Velo runs on <strong style={{ color: 'var(--fg)' }}>Base Sepolia</strong>. Please switch your wallet.
                </p>
              </div>
              {address && <WalletPill address={address} />}
              <button onClick={() => switchChain({ chainId: EXPECTED_CHAIN_ID })} style={{ width: '100%', padding: '12px 0', borderRadius: 12, border: 'none', background: 'var(--fg)', color: 'var(--bg-base, #0B0B0E)', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                Switch to Base Sepolia
              </button>
              <HoloButton variant="ghost" onClick={() => { disconnect(); checkedRef.current = null; setStep('CONNECT'); }}>← Disconnect</HoloButton>
            </div>
          )}

          {/* ══ WRONG WALLET ══ */}
          {step === 'WRONG_WALLET' && wrongWalletInfo && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'vOnbSlideUp 0.3s ease' }}>
              <div style={{ padding: '12px 14px', borderRadius: 12, background: 'oklch(0.74 0.18 30 / 0.07)', border: '1px solid oklch(0.74 0.18 30 / 0.25)' }}>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'oklch(0.74 0.18 30)', letterSpacing: '0.06em', textTransform: 'uppercase', margin: '0 0 4px' }}>Different wallet detected</p>
                <p style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: 0, lineHeight: 1.6 }}>Connected wallet doesn't match your active Velo session.</p>
              </div>
              {[{ lbl: 'Previous session', val: wrongWalletInfo.expected }, { lbl: 'Connected now', val: wrongWalletInfo.connected }].map(({ lbl, val }) => (
                <div key={lbl} style={{ padding: '10px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 3px' }}>{lbl}</p>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)', margin: 0 }}>{val.slice(0,10)}…{val.slice(-8)}</p>
                </div>
              ))}
              <HoloButton onClick={async () => { if (supabaseReady) await supabase.auth.signOut(); checkedRef.current = null; setWrongWalletInfo(null); setStep('CHECKING'); setTimeout(() => { checkedRef.current = null; }, 100); }}>Continue with connected wallet</HoloButton>
              <HoloButton variant="ghost" onClick={() => { disconnect(); checkedRef.current = null; setWrongWalletInfo(null); setStep('CONNECT'); }}>← Switch wallet</HoloButton>
            </div>
          )}

          {/* ══ USERNAME ══ */}
          {step === 'USERNAME' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, animation: 'vOnbSlideUp 0.32s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                <VLogo size={36} />
                <div>
                  <p style={{ fontFamily: 'var(--font-display,Georgia,serif)', fontSize: 17, fontStyle: 'italic', fontWeight: 700, color: 'var(--fg)', margin: 0, lineHeight: 1.2 }}>Pick a handle</p>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'rgba(255,255,255,0.3)', margin: '3px 0 0', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Step 1 of 3</p>
                </div>
              </div>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'rgba(255,255,255,0.45)', margin: 0, lineHeight: 1.65 }}>
                This is how you'll appear on the leaderboard, social feed, and copy trading rankings.
              </p>
              {address && <WalletPill address={address} />}
              <InputField label="Username" value={username} onChange={v => { setUsername(v); setFieldError(''); }} placeholder="e.g. alpha_trader" autoFocus error={fieldError} hint="3–20 chars · letters, numbers, underscores" onKeyDown={e => e.key === 'Enter' && advance()} />
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 13px', borderRadius: 12, background: 'oklch(0.68 0.22 295 / 0.07)', border: '1px solid oklch(0.68 0.22 295 / 0.18)' }}>
                <span style={{ color: 'oklch(0.68 0.22 295)', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, lineHeight: 1.4, flexShrink: 0, marginTop: 1 }}>@</span>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'rgba(255,255,255,0.5)', margin: 0, lineHeight: 1.6 }}>Your handle is registered <span style={{ color: 'oklch(0.68 0.22 295)', fontWeight: 700 }}>on-chain</span> in the Velo Registry and tied permanently to your wallet.</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <HoloButton onClick={advance} disabled={!username.trim()}>Continue →</HoloButton>
                <HoloButton variant="ghost" onClick={back}>← Back</HoloButton>
              </div>
            </div>
          )}

          {/* ══ EMAIL ══ */}
          {step === 'EMAIL' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, animation: 'vOnbSlideUp 0.32s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                <VLogo size={36} />
                <div>
                  <p style={{ fontFamily: 'var(--font-display,Georgia,serif)', fontSize: 17, fontStyle: 'italic', fontWeight: 700, color: 'var(--fg)', margin: 0, lineHeight: 1.2 }}>Stay in the loop</p>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'rgba(255,255,255,0.3)', margin: '3px 0 0', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Step 2 of 3</p>
                </div>
              </div>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'rgba(255,255,255,0.45)', margin: 0, lineHeight: 1.65 }}>
                Get notified when positions are filled, liquidated, or copied. You can also add this later in Settings.
              </p>
              <InputField label="Email" value={email} onChange={v => { setEmail(v); setFieldError(''); }} placeholder="your@email.com" type="email" autoFocus optional error={fieldError} onKeyDown={e => e.key === 'Enter' && advance()} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <HoloButton onClick={advance}>{email.trim() ? 'Continue →' : 'Skip for now →'}</HoloButton>
                <HoloButton variant="ghost" onClick={back}>← Back</HoloButton>
              </div>
            </div>
          )}

          {/* ══ REVIEW ══ */}
          {step === 'REVIEW' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, animation: 'vOnbSlideUp 0.32s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                <VLogo size={36} />
                <div>
                  <p style={{ fontFamily: 'var(--font-display,Georgia,serif)', fontSize: 17, fontStyle: 'italic', fontWeight: 700, color: 'var(--fg)', margin: 0, lineHeight: 1.2 }}>Ready to launch</p>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'rgba(255,255,255,0.3)', margin: '3px 0 0', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Step 3 of 3</p>
                </div>
              </div>
              {globalError && <div style={{ padding: '10px 13px', borderRadius: 10, background: 'oklch(0.62 0.22 25 / 0.1)', border: '1px solid oklch(0.62 0.22 25 / 0.3)', color: 'oklch(0.62 0.22 25)', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.5 }}>{globalError}</div>}
              <div style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                {[
                  { lbl: 'Wallet', val: address ? `${address.slice(0,10)}…${address.slice(-8)}` : '—' },
                  { lbl: 'Handle', val: `@${username}` },
                  { lbl: 'Email', val: email.trim() || '—' },
                  { lbl: 'Network', val: 'Base Sepolia' },
                  { lbl: 'Starting balance', val: '1,000 mUSDC' },
                ].map(({ lbl, val }, i, arr) => (
                  <div key={lbl} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 15px', borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', background: i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>{lbl}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: lbl === 'Starting balance' ? 'oklch(0.78 0.18 150)' : 'var(--fg)', fontWeight: 600, textAlign: 'right', maxWidth: '58%', wordBreak: 'break-all' }}>{val}</span>
                  </div>
                ))}
              </div>
              <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'rgba(255,255,255,0.35)', margin: 0, lineHeight: 1.65 }}>
                  Tapping "Create account" asks MetaMask for <strong style={{ color: 'rgba(255,255,255,0.65)' }}>one gas-free signature</strong> to derive your trading wallet. No ETH is spent at this step.
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <HoloButton onClick={handleCreate}>Create account →</HoloButton>
                <HoloButton variant="ghost" onClick={back}>← Edit</HoloButton>
              </div>
            </div>
          )}

          {/* ══ IN-PROGRESS STEPS ══ */}
          {step === 'CREATING' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, padding: '24px 0', animation: 'vOnbSlideUp 0.3s ease' }}>
              <SpinRing />
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontFamily: 'var(--font-display,Georgia,serif)', fontStyle: 'italic', fontSize: 20, color: 'var(--fg)', margin: '0 0 6px', fontWeight: 700 }}>Creating @{username}</p>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(255,255,255,0.35)', margin: 0 }}>Setting up your account…</p>
              </div>
            </div>
          )}
          {step === 'BURNER_SIGN' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, padding: '24px 0', animation: 'vOnbSlideUp 0.3s ease' }}>
              <SpinRing />
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontFamily: 'var(--font-display,Georgia,serif)', fontStyle: 'italic', fontSize: 20, color: 'var(--fg)', margin: '0 0 6px', fontWeight: 700 }}>One signature needed</p>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(255,255,255,0.35)', margin: 0 }}>Derives your trading wallet. No gas, no ETH spent.</p>
              </div>
              <div style={{ display: 'flex', gap: 8, padding: '10px 16px', borderRadius: 10, background: 'oklch(0.68 0.22 295 / 0.08)', border: '1px solid oklch(0.68 0.22 295 / 0.2)' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="oklch(0.68 0.22 295)" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'oklch(0.78 0.18 295)', letterSpacing: '0.04em' }}>Check MetaMask for the signature request</span>
              </div>
            </div>
          )}
          {step === 'BURNER_SPONSOR' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, padding: '24px 0', animation: 'vOnbSlideUp 0.3s ease' }}>
              <SpinRing />
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontFamily: 'var(--font-display,Georgia,serif)', fontStyle: 'italic', fontSize: 20, color: 'var(--fg)', margin: '0 0 6px', fontWeight: 700 }}>Topping up gas</p>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(255,255,255,0.35)', margin: 0 }}>Sending your trading wallet a little ETH…</p>
              </div>
            </div>
          )}
          {step === 'BURNER_CONFIRM' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, padding: '24px 0', animation: 'vOnbSlideUp 0.3s ease' }}>
              <SpinRing />
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontFamily: 'var(--font-display,Georgia,serif)', fontStyle: 'italic', fontSize: 20, color: 'var(--fg)', margin: '0 0 6px', fontWeight: 700 }}>Claiming 1,000 mUSDC</p>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(255,255,255,0.35)', margin: 0 }}>Minting your testnet USDC on Base Sepolia…</p>
              </div>
              {claimTxHash && (
                <a href={baseScanTxUrl(claimTxHash)} target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'oklch(0.68 0.22 295)', display: 'flex', alignItems: 'center', gap: 5, textDecoration: 'none' }}>
                  View on BaseScan <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </a>
              )}
            </div>
          )}

          {/* ══ SUCCESS NEW ══ */}
          {step === 'SUCCESS_NEW' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '12px 0 4px', animation: 'vOnbSlideUp 0.4s ease' }}>
              {/* Animated check circle */}
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
              <p style={{ fontFamily: 'var(--font-display,Georgia,serif)', fontSize: 26, fontStyle: 'italic', fontWeight: 700, color: 'var(--fg)', margin: '0 0 6px', letterSpacing: '-0.02em', animation: 'vOnbSlideUp 0.4s ease 0.85s both' }}>
                You're live.
              </p>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(255,255,255,0.35)', margin: '0 0 22px', letterSpacing: '0.04em', animation: 'vOnbSlideUp 0.35s ease 1.0s both' }}>
                @{username} · trading wallet funded
              </p>
              {/* Balance card */}
              <div style={{ width: '100%', borderRadius: 16, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.025)', overflow: 'hidden', marginBottom: 16, animation: 'vOnbSlideUp 0.35s ease 1.15s both' }}>
                <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Balance credited</span>
                  <span style={{ fontFamily: 'var(--font-display,Georgia,serif)', fontStyle: 'italic', fontSize: 26, fontWeight: 700, color: '#34d399' }}>${(claimBalance || 1000).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                </div>
                {burnerAddr && (
                  <div style={{ padding: '11px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Trading wallet</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>{burnerAddr.slice(0,6)}…{burnerAddr.slice(-4)}</span>
                  </div>
                )}
              </div>
              {claimTxHash && (
                <a href={baseScanTxUrl(claimTxHash)} target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'oklch(0.68 0.22 295)', display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 20, textDecoration: 'none', animation: 'vOnbSlideUp 0.35s ease 1.3s both' }}>
                  Claim tx on BaseScan <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </a>
              )}
              <div style={{ width: '100%', animation: 'vOnbSlideUp 0.35s ease 1.45s both' }}>
                <button onClick={() => { if (!completedRef.current) { completedRef.current = true; } onClose(); }} style={{ width: '100%', padding: '14px', borderRadius: 13, border: 'none', background: 'var(--fg, #F4F4F7)', color: 'var(--bg-base, #0B0B0E)', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
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
              <p style={{ fontFamily: 'var(--font-display,Georgia,serif)', fontSize: 22, fontStyle: 'italic', fontWeight: 700, color: 'var(--fg)', margin: '0 0 6px', letterSpacing: '-0.02em', animation: 'vOnbSlideUp 0.4s ease 0.82s both' }}>
                Welcome back, {returningName}.
              </p>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(255,255,255,0.35)', margin: '0 0 20px', letterSpacing: '0.04em', animation: 'vOnbSlideUp 0.38s ease 1.0s both' }}>
                Restoring your session
              </p>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 12px 6px 9px', borderRadius: 6, background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.2)', animation: 'vOnbSlideUp 0.36s ease 1.2s both' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#a78bfa', animation: 'vOnbLiveDot 1.8s ease-in-out infinite' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#a78bfa', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>Velo · Authenticated</span>
              </div>
            </div>
          )}

        </div>

        <style>{`
          @keyframes vOnbSpin { to { transform: rotate(360deg); } }
          @keyframes vOnbPulseRing { 0%,100% { transform:scale(0.86);opacity:0.5; } 50% { transform:scale(1.12);opacity:0.15; } }
          @keyframes vOnbLogoPop { 0% { transform:scale(0.65);opacity:0; } 60% { transform:scale(1.07);opacity:1; } 100% { transform:scale(1);opacity:1; } }
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

// ── Legacy re-exports so App.tsx doesn't need to change its guards ────────────
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
