// ═══════════════════════════════════════════════════════════════════════════════
// VELO SETTINGS MODAL — Wallet & Settings
// Deep glass · CSS-var theming · Velo brand accent (violet→blue only)
// ═══════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react';
import { useAccount, useBalance, useChainId, usePublicClient, useReadContract, useSignMessage, useWalletClient } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { createPortal } from 'react-dom';
import {
  X, Copy, Check, Eye, EyeOff, AlertTriangle, KeyRound, RefreshCw,
  ShieldCheck, Wallet, Network, ExternalLink, Send, AtSign,
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

const F = {
  display: { fontFamily: 'var(--font-display)', fontStyle: 'italic' as const, letterSpacing: '-0.025em' } as React.CSSProperties,
  mono:    { fontFamily: 'var(--font-mono)' } as React.CSSProperties,
  sans:    { fontFamily: 'var(--font-sans)', letterSpacing: '-0.005em' } as React.CSSProperties,
  label:   { fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)' } as React.CSSProperties,
};

const NETWORK_NAMES: Record<number, string> = {
  84532: 'Base Sepolia', 8453: 'Base', 1: 'Ethereum', 11155111: 'Sepolia', 10: 'Optimism', 42161: 'Arbitrum',
};

// Shared Velo accent stripe — violet→blue, no rainbow
const VELO_STRIPE = 'linear-gradient(90deg, oklch(0.45 0.26 295) 0%, oklch(0.55 0.24 285) 35%, oklch(0.65 0.22 268) 70%, oklch(0.72 0.18 250) 100%)';

interface Props {
  isOpen: boolean; onClose: () => void;
  onOpenBridge?: () => void; onOpenUsername?: () => void; onOpenSend?: () => void;
  profile?: { id?: string; email?: string; username?: string; walletAddress?: string | null } | null;
  onEmailSaved?: (email: string) => void;
}

export const SettingsModal: React.FC<Props> = ({ isOpen, onClose, onOpenBridge, onOpenUsername, onOpenSend, profile, onEmailSaved }) => {
  const { address: connectedAddress, connector } = useAccount();
  const ownerAddress = (profile?.walletAddress || connectedAddress || null) as `0x${string}` | null;
  const chainId = useChainId();
  const { signMessageAsync } = useSignMessage();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [burner, setBurner] = useState<VeloBurnerWallet | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [copiedField, setCopiedField] = useState('');
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
    setError(''); setRevealed(false); setConfirming(false);
    setEmailSaved(false); setEmailError('');
    setEmailInput(profile?.email || '');
    setBurner(ownerAddress ? loadStoredBurner(ownerAddress) : null);
  }, [isOpen, ownerAddress, profile]);

  const { data: ownerEthData }  = useBalance({ address: ownerAddress, query: { enabled: !!ownerAddress && isOpen, refetchInterval: 8000 } });
  const { data: ownerUsdcData } = useReadContract({ address: USDC_BASE_SEPOLIA as `0x${string}`, abi: ERC20_BAL_ABI, functionName: 'balanceOf', args: ownerAddress ? [ownerAddress as `0x${string}`] : undefined, query: { enabled: !!ownerAddress && isOpen, refetchInterval: 8000 } });
  const { data: veloEthData }   = useBalance({ address: burner?.veloAddress as `0x${string}` | undefined, query: { enabled: !!burner && isOpen, refetchInterval: 8000 } });
  const { data: veloUsdcData }  = useReadContract({ address: USDC_BASE_SEPOLIA as `0x${string}`, abi: ERC20_BAL_ABI, functionName: 'balanceOf', args: burner ? [burner.veloAddress as `0x${string}`] : undefined, query: { enabled: !!burner && isOpen, refetchInterval: 8000 } });

  if (!isOpen || !ownerAddress) return null;

  const ownerEth  = ownerEthData  ? parseFloat(formatUnits(ownerEthData.value, 18))    : 0;
  const ownerUsdc = ownerUsdcData ? parseFloat(formatUnits(ownerUsdcData as bigint, 6)) : 0;
  const veloEth   = veloEthData   ? parseFloat(formatUnits(veloEthData.value, 18))     : 0;
  const veloUsdc  = veloUsdcData  ? parseFloat(formatUnits(veloUsdcData as bigint, 6)) : 0;
  const networkName = NETWORK_NAMES[chainId] || `Chain ${chainId}`;
  const networkOk   = chainId === 84532;

  const copy = async (text: string, key: string) => {
    try { await navigator.clipboard.writeText(text); setCopiedField(key); setTimeout(() => setCopiedField(''), 1400); } catch {}
  };

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
      const hash = await walletClient.writeContract({ address: USDC_BASE_SEPOLIA as `0x${string}`, abi: ERC20_BAL_ABI, functionName: 'transfer', args: [burner.veloAddress, amount] });
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
      const b = await rederiveVeloBurner(ownerAddress as `0x${string}`, signMessageAsync as any);
      setBurner(b); setBusy(false);
    } catch (e: any) {
      setBusy(false);
      setError(e?.message?.includes('rejected') ? 'You cancelled the signature.' : (e?.message || 'Could not re-derive wallet.'));
    }
  };

  const privateKey = revealed ? exportPrivateKey(ownerAddress) : null;

  return createPortal(
    <>
      <style>{`
        @keyframes sm-overlay { from { opacity:0 } to { opacity:1 } }
        @keyframes sm-card { from { opacity:0; transform:translateY(14px) scale(0.97) } to { opacity:1; transform:none } }
        .sm-ghost:hover { background: var(--chip-bg-hover) !important; border-color: oklch(0.55 0.24 295 / 0.35) !important; }
      `}</style>
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:9999, background:'oklch(0 0 0 / 0.62)', backdropFilter:'blur(20px) saturate(1.4)', WebkitBackdropFilter:'blur(20px) saturate(1.4)', display:'flex', alignItems:'center', justifyContent:'center', padding:20, overflowY:'auto', animation:'sm-overlay 0.22s ease both' }}>
        <div onClick={e => e.stopPropagation()} style={{ position:'relative', width:'100%', maxWidth:500, background:'var(--modal-bg, rgba(14,15,22,0.97))', borderRadius:28, border:'1px solid var(--hairline-strong)', boxShadow:'0 0 0 1px oklch(0.55 0.24 295 / 0.1), 0 40px 100px -20px rgba(0,0,0,0.65), 0 1px 0 oklch(1 0 0 / 0.07) inset', backdropFilter:'blur(48px) saturate(1.6)', WebkitBackdropFilter:'blur(48px) saturate(1.6)', overflow:'hidden', animation:'sm-card 0.36s cubic-bezier(0.22,1,0.36,1) both', color:'var(--fg)' }}>

          {/* Velo accent stripe — violet→blue only */}
          <div style={{ position:'absolute', top:0, left:0, right:0, height:2.5, zIndex:3, background:VELO_STRIPE }} />

          {/* Ambient depth glow */}
          <div style={{ position:'absolute', top:-80, right:-80, width:280, height:280, borderRadius:'50%', background:'radial-gradient(circle, oklch(0.55 0.24 295 / 0.05) 0%, transparent 70%)', pointerEvents:'none', zIndex:0 }} />

          {/* Header */}
          <div style={{ padding:'28px 28px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', position:'relative', zIndex:1 }}>
            <div style={{ display:'flex', alignItems:'center', gap:14 }}>
              <div style={{ width:44, height:44, borderRadius:14, flexShrink:0, background:'linear-gradient(135deg, oklch(0.45 0.26 295), oklch(0.65 0.22 268))', boxShadow:'0 6px 20px oklch(0.55 0.24 295 / 0.4), 0 1px 0 rgba(255,255,255,0.25) inset', display:'flex', alignItems:'center', justifyContent:'center', position:'relative', overflow:'hidden' }}>
                <div style={{ position:'absolute', inset:0, background:'radial-gradient(120% 80% at 25% 10%, rgba(255,255,255,0.3), transparent 55%)' }} />
                <span style={{ ...F.display, fontSize:22, color:'#fff', fontWeight:700, position:'relative', zIndex:1 }}>V</span>
              </div>
              <div>
                <h1 style={{ ...F.display, fontSize:24, fontWeight:400, color:'var(--fg)', margin:0, lineHeight:1.1 }}>Wallet & Settings</h1>
                <p style={{ ...F.mono, fontSize:10, color:'var(--fg-subtle)', margin:'3px 0 0', letterSpacing:'0.1em', textTransform:'uppercase' as const }}>Balances · Recovery · Preferences</p>
              </div>
            </div>
            <button onClick={onClose} style={{ width:32, height:32, borderRadius:10, flexShrink:0, background:'var(--chip-bg)', border:'1px solid var(--hairline-strong)', color:'var(--fg-muted)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'background 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.background='var(--chip-bg-hover)')} onMouseLeave={e => (e.currentTarget.style.background='var(--chip-bg)')}>
              <X size={14} strokeWidth={2.5} />
            </button>
          </div>

          {/* Network pill */}
          <div style={{ margin:'0 20px 14px', padding:'9px 14px', borderRadius:12, position:'relative', zIndex:1, background: networkOk ? 'oklch(0.80 0.18 150 / 0.06)' : 'oklch(0.76 0.14 60 / 0.08)', border:`1px solid ${networkOk ? 'oklch(0.80 0.18 150 / 0.22)' : 'oklch(0.76 0.14 60 / 0.28)'}`, display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:7, height:7, borderRadius:'50%', background: networkOk ? 'oklch(0.82 0.18 150)' : 'oklch(0.80 0.16 60)', boxShadow:`0 0 8px ${networkOk ? 'oklch(0.82 0.18 150 / 0.65)' : 'oklch(0.80 0.16 60 / 0.65)'}`, flexShrink:0 }} />
            <span style={{ ...F.mono, fontSize:11, color:'var(--fg)', flex:1 }}>
              <span style={{ color:'var(--fg-subtle)', marginRight:8, letterSpacing:'0.08em' }}>NETWORK</span>
              {networkName}
              {!networkOk && <span style={{ color:'oklch(0.82 0.16 60)', marginLeft:8 }}>· Switch to Base Sepolia</span>}
            </span>
          </div>

          {/* Body */}
          <div style={{ padding:'0 20px 26px', display:'flex', flexDirection:'column', gap:10, maxHeight:'68vh', overflowY:'auto', position:'relative', zIndex:1 }}>

            <WalletCard kind="main" title="Main Wallet" subtitle={connector?.name || 'Connected wallet'} address={ownerAddress} eth={ownerEth} usdc={ownerUsdc} copied={copiedField === 'main'} onCopy={() => copy(ownerAddress, 'main')} />

            {burner ? (<>
              <WalletCard kind="velo" title="Velo Trading Wallet" subtitle="Derived from main · signs locally" address={burner.veloAddress} eth={veloEth} usdc={veloUsdc} copied={copiedField === 'velo'} onCopy={() => copy(burner.veloAddress, 'velo')} />

              {ownerUsdc > 0 && (
                <Sect>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                    <div>
                      <div style={{ ...F.mono, fontSize:11, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase' as const, color:'var(--fg)' }}>Move to trading wallet</div>
                      <div style={{ ...F.sans, fontSize:12, color:'var(--fg-muted)', marginTop:3 }}>${ownerUsdc.toFixed(2)} mUSDC from main wallet</div>
                    </div>
                    <div style={{ ...F.display, fontSize:22, color:'oklch(0.82 0.16 150)', fontWeight:700 }}>${ownerUsdc.toFixed(0)}</div>
                  </div>
                  <VeloBtn onClick={moveToTradingWallet} disabled={movingFunds || ownerEth < 0.0005} variant="green">
                    {movingFunds ? 'Moving…' : `Move $${ownerUsdc.toFixed(2)} →`}
                  </VeloBtn>
                  {ownerEth < 0.0005 && <Note>Main wallet needs a small ETH balance for gas.</Note>}
                  {moveError && <ErrNote>{moveError}</ErrNote>}
                </Sect>
              )}

              <div style={{ flexShrink:0, display:'grid', gridTemplateColumns:`repeat(${[onOpenSend && veloUsdc>0, onOpenBridge, onOpenUsername].filter(Boolean).length}, 1fr)`, gap:8 }}>
                {onOpenSend && veloUsdc > 0 && <ActBtn onClick={onOpenSend} icon={<Send size={13}/>} label="Send" accent />}
                {onOpenBridge && <ActBtn onClick={onOpenBridge} icon={<ExternalLink size={13}/>} label="Bridge" />}
                {onOpenUsername && <ActBtn onClick={onOpenUsername} icon={<AtSign size={13}/>} label="Handle" />}
              </div>

              {supabaseReady && profile !== undefined && (
                <Sect>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--fg-muted)" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="2,4 12,13 22,4"/></svg>
                    <span style={F.label}>Notification Email</span>
                    <span style={{ marginLeft:'auto', ...F.mono, fontSize:9, color: profile?.email ? 'oklch(0.82 0.16 150)' : 'oklch(0.74 0.18 30)' }}>{profile?.email ? '● Saved' : '○ Not set'}</span>
                  </div>
                  <p style={{ ...F.sans, fontSize:12, color:'var(--fg-muted)', margin:'0 0 10px', lineHeight:1.55 }}>
                    {profile?.email ? 'Get notified when positions are filled, liquidated, or copied.' : 'Add an email to receive position and liquidation alerts.'}
                  </p>
                  <div style={{ display:'flex', gap:8 }}>
                    <input type="email" value={emailInput} onChange={e => { setEmailInput(e.target.value); setEmailError(''); setEmailSaved(false); }} placeholder={profile?.email || 'your@email.com'}
                      style={{ flex:1, padding:'10px 12px', background:'var(--chip-bg)', border:`1px solid ${emailError ? 'oklch(0.62 0.22 25)' : 'var(--hairline-strong)'}`, borderRadius:10, ...F.mono, fontSize:12, color:'var(--fg)', outline:'none' }} />
                    <button disabled={emailSaving || !emailInput.trim() || emailInput.trim() === profile?.email}
                      onClick={async () => {
                        const em = emailInput.trim().toLowerCase();
                        if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { setEmailError('Enter a valid email address'); return; }
                        setEmailSaving(true); setEmailError('');
                        try {
                          const { data: dup } = await supabase!.from('profiles').select('id').eq('email', em).maybeSingle();
                          if (dup && dup.id !== profile?.id) { setEmailError('Email already used'); return; }
                          const { data: { user } } = await supabase!.auth.getUser();
                          if (user) await supabase!.from('profiles').update({ email: em }).eq('id', user.id);
                          setEmailSaved(true); onEmailSaved?.(em);
                        } catch { setEmailError('Failed to save — try again.'); }
                        finally { setEmailSaving(false); }
                      }}
                      style={{ padding:'10px 14px', borderRadius:10, background: emailSaved ? 'oklch(0.78 0.18 150 / 0.15)' : 'var(--chip-bg)', border:`1px solid ${emailSaved ? 'oklch(0.78 0.18 150 / 0.3)' : 'var(--hairline-strong)'}`, ...F.mono, fontSize:11, fontWeight:700, color: emailSaved ? 'oklch(0.82 0.16 150)' : 'var(--fg)', cursor:'pointer', letterSpacing:'0.06em', opacity:(emailSaving || !emailInput.trim() || emailInput.trim() === profile?.email) ? 0.4 : 1 }}>
                      {emailSaving ? '…' : emailSaved ? '✓ Saved' : 'Save'}
                    </button>
                  </div>
                  {emailError && <ErrNote>{emailError}</ErrNote>}
                </Sect>
              )}

              <Sect>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                  <KeyRound size={13} style={{ color:'var(--fg-muted)' }} />
                  <span style={{ ...F.mono, fontSize:11, color:'var(--fg)', fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase' as const }}>Private Key</span>
                </div>
                {!revealed && !confirming && (
                  <>
                    <p style={{ ...F.sans, fontSize:12, color:'var(--fg-muted)', margin:'0 0 10px', lineHeight:1.55 }}>Export to import into MetaMask or Rabby. Anyone with this key controls your trading funds.</p>
                    <GhostBtn onClick={() => setConfirming(true)}><Eye size={11}/> Reveal Private Key</GhostBtn>
                  </>
                )}
                {confirming && !revealed && (
                  <>
                    <div style={{ padding:12, borderRadius:10, background:'oklch(0.66 0.22 25 / 0.07)', border:'1px solid oklch(0.66 0.22 25 / 0.22)', display:'flex', gap:10, marginBottom:10 }}>
                      <AlertTriangle size={14} style={{ color:'oklch(0.78 0.20 25)', flexShrink:0, marginTop:1 }} />
                      <p style={{ ...F.sans, fontSize:12, color:'var(--fg-muted)', margin:0, lineHeight:1.55 }}>Your private key gives full control of funds. Never share it.</p>
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                      <button onClick={() => { setRevealed(true); setConfirming(false); }} style={{ flex:1, padding:'11px 14px', borderRadius:10, background:'oklch(0.66 0.22 25 / 0.12)', border:'1px solid oklch(0.66 0.22 25 / 0.4)', color:'oklch(0.85 0.18 25)', cursor:'pointer', ...F.mono, fontSize:11, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                        <Eye size={11}/> I understand — show me
                      </button>
                      <GhostBtn onClick={() => setConfirming(false)} style={{ flex:'0 0 90px' as any }}>Cancel</GhostBtn>
                    </div>
                  </>
                )}
                {revealed && privateKey && (
                  <>
                    <div style={{ padding:'10px 12px', borderRadius:10, background:'oklch(0.66 0.22 25 / 0.06)', border:'1px solid oklch(0.66 0.22 25 / 0.22)', display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                      <span style={{ ...F.mono, fontSize:10.5, color:'var(--fg)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>{privateKey}</span>
                      <button onClick={() => copy(privateKey, 'pk')} style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 10px', borderRadius:8, background: copiedField==='pk' ? 'oklch(0.78 0.18 150 / 0.15)' : 'var(--chip-bg)', border:`1px solid ${copiedField==='pk' ? 'oklch(0.78 0.18 150 / 0.4)' : 'var(--hairline-strong)'}`, color: copiedField==='pk' ? 'oklch(0.85 0.16 150)' : 'var(--fg-muted)', cursor:'pointer', ...F.mono, fontSize:10, fontWeight:600 }}>
                        {copiedField==='pk' ? <><Check size={11}/> Copied</> : <><Copy size={11}/> Copy</>}
                      </button>
                    </div>
                    <GhostBtn onClick={() => { setRevealed(false); setConfirming(false); }}><EyeOff size={11}/> Hide Key</GhostBtn>
                  </>
                )}
              </Sect>

              <Sect>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                  <RefreshCw size={13} style={{ color:'var(--fg-muted)' }} />
                  <span style={{ ...F.mono, fontSize:11, color:'var(--fg)', fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase' as const }}>Recover on this device</span>
                </div>
                <p style={{ ...F.sans, fontSize:12, color:'var(--fg-muted)', margin:'0 0 10px', lineHeight:1.55 }}>Sign once with your main wallet to re-derive your Velo wallet — useful on a new device or after clearing browser data.</p>
                <GhostBtn onClick={handleRederive} disabled={busy} style={{ opacity:busy?0.5:1, cursor:busy?'wait':'pointer' }}>
                  <RefreshCw size={11}/> {busy ? 'Waiting for signature…' : 'Re-derive from Main Wallet'}
                </GhostBtn>
                {error && <ErrNote style={{ marginTop:8 }}>{error}</ErrNote>}
              </Sect>
            </>) : (
              <div style={{ padding:24, borderRadius:16, background:'var(--chip-bg)', border:'1px dashed var(--hairline-strong)', ...F.sans, fontSize:13, color:'var(--fg-muted)', textAlign:'center' as const, lineHeight:1.6 }}>
                No Velo trading wallet yet.<br/>Click <strong style={{ color:'var(--fg)' }}>Deposit</strong> on the dashboard to set one up.
              </div>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
};

const Sect: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ flexShrink:0, padding:'14px 16px', borderRadius:16, background:'oklch(1 0 0 / 0.025)', border:'1px solid var(--hairline-strong)' }}>{children}</div>
);
const Note: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--fg-muted)', margin:'8px 0 0', lineHeight:1.5 }}>{children}</p>
);
const ErrNote: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <p style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'oklch(0.72 0.20 25)', margin:'8px 0 0', lineHeight:1.5, ...style }}>{children}</p>
);
const VeloBtn: React.FC<{ onClick:()=>void; disabled?:boolean; variant?:'green'|'violet'; children:React.ReactNode }> = ({ onClick, disabled, variant='violet', children }) => (
  <button onClick={onClick} disabled={disabled} style={{ width:'100%', padding:'12px 16px', borderRadius:12, border:'none', background: disabled?'var(--chip-bg)':variant==='green'?'linear-gradient(100deg,oklch(0.72 0.18 150),oklch(0.65 0.20 160))':'linear-gradient(135deg,oklch(0.45 0.26 295),oklch(0.65 0.22 268))', color:disabled?'var(--fg-subtle)':'#fff', fontFamily:'var(--font-mono)', fontSize:11, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase' as const, cursor:disabled?'not-allowed':'pointer', opacity:disabled?0.5:1, boxShadow:disabled?'none':variant==='green'?'0 4px 16px -4px oklch(0.72 0.18 150 / 0.4)':'0 4px 16px -4px oklch(0.55 0.24 295 / 0.45)', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>{children}</button>
);
const GhostBtn: React.FC<{ onClick:()=>void; disabled?:boolean; children:React.ReactNode; style?: React.CSSProperties }> = ({ onClick, disabled, children, style }) => (
  <button onClick={onClick} disabled={disabled} className="sm-ghost" style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, width:'100%', padding:'11px 14px', borderRadius:10, background:'var(--chip-bg)', border:'1px solid var(--hairline-strong)', color:'var(--fg)', cursor:disabled?'not-allowed':'pointer', fontFamily:'var(--font-mono)', fontSize:11, fontWeight:600, letterSpacing:'0.06em', transition:'background 0.14s, border-color 0.14s', ...style }}>{children}</button>
);
const ActBtn: React.FC<{ onClick:()=>void; icon:React.ReactNode; label:string; accent?:boolean }> = ({ onClick, icon, label, accent }) => (
  <button onClick={onClick} style={{ padding:'12px 8px', borderRadius:12, border:accent?'none':'1px solid var(--hairline-strong)', background:accent?'linear-gradient(135deg,oklch(0.45 0.26 295),oklch(0.65 0.22 268))':'var(--chip-bg)', color:accent?'#fff':'var(--fg)', fontFamily:'var(--font-mono)', fontSize:10, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase' as const, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:5, boxShadow:accent?'0 4px 14px -4px oklch(0.55 0.24 295 / 0.4)':'none', transition:'opacity 0.14s' }}
    onMouseEnter={e=>(e.currentTarget.style.opacity='0.85')} onMouseLeave={e=>(e.currentTarget.style.opacity='1')}>
    {icon} {label}
  </button>
);

const WalletCard: React.FC<{ kind:'main'|'velo'; title:string; subtitle:string; address:string; eth:number; usdc:number; copied:boolean; onCopy:()=>void; }> = ({ kind, title, subtitle, address, eth, usdc, copied, onCopy }) => {
  const isVelo = kind === 'velo';
  const aL = isVelo ? 'oklch(0.45 0.26 295)' : 'oklch(0.50 0.18 220)';
  const aR = isVelo ? 'oklch(0.65 0.22 268)' : 'oklch(0.68 0.14 200)';
  return (
    <div style={{ flexShrink:0, padding:16, borderRadius:20, background:`linear-gradient(145deg, ${aL.replace(')','/ 0.08)')}, ${aR.replace(')','/ 0.03)')})`, border:`1px solid ${aL.replace(')','/ 0.22)')}`, boxShadow:`0 2px 16px -8px ${aL.replace(')','/ 0.18)')}`, position:'relative', overflow:'hidden' }}>
      <div style={{ position:'absolute', top:-30, right:-30, width:140, height:140, borderRadius:'50%', background:`radial-gradient(circle, ${aL.replace(')','/ 0.07)')}, transparent 65%)`, pointerEvents:'none' }} />
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
        <div style={{ width:40, height:40, borderRadius:13, flexShrink:0, background:`linear-gradient(135deg,${aL},${aR})`, boxShadow:`0 4px 16px -4px ${aL.replace(')','/ 0.4)')}`, display:'flex', alignItems:'center', justifyContent:'center', position:'relative', overflow:'hidden' }}>
          <div style={{ position:'absolute', inset:0, background:'radial-gradient(120% 80% at 25% 10%, rgba(255,255,255,0.28), transparent 55%)' }} />
          {isVelo ? <ShieldCheck size={18} color="#fff" style={{ position:'relative', zIndex:1 }}/> : <Wallet size={18} color="#fff" style={{ position:'relative', zIndex:1 }}/>}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontFamily:'var(--font-display)', fontStyle:'italic', fontSize:16, letterSpacing:'-0.02em', color:'var(--fg)' }}>{title}</div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--fg-subtle)', letterSpacing:'0.04em', marginTop:1 }}>{subtitle}</div>
        </div>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 12px', borderRadius:11, background:'oklch(0 0 0 / 0.06)', border:'1px solid var(--hairline)', marginBottom:10 }}>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--fg)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>{address}</span>
        <button onClick={onCopy} style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 9px', borderRadius:7, background: copied?'oklch(0.78 0.18 150 / 0.15)':'var(--chip-bg)', border:`1px solid ${copied?'oklch(0.78 0.18 150 / 0.4)':'var(--hairline-strong)'}`, color:copied?'oklch(0.85 0.16 150)':'var(--fg-muted)', cursor:'pointer', fontFamily:'var(--font-mono)', fontSize:10, fontWeight:600 }}>
          {copied ? <><Check size={10}/> Copied</> : <><Copy size={10}/> Copy</>}
        </button>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
        {[{label:'ETH',value:eth.toFixed(5),hi:false},{label:'USDC',value:usdc.toFixed(2),hi:usdc>0}].map(({label,value,hi})=>(
          <div key={label} style={{ padding:'10px 12px', borderRadius:11, background:'oklch(0 0 0 / 0.05)', border:'1px solid var(--hairline)' }}>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:9, fontWeight:700, textTransform:'uppercase' as const, letterSpacing:'0.12em', color:'var(--fg-subtle)' }}>{label}</div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:15, fontWeight:700, marginTop:3, color:hi?'oklch(0.82 0.16 150)':parseFloat(value)===0?'var(--fg-subtle)':'var(--fg)' }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
