import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Fingerprint, Loader2, ArrowUpRight, Check, Wallet, ShieldCheck } from 'lucide-react';
import { Dialog } from './ui/Dialog';
import { supportsProductMotion } from './ui/ProductMotion';
import type { WalletSignInPhase } from '@/services/walletAuth';
import './VeloManagePositionModal.css';

const phases: Record<WalletSignInPhase, [string, string]> = {
  session: ['Connecting your session', 'Checking your saved sign-in.'],
  challenge: ['Preparing secure sign-in', 'Connecting to Velo.'],
  signature: ['Approve in your wallet', 'Open your wallet and approve the Velo sign-in message. No funds are moved.'],
  verification: ['Confirming your signature', 'Your wallet is connected. Finishing secure sign-in.'],
  profile: ['Welcome back', 'Loading your profile and trading account.'],
};
const steps=[{label:'Connect',Icon:Wallet},{label:'Approve',Icon:Fingerprint},{label:'Finish',Icon:ShieldCheck}];
export function WalletSignInDialog({ open, phase, onCancel, onSwitchWallet, onOpenWallet }: {
  open: boolean; phase: WalletSignInPhase; onCancel: () => void; onSwitchWallet: () => void; onOpenWallet: () => void;
}) {
  const [heading, description] = phases[phase];
  const reduced=useReducedMotion(),animated=!reduced&&supportsProductMotion();
  const step=phase==='signature'?1:phase==='verification'||phase==='profile'?2:0;
  const copy=<><h3>{heading}</h3><p>{description}</p></>;
  return <Dialog open={open} title="Sign in to Velo" onClose={onCancel} className="velo-glass-dialog velo-signin-dialog">
    <div className="velo-signin-content">
      <div className={`velo-signin-symbol${phase==='signature'?' is-awaiting':''}`}><Fingerprint size={30} strokeWidth={1.3}/><span aria-hidden="true"/></div>
      <ol className="signin-steps" aria-label="Sign-in progress">{steps.map(({label,Icon},index)=><li key={label} aria-current={index===step?'step':undefined} data-complete={index<step||undefined}><span>{index<step?<Check size={14}/>:<Icon size={14}/>}</span><small>{label}</small></li>)}</ol>
      <div className="signin-phase" aria-live="polite" aria-atomic="true">{animated?<AnimatePresence initial={false} mode="wait"><motion.div key={phase} initial={{opacity:0,y:5,filter:'blur(2px)'}} animate={{opacity:1,y:0,filter:'blur(0px)'}} exit={{opacity:0,y:-4}} transition={{duration:.16}}>{copy}</motion.div></AnimatePresence>:copy}</div>
      <div className="velo-signin-progress" role="status"><Loader2 size={14} className="velo-pending-spinner"/>{phase==='signature'?'Waiting for your wallet':'Connecting securely'}</div>
      {phase==='signature'&&<button type="button" className="velo-manage-action" onClick={onOpenWallet}>Open wallet connection<ArrowUpRight size={16}/></button>}
      <button type="button" className="velo-signin-alternative" onClick={onSwitchWallet}>Use a different wallet</button>
      <button type="button" className="velo-signin-cancel" onClick={onCancel}>Cancel sign-in</button>
    </div>
  </Dialog>;
}
