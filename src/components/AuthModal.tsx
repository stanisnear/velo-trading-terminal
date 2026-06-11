// src/components/AuthModal.tsx
// Apple-quality onboarding + MetaMask-style wallet UX
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { VeloWordmark } from '@/components/ui/shared';
import { createPortal } from 'react-dom';
import { useAppKit, useAppKitState, useAppKitAccount } from '@reown/appkit/react';
import { useAccount, useDisconnect, useChainId } from 'wagmi';
import { isConfigured as isSupabaseConfigured, supabase } from '../services/supabaseStore';

// Base Sepolia chainId — must match web3Config.ts
const EXPECTED_CHAIN_ID = 84532;

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuth: (user: any, profile: any, isNewAccount?: boolean) => void;
  required?: boolean;
  disconnectRef?: React.MutableRefObject<(() => void) | null>;
}

type Step =
  | 'connect'
  | 'checking'
  | 'wrong_wallet'
  | 'wrong_network'
  | 'splash'          // Apple-style animated intro
  | 'name'
  | 'email'
  | 'confirm'
  | 'creating'
  | 'success_new'
  | 'success_returning';

function wPass(addr: string) {
  return `velo_w3_${addr.toLowerCase().slice(2, 20)}_xK9`;
}

// ─── Animated word-by-word text reveal (Apple style) ──────────────────────────
const TypeReveal = ({ text, delay = 0, size = 28, color = 'var(--fg)', italic = false, onDone }: {
  text: string; delay?: number; size?: number;
  color?: string; italic?: boolean; onDone?: () => void;
}) => {
  const words = text.split(' ');
  const [shown, setShown] = useState(0);
  const doneRef = useRef(false);

  useEffect(() => {
    setShown(0);
    doneRef.current = false;
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setShown(i);
      if (i >= words.length) {
        clearInterval(interval);
        if (!doneRef.current) { doneRef.current = true; onDone?.(); }
      }
    }, 110);
    const startDelay = setTimeout(() => {}, delay);
    return () => { clearInterval(interval); clearTimeout(startDelay); };
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <p style={{
      fontFamily: 'var(--font-display, Georgia, serif)',
      fontSize: size, fontStyle: italic ? 'italic' : 'normal',
      fontWeight: 700, color, margin: 0, lineHeight: 1.25,
      letterSpacing: '-0.01em',
    }}>
      {words.map((w, i) => (
        <span key={i} style={{
          display: 'inline-block',
          opacity: i < shown ? 1 : 0,
          transform: i < shown ? 'translateY(0)' : 'translateY(6px)',
          transition: 'opacity 0.3s ease, transform 0.3s ease',
          marginRight: '0.28em',
        }}>{w}</span>
      ))}
    </p>
  );
};

// ─── Logo ─────────────────────────────────────────────────────────────────────
// Brand mark: the Fraunces-italic wordmark (matches navbar + landing). The
// old glow ring is replaced by the landing's shimmer sweep on large sizes.
const VLogo = ({ size = 40, glow = false }: { size?: number; glow?: boolean }) => (
  <VeloWordmark size={Math.round(size * 0.58)} shimmer={glow || size >= 64} />
);

// ─── Progress segments ────────────────────────────────────────────────────────
const ProgressBar = ({ step, total = 3 }: { step: number; total?: number }) => (
  <div style={{ display: 'flex', gap: 4, marginBottom: 22 }}>
    {Array.from({ length: total }).map((_, i) => (
      <div key={i} style={{
        height: 2.5, borderRadius: 2, flex: 1,
        background: i <= step
          ? 'var(--iris-violet, oklch(0.68 0.22 295))'
          : 'var(--hairline-strong, rgba(255,255,255,0.1))',
        transition: 'background 0.4s ease',
        opacity: i < step ? 0.45 : 1,
      }} />
    ))}
  </div>
);

