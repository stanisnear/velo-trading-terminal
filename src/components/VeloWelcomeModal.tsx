/**
 * VeloWelcomeModal — first-run onboarding.
 *
 * One modal, one cohesive flow. Three things happen in sequence after the user
 * clicks "Get started":
 *
 *   1. Claim 1,000 test mUSDC from the faucet (one MetaMask signature)
 *   2. Sign the burner derivation message (gas-free signature)
 *   3. Fund the burner wallet with ETH + mUSDC (one combined ETH transfer +
 *      one USDC transfer — MetaMask signs each)
 *
 * After this 3-step setup, the user never sees a MetaMask popup again during
 * trading. The burner wallet (Velo Trading Wallet) signs all VeloPerps txns
 * locally with its private key (stored in localStorage, derived from the
 * MetaMask signature so it's recoverable).
 *
 * If the user already has a burner wallet on this browser, the modal skips
 * the derivation step (idempotent).
 */
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi';
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Loader2,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  fetchUsdcBalance,
  fetchFaucetCooldown,
} from '@/services/veloUsdcService';
import { VELO_USDC_BASE, VELO_PERPS_ADDRESS, baseScanTxUrl, baseScanAddressUrl } from '@/services/veloPerpsService';
import { setupBurnerWallet } from '@/services/veloBurnerSetup';
import { claimUsername, fetchUsernameForAddress, validateUsername } from '@/services/usernameService';
import { ensureBurnerGas } from '@/services/veloGasSponsor';

const BASE_SEPOLIA_ID = 84532;
// Per-account dismissal so the modal never reappears for a given wallet once
// setup has run — even across browser refreshes or if the global flag is
// cleared. The legacy global key is still honoured for backwards compat.
const STORAGE_KEY_DISMISSED = 'velo:welcomeDismissed';
function dismissedKeyFor(addr?: string | null): string {
  return addr ? `velo:welcomeDismissed:${addr.toLowerCase()}` : STORAGE_KEY_DISMISSED;
}
function markWelcomeDismissed(addr?: string | null) {
  try {
    localStorage.setItem(STORAGE_KEY_DISMISSED, '1');
    if (addr) localStorage.setItem(dismissedKeyFor(addr), '1');
  } catch {}
}

const S = {
  display: { fontFamily: 'var(--font-display)', fontStyle: 'italic' as const, letterSpacing: '-0.02em' },
  mono:    { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1', fontVariantNumeric: 'tabular-nums' as const },
  sans:    { fontFamily: 'var(--font-sans)' },
  label:   { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)' } as React.CSSProperties,
};

const cardStyle: React.CSSProperties = {
  width: 'min(440px, calc(100vw - 32px))',
  background: 'var(--glass-bg-strong)',
  border: '1px solid var(--glass-border)',
  borderRadius: 24,
  boxShadow: '0 32px 96px -16px rgba(0, 0, 0, 0.6), 0 1px 0 rgba(255,255,255,0.04) inset',
  backdropFilter: 'blur(40px) saturate(1.3)',
  WebkitBackdropFilter: 'blur(40px) saturate(1.3)',
  position: 'relative',
  overflow: 'hidden',
};

const holoGradient: React.CSSProperties = {
  position: 'absolute',
  top: 0, left: 0, right: 0,
  height: 2,
  background: 'linear-gradient(90deg, oklch(0.45 0.26 295) 0%, oklch(0.55 0.24 285) 35%, oklch(0.65 0.22 268) 70%, oklch(0.72 0.18 250) 100%)',
  opacity: 0.9,
  zIndex: 1,
};

type Step =
  | 'INTRO'             // welcome screen with claim button
  | 'CLAIM_SIGN'        // waiting for MetaMask to sign faucet mint
  | 'CLAIM_CONFIRM'     // mint tx mining
  | 'SETUP_INTRO'       // mid-flow card explaining the burner setup
  | 'SETUP_SIGN'        // waiting for MetaMask sig on derivation message
  | 'SETUP_SPONSOR'     // calling the gas sponsor endpoint
  | 'SETUP_FUND_ETH'    // main-wallet ETH fallback tx mining
  | 'SETUP_FUND_USDC'   // USDC funding tx mining
  | 'SUCCESS'           // all done
  | 'ERROR';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onClaimed?: () => void;
  /**
   * The @handle the user chose during signup (AuthModal name step). The setup
   * flow registers it on-chain in VeloRegistry automatically so the user never
   * has to claim it from a separate modal afterwards. Signed by the main
   * wallet (identity must survive a burner reset).
   */
  desiredHandle?: string;
  /** Fires after the handle is successfully registered on-chain. */
  onUsernameClaimed?: (handle: string, txHash: `0x${string}`) => void;
  /**
   * Fires when the burner setup completes (so App can refresh the hook).
   * If the setup ran a faucet mint, the args carry the credited amount and
   * the on-chain proof so the host can write a DEPOSIT row to Supabase and
   * show it in Recent Activity. When the modal short-circuits because the
   * burner already has a balance, txHash is null and amount is the balance
   * already on-chain (no new credit to record).
   */
  onBurnerReady?: (args: {
    burnerAddress: `0x${string}`;
    amount: number;
    txHash: `0x${string}` | null;
  }) => void;
}

