import React from 'react';
import { ArrowRight, Check, Clock3, Wallet, AlertCircle } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { supportsProductMotion } from './ProductMotion';
import './WalletPresentation.css';

/** Original Velo route/status patterns, using the existing motion primitives. */
export function TransferRoute({from,to,fromAddress,toAddress}:{from:string;to:string;fromAddress?:string|null;toAddress?:string|null}) {
  const short=(address?:string|null)=>address?`${address.slice(0,6)}…${address.slice(-4)}`:'Not connected';
  return <div className="wallet-route" aria-label={`From ${from} to ${to}`}>
    <div><Wallet size={16} aria-hidden="true"/><span>{from}<small title={fromAddress??undefined}>{short(fromAddress)}</small></span></div>
    <ArrowRight size={16} aria-hidden="true"/>
    <div><Wallet size={16} aria-hidden="true"/><span>{to}<small title={toAddress??undefined}>{short(toAddress)}</small></span></div>
  </div>;
}

export function WalletStatus({state,title,children}:{state:'pending'|'success'|'error'|'idle';title:string;children?:React.ReactNode}) {
  const reduced=useReducedMotion();
  const Icon=state==='success'?Check:state==='error'?AlertCircle:state==='pending'?Clock3:Wallet;
  const icon=<Icon size={24} aria-hidden="true"/>;
  return <div className="wallet-status" data-state={state} role="status">
    <div className="wallet-status-glyph" aria-hidden="true">
      {supportsProductMotion()&&!reduced?<AnimatePresence mode="wait" initial={false}><motion.span key={state} initial={{opacity:0,scale:.75,rotate:-12}} animate={{opacity:1,scale:1,rotate:0}} exit={{opacity:0,scale:.75}} transition={{type:'spring',stiffness:440,damping:28}}>{icon}</motion.span></AnimatePresence>:icon}
    </div>
    <h3>{title}</h3>{children}
  </div>;
}
