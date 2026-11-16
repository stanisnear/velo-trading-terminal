import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react';
import { Bell, CheckCheck, X, Heart, UserPlus, Repeat2, ArrowDownLeft, ArrowUpRight, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { supportsProductMotion } from './ui/ProductMotion';
import './NotificationCenter.css';

type Notice = { id: string; type?: string; message: string; timestamp: number; read?: boolean };
type Props = { open: boolean; notifications: Notice[]; unreadCount: number; onClose: () => void;
  onSelect: (notice: Notice) => void; onMarkAllRead?: () => void; anchorRef: React.RefObject<HTMLElement | null> };

function NoticeRow({children, ...props}: React.ComponentProps<typeof motion.button>) {
  const present = useIsPresent();
  return <motion.button {...props} inert={!present} aria-hidden={!present} tabIndex={present ? 0 : -1}>{children}</motion.button>;
}

function NotificationPanel({ notifications, unreadCount, onClose, onSelect, onMarkAllRead, anchorRef }: Props) {
  const present = useIsPresent(), reduced = useReducedMotion();
  const panel = useRef<HTMLDivElement>(null), close = useRef<HTMLButtonElement>(null);
  const headingId = useId();
  const [position, setPosition] = useState({ top: 76, right: 12 });
  useLayoutEffect(() => {
    const measure = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      setPosition({ top: rect ? rect.bottom + 12 : 76, right: rect ? Math.max(12, Math.min(window.innerWidth - rect.right, window.innerWidth - 372)) : 12 });
    };
    measure(); window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [anchorRef]);
  useEffect(() => { close.current?.focus({ preventScroll: true }); }, []);
  useLayoutEffect(() => {
    const focused = document.activeElement as HTMLElement | null;
    const notice = focused?.closest<HTMLElement>('[data-notice-id]');
    if (notice && panel.current?.contains(notice) && !notifications.some(item => item.id === notice.dataset.noticeId)) {
      close.current?.focus({ preventScroll: true });
    }
  }, [notifications]);
  useEffect(() => {
    if (!present) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); onClose(); } };
    const outside = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node) && !anchorRef.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener('keydown', escape); document.addEventListener('pointerdown', outside);
    return () => { document.removeEventListener('keydown', escape); document.removeEventListener('pointerdown', outside); };
  }, [present, onClose, anchorRef]);
  const animate = supportsProductMotion() && !reduced;
  return <motion.div ref={panel} role="dialog" aria-labelledby={headingId} inert={!present} aria-hidden={!present}
    className="velo-notification-center" style={{ ...position, pointerEvents: present ? 'auto' : 'none' }}
    initial={animate ? { opacity: 0, y: -8, scale: .97 } : false} animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, y: -4, scale: animate ? .985 : 1 }} transition={{ duration: animate ? .18 : 0, ease: [.22, 1, .36, 1] }}>
    <header><div><h2 id={headingId}>Notifications</h2><span className="velo-notification-count" aria-live="polite">{unreadCount ? `${unreadCount} unread` : 'All caught up'}</span></div>
      <div className="velo-notification-tools">{unreadCount > 0 && <button type="button" onClick={onMarkAllRead} aria-label="Mark all notifications read" title="Mark all read"><CheckCheck size={17}/></button>}
        <button ref={close} type="button" onClick={onClose} aria-label="Close notifications"><X size={17}/></button></div>
    </header>
    <div className="velo-notification-list custom-scrollbar">
      <AnimatePresence initial={false}>
        {notifications.length === 0 ? <motion.div key="empty" className="velo-notification-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <Bell size={25}/><strong>You’re all caught up.</strong><span>Your updates will appear here.</span>
        </motion.div> : [...notifications].sort((a, b) => b.timestamp - a.timestamp).map(notice => {
          const type = notice.type || '';
          const Icon = type === 'LIKE' ? Heart : type === 'FOLLOW' ? UserPlus : type === 'REPOST' ? Repeat2
            : type === 'RECEIVE' || type === 'DEPOSIT' ? ArrowDownLeft : type === 'SEND' || type === 'WITHDRAW' ? ArrowUpRight
            : type === 'TAKE_PROFIT' ? TrendingUp : type === 'STOP_LOSS' || type === 'LIQUIDATION' ? TrendingDown : Activity;
          return <NoticeRow type="button" key={notice.id} data-notice-id={notice.id} layout={animate ? 'position' : false}
            className="velo-notification-row" data-read={!!notice.read} onClick={() => onSelect(notice)}
            initial={animate ? { opacity: 0, y: -7 } : false} animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0, overflow: 'hidden' }} transition={{ duration: animate ? .18 : 0 }}>
            <span className="velo-notification-icon" aria-hidden="true"><Icon size={16}/></span>
            <span className="velo-notification-copy"><span>{notice.message}</span><time dateTime={new Date(notice.timestamp).toISOString()}>{new Date(notice.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time></span>
            {!notice.read && <span className="velo-notification-unread" aria-label="Unread"/>}
          </NoticeRow>;
        })}
      </AnimatePresence>
    </div>
  </motion.div>;
}

/** The center persists through its exit; selecting a notice leaves focus to its destination. */
export function NotificationCenter(props: Props) {
  const reduced = useReducedMotion();
  const dismiss = () => { props.onClose(); props.anchorRef.current?.focus({ preventScroll: true }); };
  if (reduced || !supportsProductMotion()) return props.open ? createPortal(<NotificationPanel {...props} onClose={dismiss}/>, document.body) : null;
  return createPortal(<AnimatePresence initial={false}>{props.open && <NotificationPanel key="notifications" {...props} onClose={dismiss}/>}</AnimatePresence>, document.body);
}
