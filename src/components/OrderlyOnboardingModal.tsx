// ═══════════════════════════════════════════════════════════════════════════════
// VELO ONBOARDING — three steps, Apple-class.
//
// Flow:
//   1. WELCOME — brand intro, one CTA
//   2. SETUP   — single tap does *everything*: derive Velo wallet (one MetaMask
//                signature), register on Orderly, bind ed25519 trading key,
//                claim 1,000 USDC from the Orderly faucet, poll for credit.
//   3. READY   — celebration + auto-close into the trading dashboard.
//
// Hidden under "Advanced": fund-from-main and on-chain vault deposit. Those
// are the slow path; 99% of testnet users want the one-tap fast path.
//
// CRITICAL: the previous build had a broken hand-rolled keccak256 in
// orderlyService.ts that produced wrong account_ids for every authenticated
// call. Faucet credits ARRIVED, but the app was polling the wrong account so
// it looked like nothing happened. That's now fixed at the source. This modal
// just talks to the corrected API.
// ═══════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef } from 'react';
import {
  useAccount, useSignMessage, useReadContract, useSendTransaction,
} from 'wagmi';
import { formatUnits, parseEther, encodeFunctionData } from 'viem';
import {
  CheckCircle2, X, Loader2, ChevronDown, Copy, Check,
  ExternalLink, ArrowRight, Sparkles, ShieldCheck, Wallet,
} from 'lucide-react';
import {
  getOrCreateVeloBurner, loadStoredBurner,
  type VeloBurnerWallet,
} from '../services/veloBurnerWallet';
import {
  registerOrderlyKeyWithBurner, depositFromBurner, getBurnerBalances,
} from '../services/burnerOrderly';
import {
  getOrderlyBalance, getStoredKeypair,
  type OrderlyKeypair, USDC_BASE_SEPOLIA,
} from '../services/orderlyService';
import {
  upsertPendingDeposit, updatePendingDeposit, removePendingDeposit,
} from '../services/pendingDeposits';

// ─── Types & constants ───────────────────────────────────────────────────────

type Step = 'WELCOME' | 'SETUP' | 'READY';

const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const;

const TRANSFER_ABI = [
  { name: 'transfer', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'bool' }] },
] as const;

const GAS_TOPUP_THRESHOLD = parseEther('0.0005');
const FAUCET_POLL_TIMEOUT_MS = 90_000;
const FAUCET_POLL_INTERVAL_MS = 3_000;

interface Props {
  isOpen:  boolean;
  onClose: () => void;
  onReady: (kp: OrderlyKeypair, burner: VeloBurnerWallet, bal: number) => void;
}

const F = {
  display: { fontFamily: 'var(--font-display)', fontStyle: 'italic' as const, letterSpacing: '-0.025em', lineHeight: 1.05 },
  sans:    { fontFamily: 'var(--font-sans)',    letterSpacing: '-0.005em' },
  mono:    { fontFamily: 'var(--font-mono)' },
};

const short = (a: string | undefined) => a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '';

// Substep enum used during the SETUP phase to drive the inline progress UI.
type Substep =
  | 'idle'
  | 'sign'        // waiting for the MetaMask signature
  | 'gas'         // sponsor topping up the burner with ETH for gas
  | 'register'    // POST /v1/register_account + /v1/orderly_key
  | 'faucet'      // POST /v1/faucet/usdc
  | 'wait'        // polling /v1/client/holding for the credit
  | 'done';

