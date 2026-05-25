// ═══════════════════════════════════════════════════════════════════════════════
// VELO SETTINGS MODAL
//
// One destination for everything wallet-related:
//   • Main wallet (the one the user signed up with — MetaMask, etc.)
//   • Velo trading wallet (the burner derived from main)
//   • Network indicator
//   • Private key reveal/export with a confirm gate
//   • Re-derive option for cross-device recovery
//
// Mounted from the avatar menu — same backdrop/centered-card treatment as the
// onboarding modal so the app feels coherent.
// ═══════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react';
import { useAccount, useBalance, useChainId, usePublicClient, useReadContract, useSignMessage, useWalletClient } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import {
  X, Copy, Check, Eye, EyeOff, AlertTriangle, KeyRound, RefreshCw,
  ShieldCheck, Wallet, Network, ExternalLink, Send, AtSign,
} from 'lucide-react';
import {
  loadStoredBurner, exportPrivateKey, rederiveVeloBurner,
  type VeloBurnerWallet,
} from '../services/veloBurnerWallet';
import { VELO_USDC_BASE as USDC_BASE_SEPOLIA } from '../services/veloPerpsService';

const ERC20_BAL_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'transfer', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
] as const;

const F = {
  display: { fontFamily: 'var(--font-display)', fontStyle: 'italic' as const, letterSpacing: '-0.025em' } as React.CSSProperties,
  mono:    { fontFamily: 'var(--font-mono)' } as React.CSSProperties,
  sans:    { fontFamily: 'var(--font-sans)', letterSpacing: '-0.005em' } as React.CSSProperties,
  label:   { fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)' } as React.CSSProperties,
};

const short = (a: string) => a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '';

const NETWORK_NAMES: Record<number, string> = {
  84532:  'Base Sepolia',
  8453:   'Base',
  1:      'Ethereum',
  11155111: 'Sepolia',
  10:     'Optimism',
  42161:  'Arbitrum',
};

interface Props {
  isOpen:  boolean;
  onClose: () => void;
  onOpenBridge?: () => void;
  onOpenUsername?: () => void;
  onOpenSend?: () => void;
}

