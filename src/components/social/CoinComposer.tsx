import React, { useRef, useState } from 'react';
import { ArrowUpRight, Hash, Send } from 'lucide-react';
import { SocialTextField } from './SocialTextField';
import { ActionContent } from '../ui/ProductMotion';
import { mentionsTicker } from '../../../shared/marketDiscovery.mjs';

/** Keep the asset association in ordinary post content, visible in every feed. */
export function coinPostContent(draft: string, ticker: string) {
  const content = draft.trim();
  if (!content) return '';
  return mentionsTicker(content, ticker) ? content : `${content}\n\n$${ticker}`;
}

export function CoinComposer({ ticker, user, onPostCreate, onRequireAuth }: {
  ticker: string; user?: {id: string; avatar?: string} | null;
  onPostCreate: (content: string) => Promise<string | null>;
  onRequireAuth: () => unknown;
}) {
  const [draft, setDraft] = useState(''), [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState(''), [failed, setFailed] = useState(false);
  const lock = useRef(false), field = useRef<HTMLTextAreaElement>(null);
  const submit = async () => {
    if (lock.current || !draft.trim()) return;
    if (!user) { onRequireAuth(); return; }
    lock.current = true; setPending(true); setFeedback(''); setFailed(false);
    try {
      const id = await onPostCreate(coinPostContent(draft, ticker));
      if (!id) throw new Error('Unconfirmed publication');
      setDraft(''); setFeedback('Posted to the conversation and your feed.');
    } catch {
      setFailed(true); setFeedback('Your post was not confirmed. Your draft is saved here—please retry.');
    } finally { lock.current = false; setPending(false); }
  };
  return <form className="asset-composer" aria-label={`Post about ${ticker}`} aria-busy={pending} onSubmit={event => { event.preventDefault(); void submit(); }}>
    <div className="asset-composer__intro">
      {user?.avatar ? <img src={user.avatar} alt="" /> : <span className="asset-composer__avatar" aria-hidden="true"><Hash size={18}/></span>}
      <div><strong>What’s your view?</strong><span>Join the ${ticker} conversation.</span></div>
    </div>
    <SocialTextField ref={field} value={draft} onValueChange={value => { setDraft(value); setFeedback(''); }}
      onSubmit={() => void submit()} disabled={pending} rows={3} maxLength={4000}
      aria-label={`Write a post about ${ticker}`} placeholder={`Share an idea about ${ticker}… @mention someone or add a $coin`}/>
    <div className="asset-composer__footer">
      <span className="asset-composer__tag"><Hash size={12} aria-hidden="true"/> ${ticker} included</span>
      {user ? <button type="submit" className="asset-primary" disabled={!draft.trim() || pending}>
        <ActionContent pending={pending} pendingLabel="Publishing"><Send size={14}/> Post</ActionContent>
      </button> : <button type="button" className="asset-primary" onClick={onRequireAuth}>Sign in to post <ArrowUpRight size={15}/></button>}
    </div>
    {feedback && <p className={failed ? 'asset-composer__error' : 'asset-composer__success'} role={failed ? 'alert' : 'status'}>{feedback}</p>}
  </form>;
}