export const VeloWelcomeModal: React.FC<Props> = ({ isOpen, onClose, onClaimed, onBurnerReady, desiredHandle, onUsernameClaimed }) => {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [step, setStep] = useState<Step>('INTRO');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [claimTxHash, setClaimTxHash] = useState<`0x${string}` | null>(null);
  const [postClaimBalance, setPostClaimBalance] = useState<number>(0);
  const [burnerAddress, setBurnerAddress] = useState<string | null>(null);

  const onWrongChain = isConnected && chainId !== BASE_SEPOLIA_ID;

  useEffect(() => {
    if (!isOpen) {
      setStep('INTRO');
      setErrorMsg('');
      setClaimTxHash(null);
      setBurnerAddress(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const dismiss = () => {
    markWelcomeDismissed(address);
    onClose();
  };

  // ── Action: start the full setup flow ─────────────────────────────────────
  // New flow (v2): one MetaMask signature, faucet mints directly to burner.
  //
  //   1. User signs derivation message (gas-free MetaMask popup)
  //   2. Sponsor sends ETH to the burner
  //   3. Burner calls mint() — silent, no popup
  //
  // No more main-wallet faucet claim, no more main-to-burner transfer.
  const startSetup = async () => {
    if (!walletClient || !publicClient || !address) {
      setErrorMsg('Wallet not connected.');
      setStep('ERROR');
      return;
    }
    setErrorMsg('');

    // ── Faucet cooldown pre-flight (on the burner address if one exists) ──
    try {
      const burnerExists = (() => {
        try { return localStorage.getItem('velo_burner_' + address.toLowerCase()); }
        catch { return null; }
      })();
      // If the burner exists and has already minted recently, surface the
      // cooldown before we waste a sponsor call.
      if (burnerExists) {
        try {
          const burnerData = JSON.parse(burnerExists);
          const burnerAddr = burnerData.veloAddress;
          const [cooldown, bal] = await Promise.all([
            fetchFaucetCooldown(publicClient, VELO_USDC_BASE, burnerAddr),
            fetchUsdcBalance(publicClient, VELO_USDC_BASE, burnerAddr),
          ]);
          if (bal > 0) {
            // Burner already has mUSDC — setup is complete, just close.
            // No txHash because nothing was minted in this session; the
            // host will see txHash:null and skip the duplicate Supabase write.
            setPostClaimBalance(bal);
            setBurnerAddress(burnerAddr);
            setStep('SUCCESS');
            markWelcomeDismissed(address);
            onBurnerReady?.({ burnerAddress: burnerAddr, amount: bal, txHash: null });
            return;
          }
          if (cooldown.availableAt > 0 && Date.now() / 1000 < cooldown.availableAt) {
            const mins = Math.ceil((cooldown.availableAt - Date.now() / 1000) / 60);
            setErrorMsg(`Faucet cooldown active — try again in ~${mins} minutes.`);
            setStep('ERROR');
            return;
          }
        } catch {/* ignore — proceed normally */}
      }
    } catch {/* ignore */}

    // Trigger the burner setup (derive → sponsor → burner mints faucet)
    try {
      setStep('SETUP_INTRO');
      await new Promise(res => setTimeout(res, 600));

      const result = await setupBurnerWallet({
        walletClient,
        publicClient,
        ownerAddress: address,
        onStep: (s) => {
          if (s === 'SIGNING') setStep('SETUP_SIGN');
          if (s === 'SPONSOR_REQUEST') setStep('SETUP_SPONSOR');
          if (s === 'FUNDING_ETH_FALLBACK') setStep('SETUP_FUND_ETH');
          if (s === 'CLAIMING_FAUCET') setStep('CLAIM_CONFIRM');
        },
      });
      setBurnerAddress(result.burner.veloAddress);
      setClaimTxHash(result.faucetTxHash);
      // ── Register the chosen @handle on-chain (VeloRegistry) ──────────────
      // Done here, as part of one cohesive setup flow, so the handle the user
      // picked at signup becomes their permanent on-chain identity without a
      // separate confusing "claim" step later. Signed by the MAIN wallet (not
      // the burner) so the identity survives a burner reset. Best-effort:
      // failures here never block the faucet/setup from completing.
      if (desiredHandle && walletClient && address) {
        try {
          const normalized = desiredHandle.startsWith('@') ? desiredHandle.slice(1) : desiredHandle;
          if (!validateUsername(normalized)) {
            const existing = await fetchUsernameForAddress(publicClient, address);
            if (!existing) {
              await ensureBurnerGas(publicClient, address);
              const unameTx = await claimUsername(walletClient as any, normalized);
              onUsernameClaimed?.(normalized, unameTx);
            }
          }
        } catch (e) {
          console.warn('[velo] on-chain username claim skipped:', e);
        }
      }
      // Read the burner's balance so we can show it in the success card
      let postBalance = 1000;
      try {
        const bal = await fetchUsdcBalance(publicClient, VELO_USDC_BASE, result.burner.veloAddress);
        postBalance = bal;
        setPostClaimBalance(bal);
      } catch { setPostClaimBalance(1000); /* faucet amount */ }
      setStep('SUCCESS');
      markWelcomeDismissed(address);
      onClaimed?.();
      // Forward the faucet credit so App.tsx can write a DEPOSIT row to
      // Supabase. The Recent Activity feed reads from that table, so without
      // this call the user's initial $1,000 never shows up in the dashboard.
      onBurnerReady?.({
        burnerAddress: result.burner.veloAddress,
        amount: postBalance,
        txHash: result.faucetTxHash ?? null,
      });
    } catch (e: any) {
      handleError(e, 'Trading wallet setup was interrupted.');
    }
  };

  // doBurnerSetup retained as a no-op stub for backwards compat in case
  // anything else references it. Not called from the new flow.
  const doBurnerSetup = async (_usdcAvailable: number) => {
    // intentionally empty — superseded by v2 flow inside startSetup
  };

  const handleError = (e: any, fallback: string) => {
    const msg = e?.shortMessage || e?.message || fallback;
    if (/rejected|denied|cancelled/i.test(msg)) {
      setErrorMsg('You cancelled the signature. No funds were touched.');
    } else if (/cooldown/i.test(msg)) {
      setErrorMsg('Faucet cooldown active — try again in 6 hours.');
    } else if (/balance cap/i.test(msg) || /FaucetBalance/i.test(msg)) {
      setErrorMsg('You already have plenty of mUSDC. Faucet skipped.');
    } else if (/insufficient funds/i.test(msg) || /exceeds the balance/i.test(msg) || /gas \* gas/i.test(msg)) {
      setErrorMsg("Out of gas for this transaction. We tried to top you up but couldn't reach the sponsor — get a tiny amount of Base Sepolia ETH from the Coinbase faucet and retry.");
    } else {
      setErrorMsg(msg);
    }
    setStep('ERROR');
  };

  // ── UI building blocks ────────────────────────────────────────────────────
  const Header = () => (
    <button
      onClick={dismiss}
      aria-label="Close"
      style={{
        position: 'absolute', top: 16, right: 16, zIndex: 3,
        width: 32, height: 32, borderRadius: 999,
        background: 'rgba(255,255,255,0.04)', border: '1px solid var(--hairline)',
        color: 'var(--fg-muted)', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'}
    >
      <X size={16} />
    </button>
  );

  const renderIntro = () => (
    <div style={{ padding: '48px 32px 32px', textAlign: 'center', position: 'relative' }}>
      <div
        style={{
          width: 88, height: 88, margin: '0 auto 24px',
          borderRadius: 24,
          background:
            'linear-gradient(160deg, oklch(0.78 0.22 295) 0%, oklch(0.72 0.22 320) 50%, oklch(0.66 0.22 340) 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', overflow: 'hidden',
          boxShadow: '0 12px 32px -8px oklch(0.68 0.22 295 / 0.5)',
        }}
      >
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(120% 80% at 30% 8%, rgba(255,255,255,0.55), transparent 55%)',
        }} />
        <span style={{
          ...S.display, fontSize: 44, color: '#fff',
          position: 'relative', zIndex: 1, lineHeight: 1,
        }}>V</span>
      </div>

      <h2 style={{ ...S.display, fontSize: 32, color: 'var(--fg)', margin: '0 0 8px', lineHeight: 1.15 }}>
        Welcome to Velo
      </h2>
      <p style={{ ...S.sans, fontSize: 14, color: 'var(--fg-muted)', margin: '0 0 28px', lineHeight: 1.5 }}>
        Real on-chain perpetuals. We'll fund you with 1,000 mUSDC,<br />
        set up your trading wallet, and you'll be live in 30 seconds.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 28 }}>
        {[
          { title: '25×', sub: 'Max leverage' },
          { title: 'Pyth', sub: 'Oracle' },
          { title: '0.1%', sub: 'Per side fee' },
        ].map(({ title, sub }) => (
          <div key={title} style={{
            padding: '14px 8px', borderRadius: 12,
            background: 'rgba(255,255,255,0.02)', border: '1px solid var(--hairline)',
          }}>
            <div style={{ ...S.display, fontSize: 22, color: 'var(--fg)', lineHeight: 1 }}>{title}</div>
            <div style={{ ...S.label, marginTop: 4 }}>{sub}</div>
          </div>
        ))}
      </div>

      {onWrongChain ? (
        <div style={{
          padding: 12, borderRadius: 12, marginBottom: 16,
          background: 'rgba(255, 200, 50, 0.08)', border: '1px solid rgba(255, 200, 50, 0.3)',
        }}>
          <div style={{ ...S.mono, fontSize: 12, color: 'var(--fg-muted)', marginBottom: 8 }}>
            Velo Perps lives on Base Sepolia. Switch networks to continue.
          </div>
          <button
            onClick={() => switchChain({ chainId: BASE_SEPOLIA_ID })}
            style={{
              ...S.mono,
              width: '100%', padding: '10px 0', borderRadius: 10, border: 'none',
              background: 'var(--fg)', color: 'var(--bg-base)',
              fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', cursor: 'pointer',
            }}
          >
            Switch to Base Sepolia
          </button>
        </div>
      ) : (
        <button
          onClick={startSetup}
          disabled={!isConnected}
          style={{
            ...S.mono,
            width: '100%', padding: '16px 0', borderRadius: 14, border: 'none',
            background: isConnected
              ? 'linear-gradient(100deg, oklch(0.68 0.22 295) 0%, oklch(0.70 0.22 340) 50%, oklch(0.74 0.18 30) 100%)'
              : 'var(--chip-bg)',
            color: '#fff',
            fontSize: 13, fontWeight: 700, letterSpacing: '0.1em',
            textTransform: 'uppercase',
            cursor: isConnected ? 'pointer' : 'not-allowed',
            opacity: isConnected ? 1 : 0.5,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'transform 0.12s, box-shadow 0.12s',
            boxShadow: isConnected ? '0 8px 24px -8px oklch(0.68 0.22 295 / 0.4)' : 'none',
          }}
          onMouseEnter={e => isConnected && ((e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)')}
          onMouseLeave={e => isConnected && ((e.currentTarget as HTMLElement).style.transform = 'translateY(0)')}
        >
          Get started
          <ArrowRight size={14} />
        </button>
      )}

      {/* ETH faucet hint — only show if no chain issue */}
      {!onWrongChain && isConnected && (
        <a
          href="https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            ...S.mono, fontSize: 10, color: 'var(--fg-subtle)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            marginTop: 12, textDecoration: 'none',
            letterSpacing: '0.05em',
          }}
        >
          Need Base Sepolia ETH for gas? <span style={{ color: 'var(--iris-violet)' }}>Get some →</span>
        </a>
      )}

      <div style={{
        marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--hairline)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}>
        <ShieldCheck size={12} style={{ color: 'var(--pnl-up)' }} />
        <a
          href={baseScanAddressUrl(VELO_PERPS_ADDRESS)}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            ...S.mono, fontSize: 10, color: 'var(--fg-subtle)',
            letterSpacing: '0.1em', textTransform: 'uppercase',
            textDecoration: 'none',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          Verified on BaseScan
          <ExternalLink size={10} />
        </a>
      </div>
    </div>
  );

  const renderProgress = (
    title: string,
    subtitle: string,
    progressFraction?: number,
    txHash?: string | null,
  ) => (
    <div style={{ padding: '60px 32px', textAlign: 'center' }}>
      <div
        style={{
          width: 72, height: 72, margin: '0 auto 24px',
          borderRadius: 999,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid var(--hairline)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Loader2 size={28} className="animate-spin" style={{ color: 'var(--iris-violet)' }} />
      </div>
      <h2 style={{ ...S.display, fontSize: 26, color: 'var(--fg)', margin: '0 0 8px' }}>
        {title}
      </h2>
      <p style={{ ...S.sans, fontSize: 13, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.5 }}>
        {subtitle}
      </p>
      {typeof progressFraction === 'number' && (
        <div style={{
          marginTop: 24, height: 4, background: 'rgba(255,255,255,0.05)',
          borderRadius: 2, overflow: 'hidden', width: '60%', marginLeft: 'auto', marginRight: 'auto',
        }}>
          <div style={{
            height: '100%', width: `${Math.round(progressFraction * 100)}%`,
            background: 'linear-gradient(90deg, var(--iris-violet), var(--iris-magenta))',
            transition: 'width 0.4s ease',
          }} />
        </div>
      )}
      {txHash && (
        <a
          href={baseScanTxUrl(txHash)}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            ...S.mono, fontSize: 11, color: 'var(--iris-violet)',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            marginTop: 20, textDecoration: 'none',
          }}
        >
          View on BaseScan <ExternalLink size={11} />
        </a>
      )}
    </div>
  );

  const renderSuccess = () => (
    <div style={{ padding: '48px 32px 32px', textAlign: 'center' }}>
      <div
        style={{
          width: 88, height: 88, margin: '0 auto 24px',
          borderRadius: 24,
          background: 'linear-gradient(160deg, oklch(0.82 0.20 150) 0%, oklch(0.70 0.22 160) 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 12px 32px -8px oklch(0.78 0.18 150 / 0.5)',
          position: 'relative', overflow: 'hidden',
        }}
      >
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(120% 80% at 30% 8%, rgba(255,255,255,0.55), transparent 55%)',
        }} />
        <CheckCircle2 size={40} style={{ color: '#fff', position: 'relative', zIndex: 1 }} strokeWidth={2.5} />
      </div>

      <h2 style={{ ...S.display, fontSize: 32, color: 'var(--fg)', margin: '0 0 8px' }}>
        You're in
      </h2>
      <p style={{ ...S.sans, fontSize: 14, color: 'var(--fg-muted)', margin: '0 0 24px', lineHeight: 1.5 }}>
        Trading wallet is funded and signed in. Every trade from now on signs locally — no popups.
      </p>

      <div style={{
        padding: '20px', marginBottom: 12, borderRadius: 14,
        background: 'rgba(255,255,255,0.03)', border: '1px solid var(--hairline)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={S.label}>Balance</span>
          <span style={{ ...S.display, fontSize: 24, color: 'var(--fg)' }}>
            ${postClaimBalance.toLocaleString('en-US', { maximumFractionDigits: 2 })}
          </span>
        </div>
        {burnerAddress && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={S.label}>Trading wallet</span>
            <span style={{ ...S.mono, fontSize: 10, color: 'var(--fg-muted)' }}>
              {burnerAddress.slice(0, 6)}…{burnerAddress.slice(-4)}
            </span>
          </div>
        )}
      </div>

      {claimTxHash && (
        <a
          href={baseScanTxUrl(claimTxHash)}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            ...S.mono, fontSize: 11, color: 'var(--iris-violet)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            marginBottom: 20, textDecoration: 'none',
          }}
        >
          Claim tx on BaseScan
          <ExternalLink size={11} />
        </a>
      )}

      <button
        onClick={dismiss}
        style={{
          ...S.mono,
          width: '100%', padding: '14px 0', borderRadius: 12, border: 'none',
          background: 'var(--fg)', color: 'var(--bg-base)',
          fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        Start trading
        <ArrowRight size={14} />
      </button>
    </div>
  );

  const renderError = () => (
    <div style={{ padding: '48px 32px 32px', textAlign: 'center' }}>
      <div
        style={{
          width: 72, height: 72, margin: '0 auto 24px',
          borderRadius: 999,
          background: 'rgba(255, 100, 100, 0.08)',
          border: '1px solid rgba(255, 100, 100, 0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <X size={28} style={{ color: 'var(--pnl-down)' }} strokeWidth={2.5} />
      </div>
      <h2 style={{ ...S.display, fontSize: 26, color: 'var(--fg)', margin: '0 0 8px' }}>
        Something interrupted us
      </h2>
      <p style={{ ...S.sans, fontSize: 13, color: 'var(--fg-muted)', margin: '0 0 24px', lineHeight: 1.5 }}>
        {errorMsg || 'Please try again.'}
      </p>
      <button
        onClick={() => setStep('INTRO')}
        style={{
          ...S.mono,
          width: '100%', padding: '14px 0', borderRadius: 12, border: 'none',
          background: 'var(--fg)', color: 'var(--bg-base)',
          fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase', cursor: 'pointer',
        }}
      >
        Try again
      </button>
    </div>
  );

  // ── Portal ─────────────────────────────────────────────────────────────────
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
        animation: 'velo-fade-in 0.2s ease-out',
      }}
      onClick={(e) => {
        // Click backdrop dismisses only from idle/terminal states (not mid-flow).
        if (e.target === e.currentTarget && (step === 'INTRO' || step === 'SUCCESS' || step === 'ERROR')) {
          dismiss();
        }
      }}
    >
      <style>{`
        @keyframes velo-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
      <div style={cardStyle}>
        <div style={holoGradient} />
        <Header />
        {step === 'INTRO'           && renderIntro()}
        {step === 'CLAIM_SIGN'      && renderProgress('Sign in your wallet', 'Confirm the transaction to claim 1,000 test USDC.', 0.15)}
        {step === 'CLAIM_CONFIRM'   && renderProgress('Confirming on-chain', 'Your USDC is being minted on Base Sepolia.', 0.3, claimTxHash)}
        {step === 'SETUP_INTRO'     && renderProgress('Setting up your trading wallet', 'A second wallet for silent trade signing — no popups during trading.', 0.5)}
        {step === 'SETUP_SIGN'      && renderProgress('One signature', 'This signature derives your trading wallet. It costs no gas.', 0.6)}
        {step === 'SETUP_SPONSOR'   && renderProgress('Sending you starter gas', 'We\'re funding your trading wallet with a little ETH so it can pay for transactions.', 0.7)}
        {step === 'SETUP_FUND_ETH'  && renderProgress('Funding the wallet with gas', 'Sending ETH so your trading wallet can pay for transactions.', 0.75)}
        {step === 'SETUP_FUND_USDC' && renderProgress('Transferring trading capital', 'Moving your test USDC to your trading wallet.', 0.9)}
        {step === 'SUCCESS'         && renderSuccess()}
        {step === 'ERROR'           && renderError()}
      </div>
    </div>,
    document.body,
  );
};

export function shouldShowVeloWelcome(args: {
  isConnected: boolean;
  chainId: number | undefined;
  usdcBalance: number;
  hasBurner: boolean;
  address?: string | null;
  /** True if this account is already registered on Velo (profile exists with a
   *  persisted Velo wallet / username). Registered accounts never see the
   *  first-run faucet/welcome flow again, regardless of local storage state. */
  isRegistered?: boolean;
}): boolean {
  if (!args.isConnected) return false;
  if (args.chainId !== BASE_SEPOLIA_ID) return false;
  // Already registered on Velo → setup happened on a prior session. Never show
  // the first-run claim flow again even if the burner/balance read is stale or
  // a contract address changed.
  if (args.isRegistered) return false;
  // If already has burner AND USDC balance > 0 → setup complete, no need to show
  if (args.hasBurner && args.usdcBalance > 0) return false;
  try {
    if (localStorage.getItem(dismissedKeyFor(args.address)) === '1') return false;
    if (localStorage.getItem(STORAGE_KEY_DISMISSED) === '1') return false;
  } catch {}
  return true;
}
