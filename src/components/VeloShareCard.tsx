import React, { useEffect, useRef, useState } from 'react';
import { Download, Share2, Send } from 'lucide-react';
import { Dialog } from './ui/Dialog';
import { PnlImage } from './PnlImage';
import { renderTradePng } from '../utils/tradeImage';
export { renderTradePng } from '../utils/tradeImage';
import './TradeShareCard.css';
import { useSharedTrade, CompactPosition } from './SharedPositionCard';
import type { TradeShare } from '../utils/tradeShare';
import { hasPositionReference } from '../services/sharedPosition';
export type ShareCardData = TradeShare;

export const VeloShareCard = ({ isOpen, onClose, data: snapshot, onPost }: {
  isOpen: boolean; onClose: () => void; data: ShareCardData;
  onPost?: (content: string, data: TradeShare, image?: Blob) => Promise<string | null>;
}) => {
  const [presentation, setPresentation] = useState<'position' | 'pnl'>('pnl');
  const [updateMode, setUpdateMode] = useState<'live' | 'snapshot'>('snapshot');
  const [cardTheme, setCardTheme] = useState<'light' | 'dark'>(() => document.documentElement.classList.contains('light') ? 'light' : 'dark');
  const [design, setDesign] = useState<'editorial' | 'ledger' | 'aurora'>('editorial');
  const [onClosed, setOnClosed] = useState<'settle' | 'freeze'>('settle');
  const { data: latest, pending } = useSharedTrade({ ...snapshot, updateMode });
  const [content, setContent] = useState('');
  const [hideAmounts, setHideAmounts] = useState(false);
  const capturedAt = useRef(snapshot.updatedAt || Date.now()).current;
  const data: TradeShare = { ...latest, presentation, updateMode, theme: cardTheme, design, onClose: presentation === 'position' ? 'settle' : onClosed, hideAmounts, updatedAt: latest.updatedAt || capturedAt };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const lock = useRef(false);
  const publication = useRef<{content:string;data:TradeShare}|null>(null);
  useEffect(() => { setContent(`${snapshot.status === 'OPEN' ? 'Following my' : 'Closed my'} ${snapshot.side.toLowerCase()} on $${snapshot.pair.split('/')[0]}.`); setError('');setFeedback(''); }, [snapshot.tradeId, snapshot.status, snapshot.pair]);
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return; lock.current = true;setBusy(true);setError('');setFeedback('');
    try { await action(); } catch (e) { if ((e as DOMException).name !== 'AbortError') setError(e instanceof Error ? e.message : 'Please retry. Your draft is kept.'); }
    finally { lock.current = false;setBusy(false); }
  };
  const exportImage = async (share: boolean) => run(async () => {
    const blob = await renderTradePng({...data,updateMode:'snapshot'}, cardTheme === 'light', hideAmounts);
    const file = new File([blob], `velo-${data.pair.replace('/','-')}-${data.status.toLowerCase()}.png`,{type:'image/png'});
    if (share && navigator.canShare?.({files:[file]}) && navigator.share) { await navigator.share({files:[file],title:`${data.pair} on Velo`});setFeedback('Shared.');return; }
    const url = URL.createObjectURL(blob), a = document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60_000);setFeedback('Image saved.');
  });
  return <Dialog open={isOpen} onClose={onClose} busy={busy} title="Share trade" className="trade-share-dialog">
    <div className="trade-share-body">
      <div className="share-format" role="group" aria-label="Share format"><button disabled={busy} aria-pressed={presentation === 'position'} onClick={()=>{setPresentation('position');setUpdateMode(snapshot.status === 'OPEN' && hasPositionReference(snapshot) ? 'live' : 'snapshot');}}>Position attachment</button><button disabled={busy} aria-pressed={presentation === 'pnl'} onClick={()=>setPresentation('pnl')}>PnL image</button></div>
      <div className="share-customize">
        {presentation === 'pnl' && <><label>Design<select aria-label="Card design" disabled={busy} value={design} onChange={e=>setDesign(e.target.value as typeof design)}><option value="editorial">Editorial</option><option value="ledger">Ledger</option><option value="aurora">Aurora</option></select></label>
        <label>Appearance<select aria-label="Card appearance" disabled={busy} value={cardTheme} onChange={e=>setCardTheme(e.target.value as typeof cardTheme)}><option value="light">Light</option><option value="dark">Dark</option></select></label></>}
        <label>Post updates<select aria-label="Post updates" disabled={busy || snapshot.status !== 'OPEN' || !hasPositionReference(snapshot)} value={updateMode} onChange={e=>setUpdateMode(e.target.value as typeof updateMode)}><option value="snapshot">Snapshot</option><option value="live">Live on Velo</option></select></label>
      </div>
      {presentation === 'pnl' ? <PnlImage data={data}/> : <CompactPosition data={data} pending={pending}/>}
      {updateMode === 'live' && presentation === 'pnl' && <label className="share-on-close">When this position closes<select aria-label="When position closes" disabled={busy} value={onClosed} onChange={e=>setOnClosed(e.target.value as typeof onClosed)}><option value="settle">Show final realized PnL</option><option value="freeze">Keep this PnL snapshot</option></select></label>}
      <div className="trade-share-options"><label><input type="checkbox" checked={hideAmounts} onChange={e=>setHideAmounts(e.target.checked)}/>Show return % only</label><span>{pending ? 'Refreshing position…' : updateMode === 'live' ? 'Live on Velo' : 'Fixed snapshot'}</span></div>
      {onPost && <div className="trade-share-composer"><label htmlFor="trade-share-caption">Add a note</label><textarea id="trade-share-caption" value={content} onChange={e=>setContent(e.target.value)} maxLength={2000} disabled={busy}/></div>}
      {onPost && <p className="trade-share-feedback">{presentation === 'position' ? 'A compact position appears with your note. Live attachments show final settlement when the position closes.' : updateMode === 'live' ? 'The image in your Velo post updates with this position. Saved and externally shared images are fixed snapshots.' : 'This image stays exactly as captured, including in your Velo post.'}</p>}
      {error && <p className="trade-share-feedback" role="alert">{error}</p>}{feedback && <p className="trade-share-feedback" role="status">{feedback}</p>}
      <div className="trade-share-actions">{presentation === 'pnl' && <><button disabled={busy} onClick={()=>void exportImage(false)}><Download size={15}/>Save image</button><button disabled={busy} onClick={()=>void exportImage(true)}><Share2 size={15}/>Share</button></>}{onPost && <button className="trade-share-publish" disabled={busy || !content.trim()} onClick={()=>void run(async()=>{const draft = publication.current?.content === content.trim() && publication.current.data.presentation === presentation && publication.current.data.design === design && publication.current.data.theme === cardTheme && publication.current.data.updateMode === updateMode && publication.current.data.onClose === data.onClose && publication.current.data.hideAmounts === hideAmounts ? publication.current : {content:content.trim(),data};publication.current=draft;const id=await onPost(draft.content,draft.data,draft.data.presentation === 'pnl' ? await renderTradePng(draft.data,draft.data.theme === 'light',!!draft.data.hideAmounts) : undefined);if(!id)throw new Error('Publication was not confirmed. Your draft is here; please retry.');onClose();})}><Send size={15}/>{busy ? 'Please wait…' : 'Post to Velo'}</button>}</div>
    </div>
  </Dialog>;
};
