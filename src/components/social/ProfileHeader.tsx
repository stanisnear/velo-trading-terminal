/**
 * ProfileHeader — banner, avatar, bio, follower stats and action buttons for
 * own/public trader profiles. Extracted from App.tsx (stage 7): leaf component,
 * deps are VerifiedBadge + formatMoney from shared and one lucide icon.
 */
import React from 'react';
import { Edit, Sparkles } from 'lucide-react';
import { VerifiedBadge, formatMoney } from '@/components/ui/shared';

export const ProfileHeader = ({ profile, isOwn, onEdit, onFollow, isFollowing, onCopy, isCopying, showUsersModal, onViewProfile, stats, traders = [] }: any) => {
    const S = {
        mono: { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1' } as React.CSSProperties,
        display: { fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' } as React.CSSProperties,
        label: { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)' } as React.CSSProperties,
    };
    const realizedPnl = stats?.realizedPnl ?? profile.pnl ?? profile.pnlTotal ?? 0;
    const winRate = stats?.winRate ?? profile.winRate ?? 0;
    const pillBtn: React.CSSProperties = {
        padding: '7px 16px', borderRadius: 20, border: 'none', cursor: 'pointer',
        fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
        letterSpacing: '0.06em', textTransform: 'uppercase', transition: 'all 0.15s',
    };
    return (
        <div className="vp" style={{ background: 'var(--glass-bg)', border: '1px solid var(--hairline)', borderRadius: 20, backdropFilter: 'blur(8px) saturate(1.1)', WebkitBackdropFilter: 'blur(8px) saturate(1.1)', overflow: 'hidden', marginBottom: 24 }}>
            {/* Banner */}
            <div className="velo-profile-banner" style={{ height: 160, width: '100%', position: 'relative', background: profile.banner ? '#000' : 'var(--holo-linear)', backgroundSize: '220% 100%', animation: profile.banner ? 'none' : 'holoSlide 14s linear infinite' }}>
                {profile.banner && <img src={profile.banner} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt=""/>}
                {/* Soft vignette for contrast with the avatar */}
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0) 60%, rgba(0,0,0,0.25) 100%)', pointerEvents: 'none' }}/>
            </div>
            <div className="velo-profile-inner" style={{ padding: '0 24px 24px', position: 'relative' }}>
                {/* Avatar + actions row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: -40, marginBottom: 16 }}>
                    <div className="velo-profile-avatar" style={{ width: 88, height: 88, borderRadius: '50%', border: '4px solid var(--bg-base)', overflow: 'hidden', background: 'var(--chip-bg)', boxShadow: '0 12px 30px -12px rgba(0,0,0,0.3)' }}>
                        <img src={profile.avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt=""/>
                    </div>
                    <div className="velo-profile-actions" style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                        {isOwn ? (
                            <button onClick={onEdit}
                                style={{ ...pillBtn, background: 'var(--chip-bg)', border: '1px solid var(--hairline-strong)', color: 'var(--fg)' }}
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--hairline)'}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--chip-bg)'}>
                                Edit Profile
                            </button>
                        ) : (
                            <>
                                <button onClick={onFollow}
                                    style={{ ...pillBtn, background: isFollowing ? 'var(--chip-bg)' : 'var(--fg)', border: isFollowing ? '1px solid var(--hairline-strong)' : 'none', color: isFollowing ? 'var(--fg)' : 'var(--bg-base)' }}>
                                    {isFollowing ? 'Following' : 'Follow'}
                                </button>
                            </>
                        )}
                    </div>
                </div>
                {/* Name + handle */}
                <div style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <h2 className="velo-profile-username" style={{ ...S.display, fontSize: 32, color: 'var(--fg)', margin: 0, lineHeight: 1.1 }}>{profile.username}</h2>
                        {profile.veloRewards > 10000 && <Sparkles size={18} style={{ color: 'var(--iris-amber)' }} fill="currentColor"/>}
                        <VerifiedBadge userId={profile.id} traders={traders} reason={profile.verifiedReason} size={16}/>
                    </div>
                    <p style={{ ...S.mono, fontSize: 12, color: 'var(--fg-muted)', margin: 0, letterSpacing: '0.02em' }}>{profile.handle}</p>
                </div>
                {/* Bio */}
                {profile.bio && (
                    <p style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-muted)', lineHeight: 1.55, maxWidth: 620, margin: '0 0 18px' }}>{profile.bio}</p>
                )}
                {/* Stats row */}
                <div className="velo-profile-stats" style={{ display: 'flex', flexWrap: 'wrap', gap: 24, paddingTop: 14, borderTop: '1px solid var(--hairline)' }}>
                    <button onClick={() => showUsersModal("Followers", profile.followers, onViewProfile)}
                        style={{ display: 'flex', alignItems: 'baseline', gap: 6, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}>
                        <span style={{ ...S.mono, fontSize: 15, fontWeight: 700, color: 'var(--fg)' }}>{profile.followers.length}</span>
                        <span style={{ ...S.label }}>Followers</span>
                    </button>
                    <button onClick={() => showUsersModal("Following", profile.following, onViewProfile)}
                        style={{ display: 'flex', alignItems: 'baseline', gap: 6, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}>
                        <span style={{ ...S.mono, fontSize: 15, fontWeight: 700, color: 'var(--fg)' }}>{profile.following.length}</span>
                        <span style={{ ...S.label }}>Following</span>
                    </button>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ ...S.mono, fontSize: 15, fontWeight: 700, color: realizedPnl >= 0 ? 'var(--pnl-up)' : 'var(--pnl-down)' }}>
                            {realizedPnl >= 0 ? '+' : '-'}${formatMoney(Math.abs(realizedPnl))}
                        </span>
                        <span style={{ ...S.label }}>PnL</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ ...S.mono, fontSize: 15, fontWeight: 700, color: 'var(--fg)' }}>{winRate.toFixed(1)}%</span>
                        <span style={{ ...S.label }}>Win Rate</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
