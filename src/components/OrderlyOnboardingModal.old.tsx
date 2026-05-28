// ═══════════════════════════════════════════════════════════════════════════════
// VELO ONBOARDING — burner-wallet edition (dYdX/Hyperliquid style)
//
// Flow:
//   1. CREATE   — user signs ONE message → derives Velo trading wallet
//   2. USDC     — faucet / transfer USDC into Velo wallet
//   3. ACTIVATE — Velo wallet registers on Orderly + binds trading key (no MM popups)
//   4. DEPOSIT  — Velo wallet approve + deposit into vault (no MM popups)
//   5. DONE     — polling Orderly balance; auto-closes when balance arrives
//
// Dismiss behaviour:
//   - Steps CREATE / FUND_USDC / ACTIVATE / DEPOSIT → backdrop click is BLOCKED
//     (X button shows a "are you sure?" state but does not lose progress)
//   - Step DONE → backdrop / X closes normally (state is persisted anyway)
// ═══════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  useAccount, useSignMessage, useBalance, useReadContract, useSendTransaction,
  useChainId,
} from 'wagmi';
import { parseUnits, formatUnits, parseEther } from 'viem';
import {
  CheckCircle, AlertCircle, Loader2, X, Zap, Wallet, Copy, Check,
  Shield, ExternalLink, ArrowRight, ShieldCheck, KeyRound, ArrowDownLeft,
  AlertTriangle,
} from 'lucide-react';
import {
  getOrCreateVeloBurner, loadStoredBurner, clearBurner,
  shortAddr, type VeloBurnerWallet,
} from '../services/veloBurnerWallet';
import {
  registerOrderlyKeyWithBurner, depositFromBurner, getBurnerBalances,
} from '../services/burnerOrderly';
import {
  getOrderlyBalance, getStoredKeypair, getAccountId, type OrderlyKeypair,
  USDC_BASE_SEPOLIA, ETH_FAUCETS, ORDERLY_VAULT_ADDRESS,
} from '../services/orderlyService';

const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const;

type Step = 'CREATE' | 'FUND_USDC' | 'ACTIVATE' | 'DEPOSIT' | 'DONE';
const STEPS: { id: Step; label: string }[] = [
  { id: 'CREATE',    label: 'Create'   },
  { id: 'FUND_USDC', label: 'USDC'     },
  { id: 'ACTIVATE',  label: 'Activate' },
  { id: 'DEPOSIT',   label: 'Deposit'  },
  { id: 'DONE',      label: 'Trade'    },
];

// How much ETH the burner needs to sign txs
const MIN_ETH_BURNER    = parseEther('0.0008');
// How much ETH triggers a gas top-up (more conservative threshold)
const GAS_TOPUP_THRESHOLD = parseEther('0.0005');
const MIN_USDC_TO_TRADE = 5_000_000n; // 5 USDC (6 decimals)

// How long to wait for Orderly balance before showing "proceed anyway" option
const ORDERLY_POLL_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

interface Props {
  isOpen:  boolean;
  onClose: () => void;
  onReady: (kp: OrderlyKeypair, burner: VeloBurnerWallet, bal: number) => void;
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const C = {
  mono:       { fontFamily: 'var(--font-mono)' } as React.CSSProperties,
  display:    { fontFamily: 'var(--font-display)', fontStyle: 'italic' as const, letterSpacing: '-0.02em' } as React.CSSProperties,
  body:       { fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-muted)', lineHeight: 1.65, margin: 0 } as React.CSSProperties,
  label:      { fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)' } as React.CSSProperties,
  card:       { background: 'oklch(1 0 0/0.03)', border: '1px solid oklch(1 0 0/0.08)', borderRadius: 12 } as React.CSSProperties,
  cardViolet: { background: 'oklch(0.68 0.22 295/0.06)', border: '1px solid oklch(0.68 0.22 295/0.25)', borderRadius: 12 } as React.CSSProperties,
  cardGreen:  { background: 'oklch(0.78 0.18 150/0.06)', border: '1px solid oklch(0.78 0.18 150/0.25)', borderRadius: 12 } as React.CSSProperties,
  cardAmber:  { background: 'oklch(0.78 0.18 80/0.06)', border: '1px solid oklch(0.78 0.18 80/0.25)', borderRadius: 12 } as React.CSSProperties,
};

const btnPrimary = (disabled?: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  width: '100%', padding: '14px', borderRadius: 12, border: 'none',
  background: disabled ? 'oklch(1 0 0/0.04)' : 'var(--iris-violet)',
  color: disabled ? 'var(--fg-subtle)' : '#0B0B0E',
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
  letterSpacing: '0.07em', textTransform: 'uppercase', opacity: disabled ? 0.5 : 1,
});
const btnGhost = (): React.CSSProperties => ({
  ...btnPrimary(), background: 'transparent', border: '1px solid oklch(1 0 0/0.08)',
  color: 'var(--fg-subtle)', padding: '10px',
});
const btnDanger = (): React.CSSProperties => ({
  ...btnPrimary(), background: 'oklch(0.66 0.22 25/0.15)',
  border: '1px solid oklch(0.66 0.22 25/0.3)', color: 'var(--pnl-down)',
});

