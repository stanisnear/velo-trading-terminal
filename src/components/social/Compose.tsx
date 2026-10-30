import React from 'react';
import { SocialTextField } from './SocialTextField';

export const WallCompose = ({ user, targetId, targetName, onPostCreate, placeholder, traders = [] }: any) => {
    const [text, setText] = React.useState('');
    const [posting, setPosting] = React.useState(false);
    if (!user) return null;

    const handlePost = async () => {
        if (!text.trim() || posting) return;
        setPosting(true);
        try {
            await onPostCreate(text.trim(), undefined, targetId);
            // Clear only on success — a failed post keeps the draft.
            setText('');
        } catch (e) {
            console.error('[velo] feed post failed:', e);
        } finally {
            setPosting(false); // never strands on '…'
        }
    };

    return (
        <div className="velo-composer" style={{ display: 'flex', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', border: '1px solid var(--hairline)', flexShrink: 0 }}>
                <img src={user.avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt=""/>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <SocialTextField className="velo-compose-field" aria-label="Write a post" placeholder={placeholder || 'Write something…'} value={text} onValueChange={setText} onSubmit={handlePost} people={traders} disabled={posting} style={{width:'100%',minHeight:56,resize:'none'}} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--hairline)', paddingTop: 8 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-subtle)', letterSpacing: '0.06em' }}>Ctrl+Enter to post · @handle · $TICKER to tag</span>
                    <button
                        onClick={handlePost}
                        disabled={!text.trim() || posting}
                        style={{ padding: '6px 16px', borderRadius: 20, background: !text.trim() || posting ? 'var(--disabled-bg)' : 'var(--fg)', border: !text.trim() || posting ? '1px solid var(--control-border)' : 'none', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: !text.trim() || posting ? 'var(--disabled-fg)' : 'var(--bg-base)', cursor: text.trim() && !posting ? 'pointer' : 'default', letterSpacing: '0.05em', opacity: 1, textTransform: 'uppercase' as const, transition: 'background-color 0.15s, color 0.15s' }}>
                        {posting ? '…' : 'Post'}
                    </button>
                </div>
            </div>
        </div>
    );
};
