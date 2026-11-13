import { AnimatedText } from './ui/AnimatedValue';
import { profileDisplayName } from '../utils/profileIdentity.mjs';
/** Navigation and account controls for desktop and mobile layouts. */
import React, { useState, useEffect, useRef } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { transitionAppearance } from '../utils/appearanceTransition';
import { AnimatedValue } from './ui/AnimatedValue';
import {
  Bell, Check, Copy, LayoutDashboard, LogOut, Menu, Moon, PlusCircle, Sun,
  UserCircle, Wallet, X, Settings, Shield, Trophy, TrendingUp, BarChart2,
  Users, MessageSquare, Search,
} from 'lucide-react';
import { TabView } from '@/utils/types';
import { formatMoney } from '@/components/ui/shared';
import { WalletConnectButton } from './WalletConnectButton';
import { GlassNav } from './ui/GlassNav';
import './Navigation.css';

export const ProfileAvatarPopup = ({ user, onClose, onViewProfile, onCreatePost, onLogout, onOpenSettings, onNavigateDashboard, totalEquity, anchorRef }: any) => {
    const [pos, setPos] = React.useState<{ top: number; right: number } | null>(null);
    const [copied, setCopied] = React.useState(false);

    React.useEffect(() => {
        const update = () => {
            const rect = anchorRef.current?.getBoundingClientRect();
            if (rect) setPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
        };
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, [anchorRef]);

    if (!pos || !user) return null;

    const shortAddr = user.walletAddress
        ? `${user.walletAddress.slice(0, 8)}…${user.walletAddress.slice(-6)}`
        : null;

    const copyAddress = async () => {
        if (!user.walletAddress) return;
        await navigator.clipboard.writeText(user.walletAddress).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    const S = {
        mono:  { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1' } as React.CSSProperties,
        label: { fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)' } as React.CSSProperties,
    };

    return createPortal(
        <>
            {/* backdrop */}
            <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={onClose} />
            <div className="velo-popover" style={{
                position: 'fixed', top: pos.top, right: pos.right, zIndex: 9999,
                width: 260, background: 'var(--bg-base-2)', border: '1px solid var(--hairline-strong)',
                borderRadius: 16, boxShadow: '0 16px 40px rgba(0,0,0,0.4)', overflow: 'hidden',
            }}>
                {/* Holo accent */}
                <div style={{ height: 2, background: 'var(--holo-linear)', backgroundSize: '220% 100%', animation: 'holoSlide 9s linear infinite' }} />

                {/* User identity card */}
                <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--hairline)' }}>
                    <img src={user.avatar} style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid var(--hairline-strong)', objectFit: 'cover', flexShrink: 0 }} alt="" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: 'var(--font-sans)', fontStyle: 'normal', fontSize: 14, color: 'var(--fg)', letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profileDisplayName(user)}</div>
                        <div style={{ ...S.label, fontSize: 9, marginTop: 1 }}>{`@${profileDisplayName(user)}`}</div>
                    </div>
                </div>

                {/* Equity display */}
                <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--hairline)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={S.label}>Total Equity</span>
                    <span style={{ ...S.mono, fontSize: 13, fontWeight: 700, color: 'var(--iris-violet)' }}>${<AnimatedText text={(totalEquity || user.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/>}</span>
                </div>

                {/* Wallet address */}
                {shortAddr && (
                    <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--hairline)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ ...S.mono, fontSize: 11, color: 'var(--fg-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shortAddr}</span>
                            <button onClick={copyAddress} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--hairline)', background: copied ? 'oklch(0.78 0.18 150/0.1)' : 'var(--chip-bg)', cursor: 'pointer', ...S.mono, fontSize: 10, fontWeight: 700, color: copied ? 'var(--pnl-up)' : 'var(--fg-subtle)', transition: 'all 0.15s' }}>
                                {copied ? <Check size={11} /> : <Copy size={11} />}
                                {copied ? 'Copied!' : 'Copy'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Quick actions
                    NOTE: previously had an "Open Wallet" item that opened the
                    Reown AppKit modal. We removed it because the Reown modal
                    only knows about the connected MAIN wallet — it has no
                    concept of the derived burner, where 99% of the user's
                    mUSDC actually lives. Users would see $0 in Reown even
                    when their trading wallet held $1,000, then panic. The
                    Velo Wallet & Settings modal shows BOTH wallets with
                    correct balances and is the only correct destination. */}
                <div style={{ padding: '6px 8px' }}>
                    {[
                        { icon: <LayoutDashboard size={14} />, label: 'Dashboard', onClick: () => { onNavigateDashboard?.(); onClose(); } },
                        { icon: <PlusCircle size={14} />, label: 'Create a Post', onClick: () => { onCreatePost(); onClose(); } },
                        { icon: <UserCircle size={14} />, label: 'View Profile', onClick: () => { onViewProfile(); onClose(); } },
                        { icon: <Wallet size={14} />, label: 'Wallet & Settings', onClick: () => { onOpenSettings?.(); onClose(); } },
                    ].map((item, i) => (
                        <button key={i} onClick={item.onClick} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 10, border: 'none', background: 'transparent', cursor: 'pointer', ...S.mono, fontSize: 12, fontWeight: 700, color: 'var(--fg)', textAlign: 'left', letterSpacing: '0.04em', transition: 'background 0.1s' }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--chip-bg)'}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                            <span style={{ color: 'var(--fg-muted)' }}>{item.icon}</span>
                            {item.label}
                        </button>
                    ))}
                    {/* Logout */}
                    <button onClick={() => { onLogout(); onClose(); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 10, border: 'none', background: 'transparent', cursor: 'pointer', ...S.mono, fontSize: 12, fontWeight: 700, color: 'var(--pnl-down)', textAlign: 'left', letterSpacing: '0.04em', transition: 'background 0.1s' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'oklch(0.66 0.22 25/0.08)'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                        <LogOut size={14} /> Sign Out
                    </button>
                </div>
            </div>
        </>,
        document.body
    );
};

export const Navbar = ({ activeTab, setActiveTab, toggleTheme, theme, handleLogout, user, onRequireAuth, unreadCount, setMobileMenuOpen, notifications, onNotificationClick, isNotifOpen, setNotifOpen, totalEquity, onCreatePost, onOpenSettings, isContractOwner, anyModalOpen, onSocialClick, onMarkAllRead, onSearch }: any) => {
    const navItems = [
        { id: TabView.DASHBOARD, icon: LayoutDashboard, label: 'Dashboard', requiresAuth: true },
        { id: TabView.TRADE, icon: TrendingUp, label: 'Trade', requiresAuth: false },
        { id: TabView.MARKETS, icon: BarChart2, label: 'Markets', requiresAuth: false },
        { id: TabView.SOCIAL, icon: Users, label: 'Social', requiresAuth: false },
        { id: TabView.LEADERBOARD, icon: Trophy, label: 'Leaderboard', requiresAuth: false },
        ...(isContractOwner ? [{ id: TabView.ADMIN, icon: Shield, label: 'Admin', requiresAuth: false }] : []),
    ].filter(item => !item.requiresAuth || user);
    const [avatarPopupOpen, setAvatarPopupOpen] = React.useState(false);
    const avatarBtnRef = React.useRef<HTMLButtonElement>(null);
    const notificationBtnRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        if (!isNotifOpen) return;
        const dismiss = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { setNotifOpen(false); notificationBtnRef.current?.focus(); }
        };
        document.addEventListener('keydown', dismiss);
        return () => document.removeEventListener('keydown', dismiss);
    }, [isNotifOpen, setNotifOpen]);
    const S = {
        mono: { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1' },
        label: { fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.14em' },
    };
    return (
      <>
        <div className="velo-header-veil" aria-hidden="true" />
        <nav
            style={{
                position: 'fixed',
                top: 'var(--nav-top, 4px)',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 30,
                width: 'min(1600px, calc(100% - 24px))',
                padding: '0 14px',
                height: 60,
                display: 'grid',
                gridTemplateColumns: 'auto 1fr auto',
                alignItems: 'center',
                gap: 14,
                border: '1px solid var(--hairline)',
                borderRadius: 18,
                background: 'var(--glass-bg)',
                backdropFilter: 'blur(8px) saturate(1.1)',
                WebkitBackdropFilter: 'blur(8px) saturate(1.1)',
                boxShadow: 'var(--glass-shadow)',
            }}
            className="navbar-container navbar-mobile-flush" data-page-layout={activeTab===TabView.TRADE?'trade':'standard'}
        >
            <div className="navbar-brand" style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <button
                    className="lg:hidden navbar-menu-toggle"
                    aria-label="Open navigation"
                    title="Open navigation"
                    style={{
                        width: 44,
                        height: 44,
                        borderRadius: 14,
                        border: '1px solid var(--hr)',
                        background: 'var(--chip)',
                        cursor: 'pointer',
                        color: 'var(--fg-2)',
                        display: 'grid',
                        placeItems: 'center',
                        touchAction: 'manipulation',
                        WebkitTapHighlightColor: 'transparent',
                    }}
                    onClick={() => setMobileMenuOpen(true)}
                >
                    <Menu size={20} />
                </button>
                <div className="navbar-wordmark-wrap" style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', minWidth: 0 }} onClick={() => user && setActiveTab(TabView.DASHBOARD)}>
                    <span className="navbar-wordmark" style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 28, color: 'var(--fg)', letterSpacing: '-0.04em', lineHeight: 1 }}>Velo</span>
                </div>
            </div>

            <div className="hidden lg:flex" style={{ justifyContent: 'center' }}>
                <GlassNav items={navItems} activeId={activeTab} onSelect={id => id === TabView.SOCIAL && onSocialClick ? onSocialClick() : setActiveTab(id)} />
            </div>

            <div className="navbar-controls" style={{ display: 'flex', alignItems: 'center', gap: 8, justifySelf: 'end' }}>
                {onSearch&&<button type="button" className="navbar-search" aria-label="Search Velo" title="Search Velo (⌘/Ctrl K)" onClick={onSearch}><Search size={17}/></button>}
                <div className="navbar-testnet chip" style={{ minWidth: 76, justifyContent: 'center', gap: 6 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', color: 'var(--fg-2)' }}>TESTNET</span>
                </div>
                <div style={{ position: 'relative' }}>
                    <button ref={notificationBtnRef} aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'} aria-expanded={isNotifOpen} onClick={() => setNotifOpen(!isNotifOpen)} className="navbar-icon-btn" style={{ display: 'grid', placeItems: 'center', width: 44, height: 44, borderRadius: 14, border: '1px solid var(--hr)', cursor: 'pointer', background: 'var(--chip)', color: 'var(--fg-2)', position: 'relative', transition: 'all 0.12s', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' } as any}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--chip-h)')} onMouseLeave={e => (e.currentTarget.style.background = 'var(--chip)')}>
                        <Bell size={18}/>
                        {unreadCount > 0 && <span style={{ position: 'absolute', top: 8, right: 8, width: 6, height: 6, background: 'var(--pnl-down)', borderRadius: '50%', border: '1.5px solid var(--bg)' }}/>}
                    </button>
                    {isNotifOpen && (
                        <>
                            <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setNotifOpen(false)}/>
                            <div className="velo-popover" style={{
                                position: 'fixed', right: 12, top: 76,
                                width: 'min(360px, calc(100vw - 24px))',
                                background: 'var(--bg)',
                                border: '1px solid var(--hr-2)',
                                borderRadius: 20,
                                boxShadow: '0 0 0 1px color-mix(in oklab, var(--velo-violet) 14%, transparent), 0 32px 72px -16px rgba(0,0,0,0.55), 0 8px 24px -8px rgba(0,0,0,0.3)',
                                zIndex: 9999,
                                overflow: 'hidden',
                                backdropFilter: 'blur(0px)',
                                WebkitBackdropFilter: 'blur(0px)',
                            }}>
                                {/* Header */}
                                <div style={{
                                    padding: '14px 18px 12px',
                                    borderBottom: '1px solid var(--hr)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    background: 'color-mix(in oklab, var(--velo-violet) 8%, var(--bg))',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontFamily: 'var(--font-sans)', fontStyle: 'normal', fontSize: 17, letterSpacing: '-0.03em', color: 'var(--fg)', lineHeight: 1 }}>Notifications</span>
                                        {unreadCount > 0 && (
                                            <span style={{
                                                fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
                                                letterSpacing: '0.06em', padding: '2px 6px',
                                                borderRadius: 999, background: 'var(--velo-violet)',
                                                color: '#fff', lineHeight: 1.4,
                                            }}>{unreadCount}</span>
                                        )}
                                    </div>
                                    {unreadCount > 0 && <button type="button" onClick={onMarkAllRead} title="Mark all read" aria-label="Mark all notifications read" style={{ display:'flex', gap:5, alignItems:'center', background:'transparent', border:0, color:'var(--fg)', cursor:'pointer', fontSize:11 }}><Check size={13}/> Mark all read</button>}
                                    {notifications.length > 0 && !unreadCount && (
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--fg-3)' }}>
                                            {notifications.length} total
                                        </span>
                                    )}
                                </div>
                                {/* List */}
                                <div className="custom-scrollbar" style={{ maxHeight: 400, overflowY: 'auto' }}>
                                    {notifications.length === 0 ? (
                                        <div style={{ padding: '32px 18px', textAlign: 'center' }}>
                                            <Bell size={22} style={{ color: 'var(--fg-3)', margin: '0 auto 10px', display: 'block', opacity: 0.4 }}/>
                                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-3)', margin: 0 }}>No notifications yet</p>
                                        </div>
                                    ) : (
                                        [...notifications].sort((a: any, b: any) => b.timestamp - a.timestamp).map((n: any, i: number) => {
                                            const d = new Date(n.timestamp);
                                            const now = new Date();
                                            const isToday = d.toDateString() === now.toDateString();
                                            const isYesterday = d.toDateString() === new Date(now.getTime() - 86400000).toDateString();
                                            const dateLabel = isToday ? 'Today' : isYesterday ? 'Yesterday' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
                                            const timeStr = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
                                            const type: string = n.type || '';
                                            const iconColor =
                                                type === 'TAKE_PROFIT' ? 'var(--pnl-up)' :
                                                type === 'STOP_LOSS' || type === 'LIQUIDATION' ? 'var(--pnl-down)' :
                                                type === 'DEPOSIT' || type === 'RECEIVE' ? 'var(--pnl-up)' :
                                                type === 'WITHDRAW' || type === 'SEND' ? 'var(--amber)' :
                                                type === 'POSITION_CLOSED' ? 'var(--velo-blue-ice)' :
                                                type === 'LIKE' || type === 'FOLLOW' || type === 'REPOST' ? 'var(--velo-mauve)' :
                                                'var(--fg-3)';
                                            const dotChar =
                                                type === 'TAKE_PROFIT' ? '↑' :
                                                type === 'STOP_LOSS' ? '↓' :
                                                type === 'LIQUIDATION' ? '⚡' :
                                                type === 'DEPOSIT' ? '↙' :
                                                type === 'WITHDRAW' ? '↗' :
                                                type === 'POSITION_CLOSED' ? '✕' :
                                                type === 'LIKE' ? '♥' :
                                                type === 'FOLLOW' ? '+' :
                                                '·';
                                            return (
                                                <div
                                                    key={n.id}
                                                    role="button" tabIndex={0}
                                                    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onNotificationClick(n); setNotifOpen(false); } }}
                                                    onClick={() => { onNotificationClick(n); setNotifOpen(false); }}
                                                    style={{
                                                        padding: '11px 18px',
                                                        borderBottom: i < notifications.length - 1 ? '1px solid var(--hr)' : 'none',
                                                        cursor: 'pointer',
                                                        background: !n.read ? 'color-mix(in oklab, var(--velo-violet) 8%, transparent)' : 'transparent',
                                                        transition: 'background 0.12s',
                                                        display: 'flex',
                                                        gap: 11,
                                                        alignItems: 'flex-start',
                                                    }}
                                                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--chip-h)')}
                                                    onMouseLeave={e => (e.currentTarget.style.background = !n.read ? 'color-mix(in oklab, var(--velo-violet) 8%, transparent)' : 'transparent')}
                                                >
                                                    {/* Type indicator dot */}
                                                    <div style={{
                                                        width: 28, height: 28, borderRadius: 9, flexShrink: 0,
                                                        background: 'color-mix(in oklab, ' + iconColor + ' 14%, var(--chip))',
                                                        border: '1px solid color-mix(in oklab, ' + iconColor + ' 28%, transparent)',
                                                        display: 'grid', placeItems: 'center',
                                                        fontFamily: 'var(--font-mono)', fontSize: 12, color: iconColor,
                                                        marginTop: 1,
                                                    }}>{dotChar}</div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <p style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 400, color: 'var(--fg)', margin: '0 0 4px', lineHeight: 1.4, letterSpacing: '-0.01em' }}>{n.message}</p>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.02em' }}>{dateLabel}</span>
                                                            <span style={{ width: 2, height: 2, borderRadius: '50%', background: 'var(--fg-3)', opacity: 0.4, flexShrink: 0 }}/>
                                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.02em' }}>{timeStr}</span>
                                                        </div>
                                                    </div>
                                                    {!n.read && (
                                                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--velo-violet)', flexShrink: 0, marginTop: 6, boxShadow: '0 0 6px 1px color-mix(in oklab, var(--velo-violet) 60%, transparent)' }}/>
                                                    )}
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <button className="navbar-theme-toggle" aria-label={theme === 'dark' ? 'Switch to light appearance' : 'Switch to dark appearance'} title={theme === 'dark' ? 'Switch to light appearance' : 'Switch to dark appearance'} onClick={event => transitionAppearance(() => flushSync(toggleTheme), event.currentTarget)} style={{ display: 'grid', placeItems: 'center', width: 44, height: 44, borderRadius: 14, border: '1px solid var(--hr)', cursor: 'pointer', background: 'var(--chip)', color: 'var(--fg-2)', transition: 'all 0.12s', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' } as any}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--chip-h)')} onMouseLeave={e => (e.currentTarget.style.background = 'var(--chip)')}>
                    {theme === 'dark' ? <Sun size={16}/> : <Moon size={16}/>}
                </button>

                {user ? (
                    <div ref={avatarBtnRef as any} style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 2 }}>
                        {/* Desktop: pill with name + avatar */}
                        <button
                            onClick={() => setAvatarPopupOpen(prev => !prev)}
                            className="hidden lg:flex"
                            style={{ maxWidth: 190, minWidth: 0, flexShrink: 1, alignItems: 'center', gap: 10, padding: '5px 6px 5px 12px', borderRadius: 999, background: 'var(--chip)', border: `1px solid ${avatarPopupOpen ? 'var(--velo-violet)' : 'var(--hr)'}`, cursor: 'pointer', transition: 'border-color 0.15s' }}
                            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--velo-violet)')}
                            onMouseLeave={e => { if (!avatarPopupOpen) e.currentTarget.style.borderColor = 'var(--hr)'; }}>
                            <div className="navbar-account-copy" style={{ display: 'flex', minWidth: 0, flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                                <span style={{ fontFamily: 'var(--font-sans)', fontStyle: 'normal', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14, letterSpacing: '-0.03em', color: 'var(--fg)', lineHeight: 1 }}>{profileDisplayName(user)}</span>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontFeatureSettings: '"tnum" 1', fontWeight: 700, color: 'var(--pnl-up)', lineHeight: 1 }}><AnimatedValue value={totalEquity > 0 ? totalEquity : user.balance}/></span>
                            </div>
                            <img src={user.avatar} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--hr-2)' }} />
                        </button>
                        {/* Mobile: square avatar button */}
                        <button
                            className="lg:hidden"
                            onClick={() => setAvatarPopupOpen(prev => !prev)}
                            style={{ width: 44, height: 44, borderRadius: 14, overflow: 'hidden', border: `1px solid ${avatarPopupOpen ? 'var(--velo-violet)' : 'var(--hr)'}`, flexShrink: 0, background: 'var(--chip)', padding: 0, cursor: 'pointer', transition: 'border-color 0.15s', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' } as any}>
                            <img src={user.avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                        </button>
                        {avatarPopupOpen && (
                            <ProfileAvatarPopup
                                user={user}
                                totalEquity={totalEquity}
                                anchorRef={avatarBtnRef}
                                onClose={() => setAvatarPopupOpen(false)}
                                onViewProfile={() => setActiveTab(TabView.PROFILE)}
                                onNavigateDashboard={() => setActiveTab(TabView.DASHBOARD)}
                                onCreatePost={() => { onCreatePost(); }}
                                onOpenSettings={onOpenSettings}
                                onLogout={handleLogout}
                            />
                        )}
                    </div>
                ) : (
                    <WalletConnectButton compact={true} isAuthed={!!user} onOpenAuthModal={onRequireAuth} onOpenSettings={onOpenSettings} />
                )}
            </div>
        </nav>
      </>
    );
}
export const MobileSidebar = ({ isOpen, activeTab, setActiveTab, toggleTheme, theme, setSidebarOpen, handleLogout, user, onRequireAuth, totalEquity, buyingPower, isContractOwner, onSocialClick, onSearch }: any) => {
    const drawerRef = useRef<HTMLDivElement>(null);
    const closeRef = useRef(setSidebarOpen);
    closeRef.current = setSidebarOpen;
    useEffect(() => {
        if (!isOpen) return;
        const previous = document.activeElement as HTMLElement | null;
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        drawerRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeRef.current(false);
            } else if (event.key === 'Tab') {
                const controls = Array.from(drawerRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]') ?? []);
                const first = controls[0];
                const last = controls[controls.length - 1];
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = overflow;
            if (previous?.isConnected) previous.focus({ preventScroll: true });
        };
    }, [isOpen]);

    const destinations = [
        { id: TabView.DASHBOARD, icon: LayoutDashboard, label: 'Dashboard', requiresAuth: true },
        { id: TabView.TRADE, icon: TrendingUp, label: 'Trade', requiresAuth: false },
        { id: TabView.MARKETS, icon: BarChart2, label: 'Markets', requiresAuth: false },
        { id: TabView.SOCIAL, icon: Users, label: 'Social', requiresAuth: false },
        { id: TabView.LEADERBOARD, icon: Trophy, label: 'Leaderboard', requiresAuth: false },
    ].filter(item => !item.requiresAuth || user);
    const navigate = (id: TabView) => {
        if (id === TabView.SOCIAL && onSocialClick) onSocialClick();
        else setActiveTab(id);
        setSidebarOpen(false);
    };
    const name = user ? profileDisplayName(user) : '';

    return <>
        <div className="mobile-menu-backdrop" data-open={isOpen} aria-hidden="true" onClick={() => setSidebarOpen(false)}/>
        <div ref={drawerRef} className="mobile-menu" data-open={isOpen} role="dialog" aria-label="Navigation"
            aria-modal={isOpen || undefined} aria-hidden={!isOpen} inert={!isOpen}>
            <header className="mobile-menu-header">
                <span className="mobile-menu-wordmark">Velo</span>
                <button type="button" className="mobile-menu-close" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}><X size={20}/></button>
            </header>
            <div className="mobile-menu-scroll">
                {onSearch && <button type="button" className="mobile-menu-search" onClick={onSearch}><Search size={18}/><span>Search markets & traders</span></button>}
                <nav className="mobile-menu-links" aria-label="Browse Velo">
                    {destinations.map(({id, icon: Icon, label}) => <button type="button" key={id}
                        aria-current={activeTab === id ? 'page' : undefined} onClick={() => navigate(id)}>
                        <Icon size={19} strokeWidth={activeTab === id ? 2 : 1.7}/><span>{label}</span>
                        {activeTab === id && <span className="mobile-menu-current" aria-hidden="true"/>}
                    </button>)}
                </nav>
                {user && <section className="mobile-menu-account" aria-label="Your account">
                    <button type="button" className="mobile-menu-profile" aria-label={`View ${name} profile`}
                        aria-current={activeTab === TabView.PROFILE ? 'page' : undefined} onClick={() => navigate(TabView.PROFILE)}>
                        <img src={user.avatar} alt=""/>
                        <span><strong>{name}</strong><small>View profile</small></span>
                        <span className="mobile-menu-network">Testnet</span>
                    </button>
                    <dl className="mobile-menu-balances">
                        <div><dt>Total equity</dt><dd><AnimatedValue value={totalEquity ?? user.balance}/></dd></div>
                        <div><dt>Available to trade</dt><dd><AnimatedValue value={buyingPower ?? user.balance}/></dd></div>
                    </dl>
                    {isContractOwner && <button type="button" className="mobile-menu-admin" aria-current={activeTab === TabView.ADMIN ? 'page' : undefined} onClick={() => navigate(TabView.ADMIN)}><Shield size={18}/><span>Admin</span></button>}
                </section>}
            </div>
            <footer className="mobile-menu-footer">
                <button type="button" className="velo-button velo-button--secondary" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} appearance`}
                    onClick={event => transitionAppearance(() => flushSync(toggleTheme), event.currentTarget)}>
                    {theme === 'dark' ? <Sun size={17}/> : <Moon size={17}/>}<span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
                </button>
                {user ? <button type="button" className="velo-button velo-button--danger" onClick={handleLogout}><LogOut size={17}/>Log out</button>
                    : <button type="button" className="velo-button velo-button--primary" onClick={() => { setSidebarOpen(false); onRequireAuth(); }}><Wallet size={17}/>Sign in</button>}
            </footer>
        </div>
    </>;
};
export const MobileBottomNav = ({ activeTab, setActiveTab, user, onSocialClick }: any) => {
    const items = [
        { id: TabView.DASHBOARD, icon: LayoutDashboard, label: 'Home', requiresAuth: true },
        { id: TabView.TRADE, icon: TrendingUp, label: 'Trade', requiresAuth: false },
        { id: TabView.MARKETS, icon: BarChart2, label: 'Mkts', requiresAuth: false },
        { id: TabView.SOCIAL, icon: MessageSquare, label: 'Social', requiresAuth: false },
        { id: TabView.LEADERBOARD, icon: Trophy, label: 'Lead', requiresAuth: false },
    ].filter(item => !item.requiresAuth || user);
    return (
        <div className="velo-mobile-bottom-nav lg:hidden fixed left-2 right-2 z-[60]" style={{ bottom: 'max(10px, env(safe-area-inset-bottom, 10px))' }}>
            <GlassNav mobile items={items} activeId={activeTab} onSelect={id => id === TabView.SOCIAL && onSocialClick ? onSocialClick() : setActiveTab(id)} />
        </div>
    );
}

// ── Available social token pairs (defines which $TICKERS are valid links) ───────
