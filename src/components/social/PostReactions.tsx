import React, { createContext, useContext, useState } from 'react';
import { Lightbulb, PartyPopper, TrendingUp, SmilePlus } from 'lucide-react';
import { Post } from '@/utils/types';

export type ReactionKind = 'insightful' | 'celebrate' | 'bullish';
export const ReactionContext = createContext<{
  userId?: string; react: (postId: string, kind: ReactionKind | null) => Promise<void>;
  requireAuth: () => void;
}>({ react: async () => {}, requireAuth: () => {} });
const choices = [
  { kind: 'insightful' as const, label: 'Insightful', Icon: Lightbulb },
  { kind: 'celebrate' as const, label: 'Celebrate', Icon: PartyPopper },
  { kind: 'bullish' as const, label: 'Bullish', Icon: TrendingUp },
];

export function PostReactions({ post }: { post: Post }) {
  const { userId, react, requireAuth } = useContext(ReactionContext);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const reactions = post.reactions || [];
  const selected = reactions.find(reaction => reaction.userId === userId)?.kind;
  async function choose(kind: ReactionKind) {
    if (!userId) { requireAuth(); return; }
    if (busy) return;
    setBusy(true); setError('');
    try { await react(post.id, selected === kind ? null : kind); }
    catch { setError('Reaction not saved. Try again.'); }
    finally { setBusy(false); }
  }
  return <div className="post-reactions" aria-label="Post reactions">
    <button type="button" title={expanded ? 'Hide reactions' : 'React to this post'} aria-label="React to this post" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}><SmilePlus size={16} /></button>
    {choices.map(({ kind, label, Icon }) => {
      const count = reactions.filter(reaction => reaction.kind === kind).length;
      return expanded || count > 0 ? <button key={kind} type="button" title={label} aria-label={`${label}: ${count}`} aria-pressed={selected === kind} disabled={busy} onClick={() => void choose(kind)}><Icon size={15} /><span>{count || label}</span></button> : null;
    })}
    {error && <span role="alert">{error}</span>}
    <style>{`.post-reactions{display:flex;align-items:center;flex-wrap:wrap;gap:6px;padding-top:8px}.post-reactions button{display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:6px 9px;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--fg-muted);font:500 12px var(--font-sans);cursor:pointer;transition:background 150ms,color 150ms,transform 150ms}.post-reactions button:hover{background:var(--chip-bg);color:var(--fg)}.post-reactions button[aria-pressed=true]{border-color:var(--accent);background:var(--chip-bg);color:var(--accent-text)}.post-reactions button:active{transform:scale(.95)}.post-reactions button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.post-reactions [role=alert]{color:var(--pnl-down);font-size:12px}@media(prefers-reduced-motion:reduce){.post-reactions button{transition:none}}`}</style>
  </div>;
}
