/**
 * VeloBridgeModal — cross-chain mUSDC transfer via LayerZero V2 OFT.
 *
 * The user picks a source chain (must currently be connected to it), a
 * destination chain, an amount, and signs one transaction on the source
 * chain. LayerZero's executor delivers the message to the destination
 * chain (typically 1-3 minutes on testnet).
 *
 * UX:
 *   IDLE      → user picks chains + amount + signs
 *   QUOTING   → fetching the LayerZero fee quote
 *   SIGNING   → MetaMask popup pending
 *   PENDING   → source-chain tx mined, destination delivery in flight
 *   DONE      → destination tx visible / poll picked up new balance
 *   ERROR     → fallback with retry
 */
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi';
import { ArrowDown, ArrowRight, CheckCircle2, ExternalLink, Loader2, X } from 'lucide-react';
import { formatUnits, parseUnits } from 'viem';
import {
  CHAIN_ID,
  CHAIN_LABEL,
  VELO_USDC_ADDRESS,
  type BridgeChain,
  quoteBridge,
  executeBridge,
} from '@/services/bridgeService';
import { VELO_USDC_ABI } from '@/services/veloUsdcService';

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
  backdropFilter: 'blur(40px) saturate(1.35)',
  WebkitBackdropFilter: 'blur(40px) saturate(1.35)',
  position: 'relative',
  overflow: 'hidden',
};

const holoGradient: React.CSSProperties = {
  position: 'absolute',
  top: 0, left: 0, right: 0,
  height: 2,
  background: 'linear-gradient(90deg, oklch(0.45 0.26 295) 0%, oklch(0.55 0.24 285) 35%, oklch(0.65 0.22 268) 70%, oklch(0.72 0.18 250) 100%)',
  opacity: 0.9, zIndex: 1,
};

type Step = 'IDLE' | 'SIGNING' | 'PENDING' | 'DONE' | 'ERROR';

