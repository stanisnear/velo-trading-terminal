/**
 * CommentThread.tsx
 * Full Twitter-style threaded comments: likes, replies, @/$-tagging, OG/link previews.
 * Imported by App.tsx — drop-in replacement for the inline comment sections in
 * PostCard and SinglePostView.
 */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Heart, Trash2, MessageCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Comment } from '../utils/types';
import { PAIRS } from '../utils/types';

// ── helpers ───────────────────────────────────────────────────────────────────

const SOCIAL_FEATURED_PAIRS = PAIRS.map(p => ({
    symbol: p.id.split('/')[0],
    name: (p as any).label ?? p.id,
    pairId: p.id,
    logo: (p as any).logo ?? '',
}));
const VALID_TICKER_SYMBOLS = SOCIAL_FEATURED_PAIRS.map(p => p.symbol);

export function extractFirstUrl(text: string): string | null {
    const m = text.match(/https?:\/\/[^\s<>"']+/);
    return m ? m[0] : null;
}

export function renderContent(
    content: string,
    onViewProfile: (p: any) => void,
    traders: any[],
    onTickerClick?: (t: string) => void,
) {
    const parts = content.split(/(@[A-Za-z0-9_]+|\$[A-Z]{2,8}|https?:\/\/[^\s<>"']+)/g);
    return parts.map((part: string, i: number) => {
        if (/^@[A-Za-z0-9_]+$/.test(part)) {
            const h = part.toLowerCase();
            const trader = traders.find((t: any) =>
                t.handle?.toLowerCase() === h || ('@' + (t.username?.toLowerCase() || '')) === h
            );
            return (
                <span key={i}
                    onClick={e => { e.stopPropagation(); if (trader) onViewProfile({ id: trader.id }); }}
                    style={{ color: 'var(--iris-violet)', cursor: trader ? 'pointer' : 'default', fontWeight: 600 }}>
                    {part}
                </span>
            );
        }
        if (/^\$[A-Z]{2,8}$/.test(part)) {
            const symbol = part.slice(1);
            if (VALID_TICKER_SYMBOLS.includes(symbol)) {
                return (
                    <span key={i}
                        onClick={e => { e.stopPropagation(); onTickerClick?.(symbol); }}
                        style={{ color: 'var(--pnl-up)', cursor: 'pointer', fontWeight: 700, background: 'oklch(0.78 0.18 162 / 0.1)', borderRadius: 4, padding: '0 3px' }}>
                        {part}
                    </span>
                );
            }
            return <span key={i} style={{ fontWeight: 600, color: 'var(--fg-muted)' }}>{part}</span>;
        }
        if (/^https?:\/\//.test(part)) {
            const disp = part.length > 50 ? part.slice(0, 47) + '…' : part;
            return (
                <a key={i} href={part} target="_blank" rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    style={{ color: 'var(--iris-violet)', textDecoration: 'underline', textDecorationColor: 'oklch(0.68 0.22 295 / 0.4)', wordBreak: 'break-all' }}>
                    {disp}
                </a>
            );
        }
        return <span key={i}>{part}</span>;
    });
}

// ── MentionDropdown (self-contained) ─────────────────────────────────────────
function MentionDropdown({ results, anchorRef, activeIndex, onSelect, onHover }: {
    results: any[];
    anchorRef: React.RefObject<HTMLElement>;
    activeIndex: number;
    onSelect: (item: any) => void;
    onHover: (i: number) => void;
}) {
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

    useEffect(() => {
        const update = () => {
            const rect = anchorRef.current?.getBoundingClientRect();
            if (rect) setPos({ top: rect.bottom + 4, left: rect.left });
        };
        update();
        window.addEventListener('scroll', update, true);
        window.addEventListener('resize', update);
        return () => { window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); };
    }, [anchorRef, results.length]);

    if (!pos || results.length === 0) return null;

    return createPortal(
        <div style={{
            position: 'fixed', zIndex: 99999, top: pos.top, left: pos.left,
            minWidth: 240, background: 'var(--bg-base-2, #1a1a2e)',
            border: '1px solid var(--hairline-strong)', borderRadius: 12,
            boxShadow: '0 8px 30px rgba(0,0,0,0.3)', overflow: 'hidden',
        }}>
            {results.map((item: any, i: number) => (
                item._type === 'ticker' ? (
                    <button key={item.symbol}
                        onMouseDown={e => { e.preventDefault(); onSelect(item); }}
                        onMouseEnter={() => onHover(i)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 12px', background: i === activeIndex ? 'var(--chip-bg)' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' as const }}>
                        <img src={item.logo} alt={item.symbol} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid var(--hairline)' }} />
                        <div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--fg)' }}>${item.symbol}</div>
                            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 10, color: 'var(--fg-subtle)' }}>{item.name}</div>
                        </div>
                    </button>
                ) : (
                    <button key={item.id}
                        onMouseDown={e => { e.preventDefault(); onSelect(item); }}
                        onMouseEnter={() => onHover(i)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 12px', background: i === activeIndex ? 'var(--chip-bg)' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' as const }}>
                        <img src={item.avatar} alt={item.username} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid var(--hairline)' }} />
                        <div>
                            <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 13, color: 'var(--fg)' }}>{item.username}</div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-subtle)' }}>{item.handle}</div>
                        </div>
                    </button>
                )
            ))}
        </div>,
        document.body
    );
}

