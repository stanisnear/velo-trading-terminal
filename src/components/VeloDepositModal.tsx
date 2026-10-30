import { AnimatedText } from './ui/AnimatedValue';
// Unified mUSDC deposit/withdrawal presentation. Same-chain and LayerZero
// transaction services remain below; tabs choose direction and network.

import React, { useEffect, useState, useCallback, useId, useRef } from 'react';
import { TradingDialog } from './ui/TradingDialog';
import { SegmentedControl } from './ui/SegmentedControl';
import { ActionContent, ContentDisclosure, MeasuredPanel } from './ui/ProductMotion';
import { CopyButton } from './ui/CopyButton';
import { TransferRoute, WalletStatus } from './ui/WalletPresentation';
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi';
import {
  createWalletClient, http, isAddress, type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia, arbitrumSepolia, optimismSepolia, sepolia } from 'viem/chains';
import {
  ExternalLink, ChevronDown,
} from 'lucide-react';
import { fetchUsdcBalance, transferUsdc } from '@/services/veloUsdcService';
import { VELO_USDC_BASE, baseScanAddressUrl, baseScanTxUrl } from '@/services/veloPerpsService';
import { loadStoredBurner } from '@/services/veloBurnerWallet';
import { requireBurnerGas as ensureBurnerGas } from '@/services/veloGasSponsor';
import { baseSepoliaTransport } from '@/services/baseTransport.mjs';
import { waitForSuccessfulReceipt } from '@/services/tradeReceipts';
import {
  CHAIN_ID,
  CHAIN_LABEL,
  VELO_USDC_ADDRESS,
  type BridgeChain,
  quoteBridge,
  executeBridge,
} from '@/services/bridgeService';

const BASE_SEPOLIA_RPC =
  import.meta.env.VITE_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';

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

