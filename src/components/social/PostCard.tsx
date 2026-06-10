/**
 * PostCard — the feed post unit (content with @/$ linkification, link preview,
 * like/repost/share/comment actions, threaded comments) plus the shared
 * social content helpers. Extracted from App.tsx (stage 8 — the social
 * cluster's core). renderContentWithMentions is exported because
 * SinglePostView (still in App) renders post bodies with it.
 */
import React, { useState, useEffect, useRef } from 'react';
import { ArrowUpRight, Heart, MessageCircle, Repeat, Share2, Trash2 } from 'lucide-react';
import { CommentThread } from '@/components/CommentThread';
import { VerifiedBadge } from '@/components/ui/shared';
import { Post, SOCIAL_FEATURED_PAIRS, VALID_TICKER_SYMBOLS } from '@/utils/types';

// ── Comment-like dispatch bus ────────────────────────────────────────────────
// PostCard renders deep inside several views; App wires the actual handler at
// render time via setCommentLikeHandler so no prop has to thread through every
// intermediate component. ESM live bindings keep reads current.
export let COMMENT_LIKE_HANDLER: ((postId: string, commentId: string) => void) | null = null;
export const setCommentLikeHandler = (fn: (postId: string, commentId: string) => void) => { COMMENT_LIKE_HANDLER = fn; };

export const LinkPreviewCard = ({ url }: { url: string }) => {
    const [meta, setMeta] = useState<{ title?: string; description?: string; image?: string; siteName?: string } | null>(null);
    const [loading, setLoading] = useState(true);
    const [errored, setErrored] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoading(true); setErrored(false); setMeta(null);
        // Same-origin serverless endpoint (no CORS, edge-cached) returns parsed OG meta.
        const endpoint = `/api/og?url=${encodeURIComponent(url)}`;
        fetch(endpoint)
            .then(r => r.json())
            .then(meta => {
                if (cancelled) return;
                if (meta && (meta.title || meta.description || meta.image)) setMeta(meta);
                else setErrored(true);
            })
            .catch(() => { if (!cancelled) setErrored(true); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [url]);

    if (errored || (!loading && !meta)) return null;

    const domain = (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } })();

    return (
        <a href={url} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{ display: 'block', marginTop: 10, borderRadius: 12, border: '1px solid var(--hairline)', overflow: 'hidden', textDecoration: 'none', background: 'var(--chip-bg)', transition: 'border-color 0.15s', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--hairline-strong)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--hairline)'}
        >
            {loading ? (
                <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--hairline)', borderTopColor: 'var(--iris-violet)', animation: 'spin 0.7s linear infinite' }}/>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-subtle)' }}>{domain}</span>
                </div>
            ) : meta ? (
                <div style={{ display: 'flex', gap: 0 }}>
                    {meta.image && (
                        <div style={{ width: 100, flexShrink: 0, background: 'var(--glass-bg-strong)', overflow: 'hidden' }}>
                            <img src={meta.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={e => { (e.currentTarget as HTMLElement).style.display = 'none'; }}/>
                        </div>
                    )}
                    <div style={{ padding: '10px 12px', flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{meta.siteName || domain}</span>
                        {meta.title && <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600, color: 'var(--fg)', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>{meta.title}</span>}
                        {meta.description && <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>{meta.description}</span>}
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--iris-violet)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url.length > 60 ? url.slice(0, 57) + '…' : url}</span>
                    </div>
                </div>
            ) : null}
        </a>
    );
};

