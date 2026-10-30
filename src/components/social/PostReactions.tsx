import { AnimatedText } from '../ui/AnimatedValue';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Lightbulb, PartyPopper, TrendingUp, SmilePlus } from 'lucide-react';
import { Post } from '@/utils/types';
import { ReactionFeedback, supportsProductMotion } from '../ui/ProductMotion';
import './PostReactions.css';

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
  const root=useRef<HTMLDivElement>(null), trigger=useRef<HTMLButtonElement>(null), locked=useRef(false);
  const reduced=useReducedMotion();
  const animated=!reduced&&supportsProductMotion();
  const reactions = post.reactions || [];
  const selected = reactions.find(reaction => reaction.userId === userId)?.kind;
  useEffect(()=>{
    if(!expanded)return;
    const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!root.current?.contains(event.target))setExpanded(false);};
    document.addEventListener('pointerdown',outside);
    return()=>document.removeEventListener('pointerdown',outside);
  },[expanded]);
  async function choose(kind: ReactionKind) {
    if (!userId) { requireAuth(); return; }
    if (locked.current) return;
    locked.current=true;setBusy(true);setError('');
    try { await react(post.id, selected === kind ? null : kind);setExpanded(false); }
    catch { setError('Reaction not saved. Try again.'); }
    finally { locked.current=false;setBusy(false); }
  }
  const items=choices.filter(choice=>expanded||reactions.some(reaction=>reaction.kind===choice.kind));
  const dock=<div className="reaction-dock" role="group" aria-label="Choose a reaction" aria-busy={busy}
    onKeyDown={event=>{
      if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;
      const buttons=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const index=buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
      event.preventDefault();buttons[next]?.focus();
    }}>
    {items.map(({kind,label,Icon},index)=>{
      const count=reactions.filter(reaction=>reaction.kind===kind).length;
      const content=<button type="button" title={label} aria-label={`${label}: ${count}`} aria-pressed={selected===kind} disabled={busy} onClick={()=>void choose(kind)}>
        <ReactionFeedback active={selected===kind}><Icon size={17} strokeWidth={1.7}/></ReactionFeedback>
        <span>{expanded?label:null}{count?<span className="reaction-count"><AnimatedText text={count}/></span>:null}</span>
      </button>;
      return animated?<motion.div key={kind} initial={{opacity:0,y:6,scale:.94}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:3}} transition={{type:'spring',stiffness:520,damping:30,delay:index*.025}}>{content}</motion.div>:<div key={kind}>{content}</div>;
    })}
  </div>;
  return <div ref={root} className={`post-reactions${expanded?' is-expanded':''}`} aria-label="Post reactions" onKeyDown={event=>{
    if(event.key==='Escape'&&expanded){event.preventDefault();event.stopPropagation();setExpanded(false);trigger.current?.focus();}
  }}>
    <button ref={trigger} type="button" className="reaction-trigger" title={expanded?'Hide reactions':'React to this post'} aria-label="React to this post" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}><SmilePlus size={17}/></button>
    {animated?<AnimatePresence initial={false}>{items.length>0&&<motion.div key="dock" initial={{opacity:0,scale:.96,x:-5}} animate={{opacity:1,scale:1,x:0}} exit={{opacity:0,scale:.96,x:-5}} transition={{type:'spring',stiffness:460,damping:32}}>{dock}</motion.div>}</AnimatePresence>:items.length>0?dock:null}
    {error&&<span role="alert">{error}</span>}
  </div>;
}
