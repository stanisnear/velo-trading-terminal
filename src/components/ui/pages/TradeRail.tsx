import React, { useEffect, useRef, useState } from 'react';
import { GripHorizontal } from 'lucide-react';

const preferenceKey = 'velo.trade.feedHeight';
export function TradeRail({ isMobile, orderType, feed, children }: {
  isMobile: boolean; orderType: string; feed: React.ReactNode; children: React.ReactNode;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(680);
  const [preferred, setPreferred] = useState<number | null>(() => {
    try { const value = Number(localStorage.getItem(preferenceKey)); return value >= 96 && value <= 800 ? value : null; } catch { return null; }
  });
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (isMobile || !rail.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setHeight(entry.contentRect.height));
    observer.observe(rail.current);
    return () => observer.disconnect();
  }, [isMobile]);
  const min = 96, max = Math.max(min, height - 250);
  const extra = orderType === 'MARKET' ? 0 : 60;
  const feedHeight = Math.max(min, Math.min(max, (preferred ?? Math.min(300, Math.max(156, height - 510))) - extra));
  const change = (value: number) => {
    const next = Math.max(min, Math.min(max, value));
    setPreferred(next + extra);
    try { localStorage.setItem(preferenceKey, String(next + extra)); } catch { /* Layout remains usable without storage. */ }
  };
  const reset = () => { setPreferred(null); try { localStorage.removeItem(preferenceKey); } catch {} };
  return <div ref={rail} className={`velo-trade-rail${dragging ? ' is-resizing' : ''}`} style={{ '--trade-feed-height': `${feedHeight}px` } as React.CSSProperties}>
    {!isMobile && <>{feed}<div className="velo-trade-resizer" role="separator" tabIndex={0} aria-label="Resize market feed and order ticket" aria-orientation="horizontal"
      aria-valuemin={min} aria-valuemax={Math.round(max)} aria-valuenow={Math.round(feedHeight)} title="Drag to resize. Double-click to reset."
      onDoubleClick={reset}
      onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); setDragging(true); }}
      onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId) && rail.current) change(event.clientY - rail.current.getBoundingClientRect().top - 5); }}
      onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); setDragging(false); }}
      onPointerCancel={() => setDragging(false)} onLostPointerCapture={() => setDragging(false)}
      onKeyDown={event => {
        if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
          event.preventDefault(); change(event.key === 'Home' ? min : event.key === 'End' ? max : feedHeight + (event.key === 'ArrowUp' ? -16 : 16));
        }
      }}><GripHorizontal size={18} /></div></>}
    {children}
    {isMobile && feed}
  </div>;
}