const SUBSTEP_ORDER: Substep[] = ['sign', 'gas', 'register', 'faucet', 'wait'];
const SUBSTEP_LABEL: Record<Substep, string> = {
  idle:     '',
  sign:     'Signing in your wallet',
  gas:      'Funding gas (sponsored)',
  register: 'Registering on Orderly',
  faucet:   'Claiming 1,000 USDC',
  wait:     'Settling on trading account',
  done:     'Done',
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const OrderlyOnboardingModal: React.FC<Props> = ({ isOpen, onClose, onReady }) => {
  const { address: ownerAddress } = useAccount();
  const { signMessageAsync }      = useSignMessage();
  const { sendTransactionAsync }  = useSendTransaction();

  const [step,        setStep]        = useState<Step>('WELCOME');
  const [substep,     setSubstep]     = useState<Substep>('idle');
  const [error,       setError]       = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [burner,      setBurner]      = useState<VeloBurnerWallet | null>(null);
  const [keypair,     setKeypair]     = useState<OrderlyKeypair | null>(null);
  const [orderlyBal,  setOrderlyBal]  = useState(0);
  const [copied,      setCopied]      = useState(false);

  const [burnerEth,   setBurnerEth]   = useState<bigint>(0n);
  const [burnerUsdc,  setBurnerUsdc]  = useState<bigint>(0n);

  const [advBusy,     setAdvBusy]     = useState(false);
  const [advStatus,   setAdvStatus]   = useState('');
  const [approveTx,   setApproveTx]   = useState<`0x${string}` | undefined>();
  const [depositTx,   setDepositTx]   = useState<`0x${string}` | undefined>();

  const cancelledRef = useRef(false);

  // Owner balances (for Advanced/fund-from-main)
  const { data: ownerUsdcData } = useReadContract({
    address: USDC_BASE_SEPOLIA as `0x${string}`, abi: ERC20_ABI, functionName: 'balanceOf',
    args: ownerAddress ? [ownerAddress as `0x${string}`] : undefined,
    query: { enabled: !!ownerAddress, refetchInterval: 8000 },
  });
  const ownerUsdc = ownerUsdcData ? (ownerUsdcData as bigint) : 0n;

  // ── Init: figure out which step to land on ────────────────────────────────
  useEffect(() => {
    if (!isOpen || !ownerAddress) return;

    setError('');
    setSubstep('idle');
    setShowAdvanced(false);
    setApproveTx(undefined);
    setDepositTx(undefined);
    setAdvStatus('');
    setAdvBusy(false);
    cancelledRef.current = false;

    const cached = loadStoredBurner(ownerAddress);
    if (cached) {
      setBurner(cached);
      const storedKp = getStoredKeypair(cached.veloAddress);
      if (storedKp) {
        setKeypair(storedKp);
        // We have a fully-set-up account already. Check balance and either
        // jump to READY (if funded) or show Welcome with claim CTA.
        getOrderlyBalance(cached.veloAddress, storedKp).then(bal => {
          if (cancelledRef.current) return;
          setOrderlyBal(bal);
          if (bal > 0) setStep('READY'); else setStep('WELCOME');
        }).catch(() => setStep('WELCOME'));
      } else {
        setStep('WELCOME');
      }
    } else {
      setBurner(null);
      setKeypair(null);
      setStep('WELCOME');
    }

    return () => { cancelledRef.current = true; };
  }, [isOpen, ownerAddress]);

  // ── Refresh burner on-chain balances (only matters for Advanced path) ─────
  useEffect(() => {
    if (!burner || !isOpen) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const { eth, usdc } = await getBurnerBalances(burner);
        if (!cancelled) { setBurnerEth(eth); setBurnerUsdc(usdc); }
      } catch { /* non-fatal */ }
    };
    refresh();
    const id = setInterval(refresh, 6000);
    return () => { cancelled = true; clearInterval(id); };
  }, [burner, isOpen]);

  // ─── The "do it all" handler ─────────────────────────────────────────────
  // 1) Derive Velo burner wallet (one MetaMask signature)
  // 2) Sponsor gas if needed
  // 3) Register on Orderly + bind ed25519 trading key (gasless EIP-712)
  // 4) Call the faucet
  // 5) Poll /v1/client/holding for the 1,000 USDC credit
  const handleSetupAll = async () => {
    if (!ownerAddress) return;
    setError(''); setSubstep('sign');

    try {
      // ── 1. Derive burner ────────────────────────────────────────────────
      let b = burner;
      if (!b) {
        b = await getOrCreateVeloBurner(ownerAddress as `0x${string}`, signMessageAsync as any);
        if (cancelledRef.current) return;
        setBurner(b);
      }

      // ── 2. Sponsor gas (non-fatal if it fails — the faucet path doesn't
      //    actually need on-chain gas; this is insurance for Advanced users). ──
      setSubstep('gas');
      const { eth: ethNow } = await getBurnerBalances(b).catch(() => ({ eth: 0n, usdc: 0n }));
      setBurnerEth(ethNow);
      if (ethNow < GAS_TOPUP_THRESHOLD) {
        try {
          await fetch('/api/gas-sponsor', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ burner_address: b.veloAddress }),
          });
        } catch { /* non-fatal */ }
      }

      // ── 3. Register + bind key (only if not already done) ──────────────
      setSubstep('register');
      let kp = keypair || getStoredKeypair(b.veloAddress);
      if (!kp) {
        const r = await registerOrderlyKeyWithBurner(b);
        if (cancelledRef.current) return;
        if (!r.success || !r.keypair) {
          setError(r.error || 'Could not register your Velo wallet on Orderly. Please try again.');
          setSubstep('idle');
          return;
        }
        kp = r.keypair;
        setKeypair(kp);
      }

      // ── 4. Snapshot trading-account balance BEFORE faucet ──────────────
      const before = await getOrderlyBalance(b.veloAddress, kp).catch(() => 0);

      // ── 5. Call the faucet (with retry handled server-side) ─────────────
      setSubstep('faucet');
      const faucetRes = await fetch('/api/faucet', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_address: b.veloAddress,
          broker_id:    'woofi_dex',
          chain_id:     '84532',
          source:       'orderly',
        }),
      }).then(r => r.json()).catch(e => ({ success: false, message: e?.message }));

      if (cancelledRef.current) return;

      const faucetOK = faucetRes?.success === true;
      if (!faucetOK) {
        // If user already had a residual balance, just surface that.
        if (before > 0) {
          setOrderlyBal(before);
          setStep('READY');
          onReady(kp, b, before);
          setTimeout(() => { if (!cancelledRef.current) onClose(); }, 1800);
          return;
        }
        const msg = faucetRes?.message || 'Faucet request failed. The Orderly testnet faucet is sometimes flaky — try again in a moment.';
        setError(msg);
        setSubstep('idle');
        return;
      }

      // Synthetic pending deposit so the dashboard pill shows progress.
      // NOTE: The credited Supabase transaction is recorded by App.tsx in the
      // onReady callback. To avoid showing the same $1000 credit twice in the
      // dashboard activity feed, we only keep this entry while it's settling
      // and remove it as soon as the credit lands. Without this dedup the
      // user sees TWO "+$1000" rows side-by-side (one localStorage, one DB).
      const pendId = `faucet-${Date.now()}` as `0x${string}`;
      upsertPendingDeposit({
        id:            pendId,
        burnerAddress: b.veloAddress,
        amount:        1000,
        submittedAt:   Date.now(),
        status:        'CONFIRMED_AWAITING_CREDIT',
        balanceBefore: before,
      });

      // ── 6. Poll the trading-account balance ────────────────────────────
      setSubstep('wait');
      const startedAt = Date.now();
      while (Date.now() - startedAt < FAUCET_POLL_TIMEOUT_MS) {
        await new Promise(r => setTimeout(r, FAUCET_POLL_INTERVAL_MS));
        if (cancelledRef.current) return;
        const bal = await getOrderlyBalance(b.veloAddress, kp).catch(() => 0);
        if (bal > before) {
          // Credit landed — remove the synthetic pending deposit so it
          // doesn't double-up with the Supabase transaction recorded by
          // App.tsx onReady. The pending pill served its purpose during
          // the faucet wait; the canonical record is the Supabase row.
          removePendingDeposit(pendId);
          setOrderlyBal(bal);
          setSubstep('done');
          setStep('READY');
          onReady(kp, b, bal);
          setTimeout(() => { if (!cancelledRef.current) onClose(); }, 2200);
          return;
        }
      }

      // Faucet succeeded server-side but credit didn't surface in 90s. Don't
      // dead-end the user — close into the dashboard, where the App-level
      // poller takes over and toasts the credit when it arrives.
      setSubstep('idle');
      onReady(kp, b, 0);
      onClose();
    } catch (e: any) {
      if (cancelledRef.current) return;
      const msg = e?.message?.includes('rejected') || e?.message?.includes('User denied')
        ? 'You cancelled the signature.'
        : (e?.message || 'Something went wrong. Please try again.');
      setError(msg);
      setSubstep('idle');
    }
  };

  // ─── Advanced: fund the Velo wallet from main wallet ─────────────────────
  const handleSendFromMain = async () => {
    if (!burner) return;
    if (ownerUsdc === 0n) { setError('Your main wallet has no USDC to send.'); return; }
    setAdvBusy(true); setError('');
    setAdvStatus(`Sending ${formatUnits(ownerUsdc, 6)} USDC to your Velo wallet…`);
    try {
      const data = encodeFunctionData({ abi: TRANSFER_ABI, functionName: 'transfer', args: [burner.veloAddress, ownerUsdc] });
      const hash = await sendTransactionAsync({ to: USDC_BASE_SEPOLIA as `0x${string}`, data, value: 0n });
      setAdvStatus(`Confirming on-chain (${hash.slice(0, 8)}…)`);
      setAdvBusy(false);
    } catch (e: any) {
      setAdvBusy(false); setAdvStatus('');
      setError(e?.shortMessage || e?.message || 'Transfer rejected.');
    }
  };

  // ─── Advanced: on-chain vault deposit from Velo wallet → Orderly ─────────
  const handleVaultDeposit = async () => {
    if (!burner || !keypair) return;
    if (burnerUsdc === 0n) { setError('No USDC in your Velo wallet to deposit.'); return; }
    setAdvBusy(true); setError(''); setAdvStatus('Depositing into Orderly vault…');
    try {
      const before = await getOrderlyBalance(burner.veloAddress, keypair).catch(() => 0);
      const r = await depositFromBurner(burner, burnerUsdc, (s) => setAdvStatus(s));
      if (r.approveTx) setApproveTx(r.approveTx);
      if (r.depositTx) setDepositTx(r.depositTx);
      if (!r.success) {
        setAdvBusy(false); setAdvStatus('');
        setError(r.error || 'Deposit failed.');
        return;
      }
      // Wait for cross-chain settlement (1–3 min on Base Sepolia normally).
      const startedAt = Date.now();
      while (Date.now() - startedAt < 3 * 60 * 1000) {
        await new Promise(r => setTimeout(r, 5000));
        if (cancelledRef.current) return;
        const bal = await getOrderlyBalance(burner.veloAddress, keypair).catch(() => 0);
        if (bal > before) {
          setOrderlyBal(bal);
          setAdvBusy(false); setAdvStatus('');
          setStep('READY');
          onReady(keypair, burner, bal);
          setTimeout(() => { if (!cancelledRef.current) onClose(); }, 2000);
          return;
        }
      }
      setAdvBusy(false);
      setAdvStatus('Deposit submitted. Cross-chain settlement is taking longer than usual — we\'ll keep watching in the background. You can close this modal.');
    } catch (e: any) {
      setAdvBusy(false); setAdvStatus('');
      setError(e?.message || 'Deposit failed.');
    }
  };

  const copy = async (t: string) => {
    try { await navigator.clipboard.writeText(t); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch {}
  };

  if (!isOpen || !ownerAddress) return null;

  // While running setup, the user shouldn't accidentally close during the
  // MetaMask signature step. After that everything is interruptible
  // (cached burner + keypair + retry-safe).
  const inSig = substep === 'sign';
  const canClose = !inSig;
  const handleBackdrop = () => { if (canClose) onClose(); };

  return (
    <>
      <style>{styleString}</style>
      <div onClick={handleBackdrop} className="velo-onb-backdrop" role="dialog" aria-modal="true">
        <div onClick={e => e.stopPropagation()} className="velo-onb-card mode-dark">
          <div className="velo-onb-edge" />
          {canClose && (
            <button onClick={onClose} aria-label="Close" className="velo-onb-close">
              <X size={14} strokeWidth={2.5} />
            </button>
          )}

          <div key={step} className="velo-onb-body">
            {step === 'WELCOME' && (
              <ScreenWelcome
                onBegin={() => { setStep('SETUP'); setTimeout(handleSetupAll, 50); }}
                hasBurner={!!burner}
                hasKey={!!keypair}
              />
            )}

            {step === 'SETUP' && (
              <ScreenSetup
                substep={substep}
                error={error}
                burner={burner}
                ownerUsdc={ownerUsdc}
                burnerUsdc={burnerUsdc}
                showAdvanced={showAdvanced}
                onToggleAdvanced={() => setShowAdvanced(s => !s)}
                advBusy={advBusy}
                advStatus={advStatus}
                copied={copied}
                onCopy={copy}
                onRetry={() => { setError(''); handleSetupAll(); }}
                onSendFromMain={handleSendFromMain}
                onVaultDeposit={handleVaultDeposit}
                approveTx={approveTx}
                depositTx={depositTx}
              />
            )}

            {step === 'READY' && (
              <ScreenReady balance={orderlyBal} />
            )}
          </div>
        </div>
      </div>
    </>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// SCREEN: WELCOME
// ═══════════════════════════════════════════════════════════════════════════════

const ScreenWelcome: React.FC<{ onBegin: () => void; hasBurner: boolean; hasKey: boolean }> = ({ onBegin, hasBurner, hasKey }) => (
  <ScreenShell>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28, paddingTop: 24, paddingBottom: 12 }}>
      <div className="velo-onb-mark">
        <div className="velo-onb-mark-inner">
          <Sparkles size={28} color="#fff" strokeWidth={1.6} />
        </div>
      </div>

      <div style={{ textAlign: 'center', maxWidth: 380 }}>
        <h1 style={{ ...F.display, fontSize: 38, color: 'var(--fg)', margin: 0, marginBottom: 12 }}>
          Welcome to <span className="holo-text">Velo</span>
        </h1>
        <p style={{ ...F.sans, fontSize: 14, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.55 }}>
          {hasBurner && hasKey
            ? 'Your Velo wallet is ready. Tap below to claim 1,000 testnet USDC and start trading instantly.'
            : 'One signature. One tap. 1,000 USDC of testnet liquidity ready to trade in under 30 seconds.'}
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
        <FeatureChip icon={<ShieldCheck size={11} strokeWidth={2.2} />} label="Self-custody" />
        <FeatureChip icon={<Sparkles size={11} strokeWidth={2.2} />} label="Gasless" />
        <FeatureChip icon={<Wallet size={11} strokeWidth={2.2} />} label="No deposit wait" />
      </div>
    </div>

    <div style={{ marginTop: 'auto' }}>
      <PrimaryButton onClick={onBegin}>
        {hasBurner && hasKey ? 'Claim 1,000 USDC' : 'Begin'} <ArrowRight size={16} strokeWidth={2.4} />
      </PrimaryButton>
      <p style={{ ...F.mono, fontSize: 9, color: 'var(--fg-subtle)', textAlign: 'center', margin: '14px 0 0', letterSpacing: '0.14em' }}>
        BASE SEPOLIA · TESTNET
      </p>
    </div>
  </ScreenShell>
);

