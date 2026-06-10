/**
 * Modals — EditProfileModal, DeletePostConfirmModal, UsersListModal.
 * Extracted from App.tsx (stage 3 of the monolith decomposition). Pure leaf
 * modals: open/close state and all data arrive via props.
 */
import React, { useState, useEffect } from 'react';
import { AlertCircle, ArrowRightLeft, Edit, Trash2, X, Image as ImageIcon } from 'lucide-react';
import { PAIRS } from '@/utils/types';
import { GlassCard, Button, formatPrice, formatMoney, playSound } from '@/components/ui/shared';
import { supabase, uploadAvatar, uploadBanner, isConfigured as isSupabaseConfigured } from '@/services/supabaseStore';

export const EditProfileModal = ({ isOpen, onClose, user, onSave, onDeleteAccount }: any) => {
    const [formData, setFormData] = useState({ bio: '', avatar: '', banner: '', username: '' });
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const [bannerPreview, setBannerPreview] = useState<string | null>(null);
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [bannerFile, setBannerFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteInput, setDeleteInput] = useState('');
    useEffect(() => {
        if (user) {
            setFormData({ bio: user.bio || '', avatar: user.avatar || '', banner: user.banner || '', username: user.username || '' });
            setAvatarPreview(null); setBannerPreview(null);
            setAvatarFile(null); setBannerFile(null);
        }
    }, [user, isOpen]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'avatar' | 'banner') => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            if (type === 'avatar') { setAvatarPreview(ev.target?.result as string); setAvatarFile(file); }
            else { setBannerPreview(ev.target?.result as string); setBannerFile(file); }
        };
        reader.readAsDataURL(file);
    };

    const handleSave = async () => {
        setUploading(true);
        const updates: any = { bio: formData.bio, username: formData.username };
        if (avatarFile && user?.id && isSupabaseConfigured()) {
            const { url } = await uploadAvatar(user.id, avatarFile);
            if (url) updates.avatar = url;
        }
        if (bannerFile && user?.id && isSupabaseConfigured()) {
            const { url } = await uploadBanner(user.id, bannerFile);
            if (url) updates.banner = url;
        }
        setUploading(false);
        await onSave(updates);
        onClose();
    };

    if(!isOpen) return null;
    const S = {
        label: { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)' } as React.CSSProperties,
        mono:  { fontFamily: 'var(--font-mono)' } as React.CSSProperties,
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in" onClick={onClose}>
            <div onClick={(e: any) => e.stopPropagation()} className="animate-bounce-in" style={{
                width: '100%', maxWidth: 480, background: 'var(--glass-bg-strong)', border: '1px solid var(--hairline-strong)',
                borderRadius: 20, overflow: 'hidden', boxShadow: 'var(--glass-shadow)', backdropFilter: 'blur(32px)',
                maxHeight: '90vh', overflowY: 'auto',
            }}>
                {/* Holo accent */}
                <div style={{ height: 3, background: 'var(--holo-linear)', backgroundSize: '220% 100%', animation: 'holoSlide 9s linear infinite' }} />

                {/* Banner upload zone */}
                <div style={{ position: 'relative', height: 120, background: bannerPreview ? '#000' : (formData.banner ? '#000' : 'var(--chip-bg)'), overflow: 'hidden', cursor: 'pointer' }}
                    onClick={() => document.getElementById('velo-banner-upload')?.click()}>
                    {(bannerPreview || formData.banner) && (
                        <img src={bannerPreview || formData.banner} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }} alt="" />
                    )}
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'rgba(0,0,0,0.35)' }}>
                        <ImageIcon size={16} style={{ color: '#fff' }} />
                        <span style={{ ...S.label, color: '#fff', fontSize: 10 }}>Click to change banner</span>
                    </div>
                    <input id="velo-banner-upload" type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleFileChange(e, 'banner')} />
                </div>

                {/* Avatar upload zone */}
                <div style={{ padding: '0 24px', position: 'relative' }}>
                    <div style={{ position: 'relative', width: 80, height: 80, borderRadius: '50%', border: '4px solid var(--bg-base)', overflow: 'hidden', marginTop: -40, cursor: 'pointer', background: 'var(--chip-bg)', boxShadow: '0 8px 24px -8px rgba(0,0,0,0.5)' }}
                        onClick={() => document.getElementById('velo-avatar-upload')?.click()}>
                        <img src={avatarPreview || formData.avatar || user?.avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Edit size={14} style={{ color: '#fff' }} />
                        </div>
                        <input id="velo-avatar-upload" type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleFileChange(e, 'avatar')} />
                    </div>
                </div>

                {/* Form fields */}
                <div style={{ padding: '16px 24px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 18, color: 'var(--fg)', letterSpacing: '-0.02em' }}>Edit Profile</div>

                    {/* Wallet address display */}
                    {user?.walletAddress && (
                        <div style={{ padding: '10px 14px', background: 'var(--chip-bg)', borderRadius: 10, border: '1px solid var(--hairline)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ ...S.label, fontSize: 9 }}>Wallet</span>
                            <span style={{ ...S.mono, fontSize: 11, color: 'var(--fg-muted)' }}>
                                {user.walletAddress.slice(0, 8)}…{user.walletAddress.slice(-6)}
                            </span>
                        </div>
                    )}

                    {/* Username */}
                    <div>
                        <label style={S.label}>Username</label>
                        <input
                            value={formData.username}
                            onChange={(e: any) => setFormData({ ...formData, username: e.target.value })}
                            style={{ width: '100%', marginTop: 6, padding: '10px 14px', borderRadius: 10, background: 'var(--chip-bg)', border: '1px solid var(--hairline-strong)', fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg)', outline: 'none', boxSizing: 'border-box' }}
                        />
                    </div>

                    {/* Bio */}
                    <div>
                        <label style={S.label}>Bio</label>
                        <textarea
                            value={formData.bio}
                            onChange={(e: any) => setFormData({ ...formData, bio: e.target.value })}
                            rows={3}
                            placeholder="Tell people about yourself…"
                            style={{ width: '100%', marginTop: 6, padding: '10px 14px', borderRadius: 10, background: 'var(--chip-bg)', border: '1px solid var(--hairline-strong)', fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg)', outline: 'none', resize: 'none', boxSizing: 'border-box' }}
                        />
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                        <button onClick={onClose} style={{ flex: 1, padding: '11px', borderRadius: 10, background: 'var(--chip-bg)', border: '1px solid var(--hairline-strong)', ...S.mono, fontSize: 12, fontWeight: 700, color: 'var(--fg-muted)', cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Cancel</button>
                        <button onClick={handleSave} disabled={uploading} style={{ flex: 1, padding: '11px', borderRadius: 10, background: 'var(--iris-violet)', border: 'none', ...S.mono, fontSize: 12, fontWeight: 700, color: '#fff', cursor: uploading ? 'wait' : 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase' as const, opacity: uploading ? 0.7 : 1 }}>
                            {uploading ? 'Saving…' : 'Save Changes'}
                        </button>
                    </div>
                </div>
                {/* Danger Zone */}
                <div style={{ borderTop: '1px solid var(--hairline)', padding: '16px 24px 24px', marginTop: 0 }}>
                    {!showDeleteConfirm ? (
                        <button
                            onClick={() => setShowDeleteConfirm(true)}
                            style={{ width: '100%', padding: '9px 0', borderRadius: 10, background: 'oklch(0.66 0.22 25/0.08)', border: '1px solid oklch(0.66 0.22 25/0.25)', color: 'var(--pnl-down)', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', transition: 'background 0.15s' }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'oklch(0.66 0.22 25/0.15)'}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'oklch(0.66 0.22 25/0.08)'}
                        >Delete Account</button>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--pnl-down)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', textAlign: 'center' }}>This will permanently delete your account and all data</p>
                            <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-muted)', textAlign: 'center' }}>Type <strong style={{ color: 'var(--fg)' }}>DELETE</strong> to confirm</p>
                            <input
                                value={deleteInput}
                                onChange={e => setDeleteInput(e.target.value)}
                                placeholder="DELETE"
                                style={{ padding: '9px 12px', borderRadius: 8, background: 'var(--chip-bg)', border: '1px solid var(--hairline-strong)', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--fg)', outline: 'none', textAlign: 'center', letterSpacing: '0.1em' }}
                                autoFocus
                            />
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={() => { setShowDeleteConfirm(false); setDeleteInput(''); }} style={{ flex: 1, padding: '9px 0', borderRadius: 8, background: 'var(--chip-bg)', border: '1px solid var(--hairline)', color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                                <button
                                    onClick={() => { if (deleteInput === 'DELETE') { onClose(); onDeleteAccount(); } }}
                                    disabled={deleteInput !== 'DELETE'}
                                    style={{ flex: 1, padding: '9px 0', borderRadius: 8, background: deleteInput === 'DELETE' ? 'var(--pnl-down)' : 'oklch(0.66 0.22 25/0.15)', border: 'none', color: deleteInput === 'DELETE' ? '#fff' : 'var(--fg-subtle)', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, cursor: deleteInput === 'DELETE' ? 'pointer' : 'default', transition: 'all 0.15s', letterSpacing: '0.06em', textTransform: 'uppercase' }}
                                >Confirm Delete</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
// ── Delete Post Confirmation Modal ───────────────────────────────────────────
export const DeletePostConfirmModal = ({ isOpen, onClose, onConfirm, itemType = 'post' }: { isOpen: boolean; onClose: () => void; onConfirm: () => void; itemType?: 'post' | 'comment' }) => {
    if (!isOpen) return null;
    const label = itemType === 'comment' ? 'comment' : 'post';
    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in" onClick={onClose}>
            <div onClick={(e: any) => e.stopPropagation()} className="animate-bounce-in" style={{
                width: '100%', maxWidth: 360, background: 'var(--glass-bg-strong)',
                border: '1px solid oklch(0.66 0.22 25 / 0.35)', borderRadius: 20,
                overflow: 'hidden', boxShadow: 'var(--glass-shadow)', backdropFilter: 'blur(32px)',
            }}>
                <div style={{ height: 3, background: 'oklch(0.66 0.22 25)', opacity: 0.7 }} />
                <div style={{ padding: '24px 24px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'oklch(0.66 0.22 25 / 0.12)', border: '1px solid oklch(0.66 0.22 25 / 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Trash2 size={18} style={{ color: 'var(--pnl-down)' }} />
                        </div>
                        <div>
                            <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 18, color: 'var(--fg)', letterSpacing: '-0.02em', lineHeight: 1.2 }}>Delete {label}?</div>
                            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--fg-muted)', marginTop: 4 }}>This action cannot be undone.</div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                        <button onClick={onClose} style={{ flex: 1, padding: '11px', borderRadius: 10, background: 'var(--chip-bg)', border: '1px solid var(--hairline-strong)', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--fg-muted)', cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Cancel</button>
                        <button onClick={() => { onConfirm(); onClose(); }} style={{ flex: 1, padding: '11px', borderRadius: 10, background: 'var(--pnl-down)', border: 'none', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Delete</button>
                    </div>
                </div>
            </div>
        </div>
    );
};


export const UsersListModal = ({ isOpen, onClose, title, userIds, traders, onViewProfile }: any) => {
    const [fetchedUsers, setFetchedUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!isOpen || !userIds || userIds.length === 0) {
            setFetchedUsers([]);
            return;
        }
        // First try to resolve from in-memory traders list
        const fromTraders = traders.filter((t: any) => userIds.includes(t.id));
        if (fromTraders.length === userIds.length) {
            setFetchedUsers(fromTraders);
            return;
        }
        // Otherwise fetch from Supabase for any missing IDs
        setLoading(true);
        (async () => {
            try {
                const { data } = await supabase.from('profiles').select('id, username, handle, avatar_url').in('id', userIds);
                if (data && data.length > 0) {
                    setFetchedUsers(data.map((p: any) => ({
                        id: p.id,
                        username: p.username || 'Trader',
                        handle: p.handle || `@${p.username}`,
                        avatar: p.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.username}`,
                    })));
                } else {
                    setFetchedUsers(fromTraders);
                }
            } catch (_) {
                setFetchedUsers(fromTraders);
            } finally {
                setLoading(false);
            }
        })();
    }, [isOpen, userIds, traders]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in" onClick={onClose}>
            <GlassCard className="w-full max-w-md max-h-[60vh] flex flex-col" onClick={(e: any) => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4 border-b border-gray-200 dark:border-white/5 pb-2">
                    <h3 className="font-bold text-gray-900 dark:text-white">{title}</h3>
                    <button onClick={onClose}><X size={20}/></button>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2">
                    {loading ? (
                        <p className="text-gray-500 text-center py-4">Loading...</p>
                    ) : fetchedUsers.length === 0 ? (
                        <p className="text-gray-500 text-center py-4">No users found.</p>
                    ) : fetchedUsers.map((u: any) => (
                        <div key={u.id} className="flex items-center justify-between p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg cursor-pointer" onClick={() => { onViewProfile(u); onClose(); }}>
                            <div className="flex items-center gap-3">
                                <img src={u.avatar || u.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.username}`} className="w-8 h-8 rounded-full"/>
                                <div>
                                    <span className="font-bold text-gray-900 dark:text-white text-sm block">{u.username}</span>
                                    <span className="text-gray-500 text-xs">{u.handle}</span>
                                </div>
                            </div>
                            <ArrowRightLeft size={14} className="text-gray-400"/>
                        </div>
                    ))}
                </div>
            </GlassCard>
        </div>
    );
};
// ── Profile Avatar Popup (navbar click) ──────────────────────────────────────

export const LoginModal = ({ isOpen, onClose, onLogin }: any) => {
    const [username, setUsername] = useState('');
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in" onClick={onClose}>
            <GlassCard className="w-full max-w-sm" onClick={(e: any) => e.stopPropagation()}>
                <h3 className="text-2xl font-black text-gray-900 dark:text-white mb-2">Welcome to VELO</h3>
                <p className="text-sm text-gray-500 mb-6">Enter a username to start trading.</p>
                <input 
                    autoFocus
                    className="w-full bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 mb-4 outline-none text-gray-900 dark:text-white font-bold"
                    placeholder="Username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && onLogin(username)}
                />
                <Button onClick={() => onLogin(username)} disabled={!username.trim()} className="w-full">Start Trading</Button>
            </GlassCard>
        </div>
    );
};

export const EditPositionModal = ({ isOpen, position, onClose, onSave }: any) => {
    const [tp, setTp] = useState('');
    const [sl, setSl] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [projections, setProjections] = useState<{ tpPnl: number, slPnl: number } | null>(null);
    
    useEffect(() => {
        if(position) {
            setTp(position.takeProfit || '');
            setSl(position.stopLoss || '');
            setError(null);
            setProjections(null);
        }
    }, [position]);

    // Validation & Projection Effect
    useEffect(() => {
        if (!position) return;
        
        let err = null;
        let proj = null;
        const tpVal = parseFloat(tp);
        const slVal = parseFloat(sl);

        if (position.side === 'LONG') {
            if (tp && tpVal <= position.entryPrice) err = "Take Profit must be above Entry Price for Longs";
            if (sl && slVal >= position.entryPrice) err = "Stop Loss must be below Entry Price for Longs";
        } else {
            if (tp && tpVal >= position.entryPrice) err = "Take Profit must be below Entry Price for Shorts";
            if (sl && slVal <= position.entryPrice) err = "Stop Loss must be above Entry Price for Shorts";
        }

        if (!err) {
            const tpPnl = tp ? (Math.abs(tpVal - position.entryPrice) / position.entryPrice) * position.size : 0;
            const slPnl = sl ? (Math.abs(slVal - position.entryPrice) / position.entryPrice) * position.size * -1 : 0;
            proj = { tpPnl, slPnl };
        }

        setError(err);
        setProjections(proj);

    }, [tp, sl, position]);

    if (!isOpen || !position) return null;

    const handleSave = () => {
        if (error) {
            playSound('ERROR');
            return;
        }
        onSave(position.id, tp, sl);
        onClose();
    };

    const inputStyle = (hasError: boolean): React.CSSProperties => ({
        width: '100%', padding: '11px 14px', borderRadius: 10,
        background: 'var(--chip-bg)', border: `1px solid ${hasError ? 'var(--pnl-down)' : 'var(--hairline-strong)'}`,
        fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--fg)', outline: 'none',
        transition: 'border-color 0.15s', boxSizing: 'border-box' as const,
    });

    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(7,7,10,0.8)', backdropFilter: 'blur(16px)' }} className="animate-fade-in">
            <div onClick={(e: any) => e.stopPropagation()} className="animate-bounce-in" style={{
                width: '100%', maxWidth: 360, position: 'relative', overflow: 'hidden',
                background: 'var(--glass-bg-strong)', border: '1px solid var(--hairline-strong)',
                borderRadius: 'var(--r-lg)', padding: 24, boxShadow: 'var(--glass-shadow)', backdropFilter: 'blur(32px)',
            }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--holo-linear)', backgroundSize: '220% 100%', animation: 'holoSlide 9s linear infinite' }} />
                <div style={{ marginBottom: 20 }}>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 20, fontWeight: 400, color: 'var(--fg)', letterSpacing: '-0.02em', marginBottom: 4 }}>
                        Edit Position: {position.pair}
                    </h3>
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-subtle)' }}>
                        Entry: ${formatPrice(position.entryPrice)} · Size: ${formatMoney(position.size)}
                    </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 16 }}>
                    <div>
                        <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)', display: 'block', marginBottom: 6 }}>Take Profit</label>
                        <input type="number" placeholder="Price" value={tp} onChange={(e: any) => setTp(e.target.value)}
                            style={inputStyle(position.side === 'LONG' && !!tp && parseFloat(tp) <= position.entryPrice || position.side === 'SHORT' && !!tp && parseFloat(tp) >= position.entryPrice)}
                            onFocus={e => (e.target.style.borderColor = 'var(--pnl-up)')}
                            onBlur={e => (e.target.style.borderColor = 'var(--hairline-strong)')} />
                        {projections?.tpPnl ? (
                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--pnl-up)', textAlign: 'right' as const, marginTop: 4 }}>
                                Est. Profit: +${formatMoney(projections.tpPnl)}
                            </p>
                        ) : null}
                    </div>

                    <div>
                        <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)', display: 'block', marginBottom: 6 }}>Stop Loss</label>
                        <input type="number" placeholder="Price" value={sl} onChange={(e: any) => setSl(e.target.value)}
                            style={inputStyle(position.side === 'LONG' && !!sl && parseFloat(sl) >= position.entryPrice || position.side === 'SHORT' && !!sl && parseFloat(sl) <= position.entryPrice)}
                            onFocus={e => (e.target.style.borderColor = 'var(--pnl-down)')}
                            onBlur={e => (e.target.style.borderColor = 'var(--hairline-strong)')} />
                        {projections?.slPnl ? (
                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--pnl-down)', textAlign: 'right' as const, marginTop: 4 }}>
                                Est. Loss: -${formatMoney(Math.abs(projections.slPnl))}
                            </p>
                        ) : null}
                    </div>
                </div>

                {error && (
                    <div style={{ padding: '10px 14px', background: 'oklch(0.66 0.22 25 / 0.10)', border: '1px solid oklch(0.66 0.22 25 / 0.25)', borderRadius: 10, marginBottom: 16 }}>
                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--pnl-down)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <AlertCircle size={13}/> {error}
                        </p>
                    </div>
                )}

                <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={onClose} style={{ flex: 1, padding: '11px', borderRadius: 10, background: 'var(--chip-bg)', border: '1px solid var(--hairline-strong)', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--fg-muted)', cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--chip-bg-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'var(--chip-bg)')}>Cancel</button>
                    <button onClick={handleSave} disabled={!!error} style={{ flex: 1, padding: '11px', borderRadius: 10, background: !!error ? 'var(--chip-bg)' : 'var(--fg)', border: 'none', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: !!error ? 'var(--fg-subtle)' : 'var(--bg-base)', cursor: !!error ? 'not-allowed' : 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase' as const, transition: 'opacity 0.15s', opacity: !!error ? 0.5 : 1 }}>Save Orders</button>
                </div>
            </div>
        </div>
    );
};


export const ResetPasswordModal = ({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setError('');
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true);
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateErr) { setError(updateErr.message); return; }
    onSuccess();
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="glass-panel w-full max-w-sm rounded-3xl p-6 animate-bounce-in">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-black text-gray-900 dark:text-white">Set new password</h2>
            <p className="text-xs text-gray-500 mt-0.5">Choose a strong password for your account</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-white">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" className="shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <p className="text-xs text-red-500 font-medium">{error}</p>
          </div>
        )}

        <div className="space-y-3 mb-5">
          <div className="relative">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <input
              type={showPw ? 'text' : 'password'}
              placeholder="New password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full pl-10 pr-10 py-3 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white text-sm font-medium outline-none focus:border-blue-500 transition-colors"
            />
            <button onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showPw
                ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
            </button>
          </div>
          <div className="relative">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <input
              type={showPw ? 'text' : 'password'}
              placeholder="Confirm new password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              className="w-full pl-10 pr-4 py-3 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white text-sm font-medium outline-none focus:border-blue-500 transition-colors"
            />
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={loading}
          className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-sm transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Update Password'}
        </button>
      </div>
    </div>
  );
};
