import { InterfaceSounds } from './ui/InterfaceSounds';
import { AnimatedText } from './ui/AnimatedValue';
import { builderAttribution } from '../services/baseBuilderAttribution.mjs';
// ═══════════════════════════════════════════════════════════════════════════════
// VELO SETTINGS MODAL — Wallet & Settings
// Deep glass · CSS-var theming · Velo sage and graphite palette
// ═══════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react';
import { useAccount, useBalance, useChainId, usePublicClient, useReadContract, useSignMessage, useWalletClient } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { TradingDialog } from './ui/TradingDialog';
import { SegmentedControl } from './ui/SegmentedControl';
import { ActionContent, MeasuredPanel } from './ui/ProductMotion';
import { CopyButton } from './ui/CopyButton';
import './ui/WalletPresentation.css';
import {
  Check, Eye, EyeOff, KeyRound, RefreshCw,
  Wallet, Network, ExternalLink, Send, AtSign, LogOut,
} from 'lucide-react';
import {
  loadStoredBurner, exportPrivateKey, rederiveVeloBurner,
  type VeloBurnerWallet,
} from '../services/veloBurnerWallet';
import { VELO_USDC_BASE as USDC_BASE_SEPOLIA } from '../services/veloPerpsService';
import { isConfigured as isSupabaseConfigured, supabase } from '../services/supabaseStore';

const ERC20_BAL_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'transfer', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
] as const;

const NETWORK_NAMES: Record<number, string> = {
  84532: 'Base Sepolia', 8453: 'Base', 1: 'Ethereum', 11155111: 'Sepolia', 10: 'Optimism', 42161: 'Arbitrum',
};


interface Props {
  isOpen: boolean; onClose: () => void;
  onOpenBridge?: () => void; onOpenUsername?: () => void; onOpenSend?: () => void;
  profile?: { id?: string; email?: string; username?: string; veloWalletAddress?: string } | null;
  onEmailSaved?: (email: string) => void;
  /** Fired after a successful re-derive so the parent can hydrate the trading
      layer (burnerAddress) and persist the address — without a page refresh. */
  onBurnerRecovered?: (veloAddress: `0x${string}`) => void;
  onLogout?: () => void;
}