// ═══════════════════════════════════════════════════════════════════════════════
// SCREEN: SETUP — the runway, with substep progress
// ═══════════════════════════════════════════════════════════════════════════════

const ScreenSetup: React.FC<{
  substep: Substep;
  error: string;
  burner: VeloBurnerWallet | null;
  ownerUsdc: bigint;
  burnerUsdc: bigint;
  showAdvanced: boolean;
  onToggleAdvanced: () => void;
  advBusy: boolean;
  advStatus: string;
  copied: boolean;
  onCopy: (t: string) => void;
  onRetry: () => void;
  onSendFromMain: () => void;
  onVaultDeposit: () => void;
  approveTx?: `0x${string}`;
  depositTx?: `0x${string}`;
}> = ({ substep, error, burner, ownerUsdc, burnerUsdc, showAdvanced, onToggleAdvanced, advBusy, advStatus, copied, onCopy, onRetry, onSendFromMain, onVaultDeposit, approveTx, depositTx }) => {

  const inFlight = substep !== 'idle' && substep !== 'done';
  const errored  = !!error && !inFlight;

  return (
    <ScreenShell>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, paddingTop: 16 }}>
        <div className={errored ? 'velo-onb-ring-err' : 'velo-onb-ring'}>
          <div className="velo-onb-ring-inner">
            {errored
              ? <X size={28} color="#fff" strokeWidth={2} />
              : substep === 'done'
                ? <CheckCircle2 size={32} color="#fff" strokeWidth={2} />
                : <Loader2 size={26} color="#fff" style={{ animation: 'velo-spin 1.1s linear infinite' }} strokeWidth={1.8} />
            }
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <h2 style={{ ...F.display, fontSize: 30, color: 'var(--fg)', margin: 0, marginBottom: 8 }}>
            {errored ? 'Hit a snag' : substep === 'done' ? 'All set' : 'Setting things up'}
          </h2>
          <p style={{ ...F.sans, fontSize: 13, color: 'var(--fg-muted)', margin: 0, maxWidth: 320, lineHeight: 1.5 }}>
            {errored
              ? 'No funds were touched. You can retry safely.'
              : substep === 'done'
                ? '1,000 USDC just landed in your trading account.'
                : SUBSTEP_LABEL[substep] + '…'}
          </p>
        </div>

        {!errored && (
          <div className="velo-onb-rail">
            {SUBSTEP_ORDER.map((s, i) => {
              const currentIdx = SUBSTEP_ORDER.indexOf(substep);
              const done = currentIdx > i || substep === 'done';
              const active = currentIdx === i;
              return (
                <div key={s} className={`velo-onb-rail-step ${done ? 'done' : ''} ${active ? 'active' : ''}`}>
                  <div className="velo-onb-rail-dot">
                    {done ? <Check size={9} strokeWidth={3} /> : active ? <Loader2 size={9} style={{ animation: 'velo-spin 1.2s linear infinite' }} /> : i + 1}
                  </div>
                  <div className="velo-onb-rail-label">{SUBSTEP_LABEL[s]}</div>
                </div>
              );
            })}
          </div>
        )}

        {errored && (
          <div style={{ width: '100%' }}>
            <div className="velo-onb-error">{error}</div>
            <PrimaryButton onClick={onRetry}>Try again</PrimaryButton>
          </div>
        )}
      </div>

      {!inFlight && (
        <div style={{ marginTop: 'auto', paddingTop: 18 }}>
          <button onClick={onToggleAdvanced} className="velo-onb-adv-toggle">
            ADVANCED <ChevronDown size={11} style={{ transform: showAdvanced ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }} />
          </button>

          {showAdvanced && burner && (
            <div className="velo-onb-adv-panel">
              <div className="velo-onb-adv-row">
                <div>
                  <div style={{ ...F.mono, fontSize: 9, color: 'var(--fg-subtle)', letterSpacing: '0.1em', fontWeight: 700 }}>VELO WALLET</div>
                  <div style={{ ...F.mono, fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>{short(burner.veloAddress)}</div>
                </div>
                <button onClick={() => onCopy(burner.veloAddress)} className="velo-onb-copy" title="Copy address">
                  {copied ? <Check size={11} strokeWidth={2.5} /> : <Copy size={11} strokeWidth={2.2} />}
                </button>
              </div>

              {ownerUsdc > 0n && (
                <SecondaryButton onClick={onSendFromMain} disabled={advBusy}>
                  Send {formatUnits(ownerUsdc, 6)} USDC from main wallet
                </SecondaryButton>
              )}

              {burnerUsdc > 0n && (
                <SecondaryButton onClick={onVaultDeposit} disabled={advBusy}>
                  Deposit {formatUnits(burnerUsdc, 6)} USDC on-chain (1–3 min)
                </SecondaryButton>
              )}

              {advStatus && <div className="velo-onb-status">{advStatus}</div>}

              {(approveTx || depositTx) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                  {approveTx && <TxLink label="Approve" hash={approveTx} />}
                  {depositTx && <TxLink label="Deposit" hash={depositTx} />}
                </div>
              )}

              <p style={{ ...F.sans, fontSize: 10.5, color: 'var(--fg-subtle)', textAlign: 'center', margin: '6px 0 0', lineHeight: 1.5 }}>
                The advanced path uses LayerZero cross-chain settlement and takes 1–3 minutes.
              </p>
            </div>
          )}
        </div>
      )}
    </ScreenShell>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// SCREEN: READY
// ═══════════════════════════════════════════════════════════════════════════════

const ScreenReady: React.FC<{ balance: number }> = ({ balance }) => (
  <ScreenShell>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28, paddingTop: 28, animation: 'velo-fade-up 540ms cubic-bezier(0.22, 1, 0.36, 1) both' }}>
      <div className="velo-onb-check">
        <CheckCircle2 size={42} color="#fff" strokeWidth={2.2} />
      </div>

      <div style={{ textAlign: 'center' }}>
        <div style={{ ...F.mono, fontSize: 10, color: 'var(--fg-subtle)', letterSpacing: '0.18em', fontWeight: 700, marginBottom: 12 }}>READY TO TRADE</div>
        <div style={{ ...F.display, fontSize: 56, color: 'var(--fg)', lineHeight: 1, fontFeatureSettings: '"tnum" 1' }}>
          ${balance.toFixed(2)}
        </div>
        <div style={{ ...F.sans, fontSize: 13, color: 'var(--fg-muted)', margin: '12px 0 0', maxWidth: 280, lineHeight: 1.5 }}>
          Live on your Orderly trading account. Closing automatically.
        </div>
      </div>
    </div>
  </ScreenShell>
);

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED PRIMITIVES
// ═══════════════════════════════════════════════════════════════════════════════

const ScreenShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ minHeight: 460, padding: '36px 32px 28px', display: 'flex', flexDirection: 'column' }}>
    {children}
  </div>
);

const PrimaryButton: React.FC<{ onClick: () => void; children: React.ReactNode; disabled?: boolean }> = ({ onClick, children, disabled }) => (
  <button onClick={onClick} disabled={disabled} className={`velo-onb-btn-primary ${disabled ? 'is-disabled' : ''}`}>
    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>{children}</span>
  </button>
);

const SecondaryButton: React.FC<{ onClick: () => void; children: React.ReactNode; disabled?: boolean }> = ({ onClick, children, disabled }) => (
  <button onClick={onClick} disabled={disabled} className={`velo-onb-btn-secondary ${disabled ? 'is-disabled' : ''}`}>
    {children}
  </button>
);

const FeatureChip: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
  <div className="velo-onb-chip">{icon}<span>{label}</span></div>
);

const TxLink: React.FC<{ label: string; hash: `0x${string}` }> = ({ label, hash }) => (
  <a href={`https://sepolia.basescan.org/tx/${hash}`} target="_blank" rel="noreferrer noopener" className="velo-onb-txlink">
    <span style={{ letterSpacing: '0.1em' }}>{label.toUpperCase()}</span>
    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>{hash.slice(0, 8)}…{hash.slice(-6)} <ExternalLink size={10} /></span>
  </a>
);

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════