// ─── Field ────────────────────────────────────────────────────────────────────
const Field = ({
  label, sublabel, value, onChange, placeholder, type = 'text',
  autoFocus, error, onKeyDown, hint,
}: {
  label: string; sublabel?: string; value: string;
  onChange: (v: string) => void; placeholder: string;
  type?: string; autoFocus?: boolean; error?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void; hint?: string;
}) => {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <div style={{ marginBottom: 7, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--fg-subtle)' }}>{label}</span>
        {sublabel && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-subtle)', opacity: 0.55 }}>{sublabel}</span>}
      </div>
      <input
        type={type} value={value} placeholder={placeholder} autoFocus={autoFocus}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: '100%', padding: '12px 14px',
          background: 'var(--bg-base-2, rgba(255,255,255,0.04))',
          border: `1.5px solid ${error ? 'var(--pnl-down)' : focused ? 'var(--iris-violet, oklch(0.68 0.22 295))' : 'var(--hairline-strong)'}`,
          borderRadius: 12,
          fontFamily: 'var(--font-mono)', fontSize: 14,
          color: 'var(--fg)', outline: 'none',
          boxSizing: 'border-box' as const,
          transition: 'border-color 0.18s',
        }}
      />
      {hint && !error && <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-subtle)', margin: '5px 0 0', letterSpacing: '0.02em' }}>{hint}</p>}
      {error && <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--pnl-down)', margin: '5px 0 0' }}>{error}</p>}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen, onClose, onAuth, required = false, disconnectRef,
}) => {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { open: openAppKit } = useAppKit();
  const { open: appKitModalOpen } = useAppKitState();
  // embeddedWalletInfo is populated after social/email login — gives us the
  // user's real email so we can pre-fill the optional email step.
  const { embeddedWalletInfo } = useAppKitAccount();
  const socialEmail: string = (embeddedWalletInfo as any)?.user?.email ?? '';

  // When AppKit modal closes without a wallet connecting (user cancelled),
  // restore AuthModal visibility so they can try again.
  useEffect(() => {
    if (!isOpen) return;
    if (!appKitModalOpen && step === 'connect' && !isConnected) {
      setVisible(true);
    }
  }, [appKitModalOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpenWallet = () => {
    // Hide AuthModal backdrop so AppKit renders on a clear screen, not behind it.
    setVisible(false);
    setTimeout(() => openAppKit(), 50);
  };

  useEffect(() => {
    if (disconnectRef) disconnectRef.current = disconnect;
  }, [disconnect, disconnectRef]);

  const [step, setStep] = useState<Step>('connect');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [visible, setVisible] = useState(false);
  const [returningName, setReturningName] = useState('');
  const [wrongWalletInfo, setWrongWalletInfo] = useState<{ connected: string; expected: string } | null>(null);
  // Splash sub-phase: 0=logo, 1=greeting, 2=tagline, 3=button appears
  const [splashPhase, setSplashPhase] = useState(0);

  const checkedRef = useRef<string | null>(null);
  // Prevents double-fire: once we've called onAuth+onClose, never do it again
  const completedRef = useRef(false);
  // Tracks in-progress username uniqueness check to debounce
  const usernameCheckRef = useRef<string | null>(null);
  const supabaseReady = isSupabaseConfigured();

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setStep('connect');
      setUsername(''); setEmail(''); setError(''); setFieldError('');
      setReturningName(''); setWrongWalletInfo(null); setSplashPhase(0);
      checkedRef.current = null;
      completedRef.current = false;
      usernameCheckRef.current = null;
      setTimeout(() => setVisible(true), 10);
    } else {
      setVisible(false);
    }
  }, [isOpen]);

  // Wallet connect → check returning vs new
  useEffect(() => {
    if (!isOpen) return;
    if (!isConnected || !address) return;
    if (step !== 'connect') return;
    if (checkedRef.current === address) return;
    checkedRef.current = address;

    const check = async () => {
      // Check network first
      if (chainId !== EXPECTED_CHAIN_ID) {
        setStep('wrong_network');
        return;
      }

      setStep('checking');
      setError('');

      if (!supabaseReady) {
        const shortAddr = `${address.slice(0, 6)}...${address.slice(-4)}`;
        onAuth({ id: address, user_metadata: { username: shortAddr, wallet_address: address } }, null, false);
        onClose();
        return;
      }

      try {
        const { data: { session: existingSession } } = await supabase.auth.getSession();
        if (existingSession?.user) {
          const sessionEmail = existingSession.user.email ?? '';
          const sessionWallet = sessionEmail.replace('@wallet.velo', '');
          if (sessionWallet && sessionWallet !== address.toLowerCase()) {
            setWrongWalletInfo({ connected: address, expected: sessionWallet });
            setStep('wrong_wallet');
            return;
          }
          const { data: profile } = await supabase.from('profiles').select('*').eq('id', existingSession.user.id).single();
          if (profile?.username) {
            setReturningName(profile.username);
            setStep('success_returning');
            setTimeout(() => {
              if (completedRef.current) return;
              completedRef.current = true;
              onAuth(existingSession.user, profile, false); onClose();
            }, 2200);
            return;
          }
        }

        const pseudoEmail = `${address.toLowerCase()}@wallet.velo`;
        const password = wPass(address);
        const { data, error: signInErr } = await supabase.auth.signInWithPassword({ email: pseudoEmail, password });

        if (data?.user && !signInErr) {
          const { data: profile } = await supabase.from('profiles').select('*').eq('id', data.user.id).single();
          if (profile?.username) {
            setReturningName(profile.username);
            setStep('success_returning');
            setTimeout(() => {
              if (completedRef.current) return;
              completedRef.current = true;
              onAuth(data.user, profile, false); onClose();
            }, 2200);
            return;
          }
        }

        // New wallet — go to Apple splash intro
        setSplashPhase(0);
        setStep('splash');
      } catch {
        setError('Connection failed. Please try again.');
        setStep('connect');
        checkedRef.current = null;
        disconnect();
      }
    };
    check();
  }, [isConnected, address, step, isOpen, chainId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Watch for chain change AFTER login (user is inside the dapp, changes network)
  useEffect(() => {
    if (!isOpen) return;
    if (step === 'wrong_network' && chainId === EXPECTED_CHAIN_ID) {
      // User switched back to correct network — retry
      checkedRef.current = null;
      setStep('connect');
    }
  }, [chainId, step, isOpen]);

  const validateUsername = (v: string) => {
    if (!v.trim()) return 'Username is required';
    if (v.trim().length < 3) return 'Minimum 3 characters';
    if (v.trim().length > 20) return 'Maximum 20 characters';
    if (!/^[a-zA-Z0-9_]+$/.test(v.trim())) return 'Letters, numbers and underscores only';
    return '';
  };

  const advance = async () => {
    if (step === 'splash') { setStep('name'); return; }
    if (step === 'name') {
      const err = validateUsername(username);
      if (err) { setFieldError(err); return; }
      // Check uniqueness in Supabase
      if (supabaseReady) {
        const uname = username.trim().toLowerCase();
        if (usernameCheckRef.current !== uname) {
          usernameCheckRef.current = uname;
          setFieldError('');
          const { data: existing } = await supabase
            .from('profiles')
            .select('id')
            .ilike('username', uname)
            .maybeSingle();
          if (existing) { setFieldError('Username already taken — choose another'); return; }
        }
      }
      // Pre-fill with social provider email if the field is still empty
      if (!email && socialEmail) setEmail(socialEmail);
      setFieldError(''); setStep('email'); return;
    }
    if (step === 'email') {
      // Check email uniqueness if provided (profiles table stores contact email)
      if (email.trim() && supabaseReady) {
        const { data: existingEmail } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', email.trim().toLowerCase())
          .maybeSingle();
        if (existingEmail) { setFieldError('Email already registered with another account'); return; }
      }
      setFieldError(''); setStep('confirm'); return;
    }
    if (step === 'confirm') { handleCreate(); return; }
  };

  const back = () => {
    if (step === 'name') { setStep('splash'); return; }
    if (step === 'email') { setStep('name'); return; }
    if (step === 'confirm') { setStep('email'); return; }
    if (step === 'splash') { disconnect(); checkedRef.current = null; setStep('connect'); }
  };

  const handleCreate = useCallback(async () => {
    if (!address) return;
    const uname = username.trim();
    setStep('creating'); setError('');

    const pseudoEmail = `${address.toLowerCase()}@wallet.velo`;
    const password = wPass(address);
    const contactEmail = email.trim() || null;

    try {
      // Final uniqueness check before writing
      if (supabaseReady) {
        const { data: taken } = await supabase
          .from('profiles')
          .select('id')
          .ilike('username', uname)
          .maybeSingle();
        if (taken) {
          setError(`Username @${uname} is already taken — go back and choose another`);
          setStep('confirm');
          return;
        }
      }

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: pseudoEmail, password,
        options: { data: { username: uname, wallet_address: address.toLowerCase() } },
      });

      if (signUpError) {
        if (signUpError.message?.includes('already') || signUpError.message?.includes('registered')) {
          const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email: pseudoEmail, password });
          if (signInErr || !signInData?.user) throw signInErr || new Error('Sign in failed');
          const { data: profile } = await supabase.from('profiles').select('*').eq('id', signInData.user.id).single();
          if (profile) await supabase.from('profiles').update({ username: uname, handle: `@${uname}`, ...(contactEmail ? { email: contactEmail } : {}) }).eq('id', signInData.user.id);
          setStep('success_new');
          setTimeout(() => {
            if (completedRef.current) return;
            completedRef.current = true;
            onAuth(signInData.user, { ...profile, username: uname, handle: `@${uname}` }, true); onClose();
          }, 2400);
          return;
        }
        throw signUpError;
      }

      if (!signUpData.user) throw new Error('No user returned from signup');
      const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email: pseudoEmail, password });
      if (signInErr || !signInData?.user) throw signInErr || new Error('Sign in after signup failed');

      await supabase.from('profiles').update({ username: uname, handle: `@${uname}`, ...(contactEmail ? { email: contactEmail } : {}) }).eq('id', signInData.user.id);
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', signInData.user.id).single();

      setStep('success_new');
      setTimeout(() => {
        if (completedRef.current) return;
        completedRef.current = true;
        onAuth(signInData.user, profile || { id: signInData.user.id, username: uname, handle: `@${uname}`, balance: 0 }, true); onClose();
      }, 2400);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
      setStep('confirm');
    }
  }, [address, username, email, supabaseReady, onAuth, onClose]);

  const handleKeepPrevious = () => {
    disconnect(); checkedRef.current = null; setWrongWalletInfo(null); setStep('connect');
  };

  const handleSwitchToCurrent = async () => {
    // Wipe the session snapshot BEFORE telling Supabase to sign out so that
    // any in-flight render between signOut() and the next session restore
    // never reads a stale (now-incorrect) cached user.
    try { localStorage.removeItem('velo_session_v1'); } catch {}
    if (supabaseReady) await supabase.auth.signOut();
    checkedRef.current = null; setWrongWalletInfo(null); setStep('connect');
    setTimeout(() => { checkedRef.current = null; setStep('checking'); }, 200);
  };

  const handleClose = () => {
    if (required && step !== 'success_new' && step !== 'success_returning') return;
    onClose();
  };

  if (!isOpen) return null;

  const dotIndex = { splash: 0, name: 1, email: 2, confirm: 3 }[step as string] ?? -1;
  const isSuccessStep = step === 'success_new' || step === 'success_returning';

  const content = (
    <div
      onClick={handleClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'oklch(0 0 0 / 0.72)',
        backdropFilter: 'blur(14px) saturate(140%)',
        WebkitBackdropFilter: 'blur(14px) saturate(140%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.3s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="mode-dark"
        style={{
          position: 'relative',
          width: '100%', maxWidth: 460,
          background: 'var(--glass-bg-strong)',
          borderRadius: 24,
          border: '1px solid var(--glass-border)',
          boxShadow: '0 30px 90px oklch(0 0 0 / 0.5), 0 0 0 1px oklch(1 0 0 / 0.04) inset',
          backdropFilter: 'blur(40px) saturate(1.35)',
          WebkitBackdropFilter: 'blur(40px) saturate(1.35)',
          overflow: 'hidden',
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(16px) scale(0.97)',
          transition: 'transform 0.38s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {/* Top gradient line — matches onboarding modal */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2, zIndex: 2,
          background: 'linear-gradient(90deg, oklch(0.78 0.18 295), oklch(0.82 0.16 200), oklch(0.85 0.15 30))',
          opacity: 0.85,
        }} />

        <div style={{ padding: '26px 26px 28px' }}>

          {/* ── Header row ── */}
          {!isSuccessStep && step !== 'splash' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <VLogo size={36} />
                <div>
                  <p style={{ fontFamily: 'var(--font-display, Georgia, serif)', fontSize: 16, fontStyle: 'italic', fontWeight: 700, color: 'var(--fg)', margin: 0, lineHeight: 1.15 }}>
                    {step === 'connect' && 'Sign In'}
                    {step === 'checking' && 'Verifying…'}
                    {step === 'wrong_wallet' && 'Wallet mismatch'}
                    {step === 'wrong_network' && 'Wrong network'}
                    {step === 'name' && 'Choose a handle'}
                    {step === 'email' && 'Stay in touch'}
                    {step === 'confirm' && 'Review & confirm'}
                    {step === 'creating' && 'Creating…'}
                  </p>
                  {dotIndex >= 0 && (
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-subtle)', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '2px 0 0' }}>
                      Step {dotIndex + 1} of 4
                    </p>
                  )}
                </div>
              </div>
              {!required && step !== 'creating' && (
                <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-subtle)', padding: 6, borderRadius: 8, display: 'flex' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              )}
            </div>
          )}

          {dotIndex >= 0 && <ProgressBar step={dotIndex} total={4} />}

          {/* ══════ CONNECT ══════ */}
          {step === 'connect' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'authSlideUp 0.32s ease' }}>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.65 }}>
                Connect your wallet to sign in or create a Velo account. No email or password needed.
              </p>
              {error && <ErrorBanner message={error} />}
              <HoloButton onClick={handleOpenWallet}>Connect Wallet</HoloButton>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
                {['MetaMask', 'WalletConnect', 'Coinbase'].map(w => (
                  <span key={w} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-subtle)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{w}</span>
                ))}
              </div>

            </div>
          )}

          {/* ══════ CHECKING ══════ */}
          {step === 'checking' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, padding: '12px 0', animation: 'authSlideUp 0.3s ease' }}>
              <PulseRing />
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)', letterSpacing: '0.06em', margin: '0 0 5px', fontWeight: 600 }}>Checking wallet</p>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-subtle)', margin: 0 }}>Looking up your account…</p>
              </div>
              {address && <WalletPill address={address} />}
            </div>
          )}

          {/* ══════ WRONG NETWORK ══════ */}
          {step === 'wrong_network' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'authSlideUp 0.3s ease' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '8px 0 4px', textAlign: 'center' }}>
                {/* Network icon */}
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'oklch(0.74 0.18 30 / 0.1)', border: '2px solid oklch(0.74 0.18 30 / 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="oklch(0.74 0.18 30)" strokeWidth="1.8">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="2" y1="12" x2="22" y2="12"/>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                  </svg>
                </div>
                <div>
                  <p style={{ fontFamily: 'var(--font-display, Georgia, serif)', fontSize: 18, fontStyle: 'italic', fontWeight: 700, color: 'var(--fg)', margin: '0 0 6px' }}>Wrong network</p>
                  <p style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.6 }}>
                    Velo runs on <strong style={{ color: 'var(--fg)' }}>Base Sepolia</strong>. Please switch your wallet network to continue.
                  </p>
                </div>
              </div>

              {address && <WalletPill address={address} />}

              <div style={{ padding: '12px 14px', borderRadius: 11, background: 'oklch(0.74 0.18 30 / 0.06)', border: '1px solid oklch(0.74 0.18 30 / 0.2)' }}>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'oklch(0.74 0.18 30)', letterSpacing: '0.07em', textTransform: 'uppercase', margin: '0 0 4px', fontWeight: 700 }}>How to switch</p>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.6 }}>
                  Open MetaMask → click the network selector → choose <em>Base Sepolia</em>
                </p>
              </div>

              <GhostButton onClick={() => { disconnect(); checkedRef.current = null; setStep('connect'); }}>
                ← Disconnect wallet
              </GhostButton>
            </div>
          )}

          {/* ══════ WRONG WALLET ══════ */}
          {step === 'wrong_wallet' && wrongWalletInfo && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'authSlideUp 0.3s ease' }}>
              <div style={{ padding: '12px 14px', borderRadius: 12, background: 'oklch(0.74 0.18 30 / 0.07)', border: '1px solid oklch(0.74 0.18 30 / 0.25)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="oklch(0.74 0.18 30)" strokeWidth="2" style={{ marginTop: 1, flexShrink: 0 }}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <div>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'oklch(0.74 0.18 30)', letterSpacing: '0.06em', textTransform: 'uppercase', margin: '0 0 4px' }}>Different wallet detected</p>
                  <p style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.6 }}>Your connected wallet doesn't match your active Velo session.</p>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ padding: '10px 12px', borderRadius: 9, background: 'var(--bg-base-2)', border: '1px solid var(--hairline-strong)' }}>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 3px' }}>Previous session</p>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)', margin: 0 }}>{wrongWalletInfo.expected.slice(0, 10)}…{wrongWalletInfo.expected.slice(-8)}</p>
                </div>
                <div style={{ padding: '10px 12px', borderRadius: 9, background: 'oklch(0.78 0.18 150 / 0.06)', border: '1px solid oklch(0.78 0.18 150 / 0.2)' }}>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 3px' }}>Connected now</p>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--pnl-up)', margin: 0 }}>{wrongWalletInfo.connected.slice(0, 10)}…{wrongWalletInfo.connected.slice(-8)}</p>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <HoloButton onClick={handleSwitchToCurrent}>Continue with connected wallet</HoloButton>
                <GhostButton onClick={handleKeepPrevious}>← Switch wallet in MetaMask</GhostButton>
              </div>
            </div>
          )}

          {/* ══════ SPLASH — Apple-style animated intro ══════ */}
          {step === 'splash' && (
            <SplashScreen
              address={address}
              phase={splashPhase}
              onPhaseChange={setSplashPhase}
              onContinue={() => setStep('name')}
              onBack={() => { disconnect(); checkedRef.current = null; setStep('connect'); }}
            />
          )}

          {/* ══════ NAME ══════ */}
          {step === 'name' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, animation: 'authSlideUp 0.32s ease' }}>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.65 }}>
                This is how you'll appear on the leaderboard, social feed, and copy trading rankings.
              </p>
              <Field
                label="Username" value={username}
                onChange={v => { setUsername(v); setFieldError(''); }}
                placeholder="e.g. alpha_trader" autoFocus error={fieldError}
                hint="3–20 characters · letters, numbers, underscores"
                onKeyDown={e => e.key === 'Enter' && advance()}
              />
              {/* On-chain identity note — the handle is registered in the
                  VeloRegistry contract during setup, not as a separate step. */}
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                padding: '10px 12px', borderRadius: 12,
                background: 'oklch(0.68 0.22 295 / 0.08)',
                border: '1px solid oklch(0.68 0.22 295 / 0.18)',
              }}>
                <span style={{ color: 'var(--iris-violet)', marginTop: -1, flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, lineHeight: 1.4 }}>@</span>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.55, letterSpacing: '0.01em' }}>
                  Your handle is registered <span style={{ color: 'var(--iris-violet)', fontWeight: 700 }}>on-chain</span> in the Velo Registry and tied to your wallet — it becomes your permanent on-chain identity.
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <HoloButton onClick={advance} disabled={!username.trim()}>Continue →</HoloButton>
                <GhostButton onClick={back}>← Back</GhostButton>
              </div>
            </div>
          )}

          {/* ══════ EMAIL ══════ */}
          {step === 'email' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, animation: 'authSlideUp 0.32s ease' }}>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.65 }}>
                Get notified when your positions are filled, liquidated, or copied by others.
              </p>
              <Field label="Email" sublabel="(optional)" type="email" value={email} onChange={v => { setEmail(v); setFieldError(''); }} placeholder="your@email.com" autoFocus error={fieldError} onKeyDown={e => e.key === 'Enter' && advance()} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <HoloButton onClick={advance}>{email.trim() ? 'Continue →' : 'Skip for now →'}</HoloButton>
                <GhostButton onClick={back}>← Back</GhostButton>
              </div>
            </div>
          )}

          {/* ══════ CONFIRM ══════ */}
          {step === 'confirm' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'authSlideUp 0.32s ease' }}>
              {error && <ErrorBanner message={error} />}
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.65 }}>Review your account before creating.</p>
              <div style={{ background: 'var(--bg-base-2)', borderRadius: 12, border: '1px solid var(--hairline-strong)', overflow: 'hidden' }}>
                {[
                  { label: 'Wallet', value: address ? `${address.slice(0, 10)}…${address.slice(-8)}` : '—' },
                  { label: 'Username', value: `@${username}` },
                  { label: 'Email', value: email.trim() || '—' },
                  { label: 'Network', value: 'Base Sepolia' },
                ].map(({ label, value }, i, arr) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: i < arr.length - 1 ? '1px solid var(--hairline)' : 'none' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-subtle)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)', fontWeight: 600, textAlign: 'right', maxWidth: '55%', wordBreak: 'break-all' }}>{value}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <HoloButton onClick={handleCreate}>Create account →</HoloButton>
                <GhostButton onClick={back}>← Edit</GhostButton>
              </div>
            </div>
          )}

          {/* ══════ CREATING ══════ */}
          {step === 'creating' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, padding: '14px 0', animation: 'authSlideUp 0.3s ease' }}>
              <PulseRing />
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)', letterSpacing: '0.06em', margin: '0 0 5px', fontWeight: 600 }}>Creating @{username}</p>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-subtle)', margin: 0 }}>Writing to chain…</p>
              </div>
            </div>
          )}

          {/* ══════ SUCCESS — NEW ══════ */}
          {step === 'success_new' && (
            <SuccessScreen variant="new" username={username} color="" />
          )}

          {/* ══════ SUCCESS — RETURNING ══════ */}
          {step === 'success_returning' && (
            <SuccessScreen variant="returning" username={returningName} color="" />
          )}

        </div>

        <style>{`
          @keyframes authSpin   { to { transform: rotate(360deg); } }
          @keyframes authSlideUp {
            from { opacity: 0; transform: translateY(12px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          @keyframes pulseRingAnim {
            0%   { transform: scale(0.86); opacity: 0.55; }
            50%  { transform: scale(1.12); opacity: 0.15; }
            100% { transform: scale(0.86); opacity: 0.55; }
          }
          @keyframes logoGlowPop {
            0%   { transform: scale(0.7); opacity: 0; }
            60%  { transform: scale(1.08); opacity: 1; }
            100% { transform: scale(1); opacity: 1; }
          }
          @keyframes subtleFadeIn {
            from { opacity: 0; }
            to   { opacity: 1; }
          }
          @keyframes btnAppear {
            from { opacity: 0; transform: translateY(8px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          @keyframes authDrawArc {
            from { stroke-dashoffset: 176; }
            to   { stroke-dashoffset: 0; }
          }
          @keyframes authCheckIn {
            from { opacity: 0; transform: scale(0.5) translateY(2px); }
            to   { opacity: 1; transform: scale(1) translateY(0); }
          }
          @keyframes authLiveDot {
            0%, 100% { opacity: 1; transform: scale(1); }
            50%       { opacity: 0.35; transform: scale(0.65); }
          }
        `}</style>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

