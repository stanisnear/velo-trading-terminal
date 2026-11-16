import { useLayoutEffect, useRef, type RefObject } from 'react';
import { useReducedMotion } from 'motion/react';

/** Reveal actual navigation changes without remounting canvases, forms or data. */
export function useViewMotion<T extends HTMLElement>(target: RefObject<T | null>, view: string) {
  const previous = useRef(view);
  const reduced = useReducedMotion();
  useLayoutEffect(() => {
    const changed = previous.current !== view;
    previous.current = view;
    const element = target.current;
    if (!changed || reduced || !element || typeof element.animate !== 'function') return;
    const animation = element.animate([
      { opacity: .72, transform: 'translateY(5px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ], { duration: 180, easing: 'cubic-bezier(.22,1,.36,1)' });
    return () => animation.cancel();
  }, [view, reduced, target]);
}
