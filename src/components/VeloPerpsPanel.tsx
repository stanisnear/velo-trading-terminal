/**
 * VeloPerpsPanel — the on-chain trading widget.
 *
 * Self-contained: it owns its own state via useVeloPerpsTrading. The host page
 * (Dashboard) drops it in with no props. This keeps Phase 1 of the migration
 * additive — nothing in App.tsx or Dashboard.tsx needs to change to use it.
 *
 * What it shows:
 *   • Connection / chain status (with a switch-network hint if user is wrong-chain)
 *   • Wallet mUSDC balance + a "Get test USDC" button hitting the faucet
 *   • A simple open-position form (pair × side × collateral × leverage)
 *   • Open positions with PnL, each linking to BaseScan
 *   • A footer link to the verified VeloPerps contract on BaseScan
 *
 * Brand-system aligned: Instrument Serif italic for display values, JetBrains
 * Mono for numeric labels, Tailwind utilities for layout. No emojis.
 */
import React, { useState, useMemo } from 'react';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import {
  ExternalLink,
  Loader2,
  Plus,
  TrendingUp,
  TrendingDown,
  X,
} from 'lucide-react';
import { useVeloPerpsTrading } from '@/services/useVeloPerpsTrading';
import {
  VELO_PERPS_ADDRESS,
  baseScanAddressUrl,
  baseScanTxUrl,
} from '@/services/veloPerpsService';

const BASE_SEPOLIA_ID = 84532;

