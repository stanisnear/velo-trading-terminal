import React,{useEffect,useId,useRef,useState} from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight,Users,LockKeyhole } from 'lucide-react';
import { profileDisplayName,isWalletPlaceholder } from '../../utils/profileIdentity.mjs';
import './TraderPreview.css';

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
  {open&&position&&createPortal(<div ref={card} id={id} role="dialog" aria-label={`${name} profile preview`} className="trader-preview-card" style={position} onPointerEnter={cancel} onPointerLeave={hide} onFocusCapture={cancel} onBlurCapture={hide} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setOpen(false);suppressFocus.current=true;anchor.current?.querySelector('button')?.focus();}}}>
   <div className="trader-preview-identity">{profile.avatar&&<img src={profile.avatar} alt=""/>}<div><strong>{name}</strong><small>{!isWalletPlaceholder(profile.handle)&&profile.handle?profile.handle:`@${name}`}</small></div>{profile.isPrivate&&<LockKeyhole size={15}/>}</div>
   {profile.bio&&<p>{String(profile.bio).slice(0,160)}</p>}
   {Array.isArray(profile.followers)&&<div className="trader-preview-followers"><Users size={13}/><b>{profile.followers.length.toLocaleString()}</b> followers{Array.isArray(profile.following)&&<span> · {profile.following.length.toLocaleString()} following</span>}</div>}
   <button type="button" onClick={()=>{cancel();setOpen(false);onView();}}>View profile<ArrowUpRight size={14}/></button>
  </div>,anchor.current?.closest('dialog[open]')||document.body)}
 </span>;
}
