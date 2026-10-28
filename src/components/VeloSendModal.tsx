import { AnimatedText } from './ui/AnimatedValue';
import { builderAttribution } from '../services/baseBuilderAttribution.mjs';
/**
 * VeloSendModal — peer-to-peer mUSDC transfer.
 *
 * Recipient can be a wallet address OR a @username registered in
 * VeloRegistry. Live resolution + validation. Signs with the burner if one
 * exists (silent), else MetaMask popup.
 */
import React, { useEffect, useRef, useState, useId } from 'react';
import { TradingDialog } from './ui/TradingDialog';
import { ActionContent, MeasuredPanel } from './ui/ProductMotion';
import { TransferRoute, WalletStatus } from './ui/WalletPresentation';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { createWalletClient, isAddress, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { ArrowRight, ExternalLink } from 'lucide-react';
import { resolveUsername, validateUsername } from '@/services/usernameService';
import { loadStoredBurner } from '@/services/veloBurnerWallet';
import { ensureBurnerGas } from '@/services/veloGasSponsor';
import { VELO_USDC_BASE, baseScanTxUrl } from '@/services/veloPerpsService';
import { fetchUsdcBalance, VELO_USDC_ABI } from '@/services/veloUsdcService';
import { publicSupabase } from '@/services/supabaseStore';
import { baseSepoliaTransport, submittedTransactionHash } from '@/services/baseTransport.mjs';
import { waitForSuccessfulReceipt } from '@/services/tradeReceipts';
import { readPendingTransfer, savePendingTransfer, clearPendingTransfer } from '@/services/transferOutbox.mjs';

const BASE_SEPOLIA_RPC =
  import.meta.env.VITE_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';

type Step = 'IDLE' | 'SENDING' | 'DONE' | 'ERROR';
type ResolveState = 'idle' | 'checking' | 'address' | 'username_found' | 'username_unknown' | 'invalid';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Fallback wallet address from the Supabase profile — used when wagmi
   * hasn't reconnected yet (email-auth users, slow reconnect). Allows the
   * burner wallet to be loaded and used for signing even if useAccount()
   * returns undefined on the current render cycle.
   */
  walletAddress?: `0x${string}` | string;
  /**
   * Fires once the transfer is confirmed on-chain. Lets the host (App.tsx)
   * persist a notification row for both the sender and the recipient.
   */
  onSuccess?: (info: {
    txHash: `0x${string}`;
    recipientAddress: `0x${string}`;
    recipientHandle?: string;          // present if the recipient is a Velo user
    amount: number;                    // mUSDC, human-readable
  }) => void | Promise<void>;
}

