import React, { useEffect, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export function Dialog({ open, onClose, title, busy = false, children, className = '' }: {
  open: boolean; onClose: () => void; title: string; busy?: boolean; children: React.ReactNode; className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open || !ref.current) return;
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open]);
  if (!open) return null;
  return createPortal(<dialog ref={ref} className={`velo-native-dialog ${className}`} aria-labelledby={titleId} aria-busy={busy}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    onClick={event => {
      if (event.target !== event.currentTarget || busy) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    }}>
    <style>{`
      .velo-native-dialog { padding:0; width:min(520px,calc(100vw - 32px)); max-height:calc(100dvh - 48px); overflow:auto; margin:auto; color:var(--fg); border:1px solid var(--glass-border); border-radius:18px; background:var(--glass-sheen),var(--modal-surface); box-shadow:var(--modal-shadow); -webkit-backdrop-filter:blur(30px) saturate(1.02); backdrop-filter:blur(30px) saturate(1.02); animation:velo-dialog-in 240ms var(--material-ease); }
      .velo-native-dialog::backdrop { background:var(--overlay); -webkit-backdrop-filter:blur(var(--overlay-blur)); backdrop-filter:blur(var(--overlay-blur)); animation:velo-backdrop-in 150ms ease-out; }
      .velo-dialog-heading { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:18px 20px; border-bottom:1px solid var(--hairline); }
      .velo-dialog-heading h2 { margin:0; font:500 25px/1.2 var(--font-display); }
      .velo-dialog-close { display:grid; place-items:center; width:36px; height:36px; flex:none; border:1px solid var(--hairline); border-radius:50%; color:var(--fg); background:var(--chip-bg); cursor:pointer; transition:background 140ms,transform 140ms; }
      .velo-dialog-close:hover { background:var(--glass-bg); }
      .velo-dialog-close:active { transform:scale(.96); }
      .velo-native-dialog :focus-visible { outline:2px solid var(--accent); outline-offset:3px; }
      @keyframes velo-dialog-in { from { opacity:0; transform:translateY(8px) scale(.985); } to { opacity:1; transform:none; } }
      @keyframes velo-backdrop-in { from { opacity:0; } to { opacity:1; } }
      @media(prefers-reduced-motion:reduce) { .velo-native-dialog,.velo-native-dialog::backdrop { animation:none; } .velo-dialog-close { transition:none; } }
    `}</style>
    <header className="velo-dialog-heading"><h2 id={titleId}>{title}</h2><button type="button" className="velo-dialog-close" aria-label={`Close ${title}`} disabled={busy} onClick={onClose}><X size={18} /></button></header>
    {children}
  </dialog>, document.body);
}
