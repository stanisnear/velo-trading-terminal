/**
 * LeaderboardView — traders ranked by verified on-chain performance, with a
 * podium for the top three. Extracted from App.tsx (stage 1 of the monolith
 * decomposition): this component is a pure leaf — props in, JSX out — with no
 * App-level closures, which is what makes it safe to move first.
 */
import React, { useState, useEffect } from 'react';
import { Copy } from 'lucide-react';
import { formatMoney } from '@/components/ui/shared';

const S_LB = {
    mono:    { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1', fontVariantNumeric: 'tabular-nums' as const },
    display: { fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' },
    label:   { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)' as const },
};
const podiumGolds = [
    // #1 — gold: use token-based glass with gold tint
    'var(--podium-gold-bg, var(--glass-bg-strong))',
    // #2 — silver: token-based glass with silver tint
    'var(--podium-silver-bg, var(--glass-bg-strong))',
    // #3 — bronze: token-based glass with bronze tint
    'var(--podium-bronze-bg, var(--glass-bg-strong))',
];
const podiumBorders = [
    'var(--podium-gold-border)',   // gold
    'var(--podium-silver-border)', // silver
    'var(--podium-bronze-border)', // bronze
];
const podiumAccents = [
    'var(--podium-gold-text)',   // gold text
    'var(--podium-silver-text)', // silver text
    'var(--podium-bronze-text)', // bronze text
];
export const LeaderboardView = ({ traders, user, walletAddress, handleFollow, handleCopyTrade, handleViewProfile }: any) => {
    const [period, setPeriod] = React.useState<'24H' | '7D' | '30D' | 'ALL'>('ALL');
    const [isMobile, setIsMobile] = React.useState(window.innerWidth < 640);
    React.useEffect(() => {
        const handler = () => setIsMobile(window.innerWidth < 640);
        window.addEventListener('resize', handler);
        return () => window.removeEventListener('resize', handler);
    }, []);
    // Leaderboard rules (build 79+):
    //   1. Wallet-only — every trader on the leaderboard must have a wallet_address
    //      in their profile. Demo (email-only) users are excluded entirely so
    //      the rankings reflect verifiable on-chain PnL.
    //   2. The current user is included if AND ONLY IF they themselves have a
    //      wallet connected (wallet_address may not yet be set in the trader
    //      object for the current session, so we check `walletAddress` prop).
    //   3. Exclude placeholder accounts (default username "Trader").
    //   4. Require evidence of activity — non-zero PnL or a follower — to filter
    //      out stale test accounts.
    //   5. Sort by realized PnL desc.
    const sortedTraders = [...traders]
        .filter((t: any) => {
            if (!t || !t.id) return false;
            if (!t.username || t.username === 'Trader') return false;
            // Current user — always show if logged in
            if (user && t.id === user.id) return true;
            // Other traders — show if they have any activity (wallet address not required
            // since some users may not have it persisted yet)
            const hasActivity = (t.pnl ?? 0) !== 0 || (t.followers?.length ?? 0) > 0;
            return hasActivity;
        })
        .sort((a: any, b: any) => (b.pnl ?? 0) - (a.pnl ?? 0));
    const panel: React.CSSProperties = { background: 'var(--glass-bg)', border: '1px solid var(--hairline)', borderRadius: 16, backdropFilter: 'blur(8px) saturate(1.1)', WebkitBackdropFilter: 'blur(8px) saturate(1.1)', boxShadow: 'var(--glass-shadow)', overflow: 'hidden' };
    return (
        <div style={{ width: '100%', maxWidth: 1600, margin: '0 auto', paddingBottom: isMobile ? 'max(100px, calc(env(safe-area-inset-bottom, 0px) + 100px))' : 80 }} className="animate-fade-in lb-view">
            {/* Hero header */}
            <div style={{ textAlign: 'center', marginBottom: 40 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 14px', borderRadius: 999, background: 'var(--chip-bg)', border: '1px solid var(--hairline)', marginBottom: 16 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--pnl-up)', display: 'inline-block', boxShadow: '0 0 6px var(--pnl-up)' }} />
                    <span style={{ ...S_LB.label, fontSize: 11, color: 'var(--fg-subtle)' }}>{period} · ALL PAIRS</span>
                </div>
                <h1 className="lb-hero-title" style={{ fontFamily: 'var(--font-display)', fontSize: 72, fontWeight: 400, letterSpacing: '-0.02em', color: 'var(--fg)', lineHeight: 1, margin: '0 0 12px' }}>
                    Top <em style={{ fontStyle: 'italic' }}>Traders</em>
                </h1>
                <p style={{ ...S_LB.mono, fontSize: 14, color: 'var(--fg-muted)' }}>Copy the most profitable traders on Velo.</p>
                <div style={{ display: 'inline-flex', gap: 4, marginTop: 16, background: 'var(--chip-bg)', borderRadius: 10, padding: 4, border: '1px solid var(--hairline)' }}>
                    {(['24H','7D','30D','ALL'] as const).map((p) => (
                        <button key={p} onClick={() => setPeriod(p)} style={{ padding: '5px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', ...S_LB.mono, fontSize: 11, fontWeight: 700, background: period === p ? 'var(--bg-base-2)' : 'transparent', color: period === p ? 'var(--fg)' : 'var(--fg-subtle)', boxShadow: period === p ? '0 1px 4px rgba(0,0,0,0.3)' : 'none' }}>{p}</button>
                    ))}
                </div>
            </div>

            {/* Podium top 3 */}
            {isMobile ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                    {/* #1 full width */}
                    {[0, 1, 2].map((idx) => {
                        const trader = sortedTraders[idx];
                        if (!trader) return null;
                        const rank = idx + 1;
                        const isSelf = user && trader.id === user.id;
                        const accentColor = podiumAccents[idx];
                        const winRateDisplay = Number.isFinite(trader.winRate) ? `${parseFloat(trader.winRate.toFixed(1))}%` : '—';
                        return (
                            <div key={trader.id} onClick={() => handleViewProfile(trader)} style={{
                                background: isSelf ? 'color-mix(in oklab, var(--iris-violet) 18%, var(--bg-base-2))' : podiumGolds[idx],
                                border: isSelf ? '1px solid oklch(0.68 0.22 295 / 0.5)' : podiumBorders[idx],
                                borderRadius: 16,
                                backdropFilter: 'blur(8px) saturate(1.1)', WebkitBackdropFilter: 'blur(8px) saturate(1.1)',
                                padding: '14px 16px',
                                display: 'flex', alignItems: 'center', gap: 14,
                                position: 'relative', overflow: 'hidden', cursor: 'pointer',
                            }}>
                                <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontFamily: 'var(--font-display)', fontSize: 72, fontWeight: 400, color: accentColor, opacity: 0.1, lineHeight: 1, userSelect: 'none' as const, pointerEvents: 'none' }}>{rank}</span>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: accentColor, letterSpacing: '0.08em', width: 22, flexShrink: 0 }}>#{rank}</span>
                                <div style={{ position: 'relative', width: 44, height: 44, borderRadius: '50%', overflow: 'hidden', border: `2px solid ${accentColor}`, flexShrink: 0 }}>
                                    <img src={trader.avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                        <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', letterSpacing: '-0.02em', fontSize: 15, color: 'var(--fg)' }}>{trader.username}</span>
                                        {isSelf && <span style={{ padding: '1px 5px', borderRadius: 4, background: 'var(--iris-violet)', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: 7, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>You</span>}
                                    </div>
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--fg-subtle)' }}>{trader.handle}</span>
                                </div>
                                <div style={{ textAlign: 'right' as const, flexShrink: 0 }}>
                                    <p style={{ fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1', fontSize: 14, fontWeight: 700, color: trader.pnl >= 0 ? 'var(--pnl-up)' : 'var(--pnl-down)', marginBottom: 2 }}>{trader.pnl >= 0 ? '+' : '-'}${formatMoney(Math.abs(trader.pnl))}</p>
                                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-subtle)' }}>{winRateDisplay} WR</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
            <div className="lb-podium" style={{ display: 'grid', gap: 14, marginBottom: 18, alignItems: 'end' }}>
                {[1, 0, 2].map((idx) => {
                    const trader = sortedTraders[idx];
                    if (!trader) return <div key={idx} />;
                    const rank = idx + 1;
                    const isFirst = idx === 0;
                    const isSelf = user && trader.id === user.id;
                    const accentColor = podiumAccents[idx];
                    const winRateDisplay = Number.isFinite(trader.winRate) ? `${parseFloat(trader.winRate.toFixed(1))}%` : '—';
                    return (
                        <div key={trader.id} style={{
                            background: isSelf ? 'color-mix(in oklab, var(--iris-violet) 18%, var(--bg-base-2))' : podiumGolds[idx],
                            border: isSelf ? '1px solid oklch(0.68 0.22 295 / 0.5)' : podiumBorders[idx],
                            borderRadius: 16,
                            backdropFilter: 'blur(10px) saturate(1.2)',
                            WebkitBackdropFilter: 'blur(10px) saturate(1.2)',
                            boxShadow: isFirst
                                ? '0 0 0 1px oklch(0.70 0.15 75 / 0.12) inset, 0 1px 0 rgba(255,255,255,0.08) inset, 0 32px 64px -24px rgba(0,0,0,0.7), 0 0 40px -10px oklch(0.70 0.15 75 / 0.15)'
                                : '0 1px 0 rgba(255,255,255,0.05) inset, 0 24px 48px -20px rgba(0,0,0,0.6)',
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                            padding: isFirst ? '40px 28px 28px' : '28px 24px 24px',
                            position: 'relative', overflow: 'visible',
                        }}>
                            {/* Rank watermark */}
                            <span style={{ position: 'absolute', top: isFirst ? 14 : 10, left: 16, fontFamily: 'var(--font-display)', fontSize: isFirst ? 76 : 60, fontWeight: 400, color: accentColor, opacity: 0.18, lineHeight: 1, userSelect: 'none' as const }}>{rank}</span>
                            {/* Rank badge */}
                            <span style={{ position: 'absolute', top: 14, left: 16, fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: accentColor, letterSpacing: '0.08em', opacity: 0.9 }}>#{rank}</span>
                            {isSelf && (
                                <span style={{ position: 'absolute', top: 12, right: 12, padding: '3px 8px', borderRadius: 6, background: 'var(--iris-violet)', color: '#fff', ...S_LB.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>You</span>
                            )}
                            {/* Avatar */}
                            <div style={{ position: 'relative', width: isFirst ? 92 : 76, height: isFirst ? 92 : 76, borderRadius: '50%', overflow: 'hidden', border: `2px solid ${accentColor}`, boxShadow: `0 8px 24px -8px rgba(0,0,0,0.6), 0 0 0 4px ${accentColor}22`, marginBottom: 16, flexShrink: 0, zIndex: 1 }}>
                                <img src={trader.avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </div>
                            <p style={{ ...S_LB.display, fontSize: isFirst ? 22 : 18, color: 'var(--fg)', marginBottom: 2, textAlign: 'center' }}>{trader.username}</p>
                            <p style={{ ...S_LB.label, marginBottom: 20, color: accentColor, opacity: 0.7 }}>{trader.handle}</p>
                            {/* Stats row */}
                            <div style={{ display: 'flex', gap: 0, marginBottom: 20, width: '100%', background: 'var(--podium-stats-bg)', borderRadius: 10, border: '1px solid var(--podium-stats-border)', overflow: 'hidden' }}>
                                <div style={{ flex: 1, textAlign: 'center', padding: '10px 12px', borderRight: '1px solid var(--podium-stats-border)' }}>
                                    <p style={{ ...S_LB.label, fontSize: 9, marginBottom: 4 }}>PNL</p>
                                    <p style={{ ...S_LB.mono, fontSize: isFirst ? 18 : 15, fontWeight: 700, color: trader.pnl >= 0 ? 'var(--pnl-up)' : 'var(--pnl-down)', lineHeight: 1 }}>{trader.pnl >= 0 ? '+' : '-'}${formatMoney(Math.abs(trader.pnl))}</p>
                                </div>
                                <div style={{ flex: 1, textAlign: 'center', padding: '10px 12px' }}>
                                    <p style={{ ...S_LB.label, fontSize: 9, marginBottom: 4 }}>WIN RATE</p>
                                    <p style={{ ...S_LB.mono, fontSize: isFirst ? 18 : 15, fontWeight: 700, color: 'var(--fg)', lineHeight: 1 }}>{winRateDisplay}</p>
                                </div>
                            </div>
                            <button onClick={() => handleViewProfile(trader)}
                                style={{ width: '100%', padding: '11px', borderRadius: 11, background: 'var(--podium-btn-hover-bg)', border: `1px solid ${accentColor}44`, ...S_LB.mono, fontSize: 11, fontWeight: 700, color: accentColor, cursor: 'pointer', letterSpacing: '0.08em', textTransform: 'uppercase' as const, transition: 'all 0.15s' }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${accentColor}22`; (e.currentTarget as HTMLElement).style.borderColor = `${accentColor}88`; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--podium-btn-hover-bg)'; (e.currentTarget as HTMLElement).style.borderColor = `${accentColor}44`; }}>
                                View Profile
                            </button>
                        </div>
                    )
                })}
            </div>
            )} {/* end desktop podium ternary */}

            {/* Full table — desktop */}
            <div className="vp" style={panel}>
                {!isMobile && (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' as const, whiteSpace: 'nowrap' as const }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--hairline)' }}>
                                {['Rank','Trader','PnL (All Time)','Win Rate','Followers',''].map((h,i) => (
                                    <th key={h+i} style={{ padding: '11px 20px', textAlign: i === 5 ? 'right' as const : 'left' as const, ...S_LB.label }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {sortedTraders.map((trader: any, i: number) => {
                                const isSelf = user && trader.id === user.id;
                                return (
                                <tr key={trader.id} style={{ borderBottom: '1px solid var(--hairline)', transition: 'background 0.1s', cursor: 'pointer', background: isSelf ? 'color-mix(in oklab, var(--iris-violet, #7C5CFF) 10%, transparent)' : 'transparent' }}
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = isSelf ? 'color-mix(in oklab, var(--iris-violet, #7C5CFF) 16%, transparent)' : 'var(--chip-bg)'}
                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = isSelf ? 'color-mix(in oklab, var(--iris-violet, #7C5CFF) 10%, transparent)' : 'transparent'}>
                                    <td style={{ padding: '12px 20px', ...S_LB.mono, fontSize: 13, fontWeight: 700, color: 'var(--fg-subtle)' }}>#{i + 1}</td>
                                    <td style={{ padding: '12px 20px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <img src={trader.avatar} style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--hairline)' }} />
                                            <div>
                                                <p style={{ ...S_LB.display, fontSize: 14, color: 'var(--fg)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    {trader.username}
                                                    {isSelf && (
                                                        <span style={{ padding: '2px 6px', borderRadius: 4, background: 'var(--iris-violet, #7C5CFF)', color: '#fff', ...S_LB.mono, fontSize: 8, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>You</span>
                                                    )}
                                                </p>
                                                <p style={{ ...S_LB.label, fontSize: 9, marginTop: 1 }}>{trader.handle}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td style={{ padding: '12px 20px', ...S_LB.mono, fontSize: 13, fontWeight: 700, color: trader.pnl >= 0 ? 'var(--pnl-up)' : 'var(--pnl-down)' }}>{trader.pnl >= 0 ? '' : '-'}${formatMoney(Math.abs(trader.pnl))}</td>
                                    <td style={{ padding: '12px 20px', ...S_LB.mono, fontSize: 13, color: 'var(--fg)' }}>{Number.isFinite(trader.winRate) ? `${parseFloat(trader.winRate.toFixed(1))}%` : '—'}</td>
                                    <td style={{ padding: '12px 20px', ...S_LB.mono, fontSize: 13, color: 'var(--fg-muted)' }}>{trader.followers.length}</td>
                                    <td style={{ padding: '12px 20px', textAlign: 'right' as const }}>
                                        <button onClick={() => handleViewProfile(trader)}
                                            style={{ padding: '6px 14px', borderRadius: 9, background: 'var(--chip-bg)', border: '1px solid var(--hairline-strong)', ...S_LB.mono, fontSize: 11, color: 'var(--fg-muted)', cursor: 'pointer', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' as const, transition: 'all 0.1s' }}
                                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--holo-linear)'; (e.currentTarget as HTMLElement).style.backgroundSize = '220% 100%'; (e.currentTarget as HTMLElement).style.color = '#0B0B0E'; }}
                                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--chip-bg)'; (e.currentTarget as HTMLElement).style.color = 'var(--fg-muted)'; }}>
                                            View
                                        </button>
                                    </td>
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                )}

                {/* Mobile card list */}
                {isMobile && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {/* Header row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--hairline)' }}>
                        <span style={{ ...S_LB.label, fontSize: 9 }}>Rank · Trader</span>
                        <span style={{ ...S_LB.label, fontSize: 9 }}>PnL · Win Rate</span>
                    </div>
                    {sortedTraders.map((trader: any, i: number) => {
                        const isSelf = user && trader.id === user.id;
                        const rankColors = ['oklch(0.70 0.15 75)', 'oklch(0.80 0.05 240)', 'oklch(0.65 0.13 50)'];
                        const rankColor = i < 3 ? rankColors[i] : 'var(--fg-subtle)';
                        return (
                            <div key={trader.id}
                                onClick={() => handleViewProfile(trader)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 12,
                                    padding: '12px 16px',
                                    borderBottom: '1px solid var(--hairline)',
                                    cursor: 'pointer',
                                    background: isSelf ? 'color-mix(in oklab, var(--iris-violet) 10%, transparent)' : 'transparent',
                                    transition: 'background 0.1s',
                                }}
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = isSelf ? 'color-mix(in oklab, var(--iris-violet) 16%, transparent)' : 'var(--chip-bg)'}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = isSelf ? 'color-mix(in oklab, var(--iris-violet) 10%, transparent)' : 'transparent'}>
                                {/* Rank */}
                                <span style={{ ...S_LB.mono, fontSize: 12, fontWeight: 700, color: rankColor, width: 26, flexShrink: 0, textAlign: 'center' as const }}>#{i + 1}</span>
                                {/* Avatar */}
                                <div style={{ position: 'relative', flexShrink: 0 }}>
                                    <img src={trader.avatar} style={{ width: 40, height: 40, borderRadius: '50%', border: `1.5px solid ${i < 3 ? rankColor : 'var(--hairline)'}`, display: 'block' }} />
                                    {isSelf && <span style={{ position: 'absolute', bottom: -2, right: -2, width: 14, height: 14, borderRadius: '50%', background: 'var(--iris-violet)', border: '2px solid var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 7, color: '#fff', fontWeight: 900 }}>✓</span></span>}
                                </div>
                                {/* Name + handle */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                        <span style={{ ...S_LB.display, fontSize: 14, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{trader.username}</span>
                                        {isSelf && <span style={{ padding: '1px 5px', borderRadius: 4, background: 'var(--iris-violet)', color: '#fff', ...S_LB.mono, fontSize: 7, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, flexShrink: 0 }}>You</span>}
                                    </div>
                                    <span style={{ ...S_LB.label, fontSize: 9, color: 'var(--fg-subtle)' }}>{trader.handle} · {trader.followers.length} followers</span>
                                </div>
                                {/* Stats */}
                                <div style={{ textAlign: 'right' as const, flexShrink: 0 }}>
                                    <p style={{ ...S_LB.mono, fontSize: 13, fontWeight: 700, color: trader.pnl >= 0 ? 'var(--pnl-up)' : 'var(--pnl-down)', marginBottom: 2 }}>
                                        {trader.pnl >= 0 ? '+' : '-'}${formatMoney(Math.abs(trader.pnl))}
                                    </p>
                                    <p style={{ ...S_LB.mono, fontSize: 10, color: 'var(--fg-muted)' }}>
                                        {Number.isFinite(trader.winRate) ? `${parseFloat(trader.winRate.toFixed(1))}%` : '—'} WR
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>
                )}
            </div>
        </div>
    );
}
// Helper: render post content with clickable @mentions

export default LeaderboardView;
