import React,{useEffect,useId,useRef,useState} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react';
import { supportsProductMotion } from '../ui/ProductMotion';
import { ArrowUpRight,Users,LockKeyhole } from 'lucide-react';
import { profileDisplayName,isWalletPlaceholder } from '../../utils/profileIdentity.mjs';
import './TraderPreview.css';

const PreviewSurface = React.forwardRef<HTMLDivElement, React.ComponentProps<typeof motion.div>>(function PreviewSurface(props, ref) {
 const present=useIsPresent(),reduced=useReducedMotion(),animate=supportsProductMotion()&&!reduced;
 return <motion.div {...props} ref={ref} inert={!present} aria-hidden={!present}
  initial={animate?{opacity:0,y:5,scale:.98}:false} animate={{opacity:1,y:0,scale:1}}
  exit={{opacity:0,y:animate?3:0,scale:animate?.985:1}} transition={{duration:animate?.16:0,ease:[.22,1,.36,1]}}/>;
});

/** A focusable public-profile preview. Reads already loaded data; no extra requests. */
export function TraderPreview({profile,onView,children}:{profile:any;onView:()=>void;children:React.ReactNode}){
 const [open,setOpen]=useState(false),[position,setPosition]=useState<{left:number;top:number}|null>(null);
 const anchor=useRef<HTMLSpanElement>(null),card=useRef<HTMLDivElement>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null);const id=useId(),suppressFocus=useRef(false),focusPreview=useRef(false);
 const cancel=()=>{if(timer.current)clearTimeout(timer.current);};
 const show=()=>{cancel();timer.current=setTimeout(()=>setOpen(true),220);};
 const hide=()=>{cancel();timer.current=setTimeout(()=>setOpen(false),120);};
 useEffect(()=>()=>cancel(),[]);
 useEffect(()=>{
  if(!open)return;
  const bounds=anchor.current?.getBoundingClientRect();if(!bounds)return;
  const width=Math.min(280,window.innerWidth-24),height=250;
  setPosition({left:Math.max(12,Math.min(bounds.left,window.innerWidth-width-12)),top:bounds.bottom+height<window.innerHeight-12?bounds.bottom+10:Math.max(12,bounds.top-height-10)});
  const dismiss=(event:Event)=>{if(event.type==='scroll'&&card.current?.contains(event.target as Node))return;if(event.type==='pointerdown'&&(anchor.current?.contains(event.target as Node)||card.current?.contains(event.target as Node)))return;setOpen(false);};
  window.addEventListener('scroll',dismiss,true);window.addEventListener('resize',dismiss);document.addEventListener('pointerdown',dismiss);
  return()=>{window.removeEventListener('scroll',dismiss,true);window.removeEventListener('resize',dismiss);document.removeEventListener('pointerdown',dismiss);};
 },[open]);
 useEffect(()=>{if(open&&position&&focusPreview.current){focusPreview.current=false;card.current?.querySelector('button')?.focus();}},[open,position]);
 const name=profileDisplayName(profile);
 return <span className="trader-preview-anchor" ref={anchor} onPointerEnter={event=>{if(event.pointerType==='mouse')show();}} onPointerLeave={hide} onFocusCapture={()=>{if(suppressFocus.current){suppressFocus.current=false;return;}show();}} onBlurCapture={event=>{if(!card.current?.contains(event.relatedTarget as Node)&&!anchor.current?.contains(event.relatedTarget as Node))hide();}} onKeyDown={event=>{if(event.key==='Escape'&&open){event.preventDefault();event.stopPropagation();setOpen(false);}if(event.key==='ArrowDown'){event.preventDefault();cancel();focusPreview.current=true;setOpen(true);}}}>
  {children}
  {position&&createPortal(<AnimatePresence initial={false}>{open&&<PreviewSurface key="profile" ref={card} id={id} role="dialog" aria-label={`${name} profile preview`} className="trader-preview-card" style={position} onPointerEnter={cancel} onPointerLeave={hide} onFocusCapture={cancel} onBlurCapture={hide} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setOpen(false);suppressFocus.current=true;anchor.current?.querySelector('button')?.focus();}}}>
   <div className="trader-preview-identity">{profile.avatar&&<img src={profile.avatar} alt=""/>}<div><strong>{name}</strong><small>{!isWalletPlaceholder(profile.handle)&&profile.handle?profile.handle:`@${name}`}</small></div>{profile.isPrivate&&<LockKeyhole size={15}/>}</div>
   {profile.bio&&<p>{String(profile.bio).slice(0,160)}</p>}
   {Array.isArray(profile.followers)&&<div className="trader-preview-followers"><Users size={13}/><b>{profile.followers.length.toLocaleString()}</b> followers{Array.isArray(profile.following)&&<span> · {profile.following.length.toLocaleString()} following</span>}</div>}
   <button type="button" onClick={()=>{cancel();setOpen(false);onView();}}>View profile<ArrowUpRight size={14}/></button>
  </PreviewSurface>}</AnimatePresence>,anchor.current?.closest('dialog[open]')||document.body)}
 </span>;
}