// ══════════════════════════════════════════════════════════════════════════════
// Apple-style splash intro — cinematic, sequential, no rushing
// ══════════════════════════════════════════════════════════════════════════════
const SplashScreen = ({ address, phase, onPhaseChange, onContinue, onBack }: {
  address?: string; phase: number;
  onPhaseChange: (p: number) => void;
  onContinue: () => void; onBack: () => void;
}) => {
  // phase 0: logo entrance
  // phase 1: "Hello." appears
  // phase 2: "Welcome to Velo." appears
  // phase 3: sub-copy appears
  // phase 4: button appears
  useEffect(() => {
    if (phase === 0) setTimeout(() => onPhaseChange(1), 700);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, padding: '10px 0 4px', minHeight: 260 }}>
      {/* Big centered logo with glow pop */}
      <div style={{
        animation: 'logoGlowPop 0.7s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        marginBottom: 28,
      }}>
        <VLogo size={64} glow={phase >= 1} />
      </div>

      {/* "Hello." — word by word */}
      <div style={{ textAlign: 'center', marginBottom: 10, minHeight: 38 }}>
        {phase >= 1 && (
          <TypeReveal
            text="Hello."
            size={32}
            italic
            color="var(--fg)"
            onDone={() => setTimeout(() => onPhaseChange(2), 200)}
          />
        )}
      </div>

      {/* "Welcome to Velo." */}
      <div style={{ textAlign: 'center', marginBottom: 14, minHeight: 32 }}>
        {phase >= 2 && (
          <TypeReveal
            text="Welcome to Velo."
            size={20}
            italic={false}
            color="var(--fg)"
            onDone={() => setTimeout(() => onPhaseChange(3), 250)}
          />
        )}
      </div>

      {/* Sub-copy fades in */}
      <div style={{ textAlign: 'center', marginBottom: 28, minHeight: 44, opacity: phase >= 3 ? 1 : 0, transition: 'opacity 0.6s ease', transitionDelay: '0.1s' }}>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.65 }}>
          Let's get your account set up.<br/>It only takes a moment.
        </p>
      </div>

      {/* Wallet pill */}
      {phase >= 3 && address && (
        <div style={{ width: '100%', marginBottom: 16, opacity: 0, animation: 'subtleFadeIn 0.5s ease 0.3s forwards' }}>
          <WalletPill address={address} />
        </div>
      )}

      {/* CTA — appears last with upward slide */}
      {phase >= 3 && (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, opacity: 0, animation: 'btnAppear 0.5s ease 0.55s forwards' }}
          onAnimationEnd={() => onPhaseChange(4)}
        >
          <HoloButton onClick={onContinue}>Get started →</HoloButton>
          <button
            onClick={onBack}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-subtle)', letterSpacing: '0.04em', padding: '4px 0', textAlign: 'center' }}
          >← Use a different wallet</button>
        </div>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// SuccessScreen — precision dark glass. Linear/Vercel-grade.
