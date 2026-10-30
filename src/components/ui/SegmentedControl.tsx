import { supportsProductMotion } from './ProductMotion';
import { motion, useReducedMotion } from 'motion/react';
import React from 'react';

/** Equal-width selection with one continuous glass indicator and native buttons. */
export function SegmentedControl({ label, options, value, onChange, compact = false, disabled = false }: {
  label: string; options: { value: string; label: string; disabled?: boolean; title?: string }[]; value: string; onChange: (value: string) => void; compact?: boolean; disabled?: boolean;
}) {
  const reduced = useReducedMotion();
  const selected = Math.max(0, options.findIndex(option => option.value === value));
  return <div role="group" aria-label={label} className={`velo-segments${compact ? ' velo-segments--compact' : ''}`}
    style={{ '--segment-count': options.length, '--segment-index': selected } as React.CSSProperties}>
    {supportsProductMotion() && !reduced ? <motion.span className="velo-segment-lens" aria-hidden="true" initial={false}
      animate={{x:`${selected * 100}%`}} transition={reduced?{duration:0}:{type:'spring',stiffness:360,damping:32,mass:.6}}/> : <span className="velo-segment-lens" aria-hidden="true" style={{transform:`translateX(${selected * 100}%)`}}/>}
    {options.map((option, index) => <button type="button" key={option.value} disabled={disabled || option.disabled} title={option.title} aria-pressed={option.value === value}
      onClick={() => onChange(option.value)} onKeyDown={event => {
        if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;
        const available=options.map((item,i)=>!disabled&&!item.disabled?i:-1).filter(i=>i>=0);
        if(!available.length)return;
        const current=available.indexOf(index);
        const next=event.key==='Home'?available[0]:event.key==='End'?available.at(-1)!:available[(current+(event.key==='ArrowRight'?1:-1)+available.length)%available.length];
        event.preventDefault();
        const buttons = event.currentTarget.parentElement?.querySelectorAll('button');
        buttons?.[next]?.focus(); onChange(options[next].value);
      }}>{option.label}</button>)}
  </div>;
}
