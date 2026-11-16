import React,{useId,useState} from 'react';
import { motion,useReducedMotion } from 'motion/react';
import { PieChart,ArrowUpRight,Wallet,Layers } from 'lucide-react';
import { TradingDialog } from './TradingDialog';
import { AnimatedValue,AnimatedText } from './AnimatedValue';
import './AccountOverview.css';

/** Read-only account composition. Available balance and position collateral form the ring; PnL is separate. */
export function AccountOverview({equity,available,margin,pnl,reserved=0}:{equity:number;available:number;margin:number;pnl:number;reserved?:number}){
 const[open,setOpen]=useState(false),[selected,setSelected]=useState<'available'|'margin'|'reserved'>('margin');
 const reduced=useReducedMotion(),lensId=useId();
 const parts=[
  {key:'available' as const,label:'Available balance',short:'Available',value:Math.max(0,available),Icon:Wallet},
  {key:'margin' as const,label:'Position margin',short:'Margin',value:Math.max(0,margin),Icon:Layers},
  ...(reserved>0?[{key:'reserved' as const,label:'Pending order collateral',short:'Reserved',value:reserved,Icon:Layers}]:[]),
 ];
 const total=parts.reduce((sum,part)=>sum+part.value,0);
 const active=parts.find(part=>part.key===selected)??parts[1];
 const share=total>0?active.value/total*100:0;
 return <><button className="account-overview-trigger" type="button" aria-label="View equity breakdown" title="View equity breakdown" onClick={()=>setOpen(true)}><PieChart size={15}/></button>
 <TradingDialog open={open} onClose={()=>setOpen(false)} title="Equity breakdown" identity={<><span className="trade-details-status"><i/>Account overview</span><span className="trade-details-network">Base Sepolia</span></>} footer={<button type="button" className="account-overview-done" onClick={()=>setOpen(false)}>Done<ArrowUpRight size={14}/></button>}>
  <section className="trade-dialog-hero"><span>Total equity</span><strong><AnimatedValue value={equity}/></strong><small>Available funds + allocated collateral + open PnL</small></section>
  <section className="account-allocation"><div className="account-allocation-chart" role="img" aria-label={`${active.label}: ${share.toFixed(1)}% of account collateral`}>
   <svg viewBox="0 0 120 120" aria-hidden="true"><circle className="account-ring-base" cx="60" cy="60" r="48"/><motion.circle className="account-ring-used" cx="60" cy="60" r="48" pathLength="100" initial={false} animate={{strokeDasharray:`${share} 100`}} transition={reduced?{duration:0}:{type:'spring',stiffness:180,damping:27}}/></svg>
   <div><strong><AnimatedText text={`${share.toFixed(1)}%`}/></strong><small>{active.short}</small></div>
  </div><div className="account-allocation-legend" role="group" aria-label="Inspect collateral allocation">
   {parts.map(({key,label,value,Icon})=><button key={key} type="button" aria-pressed={active.key===key} onClick={()=>setSelected(key)}>
    {active.key===key&&<motion.i aria-hidden="true" className="account-allocation-lens" layoutId={`allocation-${lensId}`} transition={reduced?{duration:0}:{type:'spring',stiffness:450,damping:36}}/>}
    <Icon size={15}/><span><small>{label}</small><b><AnimatedValue value={value}/></b></span>
   </button>)}
  </div></section>
  <div className="account-overview-pnl"><span>Unrealized PnL</span><strong data-positive={pnl>=0}><AnimatedText text={`${pnl>=0?'+':'−'}$${Math.abs(pnl).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`}/></strong></div>
  <p className="account-overview-note">Allocated funds include position margin and pending orders. Open PnL is an estimate until settlement.</p>
 </TradingDialog></>;
}