const styleString = `
@keyframes velo-spin { to { transform: rotate(360deg); } }
@keyframes velo-fade-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@keyframes velo-pulse-ring { 0% { box-shadow: 0 0 0 0 oklch(0.68 0.22 295 / 0.45); } 100% { box-shadow: 0 0 0 22px oklch(0.68 0.22 295 / 0); } }
@keyframes velo-aurora-rotate { from { transform: translate(-50%, -50%) rotate(0deg); } to { transform: translate(-50%, -50%) rotate(360deg); } }
@keyframes velo-check-pop { 0% { transform: scale(0.4); opacity: 0; } 60% { transform: scale(1.2); opacity: 1; } 100% { transform: scale(1); } }
@keyframes velo-holo-shift { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }

.velo-onb-backdrop {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(20px) saturate(140%);
  -webkit-backdrop-filter: blur(20px) saturate(140%);
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
  animation: velo-fade-up 220ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.velo-onb-card {
  position: relative;
  width: 100%; max-width: 460px;
  background: oklch(0.10 0.005 280);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 24px;
  overflow: hidden;
  box-shadow:
    0 30px 90px rgba(0, 0, 0, 0.6),
    0 0 0 1px rgba(255, 255, 255, 0.04) inset;
  font-family: var(--font-sans);
}

.velo-onb-card::before {
  content: '';
  position: absolute; inset: -50%;
  background:
    radial-gradient(40% 40% at 30% 30%, oklch(0.68 0.22 295 / 0.18) 0%, transparent 70%),
    radial-gradient(35% 35% at 70% 70%, oklch(0.80 0.14 205 / 0.14) 0%, transparent 70%),
    radial-gradient(30% 30% at 50% 80%, oklch(0.74 0.18 30 / 0.10) 0%, transparent 70%);
  filter: blur(40px);
  animation: velo-aurora-rotate 22s linear infinite;
  pointer-events: none;
  z-index: 0;
}

.velo-onb-edge {
  height: 2px;
  background: linear-gradient(100deg,
    oklch(0.68 0.22 295) 0%,
    oklch(0.70 0.22 340) 22%,
    oklch(0.74 0.18 30) 42%,
    oklch(0.82 0.16 75) 58%,
    oklch(0.84 0.18 130) 74%,
    oklch(0.80 0.14 205) 90%,
    oklch(0.68 0.18 250) 100%);
  background-size: 200% 100%;
  animation: velo-holo-shift 9s linear infinite;
  opacity: 0.85;
  position: relative; z-index: 1;
}

.velo-onb-close {
  position: absolute; top: 18px; right: 18px; z-index: 2;
  width: 32px; height: 32px; border-radius: 16px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.55); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 160ms;
}
.velo-onb-close:hover { background: rgba(255,255,255,0.1); color: #fff; }

.velo-onb-body {
  position: relative; z-index: 1;
  animation: velo-fade-up 320ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.velo-onb-mark {
  width: 92px; height: 92px; border-radius: 28px;
  background: linear-gradient(100deg,
    oklch(0.68 0.22 295) 0%,
    oklch(0.70 0.22 340) 22%,
    oklch(0.74 0.18 30) 42%,
    oklch(0.82 0.16 75) 58%,
    oklch(0.84 0.18 130) 74%,
    oklch(0.80 0.14 205) 90%,
    oklch(0.68 0.18 250) 100%);
  background-size: 200% 100%;
  animation: velo-holo-shift 9s linear infinite, velo-pulse-ring 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 24px 60px oklch(0.68 0.22 295 / 0.45);
}
.velo-onb-mark-inner {
  width: 84px; height: 84px; border-radius: 24px;
  background: rgba(0, 0, 0, 0.35);
  display: flex; align-items: center; justify-content: center;
  backdrop-filter: blur(8px);
}

.velo-onb-ring, .velo-onb-ring-err {
  width: 78px; height: 78px; border-radius: 22px;
  display: flex; align-items: center; justify-content: center;
}
.velo-onb-ring {
  background: linear-gradient(135deg, oklch(0.68 0.22 295), oklch(0.80 0.14 205));
  animation: velo-pulse-ring 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  box-shadow: 0 16px 40px oklch(0.68 0.22 295 / 0.4);
}
.velo-onb-ring-err {
  background: linear-gradient(135deg, oklch(0.66 0.22 25), oklch(0.66 0.22 25 / 0.6));
  box-shadow: 0 16px 40px oklch(0.66 0.22 25 / 0.4);
}
.velo-onb-ring-inner { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }

.velo-onb-check {
  width: 96px; height: 96px; border-radius: 28px;
  background: linear-gradient(135deg, oklch(0.78 0.18 150), oklch(0.78 0.18 150 / 0.7));
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 20px 50px oklch(0.78 0.18 150 / 0.5);
  animation: velo-check-pop 540ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

.velo-onb-rail {
  width: 100%;
  display: flex; flex-direction: column; gap: 6px;
  background: rgba(255,255,255,0.025);
  border: 1px solid rgba(255,255,255,0.05);
  border-radius: 14px;
  padding: 14px 16px;
}
.velo-onb-rail-step {
  display: flex; align-items: center; gap: 12px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: rgba(255,255,255,0.34);
  transition: color 240ms;
}
.velo-onb-rail-step.active { color: rgba(255,255,255,0.88); }
.velo-onb-rail-step.done   { color: oklch(0.78 0.18 150); }
.velo-onb-rail-dot {
  width: 18px; height: 18px; border-radius: 9px;
  background: rgba(255,255,255,0.05);
  display: flex; align-items: center; justify-content: center;
  font-size: 9px; font-weight: 700;
  flex-shrink: 0;
  transition: all 240ms;
}
.velo-onb-rail-step.active .velo-onb-rail-dot { background: oklch(0.68 0.22 295); color: #fff; box-shadow: 0 0 0 4px oklch(0.68 0.22 295 / 0.18); }
.velo-onb-rail-step.done   .velo-onb-rail-dot { background: oklch(0.78 0.18 150); color: #fff; }
.velo-onb-rail-label { letter-spacing: 0.04em; font-weight: 500; }

.velo-onb-error {
  width: 100%;
  background: oklch(0.66 0.22 25 / 0.1);
  border: 1px solid oklch(0.66 0.22 25 / 0.3);
  color: oklch(0.85 0.18 25);
  border-radius: 12px;
  padding: 12px 14px;
  font-family: var(--font-sans);
  font-size: 12.5px;
  line-height: 1.5;
  margin-bottom: 14px;
}

.velo-onb-btn-primary {
  width: 100%;
  padding: 17px 22px;
  border-radius: 16px;
  background: linear-gradient(100deg,
    oklch(0.68 0.22 295) 0%,
    oklch(0.70 0.22 340) 22%,
    oklch(0.74 0.18 30) 42%,
    oklch(0.82 0.16 75) 58%,
    oklch(0.84 0.18 130) 74%,
    oklch(0.80 0.14 205) 90%,
    oklch(0.68 0.18 250) 100%);
  background-size: 200% 100%;
  animation: velo-holo-shift 9s linear infinite;
  color: #fff;
  border: none;
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  box-shadow: 0 14px 40px oklch(0.68 0.22 295 / 0.45);
  transition: transform 140ms, box-shadow 140ms;
}
.velo-onb-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 18px 48px oklch(0.68 0.22 295 / 0.6); }
.velo-onb-btn-primary:active { transform: translateY(0); }
.velo-onb-btn-primary.is-disabled { opacity: 0.45; cursor: wait; transform: none; box-shadow: none; }

.velo-onb-btn-secondary {
  width: 100%;
  padding: 13px 18px;
  border-radius: 12px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.1);
  color: var(--fg, #f4f4f7);
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: -0.005em;
  transition: all 140ms;
  margin-top: 8px;
}
.velo-onb-btn-secondary:hover { background: rgba(255,255,255,0.07); border-color: rgba(255,255,255,0.16); }
.velo-onb-btn-secondary.is-disabled { opacity: 0.4; cursor: wait; }

.velo-onb-chip {
  display: flex; align-items: center; gap: 5px;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.06);
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: rgba(255,255,255,0.7);
  text-transform: uppercase;
}

.velo-onb-adv-toggle {
  width: 100%;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 10px;
  display: flex; align-items: center; justify-content: center; gap: 6px;
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.14em;
  color: rgba(255,255,255,0.4);
  transition: color 140ms;
}
.velo-onb-adv-toggle:hover { color: rgba(255,255,255,0.7); }

.velo-onb-adv-panel {
  background: rgba(255,255,255,0.025);
  border: 1px solid rgba(255,255,255,0.05);
  border-radius: 14px;
  padding: 14px;
  display: flex; flex-direction: column; gap: 8px;
  margin-top: 4px;
}

.velo-onb-adv-row {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding-bottom: 4px;
}

.velo-onb-copy {
  width: 28px; height: 28px; border-radius: 8px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.6);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 140ms;
}
.velo-onb-copy:hover { background: rgba(255,255,255,0.1); color: #fff; }

.velo-onb-status {
  font-family: var(--font-sans);
  font-size: 11.5px;
  color: rgba(255,255,255,0.55);
  text-align: center;
  padding: 4px 0;
}

.velo-onb-txlink {
  display: flex; align-items: center; justify-content: space-between;
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: rgba(255,255,255,0.55);
  text-decoration: none;
  padding: 6px 8px;
  border-radius: 8px;
  background: rgba(255,255,255,0.02);
  transition: color 140ms, background 140ms;
}
.velo-onb-txlink:hover { color: oklch(0.68 0.22 295); background: rgba(255,255,255,0.05); }
`;

export default OrderlyOnboardingModal;
