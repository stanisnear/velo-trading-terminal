import React, { useEffect, useRef, useState } from 'react';
import { Download, Share2, Send } from 'lucide-react';
import { Dialog } from './ui/Dialog';
import { TradeShareCard } from './TradeShareCard';
import { useSharedTrade } from './SharedPositionCard';
import type { TradeShare } from '../utils/tradeShare';
import { hasPositionReference } from '../services/sharedPosition';
export type ShareCardData = TradeShare;

export async function renderTradePng(data: TradeShare, light: boolean, hideAmounts: boolean): Promise<Blob> {
  await Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 2000))]);
  const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 800;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Image export is unavailable.');
  const fg = light ? '#17231e' : '#edf1ee', muted = light ? '#66746c' : '#95a19a';
  const up = light ? '#357650' : '#94c5a5', down = light ? '#b34c4a' : '#e39390';
  ctx.fillStyle = light ? '#eaf0eb' : '#111514'; ctx.fillRect(0, 0, 1200, 800);
  const glow = ctx.createRadialGradient(1100, 0, 0, 1100, 0, 850);
  glow.addColorStop(0, light ? '#d5e1d8' : '#25372d'); glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, 1200, 800);
  const fonts = getComputedStyle(document.documentElement);
  const display = fonts.getPropertyValue('--font-display').trim() || 'Georgia';
  const mono = fonts.getPropertyValue('--font-mono').trim() || 'monospace';
  const sans = fonts.getPropertyValue('--font-sans').trim() || 'sans-serif';
  const text = (value: string, x: number, y: number, font: string, color = fg) => { ctx.fillStyle = color; ctx.font = font; ctx.fillText(value, x, y); };
  text('Velo', 64, 96, `italic 54px ${display}`);
  ctx.textAlign = 'right'; text('BASE SEPOLIA · TESTNET', 1136, 87, `18px ${mono}`, muted); ctx.textAlign = 'left';
  text(data.pair, 64, 207, `48px ${display}`);
  text(`${data.side}  ·  ${data.leverage}×`, 64, 249, `20px ${mono}`, data.side === 'LONG' ? up : down);
  text(data.status === 'OPEN' ? 'ESTIMATED PNL' : 'REALIZED PNL', 64, 326, `17px ${mono}`, muted);
  text(hideAmounts ? `${data.pnlPct >= 0 ? '+' : ''}${data.pnlPct.toFixed(2)}%` : `${data.pnl >= 0 ? '+' : '−'}$${Math.abs(data.pnl).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`, 60, 441, `100px ${display}`, data.pnl >= 0 ? up : down);
  if (!hideAmounts) text(`${data.pnlPct >= 0 ? '+' : ''}${data.pnlPct.toFixed(2)}% return on margin`, 64, 489, `23px ${sans}`, data.pnl >= 0 ? up : down);
  ctx.strokeStyle = light ? '#c6d3c9' : '#344239'; ctx.lineWidth = 1;
  for (const y of [536, 666]) { ctx.beginPath(); ctx.moveTo(64,y);ctx.lineTo(1136,y);ctx.stroke(); }
  const facts = [['ENTRY PRICE', data.entryPrice], [data.status === 'OPEN' ? 'MARK PRICE' : 'EXIT PRICE', (data.status === 'OPEN' ? data.markPrice : data.closePrice) || data.entryPrice], ...(!hideAmounts ? [['POSITION SIZE', data.size]] : [])];
  facts.forEach(([label, value], i) => { const x = 64 + i * 370; text(String(label), x, 580, `16px ${mono}`, muted); text(`$${Number(value).toLocaleString('en-US',{maximumFractionDigits:Number(value) < 1 ? 6 : 2})}`, x, 624, `27px ${mono}`); });
  text(data.status === 'OPEN' ? 'OPEN POSITION · SNAPSHOT' : data.status === 'LIQUIDATED' ? 'LIQUIDATED' : 'POSITION CLOSED', 64, 723, `17px ${mono}`, muted);
  ctx.textAlign = 'right'; text((data.traderHandle || 'velotrading.live').slice(0,35), 1136, 723, `20px ${sans}`, muted);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image export failed. Please retry.')), 'image/png'));
}

export const VeloShareCard = ({ isOpen, onClose, data: snapshot, onPost }: {
  isOpen: boolean; onClose: () => void; data: ShareCardData;
  onPost?: (content: string, data: TradeShare) => Promise<string | null>;
}) => {
  const { data, pending } = useSharedTrade(snapshot);
  const [content, setContent] = useState('');
  const [hideAmounts, setHideAmounts] = useState(false);
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
    const blob = await renderTradePng(data, document.documentElement.classList.contains('light'), hideAmounts);
    const file = new File([blob], `velo-${data.pair.replace('/','-')}-${data.status.toLowerCase()}.png`,{type:'image/png'});
    if (share && navigator.canShare?.({files:[file]}) && navigator.share) { await navigator.share({files:[file],title:`${data.pair} on Velo`});setFeedback('Shared.');return; }
    const url = URL.createObjectURL(blob), a = document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60_000);setFeedback('Image saved.');
  });
  return <Dialog open={isOpen} onClose={onClose} busy={busy} title="Share your trade" className="trade-share-dialog">
    <div className="trade-share-body"><TradeShareCard data={data} hideAmounts={hideAmounts} pending={pending}/>
      <div className="trade-share-options"><label><input type="checkbox" checked={hideAmounts} onChange={e=>setHideAmounts(e.target.checked)}/>Hide amounts in image</label><span>{pending ? 'Checking position…' : hasPositionReference(data) ? data.status === 'OPEN' ? 'Updates on Velo' : 'On-chain result' : 'Trade snapshot'}</span></div>
      {onPost && <div className="trade-share-composer"><label htmlFor="trade-share-caption">Add a note</label><textarea id="trade-share-caption" value={content} onChange={e=>setContent(e.target.value)} maxLength={2000} disabled={busy}/></div>}
      {onPost && <p className="trade-share-feedback">{data.status === 'OPEN' ? 'Your post links to this position. PnL and its final result update in the feed.' : 'Share this result with your followers.'} Position amounts are public on Velo.</p>}
      {error && <p className="trade-share-feedback" role="alert">{error}</p>}{feedback && <p className="trade-share-feedback" role="status">{feedback}</p>}
      <div className="trade-share-actions"><button disabled={busy} onClick={()=>void exportImage(false)}><Download size={15}/>Save image</button><button disabled={busy} onClick={()=>void exportImage(true)}><Share2 size={15}/>Share</button>{onPost && <button className="trade-share-publish" disabled={busy || !content.trim()} onClick={()=>void run(async()=>{const draft = publication.current?.content === content.trim() ? publication.current : {content:content.trim(),data};publication.current=draft;const id=await onPost(draft.content,draft.data);if(!id)throw new Error('Publication was not confirmed. Your draft is here; please retry.');onClose();})}><Send size={15}/>{busy ? 'Please wait…' : 'Post to Velo'}</button>}</div>
    </div>
  </Dialog>;
};
