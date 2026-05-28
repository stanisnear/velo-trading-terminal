// VeloDepositModal.tsx
//
// Funds modal — handles BOTH same-chain transfers and cross-chain bridges
// inside a single unified Deposit/Withdraw UX.
//
// ────────────────────────────────────────────────────────────────────────────
// Why this file is bigger than batch 6:
//
// Batch 6 had a separate "Bridge" button on the dashboard that opened
// VeloBridgeModal. Stan flagged that as wrong UX: when you deposit into
// Coinbase/Binance, you pick a network and they hand you the right address.
// You never see a separate "bridge" affordance — it's just part of "deposit".
// Same for withdraw: you pick a destination network and an address.
//
// So this modal absorbs the cross-chain flow:
//   - Deposit tab has a NETWORK picker. Base Sepolia → simple ERC-20 transfer.
//     Other Sepolias → LayerZero V2 OFT bridge (mUSDC is an OFT, so the
//     burner address is the same on every chain — we just need to bridge it).
//   - Withdraw tab has a NETWORK picker. Base Sepolia → simple ERC-20 transfer
//     from burner. Other Sepolias → LayerZero V2 OFT bridge from burner.
//
// The dashboard's Bridge button is gone. VeloBridgeModal still exists in
// the repo for the wallet panel's advanced view but is no longer reachable
// from the main user flow.
// ────────────────────────────────────────────────────────────────────────────
//
// Tab 1 — Deposit: moves mUSDC from MAIN wallet → TRADING wallet.
//   • Base Sepolia (default): simple ERC-20 transferFrom main → burner.
//   • Other chain: user must be connected to that chain in their wallet,
//     we call LayerZero OFT send to bridge to the burner on Base. Address
//     stays the same across chains (it's the same EOA).
//
// Tab 2 — Withdraw: moves mUSDC from TRADING wallet → main wallet or custom address.
//   • Base Sepolia (default): silent burner transfer.
//   • Other chain: LayerZero OFT send from burner_base → recipient on target chain.
//
// In both cases the trading wallet (burner) IS the same address everywhere,
// so for cross-chain DEPOSITS we tell the user to either send from their
// existing wallet on that chain (showing the address + QR) OR sign a bridge
// from their main wallet if they're connected to that chain.

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi';
import {
  createWalletClient, http, isAddress, type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia, arbitrumSepolia, optimismSepolia, sepolia } from 'viem/chains';
import {
  X, Copy, Check, ExternalLink, Loader2, AlertCircle, QrCode, ChevronDown,
} from 'lucide-react';
import { fetchUsdcBalance, transferUsdc } from '@/services/veloUsdcService';
import { VELO_USDC_BASE, baseScanAddressUrl, baseScanTxUrl } from '@/services/veloPerpsService';
import { loadStoredBurner } from '@/services/veloBurnerWallet';
import { ensureBurnerGas } from '@/services/veloGasSponsor';
import {
  CHAIN_ID,
  CHAIN_LABEL,
  VELO_USDC_ADDRESS,
  type BridgeChain,
  quoteBridge,
  executeBridge,
} from '@/services/bridgeService';

const BASE_SEPOLIA_RPC =
  import.meta.env.VITE_BASE_SEPOLIA_RPC_URL || 'https://base-sepolia-rpc.publicnode.com';

const S = {
  mono:  { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1', fontVariantNumeric: 'tabular-nums' as const },
  label: { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700 as const, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)' } as React.CSSProperties,
  display: { fontFamily: 'var(--font-display)', fontStyle: 'italic' as const, letterSpacing: '-0.02em' },
};

type Tab = 'deposit' | 'withdraw';
type TxStep = 'IDLE' | 'PENDING' | 'SUCCESS' | 'ERROR';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: Tab;
  onSuccess?: (txHash: `0x${string}`, amount: number, type: Tab) => void;
}

// Chain ordering for the picker. Base Sepolia first because it's the home chain.
const CHAINS_ORDERED: BridgeChain[] = ['base_sepolia', 'arbitrum_sepolia', 'optimism_sepolia', 'ethereum_sepolia'];

// Map BridgeChain → viem Chain for createWalletClient on cross-chain ops.
const VIEM_CHAIN_BY_BRIDGE: Record<BridgeChain, any> = {
  base_sepolia: baseSepolia,
  arbitrum_sepolia: arbitrumSepolia,
  optimism_sepolia: optimismSepolia,
  ethereum_sepolia: sepolia,
};

// Short labels for the chain pills (less typing on mobile).
const CHAIN_SHORT: Record<BridgeChain, string> = {
  base_sepolia:     'Base',
  arbitrum_sepolia: 'Arbitrum',
  optimism_sepolia: 'Optimism',
  ethereum_sepolia: 'Ethereum',
};

// Color accents per chain (Base = blue, Arbitrum = ice, Optimism = red, Ethereum = grey)
const CHAIN_ACCENT: Record<BridgeChain, string> = {
  base_sepolia:     'oklch(0.68 0.18 240)',
  arbitrum_sepolia: 'oklch(0.78 0.10 220)',
  optimism_sepolia: 'oklch(0.66 0.22 25)',
  ethereum_sepolia: 'oklch(0.62 0.04 280)',
};