// ── LinkPreviewCard ───────────────────────────────────────────────────────────
function LinkPreviewCard({ url }: { url: string }) {
    const [meta, setMeta] = useState<{ title?: string; description?: string; image?: string; siteName?: string } | null>(null);
    const [loading, setLoading] = useState(true);
    const [errored, setErrored] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoading(true); setErrored(false); setMeta(null);
        fetch(`/api/og?url=${encodeURIComponent(url)}`)
            .then(r => r.json())
            .then(m => { if (!cancelled && m && (m.title || m.description || m.image)) setMeta(m); else if (!cancelled) setErrored(true); })
            .catch(() => { if (!cancelled) setErrored(true); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [url]);

    if (errored || (!loading && !meta)) return null;

    const domain = (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } })();

    return (
        <a href={url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
            style={{ display: 'block', marginTop: 8, borderRadius: 10, border: '1px solid var(--hairline)', overflow: 'hidden', textDecoration: 'none', background: 'var(--chip-bg)', transition: 'border-color 0.15s' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--hairline-strong)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--hairline)'}>
            {loading ? (
                <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid var(--hairline)', borderTopColor: 'var(--iris-violet)', animation: 'spin 0.7s linear infinite' }} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-subtle)' }}>{domain}</span>
                </div>
            ) : meta ? (
                <div style={{ display: 'flex' }}>
                    {meta.image && (
                        <div style={{ width: 80, flexShrink: 0, background: 'var(--glass-bg-strong)', overflow: 'hidden' }}>
                            <img src={meta.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={e => { (e.currentTarget as HTMLElement).style.display = 'none'; }} />
                        </div>
                    )}
                    <div style={{ padding: '9px 11px', flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{meta.siteName || domain}</span>
                        {meta.title && <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600, color: 'var(--fg)', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>{meta.title}</span>}
                        {meta.description && <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--fg-muted)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>{meta.description}</span>}
                    </div>
                </div>
            ) : null}
        </a>
    );
}

// ── CommentInput ──────────────────────────────────────────────────────────────
interface CommentInputProps {
    user: any;
    traders: any[];
    placeholder?: string;
    onSubmit: (text: string) => Promise<void>;
    autoFocus?: boolean;
    compact?: boolean;
}

