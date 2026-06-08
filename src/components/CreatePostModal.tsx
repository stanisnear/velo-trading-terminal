import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { PAIRS } from '../utils/types';

// ── Shared featured pairs list (mirrors App.tsx SOCIAL_FEATURED_PAIRS) ────────
const SOCIAL_FEATURED_PAIRS = PAIRS.map(p => ({
    symbol: p.id.split('/')[0],
    name: p.label ?? p.id,
    pairId: p.id,
    logo: p.logo ?? '',
}));

// ── MentionDropdown ───────────────────────────────────────────────────────────
const MentionDropdown = ({ results, anchorRef, activeIndex, onSelect, onHover }: {
    results: any[];
    anchorRef: React.RefObject<HTMLTextAreaElement>;
    activeIndex: number;
    onSelect: (item: any) => void;
    onHover: (i: number) => void;
}) => {
    const [pos, setPos] = React.useState<{ top: number; left: number; width: number } | null>(null);

    React.useEffect(() => {
        const update = () => {
            const rect = anchorRef.current?.getBoundingClientRect();
            if (rect) setPos({ top: rect.bottom + 6, left: rect.left, width: rect.width });
        };
        update();
        window.addEventListener('scroll', update, true);
        window.addEventListener('resize', update);
        return () => {
            window.removeEventListener('scroll', update, true);
            window.removeEventListener('resize', update);
        };
    }, [anchorRef, results.length]);

    if (!pos || results.length === 0) return null;

    const styleId = 'velo-mention-dropdown-style';
    if (!document.getElementById(styleId)) {
        const s = document.createElement('style');
        s.id = styleId;
        s.textContent = `
            .velo-mention-dropdown {
                position: fixed;
                z-index: 99999;
                min-width: 260px;
                background: var(--bg-base-2, #fff);
                border: 1px solid var(--hairline-strong, rgba(0,0,0,0.12));
                border-radius: 12px;
                box-shadow: 0 8px 30px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08);
                overflow: hidden;
                font-family: var(--font-sans, sans-serif);
            }
            .velo-mention-item {
                display: flex;
                align-items: center;
                gap: 10px;
                width: 100%;
                padding: 10px 14px;
                background: transparent;
                border: none;
                cursor: pointer;
                text-align: left;
                transition: background 0.1s;
                box-sizing: border-box;
            }
            .velo-mention-item:hover,
            .velo-mention-item.active { background: var(--chip-bg-hover, rgba(0,0,0,0.06)); }
            .velo-mention-item img { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; flex-shrink: 0; border: 1px solid var(--hairline, rgba(0,0,0,0.08)); }
            .velo-mention-item .ticker-icon { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; flex-shrink: 0; border: 1px solid var(--hairline, rgba(0,0,0,0.08)); }
            .velo-mention-name { font-family: var(--font-display, Georgia); font-style: italic; font-size: 13px; font-weight: 600; color: var(--fg, #0a0a0e); letter-spacing: -0.01em; line-height: 1.2; }
            .velo-mention-handle { font-family: var(--font-mono, monospace); font-size: 10px; color: var(--fg-subtle, rgba(10,10,14,0.45)); letter-spacing: 0.04em; margin-top: 2px; }
            .velo-mention-ticker-tag { font-family: var(--font-mono, monospace); font-size: 11px; font-weight: 700; color: var(--pnl-up, #34d399); letter-spacing: 0.04em; }
            .velo-mention-section-header { padding: 6px 14px 4px; font-family: var(--font-mono, monospace); font-size: 9px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-subtle, rgba(10,10,14,0.45)); border-bottom: 1px solid var(--hairline, rgba(0,0,0,0.06)); }
        `;
        document.head.appendChild(s);
    }

    return createPortal(
        <div className="velo-mention-dropdown" style={{ top: pos.top, left: pos.left }}>
            {results.map((item: any, i: number) => (
                item._sectionHeader ? (
                    <div key={`header-${i}`} className="velo-mention-section-header">{item._sectionHeader}</div>
                ) : item._type === 'ticker' ? (
                    <button
                        key={item.symbol}
                        className={`velo-mention-item${i === activeIndex ? ' active' : ''}`}
                        onMouseDown={e => { e.preventDefault(); onSelect(item); }}
                        onMouseEnter={() => onHover(i)}
                    >
                        <img src={item.logo} alt={item.symbol} className="ticker-icon" />
                        <div>
                            <div className="velo-mention-name">{item.name}</div>
                            <div className="velo-mention-ticker-tag">${item.symbol}</div>
                        </div>
                    </button>
                ) : (
                    <button
                        key={item.id}
                        className={`velo-mention-item${i === activeIndex ? ' active' : ''}`}
                        onMouseDown={e => { e.preventDefault(); onSelect(item); }}
                        onMouseEnter={() => onHover(i)}
                    >
                        <img src={item.avatar} alt={item.username} />
                        <div>
                            <div className="velo-mention-name">{item.username}</div>
                            <div className="velo-mention-handle">{item.handle || ('@' + item.username)}</div>
                        </div>
                    </button>
                )
            ))}
        </div>,
        document.body
    );
};

