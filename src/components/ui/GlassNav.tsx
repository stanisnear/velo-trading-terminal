import { motion, useReducedMotion } from 'motion/react';
import { supportsProductMotion } from './ProductMotion';
import React, { useLayoutEffect, useRef, useState } from 'react';

type Item = { id: string; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }> };

/** One persistent lens follows the selected destination without remounting controls. */
export function GlassNav({ items, activeId, onSelect, mobile = false }: {
  items: Item[]; activeId: string; onSelect: (id: string) => void; mobile?: boolean;
}) {
  const reduced = useReducedMotion();
  const rail = useRef<HTMLElement>(null);
  const [lens, setLens] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const destinations = items.map(item => item.id).join('|');
  useLayoutEffect(() => {
    const root = rail.current;
    if (!root) return;
    const measure = () => {
      const selected = root.querySelector<HTMLElement>('[aria-current="page"]');
      if (!selected || !selected.offsetWidth) { setLens(null); return; }
      const next = { x: selected.offsetLeft, y: selected.offsetTop, width: selected.offsetWidth, height: selected.offsetHeight };
      setLens(previous => previous && previous.x === next.x && previous.y === next.y && previous.width === next.width && previous.height === next.height ? previous : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    root.querySelectorAll('button').forEach(button => observer.observe(button));
    return () => observer.disconnect();
  }, [activeId, destinations, mobile]);

  return <nav ref={rail} aria-label={mobile ? 'Mobile navigation' : 'Main navigation'} className={`velo-glass-nav${mobile ? ' velo-glass-nav-mobile' : ''}`}>
    {supportsProductMotion() && !reduced ? <motion.span aria-hidden="true" className="velo-nav-lens" data-ready={!!lens}
      initial={false} animate={lens ? {x:lens.x,y:lens.y,width:lens.width,height:lens.height,opacity:1}:{opacity:0}}
      transition={{type:'spring',stiffness:360,damping:32,mass:.6}} style={{transition:'none'}}/>
      : <span aria-hidden="true" className="velo-nav-lens" data-ready={!!lens} style={lens ? {
        width:lens.width,height:lens.height,transform:`translate3d(${lens.x}px, ${lens.y}px, 0)`,
      }:undefined}/>}

    {items.map(item => <button type="button" key={item.id} aria-current={item.id === activeId ? 'page' : undefined}
      onClick={() => onSelect(item.id)}>
      <item.icon size={mobile ? 21 : 14} strokeWidth={item.id === activeId ? 2.2 : 1.8} />
      <span>{item.label}</span>
    </button>)}
  </nav>;
}
