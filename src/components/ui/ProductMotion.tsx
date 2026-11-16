import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react';

// Adapted from beUI StatefulButton / RangeSlider motion patterns (MIT,
// Saurabh Chauhan). Velo keeps native inputs and execution handlers.
// See licenses/beUI-LICENSE.txt and THIRD-PARTY-NOTICES.md.
export const supportsProductMotion = () => typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function';
const glide = { type:'spring', stiffness:700, damping:50, mass:.5 } as const;

function DiscussionRegion({id,children}:{id:string;children:React.ReactNode}) {
  const present=useIsPresent();
  return <motion.div id={id} inert={!present} aria-hidden={!present}
    initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}}
    transition={{height:{duration:.22,ease:[.22,1,.36,1]},opacity:{duration:.14}}}
    style={{overflow:'hidden'}}>{children}</motion.div>;
}

/** Threads mount on demand; closing content becomes inert before its exit finishes. */
export function DiscussionReveal({open,id,children}:{open:boolean;id:string;children:React.ReactNode}) {
  const reduced=useReducedMotion();
  if(reduced||!supportsProductMotion())return open?<div id={id}>{children}</div>:null;
  return <AnimatePresence initial={false}>{open&&<DiscussionRegion key={id} id={id}>{children}</DiscussionRegion>}</AnimatePresence>;
}

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
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -3 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}>
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
  return <ValueSlider value={value} onChange={onChange} label={label} valueText={`${value}% of free balance`}/>;
}

/** One native range control for order size and protection targets. */
export function ValueSlider({value,onChange,label,max=100,disabled=false,valueText,tone='neutral'}:{
  value:number;onChange:(value:number)=>void;label:string;max?:number;disabled?:boolean;valueText?:string;tone?:'neutral'|'profit'|'loss';
}) {
  const reduced = useReducedMotion();
  const fill=Math.max(0,Math.min(100,value/max*100));
  return <div className="velo-margin-slider" data-tone={tone} data-disabled={disabled}>
    <div className="velo-margin-slider__track" aria-hidden="true">{supportsProductMotion() && !reduced ? <motion.div className="velo-margin-slider__fill"
      initial={false} animate={{width:`${fill}%`}} transition={glide}/> : <div className="velo-margin-slider__fill" style={{width:`${fill}%`}}/>}</div>
    <div className="velo-margin-slider__ticks" aria-hidden="true">{[0,25,50,75,100].map(tick=><i key={tick}/>)}</div>
    <input type="range" min={0} max={max} step={1} value={value} disabled={disabled} aria-label={label} aria-valuetext={valueText}
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
