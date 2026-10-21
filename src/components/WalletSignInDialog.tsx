import React from 'react';
import { Fingerprint, Loader2, ArrowUpRight } from 'lucide-react';
import { Dialog } from './ui/Dialog';
import type { WalletSignInPhase } from '@/services/walletAuth';
import './VeloManagePositionModal.css';

const phases: Record<WalletSignInPhase, [string, string]> = {
  session: ['Connecting your session', 'Checking your saved sign-in.'],
  challenge: ['Preparing secure sign-in', 'Connecting to Velo.'],
  signature: ['Approve in your wallet', 'Open your wallet and approve the Velo sign-in message. No funds are moved.'],
  verification: ['Confirming your signature', 'Your wallet is connected. Finishing secure sign-in.'],
  profile: ['Welcome back', 'Loading your profile and trading account.'],
};
export function WalletSignInDialog({ open, phase, onCancel, onSwitchWallet, onOpenWallet }: {
  open: boolean; phase: WalletSignInPhase; onCancel: () => void; onSwitchWallet: () => void; onOpenWallet: () => void;
}) {
  const [heading, description] = phases[phase];
  return <Dialog open={open} title="Sign in to Velo" onClose={onCancel} className="velo-glass-dialog velo-signin-dialog">
    <div className="velo-signin-content">
      <div className="velo-signin-symbol"><Fingerprint size={30} strokeWidth={1.3} /></div>
      <h3>{heading}</h3><p>{description}</p>
      <div className="velo-signin-progress" role="status"><Loader2 size={14} className="velo-pending-spinner" />{phase === 'signature' ? 'Waiting for your wallet' : 'Connecting securely'}</div>
      {phase === 'signature' && <button className="velo-manage-action" onClick={onOpenWallet}>Open wallet connection<ArrowUpRight size={16} /></button>}
      <button className="velo-signin-alternative" onClick={onSwitchWallet}>Use a different wallet</button>
      <button className="velo-signin-cancel" onClick={onCancel}>Cancel sign-in</button>
    </div>
  </Dialog>;
}
