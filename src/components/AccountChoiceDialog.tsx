import React from 'react';
import { ArrowRight, Wallet, ArrowRightLeft } from 'lucide-react';
import { Dialog } from './ui/Dialog';

export function AccountChoiceDialog({ open, address, busy, onClose, onContinue, onSwitch }: {
  open: boolean; address?: string; busy: boolean; onClose: () => void;
  onContinue: () => void; onSwitch: () => void;
}) {
  return <Dialog open={open} title="Sign in to Velo" busy={busy} onClose={onClose}>
    <div className="account-choice">
      <p>Choose how you want to sign in.</p>
      {address && <button type="button" disabled={busy} onClick={onContinue}>
        <span className="account-choice__icon"><Wallet size={22} /></span><span className="account-choice__copy"><strong>Continue with connected wallet</strong><small>{address.slice(0, 6)}...{address.slice(-4)}</small></span><ArrowRight size={18} />
      </button>}
      <button type="button" disabled={busy} onClick={onSwitch}>
        <span className="account-choice__icon"><ArrowRightLeft size={22} /></span><span className="account-choice__copy"><strong>{address ? 'Use a different account' : 'Choose an account'}</strong><small>Wallet, email or social login</small></span><ArrowRight size={18} />
      </button>
      <style>{`.account-choice{padding:20px;display:grid;gap:12px;font-family:var(--font-sans)}.account-choice p{margin:0 0 6px;color:var(--fg-muted)}.account-choice button{display:flex;align-items:center;gap:14px;padding:16px;text-align:left;border:1px solid var(--hairline);border-radius:18px;background:var(--surface);color:var(--fg);cursor:pointer;transition:background 160ms,border-color 160ms,transform 160ms}.account-choice button:hover{background:var(--chip-bg);border-color:var(--accent)}.account-choice button:active{transform:scale(.99)}.account-choice button:disabled{cursor:wait}.account-choice__copy{flex:1;min-width:0}.account-choice__icon{display:grid;place-items:center;flex:0 0 42px;height:42px;border-radius:13px;background:var(--chip-bg);color:var(--accent-text)}.account-choice button>svg:last-child{transition:transform 180ms}.account-choice button:hover>svg:last-child{transform:translateX(3px)}.account-choice strong{display:block;font-size:14px;font-weight:600}.account-choice small{display:block;margin-top:5px;font-size:12px;color:var(--fg-muted)}@media(prefers-reduced-motion:reduce){.account-choice button{transition:none}}`}</style>
    </div>
  </Dialog>;
}
