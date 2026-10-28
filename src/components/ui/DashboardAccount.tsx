import React, { useId, useState } from 'react';
import { ChevronDown, ExternalLink, Link2 } from 'lucide-react';
import { ContentDisclosure } from './ProductMotion';
import { CopyButton } from './CopyButton';
import './DashboardAccount.css';

export function DashboardAccount({ wallet, engine, addressUrl }: {
  wallet?: string; engine: string; addressUrl: (address: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <section className="dashboard-account">
    <button type="button" className="dashboard-account-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
      <Link2 size={15} aria-hidden="true"/><span>On-chain account<small>Base Sepolia</small></span><ChevronDown size={15} aria-hidden="true"/>
    </button>
    <ContentDisclosure open={open} id={id}>
      <div className="dashboard-account-links">
        {[...(wallet ? [{ label: 'Trading wallet', value: wallet }] : []), { label: 'Perps contract', value: engine }].map(({ label, value }) =>
          <div key={label}><p>{label}</p><div><a href={addressUrl(value)} target="_blank" rel="noopener noreferrer">{value.slice(0,6)}…{value.slice(-4)}<ExternalLink size={11}/></a><CopyButton value={value} label={`Copy ${label.toLowerCase()}`}/></div></div>)}
        {!wallet && <p>Connect your trading wallet to view its address.</p>}
      </div>
    </ContentDisclosure>
  </section>;
}
