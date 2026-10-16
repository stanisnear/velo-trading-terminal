import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { CheckCircle2, ExternalLink, Loader2, X } from 'lucide-react';
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
  return createPortal(<div className="velo-modal-enter-backdrop" role="dialog" aria-modal="true" aria-labelledby="faucet-title"
    style={{ position: 'fixed', inset: 0, zIndex: 10050, background: 'var(--modal-overlay, rgba(0,0,0,.65))', backdropFilter: 'blur(16px)', display: 'grid', placeItems: 'center', padding: 16 }}>
    <section className="velo-modal-enter-card" style={{ width: 'min(100%, 420px)', background: 'var(--modal-bg)', border: '1px solid var(--hairline-strong)', borderRadius: 24, padding: 24, color: 'var(--fg)' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h2 id="faucet-title" style={{ fontFamily: 'var(--font-display)', fontSize: 28, margin: 0 }}>Testnet faucet</h2>
        <button aria-label="Close faucet" onClick={onClose} disabled={busy}><X size={20}/></button>
      </header>
      <div role="status" style={{ padding: '24px 0', lineHeight: 1.6 }}>
        {busy ? <Loader2 className="animate-spin" size={24}/> : done ? <CheckCircle2 size={24}/> : null}
        <p>{status}</p>
        {error && <p role="alert" style={{ color: 'var(--pnl-down)' }}>{error}</p>}
        {hash && <a href={`https://sepolia.basescan.org/tx/${hash}`} target="_blank" rel="noopener noreferrer">View transaction <ExternalLink size={14}/></a>}
      </div>
      <button className="velo-btn-primary" style={{ width: '100%', padding: 14 }} disabled={busy || !walletClient || !userId} onClick={done ? onClose : claim}>
        {busy ? 'Confirming...' : done ? 'Done' : hash ? 'Recover claim' : 'Claim mUSDC'}
      </button>
    </section>
  </div>, document.body);
}