// ─── Small UI atoms ──────────────────────────────────────────────────────────
const Err = ({ msg }: { msg: string }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: 'oklch(0.66 0.22 25/0.08)', border: '1px solid oklch(0.66 0.22 25/0.25)', borderRadius: 10 }}>
    <AlertCircle size={14} style={{ color: 'var(--pnl-down)', flexShrink: 0, marginTop: 1 }} />
    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.5 }}>{msg}</span>
  </div>
);
const Info = ({ msg }: { msg: string }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: 'oklch(0.68 0.22 295/0.06)', border: '1px solid oklch(0.68 0.22 295/0.2)', borderRadius: 10 }}>
    <Loader2 size={14} style={{ color: 'var(--iris-violet)', flexShrink: 0, marginTop: 1, animation: 'spin 1s linear infinite' }} />
    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.5 }}>{msg}</span>
  </div>
);
const Ok = ({ msg }: { msg: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', ...C.cardGreen }}>
    <CheckCircle size={14} style={{ color: 'var(--pnl-up)', flexShrink: 0 }} />
    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--fg-muted)' }}>{msg}</span>
  </div>
);
const TxLink = ({ hash, label }: { hash: string; label?: string }) => (
  <a href={`https://sepolia.basescan.org/tx/${hash}`} target="_blank" rel="noopener noreferrer"
    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--iris-violet)', textDecoration: 'none', fontWeight: 700 }}>
    <ExternalLink size={11} /> {label || `${hash.slice(0, 8)}…${hash.slice(-6)}`}
  </a>
);

