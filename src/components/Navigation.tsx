/**
 * Navigation — desktop Navbar (with notifications dropdown + profile popup),
 * MobileSidebar, and MobileBottomNav. Extracted from App.tsx (stage 2 of the
 * monolith decomposition). All three are pure leaf components: every piece of
 * state they touch arrives via props; the only module-level dependency is the
 * shared formatMoney helper.
 */
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Bell, Check, Copy, LayoutDashboard, LogOut, Menu, Moon, PlusCircle, Sun,
  UserCircle, Wallet, X, Settings, Shield, Trophy, TrendingUp, BarChart2,
  Users, MessageSquare, Search,
} from 'lucide-react';
import { TabView } from '@/utils/types';
import { formatMoney } from '@/components/ui/shared';
import { WalletConnectButton } from './WalletConnectButton';

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
            <div style={{
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
                        <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 14, color: 'var(--fg)', letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.username}</div>
                        <div style={{ ...S.label, fontSize: 9, marginTop: 1 }}>{user.handle}</div>
                    </div>
                </div>

                {/* Equity display */}
                <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--hairline)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={S.label}>Total Equity</span>
                    <span style={{ ...S.mono, fontSize: 13, fontWeight: 700, color: 'var(--iris-violet)' }}>${(totalEquity || user.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
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

export const Navbar = ({ activeTab, setActiveTab, toggleTheme, theme, handleLogout, user, onRequireAuth, unreadCount, setMobileMenuOpen, notifications, onNotificationClick, isNotifOpen, setNotifOpen, totalEquity, onCreatePost, onOpenSettings, isContractOwner, anyModalOpen, onSocialClick }: any) => {
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
    const S = {
        mono: { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1' },
        label: { fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.14em' },
    };
    return (
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
            className="navbar-container navbar-mobile-flush"
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <button
                    className="lg:hidden"
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', minWidth: 0 }} onClick={() => user && setActiveTab(TabView.DASHBOARD)}>
                    <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 28, color: 'var(--fg)', letterSpacing: '-0.04em', lineHeight: 1 }}>Velo</span>
                </div>
            </div>

            <div className="hidden lg:flex" style={{ justifyContent: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 4, borderRadius: 14, background: 'var(--chip)', border: '1px solid var(--hr)', minWidth: 'fit-content' }}>
                {navItems.map((item: any) => {
                    const isActive = activeTab === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => item.id === TabView.SOCIAL && onSocialClick ? onSocialClick() : setActiveTab(item.id)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 7,
                                padding: '8px 14px',
                                borderRadius: 10,
                                border: 'none',
                                cursor: 'pointer',
                                background: isActive ? 'var(--bg)' : 'transparent',
                                color: isActive ? 'var(--fg)' : 'var(--fg-2)',
                                boxShadow: isActive ? '0 1px 0 var(--hr-2) inset, 0 -1px 0 rgba(0,0,0,0.18) inset' : 'none',
                                transition: 'all 0.12s',
                                ...S.label,
                            }}
                        >
                            <item.icon size={12} strokeWidth={isActive ? 2.4 : 2} />
                            {item.label}
                        </button>
                    )
                })}
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifySelf: 'end' }}>
                <div className="hidden lg:flex chip" style={{ minWidth: 76, justifyContent: 'center', gap: 6 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', color: 'var(--fg-2)' }}>TESTNET</span>
                </div>
                <div style={{ position: 'relative' }}>
                    <button onClick={() => setNotifOpen(!isNotifOpen)} className="navbar-icon-btn" style={{ display: 'grid', placeItems: 'center', width: 44, height: 44, borderRadius: 14, border: '1px solid var(--hr)', cursor: 'pointer', background: 'var(--chip)', color: 'var(--fg-2)', position: 'relative', transition: 'all 0.12s', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' } as any}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--chip-h)')} onMouseLeave={e => (e.currentTarget.style.background = 'var(--chip)')}>
                        <Bell size={18}/>
                        {unreadCount > 0 && <span style={{ position: 'absolute', top: 8, right: 8, width: 6, height: 6, background: 'var(--pnl-down)', borderRadius: '50%', border: '1.5px solid var(--bg)' }}/>}
                    </button>
                    {isNotifOpen && (
                        <>
                            <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setNotifOpen(false)}/>
                            <div style={{
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
                                        <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 17, letterSpacing: '-0.03em', color: 'var(--fg)', lineHeight: 1 }}>Notifications</span>
                                        {unreadCount > 0 && (
                                            <span style={{
                                                fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
                                                letterSpacing: '0.06em', padding: '2px 6px',
                                                borderRadius: 999, background: 'var(--velo-violet)',
                                                color: '#fff', lineHeight: 1.4,
                                            }}>{unreadCount}</span>
                                        )}
                                    </div>
                                    {notifications.length > 0 && (
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
                                            const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
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

                <button onClick={toggleTheme} style={{ display: 'grid', placeItems: 'center', width: 44, height: 44, borderRadius: 14, border: '1px solid var(--hr)', cursor: 'pointer', background: 'var(--chip)', color: 'var(--fg-2)', transition: 'all 0.12s', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' } as any}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--chip-h)')} onMouseLeave={e => (e.currentTarget.style.background = 'var(--chip)')}>
                    {theme === 'dark' ? <Sun size={16}/> : <Moon size={16}/>}
                </button>

                {user ? (
                    <div ref={avatarBtnRef as any} style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 2 }}>
                        {/* Desktop: pill with name + avatar */}
                        <button
                            onClick={() => setAvatarPopupOpen(prev => !prev)}
                            className="hidden lg:flex"
                            style={{ alignItems: 'center', gap: 10, padding: '5px 6px 5px 12px', borderRadius: 999, background: 'var(--chip)', border: `1px solid ${avatarPopupOpen ? 'var(--velo-violet)' : 'var(--hr)'}`, cursor: 'pointer', transition: 'border-color 0.15s' }}
                            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--velo-violet)')}
                            onMouseLeave={e => { if (!avatarPopupOpen) e.currentTarget.style.borderColor = 'var(--hr)'; }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                                <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 14, letterSpacing: '-0.03em', color: 'var(--fg)', lineHeight: 1 }}>{user.username}</span>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontFeatureSettings: '"tnum" 1', fontWeight: 700, color: 'var(--pnl-up)', lineHeight: 1 }}>${formatMoney(totalEquity > 0 ? totalEquity : user.balance)}</span>
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
                    <WalletConnectButton compact={true} onOpenAuthModal={onRequireAuth} onOpenSettings={onOpenSettings} />
                )}
            </div>
        </nav>
    );
}
export const MobileSidebar = ({ isOpen, activeTab, setActiveTab, toggleTheme, theme, setSidebarOpen, handleLogout, user, onRequireAuth, unreadCount, totalEquity, buyingPower, isContractOwner, onSocialClick }: any) => {
    const navItems = [
        { id: TabView.DASHBOARD, icon: LayoutDashboard, label: 'Dashboard', requiresAuth: true },
        { id: TabView.TRADE,     icon: TrendingUp,      label: 'Trade',     requiresAuth: false },
        { id: TabView.MARKETS,   icon: BarChart2,        label: 'Markets',   requiresAuth: false },
        { id: TabView.SOCIAL,    icon: Users,            label: 'Social',    requiresAuth: false },
        { id: TabView.LEADERBOARD, icon: Trophy,         label: 'Leaderboard', requiresAuth: false },
        { id: TabView.PROFILE,   icon: UserCircle,       label: 'Profile',   requiresAuth: true },
        ...(isContractOwner ? [{ id: TabView.ADMIN, icon: Shield, label: 'Admin', requiresAuth: false }] : []),
    ].filter(item => !item.requiresAuth || user);

    const S = {
        mono:    { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1', fontVariantNumeric: 'tabular-nums' as const },
        display: { fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' },
        label:   { fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)' },
    };

    return (
        <>
            <div
                style={{ position: 'fixed', inset: 0, background: 'rgba(5,6,8,0.45)', backdropFilter: 'blur(4px)', zIndex: 60, transition: 'opacity 0.25s', opacity: isOpen ? 1 : 0, pointerEvents: isOpen ? 'auto' : 'none' }}
                onClick={() => setSidebarOpen(false)}
            />

            <div style={{
                position: 'fixed', inset: '0 auto 0 0', width: 292,
                background: 'var(--glass-2)', borderRight: '1px solid var(--hr)',
                zIndex: 70, display: 'flex', flexDirection: 'column',
                transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
                transition: 'transform 0.28s cubic-bezier(0.22,1,0.36,1)',
                boxShadow: '12px 0 40px rgba(0,0,0,0.25)',
                backdropFilter: 'blur(40px) saturate(1.6)',
                WebkitBackdropFilter: 'blur(40px) saturate(1.6)',
            }}>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', paddingTop: 'env(safe-area-inset-top, 0px)', height: 'calc(60px + env(safe-area-inset-top, 0px))', borderBottom: '1px solid var(--hr)', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ ...S.display, fontStyle: 'italic', fontSize: 24, color: 'var(--fg)', letterSpacing: '-0.04em' }}>Velo</span>
                    </div>
                    <button onClick={() => setSidebarOpen(false)} style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 12, border: '1px solid var(--hr)', background: 'var(--chip)', cursor: 'pointer', color: 'var(--fg-2)' }}>
                        <X size={15}/>
                    </button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '14px 12px 0' }}>
                    {navItems.map(item => {
                        const isActive = activeTab === item.id;
                        return (
                            <button key={item.id}
                                onClick={() => { if (item.id === TabView.SOCIAL && onSocialClick) { onSocialClick(); setSidebarOpen(false); } else { setActiveTab(item.id); setSidebarOpen(false); } }}
                                style={{
                                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '12px 14px', borderRadius: 14, border: '1px solid transparent', cursor: 'pointer',
                                    marginBottom: 2,
                                    background: isActive ? 'var(--prism-vivid)' : 'transparent',
                                    color: isActive ? 'var(--velo-bone)' : 'var(--fg-2)',
                                    fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
                                    letterSpacing: '0.12em', textTransform: 'uppercase' as const,
                                    transition: 'background 0.12s, color 0.12s, border-color 0.12s',
                                    backgroundSize: isActive ? '200% 100%' : undefined,
                                    animation: isActive ? 'prismSlide 14s linear infinite' : undefined,
                                    borderColor: isActive ? 'transparent' : 'var(--hr)',
                                }}
                                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--chip)'; }}
                                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                            >
                                <item.icon size={15} strokeWidth={isActive ? 2.5 : 2}/>
                                {item.label}
                            </button>
                        );
                    })}
                </div>
                <div style={{ padding: 14, borderTop: '1px solid var(--hr)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {user ? (
                        <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'var(--chip)', borderRadius: 16, border: '1px solid var(--hr)' }}>
                                <img src={user.avatar} style={{ width: 38, height: 38, borderRadius: '50%', border: '1px solid var(--hr-2)', flexShrink: 0, objectFit: 'cover' }} alt=""/>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ ...S.display, fontSize: 16, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{user.username}</div>
                                    <div style={{ ...S.label, fontSize: 9, marginTop: 2, color: 'var(--fg-2)' }}>{user.handle}</div>
                                </div>
                                <div style={{ padding: '2px 8px', borderRadius: 6, background: 'var(--chip)', border: '1px solid var(--hr)', fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--fg-2)' }}>TESTNET</div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                <div style={{ padding: '12px', background: 'var(--chip)', borderRadius: 14, border: '1px solid var(--hr)' }}>
                                    <div style={{ ...S.label, marginBottom: 4 }}>Total Equity</div>
                                    <div style={{ ...S.mono, fontSize: 13, fontWeight: 700, color: 'var(--fg)' }}>
                                        ${formatMoney(totalEquity > 0 ? totalEquity : user.balance)}
                                    </div>
                                </div>
                                <div style={{ padding: '12px', background: 'var(--chip)', borderRadius: 14, border: '1px solid var(--hr)' }}>
                                    <div style={{ ...S.label, marginBottom: 4 }}>Buying Power</div>
                                    <div style={{ ...S.mono, fontSize: 13, fontWeight: 700, color: 'var(--iris-violet)' }}>
                                        ${formatMoney(buyingPower ?? user.balance)}
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={toggleTheme} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flex: 1, padding: '11px 0', borderRadius: 14, border: '1px solid var(--hr)', background: 'var(--chip)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--fg-2)', letterSpacing: '0.1em', transition: 'background 0.1s' }}
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--chip-h)'}
                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--chip)'}>
                                    {theme === 'dark' ? <Sun size={13}/> : <Moon size={13}/>}
                                    {theme === 'dark' ? 'Light' : 'Dark'}
                                </button>
                                <button onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flex: 1, padding: '11px 0', borderRadius: 14, border: '1px solid color-mix(in oklab, var(--pnl-down) 30%, transparent)', background: 'color-mix(in oklab, var(--pnl-down) 12%, transparent)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--pnl-down)', letterSpacing: '0.1em', transition: 'background 0.1s' }}
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'oklch(0.66 0.22 25/0.16)'}
                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'color-mix(in oklab, var(--pnl-down) 12%, transparent)'}>
                                    <LogOut size={13}/> Logout
                                </button>
                            </div>
                        </>
                    ) : (
                        <button onClick={() => { onRequireAuth(); setSidebarOpen(false); }} style={{ width: '100%', padding: '12px', borderRadius: 14, border: 'none', background: 'var(--prism-vivid)', backgroundSize: '200% 100%', animation: 'prismSlide 14s linear infinite', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--velo-bone)', letterSpacing: '0.12em', textTransform: 'uppercase' as const }}>
                            Connect
                        </button>
                    )}
                </div>
            </div>
        </>
    );
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
        <div className="lg:hidden fixed left-2 right-2 z-[60]" style={{ bottom: 'max(10px, env(safe-area-inset-bottom, 10px))' }}>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`, gap: 4, padding: '6px 6px', borderRadius: 26, background: 'var(--glass-bg-strong)', border: '1px solid var(--hairline-strong)', boxShadow: 'var(--glass-shadow)', backdropFilter: 'blur(28px) saturate(1.3)', WebkitBackdropFilter: 'blur(28px) saturate(1.3)' }}>
                {items.map((item) => {
                    const isActive = activeTab === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => item.id === TabView.SOCIAL && onSocialClick ? onSocialClick() : setActiveTab(item.id)}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 5,
                                minHeight: 62,
                                padding: '8px 4px',
                                borderRadius: 20,
                                border: 'none',
                                cursor: 'pointer',
                                background: isActive ? 'var(--bg)' : 'transparent',
                                color: isActive ? 'var(--velo-violet)' : 'var(--fg-3)',
                                boxShadow: isActive ? '0 1px 0 var(--hr-2) inset, 0 -1px 0 rgba(0,0,0,0.18) inset' : 'none',
                                touchAction: 'manipulation',
                                WebkitTapHighlightColor: 'transparent',
                                userSelect: 'none',
                                WebkitUserSelect: 'none',
                                outline: 'none',
                                transition: 'background 0.15s, color 0.15s',
                            }}
                        >
                            <item.icon size={22} strokeWidth={isActive ? 2.4 : 1.8} />
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{item.label}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ── Available social token pairs (defines which $TICKERS are valid links) ───────