function CommentInput({ user, traders, placeholder = 'Add a comment…', onSubmit, autoFocus, compact }: CommentInputProps) {
    const [text, setText] = useState('');
    const [loading, setLoading] = useState(false);
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    const [mentionTrigger, setMentionTrigger] = useState<'@' | '$' | null>(null);
    const [mentionStart, setMentionStart] = useState(0);
    const [mentionIdx, setMentionIdx] = useState(0);
    const ref = useRef<HTMLTextAreaElement>(null);

    useEffect(() => { if (autoFocus) setTimeout(() => ref.current?.focus(), 80); }, [autoFocus]);

    const mentionResults = useMemo(() => {
        if (mentionQuery === null) return [];
        const q = mentionQuery.toLowerCase();
        if (mentionTrigger === '$' && q) {
            return SOCIAL_FEATURED_PAIRS.filter(p => p.symbol.toLowerCase().startsWith(q) || p.name.toLowerCase().startsWith(q)).slice(0, 4).map(p => ({ ...p, _type: 'ticker' }));
        }
        if (mentionTrigger === '@' && q.length > 0) {
            return traders.filter((t: any) => t.id !== user?.id && ((t.handle || '').toLowerCase().includes(q) || (t.username || '').toLowerCase().includes(q))).slice(0, 5);
        }
        return [];
    }, [mentionQuery, mentionTrigger, traders, user]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        const cursor = e.target.selectionStart ?? val.length;
        setText(val);
        const atMatch = val.slice(0, cursor).match(/@([A-Za-z0-9_]*)$/);
        const dollarMatch = val.slice(0, cursor).match(/\$([A-Za-z0-9]*)$/);
        if (atMatch) { setMentionTrigger('@'); setMentionQuery(atMatch[1]); setMentionStart(cursor - atMatch[0].length); setMentionIdx(0); }
        else if (dollarMatch) { setMentionTrigger('$'); setMentionQuery(dollarMatch[1]); setMentionStart(cursor - dollarMatch[0].length); setMentionIdx(0); }
        else { setMentionQuery(null); setMentionTrigger(null); }
    };

    const completeMention = (item: any) => {
        const insertion = item._type === 'ticker' ? `$${item.symbol}` : (item.handle || ('@' + item.username));
        const cursor = ref.current?.selectionStart ?? mentionStart + (mentionQuery?.length ?? 0) + 1;
        const before = text.slice(0, mentionStart);
        const after = text.slice(cursor);
        setText(before + insertion + ' ' + after);
        setMentionQuery(null); setMentionTrigger(null);
        setTimeout(() => {
            if (ref.current) { const p = before.length + insertion.length + 1; ref.current.focus(); ref.current.setSelectionRange(p, p); }
        }, 0);
    };

    const submit = async () => {
        if (!text.trim() || loading) return;
        setLoading(true);
        await onSubmit(text.trim());
        setText('');
        setLoading(false);
    };

    return (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <img src={user.avatar} alt="" style={{ width: compact ? 28 : 34, height: compact ? 28 : 34, borderRadius: '50%', border: '1px solid var(--hairline)', flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1, position: 'relative' }}>
                <div style={{ background: 'var(--chip-bg)', border: '1px solid var(--hairline)', borderRadius: 14, padding: '8px 12px', transition: 'border-color 0.15s' }}
                    onFocusCapture={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--hairline-strong)'}
                    onBlurCapture={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--hairline)'}>
                    <textarea
                        ref={ref}
                        value={text}
                        onChange={handleChange}
                        onKeyDown={e => {
                            if (mentionQuery !== null && mentionResults.length > 0) {
                                if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx(i => Math.min(i + 1, mentionResults.length - 1)); return; }
                                if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIdx(i => Math.max(i - 1, 0)); return; }
                                if (e.key === 'Tab') { e.preventDefault(); completeMention(mentionResults[mentionIdx]); return; }
                                if (e.key === 'Escape') { setMentionQuery(null); setMentionTrigger(null); return; }
                            }
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
                        }}
                        onBlur={() => setTimeout(() => { setMentionQuery(null); setMentionTrigger(null); }, 150)}
                        placeholder={placeholder}
                        rows={compact ? 1 : 2}
                        style={{ width: '100%', background: 'none', border: 'none', outline: 'none', fontFamily: 'var(--font-sans)', fontSize: compact ? 13 : 14, color: 'var(--fg)', resize: 'none', lineHeight: 1.5 }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-subtle)', letterSpacing: '0.05em' }}>@mention · $TICKER · ⌘↵</span>
                        <button onClick={submit} disabled={!text.trim() || loading}
                            style={{ padding: compact ? '4px 14px' : '6px 18px', borderRadius: 16, background: text.trim() ? 'var(--iris-violet)' : 'var(--chip-bg)', border: 'none', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: text.trim() ? '#fff' : 'var(--fg-subtle)', cursor: text.trim() && !loading ? 'pointer' : 'default', letterSpacing: '0.05em', transition: 'all 0.15s', boxShadow: text.trim() ? '0 3px 12px oklch(0.68 0.22 295 / 0.3)' : 'none' }}>
                            {loading ? '…' : 'Reply'}
                        </button>
                    </div>
                </div>
                <MentionDropdown results={mentionResults} anchorRef={ref as any} activeIndex={mentionIdx} onSelect={completeMention} onHover={setMentionIdx} />
            </div>
        </div>
    );
}