// ─── Gas sponsor helper — only calls API if below threshold ──────────────────
async function maybeTopUpGas(burnerAddress: string, currentEth: bigint): Promise<void> {
  if (currentEth >= GAS_TOPUP_THRESHOLD) return; // already has enough, skip API call
  try {
    await fetch('/api/gas-sponsor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ burner_address: burnerAddress }),
    });
  } catch {
    // non-fatal
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const OrderlyOnboardingModal: React.FC<Props> = ({ isOpen, onClose, onReady }) => {
  const { address: ownerAddress } = useAccount();
  const { signMessageAsync }      = useSignMessage();
  const chainId                   = useChainId();

  const [step,       setStep]       = useState<Step>('CREATE');
  const [busy,       setBusy]       = useState(false);
  const [error,      setError]      = useState('');
  const [status,     setStatus]     = useState('');
  const [confirmClose, setConfirmClose] = useState(false); // "are you sure?" state

  const [burner,     setBurner]     = useState<VeloBurnerWallet | null>(null);
  const [keypair,    setKeypair]    = useState<OrderlyKeypair | null>(null);
  const [orderlyBal, setOrderlyBal] = useState(0);
  const [copied,     setCopied]     = useState(false);

  const [burnerEth,  setBurnerEth]  = useState<bigint>(0n);
  const [burnerUsdc, setBurnerUsdc] = useState<bigint>(0n);
  const [approveTx,  setApproveTx]  = useState<`0x${string}` | undefined>();
  const [depositTx,  setDepositTx]  = useState<`0x${string}` | undefined>();

  // For detecting Orderly poll timeout
  const doneStartedAt = useRef<number>(0);
  const [orderlyTimedOut, setOrderlyTimedOut] = useState(false);

  // Owner wallet balances
  const { data: ownerEthData }  = useBalance({ address: ownerAddress, query: { enabled: !!ownerAddress, refetchInterval: 6000 } });
  const { data: ownerUsdcData } = useReadContract({
    address: USDC_BASE_SEPOLIA as `0x${string}`, abi: ERC20_ABI, functionName: 'balanceOf',
    args: ownerAddress ? [ownerAddress as `0x${string}`] : undefined,
    query: { enabled: !!ownerAddress, refetchInterval: 6000 },
  });
  const ownerEth  = ownerEthData ? ownerEthData.value : 0n;
  const ownerUsdc = ownerUsdcData ? (ownerUsdcData as bigint) : 0n;

  const { sendTransactionAsync } = useSendTransaction();

  // ── Init: load stored burner on open, resume at the correct step ────────────
  useEffect(() => {
    if (!isOpen || !ownerAddress) return;
    setError(''); setStatus(''); setBusy(false); setConfirmClose(false);
    setApproveTx(undefined); setDepositTx(undefined); setOrderlyTimedOut(false);

    const cached = loadStoredBurner(ownerAddress);
    if (cached) {
      setBurner(cached);
      // If a keypair is already stored, skip CREATE/USDC/ACTIVATE entirely.
      const storedKp = getStoredKeypair(cached.veloAddress);
      if (storedKp) {
        setKeypair(storedKp);
        setStep('DEPOSIT');
      } else {
        setStep('FUND_USDC');
      }
    } else {
      setBurner(null);
      setStep('CREATE');
    }
  }, [isOpen, ownerAddress]);

  // ── Refresh burner on-chain balances every 5s ────────────────────────────────
  useEffect(() => {
    if (!burner || !isOpen) return;
    let cancelled = false;
    const refresh = async () => {
      const { eth, usdc } = await getBurnerBalances(burner);
      if (!cancelled) { setBurnerEth(eth); setBurnerUsdc(usdc); }
    };
    refresh();
    const id = setInterval(refresh, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [burner, isOpen]);

  // ── Auto-advance FUND_USDC → ACTIVATE when burner has enough USDC ────────────
  useEffect(() => {
    if (step === 'FUND_USDC' && burnerUsdc >= MIN_USDC_TO_TRADE) setStep('ACTIVATE');
  }, [step, burnerUsdc]);

  // ── Poll Orderly balance while in DONE step ───────────────────────────────────
  useEffect(() => {
    if (step !== 'DONE' || !burner || !keypair) return;
    doneStartedAt.current = Date.now();
    let cancelled = false;

    const tick = async () => {
      // Check for timeout — show escape hatch after 3 minutes
      if (Date.now() - doneStartedAt.current > ORDERLY_POLL_TIMEOUT_MS) {
        if (!cancelled) setOrderlyTimedOut(true);
      }

      try {
        const bal = await getOrderlyBalance(burner.veloAddress, keypair);
        if (!cancelled) {
          setOrderlyBal(bal);
          if (bal > 0) {
            onReady(keypair, burner, bal);
            // Auto-close after a short celebration pause
            setTimeout(() => { if (!cancelled) onClose(); }, 2000);
          }
        }
      } catch {
        // silently retry
      }
    };

    tick();
    const id = setInterval(tick, 6000);
    return () => { cancelled = true; clearInterval(id); };
  }, [step, burner, keypair]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen || !ownerAddress) return null;

  const stepIdx      = STEPS.findIndex(s => s.id === step);
  const burnerEthNum = parseFloat(formatUnits(burnerEth, 18));
  const burnerUsdcNum = parseFloat(formatUnits(burnerUsdc, 6));
  const isDone       = step === 'DONE';

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  // ── Close guard: block dismissal mid-flow ─────────────────────────────────
  const handleCloseRequest = () => {
    if (isDone) { onClose(); return; }
    if (busy) return; // never close while a tx is in-flight
    setConfirmClose(v => !v);
  };

  const handleBackdropClick = () => {
    if (isDone) { onClose(); return; }
    if (busy) return;
    setConfirmClose(true); // tap outside = show warning, don't close
  };

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    setBusy(true); setError(''); setConfirmClose(false);
    setStatus('Sign the message in your wallet to create your Velo Trading Wallet…');
    try {
      const b = await getOrCreateVeloBurner(ownerAddress as `0x${string}`, signMessageAsync as any);
      setBurner(b);

      // Only request gas if burner doesn't already have enough
      const { eth: freshEth } = await getBurnerBalances(b);
      setBurnerEth(freshEth);

      if (freshEth < GAS_TOPUP_THRESHOLD) {
        setStatus('Requesting gas for your Velo wallet…');
        try {
          const gasRes = await fetch('/api/gas-sponsor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ burner_address: b.veloAddress }),
          });
          const gasJson = await gasRes.json();
          console.log('[gas-sponsor]', gasJson);

          if (gasJson?.sponsored) {
            setStatus(`Gas sent (${gasJson.amount_eth} ETH) — waiting for confirmation…`);
            for (let i = 0; i < 5; i++) {
              await new Promise(ok => setTimeout(ok, 3000));
              const { eth } = await getBurnerBalances(b);
              if (eth > 0n) { setBurnerEth(eth); break; }
            }
          }
          // skipped = already funded, no action needed
        } catch (gasErr) {
          console.error('[gas-sponsor]', gasErr); // non-fatal
        }
      }

      setStatus(''); setBusy(false);
      setStep('FUND_USDC');
    } catch (e: any) {
      setStatus(''); setBusy(false);
      setError(e?.message || 'Failed to derive Velo wallet');
    }
  };

  const handleFaucetUsdc = async () => {
    if (!burner) return;
    setBusy(true); setError(''); setStatus('Requesting testnet USDC from Velo sponsor wallet…');
    try {
      const r = await fetch('/api/usdc-sponsor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ burner_address: burner.veloAddress }),
      });
      const res = await r.json();

      if (res.cooldown) {
        setBusy(false); setStatus('');
        setError(res.message);
        return;
      }
      if (res.setup_required) {
        setBusy(false); setStatus('');
        setError('Velo faucet not yet configured. Use Circle faucet below or transfer USDC from your main wallet.');
        return;
      }
      if (!res.success) {
        setBusy(false); setStatus('');
        setError(res.message || 'Faucet unavailable. Try Circle faucet or send USDC from your main wallet.');
        return;
      }

      setStatus(`${res.totalUsdc} USDC sent (tx: ${res.txHash?.slice(0, 10)}…) — confirming on-chain…`);
      const baseline = burnerUsdc;
      for (let i = 0; i < 24; i++) { // up to 72s
        await new Promise(ok => setTimeout(ok, 3000));
        const { usdc } = await getBurnerBalances(burner);
        setBurnerUsdc(usdc);
        if (usdc > baseline) { break; }
      }
      setBusy(false); setStatus('');
    } catch (e: any) {
      setStatus(''); setBusy(false);
      setError(e?.message || 'Faucet request failed');
    }
  };

  const handleSendUsdcFromOwner = async () => {
    if (!burner) return;
    if (ownerUsdc === 0n) { setError('Your main wallet has no USDC.'); return; }
    setBusy(true); setError('');
    const amount = ownerUsdc;
    setStatus(`Sending ${formatUnits(amount, 6)} USDC to your Velo wallet…`);
    try {
      const TRANSFER_ABI = [
        { name: 'transfer', type: 'function', stateMutability: 'nonpayable',
          inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
          outputs: [{ type: 'bool' }] },
      ] as const;
      const { encodeFunctionData } = await import('viem');
      const data = encodeFunctionData({ abi: TRANSFER_ABI, functionName: 'transfer', args: [burner.veloAddress, amount] });
      const hash = await sendTransactionAsync({ to: USDC_BASE_SEPOLIA as `0x${string}`, data, value: 0n });
      setStatus(`Transfer sent (${hash.slice(0, 10)}…) — waiting for confirmation…`);
      // The 5s balance poll will pick it up
      setBusy(false);
    } catch (e: any) {
      setStatus(''); setBusy(false);
      setError(e?.shortMessage || e?.message || 'Transfer rejected');
    }
  };

  const handleActivate = async () => {
    if (!burner) return;
    setBusy(true); setError(''); setStatus('Activating Velo wallet on Orderly (signed locally — no popups)…');
    try {
      // Top up gas only if needed
      await maybeTopUpGas(burner.veloAddress, burnerEth);

      const r = await registerOrderlyKeyWithBurner(burner);
      if (!r.success || !r.keypair) {
        setBusy(false); setStatus('');
        setError(r.error || 'Activation failed');
        return;
      }
      setKeypair(r.keypair);
      setStatus(''); setBusy(false);
      setStep('DEPOSIT');
    } catch (e: any) {
      setStatus(''); setBusy(false); setError(e?.message || 'Activation failed');
    }
  };

  const handleDeposit = async () => {
    if (!burner) return;
    if (burnerUsdc === 0n) { setError('No USDC in Velo wallet.'); return; }
    setBusy(true); setError('');

    // Check gas — top up only if actually low
    const { eth: freshEth } = await getBurnerBalances(burner);
    setBurnerEth(freshEth);

    if (freshEth < MIN_ETH_BURNER) {
      setStatus('Topping up Velo wallet gas…');
      try {
        await fetch('/api/gas-sponsor', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ burner_address: burner.veloAddress }),
        });
        // Wait for ETH to arrive (up to 20s)
        for (let i = 0; i < 8; i++) {
          await new Promise(ok => setTimeout(ok, 2500));
          const { eth } = await getBurnerBalances(burner);
          setBurnerEth(eth);
          if (eth >= MIN_ETH_BURNER) break;
        }
        const { eth: ethAfter } = await getBurnerBalances(burner);
        setBurnerEth(ethAfter);
        if (ethAfter < MIN_ETH_BURNER) {
          setBusy(false); setStatus('');
          setError(`Velo wallet needs ETH for gas (has ${(Number(ethAfter)/1e18).toFixed(6)} ETH). Gas sponsor may be empty. Send Base Sepolia ETH to: ${burner.veloAddress}`);
          return;
        }
      } catch { /* depositFromBurner will give a clear error if gas is still missing */ }
    }

    setStatus('Submitting deposit (signed locally by Velo wallet)…');
    try {
      const r = await depositFromBurner(burner, burnerUsdc, (s) => setStatus(s));
      if (r.approveTx) setApproveTx(r.approveTx);
      if (r.depositTx) setDepositTx(r.depositTx);
      if (!r.success) {
        setBusy(false); setStatus('');
        setError(r.error || 'Deposit failed');
        return;
      }
      setStatus(''); setBusy(false);
      setStep('DONE');
    } catch (e: any) {
      setStatus(''); setBusy(false); setError(e?.message || 'Deposit failed');
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      onClick={handleBackdropClick}
      style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(7,7,10,0.88)', backdropFilter: 'blur(24px)' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 480, background: 'var(--glass-bg-strong)', border: '1px solid var(--hairline-strong)', borderRadius: 22, overflow: 'hidden', boxShadow: 'var(--glass-shadow)', backdropFilter: 'blur(40px)', maxHeight: '92vh', overflowY: 'auto' }}
      >
        <div style={{ height: 3, background: 'var(--holo-linear)', backgroundSize: '220% 100%', animation: 'holoSlide 9s linear infinite' }} />

        {/* ── Confirm-close overlay (shows when user tries to dismiss mid-flow) */}
        {confirmClose && !isDone && (
          <div style={{ padding: '14px 22px', background: 'oklch(0.66 0.22 25/0.08)', borderBottom: '1px solid oklch(0.66 0.22 25/0.2)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertTriangle size={14} style={{ color: 'var(--pnl-down)', flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--fg-muted)', flex: 1, lineHeight: 1.4 }}>
              Your Velo wallet is saved — you can resume where you left off. Close anyway?
            </span>
            <button onClick={() => setConfirmClose(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--iris-violet)', fontWeight: 700 }}>Keep going</button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--pnl-down)', fontWeight: 700 }}>Close</button>
          </div>
        )}

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '20px 22px 0' }}>
          <div>
            <h2 style={{ ...C.display, fontSize: 24, color: 'var(--fg)', margin: 0 }}>
              {step === 'DONE' ? (orderlyBal > 0 ? "You're live." : 'Almost there…') : step === 'CREATE' ? 'Create Velo Wallet' : 'Activate Trading'}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--pnl-up)', boxShadow: '0 0 6px var(--pnl-up)' }} />
              <span style={{ ...C.mono, fontSize: 9, color: 'var(--fg-subtle)', letterSpacing: '0.09em', textTransform: 'uppercase' }}>
                Base Sepolia · Orderly · Testnet
              </span>
            </div>
          </div>
          <button
            onClick={handleCloseRequest}
            title={isDone ? 'Close' : 'Close (progress is saved)'}
            style={{ background: 'none', border: 'none', cursor: busy ? 'not-allowed' : 'pointer', color: busy ? 'var(--fg-subtle)' : 'var(--fg-subtle)', padding: 4, opacity: busy ? 0.3 : 1 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Stepper */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px 14px', borderBottom: '1px solid var(--hairline)', gap: 0 }}>
          {STEPS.map((s, i) => {
            const done = i < stepIdx; const active = i === stepIdx;
            return (
              <React.Fragment key={s.id}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: done ? 'var(--pnl-up)' : active ? 'var(--iris-violet)' : 'oklch(1 0 0/0.04)',
                    border: done ? 'none' : active ? 'none' : '1px solid oklch(1 0 0/0.10)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: done ? '0 0 8px oklch(0.78 0.18 150/0.4)' : active ? '0 0 8px oklch(0.68 0.22 295/0.4)' : 'none',
                  }}>
                    {done ? <Check size={12} style={{ color: '#0B0B0E' }} /> :
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: active ? '#0B0B0E' : 'var(--fg-subtle)' }}>{i + 1}</span>}
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: active ? 'var(--iris-violet)' : done ? 'var(--pnl-up)' : 'var(--fg-subtle)' }}>{s.label}</span>
                </div>
                {i < STEPS.length - 1 && <div style={{ width: 12, height: 1, background: i < stepIdx ? 'var(--pnl-up)' : 'oklch(1 0 0/0.06)', alignSelf: 'flex-start', marginTop: 11 }} />}
              </React.Fragment>
            );
          })}
        </div>

        <div style={{ padding: '18px 22px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Wallet panels — always visible after burner created */}
          {burner && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={{ ...C.card, padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                  <Wallet size={9} style={{ color: 'var(--fg-subtle)' }} />
                  <span style={C.label}>Main Wallet</span>
                </div>
                <div style={{ ...C.mono, fontSize: 10, color: 'var(--fg-muted)' }}>{shortAddr(ownerAddress)}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                  <span style={{ ...C.mono, fontSize: 9, color: 'var(--fg-subtle)' }}>ETH</span>
                  <span style={{ ...C.mono, fontSize: 10, color: 'var(--fg)', fontWeight: 700 }}>{parseFloat(formatUnits(ownerEth, 18)).toFixed(4)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ ...C.mono, fontSize: 9, color: 'var(--fg-subtle)' }}>USDC</span>
                  <span style={{ ...C.mono, fontSize: 10, color: 'var(--fg)', fontWeight: 700 }}>{parseFloat(formatUnits(ownerUsdc, 6)).toFixed(2)}</span>
                </div>
              </div>
              <div style={{ ...C.cardViolet, padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <ShieldCheck size={9} style={{ color: 'var(--iris-violet)' }} />
                    <span style={{ ...C.label, color: 'var(--iris-violet)' }}>Velo Wallet</span>
                  </div>
                  <button onClick={() => copy(burner.veloAddress)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: copied ? 'var(--pnl-up)' : 'var(--fg-subtle)' }}>
                    {copied ? <Check size={10} /> : <Copy size={10} />}
                  </button>
                </div>
                <div style={{ ...C.mono, fontSize: 10, color: 'var(--fg)' }}>{shortAddr(burner.veloAddress)}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                  <span style={{ ...C.mono, fontSize: 9, color: 'var(--fg-subtle)' }}>ETH</span>
                  <span style={{ ...C.mono, fontSize: 10, color: burnerEthNum > 0 ? 'var(--pnl-up)' : 'var(--fg-subtle)', fontWeight: 700 }}>{burnerEthNum.toFixed(5)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ ...C.mono, fontSize: 9, color: 'var(--fg-subtle)' }}>USDC</span>
                  <span style={{ ...C.mono, fontSize: 10, color: burnerUsdcNum > 0 ? 'var(--pnl-up)' : 'var(--fg-subtle)', fontWeight: 700 }}>{burnerUsdcNum.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          {/* ── CREATE ────────────────────────────────────────────────────────── */}
          {step === 'CREATE' && (<>
            <p style={C.body}>
              Velo creates a <strong style={{ color: 'var(--fg)' }}>dedicated trading wallet</strong> derived from your main wallet via one signature — like dYdX or Hyperliquid. No MetaMask popups while trading.
            </p>
            <div style={{ ...C.card, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                ['One-time signature', 'Sign once with MetaMask. The signature deterministically derives your Velo wallet — same wallet every time you sign.'],
                ['No popups while trading', 'Velo wallet signs orders locally. MetaMask only opens for depositing more funds.'],
                ['Recoverable & exportable', 'Re-sign on any device to recover. Reveal & export the private key for backup.'],
              ].map(([title, body]) => (
                <div key={title} style={{ display: 'flex', gap: 10 }}>
                  <CheckCircle size={13} style={{ color: 'var(--pnl-up)', flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <div style={{ ...C.mono, fontSize: 11, color: 'var(--fg)', fontWeight: 700, marginBottom: 2 }}>{title}</div>
                    <div style={{ ...C.mono, fontSize: 10, color: 'var(--fg-subtle)', lineHeight: 1.45 }}>{body}</div>
                  </div>
                </div>
              ))}
            </div>
            {error && <Err msg={error} />}
            {status && !error && <Info msg={status} />}
            <button onClick={handleCreate} disabled={busy} style={btnPrimary(busy)}>
              {busy ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Awaiting signature…</> : <><KeyRound size={14} /> Create Velo Wallet</>}
            </button>

            {/* Show resume option if a wallet already exists */}
            {loadStoredBurner(ownerAddress) && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { const b = loadStoredBurner(ownerAddress)!; setBurner(b); setStep('FUND_USDC'); }} style={{ ...btnGhost(), flex: 1, fontSize: 9 }}>
                  Resume existing wallet
                </button>
                <button onClick={() => { clearBurner(ownerAddress); setBurner(null); }}
                  style={{ ...btnDanger(), width: 'auto', padding: '10px 14px', fontSize: 9 }}>
                  Reset
                </button>
              </div>
            )}
          </>)}

          {/* ── FUND_USDC ──────────────────────────────────────────────────────── */}
          {step === 'FUND_USDC' && burner && (<>

            {burnerUsdc >= MIN_USDC_TO_TRADE ? (
              <Ok msg={`Velo wallet has ${burnerUsdcNum.toFixed(2)} USDC — ready to activate!`} />
            ) : (<>

              {burnerUsdc > 0n && burnerUsdc < MIN_USDC_TO_TRADE && (
                <div style={{ ...C.card, padding: '10px 12px', borderColor: 'oklch(0.75 0.18 60/0.4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ ...C.mono, fontSize: 10, color: 'oklch(0.75 0.18 60)', fontWeight: 700 }}>USDC arriving…</span>
                    <span style={{ ...C.mono, fontSize: 10, color: 'oklch(0.75 0.18 60)', fontWeight: 700 }}>{burnerUsdcNum.toFixed(2)} / 5.00 USDC</span>
                  </div>
                  <div style={{ height: 3, background: 'oklch(1 0 0/0.06)', borderRadius: 2 }}>
                    <div style={{ height: 3, background: 'oklch(0.75 0.18 60)', borderRadius: 2, width: `${Math.min(100, (burnerUsdcNum/5)*100)}%`, transition: 'width 0.5s' }} />
                  </div>
                </div>
              )}

              {/* PATH 1: Velo auto-faucet */}
              <div style={{ ...C.card, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <Zap size={12} style={{ color: 'var(--iris-violet)' }} />
                  <span style={{ ...C.mono, fontSize: 12, color: 'var(--fg)', fontWeight: 700 }}>Auto-Fund</span>
                  <span style={{ ...C.mono, fontSize: 8, color: 'var(--pnl-up)', fontWeight: 700, background: 'oklch(0.78 0.18 150/0.12)', padding: '2px 5px', borderRadius: 4 }}>EASIEST</span>
                </div>
                <div style={{ ...C.mono, fontSize: 10, color: 'var(--fg-subtle)', lineHeight: 1.55, marginBottom: 8 }}>
                  Velo sends testnet USDC directly to your Velo wallet — no browser tab needed.
                </div>
                <button onClick={handleFaucetUsdc} disabled={busy} style={btnPrimary(busy)}>
                  {busy ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Requesting USDC…</> : <><Zap size={13} /> Get 50 USDC (Auto)</>}
                </button>
              </div>

              {/* PATH 2: Transfer from main wallet */}
              {ownerUsdc > 0n && (
                <div style={{ ...C.card, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <Wallet size={11} style={{ color: 'var(--fg-subtle)' }} />
                    <span style={{ ...C.mono, fontSize: 11, color: 'var(--fg)', fontWeight: 700 }}>Transfer from MetaMask</span>
                    <span style={{ ...C.mono, fontSize: 9, color: 'var(--fg-subtle)' }}>({parseFloat(formatUnits(ownerUsdc, 6)).toFixed(2)} available)</span>
                  </div>
                  <button onClick={handleSendUsdcFromOwner} disabled={busy} style={btnPrimary(busy)}>
                    {busy
                      ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Transferring…</>
                      : <><ArrowDownLeft size={13} /> Send {parseFloat(formatUnits(ownerUsdc, 6)).toFixed(2)} USDC to Velo Wallet</>}
                  </button>
                </div>
              )}

              {/* PATH 3: Circle faucet manual */}
              <div style={{ ...C.card, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <ExternalLink size={11} style={{ color: 'var(--fg-subtle)' }} />
                  <span style={{ ...C.mono, fontSize: 11, color: 'var(--fg)', fontWeight: 700 }}>Circle Faucet (manual)</span>
                </div>
                <div style={{ ...C.mono, fontSize: 10, color: 'var(--fg-subtle)', lineHeight: 1.55, marginBottom: 8 }}>
                  Open Circle faucet → select <strong style={{ color: 'var(--fg)' }}>Base Sepolia</strong> → paste your Velo address → claim 20 USDC → come back.
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', background: 'oklch(1 0 0/0.03)', borderRadius: 8, marginBottom: 8, border: '1px solid oklch(1 0 0/0.06)' }}>
                  <span style={{ ...C.mono, fontSize: 10, color: 'var(--fg-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{burner.veloAddress}</span>
                  <button onClick={() => copy(burner.veloAddress)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: copied ? 'var(--pnl-up)' : 'var(--iris-violet)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3, fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700 }}>
                    {copied ? <><Check size={10} /> Copied!</> : <><Copy size={10} /> Copy</>}
                  </button>
                </div>
                <a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', padding: '10px', borderRadius: 8, background: 'transparent', border: '1px solid var(--iris-violet)', color: 'var(--iris-violet)', textDecoration: 'none', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', boxSizing: 'border-box' }}>
                  <ExternalLink size={12} /> Open Circle Faucet
                </a>
              </div>

            </>)}

            {error && <Err msg={error} />}
            {status && !error && <Info msg={status} />}

            {burnerUsdc >= MIN_USDC_TO_TRADE && (
              <button onClick={() => setStep('ACTIVATE')} style={btnPrimary()}>
                <ArrowRight size={13} /> Continue to Activate
              </button>
            )}
          </>)}

          {/* ── ACTIVATE ──────────────────────────────────────────────────────── */}
          {step === 'ACTIVATE' && burner && (<>
            <p style={C.body}>
              Register your Velo wallet on Orderly and bind a trading key. <strong style={{ color: 'var(--fg)' }}>Signed locally — no MetaMask popups.</strong>
            </p>
            <div style={{ ...C.cardViolet, padding: 12, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <Shield size={13} style={{ color: 'var(--iris-violet)', flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ ...C.mono, fontSize: 11, color: 'var(--fg)', fontWeight: 700, marginBottom: 2 }}>Your Orderly Account ID</div>
                <div style={{ ...C.mono, fontSize: 9, color: 'var(--fg-muted)', wordBreak: 'break-all' }}>{getAccountId(burner.veloAddress)}</div>
              </div>
            </div>
            {error && <Err msg={error} />}
            {status && !error && <Info msg={status} />}
            <button onClick={handleActivate} disabled={busy} style={btnPrimary(busy)}>
              {busy ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Activating…</> : <><ShieldCheck size={14} /> Activate (gasless)</>}
            </button>
          </>)}

          {/* ── DEPOSIT ───────────────────────────────────────────────────────── */}
          {step === 'DEPOSIT' && burner && (<>
            <p style={C.body}>
              Deposit <strong style={{ color: 'var(--fg)' }}>{burnerUsdcNum.toFixed(2)} USDC</strong> from your Velo wallet into the Orderly trading vault. <strong style={{ color: 'var(--fg)' }}>No MetaMask popups</strong> — signed locally.
            </p>
            <div style={{ ...C.card, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ ...C.label, fontSize: 8 }}>Velo Wallet</div>
                  <div style={{ ...C.mono, fontSize: 13, color: 'var(--fg)', fontWeight: 700 }}>{burnerUsdcNum.toFixed(2)} USDC</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '0 12px' }}>
                  <ArrowDownLeft size={16} style={{ color: 'var(--iris-violet)' }} />
                </div>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ ...C.label, fontSize: 8 }}>Orderly Vault</div>
                  <div style={{ ...C.mono, fontSize: 13, color: 'var(--iris-violet)', fontWeight: 700 }}>+ {burnerUsdcNum.toFixed(2)}</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                {[
                  ['Vault contract', `${ORDERLY_VAULT_ADDRESS.slice(0, 10)}…${ORDERLY_VAULT_ADDRESS.slice(-6)}`],
                  ['Network', 'Base Sepolia'],
                  ['Transactions', '2 txs (approve + deposit) · gasless from your view'],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ ...C.mono, fontSize: 9, color: 'var(--fg-subtle)' }}>{k}</span>
                    <span style={{ ...C.mono, fontSize: 9, color: 'var(--fg)', fontWeight: 700 }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
            {approveTx && <div><span style={{ ...C.label, marginRight: 6 }}>Approve:</span><TxLink hash={approveTx} /></div>}
            {depositTx && <div><span style={{ ...C.label, marginRight: 6 }}>Deposit:</span><TxLink hash={depositTx} /></div>}
            {error && <Err msg={error} />}
            {status && !error && <Info msg={status} />}
            <button onClick={handleDeposit} disabled={busy || burnerUsdc === 0n} style={btnPrimary(busy || burnerUsdc === 0n)}>
              {busy ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Depositing…</> : <><ArrowDownLeft size={14} /> Deposit {burnerUsdcNum.toFixed(2)} USDC</>}
            </button>
          </>)}

          {/* ── DONE ──────────────────────────────────────────────────────────── */}
          {step === 'DONE' && burner && (<>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', ...C.cardGreen, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 28px oklch(0.78 0.18 150/0.25)' }}>
                {orderlyBal > 0
                  ? <CheckCircle size={28} style={{ color: 'var(--pnl-up)' }} />
                  : <Loader2 size={28} style={{ color: 'var(--iris-violet)', animation: 'spin 2s linear infinite' }} />}
              </div>
              <div>
                <p style={{ ...C.display, fontSize: 22, color: 'var(--fg)', margin: 0 }}>
                  {orderlyBal > 0 ? "You're live." : 'Almost there…'}
                </p>
                <p style={{ ...C.body, marginTop: 6, fontSize: 13 }}>
                  {orderlyBal > 0
                    ? <><strong style={{ color: 'var(--pnl-up)' }}>${orderlyBal.toFixed(2)} USDC</strong> in your trading vault. Closing…</>
                    : 'Cross-chain deposit settles in 1–3 minutes. Checking automatically…'}
                </p>
              </div>

              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ ...C.card, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={C.label}>Vault Balance</span>
                  <span style={{ ...C.mono, fontSize: 13, fontWeight: 700, color: orderlyBal > 0 ? 'var(--pnl-up)' : 'var(--fg-subtle)' }}>
                    {orderlyBal > 0 ? `$${orderlyBal.toFixed(2)}` : 'Pending…'}
                  </span>
                </div>
                {depositTx && (
                  <div style={{ ...C.card, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={C.label}>Deposit Tx</span>
                    <TxLink hash={depositTx} />
                  </div>
                )}
              </div>

              {/* Escape hatch — shown after 3 min if Orderly still hasn't credited */}
              {orderlyTimedOut && orderlyBal === 0 && (
                <div style={{ ...C.cardAmber, padding: '12px 14px', width: '100%', textAlign: 'left' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <AlertTriangle size={13} style={{ color: 'oklch(0.78 0.18 80)', flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <div style={{ ...C.mono, fontSize: 11, fontWeight: 700, color: 'oklch(0.78 0.18 80)', marginBottom: 4 }}>Taking longer than expected</div>
                      <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--fg-muted)', lineHeight: 1.5, marginBottom: 8 }}>
                        Your deposit tx is confirmed on-chain. Orderly indexing can occasionally take longer. You can close and check your balance from the dashboard.
                      </div>
                      <button onClick={onClose} style={{ ...btnGhost(), padding: '8px 12px', fontSize: 10, width: 'auto' }}>
                        Close and check later
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {orderlyBal === 0 && !orderlyTimedOut && (
                <button onClick={onClose} style={{ ...btnGhost(), width: '100%', fontSize: 10 }}>
                  Close (balance updates in background)
                </button>
              )}
            </div>
          </>)}

        </div>
      </div>
    </div>
  );
};
