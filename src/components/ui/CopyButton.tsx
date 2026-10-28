import React,{useEffect,useRef,useState} from 'react';
import {AnimatePresence,motion,useReducedMotion} from 'motion/react';
import {Check,Copy,AlertCircle} from 'lucide-react';
import {supportsProductMotion} from './ProductMotion';
import {playInterfaceSound} from '../../services/interfaceSound';
/** Bencho's copy/check feedback pattern; original Velo implementation. */
export function CopyButton({value,label}:{value:string;label:string}) {
  const [state,setState]=useState<'idle'|'copied'|'error'>('idle');
  const [busy,setBusy]=useState(false),reduced=useReducedMotion();
  const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),active=useRef(true);
  useEffect(()=>{active.current=true;return()=>{active.current=false;clearTimeout(timer.current);};},[]);
  const Icon=state==='copied'?Check:state==='error'?AlertCircle:Copy;
  return <button className="velo-copy-button" data-state={state} type="button" aria-label={state==='copied'?`${label} copied`:label} disabled={busy} onClick={async()=>{
    clearTimeout(timer.current);setBusy(true);
    try {await navigator.clipboard.writeText(value);if(active.current){setState('copied');playInterfaceSound('CLICK');}}
    catch {if(active.current)setState('error');}
    finally {if(active.current){setBusy(false);timer.current=setTimeout(()=>setState('idle'),1800);}}
  }}>
    {supportsProductMotion()&&!reduced?<AnimatePresence mode="wait" initial={false}><motion.span key={state} initial={{opacity:0,scale:.7,rotate:-20}} animate={{opacity:1,scale:1,rotate:0}} exit={{opacity:0,scale:.7}} transition={{duration:.15}}><Icon size={14}/></motion.span></AnimatePresence>:<Icon size={14}/>}
    {state!=='idle'&&<span className="velo-copy-button__hint" role={state==='error'?'alert':'status'}>{state==='copied'?'Copied':'Copy unavailable'}</span>}
  </button>;
}