export const VeloDepositModal: React.FC<Props> = ({ isOpen, onClose, defaultTab = 'deposit', onSuccess }) => {
  const { address: mainAddress } = useAccount();
  const publicClient = usePublicClient({ chainId: 84532 }); // Balance/receipt reads always use Base.
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
  const [receiveOpen, setReceiveOpen] = useState(false);
  const receiveId = useId(), amountId = useId(), addressId = useId();
  const submitLock = useRef(false);

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
      await waitForSuccessfulReceipt(publicClient, hash);
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
        transport: baseSepoliaTransport(BASE_SEPOLIA_RPC),
      });
      const hash = await transferUsdc(burnerWalletClient as any, VELO_USDC_BASE, target, parsed);
      setTxHash(hash);
      await waitForSuccessfulReceipt(publicClient, hash);
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
        transport: baseSepoliaTransport(BASE_SEPOLIA_RPC),
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
  const pending = step === 'PENDING';
  const parsed = Number(amount);
  const validAmount = Number.isFinite(parsed) && parsed > 0;
  const destination = withdrawDest === 'main' ? mainAddress : customAddress;
  const canSubmit = !pending && validAmount && !!mainAddress && !!burnerAddress && !!publicClient &&
    (isDeposit ? !!walletClient && (isCrossChain || parsed <= mainBalance) : parsed <= tradingBalance && !!destination && isAddress(destination));
  const feeDisplay = bridgeQuote ? `~${(Number(bridgeQuote.nativeFee) / 1e18).toFixed(5)} ETH` : null;
  const sourceChain = isDeposit ? depositChain : 'base_sepolia';
  const explorer = VIEM_CHAIN_BY_BRIDGE[sourceChain].blockExplorers.default.url;
  const submit = async () => {
    if (submitLock.current || !canSubmit) return;
    submitLock.current = true;
    try { await (isDeposit ? handleDeposit() : handleWithdraw()); }
    finally { submitLock.current = false; }
  };
  const success = step === 'SUCCESS' && !!txHash;
  return <TradingDialog open={isOpen} onClose={onClose} title="Funds" busy={pending} className="wallet-dialog funds-dialog"
    identity={<><span>mUSDC</span><span className="trade-details-network">Testnet</span></>}
    footer={success ? <><button type="button" className="wallet-button" onClick={reset}>Make another transfer</button><button type="button" className="wallet-button" data-primary="true" onClick={onClose}>Done</button></> :
      <button type="button" className="wallet-button" data-primary="true" disabled={!canSubmit} onClick={() => void submit()}>
        <ActionContent pending={pending} pendingLabel={isCrossChain ? 'Bridging…' : 'Confirming…'}>{isDeposit ? 'Deposit mUSDC' : 'Withdraw mUSDC'}</ActionContent>
      </button>}>
    <div className="wallet-tabs"><SegmentedControl label="Transfer direction" options={[{value:'deposit',label:'Deposit'},{value:'withdraw',label:'Withdraw'}]}
      value={tab} disabled={pending} onChange={value => {setTab(value as Tab);reset();setReceiveOpen(false);}}/></div>
    <MeasuredPanel><div className="wallet-stack">
      {success ? <WalletStatus state="success" title={isCrossChain ? 'Bridge submitted' : isDeposit ? 'Deposit confirmed' : 'Withdrawal confirmed'}>
        <p><AnimatedText text={parsed.toLocaleString(undefined,{maximumFractionDigits:6})}/> mUSDC {isCrossChain ? `is on its way to ${CHAIN_LABEL[isDeposit ? 'base_sepolia' : withdrawChain]}. Destination delivery is still pending.` : isDeposit ? 'moved to your trading wallet.' : 'sent to your destination.'}</p>
        <a className="wallet-link" href={`${explorer}/tx/${txHash}`} target="_blank" rel="noopener noreferrer">View source transaction <ExternalLink size={13}/></a>
      </WalletStatus> : <>
        <fieldset disabled={pending} className="wallet-stack">
          <div><span className="wallet-label">{isDeposit ? 'Deposit from' : 'Withdraw to'}</span>
            <SegmentedControl label={isDeposit ? 'Source network' : 'Destination network'} compact options={CHAINS_ORDERED.map(chain => ({value:chain,label:CHAIN_SHORT[chain]}))}
              value={activeChain} disabled={pending} onChange={value => {setActiveChain(value as BridgeChain);reset();setReceiveOpen(false);}}/>
          </div>
          <TransferRoute from={isDeposit ? 'Main wallet' : 'Trading wallet'} to={isDeposit ? 'Trading wallet' : withdrawDest === 'main' ? 'Main wallet' : 'Custom address'}
            fromAddress={isDeposit ? mainAddress : burnerAddress} toAddress={isDeposit ? burnerAddress : destination}/>
          {!isCrossChain && <div className="wallet-balance-grid">
            <div><small>Main wallet · mUSDC</small><strong>$<AnimatedText text={mainBalance.toFixed(2)}/></strong></div>
            <div><small>Trading wallet · mUSDC</small><strong>$<AnimatedText text={tradingBalance.toFixed(2)}/></strong></div>
          </div>}
          {!isDeposit && <div>
            <span className="wallet-label">Recipient</span>
            <SegmentedControl label="Withdrawal recipient" value={withdrawDest} disabled={pending} options={[{value:'main',label:'Main wallet'},{value:'custom',label:'Custom address'}]} onChange={value => setWithdrawDest(value as 'main'|'custom')}/>
            <ContentDisclosure id={addressId} open={withdrawDest==='custom'}><label className="wallet-label" htmlFor={`${addressId}-input`} style={{marginTop:12}}>Wallet address</label>
              <input id={`${addressId}-input`} className="wallet-field wallet-field--address" value={customAddress} onChange={event => setCustomAddress(event.target.value.trim())} placeholder="0x…" autoComplete="off" spellCheck={false} aria-invalid={!!customAddress&&!isAddress(customAddress)}/>
              {customAddress&&!isAddress(customAddress)&&<p className="wallet-note" style={{color:'var(--pnl-down)',marginTop:6}}>Enter a valid wallet address.</p>}
            </ContentDisclosure>
          </div>}
          <div>
            <div className="wallet-split"><label className="wallet-label" htmlFor={amountId}>Amount</label>
              {(!isDeposit||!isCrossChain)&&<button type="button" className="wallet-link" onClick={() => setAmount((isDeposit ? mainBalance : tradingBalance).toFixed(2))}>Max</button>}
            </div>
            <div className="wallet-amount"><input id={amountId} type="text" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value.replace(/[^0-9.]/g,''))} placeholder="0.00" autoComplete="off"/><span>mUSDC</span></div>
            {isDeposit&&!isCrossChain&&<div className="wallet-quick">{[10,50,100,500].map(value => <button type="button" key={value} disabled={value>mainBalance} onClick={() => setAmount(String(value))}>${value}</button>)}</div>}
            {validAmount&&(!isDeposit||!isCrossChain)&&parsed>(isDeposit?mainBalance:tradingBalance)&&<p className="wallet-note" style={{color:'var(--pnl-down)',marginTop:8}}>Amount exceeds your available wallet balance.</p>}
          </div>
        </fieldset>
        {isCrossChain&&<div className="wallet-info">
          <div className="wallet-split"><span>LayerZero fee</span><strong>{feeDisplay??'Enter an amount'}</strong></div>
          <p className="wallet-note" style={{marginTop:8}}>{isDeposit ? `Your main wallet needs ETH on ${CHAIN_LABEL[depositChain]} for the source-chain fee.` : 'The source-chain fee is paid by your trading wallet on Base.'} Destination delivery happens after the source transaction confirms.</p>
        </div>}
        {isCrossChain&&quoteError&&<div role="alert" className="wallet-error">Quote unavailable: {quoteError}</div>}
        {errMsg&&<div role="alert" className="wallet-error">{errMsg}</div>}
        {pending&&<WalletStatus state="pending" title={txHash?'Awaiting confirmation':'Preparing transfer'}><p>{txHash?'Your transaction has been submitted. Waiting for its receipt.':isDeposit?'Continue in your connected wallet when prompted.':'Your trading wallet is preparing the transfer.'}</p></WalletStatus>}
        {isDeposit&&!isCrossChain&&<section>
          <button type="button" className="wallet-disclosure-trigger" aria-expanded={receiveOpen} aria-controls={receiveId} onClick={() => setReceiveOpen(value=>!value)} disabled={pending}>Receive from another wallet<ChevronDown size={15}/></button>
          <ContentDisclosure open={receiveOpen} id={receiveId}><div className="wallet-section">
            <h3>Trading wallet address</h3>
            {burnerAddress ? <><div className="wallet-address-row"><code>{burnerAddress}</code><CopyButton value={burnerAddress} label="Copy trading wallet address"/></div><p className="wallet-note" style={{marginTop:12}}>Send mUSDC on Base Sepolia only.</p><a className="wallet-link" style={{display:'inline-flex',gap:6,marginTop:6}} href={baseScanAddressUrl(burnerAddress)} target="_blank" rel="noopener noreferrer">View wallet<ExternalLink size={13}/></a></> : <p className="wallet-note">Complete wallet setup to get your receiving address.</p>}
          </div></ContentDisclosure>
        </section>}
      </>}
    </div></MeasuredPanel>
  </TradingDialog>;
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