// Pure CSS animation timeline — no JS phase toggling, no glow soup.
// drawArc → checkIn → slideUp headline → slideUp sub → slideUp chip
// ══════════════════════════════════════════════════════════════════════════════
const SuccessScreen = ({ variant, username }: {
  variant: 'new' | 'returning'; username: string; color: string; address?: string;
}) => {
  const isNew = variant === 'new';
  const accent     = isNew ? '#34d399' : '#a78bfa';
  const accentDim  = isNew ? 'rgba(52,211,153,0.10)'  : 'rgba(167,139,250,0.10)';
  const accentEdge = isNew ? 'rgba(52,211,153,0.22)'  : 'rgba(167,139,250,0.22)';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      textAlign: 'center', padding: '8px 0 4px',
    }}>

      {/* ── Icon mark ── */}
      <div style={{ position: 'relative', width: 68, height: 68, marginBottom: 24 }}>
        {/* Frosted glass disc */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: 'rgba(255,255,255,0.025)',
          border: '1px solid rgba(255,255,255,0.08)',
        }} />

        {/* Ring draw */}
        <svg viewBox="0 0 68 68" width="68" height="68"
          style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          {/* Faint track */}
          <circle cx="34" cy="34" r="28" fill="none"
            stroke="rgba(255,255,255,0.05)" strokeWidth="1.5" />
          {/* Animated arc — CSS animation, fill-mode both */}
          <circle cx="34" cy="34" r="28" fill="none"
            stroke={accent} strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray="176" strokeDashoffset="176"
            transform="rotate(-90 34 34)"
            style={{ animation: 'authDrawArc 0.55s cubic-bezier(0.4,0,0.2,1) 0.1s both' }}
          />
        </svg>

        {/* Check — fades + springs in after arc */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'authCheckIn 0.35s cubic-bezier(0.34,1.4,0.64,1) 0.6s both',
        }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"
            stroke={accent} strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 10 8 14 16 6" />
          </svg>
        </div>
      </div>

      {/* ── Headline ── */}
      <p style={{
        fontFamily: 'var(--font-display, Georgia, serif)',
        fontSize: 21, fontStyle: 'italic', fontWeight: 700,
        color: '#F4F4F7', margin: '0 0 6px', letterSpacing: '-0.02em',
        animation: 'authSlideUp 0.42s ease 0.84s both',
      }}>
        {isNew ? 'Account created.' : `Welcome back, ${username}.`}
      </p>

      {/* ── Sub ── */}
      <p style={{
        fontFamily: 'var(--font-mono)', fontSize: 11,
        color: 'rgba(244,244,247,0.40)', margin: '0 0 18px',
        letterSpacing: '0.04em',
        animation: 'authSlideUp 0.38s ease 1.02s both',
      }}>
        {isNew ? `@${username} · ready to trade` : 'Restoring your session'}
      </p>

      {/* ── Status chip ── */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '6px 12px 6px 9px',
        borderRadius: 6,
        background: accentDim,
        border: `1px solid ${accentEdge}`,
        animation: 'authSlideUp 0.36s ease 1.28s both',
      }}>
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          background: accent, flexShrink: 0,
          animation: 'authLiveDot 1.8s ease-in-out infinite',
        }} />
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10,
          color: accent, letterSpacing: '0.08em',
          textTransform: 'uppercase', fontWeight: 600,
        }}>
          {isNew ? 'Velo  ·  Account active' : 'Velo  ·  Authenticated'}
        </span>
      </div>

    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// Shared micro-components
