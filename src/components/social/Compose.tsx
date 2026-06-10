/**
 * Compose — MentionDropdown (portal-rendered @/$ autocomplete) and WallCompose
 * (the feed/profile post composer with mention + cashtag support). Extracted
 * from App.tsx (stage 6 of the monolith decomposition): only external dep is
 * createPortal; everything else is props-in, JSX-out.
 */
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SOCIAL_FEATURED_PAIRS } from '@/utils/types';

export const MentionDropdown = ({ results, anchorRef, activeIndex, onSelect, onHover }: any) => {
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

    // Inline style with a <style> block so CSS vars resolve correctly on the portal root
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
            .velo-mention-item.active {
                background: var(--chip-bg-hover, rgba(0,0,0,0.06));
            }
            .velo-mention-item img {
                width: 32px;
                height: 32px;
                border-radius: 50%;
                object-fit: cover;
                flex-shrink: 0;
                border: 1px solid var(--hairline, rgba(0,0,0,0.08));
            }
            .velo-mention-item .ticker-icon {
                width: 32px;
                height: 32px;
                border-radius: 50%;
                object-fit: cover;
                flex-shrink: 0;
                border: 1px solid var(--hairline, rgba(0,0,0,0.08));
            }
            .velo-mention-name {
                font-family: var(--font-display, Georgia);
                font-style: italic;
                font-size: 13px;
                font-weight: 600;
                color: var(--fg, #0a0a0e);
                letter-spacing: -0.01em;
                line-height: 1.2;
            }
            .velo-mention-handle {
                font-family: var(--font-mono, monospace);
                font-size: 10px;
                color: var(--fg-subtle, rgba(10,10,14,0.45));
                letter-spacing: 0.04em;
                margin-top: 2px;
            }
            .velo-mention-ticker-tag {
                font-family: var(--font-mono, monospace);
                font-size: 11px;
                font-weight: 700;
                color: var(--pnl-up, #34d399);
                letter-spacing: 0.04em;
            }
            .velo-mention-section-header {
                padding: 6px 14px 4px;
                font-family: var(--font-mono, monospace);
                font-size: 9px;
                font-weight: 700;
                letter-spacing: 0.12em;
                text-transform: uppercase;
                color: var(--fg-subtle, rgba(10,10,14,0.45));
                border-bottom: 1px solid var(--hairline, rgba(0,0,0,0.06));
            }
        `;
        document.head.appendChild(s);
    }

    return createPortal(
        <div
            className="velo-mention-dropdown"
            style={{ top: pos.top, left: pos.left }}
        >
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

export const WallCompose = ({ user, targetId, targetName, onPostCreate, placeholder, traders = [] }: any) => {
    const [text, setText] = React.useState('');
    const [posting, setPosting] = React.useState(false);
    const [mentionQuery, setMentionQuery] = React.useState<string | null>(null);
    const [mentionTrigger, setMentionTrigger] = React.useState<'@' | '$' | null>(null);
    const [mentionStart, setMentionStart] = React.useState(0);
    const [dropdownIndex, setDropdownIndex] = React.useState(0);
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);

    if (!user) return null;

    const mentionResults: any[] = React.useMemo ? (() => {
        if (mentionQuery === null) return [];
        const q = mentionQuery.toLowerCase();
        if (mentionTrigger === '$') {
            if (!q) return []; // don't show anything until at least 1 char typed
            return SOCIAL_FEATURED_PAIRS.filter(p =>
                p.symbol.toLowerCase().startsWith(q) || p.name.toLowerCase().startsWith(q)
            ).slice(0, 4).map(p => ({ ...p, _type: 'ticker' }));
        }
        if (mentionTrigger === '@' && q.length > 0) {
            return traders.filter((t: any) => {
                if (t.id === user.id) return false;
                return (t.handle || '').toLowerCase().includes(q) || (t.username || '').toLowerCase().includes(q);
            }).slice(0, 6);
        }
        return [];
    })() : [];

    const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        const cursor = e.target.selectionStart ?? val.length;
        setText(val);
        const atMatch = val.slice(0, cursor).match(/@([A-Za-z0-9_]*)$/);
        const dollarMatch = val.slice(0, cursor).match(/\$([A-Za-z0-9]*)$/);
        if (atMatch) {
            setMentionTrigger('@');
            setMentionQuery(atMatch[1]);
            setMentionStart(cursor - atMatch[0].length);
            setDropdownIndex(0);
        } else if (dollarMatch) {
            setMentionTrigger('$');
            setMentionQuery(dollarMatch[1]);
            setMentionStart(cursor - dollarMatch[0].length);
            setDropdownIndex(0);
        } else {
            setMentionQuery(null);
            setMentionTrigger(null);
        }
    };

    const completeMention = (item: any) => {
        const insertion = item._type === 'ticker' ? `$${item.symbol}` : (item.handle || ('@' + item.username));
        const cursor = textareaRef.current?.selectionStart ?? mentionStart + (mentionQuery?.length ?? 0) + 1;
        const before = text.slice(0, mentionStart);
        const after = text.slice(cursor);
        setText(before + insertion + ' ' + after);
        setMentionQuery(null);
        setMentionTrigger(null);
        setTimeout(() => {
            if (textareaRef.current) {
                const pos = before.length + insertion.length + 1;
                textareaRef.current.focus();
                textareaRef.current.setSelectionRange(pos, pos);
            }
        }, 0);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (mentionQuery !== null && mentionResults.length > 0) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setDropdownIndex(i => Math.min(i + 1, mentionResults.length - 1)); return; }
            if (e.key === 'ArrowUp')   { e.preventDefault(); setDropdownIndex(i => Math.max(i - 1, 0)); return; }
            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); completeMention(mentionResults[dropdownIndex]); return; }
            if (e.key === 'Escape')    { setMentionQuery(null); setMentionTrigger(null); return; }
        }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handlePost();
    };

    const handlePost = async () => {
        if (!text.trim() || posting) return;
        setPosting(true);
        try {
            await onPostCreate(text.trim(), undefined, targetId);
            // Clear only on success — a failed post keeps the draft.
            setText('');
            setMentionQuery(null);
            setMentionTrigger(null);
        } catch (e) {
            console.error('[velo] feed post failed:', e);
        } finally {
            setPosting(false); // never strands on '…'
        }
    };

    return (
        <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', border: '1px solid var(--hairline)', flexShrink: 0 }}>
                <img src={user.avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt=""/>
            </div>
            <div style={{ flex: 1 }}>
                <textarea
                    ref={textareaRef}
                    placeholder={placeholder || `Write something\u2026`}
                    value={text}
                    onChange={handleTextChange}
                    onKeyDown={handleKeyDown}
                    onBlur={() => setTimeout(() => { setMentionQuery(null); setMentionTrigger(null); }, 150)}
                    style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg)', resize: 'none', height: 56, lineHeight: 1.5 }}
                />
                <MentionDropdown results={mentionResults} anchorRef={textareaRef} activeIndex={dropdownIndex} onSelect={completeMention} onHover={setDropdownIndex} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--hairline)', paddingTop: 8 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-subtle)', letterSpacing: '0.06em' }}>Ctrl+Enter to post · @handle · $TICKER to tag</span>
                    <button
                        onClick={handlePost}
                        disabled={!text.trim() || posting}
                        style={{ padding: '6px 16px', borderRadius: 20, background: 'var(--fg)', border: 'none', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--bg-base)', cursor: text.trim() && !posting ? 'pointer' : 'default', letterSpacing: '0.05em', opacity: !text.trim() || posting ? 0.4 : 1, textTransform: 'uppercase' as const, transition: 'opacity 0.15s' }}>
                        {posting ? '…' : 'Post'}
                    </button>
                </div>
            </div>
        </div>
    );
};