export const SettingsModal: React.FC<Props> = ({ isOpen, onClose, onOpenBridge, onOpenUsername, onOpenSend, profile, onEmailSaved, onBurnerRecovered, onLogout }) => {
  const { address: ownerAddress, connector } = useAccount();
  const chainId = useChainId();
  const { signMessageAsync } = useSignMessage();
  const publicClient = usePublicClient({ chainId: 84532 });
  const { data: walletClient } = useWalletClient();

  const [burner, setBurner] = useState<VeloBurnerWallet | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [view, setView] = useState<'wallets'|'preferences'|'security'>('wallets');
  const [hideBalances, setHideBalances] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [movingFunds, setMovingFunds] = useState(false);
  const [moveError, setMoveError] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailSaved, setEmailSaved] = useState(false);
  const [emailError, setEmailError] = useState('');
  const supabaseReady = isSupabaseConfigured();

  useEffect(() => {
    if (!isOpen) return;
    setError(''); setRevealed(false); setConfirming(false); setView('wallets'); setHideBalances(false);
    setEmailSaved(false); setEmailError('');
    setEmailInput(profile?.email || '');
    if (ownerAddress) setBurner(loadStoredBurner(ownerAddress));
  }, [isOpen, ownerAddress, profile?.id]);

  useEffect(() => {
    if (!isOpen || !supabaseReady || !profile?.id) return;
    let cancelled = false;
    void Promise.resolve(supabase.rpc('get_my_contact_email')).then(({ data, error }) => {
      if (!cancelled && !error && typeof data === 'string') setEmailInput(data);
    }).catch(() => { /* Keep the form usable if the contact service is unavailable. */ });
    return () => { cancelled = true; };
  }, [isOpen, supabaseReady, profile?.id]);

  const { data: ownerEthData }  = useBalance({ chainId: 84532, address: ownerAddress, query: { enabled: !!ownerAddress && isOpen, refetchInterval: 8000 } });
  const { data: ownerUsdcData } = useReadContract({ chainId: 84532, address: USDC_BASE_SEPOLIA as `0x${string}`, abi: ERC20_BAL_ABI, functionName: 'balanceOf', args: ownerAddress ? [ownerAddress as `0x${string}`] : undefined, query: { enabled: !!ownerAddress && isOpen, refetchInterval: 8000 } });
  const { data: veloEthData }   = useBalance({ chainId: 84532, address: burner?.veloAddress as `0x${string}` | undefined, query: { enabled: !!burner && isOpen, refetchInterval: 8000 } });
  const { data: veloUsdcData }  = useReadContract({ chainId: 84532, address: USDC_BASE_SEPOLIA as `0x${string}`, abi: ERC20_BAL_ABI, functionName: 'balanceOf', args: burner ? [burner.veloAddress as `0x${string}`] : undefined, query: { enabled: !!burner && isOpen, refetchInterval: 8000 } });

  if (!isOpen || !ownerAddress) return null;

  const ownerEth  = ownerEthData  ? parseFloat(formatUnits(ownerEthData.value, 18))    : 0;
  const ownerUsdc = ownerUsdcData ? parseFloat(formatUnits(ownerUsdcData as bigint, 6)) : 0;
  const veloEth   = veloEthData   ? parseFloat(formatUnits(veloEthData.value, 18))     : 0;
  const veloUsdc  = veloUsdcData  ? parseFloat(formatUnits(veloUsdcData as bigint, 6)) : 0;
  const networkName = NETWORK_NAMES[chainId] || `Chain ${chainId}`;
  const networkOk   = chainId === 84532;

  const moveToTradingWallet = async () => {
    if (!burner || !walletClient || !publicClient || !ownerAddress) return;
    if (ownerUsdc <= 0) { setMoveError('Nothing to move.'); return; }
    setMovingFunds(true); setMoveError('');
    try {
      if (veloEth < 0.002) {
        try {
          const r = await fetch('/api/sponsor-eth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ burnerAddress: burner.veloAddress }) });
          const d = await r.json();
          if (r.ok && d.sponsored && d.txHash) await publicClient.waitForTransactionReceipt({ hash: d.txHash });
        } catch {}
      }
      const amount = parseUnits(ownerUsdc.toFixed(6), 6);
      const hash = await walletClient.writeContract({ ...builderAttribution(walletClient.chain?.id), address: USDC_BASE_SEPOLIA as `0x${string}`, abi: ERC20_BAL_ABI, functionName: 'transfer', args: [burner.veloAddress, amount] });
      await publicClient.waitForTransactionReceipt({ hash });
    } catch (e: any) {
      const msg = e?.shortMessage || e?.message || 'Move failed';
      if (/rejected|denied/i.test(msg)) setMoveError('You cancelled the transfer.');
      else if (/insufficient/i.test(msg)) setMoveError('Not enough ETH for gas.');
      else setMoveError(msg);
    } finally { setMovingFunds(false); }
  };

  const handleRederive = async () => {
    setBusy(true); setError('');
    try {
      const b = await rederiveVeloBurner(ownerAddress as `0x${string}`, signMessageAsync as any, profile?.veloWalletAddress);
      setBurner(b); setBusy(false);
      // Hydrate the parent app's trading layer (burnerAddress) + persist, so the
      // dashboard/trading work immediately without a page refresh.
      onBurnerRecovered?.(b.veloAddress as `0x${string}`);
    } catch (e: any) {
      setBusy(false);
      setError(e?.message?.includes('rejected') ? 'You cancelled the signature.' : (e?.message || 'Could not re-derive wallet.'));
    }
  };

  const privateKey = revealed && view==='security' ? exportPrivateKey(ownerAddress) : null;
  const working = busy || movingFunds || emailSaving;
  const close = () => {setRevealed(false);setConfirming(false);onClose();};
  const saveEmail = async () => {
    if (emailSaving) return;
    const email = emailInput.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {setEmailError('Enter a valid email address.');return;}
    setEmailSaving(true);setEmailError('');
    try {
      const {error} = await supabase!.rpc('set_my_contact_email',{contact_email:email});
      if (error) throw error;
      setEmailSaved(true);onEmailSaved?.(email);
    } catch {setEmailError('Could not save your email. Please try again.');}
    finally {setEmailSaving(false);}
  };
  const recovery = <section className="wallet-section">
    <h3>Recover on this device</h3>
    <p className="wallet-note">Use the same owner wallet to attempt recovery. Keep a private-key backup: another wallet app may produce a different signature.</p>
    <button type="button" className="wallet-button" style={{width:'100%',marginTop:14}} disabled={working} onClick={() => void handleRederive()}>
      <ActionContent pending={busy} pendingLabel="Waiting for signature…"><RefreshCw size={15}/>Recover trading wallet</ActionContent>
    </button>
    {error&&<p role="alert" className="wallet-error" style={{marginTop:12}}>{error}</p>}
  </section>;
  return <TradingDialog open={isOpen} onClose={close} busy={working} title="Wallet & settings" className="wallet-dialog settings-dialog"
    identity={<><span>{connector?.name || 'Connected wallet'}</span><span className="trade-details-network" style={{color:networkOk?'var(--fg-muted)':'var(--pnl-down)'}}><Network size={12}/>{networkName}</span></>}
    footer={<>{onLogout&&<button type="button" className="wallet-button" data-danger="true" disabled={working} onClick={()=>{close();onLogout();}}><LogOut size={15}/>Sign out</button>}<button type="button" className="wallet-button" data-primary="true" disabled={working} onClick={close}>Done</button></>}>
    <div className="wallet-tabs"><SegmentedControl label="Wallet settings section" value={view} disabled={working}
      options={[{value:'wallets',label:'Wallets'},{value:'preferences',label:'Preferences'},{value:'security',label:'Security'}]}
      onChange={value=>{setView(value as typeof view);setRevealed(false);setConfirming(false);}}/></div>
    <MeasuredPanel><div className="wallet-stack">
      {!networkOk&&<div className="wallet-info">Your wallet is on {networkName}. Funding and trading use Base Sepolia.</div>}
      {view==='wallets'&&<>
        <div className="wallet-split"><span className="wallet-label">Your accounts</span><button type="button" className="wallet-link settings-balance-privacy" aria-label={hideBalances?'Show wallet balances':'Hide wallet balances'} aria-pressed={hideBalances} onClick={()=>setHideBalances(value=>!value)}>{hideBalances?<Eye size={15}/>:<EyeOff size={15}/>}</button></div>
        <WalletCard title="Main wallet" subtitle={connector?.name||'Connected wallet'} address={ownerAddress} eth={ownerEth} usdc={ownerUsdc} hidden={hideBalances}/>
        {burner ? <>
          <WalletCard title="Trading wallet" subtitle="Signs Velo transactions on this device" address={burner.veloAddress} eth={veloEth} usdc={veloUsdc} hidden={hideBalances}/>
          <div className="wallet-controls">
            {onOpenSend&&<button type="button" className="wallet-button" disabled={veloUsdc<=0||working} title={veloUsdc<=0?'Deposit mUSDC to your trading wallet first':undefined} onClick={onOpenSend}><Send size={15}/>Send</button>}
            {onOpenBridge&&<button type="button" className="wallet-button" disabled={working} onClick={onOpenBridge}><ExternalLink size={15}/>Bridge</button>}
            {onOpenUsername&&<button type="button" className="wallet-button" disabled={working} onClick={onOpenUsername}><AtSign size={15}/>Username</button>}
          </div>
          {ownerUsdc>0&&<section className="wallet-section"><h3>Move funds to trading</h3><p className="wallet-note">Transfer your main wallet's mUSDC on Base Sepolia.</p>
            <button type="button" className="wallet-button" style={{width:'100%',marginTop:14}} data-primary="true" disabled={working||ownerEth<.0005||!networkOk} onClick={()=>void moveToTradingWallet()}>
              <ActionContent pending={movingFunds} pendingLabel="Confirming transfer…">Move {hideBalances?'mUSDC':`$${ownerUsdc.toFixed(2)}`}</ActionContent>
            </button>
            {!networkOk&&<p className="wallet-note" style={{marginTop:10}}>Switch your connected wallet to Base Sepolia to move funds.</p>}
            {ownerEth<.0005&&<p className="wallet-note" style={{marginTop:10}}>Your main wallet needs ETH for gas.</p>}
            {moveError&&<p role="alert" className="wallet-error" style={{marginTop:10}}>{moveError}</p>}
          </section>}
        </> : <><div className="wallet-info">No trading wallet was found on this device. Recover an existing wallet below, or use the dashboard faucet to set one up.</div>{recovery}</>}
      </>}
      {view==='preferences'&&<>
        <section className="wallet-section"><InterfaceSounds/></section>
        {supabaseReady&&profile!==undefined&&<section className="wallet-section"><h3>Contact email</h3><p className="wallet-note">Optional account contact. Automated email alerts are not available yet.</p>
          <label className="wallet-label" htmlFor="settings-contact-email" style={{marginTop:14}}>Email address</label>
          <input id="settings-contact-email" type="email" className="wallet-field" value={emailInput} disabled={emailSaving} autoComplete="email" onChange={event=>{setEmailInput(event.target.value);setEmailError('');setEmailSaved(false);}} placeholder="you@example.com" aria-invalid={!!emailError}/>
          <button type="button" className="wallet-button" style={{width:'100%',marginTop:12}} disabled={emailSaving||!emailInput.trim()||emailInput.trim()===profile?.email} onClick={()=>void saveEmail()}>
            <ActionContent pending={emailSaving} pendingLabel="Saving…">{emailSaved?<><Check size={15}/>Saved</>:'Save email'}</ActionContent>
          </button>
          {emailError&&<p role="alert" className="wallet-error" style={{marginTop:10}}>{emailError}</p>}
        </section>}
      </>}
      {view==='security'&&<>
        {recovery}
        {burner&&<section className="wallet-section"><h3>Private-key backup</h3><p className="wallet-note">Anyone with this key controls your trading wallet. Keep it private.</p>
          {!revealed&&!confirming&&<button type="button" className="wallet-button" style={{width:'100%',marginTop:14}} onClick={()=>setConfirming(true)}><KeyRound size={15}/>Reveal private key</button>}
          {confirming&&!revealed&&<div style={{marginTop:14}}><div className="wallet-error">Only reveal your key when you are ready to store it securely. Never send it to anyone.</div>
            <div className="wallet-controls" style={{marginTop:12}}><button type="button" className="wallet-button" onClick={()=>setConfirming(false)}>Cancel</button><button type="button" className="wallet-button" data-danger="true" onClick={()=>{setRevealed(true);setConfirming(false);}}><Eye size={15}/>Reveal key</button></div>
          </div>}
          {revealed&&privateKey&&<><div className="wallet-address-row"><code>{privateKey}</code><CopyButton value={privateKey} label="Copy private key"/></div><button type="button" className="wallet-button" style={{width:'100%',marginTop:14}} onClick={()=>{setRevealed(false);setConfirming(false);}}><EyeOff size={15}/>Hide key</button></>}
        </section>}
      </>}
    </div></MeasuredPanel>
  </TradingDialog>;
};

function WalletCard({title,subtitle,address,eth,usdc,hidden}:{title:string;subtitle:string;address:string;eth:number;usdc:number;hidden:boolean}) {
  return <section className="wallet-section settings-wallet-card">
    <header><span className="settings-wallet-icon"><Wallet size={18}/></span><div><h3>{title}</h3><p className="wallet-note">{subtitle}</p></div></header>
    <div className="wallet-address-row"><code title={address}>{address.slice(0,8)}…{address.slice(-6)}</code><a className="wallet-link" href={`https://sepolia.basescan.org/address/${address}`} target="_blank" rel="noopener noreferrer" aria-label={`View ${title.toLowerCase()} on BaseScan`}><ExternalLink size={14}/></a><CopyButton value={address} label={`Copy ${title.toLowerCase()} address`}/></div>
    <div className="wallet-balance-grid" style={{marginTop:14}}>
      <div><small>mUSDC</small><strong>{hidden?'••••':<>$<AnimatedText text={usdc.toFixed(2)}/></>}</strong></div>
      <div><small>ETH</small><strong>{hidden?'••••':<AnimatedText text={eth.toFixed(5)}/>}</strong></div>
    </div>
  </section>;
}