export const SettingsModal: React.FC<Props> = ({ isOpen, onClose, onOpenBridge, onOpenUsername, onOpenSend }) => {
  const { address: ownerAddress, connector } = useAccount();
  const chainId = useChainId();
  const { signMessageAsync } = useSignMessage();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [burner, setBurner] = useState<VeloBurnerWallet | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [copiedField, setCopiedField] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [movingFunds, setMovingFunds] = useState(false);
  const [moveError, setMoveError] = useState('');

  // Reload burner whenever the modal opens
  useEffect(() => {
    if (!isOpen) return;
    setError(''); setRevealed(false); setConfirming(false);
    if (ownerAddress) setBurner(loadStoredBurner(ownerAddress));
  }, [isOpen, ownerAddress]);

  // Owner balances
  const { data: ownerEthData } = useBalance({
    address: ownerAddress,
    query: { enabled: !!ownerAddress && isOpen, refetchInterval: 8000 },
  });
  const { data: ownerUsdcData } = useReadContract({
    address: USDC_BASE_SEPOLIA as `0x${string}`, abi: ERC20_BAL_ABI, functionName: 'balanceOf',
    args: ownerAddress ? [ownerAddress as `0x${string}`] : undefined,
    query: { enabled: !!ownerAddress && isOpen, refetchInterval: 8000 },
  });

  // Velo wallet balances
  const { data: veloEthData } = useBalance({
    address: burner?.veloAddress as `0x${string}` | undefined,
    query: { enabled: !!burner && isOpen, refetchInterval: 8000 },
  });
  const { data: veloUsdcData } = useReadContract({
    address: USDC_BASE_SEPOLIA as `0x${string}`, abi: ERC20_BAL_ABI, functionName: 'balanceOf',
    args: burner ? [burner.veloAddress as `0x${string}`] : undefined,
    query: { enabled: !!burner && isOpen, refetchInterval: 8000 },
  });

  if (!isOpen || !ownerAddress) return null;

  const ownerEth  = ownerEthData ? parseFloat(formatUnits(ownerEthData.value, 18))  : 0;
  const ownerUsdc = ownerUsdcData ? parseFloat(formatUnits(ownerUsdcData as bigint, 6)) : 0;
  const veloEth   = veloEthData  ? parseFloat(formatUnits(veloEthData.value, 18))   : 0;
  const veloUsdc  = veloUsdcData ? parseFloat(formatUnits(veloUsdcData as bigint, 6))  : 0;

  const networkName = NETWORK_NAMES[chainId] || `Chain ${chainId}`;
  const networkOk   = chainId === 84532; // Base Sepolia

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(key);
      setTimeout(() => setCopiedField(''), 1400);
    } catch { /* ignore */ }
  };

  // Move all mUSDC from main wallet → trading wallet. Sponsor a top-up of ETH
  // to the burner first if it's empty, so the user immediately gets a working
  // trading account in one click.
  const moveToTradingWallet = async () => {
    if (!burner || !walletClient || !publicClient || !ownerAddress) return;
    if (ownerUsdc <= 0) { setMoveError('Nothing to move.'); return; }
    setMovingFunds(true);
    setMoveError('');
    try {
      // If burner has no gas, ping the sponsor first so it can pay for trades after.
      if (veloEth < 0.002) {
        try {
          const response = await fetch('/api/sponsor-eth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ burnerAddress: burner.veloAddress }),
          });
          const data = await response.json();
          if (response.ok && data.sponsored && data.txHash) {
            await publicClient.waitForTransactionReceipt({ hash: data.txHash });
          }
          // If sponsor offline, the burner can still receive mUSDC — it just
          // won't have gas to trade. User can top up ETH separately.
        } catch { /* sponsor unreachable — keep going */ }
      }

      // Transfer ALL mUSDC main → burner
      const amount = parseUnits(ownerUsdc.toFixed(6), 6);
      const hash = await walletClient.writeContract({
        address: USDC_BASE_SEPOLIA as `0x${string}`,
        abi: ERC20_BAL_ABI,
        functionName: 'transfer',
        args: [burner.veloAddress, amount],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      // Balance refetch will fire on next 8s interval, but UX feels snappier
      // if we close + reopen the modal to force a refresh. For now, just stop
      // the busy state — the refetchInterval will reconcile.
    } catch (e: any) {
      const msg = e?.shortMessage || e?.message || 'Move failed';
      if (/rejected|denied/i.test(msg)) setMoveError('You cancelled the transfer.');
      else if (/insufficient/i.test(msg)) setMoveError('Not enough ETH in main wallet for gas.');
      else setMoveError(msg);
    } finally {
      setMovingFunds(false);
    }
  };

  const privateKey = revealed ? exportPrivateKey(ownerAddress) : null;

  const handleRederive = async () => {
    setBusy(true); setError('');
    try {
      const b = await rederiveVeloBurner(ownerAddress as `0x${string}`, signMessageAsync as any);
      setBurner(b);
      setBusy(false);
    } catch (e: any) {
      setBusy(false);
      setError(e?.message?.includes('rejected') ? 'You cancelled the signature.' : (e?.message || 'Could not re-derive wallet.'));
    }
  };

  return (
    <>
      <style>{`
        @keyframes settings-fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .settings-card { animation: settings-fade-in 280ms cubic-bezier(0.22,1,0.36,1) both; }
      `}</style>

      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'oklch(0 0 0 / 0.72)',
          backdropFilter: 'blur(14px) saturate(140%)',
          WebkitBackdropFilter: 'blur(14px) saturate(140%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20, overflowY: 'auto',
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          className="settings-card mode-dark"
          style={{
            position: 'relative',
            width: '100%', maxWidth: 520,
            background: 'var(--bg-base-2)',
            border: '1px solid oklch(1 0 0 / 0.08)',
            borderRadius: 24,
            overflow: 'hidden',
            boxShadow: '0 30px 90px oklch(0 0 0 / 0.5)',
            margin: 'auto',
          }}
        >
          {/* Top accent line */}
          <div style={{ height: 2, background: 'linear-gradient(90deg, oklch(0.78 0.18 295), oklch(0.82 0.16 200), oklch(0.85 0.15 30))', opacity: 0.85 }} />

          {/* Header */}
          <div style={{ padding: '22px 28px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <h1 style={{ ...F.display, fontSize: 26, fontWeight: 400, color: 'var(--fg)', margin: 0 }}>Wallet & Settings</h1>
              <p style={{ ...F.sans, fontSize: 13, color: 'var(--fg-muted)', margin: '4px 0 0' }}>
                Your two wallets, balances, and recovery options.
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                width: 30, height: 30, borderRadius: 15, flexShrink: 0,
                background: 'oklch(1 0 0 / 0.05)',
                border: '1px solid oklch(1 0 0 / 0.08)',
                color: 'var(--fg-muted)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <X size={14} strokeWidth={2.5} />
            </button>
          </div>

          {/* Network strip */}
          <div style={{
            margin: '0 28px 18px', padding: '10px 14px',
            background: networkOk ? 'oklch(0.78 0.18 150 / 0.06)' : 'oklch(0.78 0.18 80 / 0.08)',
            border: `1px solid ${networkOk ? 'oklch(0.78 0.18 150 / 0.25)' : 'oklch(0.78 0.18 80 / 0.3)'}`,
            borderRadius: 10,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <Network size={13} style={{ color: networkOk ? 'oklch(0.85 0.16 150)' : 'oklch(0.85 0.16 80)' }} />
            <div style={{ flex: 1, ...F.mono, fontSize: 11, color: 'var(--fg)', letterSpacing: '0.02em' }}>
              <span style={{ color: 'var(--fg-subtle)', marginRight: 8 }}>NETWORK</span>
              {networkName}
              {!networkOk && <span style={{ color: 'oklch(0.85 0.16 80)', marginLeft: 8 }}>· Switch to Base Sepolia</span>}
            </div>
          </div>

          {/* Body */}
          <div style={{ padding: '0 28px 24px', display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '70vh', overflowY: 'auto' }}>

            {/* MAIN WALLET CARD */}
            <WalletCard
              kind="main"
              title="Main Wallet"
              subtitle={connector?.name || 'Connected wallet'}
              address={ownerAddress}
              eth={ownerEth}
              usdc={ownerUsdc}
              copied={copiedField === 'main'}
              onCopy={() => copy(ownerAddress, 'main')}
            />

            {/* VELO WALLET CARD */}
            {burner ? (
              <>
                <WalletCard
                  kind="velo"
                  title="Velo Trading Wallet"
                  subtitle="Derived from main · trades sign locally"
                  address={burner.veloAddress}
                  eth={veloEth}
                  usdc={veloUsdc}
                  copied={copiedField === 'velo'}
                  onCopy={() => copy(burner.veloAddress, 'velo')}
                />

                {/* Move funds to trading wallet — only show if main has USDC */}
                {ownerUsdc > 0 && (
                  <div style={{
                    padding: 14, borderRadius: 14,
                    background: 'linear-gradient(180deg, oklch(0.68 0.22 295 / 0.10), oklch(0.68 0.22 295 / 0.04))',
                    border: '1px solid oklch(0.68 0.22 295 / 0.25)',
                    display: 'flex', flexDirection: 'column', gap: 10,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ ...F.mono, fontSize: 11, color: 'var(--fg)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
                          Move to trading wallet
                        </div>
                        <div style={{ ...F.sans, fontSize: 12, color: 'var(--fg-muted)', marginTop: 4 }}>
                          ${ownerUsdc.toFixed(2)} mUSDC in main → trading
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={moveToTradingWallet}
                      disabled={movingFunds || ownerEth < 0.0005}
                      style={{
                        ...F.mono, width: '100%',
                        padding: '12px 16px', borderRadius: 12,
                        background: (movingFunds || ownerEth < 0.0005)
                          ? 'var(--chip-bg)'
                          : 'linear-gradient(100deg, oklch(0.78 0.20 150), oklch(0.68 0.22 160))',
                        border: 'none', color: '#fff',
                        fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
                        textTransform: 'uppercase' as const,
                        cursor: (movingFunds || ownerEth < 0.0005) ? 'not-allowed' : 'pointer',
                        opacity: (movingFunds || ownerEth < 0.0005) ? 0.5 : 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      }}
                    >
                      {movingFunds ? 'Moving…' : `Move $${ownerUsdc.toFixed(2)} mUSDC`}
                    </button>
                    {ownerEth < 0.0005 && (
                      <div style={{ ...F.mono, fontSize: 10, color: 'var(--fg-muted)', textAlign: 'center' as const }}>
                        Main wallet needs a tiny amount of ETH for gas first.
                      </div>
                    )}
                    {moveError && (
                      <div style={{ ...F.mono, fontSize: 10, color: 'var(--pnl-down)', textAlign: 'center' as const }}>
                        {moveError}
                      </div>
                    )}
                  </div>
                )}

                {/* Send / Bridge / Username action buttons */}
                <div style={{ display: 'flex', gap: 6 }}>
                  {onOpenSend && veloUsdc > 0 && (
                    <button
                      onClick={onOpenSend}
                      style={{
                        ...F.mono, flex: 1,
                        padding: '12px 8px', borderRadius: 12,
                        background: 'linear-gradient(100deg, oklch(0.68 0.22 295) 0%, oklch(0.70 0.22 340) 100%)',
                        border: 'none', color: '#fff',
                        fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                        textTransform: 'uppercase' as const, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                        boxShadow: '0 4px 12px -4px oklch(0.68 0.22 295 / 0.4)',
                      }}
                    >
                      <Send size={11} /> Send
                    </button>
                  )}
                  {onOpenBridge && (
                    <button
                      onClick={onOpenBridge}
                      style={{
                        ...F.mono, flex: 1,
                        padding: '12px 8px', borderRadius: 12,
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid var(--hairline-strong)', color: 'var(--fg)',
                        fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                        textTransform: 'uppercase' as const, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                      }}
                    >
                      <ExternalLink size={11} /> Bridge
                    </button>
                  )}
                  {onOpenUsername && (
                    <button
                      onClick={onOpenUsername}
                      style={{
                        ...F.mono, flex: 1,
                        padding: '12px 8px', borderRadius: 12,
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid var(--hairline-strong)', color: 'var(--fg)',
                        fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                        textTransform: 'uppercase' as const, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                      }}
                    >
                      <AtSign size={11} /> Handle
                    </button>
                  )}
                </div>

                {/* Private key section */}
                <div style={{
                  padding: 16, borderRadius: 14,
                  background: 'oklch(1 0 0 / 0.02)',
                  border: '1px solid oklch(1 0 0 / 0.06)',
                  display: 'flex', flexDirection: 'column', gap: 10,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <KeyRound size={13} style={{ color: 'var(--fg-muted)' }} />
                    <span style={{ ...F.mono, fontSize: 11, color: 'var(--fg)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Private Key</span>
                  </div>

                  {!revealed && !confirming && (
                    <>
                      <p style={{ ...F.sans, fontSize: 12.5, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.55 }}>
                        Export to import this wallet into MetaMask, Rabby, or as a backup. Anyone with this key controls your trading funds.
                      </p>
                      <button
                        onClick={() => setConfirming(true)}
                        style={ghostButton()}
                      >
                        <Eye size={11} /> Reveal Private Key
                      </button>
                    </>
                  )}

                  {confirming && !revealed && (
                    <>
                      <div style={{
                        padding: 12, borderRadius: 10,
                        background: 'oklch(0.66 0.22 25 / 0.06)',
                        border: '1px solid oklch(0.66 0.22 25 / 0.25)',
                        display: 'flex', alignItems: 'flex-start', gap: 10,
                      }}>
                        <AlertTriangle size={14} style={{ color: 'oklch(0.78 0.20 25)', flexShrink: 0, marginTop: 1 }} />
                        <p style={{ ...F.sans, fontSize: 12, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.55 }}>
                          Your private key gives full control of your trading funds. Never paste it into a website or share it. Make sure you're alone.
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => { setRevealed(true); setConfirming(false); }} style={dangerButton()}>
                          <Eye size={11} /> I understand — show me
                        </button>
                        <button onClick={() => setConfirming(false)} style={{ ...ghostButton(), flex: 0, minWidth: 90 }}>
                          Cancel
                        </button>
                      </div>
                    </>
                  )}

                  {revealed && privateKey && (
                    <>
                      <div style={{
                        padding: '10px 12px', borderRadius: 10,
                        background: 'oklch(0.66 0.22 25 / 0.06)',
                        border: '1px solid oklch(0.66 0.22 25 / 0.25)',
                        display: 'flex', alignItems: 'center', gap: 10,
                      }}>
                        <span style={{ ...F.mono, fontSize: 10.5, color: 'var(--fg)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {privateKey}
                        </span>
                        <button
                          onClick={() => copy(privateKey, 'pk')}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: '6px 10px', borderRadius: 8,
                            background: copiedField === 'pk' ? 'oklch(0.78 0.18 150 / 0.15)' : 'oklch(1 0 0 / 0.06)',
                            border: `1px solid ${copiedField === 'pk' ? 'oklch(0.78 0.18 150 / 0.4)' : 'oklch(1 0 0 / 0.08)'}`,
                            color: copiedField === 'pk' ? 'oklch(0.85 0.16 150)' : 'var(--fg-muted)',
                            cursor: 'pointer', ...F.mono, fontSize: 10, fontWeight: 600,
                          }}
                        >
                          {copiedField === 'pk' ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
                        </button>
                      </div>
                      <p style={{ ...F.sans, fontSize: 11.5, color: 'var(--fg-subtle)', margin: 0, lineHeight: 1.5 }}>
                        Import in MetaMask: <span style={{ color: 'var(--fg-muted)' }}>Account menu → Add account → Import account → Paste private key</span>
                      </p>
                      <button
                        onClick={() => { setRevealed(false); setConfirming(false); }}
                        style={ghostButton()}
                      >
                        <EyeOff size={11} /> Hide Key
                      </button>
                    </>
                  )}
                </div>

                {/* Re-derive */}
                <div style={{
                  padding: 16, borderRadius: 14,
                  background: 'oklch(1 0 0 / 0.02)',
                  border: '1px solid oklch(1 0 0 / 0.06)',
                  display: 'flex', flexDirection: 'column', gap: 10,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <RefreshCw size={13} style={{ color: 'var(--fg-muted)' }} />
                    <span style={{ ...F.mono, fontSize: 11, color: 'var(--fg)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Recover on this device</span>
                  </div>
                  <p style={{ ...F.sans, fontSize: 12.5, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.55 }}>
                    Sign once with your main wallet to re-derive your Velo wallet. Useful if you're on a new device or cleared browser data.
                  </p>
                  <button
                    onClick={handleRederive}
                    disabled={busy}
                    style={{ ...ghostButton(), opacity: busy ? 0.5 : 1, cursor: busy ? 'wait' : 'pointer' }}
                  >
                    <RefreshCw size={11} /> {busy ? 'Waiting for signature…' : 'Re-derive from Main Wallet'}
                  </button>
                  {error && (
                    <div style={{
                      padding: '8px 12px', borderRadius: 8,
                      background: 'oklch(0.6 0.22 25 / 0.08)',
                      border: '1px solid oklch(0.6 0.22 25 / 0.25)',
                      ...F.sans, fontSize: 11.5, color: 'oklch(0.78 0.18 25)', lineHeight: 1.5,
                    }}>{error}</div>
                  )}
                </div>
              </>
            ) : (
              <div style={{
                padding: 20, borderRadius: 14,
                background: 'oklch(1 0 0 / 0.02)',
                border: '1px dashed oklch(1 0 0 / 0.1)',
                ...F.sans, fontSize: 12.5, color: 'var(--fg-muted)', textAlign: 'center', lineHeight: 1.6,
              }}>
                You haven't created a Velo trading wallet yet.<br />
                Click <strong style={{ color: 'var(--fg)' }}>Deposit</strong> on the dashboard to set one up.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

// ─── WalletCard ──────────────────────────────────────────────────────────────

const WalletCard: React.FC<{
  kind: 'main' | 'velo';
  title: string; subtitle: string;
  address: string; eth: number; usdc: number;
  copied: boolean; onCopy: () => void;
}> = ({ kind, title, subtitle, address, eth, usdc, copied, onCopy }) => {
  const accent = kind === 'velo' ? 'oklch(0.78 0.18 295)' : 'oklch(0.82 0.16 200)';
  return (
    <div style={{
      padding: 16, borderRadius: 14,
      background: `linear-gradient(135deg, ${accent.replace(')', ' / 0.05)')}, oklch(1 0 0 / 0.01))`,
      border: `1px solid ${accent.replace(')', ' / 0.18)')}`,
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 10,
          background: `linear-gradient(135deg, ${accent}, ${accent.replace(')', ' / 0.7)')})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {kind === 'velo' ? <ShieldCheck size={16} color="#fff" /> : <Wallet size={16} color="#fff" />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...F.display, fontSize: 16, color: 'var(--fg)' }}>{title}</div>
          <div style={{ ...F.mono, fontSize: 10, color: 'var(--fg-subtle)', letterSpacing: '0.04em', marginTop: 1 }}>{subtitle}</div>
        </div>
      </div>

      {/* Address row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '9px 12px', borderRadius: 10,
        background: 'oklch(1 0 0 / 0.04)',
        border: '1px solid oklch(1 0 0 / 0.06)',
      }}>
        <span style={{ ...F.mono, fontSize: 11, color: 'var(--fg)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {address}
        </span>
        <button
          onClick={onCopy}
          aria-label="Copy address"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 9px', borderRadius: 7,
            background: copied ? 'oklch(0.78 0.18 150 / 0.15)' : 'oklch(1 0 0 / 0.05)',
            border: `1px solid ${copied ? 'oklch(0.78 0.18 150 / 0.4)' : 'oklch(1 0 0 / 0.08)'}`,
            color: copied ? 'oklch(0.85 0.16 150)' : 'var(--fg-muted)',
            cursor: 'pointer', ...F.mono, fontSize: 10, fontWeight: 600,
          }}
        >
          {copied ? <><Check size={10} /> Copied</> : <><Copy size={10} /> Copy</>}
        </button>
      </div>

      {/* Balances */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <BalanceTile label="ETH" value={eth.toFixed(5)} dim={eth === 0} />
        <BalanceTile label="USDC" value={usdc.toFixed(2)} accent={usdc > 0} />
      </div>
    </div>
  );
};

const BalanceTile: React.FC<{ label: string; value: string; dim?: boolean; accent?: boolean }> = ({ label, value, dim, accent }) => (
  <div style={{
    padding: '10px 12px', borderRadius: 10,
    background: 'oklch(1 0 0 / 0.03)',
    border: '1px solid oklch(1 0 0 / 0.05)',
  }}>
    <div style={F.label}>{label}</div>
    <div style={{
      ...F.mono, fontSize: 15, fontWeight: 700, marginTop: 3,
      color: accent ? 'oklch(0.85 0.16 150)' : (dim ? 'var(--fg-subtle)' : 'var(--fg)'),
    }}>{value}</div>
  </div>
);

// ─── Buttons ─────────────────────────────────────────────────────────────────

const ghostButton = (): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  width: '100%', padding: '11px 14px', borderRadius: 10,
  background: 'oklch(1 0 0 / 0.05)',
  border: '1px solid oklch(1 0 0 / 0.08)',
  color: 'var(--fg)', cursor: 'pointer',
  ...F.mono, fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
  transition: 'background 140ms',
});

const dangerButton = (): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  flex: 1, padding: '11px 14px', borderRadius: 10,
  background: 'oklch(0.66 0.22 25 / 0.12)',
  border: '1px solid oklch(0.66 0.22 25 / 0.4)',
  color: 'oklch(0.85 0.18 25)', cursor: 'pointer',
  ...F.mono, fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
});
