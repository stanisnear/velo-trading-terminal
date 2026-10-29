import React, { useState } from 'react';
import { ArrowUpRight, ExternalLink, Link2 } from 'lucide-react';
import { TradingDialog } from './TradingDialog';
import { CopyButton } from './CopyButton';
import './DashboardAccount.css';

export function DashboardAccount({ wallet, engine, addressUrl }: {
  wallet?: string; engine: string; addressUrl: (address: string) => string;
}) {
  const [open, setOpen] = useState(false);
  return <section className="dashboard-account">
    <button type="button" className="dashboard-account-toggle" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <Link2 size={15} aria-hidden="true"/><span>On-chain account<small>Base Sepolia</small></span><ArrowUpRight size={15} aria-hidden="true"/>
    </button>
    <TradingDialog open={open} onClose={() => setOpen(false)} title="On-chain account" identity={<span>Base Sepolia · Trading engine V4</span>} footer={<button type="button" onClick={() => setOpen(false)}>Done</button>}>
      <div className="dashboard-account-links">
        {[...(wallet ? [{ label: 'Trading wallet', value: wallet }] : []), { label: 'Perps contract', value: engine }].map(({ label, value }) =>
          <div key={label}><p>{label}</p><div><a href={addressUrl(value)} target="_blank" rel="noopener noreferrer">{value.slice(0,6)}…{value.slice(-4)}<ExternalLink size={11}/></a><CopyButton value={value} label={`Copy ${label.toLowerCase()}`}/></div></div>)}
        {!wallet && <p>Connect your trading wallet to view its address.</p>}
      </div>
    </TradingDialog>
  </section>;
}