export const VeloDepositModal: React.FC<Props> = ({ isOpen, onClose, defaultTab = 'deposit', onSuccess }) => {
  const { address: mainAddress } = useAccount();
  const publicClient = usePublicClient();              // Base Sepolia client
  const { data: walletClient } = useWalletClient();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();

  const [tab, setTab] = useState<Tab>(defaultTab);
  const [burnerAddress, setBurnerAddress] = useState<`0x${string}` | null>(null);
  const [mainBalance, setMainBalance] = useState(0);     // Base Sepolia main balance
  const [tradingBalance, setTradingBalance] = useState(0);

  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<TxStep>('IDLE');
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [errMsg, setErrMsg] = useState('');
  const [copied, setCopied] = useState(false);

  // Network pickers — separate for each tab so toggling tabs doesn't blow away
  // the user's intent on the other tab.
  const [depositChain, setDepositChain] = useState<BridgeChain>('base_sepolia');
  const [withdrawChain, setWithdrawChain] = useState<BridgeChain>('base_sepolia');

  // Withdraw-specific
  const [withdrawDest, setWithdrawDest] = useState<'main' | 'custom'>('main');
  const [customAddress, setCustomAddress] = useState('');

  // Cross-chain quote for the current amount/chain pair, displayed inline.
  const [bridgeQuote, setBridgeQuote] = useState<{ nativeFee: bigint } | null>(null);
  const [quoteError, setQuoteError] = useState<string>('');

  const reset = useCallback(() => {
    setStep('IDLE'); setErrMsg(''); setTxHash(null); setAmount('');
    setBridgeQuote(null); setQuoteError('');
  }, []);

  // Balance reads must go through the mUSDC contract — fetchUsdcBalance signature
  // is (publicClient, usdcAddress, owner). Earlier builds dropped the contract
  // argument, which silently read from the wrong address and made both balances
  // render as $0 forever (visible in the Withdraw tab even with $1000 sitting
  // in the trading wallet).
  useEffect(() => {
    if (!isOpen) return;
    setTab(defaultTab);
    reset();
    if (!mainAddress || !publicClient) return;
    const burner = loadStoredBurner(mainAddress);
    if (!burner) { setBurnerAddress(null); return; }
    setBurnerAddress(burner.veloAddress);
    void loadBalances(burner.veloAddress);
    // Re-poll every 6s while the modal is open so deposits/withdraws confirm
    // visibly without the user closing and reopening.
    const handle = setInterval(() => loadBalances(burner.veloAddress), 6000);
    return () => clearInterval(handle);
  }, [isOpen, mainAddress, publicClient]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadBalances = async (burnerAddr: `0x${string}`) => {
    if (!publicClient || !mainAddress) return;
    try {
      const [main, trading] = await Promise.all([
        fetchUsdcBalance(publicClient, VELO_USDC_BASE, mainAddress),
        fetchUsdcBalance(publicClient, VELO_USDC_BASE, burnerAddr),
      ]);
      setMainBalance(main);
      setTradingBalance(trading);
    } catch (e) {
      console.warn('[VeloDepositModal] balance load failed', e);
    }
  };

  const refreshBalances = () => {
    if (!burnerAddress) return;
    void loadBalances(burnerAddress);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // ── Cross-chain quote effect ──────────────────────────────────────────────
  // When the user picks a non-Base chain and enters an amount, fetch the
  // LayerZero fee quote so we can display "+ ~0.0001 ETH gas fee" inline.
  // Pure UX info — the actual quote is also recomputed at execute time.
  useEffect(() => {
    const activeChain = tab === 'deposit' ? depositChain : withdrawChain;
    if (activeChain === 'base_sepolia') { setBridgeQuote(null); setQuoteError(''); return; }
    if (!publicClient || !burnerAddress || !amount) { setBridgeQuote(null); return; }
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) { setBridgeQuote(null); return; }
    // The source/dest depend on which tab we're on:
    //   Deposit:  user signs on `activeChain`, delivers to base_sepolia
    //   Withdraw: burner signs on base_sepolia, delivers to `activeChain`
    const source = tab === 'deposit' ? activeChain : 'base_sepolia';
    const dest   = tab === 'deposit' ? 'base_sepolia' : activeChain;
    const recipient = tab === 'deposit' ? burnerAddress : (withdrawDest === 'main' ? mainAddress : (isAddress(customAddress) ? customAddress as Address : burnerAddress));
    if (!recipient) return;

    let cancelled = false;
    setQuoteError('');
    // Quote requires a publicClient on the SOURCE chain. We have the Base client
    // from wagmi but need a fresh one for other chains. quoteBridge does a read
    // call so we can spin up a viem client on the fly.
    (async () => {
      try {
        const { createPublicClient, http: viemHttp } = await import('viem');
        const sourceChain = VIEM_CHAIN_BY_BRIDGE[source];
        const client = createPublicClient({ chain: sourceChain, transport: viemHttp() });
        const q = await quoteBridge(client as any, source, dest, recipient as Address, parsed);
        if (!cancelled) setBridgeQuote({ nativeFee: q.nativeFee });
      } catch (e: any) {
        if (!cancelled) setQuoteError(e?.shortMessage || e?.message || 'Could not quote bridge');
      }
    })();
    return () => { cancelled = true; };
  }, [tab, depositChain, withdrawChain, amount, burnerAddress, mainAddress, withdrawDest, customAddress, publicClient]);

  // ── DEPOSIT handlers ──────────────────────────────────────────────────────

  // Same-chain (Base Sepolia) deposit: standard ERC-20 transfer from MAIN → BURNER.
  const handleDepositBase = async () => {
    if (!walletClient || !publicClient || !burnerAddress || !mainAddress) return;
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) { setErrMsg('Enter an amount'); return; }
    if (parsed > mainBalance) { setErrMsg(`Max available: ${mainBalance.toFixed(2)} mUSDC`); return; }
    setStep('PENDING'); setErrMsg('');
    try {
      // If wallet is on a non-Base chain, switch first. Otherwise the tx is
      // submitted to the wrong network and disappears.
      if (chainId !== 84532) {
        try { await switchChainAsync({ chainId: 84532 }); }
        catch { throw new Error('Please switch your wallet to Base Sepolia'); }
      }
      const hash = await transferUsdc(walletClient as any, VELO_USDC_BASE, burnerAddress, parsed);
      setTxHash(hash);
      await publicClient.waitForTransactionReceipt({ hash });
      setStep('SUCCESS');
      onSuccess?.(hash, parsed, 'deposit');
      refreshBalances();
    } catch (e: any) {
      const msg = e?.shortMessage || e?.message || 'Transfer failed';
      if (msg.toLowerCase().includes('user rejected') || msg.toLowerCase().includes('user denied')) {
        setStep('IDLE');
      } else {
        setStep('ERROR'); setErrMsg(msg);
      }
    }
  };

  // Cross-chain deposit: user is on chain X, we LayerZero-bridge mUSDC to
  // the burner address on Base. The OFT contract on chain X is signed by the
  // user's MAIN wallet — gas paid by main wallet. mUSDC arrives in the burner
  // on Base after the LayerZero executor delivers (typically 1-3 min testnet).
  const handleDepositBridge = async () => {
    if (!walletClient || !mainAddress || !burnerAddress) return;
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) { setErrMsg('Enter an amount'); return; }
    setStep('PENDING'); setErrMsg('');
    try {
      const targetChainId = CHAIN_ID[depositChain];
      if (chainId !== targetChainId) {
        try { await switchChainAsync({ chainId: targetChainId }); }
        catch { throw new Error(`Please switch your wallet to ${CHAIN_LABEL[depositChain]}`); }
      }
      // Need a viem public client on the source chain for the quoteBridge call
      // inside executeBridge. Build one on the fly.
      const { createPublicClient, http: viemHttp } = await import('viem');
      const sourceChain = VIEM_CHAIN_BY_BRIDGE[depositChain];
      const sourcePublic = createPublicClient({ chain: sourceChain, transport: viemHttp() });
      const { txHash: hash } = await executeBridge(walletClient as any, sourcePublic as any, depositChain, 'base_sepolia', burnerAddress, parsed);
      setTxHash(hash);
      setStep('SUCCESS');
      // For bridge, onSuccess is called with the SOURCE-chain hash — the
      // destination credit happens async via LayerZero executor. The dashboard
      // polls and will pick up the new burner balance within 5s of arrival.
      onSuccess?.(hash, parsed, 'deposit');
    } catch (e: any) {
      const raw = e?.shortMessage || e?.message || 'Bridge failed';
      const lower = raw.toLowerCase();
      if (lower.includes('user rejected') || lower.includes('user denied')) {
        setStep('IDLE');
      } else if (lower.includes('insufficient funds') || lower.includes('exceeds the balance')) {
        // Wallet rejected because main wallet on source chain has no ETH for gas.
        // The generic message is unhelpful — replace with actionable guidance.
        setStep('ERROR');
        setErrMsg(`Not enough ETH on ${CHAIN_LABEL[depositChain]} to pay the LayerZero fee. Top up your main wallet on that chain and try again.`);
      } else {
        setStep('ERROR'); setErrMsg(raw);
      }
    }
  };

  // ── WITHDRAW handlers ─────────────────────────────────────────────────────

  // Same-chain (Base Sepolia) withdraw: silent burner-signed transfer.
  const handleWithdrawBase = async () => {
    if (!mainAddress || !publicClient) return;
    const burner = loadStoredBurner(mainAddress);
    if (!burner) { setErrMsg('Trading wallet not found'); setStep('ERROR'); return; }
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) { setErrMsg('Enter an amount'); return; }
    if (parsed > tradingBalance) { setErrMsg(`Max available: ${tradingBalance.toFixed(2)} mUSDC`); return; }
    const target: Address | null = withdrawDest === 'main'
      ? (mainAddress ?? null)
      : (isAddress(customAddress) ? (customAddress as Address) : null);
    if (!target) { setErrMsg('Enter a valid address'); return; }
    setStep('PENDING'); setErrMsg('');
    try {
      await ensureBurnerGas(publicClient, burner.veloAddress);
      const burnerWalletClient = createWalletClient({
        account: privateKeyToAccount(burner.privateKey),
        chain: baseSepolia,
        transport: http(BASE_SEPOLIA_RPC),
      });
      const hash = await transferUsdc(burnerWalletClient as any, VELO_USDC_BASE, target, parsed);
      setTxHash(hash);
      await publicClient.waitForTransactionReceipt({ hash });
      setStep('SUCCESS');
      onSuccess?.(hash, parsed, 'withdraw');
      refreshBalances();
    } catch (e: any) {
      setStep('ERROR'); setErrMsg(e?.shortMessage || e?.message || 'Withdraw failed');
    }
  };

  // Cross-chain withdraw: LayerZero send from BURNER on Base → recipient on target chain.
  // The burner pays the LayerZero native fee (in ETH) from its Base Sepolia balance.
  // ensureBurnerGas tops it up if needed.
  const handleWithdrawBridge = async () => {
    if (!mainAddress || !publicClient || !burnerAddress) return;
    const burner = loadStoredBurner(mainAddress);
    if (!burner) { setErrMsg('Trading wallet not found'); setStep('ERROR'); return; }
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) { setErrMsg('Enter an amount'); return; }
    if (parsed > tradingBalance) { setErrMsg(`Max available: ${tradingBalance.toFixed(2)} mUSDC`); return; }
    const target: Address | null = withdrawDest === 'main'
      ? (mainAddress ?? null)
      : (isAddress(customAddress) ? (customAddress as Address) : null);
    if (!target) { setErrMsg('Enter a valid address'); return; }
    setStep('PENDING'); setErrMsg('');
    try {
      // Top up burner gas — bridge native fee may be larger than typical sponsorship.
      await ensureBurnerGas(publicClient, burner.veloAddress);
      const burnerWalletClient = createWalletClient({
        account: privateKeyToAccount(burner.privateKey),
        chain: baseSepolia,
        transport: http(BASE_SEPOLIA_RPC),
      });
      const { txHash: hash } = await executeBridge(burnerWalletClient as any, publicClient as any, 'base_sepolia', withdrawChain, target, parsed);
      setTxHash(hash);
      setStep('SUCCESS');
      onSuccess?.(hash, parsed, 'withdraw');
      refreshBalances();
    } catch (e: any) {
      setStep('ERROR'); setErrMsg(e?.shortMessage || e?.message || 'Bridge withdraw failed');
    }
  };

  const handleDeposit  = () => depositChain  === 'base_sepolia' ? handleDepositBase()  : handleDepositBridge();
  const handleWithdraw = () => withdrawChain === 'base_sepolia' ? handleWithdrawBase() : handleWithdrawBridge();

  if (!isOpen) return null;

  const isDeposit = tab === 'deposit';
  const activeChain = isDeposit ? depositChain : withdrawChain;
  const setActiveChain = isDeposit ? setDepositChain : setWithdrawChain;
  const isCrossChain = activeChain !== 'base_sepolia';
  const activeBalance = isDeposit ? mainBalance : tradingBalance;

  // Format the LayerZero fee for inline display. nativeFee is in wei.
  const feeDisplay = bridgeQuote
    ? `~${(Number(bridgeQuote.nativeFee) / 1e18).toFixed(5)} ETH`
    : null;

  return createPortal(
    <>
    <style>{`
      @keyframes dm-in { from { opacity:0; transform:translateY(12px) scale(0.97) } to { opacity:1; transform:none } }
      @keyframes dm-bg { from { opacity:0 } to { opacity:1 } }
    `}</style>
    <div
      style={{ position:'fixed', inset:0, zIndex:70, display:'flex', alignItems:'center', justifyContent:'center', padding:16, background:'oklch(0 0 0 / 0.65)', backdropFilter:'blur(20px) saturate(1.4)', WebkitBackdropFilter:'blur(20px) saturate(1.4)', animation:'dm-bg 0.22s ease both' }}
      onClick={onClose}>
      <div
        style={{ width:'100%', maxWidth:460, borderRadius:28, background:'var(--modal-bg, rgba(14,15,22,0.97))', border:'1px solid var(--hairline-strong)', boxShadow:'0 0 0 1px oklch(0.55 0.24 295 / 0.1), 0 40px 100px -20px rgba(0,0,0,0.65), 0 1px 0 oklch(1 0 0 / 0.06) inset', backdropFilter:'blur(48px) saturate(1.5)', WebkitBackdropFilter:'blur(48px) saturate(1.5)', overflow:'hidden', maxHeight:'92vh', display:'flex', flexDirection:'column', animation:'dm-in 0.34s cubic-bezier(0.22,1,0.36,1) both', position:'relative' }}
        onClick={e => e.stopPropagation()}>

        {/* Velo accent stripe — violet→blue */}
        <div style={{ position:'absolute', top:0, left:0, right:0, height:2.5, zIndex:3, background:'linear-gradient(90deg, oklch(0.45 0.26 295) 0%, oklch(0.55 0.24 285) 35%, oklch(0.65 0.22 268) 70%, oklch(0.72 0.18 250) 100%)', flexShrink:0 }} />

        {/* Ambient depth glow */}
        <div style={{ position:'absolute', top:-60, right:-60, width:220, height:220, borderRadius:'50%', background:'radial-gradient(circle, oklch(0.55 0.24 295 / 0.06) 0%, transparent 70%)', pointerEvents:'none', zIndex:0 }} />

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'22px 22px 14px', flexShrink:0, position:'relative', zIndex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:38, height:38, borderRadius:12, background:'linear-gradient(135deg, oklch(0.45 0.26 295), oklch(0.65 0.22 268))', boxShadow:'0 4px 14px oklch(0.55 0.24 295 / 0.38)', display:'flex', alignItems:'center', justifyContent:'center', position:'relative', overflow:'hidden', flexShrink:0 }}>
              <div style={{ position:'absolute', inset:0, background:'radial-gradient(120% 80% at 25% 10%, rgba(255,255,255,0.28), transparent 55%)' }}/>
              <span style={{ fontFamily:'var(--font-display)', fontStyle:'italic', fontSize:18, color:'#fff', fontWeight:700, position:'relative', zIndex:1 }}>V</span>
            </div>
            <div>
              <span style={{ ...S.display, fontSize:20, color:'var(--fg)', fontWeight:400 }}>Funds</span>
              <div style={{ ...S.mono, fontSize:10, color:'var(--fg-subtle)', marginTop:2, letterSpacing:'0.08em', textTransform:'uppercase' as const }}>Deposit · Withdraw</div>
            </div>
          </div>
          <button onClick={onClose} style={{ width:30, height:30, borderRadius:9, background:'var(--chip-bg)', border:'1px solid var(--hairline-strong)', color:'var(--fg-muted)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'background 0.15s' }}
            onMouseEnter={e=>(e.currentTarget.style.background='var(--chip-bg-hover)')} onMouseLeave={e=>(e.currentTarget.style.background='var(--chip-bg)')}>
            <X size={14} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', margin:'0 18px 14px', background:'oklch(1 0 0 / 0.04)', borderRadius:14, padding:4, gap:4, flexShrink:0, position:'relative', zIndex:1 }}>
          {(['deposit', 'withdraw'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); reset(); }}
              style={{
                flex:1, padding:'9px 0', borderRadius:11, border:'none', cursor:'pointer',
                ...S.mono, fontSize:11, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase' as const,
                background: tab === t
                  ? t === 'deposit'
                    ? 'linear-gradient(135deg, oklch(0.45 0.26 295 / 0.35), oklch(0.65 0.22 268 / 0.25))'
                    : 'linear-gradient(135deg, oklch(0.55 0.20 230 / 0.3), oklch(0.65 0.18 210 / 0.2))'
                  : 'transparent',
                color: tab === t ? 'var(--fg)' : 'var(--fg-subtle)',
                boxShadow: tab === t ? '0 0 0 1px oklch(0.55 0.24 295 / 0.3) inset' : 'none',
                transition: 'all 0.18s',
              }}>
              {t === 'deposit' ? '↓ Deposit' : '↑ Withdraw'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ padding:'0 18px 18px', overflowY:'auto', flex:1, position:'relative', zIndex:1 }}>

          {/* Network picker — appears on BOTH tabs at the top, like every CEX */}
          {step !== 'SUCCESS' && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={S.label}>{isDeposit ? 'Source Network' : 'Destination Network'}</span>
                {isCrossChain && (
                  <span style={{ ...S.mono, fontSize: 9, color: 'var(--iris-violet)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
                    via LayerZero
                  </span>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                {CHAINS_ORDERED.map(c => {
                  const isActive = activeChain === c;
                  return (
                    <button key={c} onClick={() => { setActiveChain(c); reset(); }}
                      style={{
                        ...S.mono,
                        padding: '8px 0', borderRadius: 10, cursor: 'pointer',
                        fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
                        background: isActive ? `${CHAIN_ACCENT[c].replace(')', ' / 0.18)')}` : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${isActive ? CHAIN_ACCENT[c].replace(')', ' / 0.45)') : 'var(--hairline)'}`,
                        color: isActive ? CHAIN_ACCENT[c] : 'var(--fg-muted)',
                        transition: 'all 0.15s',
                      }}>
                      {CHAIN_SHORT[c]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Balance summary — only the SAME-chain balances on Base. For cross-chain
              deposits we don't know the user's balance on Optimism etc. without
              another RPC roundtrip, and it adds noise; skip and let the wallet
              show its own balance. */}
          {step !== 'SUCCESS' && !isCrossChain && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              {[
                { label: 'Main Wallet', val: mainBalance },
                { label: 'Trading Wallet', val: tradingBalance },
              ].map(({ label, val }) => (
                <div key={label} style={{ flex: 1, padding: '10px 12px', borderRadius:14, background:'var(--chip-bg)', border:'1px solid var(--hairline-strong)' }}>
                  <div style={S.label}>{label}</div>
                  <div style={{ ...S.mono, fontSize: 15, fontWeight: 700, color: 'var(--fg)', marginTop: 4 }}>${val.toFixed(2)}</div>
                  <div style={{ ...S.mono, fontSize: 9, color: 'var(--fg-subtle)', marginTop: 2 }}>mUSDC</div>
                </div>
              ))}
            </div>
          )}

          {/* SUCCESS state */}
          {step === 'SUCCESS' && txHash ? (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{ width:60, height:60, borderRadius:'50%', margin:'0 auto 16px', background:'oklch(0.80 0.18 150 / 0.1)', display:'flex', alignItems:'center', justifyContent:'center', border:'1.5px solid oklch(0.80 0.18 150 / 0.4)', boxShadow:'0 0 32px oklch(0.80 0.18 150 / 0.2)' }}>
                <Check size={26} style={{ color:'var(--pnl-up)' }} />
              </div>
              <div style={{ ...S.display, fontSize: 20, color: 'var(--fg)', marginBottom: 6 }}>
                {isDeposit
                  ? (isCrossChain ? 'Bridge initiated' : 'Deposit complete')
                  : (isCrossChain ? 'Bridge initiated' : 'Withdrawal complete')}
              </div>
              <div style={{ ...S.mono, fontSize: 12, color: 'var(--fg-muted)', marginBottom: 16, maxWidth: 320, marginLeft: 'auto', marginRight: 'auto' }}>
                ${parseFloat(amount).toFixed(2)} mUSDC{' '}
                {isCrossChain
                  ? `bridging — funds arrive on ${CHAIN_LABEL[isDeposit ? 'base_sepolia' : withdrawChain]} in 1-3 min`
                  : isDeposit ? 'moved to your trading wallet' : 'sent to destination'}
              </div>
              <a href={baseScanTxUrl(txHash)} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, ...S.mono, fontSize: 11, color: 'var(--iris-violet)', textDecoration: 'none', fontWeight: 700, marginBottom: 18, padding: '6px 12px', borderRadius: 8, background: 'oklch(0.55 0.24 295 / 0.1)', border: '1px solid oklch(0.55 0.24 295 / 0.3)' }}>
                View source tx <ExternalLink size={10} />
              </a>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={reset} style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid var(--hairline)', background: 'transparent', color: 'var(--fg)', ...S.mono, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, cursor: 'pointer' }}>
                  Again
                </button>
                <button onClick={onClose} style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, oklch(0.45 0.26 295), oklch(0.65 0.22 268))', color: '#fff', ...S.mono, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, cursor: 'pointer' }}>
                  Done
                </button>
              </div>
            </div>
          ) : isDeposit ? (
            // ─── DEPOSIT ────────────────────────────────────────────────────
            <>
              {/* Amount input */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={S.label}>Amount</span>
                  {!isCrossChain && (
                    <button onClick={() => setAmount(mainBalance.toFixed(2))} style={{ ...S.mono, fontSize: 9, color: 'var(--iris-violet)', background: 'transparent', border: 'none', cursor: 'pointer', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>Max</button>
                  )}
                </div>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', ...S.mono, fontSize: 14, color: 'var(--fg-muted)' }}>$</span>
                  <input
                    type="number" value={amount} onChange={e => setAmount(e.target.value)}
                    placeholder="0.00" disabled={step === 'PENDING'}
                    style={{ ...S.mono, width: '100%', padding: '13px 14px 13px 28px', borderRadius: 12, border: '1px solid var(--hairline)', background: 'rgba(255,255,255,0.04)', color: 'var(--fg)', fontSize: 16, boxSizing: 'border-box' as const, outline: 'none' }}
                  />
                </div>
              </div>

              {/* Quick amounts only on same-chain Base where we know the balance */}
              {!isCrossChain && (
                <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                  {[10, 50, 100, 500].map(a => (
                    <button key={a} onClick={() => setAmount(String(a))} disabled={a > mainBalance || step === 'PENDING'}
                      style={{ ...S.mono, flex: 1, padding: '7px 0', borderRadius: 8, border: '1px solid var(--hairline)', background: 'rgba(255,255,255,0.03)', color: 'var(--fg-muted)', fontSize: 10, fontWeight: 700, cursor: a > mainBalance ? 'not-allowed' : 'pointer', opacity: a > mainBalance ? 0.35 : 1 }}>
                      ${a}
                    </button>
                  ))}
                </div>
              )}

              {/* Cross-chain fee preview + gas warning. The fee row shows the
                  LayerZero native fee in source-chain ETH. The warning tells
                  the user they need that ETH in their main wallet on the
                  source chain — Velo only gas-sponsors Base Sepolia, so a
                  bridge from Optimism with $0 ETH on Optimism will fail
                  with "insufficient funds for gas" from their wallet. */}
              {isCrossChain && (
                <div style={{ padding: '10px 12px', borderRadius: 10, background: 'oklch(0.55 0.24 295 / 0.05)', border: '1px solid oklch(0.55 0.24 295 / 0.18)', marginBottom: 12 }}>
                  {feeDisplay && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ ...S.mono, fontSize: 11, color: 'var(--fg-muted)' }}>LayerZero fee</span>
                      <span style={{ ...S.mono, fontSize: 11, fontWeight: 700, color: 'var(--fg)' }}>{feeDisplay}</span>
                    </div>
                  )}
                  <div style={{ ...S.mono, fontSize: 10, color: 'rgba(255,180,60,0.85)', lineHeight: 1.45 }}>
                    Your main wallet must hold a small amount of ETH on {CHAIN_LABEL[depositChain]} to pay this fee. Velo only gas-sponsors Base Sepolia.
                  </div>
                </div>
              )}
              {isCrossChain && quoteError && (
                <div style={{ ...S.mono, fontSize: 10, color: 'var(--pnl-down)', marginBottom: 12 }}>
                  Quote unavailable: {quoteError}
                </div>
              )}

              {errMsg && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', marginBottom: 12, borderRadius: 8, background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.25)' }}>
                  <AlertCircle size={12} style={{ color: 'var(--pnl-down)' }} />
                  <span style={{ ...S.mono, fontSize: 11, color: 'var(--pnl-down)' }}>{errMsg}</span>
                </div>
              )}

              <button
                onClick={handleDeposit}
                disabled={step === 'PENDING' || !amount || parseFloat(amount) <= 0 || (!isCrossChain && parseFloat(amount) > mainBalance)}
                style={{
                  width: '100%', padding: 14, borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg, oklch(0.45 0.26 295), oklch(0.65 0.22 268))',
                  color: '#fff', ...S.mono, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
                  textTransform: 'uppercase' as const, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  opacity: (step === 'PENDING' || !amount || parseFloat(amount) <= 0 || (!isCrossChain && parseFloat(amount) > mainBalance)) ? 0.5 : 1,
                  transition: 'opacity 0.15s',
                }}>
                {step === 'PENDING'
                  ? <><Loader2 size={13} className="animate-spin" /> {isCrossChain ? 'Bridging…' : 'Confirming…'}</>
                  : isCrossChain
                    ? <>↓ Bridge ${amount || '0'} from {CHAIN_SHORT[depositChain]}</>
                    : <>↓ Deposit ${amount || '0'}</>}
              </button>

              {/* Divider + receive-address card. Only on Base — for cross-chain
                  deposits you can't just send tokens to the burner address from
                  any wallet, because the OFT model means a plain transfer on
                  Optimism stays on Optimism. The user MUST go through the
                  bridge button above. */}
              {!isCrossChain && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0' }}>
                    <div style={{ flex: 1, height: 1, background: 'var(--hairline)' }} />
                    <span style={{ ...S.label, opacity: 0.6 }}>Or send from anywhere</span>
                    <div style={{ flex: 1, height: 1, background: 'var(--hairline)' }} />
                  </div>
                  {burnerAddress ? (
                    <div style={{ padding: 14, borderRadius:14, background:'var(--chip-bg)', border:'1px solid var(--hairline-strong)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <div style={{ ...S.label, display: 'flex', alignItems: 'center', gap: 5 }}>
                          <QrCode size={11} /> Trading Wallet Address
                        </div>
                        <a href={baseScanAddressUrl(burnerAddress)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--fg-subtle)', lineHeight: 1 }}>
                          <ExternalLink size={11} />
                        </a>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <code style={{ ...S.mono, fontSize: 11, color: 'var(--fg)', wordBreak: 'break-all' as const, flex: 1 }}>{burnerAddress}</code>
                        <button onClick={() => handleCopy(burnerAddress)} style={{ flexShrink: 0, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--hairline)', background: copied ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.04)', cursor: 'pointer', color: copied ? 'var(--pnl-up)' : 'var(--fg-muted)', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 4 }}>
                          {copied ? <Check size={12} /> : <Copy size={12} />}
                        </button>
                      </div>
                      <div style={{ ...S.mono, fontSize: 10, color: 'rgba(255,180,60,0.8)', marginTop: 8 }}>
                        Base Sepolia only · mUSDC only · Sending other assets will be lost
                      </div>
                    </div>
                  ) : (
                    <div style={{ ...S.mono, fontSize: 12, color: 'var(--fg-muted)', textAlign: 'center' as const }}>
                      Complete onboarding to get your trading wallet address.
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            // ─── WITHDRAW ───────────────────────────────────────────────────
            <>
              {/* Destination picker */}
              <div style={{ marginBottom: 14 }}>
                <div style={S.label as React.CSSProperties}>Send to</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  {(['main', 'custom'] as const).map(d => (
                    <button key={d} onClick={() => setWithdrawDest(d)}
                      style={{ ...S.mono, flex: 1, padding: '9px 0', borderRadius: 10, cursor: 'pointer', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const,
                        background: withdrawDest === d ? 'oklch(0.68 0.22 295 / 0.18)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${withdrawDest === d ? 'oklch(0.68 0.22 295 / 0.45)' : 'var(--hairline)'}`,
                        color: withdrawDest === d ? 'var(--iris-violet)' : 'var(--fg-muted)',
                      }}>
                      {d === 'main' ? 'Main Wallet' : 'Custom Address'}
                    </button>
                  ))}
                </div>
                {withdrawDest === 'main' && mainAddress && (
                  <div style={{ marginTop: 8, padding: '9px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--hairline)', ...S.mono, fontSize: 11, color: 'var(--fg)' }}>
                    {mainAddress.slice(0, 8)}…{mainAddress.slice(-6)}
                    <span style={{ ...S.mono, fontSize: 9, color: 'var(--fg-subtle)', display: 'block', marginTop: 2 }}>
                      on {CHAIN_LABEL[withdrawChain]}
                    </span>
                  </div>
                )}
                {withdrawDest === 'custom' && (
                  <input
                    type="text" value={customAddress} onChange={e => setCustomAddress(e.target.value.trim())}
                    placeholder="0x…"
                    style={{ marginTop: 8, ...S.mono, width: '100%', padding: '9px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: `1px solid ${customAddress && !isAddress(customAddress) ? 'var(--pnl-down)' : 'var(--hairline)'}`, color: 'var(--fg)', fontSize: 11, outline: 'none', boxSizing: 'border-box' as const }}
                  />
                )}
              </div>

              {/* Amount input */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={S.label}>Amount</span>
                  <button onClick={() => setAmount(tradingBalance.toFixed(2))} style={{ ...S.mono, fontSize: 9, color: 'var(--iris-violet)', background: 'transparent', border: 'none', cursor: 'pointer', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>Max</button>
                </div>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', ...S.mono, fontSize: 14, color: 'var(--fg-muted)' }}>$</span>
                  <input
                    type="number" value={amount} onChange={e => setAmount(e.target.value)}
                    placeholder="0.00" disabled={step === 'PENDING'}
                    style={{ ...S.mono, width: '100%', padding: '13px 14px 13px 28px', borderRadius: 12, border: '1px solid var(--hairline)', background: 'rgba(255,255,255,0.04)', color: 'var(--fg)', fontSize: 16, boxSizing: 'border-box' as const, outline: 'none' }}
                  />
                </div>
              </div>

              {/* Cross-chain fee preview + sponsorship notice. On withdraws
                  the burner (on Base) pays the LayerZero fee — Velo's gas
                  sponsor tops up the burner before submit, so the user
                  doesn't need ETH anywhere. Just inform them. */}
              {isCrossChain && (
                <div style={{ padding: '10px 12px', borderRadius: 10, background: 'oklch(0.55 0.24 295 / 0.05)', border: '1px solid oklch(0.55 0.24 295 / 0.18)', marginBottom: 12 }}>
                  {feeDisplay && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ ...S.mono, fontSize: 11, color: 'var(--fg-muted)' }}>LayerZero fee</span>
                      <span style={{ ...S.mono, fontSize: 11, fontWeight: 700, color: 'var(--fg)' }}>{feeDisplay}</span>
                    </div>
                  )}
                  <div style={{ ...S.mono, fontSize: 10, color: 'var(--fg-subtle)', lineHeight: 1.45 }}>
                    Paid by your trading wallet on Base. Velo tops it up automatically — you don't need any ETH on {CHAIN_LABEL[withdrawChain]}.
                  </div>
                </div>
              )}
              {isCrossChain && quoteError && (
                <div style={{ ...S.mono, fontSize: 10, color: 'var(--pnl-down)', marginBottom: 12 }}>
                  Quote unavailable: {quoteError}
                </div>
              )}

              {errMsg && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', marginBottom: 12, borderRadius: 8, background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.25)' }}>
                  <AlertCircle size={12} style={{ color: 'var(--pnl-down)' }} />
                  <span style={{ ...S.mono, fontSize: 11, color: 'var(--pnl-down)' }}>{errMsg}</span>
                </div>
              )}

              <button
                onClick={handleWithdraw}
                disabled={step === 'PENDING' || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > tradingBalance || (withdrawDest === 'custom' && !isAddress(customAddress))}
                style={{
                  width: '100%', padding: 14, borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg, oklch(0.45 0.26 295), oklch(0.65 0.22 268))',
                  color: '#fff', ...S.mono, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
                  textTransform: 'uppercase' as const, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  opacity: (step === 'PENDING' || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > tradingBalance) ? 0.5 : 1,
                  transition: 'opacity 0.15s',
                }}>
                {step === 'PENDING'
                  ? <><Loader2 size={13} className="animate-spin" /> {isCrossChain ? 'Bridging…' : 'Confirming…'}</>
                  : isCrossChain
                    ? <>↑ Withdraw ${amount || '0'} to {CHAIN_SHORT[withdrawChain]}</>
                    : <>↑ Withdraw ${amount || '0'}</>}
              </button>

              <p style={{ ...S.mono, fontSize: 10, color: 'var(--fg-subtle)', marginTop: 12, textAlign: 'center' as const }}>
                {isCrossChain
                  ? `Funds arrive on ${CHAIN_LABEL[withdrawChain]} in 1-3 min via LayerZero.`
                  : 'Silent — no wallet popup required.'}
              </p>
            </>
          )}
        </div>
      </div>
    </div>,
    </>,
    document.body,
  );
};

// VeloWithdrawModal is an alias that opens the deposit modal on the withdraw tab.
// Keeps all the old call sites working without changes.
export const VeloWithdrawModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (txHash: `0x${string}`, amount: number) => void;
}> = ({ isOpen, onClose, onSuccess }) => (
  <VeloDepositModal
    isOpen={isOpen}
    onClose={onClose}
    defaultTab="withdraw"
    onSuccess={(hash, amount) => onSuccess?.(hash, amount)}
  />
);