// Extract first URL from post content for preview
export const extractFirstUrl = (content: string): string | null => {
    const m = content.match(/https?:\/\/[^\s<>"']+/);
    return m ? m[0] : null;
};

export const renderContentWithMentions = (content: string, onViewProfile: (p: any) => void, traders: any[], onTickerClick?: (ticker: string) => void, validTickers?: string[]) => {
    const parts = content.split(/(@[A-Za-z0-9_]+|\$[A-Z]{2,8}|https?:\/\/[^\s<>"']+)/g);
    return parts.map((part: string, i: number) => {
        if (part.match(/^@[A-Za-z0-9_]+$/)) {
            const handle = part.toLowerCase();
            const trader = traders.find((t: any) =>
                t.handle?.toLowerCase() === handle || ('@' + (t.username?.toLowerCase() || '')) === handle
            );
            return (
                <span key={i}
                    onClick={e => { e.stopPropagation(); if (trader) onViewProfile({ id: trader.id }); }}
                    style={{ color: 'var(--iris-violet)', cursor: trader ? 'pointer' : 'default', fontWeight: 600 }}>
                    {part}
                </span>
            );
        }
        if (part.match(/^\$[A-Z]{2,8}$/)) {
            const symbol = part.slice(1);
            // Only make it a special clickable ticker if it's a known available pair
            const isKnown = validTickers ? validTickers.includes(symbol) : true;
            if (isKnown) {
                return (
                    <span key={i}
                        onClick={e => { e.stopPropagation(); if (onTickerClick) onTickerClick(symbol); }}
                        style={{ color: 'var(--pnl-up)', cursor: 'pointer', fontWeight: 700, background: 'rgba(var(--pnl-up-rgb, 52,211,153), 0.1)', borderRadius: 4, padding: '0 3px' }}>
                        {part}
                    </span>
                );
            }
            // Unknown ticker — render as plain text
            return <span key={i} style={{ fontWeight: 600, color: 'var(--fg-muted)' }}>{part}</span>;
        }
        if (part.match(/^https?:\/\//)) {
            const displayUrl = part.length > 50 ? part.slice(0, 47) + '…' : part;
            return (
                <a key={i} href={part} target="_blank" rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    style={{ color: 'var(--iris-violet)', textDecoration: 'underline', textDecorationColor: 'oklch(0.68 0.22 295 / 0.4)', wordBreak: 'break-all' }}>
                    {displayUrl}
                </a>
            );
        }
        return <span key={i}>{part}</span>;
    });
};

export const PostCard = ({ post, user, onLike, onRepost, onComment, handleCopyTrade, onViewProfile, showUsersModal, onDelete, onDeleteComment, traders = [], onTickerClick, defaultOpenComments, onSinglePost }: any) => {
    const hasLiked = post.likedBy.includes(user?.id);
    const hasReposted = post.repostedBy.includes(user?.id);
    // Author can delete their own post from any wall; wall owner can also delete posts on their wall
    const canDelete = user && onDelete && (user.id === post.authorId || user.id === post.targetProfileId);
    const [showComments, setShowComments] = useState(defaultOpenComments || false);
    const [commentText, setCommentText] = useState('');
    const [isSubmittingComment, setIsSubmittingComment] = useState(false);
    const [shareToast, setShareToast] = useState(false);
    const [commentMentionQuery, setCommentMentionQuery] = useState<string | null>(null);
    const [commentMentionTrigger, setCommentMentionTrigger] = useState<'@' | '$' | null>(null);
    const [commentMentionStart, setCommentMentionStart] = useState(0);
    const [commentMentionIdx, setCommentMentionIdx] = useState(0);
    const commentInputRef = useRef<HTMLInputElement>(null);

    const commentMentionResults: any[] = React.useMemo ? (() => {
        if (commentMentionQuery === null) return [];
        const q = commentMentionQuery.toLowerCase();
        if (commentMentionTrigger === '$') {
            if (!q) return []; // don't show anything until at least 1 char typed
            return SOCIAL_FEATURED_PAIRS.filter(p =>
                p.symbol.toLowerCase().startsWith(q) || p.name.toLowerCase().startsWith(q)
            ).slice(0, 4).map(p => ({ ...p, _type: 'ticker' }));
        }
        if (commentMentionTrigger === '@' && q.length > 0) {
            return traders.filter((t: any) => {
                if (t.id === user?.id) return false;
                return (t.handle || '').toLowerCase().includes(q) || (t.username || '').toLowerCase().includes(q);
            }).slice(0, 5);
        }
        return [];
    })() : [];

    const handleCommentTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        const cursor = e.target.selectionStart ?? val.length;
        setCommentText(val);
        const atMatch = val.slice(0, cursor).match(/@([A-Za-z0-9_]*)$/);
        const dollarMatch = val.slice(0, cursor).match(/\$([A-Za-z0-9]*)$/);
        if (atMatch) {
            setCommentMentionTrigger('@'); setCommentMentionQuery(atMatch[1]);
            setCommentMentionStart(cursor - atMatch[0].length); setCommentMentionIdx(0);
        } else if (dollarMatch) {
            setCommentMentionTrigger('$'); setCommentMentionQuery(dollarMatch[1]);
            setCommentMentionStart(cursor - dollarMatch[0].length); setCommentMentionIdx(0);
        } else {
            setCommentMentionQuery(null); setCommentMentionTrigger(null);
        }
    };

    const completeCommentMention = (item: any) => {
        const insertion = item._type === 'ticker' ? `$${item.symbol}` : (item.handle || ('@' + item.username));
        const cursor = commentInputRef.current?.selectionStart ?? commentMentionStart + (commentMentionQuery?.length ?? 0) + 1;
        const before = commentText.slice(0, commentMentionStart);
        const after = commentText.slice(cursor);
        setCommentText(before + insertion + ' ' + after);
        setCommentMentionQuery(null); setCommentMentionTrigger(null);
        setTimeout(() => {
            if (commentInputRef.current) {
                const pos = before.length + insertion.length + 1;
                commentInputRef.current.focus();
                commentInputRef.current.setSelectionRange(pos, pos);
            }
        }, 0);
    };

    // If defaultOpenComments flips (notification routing), open comments
    useEffect(() => { if (defaultOpenComments) setShowComments(true); }, [defaultOpenComments]);
    const S = {
        mono: { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1' },
        display: { fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' },
        label: { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)' as const },
    };

    // Context label: "posted on @x's wall" — clickable to navigate to that wall
    const contextTarget = post.targetProfileId && post.targetProfileId !== post.authorId
        ? traders.find((t: any) => t.id === post.targetProfileId)
        : null;
    const contextLabel = contextTarget
        ? { text: `posted on ${contextTarget.handle || ('@' + contextTarget.username)}'s wall`, type: 'wall', trader: contextTarget }
        : null;

    const handleShare = async () => {
        const postUrl = `${window.location.origin}/social/post/${post.id}`;
        const shareTitle = `Post by ${post.authorHandle} on Velo`;
        const shareText = post.content.slice(0, 200) + (post.content.length > 200 ? '…' : '');

        // Dynamically update OG meta tags so the link previews correctly when shared
        const setMeta = (prop: string, content: string) => {
            let el = document.querySelector(`meta[property="${prop}"]`) as HTMLMetaElement | null;
            if (!el) { el = document.createElement('meta'); el.setAttribute('property', prop); document.head.appendChild(el); }
            el.setAttribute('content', content);
        };
        setMeta('og:url', postUrl);
        setMeta('og:title', shareTitle);
        setMeta('og:description', shareText);
        if (post.authorAvatar) setMeta('og:image', post.authorAvatar);
        setMeta('og:type', 'article');

        if (navigator.share) {
            try { await navigator.share({ title: shareTitle, text: shareText, url: postUrl }); return; } catch (_) {}
        }
        // Fallback: copy post URL to clipboard
        try {
            await navigator.clipboard.writeText(postUrl);
            setShareToast(true);
            setTimeout(() => setShareToast(false), 2000);
        } catch (_) {}
    };

    const handleSubmitComment = async () => {
        if (!commentText.trim() || isSubmittingComment) return;
        setIsSubmittingComment(true);
        await onComment(post.id, commentText.trim());
        setCommentText('');
        setIsSubmittingComment(false);
    };

    return (
        <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--hairline)', borderRadius: 14, backdropFilter: 'blur(8px) saturate(1.1)', WebkitBackdropFilter: 'blur(8px) saturate(1.1)', overflow: 'hidden', transition: 'border-color 0.15s', position: 'relative' as const }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--hairline-strong)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--hairline)'}>
            {/* Share toast */}
            {shareToast && (
                <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, background: 'var(--fg)', color: 'var(--bg-base)', padding: '5px 12px', borderRadius: 20, fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, pointerEvents: 'none', animation: 'fadeIn 0.15s ease' }}>
                    Copied!
                </div>
            )}
            {/* Context label: "posted on @x's wall" or reposts */}
            {contextLabel ? (
                <button
                    onClick={() => contextLabel.trader && onViewProfile({ id: contextLabel.trader.id })}
                    style={{ padding: '7px 16px', ...S.label, fontSize: 10, background: 'var(--chip-bg)', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid var(--hairline)', color: 'var(--iris-violet)', border: 'none', borderRadius: 0, width: '100%', textAlign: 'left' as const, cursor: contextLabel.trader ? 'pointer' : 'default', transition: 'background 0.1s' }}
                    onMouseEnter={e => { if (contextLabel.trader) (e.currentTarget as HTMLElement).style.background = 'oklch(0.68 0.22 295 / 0.08)'; }}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--chip-bg)'}
                >
                    <ArrowUpRight size={10}/>
                    {contextLabel.text}
                </button>
            ) : post.repostedBy.length > 0 ? (
                <div style={{ padding: '7px 16px', ...S.label, fontSize: 10, background: 'var(--chip-bg)', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid var(--hairline)' }}>
                    <Repeat size={10}/> {post.repostedBy.length} reposts
                </div>
            ) : null}
            <div style={{ padding: 16, display: 'flex', gap: 12 }}>
                <div style={{ flexShrink: 0, cursor: 'pointer' }} onClick={() => onViewProfile({ id: post.authorId })}>
                    <img src={post.authorAvatar} style={{ width: 38, height: 38, borderRadius: '50%', border: '1px solid var(--hairline)' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ ...S.display, fontSize: 14, color: 'var(--fg)', cursor: 'pointer' }} onClick={() => onViewProfile({ id: post.authorId })}>{post.authorHandle}</span>
                            <VerifiedBadge userId={post.authorId} traders={traders} size={13}/>
                            <span style={{ ...S.label, fontSize: 10, cursor: onSinglePost ? 'pointer' : 'default', textDecoration: onSinglePost ? 'underline' : 'none' }} onClick={() => onSinglePost && onSinglePost(post.id)} title={onSinglePost ? 'View post' : undefined}>{(() => { const d = new Date(post.timestamp); const now = new Date(); const isToday = d.toDateString() === now.toDateString(); return isToday ? d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : d.toLocaleDateString([],{month:'short',day:'numeric'}) + ' · ' + d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}); })()}</span>
                        </div>
                        {canDelete && (
                            <button onClick={() => onDelete(post.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-subtle)', padding: 2, transition: 'color 0.1s' }}
                                title="Delete post"
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--pnl-down)'}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--fg-subtle)'}
                            ><Trash2 size={14}/></button>
                        )}
                    </div>
                    <p style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-muted)', lineHeight: 1.6, whiteSpace: 'pre-wrap' as const, marginBottom: post.isTradeSignal ? 12 : 0, cursor: onSinglePost ? 'pointer' : 'default' }}
                        onClick={() => onSinglePost && onSinglePost(post.id)}>
                        {renderContentWithMentions(post.content, onViewProfile, traders, onTickerClick, VALID_TICKER_SYMBOLS)}
                    </p>
                    {(() => { const u = extractFirstUrl(post.content); return u ? <LinkPreviewCard url={u} /> : null; })()}
                    {post.isTradeSignal && post.tradeDetails && (
                        <div style={{ background: 'oklch(0.68 0.22 295 / 0.06)', border: '1px solid oklch(0.68 0.22 295 / 0.2)', borderRadius: 12, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ ...S.mono, fontSize: 15, fontWeight: 700, color: 'var(--fg)' }}>{post.tradeDetails.pair}</span>
                                    <span style={{ padding: '2px 8px', borderRadius: 6, background: post.tradeDetails.side === 'LONG' ? 'oklch(0.78 0.18 150/0.15)' : 'oklch(0.66 0.22 25/0.15)', border: `1px solid ${post.tradeDetails.side === 'LONG' ? 'oklch(0.78 0.18 150/0.3)' : 'oklch(0.66 0.22 25/0.3)'}`, ...S.label, fontSize: 10, color: post.tradeDetails.side === 'LONG' ? 'var(--pnl-up)' : 'var(--pnl-down)' }}>{post.tradeDetails.side}</span>
                                    <span style={{ ...S.label }}>· {post.tradeDetails.leverage}× · Entry {post.tradeDetails.entry}</span>
                                </div>
                            </div>
                        </div>
                    )}
                    {/* Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                        {[
                            { icon: <MessageCircle size={15}/>, count: post.comments.length, onClick: () => setShowComments(s => !s), active: showComments, hoverColor: 'var(--iris-violet)' },
                            { icon: <Repeat size={15}/>, count: post.reposts, onClick: () => onRepost(post.id), active: hasReposted, hoverColor: 'var(--pnl-up)' },
                            { icon: <Heart size={15} fill={hasLiked ? 'currentColor' : 'none'}/>, count: post.likes, onClick: () => onLike(post.id), active: hasLiked, hoverColor: 'var(--iris-magenta)' },
                            { icon: <Share2 size={15}/>, count: null, onClick: handleShare, active: false, hoverColor: 'var(--iris-cyan)' },
                        ].map((action, i) => (
                            <button key={i} onClick={action.onClick}
                                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 8px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', ...S.mono, fontSize: 11, color: action.active ? action.hoverColor : 'var(--fg-subtle)', transition: 'all 0.1s' }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = action.hoverColor; (e.currentTarget as HTMLElement).style.background = 'var(--chip-bg)'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = action.active ? action.hoverColor : 'var(--fg-subtle)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                                {action.icon} {action.count !== null && action.count}
                            </button>
                        ))}
                    </div>
                    {/* Comments section */}
                    {showComments && (
                        <CommentThread
                            post={post}
                            user={user}
                            traders={traders}
                            onComment={onComment}
                            onDeleteComment={(pid: string, cid: string) => onDeleteComment?.(pid, cid)}
                            onLikeComment={(cid: string) => COMMENT_LIKE_HANDLER?.(post.id, cid)}
                            onViewProfile={onViewProfile}
                            onTickerClick={onTickerClick}
                            compact
                        />
                    )}
                </div>
            </div>
        </div>
    );
};