// ── Style tokens, matching the rest of the Dashboard ──────────────────────────
const S = {
  display: { fontFamily: 'var(--font-display)', fontStyle: 'italic' as const, letterSpacing: '-0.02em' },
  mono:    { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1', fontVariantNumeric: 'tabular-nums' as const },
  label:   { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)' } as React.CSSProperties,
};

const panel: React.CSSProperties = {
  background: 'var(--bg-base-2)',
  border: '1px solid var(--hairline)',
  borderRadius: 16,
  backdropFilter: 'blur(32px) saturate(1.6)',
  WebkitBackdropFilter: 'blur(32px) saturate(1.6)',
  boxShadow: 'var(--glass-shadow)',
  overflow: 'hidden',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtUsd = (n: number) => {
  if (!Number.isFinite(n)) return '$0.00';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1000) return `${sign}$${abs.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return `${sign}$${abs.toFixed(2)}`;
};

const fmtPrice = (n: number) => {
  if (!Number.isFinite(n) || n === 0) return '—';
  if (n >= 1000) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  return `$${n.toFixed(2)}`;
};

const shortHash = (h?: string) => (h ? `${h.slice(0, 6)}…${h.slice(-4)}` : '');

// ── Sub-components ────────────────────────────────────────────────────────────

const StatusPill = ({ label, tone }: { label: string; tone: 'good' | 'warn' | 'bad' }) => {
  const colour = tone === 'good' ? 'var(--pnl-up)' : tone === 'warn' ? 'var(--iris-amber)' : 'var(--pnl-down)';
  return (
    <span
      style={{
        ...S.mono,
        fontSize: 10,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        padding: '4px 8px',
        borderRadius: 999,
        background: 'var(--chip-bg)',
        color: colour,
        border: `1px solid ${colour}`,
        opacity: 0.95,
      }}
    >
      {label}
    </span>
  );
};

// ── Main panel ────────────────────────────────────────────────────────────────

export const VeloPerpsPanel: React.FC = () => {
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const trading = useVeloPerpsTrading();

  const [pair, setPair] = useState<'BTC-USD' | 'ETH-USD'>('BTC-USD');
  const [side, setSide] = useState<'LONG' | 'SHORT'>('LONG');
  const [collateral, setCollateral] = useState('50');
  const [leverage, setLeverage] = useState(10);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState<`0x${string}` | null>(null);

  const onWrongChain = isConnected && chainId !== BASE_SEPOLIA_ID;
  const ready = isConnected && !onWrongChain && trading.isReady;

  const collateralNum = useMemo(() => {
    const n = parseFloat(collateral || '0');
    return Number.isFinite(n) ? n : 0;
  }, [collateral]);

  const insufficientUsdc = collateralNum > trading.usdcBalance;

  const handleMint = async () => {
    setActionError(null);
    try {
      const res = await trading.mintTestUsdc();
      setLastTxHash(res.txHash);
    } catch (e: any) {
      setActionError(e?.shortMessage || e?.message || 'Faucet claim failed');
    }
  };

  const handleOpen = async () => {
    setActionError(null);
    if (collateralNum < 1) {
      setActionError('Minimum collateral is $1');
      return;
    }
    try {
      const res = await trading.openPosition({
        pair,
        isLong: side === 'LONG',
        collateralUSDC: collateralNum,
        leverage,
      });
      setLastTxHash(res.txHash);
    } catch (e: any) {
      setActionError(e?.shortMessage || e?.message || 'Open failed');
    }
  };

  const handleClose = async (tradeId: bigint, posPair: 'BTC-USD' | 'ETH-USD') => {
    setActionError(null);
    try {
      const res = await trading.closePosition(tradeId, posPair);
      setLastTxHash(res.txHash);
    } catch (e: any) {
      setActionError(e?.shortMessage || e?.message || 'Close failed');
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ ...panel, padding: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 32, height: 32, borderRadius: 10, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(160deg, oklch(0.76 0.22 295), oklch(0.44 0.22 295))',
              color: '#fff',
            }}
          >
            <TrendingUp size={16} />
          </div>
          <div>
            <h3 style={{ ...S.display, fontSize: 22, margin: 0, color: 'var(--fg)' }}>
              Velo Perps
            </h3>
            <div style={{ ...S.mono, fontSize: 10, color: 'var(--fg-subtle)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              On-chain · Base Sepolia
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!isConnected && <StatusPill label="Connect wallet" tone="warn" />}
          {onWrongChain && <StatusPill label="Wrong network" tone="bad" />}
          {ready && <StatusPill label="Live" tone="good" />}
        </div>
      </div>

      {/* Wrong-chain CTA */}
      {onWrongChain && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            background: 'var(--chip-bg)',
            border: '1px solid var(--hairline-strong)',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ ...S.mono, fontSize: 12, color: 'var(--fg-muted)' }}>
            Velo Perps lives on Base Sepolia. Switch network to trade.
          </div>
          <button
            onClick={() => switchChain({ chainId: BASE_SEPOLIA_ID })}
            style={{
              ...S.mono,
              padding: '8px 14px', borderRadius: 10, border: 'none',
              background: 'var(--fg)', color: 'var(--bg-base)',
              fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase', cursor: 'pointer', flexShrink: 0,
            }}
          >
            Switch
          </button>
        </div>
      )}

      {/* Balance + faucet row */}
      {ready && (
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: 14, marginBottom: 16,
            background: 'var(--chip-bg)', border: '1px solid var(--hairline)', borderRadius: 12,
          }}
        >
          <div>
            <div style={S.label}>mUSDC balance</div>
            <div style={{ ...S.display, fontSize: 28, color: 'var(--fg)', marginTop: 2 }}>
              {fmtUsd(trading.usdcBalance)}
            </div>
          </div>
          <button
            onClick={handleMint}
            disabled={trading.isPending}
            style={{
              ...S.mono,
              padding: '10px 16px', borderRadius: 10,
              background: 'var(--chip-bg-hover)', border: '1px solid var(--hairline-strong)',
              color: 'var(--fg)', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              cursor: trading.isPending ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 8,
              opacity: trading.isPending ? 0.6 : 1,
            }}
          >
            {trading.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Get 1,000 test USDC
          </button>
        </div>
      )}

      {/* Open-position form */}
      {ready && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ ...S.label, marginBottom: 8 }}>Open position</div>

          {/* Pair + side row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <select
              value={pair}
              onChange={(e) => setPair(e.target.value as 'BTC-USD' | 'ETH-USD')}
              style={{
                ...S.mono,
                padding: '10px 12px', borderRadius: 10,
                background: 'var(--chip-bg)', border: '1px solid var(--hairline)',
                color: 'var(--fg)', fontSize: 13,
              }}
            >
              <option value="BTC-USD">BTC / USD</option>
              <option value="ETH-USD">ETH / USD</option>
            </select>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              {(['LONG', 'SHORT'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSide(s)}
                  style={{
                    ...S.mono,
                    padding: '10px 0', borderRadius: 10,
                    background: side === s
                      ? (s === 'LONG' ? 'oklch(0.78 0.18 150 / 0.18)' : 'oklch(0.66 0.22 25 / 0.18)')
                      : 'var(--chip-bg)',
                    border: side === s
                      ? `1px solid ${s === 'LONG' ? 'var(--pnl-up)' : 'var(--pnl-down)'}`
                      : '1px solid var(--hairline)',
                    color: side === s ? (s === 'LONG' ? 'var(--pnl-up)' : 'var(--pnl-down)') : 'var(--fg-muted)',
                    fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                    textTransform: 'uppercase', cursor: 'pointer',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Collateral input */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, marginBottom: 8 }}>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                ...S.mono, fontSize: 13, color: 'var(--fg-subtle)',
              }}>$</span>
              <input
                type="text"
                inputMode="decimal"
                value={collateral}
                onChange={(e) => setCollateral(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="50"
                style={{
                  ...S.mono,
                  width: '100%', padding: '10px 12px 10px 24px', borderRadius: 10,
                  background: 'var(--chip-bg)', border: '1px solid var(--hairline)',
                  color: 'var(--fg)', fontSize: 14, boxSizing: 'border-box',
                }}
              />
              <span style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                ...S.mono, fontSize: 10, color: 'var(--fg-subtle)',
                letterSpacing: '0.1em', textTransform: 'uppercase',
              }}>Collateral</span>
            </div>
          </div>

          {/* Leverage slider */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={S.label}>Leverage</span>
              <span style={{ ...S.mono, fontSize: 13, color: 'var(--fg)' }}>{leverage}×</span>
            </div>
            <input
              type="range"
              min={1}
              max={25}
              value={leverage}
              onChange={(e) => setLeverage(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--iris-violet)' }}
            />
          </div>

          {/* Notional preview */}
          <div style={{
            ...S.mono, fontSize: 11, color: 'var(--fg-subtle)',
            display: 'flex', justifyContent: 'space-between', marginBottom: 10,
          }}>
            <span>Notional: {fmtUsd(collateralNum * leverage)}</span>
            <span>Fee (0.10%): {fmtUsd(collateralNum * 0.001)}</span>
          </div>

          {/* Submit */}
          <button
            onClick={handleOpen}
            disabled={trading.isPending || insufficientUsdc || collateralNum < 1}
            style={{
              ...S.mono,
              width: '100%', padding: '12px 16px', borderRadius: 12, border: 'none',
              background: insufficientUsdc || collateralNum < 1
                ? 'var(--chip-bg)'
                : (side === 'LONG' ? 'var(--pnl-up)' : 'var(--pnl-down)'),
              color: insufficientUsdc || collateralNum < 1 ? 'var(--fg-subtle)' : '#fff',
              fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase',
              cursor: trading.isPending || insufficientUsdc || collateralNum < 1 ? 'not-allowed' : 'pointer',
              opacity: trading.isPending ? 0.6 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {trading.isPending && <Loader2 size={14} className="animate-spin" />}
            {insufficientUsdc
              ? 'Insufficient mUSDC'
              : collateralNum < 1
              ? 'Min $1 collateral'
              : `Open ${side} ${pair.replace('-USD', '')} @ ${leverage}×`}
          </button>
        </div>
      )}

      {/* Open positions */}
      {ready && trading.openPositions.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ ...S.label, marginBottom: 8 }}>Open positions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {trading.openPositions.map((p) => (
              <PositionRow
                key={p.tradeId.toString()}
                position={p}
                onClose={() => handleClose(p.tradeId, p.pair)}
                isPending={trading.isPending}
              />
            ))}
          </div>
        </div>
      )}

      {/* Last tx + errors */}
      {lastTxHash && (
        <a
          href={baseScanTxUrl(lastTxHash)}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            ...S.mono, fontSize: 11, color: 'var(--iris-violet)',
            display: 'flex', alignItems: 'center', gap: 6,
            marginBottom: 8, textDecoration: 'none',
          }}
        >
          Last tx · {shortHash(lastTxHash)} <ExternalLink size={11} />
        </a>
      )}

      {actionError && (
        <div style={{
          ...S.mono, fontSize: 11, color: 'var(--pnl-down)',
          padding: '8px 12px', borderRadius: 8,
          background: 'oklch(0.66 0.22 25 / 0.1)',
          border: '1px solid oklch(0.66 0.22 25 / 0.3)',
          marginBottom: 8,
          display: 'flex', alignItems: 'flex-start', gap: 6,
        }}>
          <X size={12} style={{ flexShrink: 0, marginTop: 2 }} /> <span>{actionError}</span>
        </div>
      )}

      {/* Footer */}
      <div style={{
        marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--hairline)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={S.label}>Pool: {fmtUsd(trading.poolBalance)}</span>
        <a
          href={baseScanAddressUrl(VELO_PERPS_ADDRESS)}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            ...S.mono, fontSize: 10, color: 'var(--fg-subtle)',
            display: 'flex', alignItems: 'center', gap: 4,
            textDecoration: 'none', letterSpacing: '0.08em', textTransform: 'uppercase',
          }}
        >
          Contract on BaseScan <ExternalLink size={10} />
        </a>
      </div>
    </div>
  );
};

// ── Position row ──────────────────────────────────────────────────────────────

const PositionRow: React.FC<{
  position: { tradeId: bigint; pair: 'BTC-USD' | 'ETH-USD'; isLong: boolean; leverage: number; collateralUSDC: number; entryPrice: number };
  onClose: () => void;
  isPending: boolean;
}> = ({ position, onClose, isPending }) => {
  const sideColour = position.isLong ? 'var(--pnl-up)' : 'var(--pnl-down)';
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 12px', borderRadius: 10,
        background: 'var(--chip-bg)', border: '1px solid var(--hairline)',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        {position.isLong
          ? <TrendingUp size={14} style={{ color: sideColour, flexShrink: 0 }} />
          : <TrendingDown size={14} style={{ color: sideColour, flexShrink: 0 }} />}
        <div style={{ minWidth: 0 }}>
          <div style={{ ...S.mono, fontSize: 12, color: 'var(--fg)' }}>
            {position.pair.replace('-USD', '')} · {position.isLong ? 'LONG' : 'SHORT'} · {position.leverage}×
          </div>
          <div style={{ ...S.mono, fontSize: 10, color: 'var(--fg-subtle)' }}>
            Entry {fmtPrice(position.entryPrice)} · Collateral {fmtUsd(position.collateralUSDC)}
          </div>
        </div>
      </div>
      <button
        onClick={onClose}
        disabled={isPending}
        style={{
          ...S.mono,
          padding: '6px 10px', borderRadius: 8,
          background: 'var(--chip-bg-hover)', border: '1px solid var(--hairline-strong)',
          color: 'var(--fg-muted)', fontSize: 10, fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          cursor: isPending ? 'wait' : 'pointer',
          flexShrink: 0,
          opacity: isPending ? 0.5 : 1,
        }}
      >
        Close
      </button>
    </div>
  );
};
