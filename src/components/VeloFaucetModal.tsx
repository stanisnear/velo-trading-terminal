import React, { useEffect, useRef, useState } from 'react';
import { TradingDialog } from './ui/TradingDialog';
import { ActionContent } from './ui/ProductMotion';
import { WalletStatus } from './ui/WalletPresentation';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { ExternalLink } from 'lucide-react';
import { setupBurnerWallet } from '@/services/veloBurnerSetup';
import { loadStoredBurner } from '@/services/veloBurnerWallet';
import { fetchFaucetCooldown, fetchUsdcBalance } from '@/services/veloUsdcService';
import { VELO_USDC_BASE } from '@/services/veloPerpsService';
import { pendingTransaction, submittedTransactionHash } from '@/services/baseTransport.mjs';
import { supabase } from '@/services/supabaseStore';

export function VeloFaucetModal({ isOpen, onClose, userId, onReady }: {
  isOpen: boolean; onClose: () => void; userId?: string;
  onReady: (info: { address: `0x${string}`; hash: `0x${string}`; amount: number }) => void | Promise<void>;
}) {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient({ chainId: 84532 });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Claim test funds to your trading wallet.');
  const [error, setError] = useState('');
  const [hash, setHash] = useState<`0x${string}` | null>(null);
  const [done, setDone] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    if (!isOpen) return;
    setDone(false); setError(''); setStatus('Claim test funds to your trading wallet.');
    const burner = address && loadStoredBurner(address);
    setHash(burner ? pendingTransaction(burner.veloAddress)?.hash || null : null);
  }, [isOpen, address]);
  const claim = async () => {
    if (lock.current || !walletClient || !publicClient || !address || !userId) return;
    lock.current = true; setBusy(true); setError('');
    try {
      if (walletClient.chain?.id !== 84532) throw new Error('Switch your wallet to Base Sepolia to claim test funds.');
      const burner = loadStoredBurner(address);
      if (burner && !pendingTransaction(burner.veloAddress)) {
        const cooldown = await fetchFaucetCooldown(publicClient, VELO_USDC_BASE, burner.veloAddress);
        if (cooldown.availableAt > Date.now() / 1000) throw new Error(`Next claim available ${new Date(cooldown.availableAt * 1000).toLocaleString()}.`);
      }
      const result = await setupBurnerWallet({ walletClient, publicClient, ownerAddress: address,
        onWalletReady: async wallet => {
          const { error } = await supabase.from('profiles').update({ velo_wallet_address: wallet.veloAddress.toLowerCase() }).eq('id', userId);
          if (error) throw new Error('Could not save the trading wallet. Your keys remain on this device; please retry.');
        },
        onStep: step => setStatus(step === 'SIGNING' ? 'Confirm the wallet signature.' : step === 'SPONSOR_REQUEST' ? 'Funding testnet gas...' : step === 'CLAIMING_FAUCET' ? 'Confirming faucet claim...' : 'Checking transaction...'),
      });
      setHash(result.faucetTxHash);
      const balance = await fetchUsdcBalance(publicClient, VELO_USDC_BASE, result.burner.veloAddress);
      setDone(true); setStatus('Test funds confirmed in your trading wallet.');
      try {
        await onReady({ address: result.burner.veloAddress, hash: result.faucetTxHash, amount: balance });
      } catch {
        setError('Funds are confirmed. Activity is still syncing; no new claim is needed.');
      }
    } catch (e: any) {
      const pendingHash = submittedTransactionHash(e);
      if (pendingHash) setHash(pendingHash);
      setError(e?.shortMessage || e?.message || 'Claim failed. Please retry.');
    } finally { lock.current = false; setBusy(false); }
  };
  if (!isOpen) return null;
  return <TradingDialog open={isOpen} onClose={onClose} title="Testnet faucet" busy={busy} className="wallet-dialog faucet-dialog"
    identity={<><span>mUSDC</span><span className="trade-details-network">Base Sepolia</span></>}
    footer={<button type="button" className="wallet-button" data-primary="true" disabled={busy||!walletClient||!userId} onClick={done?onClose:()=>void claim()}><ActionContent pending={busy} pendingLabel="Confirming claim…">{done?'Done':hash?'Recover claim':'Claim mUSDC'}</ActionContent></button>}>
    <div className="wallet-stack"><WalletStatus state={busy?'pending':done?'success':error?'error':'idle'} title={done?'Funds confirmed':busy?'Preparing test funds':'Fund your trading wallet'}><p>{status}</p></WalletStatus>
      {error&&<p role="alert" className="wallet-error">{error}</p>}
      {hash&&<a className="wallet-link" style={{display:'inline-flex',gap:6,alignItems:'center',justifyContent:'center'}} href={`https://sepolia.basescan.org/tx/${hash}`} target="_blank" rel="noopener noreferrer">View transaction<ExternalLink size={13}/></a>}
    </div>
  </TradingDialog>;
}