// ── Single comment row ────────────────────────────────────────────────────────
interface CommentRowProps {
    comment: Comment;
    postId: string;
    postAuthorId: string;
    user: any;
    traders: any[];
    depth: number;               // 0 = top-level, 1 = reply
    onViewProfile: (p: any) => void;
    onTickerClick?: (t: string) => void;
    onReply: (parentId: string, parentHandle: string) => void;
    onLikeComment: (commentId: string) => void;
    onDeleteComment: (postId: string, commentId: string) => void;
    allComments: Comment[];      // flat list for building reply threads
}

function CommentRow({
    comment, postId, postAuthorId, user, traders, depth,
    onViewProfile, onTickerClick, onReply, onLikeComment, onDeleteComment, allComments,
}: CommentRowProps) {
    const [showReplies, setShowReplies] = useState(true);
    const hasLiked = user ? comment.likedBy.includes(user.id) : false;
    // Only comment author can delete their own comment; post author can delete any
    const canDelete = user && (user.id === comment.authorId || user.id === postAuthorId);
    const replies = allComments.filter(c => c.parentId === comment.id);

    const timeStr = (() => {
        const d = new Date(comment.timestamp);
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) return 'just now';
        if (diffMin < 60) return `${diffMin}m`;
        const diffH = Math.floor(diffMin / 60);
        if (diffH < 24) return `${diffH}h`;
        return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    })();

    const S = {
        mono: { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1' } as React.CSSProperties,
        display: { fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' } as React.CSSProperties,
    };

    const previewUrl = extractFirstUrl(comment.content);

    return (
        <div style={{ display: 'flex', gap: 10, position: 'relative' }}>
            {/* Thread line for replies */}
            {depth > 0 && (
                <div style={{ position: 'absolute', left: -20, top: 0, bottom: 0, width: 2, background: 'var(--hairline)', borderRadius: 1 }} />
            )}

            {/* Avatar column with connector line */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <img
                    src={comment.authorAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${comment.authorHandle}`}
                    alt={comment.authorHandle}
                    onClick={() => onViewProfile({ id: comment.authorId })}
                    style={{ width: depth === 0 ? 34 : 26, height: depth === 0 ? 34 : 26, borderRadius: '50%', border: '1px solid var(--hairline)', cursor: 'pointer', flexShrink: 0 }}
                />
                {replies.length > 0 && showReplies && (
                    <div style={{ width: 2, flex: 1, minHeight: 16, background: 'var(--hairline)', borderRadius: 1, marginTop: 4 }} />
                )}
            </div>

            <div style={{ flex: 1, minWidth: 0, paddingBottom: 8 }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' as const }}>
                    <span
                        onClick={() => onViewProfile({ id: comment.authorId })}
                        style={{ ...S.display, fontSize: depth === 0 ? 14 : 13, color: 'var(--fg)', cursor: 'pointer', fontWeight: 600 }}>
                        {comment.authorHandle}
                    </span>
                    <span style={{ ...S.mono, fontSize: 10, color: 'var(--fg-subtle)' }}>{timeStr}</span>
                    {canDelete && (
                        <button
                            onClick={() => onDeleteComment(postId, comment.id)}
                            title="Delete comment"
                            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-subtle)', padding: '2px 4px', borderRadius: 4, opacity: 0.5, transition: 'opacity 0.1s, color 0.1s' }}
                            onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.opacity = '1'; el.style.color = 'var(--pnl-down)'; }}
                            onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.opacity = '0.5'; el.style.color = 'var(--fg-subtle)'; }}>
                            <Trash2 size={11} />
                        </button>
                    )}
                </div>

                {/* Content */}
                <p style={{ fontFamily: 'var(--font-sans)', fontSize: depth === 0 ? 14 : 13, color: 'var(--fg-muted)', lineHeight: 1.55, margin: 0, whiteSpace: 'pre-wrap' as const }}>
                    {renderContent(comment.content, onViewProfile, traders, onTickerClick)}
                </p>

                {/* OG link preview */}
                {previewUrl && <LinkPreviewCard url={previewUrl} />}

                {/* Action row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
                    {/* Like */}
                    <button
                        onClick={() => user && onLikeComment(comment.id)}
                        disabled={!user}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: user ? 'pointer' : 'default', color: hasLiked ? 'var(--iris-magenta)' : 'var(--fg-subtle)', ...S.mono, fontSize: 11, padding: 0, transition: 'color 0.1s' }}
                        onMouseEnter={e => { if (user) (e.currentTarget as HTMLElement).style.color = 'var(--iris-magenta)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = hasLiked ? 'var(--iris-magenta)' : 'var(--fg-subtle)'; }}>
                        <Heart size={12} fill={hasLiked ? 'currentColor' : 'none'} />
                        {comment.likes > 0 && <span>{comment.likes}</span>}
                    </button>

                    {/* Reply — only on top-level comments (depth 0) */}
                    {depth === 0 && user && (
                        <button
                            onClick={() => onReply(comment.id, comment.authorHandle)}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-subtle)', ...S.mono, fontSize: 11, padding: 0, transition: 'color 0.1s' }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--iris-violet)'}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--fg-subtle)'}>
                            <MessageCircle size={12} /> Reply
                        </button>
                    )}

                    {/* Toggle replies */}
                    {depth === 0 && replies.length > 0 && (
                        <button
                            onClick={() => setShowReplies(s => !s)}
                            style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--iris-violet)', ...S.mono, fontSize: 10, fontWeight: 700, padding: 0, letterSpacing: '0.04em' }}>
                            {showReplies ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                            {showReplies ? `Hide ${replies.length} repl${replies.length === 1 ? 'y' : 'ies'}` : `${replies.length} repl${replies.length === 1 ? 'y' : 'ies'}`}
                        </button>
                    )}
                </div>

                {/* Nested replies */}
                {depth === 0 && showReplies && replies.length > 0 && (
                    <div style={{ marginTop: 10, paddingLeft: 16, borderLeft: '2px solid var(--hairline)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {replies.map(reply => (
                            <CommentRow
                                key={reply.id}
                                comment={reply}
                                postId={postId}
                                postAuthorId={postAuthorId}
                                user={user}
                                traders={traders}
                                depth={1}
                                onViewProfile={onViewProfile}
                                onTickerClick={onTickerClick}
                                onReply={onReply}
                                onLikeComment={onLikeComment}
                                onDeleteComment={onDeleteComment}
                                allComments={allComments}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── CommentThread (main export) ───────────────────────────────────────────────
export interface CommentThreadProps {
    post: any;                   // full Post object
    user: any;                   // current user or null
    traders: any[];
    onComment: (postId: string, text: string, parentId?: string | null) => Promise<void>;
    onDeleteComment: (postId: string, commentId: string) => void;
    onLikeComment: (commentId: string) => void;
    onViewProfile: (p: any) => void;
    onTickerClick?: (t: string) => void;
    compact?: boolean;           // true = PostCard inline view, false = SinglePostView
}

export function CommentThread({
    post, user, traders, onComment, onDeleteComment, onLikeComment,
    onViewProfile, onTickerClick, compact = false,
}: CommentThreadProps) {
    const [replyTo, setReplyTo] = useState<{ parentId: string; parentHandle: string } | null>(null);

    const allComments: Comment[] = post.comments || [];
    // Only top-level comments (no parentId) rendered at root
    const rootComments = allComments.filter((c: Comment) => !c.parentId);

    const handleReply = (parentId: string, parentHandle: string) => {
        setReplyTo({ parentId, parentHandle });
        setTimeout(() => document.getElementById(`reply-input-${post.id}`)?.focus(), 80);
    };

    const handleSubmit = async (text: string) => {
        await onComment(post.id, text, replyTo?.parentId ?? null);
        setReplyTo(null);
    };

    const S = {
        mono: { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1' } as React.CSSProperties,
        label: { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)' } as React.CSSProperties,
    };

    if (compact) {
        // ── Compact inline view (inside PostCard on feed) ────────────────────
        return (
            <div style={{ marginTop: 12, borderTop: '1px solid var(--hairline)', paddingTop: 12 }}>
                {/* Comments list */}
                {rootComments.length > 0 && (
                    <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {rootComments.map((c: Comment) => (
                            <CommentRow
                                key={c.id}
                                comment={c}
                                postId={post.id}
                                postAuthorId={post.authorId}
                                user={user}
                                traders={traders}
                                depth={0}
                                onViewProfile={onViewProfile}
                                onTickerClick={onTickerClick}
                                onReply={handleReply}
                                onLikeComment={onLikeComment}
                                onDeleteComment={onDeleteComment}
                                allComments={allComments}
                            />
                        ))}
                    </div>
                )}
                {/* Reply input */}
                {user && (
                    <div>
                        {replyTo && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, padding: '4px 10px', background: 'oklch(0.68 0.22 295 / 0.06)', borderRadius: 6, border: '1px solid oklch(0.68 0.22 295 / 0.2)' }}>
                                <span style={{ ...S.mono, fontSize: 10, color: 'var(--iris-violet)' }}>Replying to {replyTo.parentHandle}</span>
                                <button onClick={() => setReplyTo(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-subtle)', fontSize: 12, padding: 0 }}>✕</button>
                            </div>
                        )}
                        <CommentInput
                            user={user}
                            traders={traders}
                            placeholder={replyTo ? `Reply to ${replyTo.parentHandle}…` : 'Write a comment… @mention or $TICKER'}
                            onSubmit={handleSubmit}
                            compact
                        />
                    </div>
                )}
                {!user && (
                    <p style={{ ...S.label, textAlign: 'center', padding: '6px 0' }}>Log in to comment</p>
                )}
            </div>
        );
    }

    // ── Full single-post view ────────────────────────────────────────────────
    return (
        <div style={{ marginTop: 16 }}>
            <div style={{ ...S.label, fontSize: 11, marginBottom: 14, paddingLeft: 2 }}>
                {allComments.length} {allComments.length === 1 ? 'Comment' : 'Comments'}
            </div>

            {/* Write comment */}
            {user && (
                <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--hairline)', borderRadius: 16, padding: '16px 18px', marginBottom: 12 }}>
                    {replyTo && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: '5px 10px', background: 'oklch(0.68 0.22 295 / 0.06)', borderRadius: 8, border: '1px solid oklch(0.68 0.22 295 / 0.2)' }}>
                            <MessageCircle size={12} style={{ color: 'var(--iris-violet)' }} />
                            <span style={{ ...S.mono, fontSize: 10, color: 'var(--iris-violet)' }}>Replying to {replyTo.parentHandle}</span>
                            <button onClick={() => setReplyTo(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-subtle)', fontSize: 12, padding: 0 }}>✕</button>
                        </div>
                    )}
                    <CommentInput
                        user={user}
                        traders={traders}
                        placeholder={replyTo ? `Reply to ${replyTo.parentHandle}…` : 'Add a comment…  @mention or $TICKER'}
                        onSubmit={handleSubmit}
                        autoFocus={false}
                    />
                </div>
            )}

            {/* No comments state */}
            {rootComments.length === 0 && (
                <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--hairline)', borderRadius: 16, padding: '40px 24px', textAlign: 'center' }}>
                    <MessageCircle size={28} style={{ color: 'var(--fg-subtle)', marginBottom: 8 }} />
                    <p style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--fg-subtle)', fontStyle: 'italic' }}>No comments yet.</p>
                    <p style={{ ...S.mono, fontSize: 11, color: 'var(--fg-subtle)', marginTop: 4 }}>Be the first to comment.</p>
                </div>
            )}

            {/* Comments list */}
            {rootComments.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {rootComments.map((c: Comment, i: number) => (
                        <div key={c.id} style={{
                            background: 'var(--glass-bg)', border: '1px solid var(--hairline)',
                            borderRadius: i === 0 ? '16px 16px 0 0' : i === rootComments.length - 1 ? '0 0 16px 16px' : '0',
                            borderTopWidth: i > 0 ? 0 : 1,
                            padding: '14px 18px',
                        }}>
                            <CommentRow
                                comment={c}
                                postId={post.id}
                                postAuthorId={post.authorId}
                                user={user}
                                traders={traders}
                                depth={0}
                                onViewProfile={onViewProfile}
                                onTickerClick={onTickerClick}
                                onReply={handleReply}
                                onLikeComment={onLikeComment}
                                onDeleteComment={onDeleteComment}
                                allComments={allComments}
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default CommentThread;
