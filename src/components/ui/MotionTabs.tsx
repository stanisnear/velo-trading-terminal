import React, { useId, useLayoutEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { supportsProductMotion } from './ProductMotion';
import './MotionTabs.css';

type Option = { value: string; label: React.ReactNode; title?: string };

/** A measured underline follows unequal labels. Native buttons retain focus. */
export function MotionTabs({ label, options, value, onChange, panelId }: {
  label: string; options: Option[]; value: string; onChange: (value: string) => void; panelId?: string;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const id = useId();
  const [line, setLine] = useState({ x: 0, width: 0 });
  const keys = options.map(option => option.value).join('|');
  useLayoutEffect(() => {
    const root = rail.current;
    if (!root) return;
    const measure = () => {
      const button = root.querySelector<HTMLElement>('[aria-selected="true"]');
      const next = { x: button?.offsetLeft || 0, width: button?.offsetWidth || 0 };
      setLine(previous => previous.x === next.x && previous.width === next.width ? previous : next);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    root.querySelectorAll('button').forEach(button => observer.observe(button));
    return () => observer.disconnect();
  }, [value, keys]);
  return <div ref={rail} role="tablist" aria-label={label} className="velo-motion-tabs">
    {options.map((option, index) => <button type="button" role="tab" key={option.value}
      id={`${id}-${index}`} aria-selected={option.value === value} aria-controls={panelId}
      tabIndex={option.value === value ? 0 : -1} title={option.title}
      onClick={() => onChange(option.value)} onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length;
        rail.current?.querySelectorAll('button')[next]?.focus();
        onChange(options[next].value);
      }}>{option.label}</button>)}
    {supportsProductMotion() && !reduced ? <motion.span aria-hidden="true" className="velo-motion-tabs__line"
      initial={false} animate={{ x: line.x, width: line.width }} transition={{ type: 'spring', stiffness: 540, damping: 38, mass: .55 }}/>
      : <span aria-hidden="true" className="velo-motion-tabs__line" style={{ width: line.width, transform: `translateX(${line.x}px)` }}/>} 
  </div>;
}