// ══════════════════════════════════════════════════════════════════════════════

const HoloButton = ({ onClick, children, disabled = false }: { onClick: () => void; children: React.ReactNode; disabled?: boolean }) => (
  <button
    onClick={onClick} disabled={disabled}
    style={{
      width: '100%', padding: '13px',
      background: disabled ? 'var(--bg-base-3)' : 'var(--holo-linear)',
      backgroundSize: '220% 100%',
      animation: disabled ? 'none' : 'holoSlide 9s linear infinite',
      border: 'none', borderRadius: 12,
      fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
      color: disabled ? 'var(--fg-subtle)' : '#0B0B0E',
      cursor: disabled ? 'not-allowed' : 'pointer',
      letterSpacing: '0.07em', textTransform: 'uppercase',
      boxShadow: disabled ? 'none' : '0 4px 20px -6px oklch(0.68 0.22 295 / 0.45)',
      transition: 'transform 0.15s, box-shadow 0.15s',
      opacity: disabled ? 0.4 : 1,
    }}
    onMouseEnter={e => { if (!disabled) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 28px -6px oklch(0.68 0.22 295 / 0.6)'; }}}
    onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = disabled ? 'none' : '0 4px 20px -6px oklch(0.68 0.22 295 / 0.45)'; }}
  >{children}</button>
);

