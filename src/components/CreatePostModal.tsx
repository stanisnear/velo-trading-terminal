import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { SocialTextField } from './social/SocialTextField';

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
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);

    const [closing, setClosing] = React.useState(false);
    // Animated close: play the exit transition, then actually unmount.
    const animatedClose = () => {
        if (closing) return;
        setClosing(true);
        setTimeout(() => { setClosing(false); onClose(); }, 180);
    };

    React.useEffect(() => {
        if (isOpen) {
            setContent('');
            setPosting(false);
            setClosing(false);

            setTimeout(() => textareaRef.current?.focus(), 80);
        }
    }, [isOpen]);

    const handleSubmit = async () => {
        if (!content.trim() || posting) return;
        setPosting(true);
        console.info('[velo] post submit: started');
        // Watchdog: if the submit promise somehow never settles, free the
        // button after 12s instead of stranding 'Posting…' forever. The draft
        // is kept; duplicate-suppression upstream refuses an identical retry.
        const watchdog = setTimeout(() => {
            console.warn('[velo] post submit watchdog fired — promise did not settle in 12s');
            setPosting(false);
        }, 12_000);
        try {
            await onSubmit(content.trim());
            console.info('[velo] post submit: resolved');
            // Success: the wrapper has navigated to the new post's URL — clear
            // the draft and play the exit animation over the destination page.
            setContent('');
            animatedClose();
        } catch (e) {
            // Keep the draft and name the real cause in the console — a failed
            // post must never strand the button on 'Posting…' or eat the text.
            console.error('[velo] post submit failed:', e);
        } finally {
            clearTimeout(watchdog);
            setPosting(false);
        }
    };

    if (!isOpen || !user) return null;

    return (
        <div
            className={`fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md ${closing ? 'velo-modal-closing' : 'velo-modal-enter-backdrop'}`}
            onClick={animatedClose}
        >
            <div
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                className="velo-modal-enter-card"
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
                        <button onClick={animatedClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-muted)', padding: 4 }}>
                            <X size={18} />
                        </button>
                    </div>

                    {/* Textarea */}
                    <div style={{ position: 'relative' }}>
                        <SocialTextField ref={textareaRef} className="velo-compose-field" aria-label="Write a post" value={content} onValueChange={setContent} onSubmit={handleSubmit} people={traders} disabled={posting} placeholder="What's happening in the markets?" rows={5} style={{width:'100%',minHeight:130,resize:'none'}} />
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
