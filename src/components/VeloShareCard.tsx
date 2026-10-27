import { SocialTextField } from './social/SocialTextField';
import React, { useEffect, useRef, useState } from 'react';
import { Download, Share2, Send, Sun, Moon, SlidersHorizontal, ChevronDown, Check } from 'lucide-react';
import { Dialog } from './ui/Dialog';
import { PnlImage } from './PnlImage';
import { renderTradePng } from '../utils/tradeImage';
export { renderTradePng } from '../utils/tradeImage';
import { useSharedTrade, CompactPosition } from './SharedPositionCard';
import { ShareValueControl } from './ShareValueControl';
import type { TradeShare } from '../utils/tradeShare';
import { hasPositionReference } from '../services/sharedPosition';
import './TradeShareCard.css';
export type ShareCardData = TradeShare;

export const VeloShareCard = ({isOpen,onClose,data:snapshot,onPost}:{
  isOpen:boolean;onClose:()=>void;data:ShareCardData;
  onPost?:(content:string,data:TradeShare,image?:Blob)=>Promise<string|null>;
}) => {
  const [presentation,setPresentation]=useState<'position'|'pnl'>(snapshot.presentation || (snapshot.status === 'OPEN' ? 'position' : 'pnl'));
  const [theme,setTheme]=useState<'light'|'dark'>(()=>document.documentElement.classList.contains('light')?'light':'dark');
  const [design,setDesign]=useState<'signature'|'minimal'>('signature');
  const [imageLive,setImageLive]=useState(false),[freeze,setFreeze]=useState(false);
  const [hideAmounts,setHideAmounts]=useState(!!snapshot.hideAmounts);
  const canUpdate=snapshot.status === 'OPEN' && hasPositionReference(snapshot);
  const updateMode=canUpdate && (presentation === 'position' || imageLive)?'live':'snapshot';
  const onClosed=presentation === 'pnl' && freeze?'freeze':'settle';
  const {data:latest,pending}=useSharedTrade({...snapshot,updateMode,onClose:onClosed});
  const capturedAt=useRef(snapshot.updatedAt || Date.now()).current;
  const data:TradeShare={...latest,presentation,updateMode:latest.closedSnapshot?'snapshot':updateMode,theme,design,onClose:onClosed,hideAmounts,updatedAt:latest.updatedAt || capturedAt};
  const [content,setContent]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[feedback,setFeedback]=useState('');
  const lock=useRef(false),publication=useRef<{key:string;content:string;data:TradeShare}|null>(null);
  useEffect(()=>{setContent(`${snapshot.status === 'OPEN'?'Following my':'Closed my'} ${snapshot.side.toLowerCase()} on $${snapshot.pair.split('/')[0]}.`);setError('');setFeedback('');},[snapshot.tradeId,snapshot.status,snapshot.pair]);
  const run=async(action:()=>Promise<void>)=>{
    if(lock.current)return;lock.current=true;setBusy(true);setError('');setFeedback('');
    try{await action();}catch(e){if((e as DOMException).name!=='AbortError')setError(e instanceof Error?e.message:'Please retry. Your draft is kept.');}
    finally{lock.current=false;setBusy(false);}
  };
  const exportImage=(native:boolean)=>run(async()=>{
    const blob=await renderTradePng({...data,updateMode:'snapshot'},theme==='light',hideAmounts);
    const file=new File([blob],`velo-${data.pair.replace('/','-')}-${data.status.toLowerCase()}.png`,{type:'image/png'});
    if(native && navigator.canShare?.({files:[file]}) && navigator.share){await navigator.share({files:[file],title:`${data.pair} on Velo`});setFeedback('Shared.');return;}
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);setFeedback('Image saved.');
  });
  const publish=()=>run(async()=>{
    if(!onPost)return;
    const key=JSON.stringify([content.trim(),presentation,theme,design,updateMode,onClosed,hideAmounts]);
    const draft=publication.current?.key===key?publication.current:{key,content:content.trim(),data};publication.current=draft;
    const id=await onPost(draft.content,draft.data,presentation==='pnl'?await renderTradePng(draft.data,theme==='light',hideAmounts):undefined);
    if(!id)throw new Error('Publication was not confirmed. Your draft is kept; please retry.');onClose();
  });
  return <Dialog open={isOpen} onClose={onClose} busy={busy} title="Share trade" className="share-studio">
    <div className="share-studio-body" data-card-theme={theme}>
      <div className="share-studio-tabs" role="group" aria-label="Share format"><button disabled={busy} aria-pressed={presentation==='position'} onClick={()=>setPresentation('position')}>Position</button><button disabled={busy} aria-pressed={presentation==='pnl'} onClick={()=>setPresentation('pnl')}>PnL image</button></div>
      <div className="share-studio-preview">{presentation==='pnl'?<PnlImage data={data}/>:<CompactPosition data={data} pending={pending}/>}</div>
      <div className="share-studio-toolbar"><ShareValueControl hidden={hideAmounts} onChange={setHideAmounts} disabled={busy}/>{presentation==='pnl'&&<div className="share-theme-control" role="group" aria-label="Image appearance"><button aria-label="Light card" aria-pressed={theme==='light'} disabled={busy} onClick={()=>setTheme('light')}><Sun size={15}/></button><button aria-label="Dark card" aria-pressed={theme==='dark'} disabled={busy} onClick={()=>setTheme('dark')}><Moon size={15}/></button></div>}</div>
      {presentation==='pnl'&&<details className="share-customization"><summary><SlidersHorizontal size={14}/><span>Customize</span><small>{design==='signature'?'Velo':'Clean'} · {updateMode==='live'?'Live':'Snapshot'}</small><ChevronDown size={14}/></summary><div className="share-customization-content">
        <div className="share-designs" role="group" aria-label="Card layout">{(['signature','minimal'] as const).map(option=><button key={option} aria-pressed={design===option} disabled={busy} onClick={()=>setDesign(option)}><span className={`share-design-sample ${option}`} aria-hidden="true"><i>Velo</i><b>+12.8%</b></span><span>{option==='signature'?'Velo':'Clean'}{design===option&&<Check size={13}/>}</span></button>)}</div>
        {canUpdate&&<><label className="share-live-setting"><span><b>Keep this post live</b><small>Updates on Velo. Saved images stay fixed.</small></span><input type="checkbox" role="switch" aria-label="Keep this post live" checked={imageLive} disabled={busy} onChange={e=>setImageLive(e.target.checked)}/></label>{imageLive&&<label className="share-freeze-setting"><input type="checkbox" checked={freeze} disabled={busy} onChange={e=>setFreeze(e.target.checked)}/>Keep the captured PnL when the position closes</label>}</>}
      </div></details>}
      {onPost&&<SocialTextField className="share-studio-note" aria-label="Add a note" placeholder="Add a note…" rows={2} value={content} onValueChange={setContent} onSubmit={()=>void publish()} maxLength={2000} disabled={busy}/>}
      {error&&<p className="trade-share-feedback" role="alert">{error}</p>}{feedback&&<p className="trade-share-feedback" role="status">{feedback}</p>}
      <div className="share-studio-actions">{presentation==='pnl'&&<><button type="button" aria-label="Save image" title="Save image" disabled={busy} onClick={()=>void exportImage(false)}><Download size={17}/></button><button type="button" aria-label="Share image" title="Share image" disabled={busy} onClick={()=>void exportImage(true)}><Share2 size={17}/></button></>}{onPost&&<button className="share-studio-publish" disabled={busy||!content.trim()} onClick={()=>void publish()}><Send size={15}/>{busy?'Preparing…':'Post to Velo'}</button>}</div>
    </div>
  </Dialog>;
};