const GhostButton = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    style={{
      width: '100%', padding: '10px',
      background: 'none', border: '1px solid var(--hairline-strong)', borderRadius: 12,
      fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
      color: 'var(--fg-muted)', cursor: 'pointer',
      letterSpacing: '0.06em', textTransform: 'uppercase',
      transition: 'border-color 0.15s, color 0.15s',
    }}
    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--fg-subtle)'; e.currentTarget.style.color = 'var(--fg)'; }}
    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--hairline-strong)'; e.currentTarget.style.color = 'var(--fg-muted)'; }}
  >{children}</button>
);

const ErrorBanner = ({ message }: { message: string }) => (
  <div style={{ padding: '10px 13px', borderRadius: 10, background: 'oklch(0.62 0.22 25 / 0.1)', border: '1px solid oklch(0.62 0.22 25 / 0.25)', color: 'var(--pnl-down)', fontFamily: 'var(--font-mono)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
    {message}
  </div>
);

const WalletPill = ({ address }: { address: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'oklch(0.78 0.18 150 / 0.07)', border: '1px solid oklch(0.78 0.18 150 / 0.2)', borderRadius: 10 }}>
    <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--pnl-up)', flexShrink: 0 }} />
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)', fontWeight: 600, flex: 1 }}>{address.slice(0, 10)}…{address.slice(-8)}</span>
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--pnl-up)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Connected</span>
  </div>
);

const PulseRing = () => (
  <div style={{ position: 'relative', width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid var(--iris-violet, oklch(0.68 0.22 295))', animation: 'pulseRingAnim 1.5s ease-in-out infinite' }} />
    <div style={{ width: 34, height: 34, borderRadius: '50%', border: '2px solid var(--hairline-strong)', borderTopColor: 'var(--iris-violet, oklch(0.68 0.22 295))', animation: 'authSpin 0.8s linear infinite' }} />
  </div>
);

const Divider = ({ label }: { label: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
    <div style={{ flex: 1, height: 1, background: 'var(--hairline)' }} />
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-subtle)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</span>
    <div style={{ flex: 1, height: 1, background: 'var(--hairline)' }} />
  </div>
);

// NO-OP — auto-open on logout removed. App redirects to Trade tab on logout.
export function useOnboardingGuard(_user: any, _setLoginOpen: (v: boolean) => void) {}
