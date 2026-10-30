import React,{useState} from 'react';
import { PieChart,ArrowUpRight,Wallet,Layers } from 'lucide-react';
import { TradingDialog } from './TradingDialog';
import { AnimatedValue,AnimatedText } from './AnimatedValue';
import './AccountOverview.css';

/** Read-only account composition. Available balance and position collateral form the ring; PnL is separate. */
export function AccountOverview({equity,available,margin,pnl,reserved=0}:{equity:number;available:number;margin:number;pnl:number;reserved?:number}){
 const[open,setOpen]=useState(false),[selected,setSelected]=useState<'available'|'margin'>('margin');
 const availablePart=Math.max(0,available),marginPart=Math.max(0,margin)+Math.max(0,reserved),total=availablePart+marginPart;
 const used=total>0?Math.min(100,marginPart/total*100):0;
 return <><button className="account-overview-trigger" type="button" aria-label="View equity breakdown" title="View equity breakdown" onClick={()=>setOpen(true)}><PieChart size={15}/></button>
 <TradingDialog open={open} onClose={()=>setOpen(false)} title="Equity breakdown" identity={<><span className="trade-details-status"><i/>Account overview</span><span className="trade-details-network">Base Sepolia</span></>} footer={<button type="button" className="account-overview-done" onClick={()=>setOpen(false)}>Done<ArrowUpRight size={14}/></button>}>
  <section className="trade-dialog-hero"><span>Total equity</span><strong><AnimatedValue value={equity}/></strong><small>Available funds + allocated collateral + open PnL</small></section>
  <section className="account-allocation"><div className="account-allocation-chart" role="img" aria-label={`Allocated collateral uses ${used.toFixed(1)}% of available and allocated funds`} data-selected={selected}>
   <svg viewBox="0 0 120 120" aria-hidden="true"><circle className="account-ring-base" cx="60" cy="60" r="48"/><circle className="account-ring-used" cx="60" cy="60" r="48" pathLength="100" strokeDasharray={`${used} 100`} style={{'--usage':used} as React.CSSProperties}/></svg>
   <div><strong><AnimatedText text={`${(selected==='margin'?used:total>0?100-used:0).toFixed(1)}%`}/></strong><small>{selected==='margin'?'Allocated':'Available'}</small></div>
  </div><div className="account-allocation-legend" role="group" aria-label="Inspect collateral allocation">
   <button type="button" aria-pressed={selected==='available'} onClick={()=>setSelected('available')}><Wallet size={15}/><span><small>Available balance</small><b><AnimatedValue value={available}/></b></span></button>
   <button type="button" aria-pressed={selected==='margin'} onClick={()=>setSelected('margin')}><Layers size={15}/><span><small>Position margin</small><b><AnimatedValue value={margin}/></b></span></button>
   {reserved>0&&<button type="button" aria-pressed={selected==='margin'} onClick={()=>setSelected('margin')}><Layers size={15}/><span><small>Pending order collateral</small><b><AnimatedValue value={reserved}/></b></span></button>}
  </div></section>
  <div className="account-overview-pnl"><span>Unrealized PnL</span><strong data-positive={pnl>=0}><AnimatedText text={`${pnl>=0?'+':'−'}$${Math.abs(pnl).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`}/></strong></div>
  <p className="account-overview-note">Allocated funds include position margin and pending orders. Open PnL is an estimate until settlement.</p>
 </TradingDialog></>;
}
