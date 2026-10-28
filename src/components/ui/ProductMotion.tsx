import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

// Adapted from beUI StatefulButton / RangeSlider motion patterns (MIT,
// Saurabh Chauhan). Velo keeps native inputs and execution handlers.
// See licenses/beUI-LICENSE.txt and THIRD-PARTY-NOTICES.md.
export const supportsProductMotion = () => typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function';
const swap = { type:'spring', stiffness:460, damping:30, mass:.55 } as const;
const glide = { type:'spring', stiffness:700, damping:50, mass:.5 } as const;

/** Native disclosure state with a short height reveal; hidden links cannot receive focus. */
export function ContentDisclosure({ open, id, children }: {open:boolean;id:string;children:React.ReactNode}) {
  const reduced=useReducedMotion();
  if(reduced || !supportsProductMotion())return <div id={id} hidden={!open}>{children}</div>;
  return <motion.div id={id} initial={false} inert={!open} aria-hidden={!open}
    animate={{height:open?'auto':0,opacity:open?1:0}}
    transition={{type:'spring',stiffness:340,damping:32,mass:.6}} style={{overflow:'hidden'}}>{children}</motion.div>;
}

/** Only the presentation changes; the parent native button never remounts. */
export function ActionContent({ pending, pendingLabel = 'Working', children }: {
  pending:boolean; pendingLabel?:string; children:React.ReactNode;
}) {
  const reduced = useReducedMotion();
  if (!supportsProductMotion() || reduced) return <span className="velo-action-slot__content">{pending ? <><i className="velo-morph-loader" aria-hidden="true"/><span role="status">{pendingLabel}</span></> : children}</span>;
  return <span className="velo-action-slot">
    <span className="velo-action-slot__measure" aria-hidden="true">{children}</span>
    <AnimatePresence initial={false} mode="popLayout">
      <motion.span key={pending ? 'pending' : 'idle'} className="velo-action-slot__content"
        initial={reduced ? {opacity:0} : {opacity:0,y:7,filter:'blur(3px)'}}
        animate={{opacity:1,y:0,filter:'blur(0px)'}}
        exit={reduced ? {opacity:0} : {opacity:0,y:-5,filter:'blur(3px)'}}
        transition={reduced ? {duration:0} : swap}>
        {pending ? <><i className="velo-morph-loader" aria-hidden="true"/><span role="status">{pendingLabel}</span></> : children}
      </motion.span>
    </AnimatePresence>
  </span>;
}

/** A conditional form field reveals within the existing order ticket. */
export function AnimatedPanel({ activeKey, children }: {activeKey:string; children:React.ReactNode}) {
  const reduced = useReducedMotion();
  const open = activeKey !== 'market';
  if (!supportsProductMotion() || reduced) return <div hidden={!open}>{children}</div>;
  return <motion.div initial={false} inert={!open} aria-hidden={!open} animate={{height:open?'auto':0,opacity:open?1:0}}
    transition={reduced ? {duration:0} : {type:'spring',stiffness:360,damping:32,mass:.6}}
    style={{overflow:'hidden',flexShrink:0}}>
    {children}
  </motion.div>;
}

/** Native keyboard/touch behavior; the decorative fill follows with a spring. */
export function MarginSlider({ value, onChange, label }: {value:number;onChange:(value:number)=>void;label:string}) {
  const reduced = useReducedMotion();
  return <div className="velo-margin-slider">
    <div className="velo-margin-slider__track" aria-hidden="true">{supportsProductMotion() && !reduced ? <motion.div className="velo-margin-slider__fill"
      initial={false} animate={{width:`${Math.max(0,Math.min(100,value))}%`}} transition={glide}/> : <div className="velo-margin-slider__fill" style={{width:`${value}%`}}/>}</div>
    <div className="velo-margin-slider__ticks" aria-hidden="true">{[0,25,50,75,100].map(tick=><i key={tick}/>)}</div>
    <input type="range" min={0} max={100} step={1} value={value} aria-label={label} aria-valuetext={`${value}% of free balance`}
      onChange={event=>onChange(Number(event.currentTarget.value))}/>
  </div>;
}

/** The control remains mounted while its selected icon gives a short spring response. */
export function ReactionFeedback({ active, children }: {active:boolean;children:React.ReactNode}) {
  const reduced=useReducedMotion();
  const previous=useRef(active);
  const [burst,setBurst]=useState(false);
  useEffect(()=>{
    const celebrate=active&&!previous.current;
    previous.current=active;
    if(!celebrate||reduced||!supportsProductMotion()){setBurst(false);return;}
    setBurst(true);
    const timer=setTimeout(()=>setBurst(false),480);
    return()=>clearTimeout(timer);
  },[active,reduced]);
  if(reduced || !supportsProductMotion())return <span className="velo-reaction-icon">{children}</span>;
  return <span className="velo-reaction-icon">{burst&&<span className="velo-reaction-burst" aria-hidden="true"><i/><i/><i/><i/><i/><i/></span>}<AnimatePresence initial={false} mode="popLayout">
    <motion.span key={active ? 'selected':'idle'} initial={{scale:.72,opacity:.4,rotate:active?-12:0}} animate={{scale:1,opacity:1,rotate:0}} exit={{scale:.8,opacity:0}}
      transition={{type:'spring',stiffness:560,damping:18,mass:.45}}>{children}</motion.span>
  </AnimatePresence></span>;
}


/** Animate the containing height; fields keep their own scale and native focus. */
export function MeasuredPanel({children}:{children:React.ReactNode}) {
  const content=useRef<HTMLDivElement>(null),[height,setHeight]=useState<number|null>(null),reduced=useReducedMotion();
  useLayoutEffect(()=>{
    const element=content.current;if(!element)return;
    const measure=()=>{const next=element.getBoundingClientRect().height;setHeight(previous=>previous===next?previous:next);};
    measure();if(typeof ResizeObserver==='undefined')return;
    const observer=new ResizeObserver(measure);observer.observe(element);return()=>observer.disconnect();
  },[]);
  const inner=<div ref={content}>{children}</div>;
  return reduced||!supportsProductMotion()?inner:<motion.div initial={false} animate={{height:height??'auto'}} transition={{type:'spring',stiffness:340,damping:34,mass:.6}} style={{overflow:'clip'}}>{inner}</motion.div>;
}