const CHAINS_ORDERED: BridgeChain[] = ['base_sepolia', 'arbitrum_sepolia', 'optimism_sepolia', 'ethereum_sepolia'];

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const VeloBridgeModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [source, setSource] = useState<BridgeChain>('base_sepolia');
  const [dest, setDest] = useState<BridgeChain>('arbitrum_sepolia');
  const [amount, setAmount] = useState('100');
  const [step, setStep] = useState<Step>('IDLE');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [feeQuote, setFeeQuote] = useState<bigint | null>(null);
  const [sourceBalance, setSourceBalance] = useState<number>(0);

  // Auto-set source = current chain
  useEffect(() => {
    const match = CHAINS_ORDERED.find(c => CHAIN_ID[c] === chainId);
    if (match) setSource(match);
  }, [chainId]);

  // If user picks source = dest, auto-switch dest to first different chain
  useEffect(() => {
    if (source === dest) {
      const next = CHAINS_ORDERED.find(c => c !== source);
      if (next) setDest(next);
    }
  }, [source, dest]);

  // Read source-chain balance to populate the input max
  useEffect(() => {
    if (!isOpen || !address || !publicClient) return;
    // Only read balance for the chain the user is currently on
    if (CHAIN_ID[source] !== chainId) return;
    publicClient.readContract({
      address: VELO_USDC_ADDRESS[source],
      abi: VELO_USDC_ABI,
      functionName: 'balanceOf',
      args: [address],
    }).then((bal) => setSourceBalance(Number(formatUnits(bal, 6))))
      .catch(() => setSourceBalance(0));
  }, [isOpen, address, source, chainId, publicClient]);

  // Live quote — fetch whenever amount or chains change (debounced via React's batching)
  useEffect(() => {
    if (!isOpen || !publicClient || !address) return;
    if (source === dest) return;
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setFeeQuote(null);
      return;
    }
    quoteBridge(publicClient, source, dest, address, amt)
      .then((q) => setFeeQuote(q.nativeFee))
      .catch(() => setFeeQuote(null));
  }, [isOpen, source, dest, amount, address, publicClient]);

  useEffect(() => {
    if (!isOpen) {
      setStep('IDLE');
      setErrorMsg('');
      setTxHash(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const onWrongChain = CHAIN_ID[source] !== chainId;

  const handleBridge = async () => {
    if (!walletClient || !publicClient || !address) return;
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setErrorMsg('Enter an amount above zero.');
      setStep('ERROR');
      return;
    }
    if (amt > sourceBalance) {
      setErrorMsg(`Insufficient mUSDC on ${CHAIN_LABEL[source]}.`);
      setStep('ERROR');
      return;
    }
    setStep('SIGNING');
    try {
      const result = await executeBridge(walletClient, publicClient, source, dest, address, amt);
      setTxHash(result.txHash);
      setStep('PENDING');
      // LayerZero delivery is async — we just show the source tx and let the
      // user verify on the explorer. The destination balance will update on
      // the next useVeloPerpsTrading poll once it lands.
      setTimeout(() => setStep('DONE'), 3000);
    } catch (e: any) {
      const msg = e?.shortMessage || e?.message || 'Bridge failed';
      if (/rejected|denied/i.test(msg)) setErrorMsg('You cancelled the signature.');
      else if (/insufficient/i.test(msg)) setErrorMsg("Not enough ETH on the source chain for the LayerZero fee.");
      else setErrorMsg(msg);
      setStep('ERROR');
    }
  };

  const explorerUrl = (chain: BridgeChain, hash: string) => {
    const map: Record<BridgeChain, string> = {
      base_sepolia:     'https://sepolia.basescan.org/tx/',
      arbitrum_sepolia: 'https://sepolia.arbiscan.io/tx/',
      optimism_sepolia: 'https://sepolia-optimism.etherscan.io/tx/',
      ethereum_sepolia: 'https://sepolia.etherscan.io/tx/',
    };
    return map[chain] + hash;
  };

  const renderHeader = () => (
    <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <h3 style={{ ...S.display, fontSize: 22, color: 'var(--fg)', margin: 0 }}>Bridge mUSDC</h3>
      <button
        onClick={onClose}
        aria-label="Close"
        style={{
          width: 32, height: 32, borderRadius: 999,
          background: 'rgba(255,255,255,0.04)', border: '1px solid var(--hairline)',
          color: 'var(--fg-muted)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <X size={16} />
      </button>
    </div>
  );

  const renderIdle = () => (
    <div style={{ padding: '20px 24px 24px' }}>
      {/* Source */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ ...S.label, marginBottom: 6 }}>From</div>
        <div style={{
          padding: 14, borderRadius: 14,
          background: 'rgba(255,255,255,0.03)', border: '1px solid var(--hairline)',
        }}>
          <select
            value={source}
            onChange={e => setSource(e.target.value as BridgeChain)}
            style={{
              ...S.mono, width: '100%', padding: '6px 8px', marginBottom: 8,
              background: 'transparent', border: '1px solid var(--hairline)', borderRadius: 8,
              color: 'var(--fg)', fontSize: 13,
            }}
          >
            {CHAINS_ORDERED.map(c => (
              <option key={c} value={c}>{CHAIN_LABEL[c]}</option>
            ))}
          </select>
          {!onWrongChain && (
            <div style={{ ...S.mono, fontSize: 11, color: 'var(--fg-subtle)' }}>
              Balance: ${sourceBalance.toFixed(2)} mUSDC
            </div>
          )}
          {onWrongChain && (
            <button
              onClick={() => switchChain({ chainId: CHAIN_ID[source] })}
              style={{
                ...S.mono, fontSize: 11, color: 'var(--iris-violet)',
                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Switch wallet to {CHAIN_LABEL[source]} →
            </button>
          )}
        </div>
      </div>

      {/* Arrow + swap */}
      <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
        <button
          onClick={() => { const s = source; setSource(dest); setDest(s); }}
          style={{
            width: 32, height: 32, borderRadius: 999,
            background: 'var(--chip-bg)', border: '1px solid var(--hairline)',
            color: 'var(--fg-muted)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <ArrowDown size={14} />
        </button>
      </div>

      {/* Destination */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ ...S.label, marginBottom: 6 }}>To</div>
        <div style={{
          padding: 14, borderRadius: 14,
          background: 'rgba(255,255,255,0.03)', border: '1px solid var(--hairline)',
        }}>
          <select
            value={dest}
            onChange={e => setDest(e.target.value as BridgeChain)}
            style={{
              ...S.mono, width: '100%', padding: '6px 8px',
              background: 'transparent', border: '1px solid var(--hairline)', borderRadius: 8,
              color: 'var(--fg)', fontSize: 13,
            }}
          >
            {CHAINS_ORDERED.filter(c => c !== source).map(c => (
              <option key={c} value={c}>{CHAIN_LABEL[c]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Amount */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ ...S.label, marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
          <span>Amount</span>
          <button
            onClick={() => setAmount(sourceBalance.toFixed(2))}
            style={{
              ...S.mono, fontSize: 10, color: 'var(--iris-violet)',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              letterSpacing: '0.1em', textTransform: 'uppercase',
            }}
          >
            Max
          </button>
        </div>
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
          style={{
            ...S.mono, width: '100%', padding: '14px', borderRadius: 12,
            background: 'rgba(255,255,255,0.03)', border: '1px solid var(--hairline)',
            color: 'var(--fg)', fontSize: 16, boxSizing: 'border-box' as const,
          }}
        />
      </div>

      {/* Fee preview */}
      {feeQuote != null && (
        <div style={{
          padding: 10, borderRadius: 10, marginBottom: 16,
          background: 'rgba(255,255,255,0.02)', border: '1px solid var(--hairline)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ ...S.mono, fontSize: 11, color: 'var(--fg-muted)' }}>LayerZero fee</span>
          <span style={{ ...S.mono, fontSize: 11, color: 'var(--fg)' }}>
            {Number(formatUnits(feeQuote, 18)).toFixed(6)} ETH
          </span>
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleBridge}
        disabled={onWrongChain || !feeQuote || parseFloat(amount) <= 0}
        style={{
          ...S.mono, width: '100%', padding: '14px 0', borderRadius: 12, border: 'none',
          background: (onWrongChain || !feeQuote || parseFloat(amount) <= 0)
            ? 'var(--chip-bg)'
            : 'linear-gradient(100deg, var(--iris-violet), var(--iris-magenta))',
          color: '#fff',
          fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase' as const,
          cursor: (onWrongChain || !feeQuote || parseFloat(amount) <= 0) ? 'not-allowed' : 'pointer',
          opacity: (onWrongChain || !feeQuote || parseFloat(amount) <= 0) ? 0.5 : 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        Bridge <ArrowRight size={14} />
      </button>

      <div style={{ ...S.mono, fontSize: 10, color: 'var(--fg-subtle)', textAlign: 'center' as const, marginTop: 12 }}>
        Delivery typically takes 1–3 minutes via LayerZero V2.
      </div>
    </div>
  );

  const renderPending = () => (
    <div style={{ padding: '40px 24px', textAlign: 'center' as const }}>
      <Loader2 size={32} className="animate-spin" style={{ color: 'var(--iris-violet)', margin: '0 auto 20px' }} />
      <h3 style={{ ...S.display, fontSize: 22, color: 'var(--fg)', margin: '0 0 8px' }}>
        {step === 'SIGNING' ? 'Sign in your wallet' : 'Bridging in progress'}
      </h3>
      <p style={{ ...S.sans, fontSize: 13, color: 'var(--fg-muted)', margin: 0 }}>
        {step === 'SIGNING'
          ? 'Confirm the transaction to send mUSDC across chains.'
          : 'Your funds are travelling. They\'ll land on the destination in 1–3 minutes.'}
      </p>
      {txHash && (
        <a
          href={explorerUrl(source, txHash)}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            ...S.mono, fontSize: 11, color: 'var(--iris-violet)',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            marginTop: 20, textDecoration: 'none',
          }}
        >
          View source tx <ExternalLink size={11} />
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
      <h3 style={{ ...S.display, fontSize: 24, color: 'var(--fg)', margin: '0 0 8px' }}>Bridge initiated</h3>
      <p style={{ ...S.sans, fontSize: 13, color: 'var(--fg-muted)', margin: '0 0 20px' }}>
        Funds will arrive on {CHAIN_LABEL[dest]} within ~1–3 minutes.
      </p>
      {txHash && (
        <a
          href={explorerUrl(source, txHash)}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            ...S.mono, fontSize: 11, color: 'var(--iris-violet)',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            marginBottom: 20, textDecoration: 'none',
          }}
        >
          View on explorer <ExternalLink size={11} />
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
        Close
      </button>
    </div>
  );

  const renderError = () => (
    <div style={{ padding: '40px 24px', textAlign: 'center' as const }}>
      <X size={32} style={{ color: 'var(--pnl-down)', margin: '0 auto 20px' }} />
      <h3 style={{ ...S.display, fontSize: 22, color: 'var(--fg)', margin: '0 0 8px' }}>Bridge failed</h3>
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
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget && step !== 'SIGNING' && step !== 'PENDING') onClose(); }}
    >
      <div style={cardStyle}>
        <div style={holoGradient} />
        {renderHeader()}
        {step === 'IDLE' && renderIdle()}
        {(step === 'SIGNING' || step === 'PENDING') && renderPending()}
        {step === 'DONE' && renderDone()}
        {step === 'ERROR' && renderError()}
      </div>
    </div>,
    document.body,
  );
};
