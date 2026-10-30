import React, { createContext, forwardRef, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMarketDiscovery } from '../../services/marketDiscovery';
import { socialTokenAt, insertSocialTag } from '../../utils/socialTagging.mjs';
import { isWalletPlaceholder } from '../../utils/profileIdentity.mjs';
import './SocialTextField.css';

type Person = { id: string; username?: string; handle?: string; avatar?: string };
type Asset = { assetId?: string; symbol: string; name: string; logo?: string };
export const SocialTagContext = createContext<{ people: Person[]; assets: Asset[] }>({ people: [], assets: [] });
export function SocialTagProvider({ people, children }: { people: Person[]; children: React.ReactNode }) {
  const { socialAssets } = useMarketDiscovery();
  const value = useMemo(()=>({people,assets:socialAssets}),[people,socialAssets]);
  return <SocialTagContext.Provider value={value}>{children}</SocialTagContext.Provider>;
}

type Field = HTMLTextAreaElement;
type Props = Omit<React.TextareaHTMLAttributes<Field>, 'value' | 'onChange' | 'onSubmit'> & {
  value: string; onValueChange: (text: string) => void; onSubmit?: () => void;
  people?: Person[];
};

/** Shared by every social writing surface; the popup stays inside a native dialog's top layer. */
export const SocialTextField = forwardRef<Field, Props>(function SocialTextField({ value, onValueChange, onSubmit, people, onKeyDown, onSelect, onBlur, ...props }, forwardedRef) {
  const directory = useContext(SocialTagContext);
  const field = useRef<Field>(null), list = useRef<HTMLDivElement>(null), composing = useRef(false);
  const id = useId();
  const dismissed = useRef('');
  const tokenKey = (token: ReturnType<typeof socialTokenAt>) => token ? `${token.trigger}:${token.query}:${token.start}:${token.cursor}` : '';
  const [active, setActive] = useState<ReturnType<typeof socialTokenAt>>(null);
  const [selected, setSelected] = useState(0);
  const [placement, setPlacement] = useState<{ host: HTMLElement; top: number; left: number; width: number; maxHeight: number; fixed: boolean } | null>(null);
  const query = active?.query.toLowerCase() || '';
  const options = active?.trigger === '$'
    ? directory.assets.filter(asset => asset.symbol.toLowerCase().startsWith(query) || asset.name.toLowerCase().startsWith(query)).slice(0, 6).map(asset => ({ key: asset.assetId || asset.symbol, token: `$${asset.symbol}`, label: asset.name, image: asset.logo }))
    : active ? (people || directory.people).filter(person => !isWalletPlaceholder(person.username || person.handle) && ((person.username || '').toLowerCase().includes(query) || (person.handle || '').toLowerCase().includes(query))).slice(0, 6).map(person => ({ key: person.id, token: `@${(person.handle || person.username || '').replace(/^@/, '')}`, label: person.username || person.handle || '', image: person.avatar })) : [];
  const open = !props.disabled && options.length > 0;
  const current = Math.min(selected, Math.max(0, options.length - 1));
  const sync = (input: Field) => {
    if (composing.current || document.activeElement !== input) return;
    const token = socialTokenAt(input.value, input.selectionStart, input.selectionEnd);
    const next = dismissed.current && tokenKey(token) === dismissed.current ? null : token;
    setActive(previous => previous?.trigger === next?.trigger && previous?.query === next?.query && previous?.start === next?.start && previous?.cursor === next?.cursor ? previous : next);
    setSelected(0);
  };
  useLayoutEffect(() => {
    if (!open || !field.current) return;
    const update = () => {
      const input = field.current; if (!input) return;
      const bounds = input.getBoundingClientRect();
      const dialog = input.closest('dialog');
      const host = dialog || document.body;
      const viewport = dialog?.getBoundingClientRect();
      const floor = Math.min(window.innerHeight, viewport?.bottom ?? window.innerHeight) - 12;
      const ceiling = Math.max(8, viewport?.top ?? 8);
      const desired = Math.min(260, options.length * 49 + 12);
      const below = floor - bounds.bottom - 6, above = bounds.top - ceiling - 6;
      const useAbove = below < desired && above > below;
      const height = Math.max(60, Math.min(desired, useAbove ? above : below));
      const top = useAbove ? bounds.top - height - 6 : bounds.bottom + 6;
      const width = Math.min(Math.max(bounds.width, 230), (viewport?.width ?? window.innerWidth) - 24);
      const left = Math.max((viewport?.left ?? 0) + 12, Math.min(bounds.left, (viewport?.right ?? window.innerWidth) - width - 12));
      const next = { host, top: top - (viewport?.top ?? 0) + (dialog?.scrollTop ?? 0), left: left - (viewport?.left ?? 0), width, maxHeight: height, fixed: !dialog };
      setPlacement(previous => previous && previous.host === next.host && previous.top === next.top && previous.left === next.left && previous.width === next.width && previous.maxHeight === next.maxHeight ? previous : next);
    };
    update();
    window.addEventListener('scroll', update, true); window.addEventListener('resize', update);
    return () => { window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); };
  }, [open, options.length]);
  useEffect(() => {
    const popup = list.current, option = popup?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!popup || !option) return;
    if (option.offsetTop < popup.scrollTop) popup.scrollTop = option.offsetTop;
    else if (option.offsetTop + option.offsetHeight > popup.scrollTop + popup.clientHeight) popup.scrollTop = option.offsetTop + option.offsetHeight - popup.clientHeight;
  }, [current, open]);
  useEffect(() => { if (!value) setActive(null); }, [value]);
  const choose = (token: string) => {
    if (!active) return;
    const result = insertSocialTag(value, active, token);
    onValueChange(result.text); setActive(null);
    requestAnimationFrame(() => { field.current?.focus(); field.current?.setSelectionRange(result.cursor, result.cursor); });
  };
  return <div className="social-text-field">
    <textarea {...props} ref={input => { field.current = input; if (typeof forwardedRef === 'function') forwardedRef(input); else if (forwardedRef) forwardedRef.current = input; }}
      value={value} aria-autocomplete="list" aria-haspopup="listbox" aria-controls={open ? id : undefined} aria-activedescendant={open ? `${id}-${current}` : undefined}
      onChange={event => { onValueChange(event.target.value); sync(event.target); }}
      onSelect={event => { sync(event.currentTarget); onSelect?.(event); }}
      onCompositionStart={() => { composing.current = true; setActive(null); }}
      onCompositionEnd={event => { composing.current = false; sync(event.currentTarget); }}
      onBlur={event => { if (!list.current?.contains(event.relatedTarget as Node)) setActive(null); onBlur?.(event); }}
      onKeyDown={event => {
        if (composing.current || event.nativeEvent.isComposing) return;
        if (open && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(event.key) && !event.ctrlKey && !event.metaKey) {
          event.preventDefault(); event.stopPropagation();
          if (event.key === 'Escape') { dismissed.current = tokenKey(active); setActive(null); }
          else if (event.key === 'Enter' || event.key === 'Tab') choose(options[current].token);
          else setSelected(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
          return;
        }
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && onSubmit) { event.preventDefault(); onSubmit(); return; }
        onKeyDown?.(event);
      }} />
    {open && placement && createPortal(<div ref={list} id={id} role="listbox" aria-label={active?.trigger === '@' ? 'People suggestions' : 'Coin suggestions'} className="social-tag-list"
      style={{ position: placement.fixed ? 'fixed' : 'absolute', top: placement.top, left: placement.left, width: placement.width, maxHeight: placement.maxHeight }}>
      {options.map((option, index) => <button type="button" role="option" aria-selected={current === index} tabIndex={-1} id={`${id}-${index}`} key={option.key}
        onPointerDown={event => { if (event.pointerType !== 'mouse') event.preventDefault(); }}
        onMouseDown={event => event.preventDefault()} onClick={() => choose(option.token)} onMouseEnter={() => setSelected(index)}>
        {option.image ? <img src={option.image} alt=""/> : <span className="social-tag-avatar">{option.label.slice(0, 1)}</span>}
        <span><strong>{option.label}</strong><small>{option.token}</small></span>
      </button>)}
    </div>, placement.host)}
  </div>;
});