// ── CreatePostModal ───────────────────────────────────────────────────────────
export interface CreatePostModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: any;
    onSubmit: (content: string) => Promise<void>;
    traders?: any[];
}

export const CreatePostModal = ({ isOpen, onClose, user, onSubmit, traders = [] }: CreatePostModalProps) => {
    const [content, setContent] = React.useState('');
    const [posting, setPosting] = React.useState(false);
    const [mentionQuery, setMentionQuery] = React.useState<string | null>(null);
    const [mentionTrigger, setMentionTrigger] = React.useState<'@' | '$' | null>(null);
    const [mentionStart, setMentionStart] = React.useState(0);
    const [mentionIdx, setMentionIdx] = React.useState(0);
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);

    React.useEffect(() => {
        if (isOpen) {
            setContent('');
            setPosting(false);
            setMentionQuery(null);
            setTimeout(() => textareaRef.current?.focus(), 80);
        }
    }, [isOpen]);

    const mentionResults: any[] = React.useMemo(() => {
        if (mentionQuery === null) return [];
        const q = mentionQuery.toLowerCase();
        if (mentionTrigger === '$' && q) {
            return SOCIAL_FEATURED_PAIRS
                .filter(p => p.symbol.toLowerCase().startsWith(q) || p.name.toLowerCase().startsWith(q))
                .slice(0, 4)
                .map(p => ({ ...p, _type: 'ticker' }));
        }
        if (mentionTrigger === '@' && q.length > 0) {
            return traders
                .filter((t: any) => t.id !== user?.id && (
                    (t.handle || '').toLowerCase().includes(q) ||
                    (t.username || '').toLowerCase().includes(q)
                ))
                .slice(0, 5);
        }
        return [];
    }, [mentionQuery, mentionTrigger, traders, user]);

    const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        const cursor = e.target.selectionStart ?? val.length;
        setContent(val);
        const atMatch = val.slice(0, cursor).match(/@([A-Za-z0-9_]*)$/);
        const dollarMatch = val.slice(0, cursor).match(/\$([A-Za-z0-9]*)$/);
        if (atMatch) {
            setMentionTrigger('@'); setMentionQuery(atMatch[1]);
            setMentionStart(cursor - atMatch[0].length); setMentionIdx(0);
        } else if (dollarMatch) {
            setMentionTrigger('$'); setMentionQuery(dollarMatch[1]);
            setMentionStart(cursor - dollarMatch[0].length); setMentionIdx(0);
        } else {
            setMentionQuery(null); setMentionTrigger(null);
        }
    };

    const completeMention = (item: any) => {
        const insertion = item._type === 'ticker' ? `$${item.symbol}` : (item.handle || ('@' + item.username));
        const cursor = textareaRef.current?.selectionStart ?? mentionStart + (mentionQuery?.length ?? 0) + 1;
        const before = content.slice(0, mentionStart);
        const after = content.slice(cursor);
        setContent(before + insertion + ' ' + after);
        setMentionQuery(null); setMentionTrigger(null);
        setTimeout(() => {
            if (textareaRef.current) {
                const p = before.length + insertion.length + 1;
                textareaRef.current.focus();
                textareaRef.current.setSelectionRange(p, p);
            }
        }, 0);
    };

    const handleSubmit = async () => {
        if (!content.trim() || posting) return;
        setPosting(true);
        await onSubmit(content.trim());
        setPosting(false);
        onClose();
    };

    if (!isOpen || !user) return null;

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in"
            onClick={onClose}
        >
            <div
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                className="animate-bounce-in"
                style={{
                    width: '100%', maxWidth: 540,
                    background: 'var(--glass-bg-strong)',
                    border: '1px solid var(--hairline-strong)',
                    borderRadius: 20, overflow: 'hidden',
                    boxShadow: 'var(--glass-shadow)', backdropFilter: 'blur(32px)',
                }}
            >
                <div style={{ height: 3, background: 'var(--holo-linear)', backgroundSize: '220% 100%', animation: 'holoSlide 9s linear infinite' }} />
                <div style={{ padding: '20px 20px 16px' }}>
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                        <img
                            src={user.avatar}
                            style={{ width: 38, height: 38, borderRadius: '50%', border: '1px solid var(--hairline)', flexShrink: 0 }}
                            alt={user.username}
                        />
                        <div>
                            <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 16, color: 'var(--fg)', letterSpacing: '-0.02em' }}>{user.username}</div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-subtle)', letterSpacing: '0.04em' }}>{user.handle}</div>
                        </div>
                        <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-muted)', padding: 4 }}>
                            <X size={18} />
                        </button>
                    </div>

                    {/* Textarea */}
                    <div style={{ position: 'relative' }}>
                        <textarea
                            ref={textareaRef}
                            value={content}
                            onChange={handleTextChange}
                            onKeyDown={e => {
                                if (mentionQuery !== null && mentionResults.length > 0) {
                                    if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx(i => Math.min(i + 1, mentionResults.length - 1)); return; }
                                    if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIdx(i => Math.max(i - 1, 0)); return; }
                                    if (e.key === 'Tab') { e.preventDefault(); completeMention(mentionResults[mentionIdx]); return; }
                                    if (e.key === 'Escape') { setMentionQuery(null); setMentionTrigger(null); return; }
                                }
                                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
                            }}
                            onBlur={() => setTimeout(() => { setMentionQuery(null); setMentionTrigger(null); }, 150)}
                            placeholder="What's happening in the markets? Use @handle or $BTC to tag"
                            rows={5}
                            style={{
                                width: '100%', background: 'var(--chip-bg)',
                                border: '1px solid var(--hairline)', borderRadius: 12,
                                padding: '12px 14px', fontFamily: 'var(--font-sans)', fontSize: 15,
                                color: 'var(--fg)', outline: 'none', resize: 'none',
                                lineHeight: 1.6, boxSizing: 'border-box' as const,
                            }}
                        />
                        <MentionDropdown
                            results={mentionResults}
                            anchorRef={textareaRef}
                            activeIndex={mentionIdx}
                            onSelect={completeMention}
                            onHover={setMentionIdx}
                        />
                    </div>

                    {/* Footer */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-subtle)', letterSpacing: '0.06em' }}>
                            @handle · $TICKER · Cmd+Enter to post
                        </span>
                        <button
                            onClick={handleSubmit}
                            disabled={!content.trim() || posting}
                            style={{
                                padding: '9px 22px', borderRadius: 20,
                                background: content.trim() ? 'var(--fg)' : 'var(--chip-bg)',
                                border: 'none', fontFamily: 'var(--font-mono)', fontSize: 12,
                                fontWeight: 700, color: content.trim() ? 'var(--bg-base)' : 'var(--fg-subtle)',
                                cursor: content.trim() && !posting ? 'pointer' : 'default',
                                letterSpacing: '0.05em', opacity: posting ? 0.7 : 1, transition: 'all 0.15s',
                            }}
                        >
                            {posting ? 'Posting…' : 'Post'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CreatePostModal;