export const VeloSendModal: React.FC<Props> = ({ isOpen, onClose, walletAddress: walletAddressProp, onSuccess }) => {
  const { address: wagmiAddress } = useAccount();
  const publicClient = usePublicClient({ chainId: 84532 });
  const { data: mainWalletClient } = useWalletClient();

  // Use wagmi address first; fall back to Supabase profile address so that
  // email-auth users (wagmi not yet reconnected) can still use their burner.
  const address = wagmiAddress ?? (walletAddressProp as `0x${string}` | undefined);

  const [recipientInput, setRecipientInput] = useState('');
  const [resolvedAddress, setResolvedAddress] = useState<`0x${string}` | null>(null);
  // The address we actually send to — prefers the recipient's trading (burner) wallet
  const [sendToAddress, setSendToAddress] = useState<`0x${string}` | null>(null);
  const [resolveState, setResolveState] = useState<ResolveState>('idle');
  const [amount, setAmount] = useState('');
  const [available, setAvailable] = useState(0);
  const [step, setStep] = useState<Step>('IDLE');
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const sendLock = useRef(false);
  const recipientId=useId(), amountId=useId();

  // Determine which wallet is sending (burner if exists, else main)
  const burner = address ? loadStoredBurner(address) : null;
  const senderAddress = burner?.veloAddress ?? address;
  const activeSender = useRef(senderAddress);
  activeSender.current = senderAddress;

  useEffect(() => {
    if (!isOpen || !senderAddress) return;
    setTxHash(null); setAmount(''); setRecipientInput(''); setStep('IDLE'); setErrorMsg('');
    const saved = readPendingTransfer(localStorage, senderAddress);
    if (!saved) return;
    setTxHash(saved.txHash); setAmount(String(saved.amount));
    setRecipientInput(saved.recipientAddress); setSendToAddress(saved.recipientAddress);
    setStep('ERROR'); setErrorMsg('A previous transfer is awaiting confirmation. Check it before sending another.');
  }, [isOpen, senderAddress]);

  // Read sender's mUSDC balance on open
  useEffect(() => {
    if (!isOpen || !publicClient || !senderAddress) return;
    fetchUsdcBalance(publicClient, VELO_USDC_BASE, senderAddress)
      .then(setAvailable)
      .catch(() => setAvailable(0));
  }, [isOpen, publicClient, senderAddress]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setRecipientInput('');
      setResolvedAddress(null);
      setSendToAddress(null);
      setResolveState('idle');
      setAmount('');
      setStep('IDLE');
      setTxHash(null);
      setErrorMsg('');
    }
  }, [isOpen]);

  // Live resolve recipient
  useEffect(() => {
    const raw = recipientInput.trim();
    let active = true;
    setResolvedAddress(null); setSendToAddress(null);
    if (!raw) { setResolveState('idle'); setResolvedAddress(null); return; }

    // Wallet address path
    if (raw.startsWith('0x') || raw.length === 42) {
      if (isAddress(raw)) {
        setResolvedAddress(raw as `0x${string}`);
        setSendToAddress(raw as `0x${string}`);
        setResolveState('address');
      } else {
        setResolvedAddress(null);
        setResolveState('invalid');
      }
      return;
    }

    // Username path
    const normalized = raw.startsWith('@') ? raw.slice(1).toLowerCase() : raw.toLowerCase();
    const err = validateUsername(normalized);
    if (err) { setResolveState('invalid'); setResolvedAddress(null); return; }
    if (!publicClient) return;
    setResolveState('checking');
    const handle = setTimeout(() => {
      // Profiles are authoritative for Velo handles. On-chain registration is
      // optional, and a typed address must never be silently redirected.
      (async () => {
        const { data, error } = await publicSupabase.from('profiles')
          .select('wallet_address,velo_wallet_address').ilike('username', normalized).maybeSingle();
        if (error) throw error;
        if (data) return data.velo_wallet_address || data.wallet_address;
        return resolveUsername(publicClient, normalized);
      })()
        .then((addr) => {
          if (!active) return;
          if (addr && isAddress(addr)) { setResolvedAddress(addr as `0x${string}`); setSendToAddress(addr as `0x${string}`); setResolveState('username_found'); }
          else { setResolvedAddress(null); setResolveState('username_unknown'); }
        })
        .catch(() => { if (active) { setResolvedAddress(null); setResolveState('username_unknown'); } });
    }, 400);
    return () => { active = false; clearTimeout(handle); };
  }, [recipientInput, publicClient]);

  if (!isOpen) return null;

  const amountNum = Number.isFinite(Number(amount)) ? Number(amount) : 0;
  // canSend: a burner-wallet session can sign without MetaMask being connected
  // at the wagmi layer. The only hard requirement is publicClient (for reading
  // balance and waiting for receipts) and a signing path (burner OR wagmi wallet).
  const hasSigningCapability = !!(burner || mainWalletClient);
  const canSend = resolvedAddress
    && sendToAddress
    && resolveState !== 'invalid'
    && resolveState !== 'username_unknown'
    && resolveState !== 'checking'
    && amountNum > 0
    && amountNum <= available
    && hasSigningCapability
    && publicClient;

  const confirmTransfer = async (hash: `0x${string}`) => {
    if (!publicClient || !senderAddress || !sendToAddress) return;
    await waitForSuccessfulReceipt(publicClient, hash);
    clearPendingTransfer(localStorage, senderAddress, hash);
    if (activeSender.current !== senderAddress) return;
    setStep('DONE');
    try {
      await onSuccess?.({ txHash: hash, recipientAddress: sendToAddress,
        recipientHandle: resolveState === 'username_found' ? recipientInput.replace(/^@/, '').toLowerCase() : undefined,
        amount: amountNum });
    } catch { setErrorMsg('Transfer confirmed. Activity history could not refresh yet.'); }
  };

  const checkConfirmation = async () => {
    if (!txHash || sendLock.current) return;
    sendLock.current = true; setStep('SENDING'); setErrorMsg('');
    try { await confirmTransfer(txHash); }
    catch (error: any) {
      if (error.message === 'Transaction reverted on-chain') {
        if (senderAddress) clearPendingTransfer(localStorage, senderAddress, txHash);
        setTxHash(null);
      }
      setErrorMsg(error.message || 'Confirmation is still unavailable.'); setStep('ERROR');
    } finally { sendLock.current = false; }
  };

  const handleSend = async () => {
    if (!sendToAddress || !publicClient || sendLock.current || !canSend || txHash) return;
    if (!burner && !mainWalletClient) {
      setErrorMsg('No wallet available to sign. Connect your wallet in the top-right corner first.');
      setStep('ERROR');
      return;
    }
    setStep('SENDING');
    setErrorMsg('');
    sendLock.current = true;
    try {
      // Pick signing client — burner preferred for silent UX, MetaMask fallback
      let signingClient;
      if (burner) {
        signingClient = createWalletClient({
          account: privateKeyToAccount(burner.privateKey),
          chain: baseSepolia,
          transport: baseSepoliaTransport(BASE_SEPOLIA_RPC),
        });
      } else if (mainWalletClient) {
        signingClient = mainWalletClient;
      } else {
        throw new Error('No wallet available to sign.');
      }

      // Pre-flight: make sure the signer has ETH for gas. If sending from the
      // burner and it's low, the sponsor tops it up before we transfer.
      if (burner) {
        const gas = await ensureBurnerGas(publicClient, burner.veloAddress);
        if (!gas.ok) throw new Error(gas.reason || 'Unable to fund transaction gas.');
      }

      const amountWei = parseUnits(amountNum.toFixed(6), 6);
      const hash = await signingClient.writeContract({ ...builderAttribution(signingClient.chain?.id),
        address: VELO_USDC_BASE,
        abi: VELO_USDC_ABI,
        functionName: 'transfer',
        args: [sendToAddress, amountWei],
        account: signingClient.account!,
        chain: baseSepolia,
      });
      setTxHash(hash);
      if (senderAddress) savePendingTransfer(localStorage, senderAddress, { txHash: hash, recipientAddress: sendToAddress, amount: amountNum });
      await confirmTransfer(hash);
    } catch (e: any) {
      const pendingHash = submittedTransactionHash(e);
      if (pendingHash) {
        setTxHash(pendingHash);
        try { if (senderAddress) savePendingTransfer(localStorage, senderAddress, { txHash: pendingHash, recipientAddress: sendToAddress, amount: amountNum }); } catch { /* The signed journal still guards the wallet. */ }
      }
      const msg = e?.shortMessage || e?.message || 'Send failed';
      if (/rejected|denied/i.test(msg)) setErrorMsg('You cancelled the transfer.');
      else if (/insufficient/i.test(msg)) setErrorMsg('Insufficient funds for this transfer.');
      else if (/exceeds the balance/i.test(msg)) setErrorMsg("Trading wallet doesn't have enough ETH for gas. Top up from main wallet.");
      else setErrorMsg(msg);
      setStep('ERROR');
    } finally { sendLock.current = false; }
  };

  const pending=step==='SENDING';
  const hint=resolveState==='checking'?'Looking up this Velo handle…':resolveState==='username_found'&&resolvedAddress?`Resolves to ${resolvedAddress.slice(0,6)}…${resolvedAddress.slice(-4)}`:resolveState==='address'?'Valid wallet address':resolveState==='invalid'?'Enter a valid wallet address or Velo handle.':resolveState==='username_unknown'?'This handle could not be found. Check it or use a wallet address.':'';
  return <TradingDialog open={isOpen} onClose={onClose} title="Send mUSDC" busy={pending} className="wallet-dialog send-dialog"
    identity={<><span>Wallet transfer</span><span className="trade-details-network">Base Sepolia</span></>}
    footer={step==='DONE'?<button type="button" className="wallet-button" data-primary="true" onClick={onClose}>Done</button>:step==='ERROR'?<button type="button" className="wallet-button" data-primary="true" onClick={()=>txHash?void checkConfirmation():setStep('IDLE')}>{txHash?'Check confirmation':'Try again'}</button>:
      <button type="button" className="wallet-button" data-primary="true" disabled={pending||!canSend} onClick={()=>void handleSend()}><ActionContent pending={pending} pendingLabel="Confirming transfer…">Send mUSDC<ArrowRight size={15}/></ActionContent></button>}>
    <MeasuredPanel><div className="wallet-stack">
      {step==='IDLE'&&<>
        <p className="wallet-note">Send to a Velo username or wallet address.</p>
        <div><label className="wallet-label" htmlFor={recipientId}>Recipient</label><input id={recipientId} className="wallet-field" value={recipientInput} onChange={event=>setRecipientInput(event.target.value)} placeholder="@username or 0x…" autoComplete="off" spellCheck={false} aria-describedby={`${recipientId}-hint`} aria-invalid={resolveState==='invalid'||resolveState==='username_unknown'}/>
          <p id={`${recipientId}-hint`} className="wallet-note" role="status" style={{marginTop:8,color:resolveState==='invalid'||resolveState==='username_unknown'?'var(--pnl-down)':'var(--fg-muted)'}}>{hint}</p>
        </div>
        <div><div className="wallet-split"><label className="wallet-label" htmlFor={amountId}>Amount</label><button type="button" className="wallet-link" onClick={()=>setAmount(available.toFixed(2))}>Max $<AnimatedText text={available.toFixed(2)}/></button></div>
          <div className="wallet-amount"><input id={amountId} type="text" inputMode="decimal" value={amount} onChange={event=>setAmount(event.target.value.replace(/[^0-9.]/g,''))} placeholder="0.00" autoComplete="off"/><span>mUSDC</span></div>
          {amountNum>available&&<p className="wallet-note" style={{color:'var(--pnl-down)',marginTop:8}}>Amount exceeds your wallet balance.</p>}
        </div>
        {sendToAddress&&<TransferRoute from={burner?'Trading wallet':'Main wallet'} to={resolveState==='username_found'?recipientInput:'Recipient'} fromAddress={senderAddress} toAddress={sendToAddress}/>}
      </>}
      {pending&&<WalletStatus state="pending" title={txHash?'Awaiting confirmation':'Sending mUSDC'}><p>Transferring $<AnimatedText text={amountNum.toFixed(2)}/> mUSDC. {txHash?'Waiting for the transaction receipt.':'Continue in your wallet if prompted.'}</p></WalletStatus>}
      {step==='DONE'&&<WalletStatus state="success" title="Transfer confirmed"><p>$<AnimatedText text={amountNum.toFixed(2)}/> mUSDC delivered.</p>{errorMsg&&<p>{errorMsg}</p>}</WalletStatus>}
      {step==='ERROR'&&<WalletStatus state={txHash?'pending':'error'} title={txHash?'Awaiting confirmation':'Transfer failed'}><p>{errorMsg}</p></WalletStatus>}
      {txHash&&<a className="wallet-link" style={{display:'inline-flex',justifyContent:'center',alignItems:'center',gap:6}} href={baseScanTxUrl(txHash)} target="_blank" rel="noopener noreferrer">View transaction<ExternalLink size={13}/></a>}
    </div></MeasuredPanel>
  </TradingDialog>;
};
