import { AnimatedText } from './ui/AnimatedValue';
import React,{useEffect,useRef,useState} from 'react';
import { ChevronRight } from 'lucide-react';
import type { TradeShare } from '../utils/tradeShare';
import { PnlImage } from './PnlImage';
import { useSharedTrade } from './useSharedTrade';
import { PositionDetailsDialog } from './PositionDetailsDialog';
import { shareReturn } from '../utils/shareFormatting.mjs';
import { formatPrice,VeloAssetIcon } from './ui/shared';
import './TradeShareCard.css';
export { useSharedTrade,SharedMarkContext } from './useSharedTrade';

export function CompactPosition({ data, pending = false, onInspect }: { data: TradeShare; pending?: boolean; onInspect?: () => void }) {
  const open = data.status === 'OPEN';
  return <article className="shared-position" data-percent-only={!!data.hideAmounts} aria-label={`${data.pair} position attachment`}>
    {onInspect&&<button className="position-inspect-button" type="button" aria-label={`View ${data.pair} position details`} onClick={event=>{event.stopPropagation();onInspect();}}/>}
    <div className="shared-position-heading"><VeloAssetIcon src={`/tokens/${data.pair.split('/')[0].toLowerCase()}.png`} symbol={data.pair.split('/')[0]} size={26}/><strong>{data.pair}</strong><span className={data.side.toLowerCase()}>{data.side} · {data.leverage}×</span><small>{open ? (data.updateMode === 'snapshot' ? 'Snapshot' : 'Open') : data.status === 'LIQUIDATED' ? 'Liquidated' : 'Closed'}</small></div>
    <dl>{!data.hideAmounts&&<div><dt>Margin invested</dt><dd>${<AnimatedText text={data.collateral.toLocaleString(undefined,{maximumFractionDigits:2})}/>}</dd></div>}<div><dt>Entry</dt><dd>${<AnimatedText text={formatPrice(data.entryPrice)}/>}</dd></div><div><dt>{open?'Mark':'Exit'}</dt><dd>${<AnimatedText text={formatPrice((open?data.markPrice:data.closePrice)||data.entryPrice)}/>}</dd></div><div><dt>{data.closedSnapshot?'PnL snapshot':open?'Est. net PnL':'Realized PnL'}</dt><dd data-positive={data.pnl>=0}>{<AnimatedText text={data.hideAmounts?shareReturn(data.pnlPct):`${data.pnl>=0?'+':'−'}$${Math.abs(data.pnl).toFixed(2)}`}/>}</dd></div></dl>
    <footer><span>{pending?'Refreshing values':data.updateMode==='snapshot'?'Snapshot':open?'Live position':'Position settled'}</span>{onInspect&&<span className="position-view-details">View details<ChevronRight size={12}/></span>}</footer>
  </article>;
}
export function SharedPositionCard({ snapshot, imageUrl, onImageClick, expanded = false }: { snapshot: TradeShare; imageUrl?: string; onImageClick?: () => void; expanded?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [detailsOpen,setDetailsOpen]=useState(false);
  useEffect(()=>{
    if (!ref.current) return;
    if (!('IntersectionObserver' in window)) {setVisible(true);return;}
    const observer=new IntersectionObserver(entries=>setVisible(entries.some(entry=>entry.isIntersecting)),{rootMargin:'160px'});
    observer.observe(ref.current);return()=>observer.disconnect();
  },[]);
  const { data, pending } = useSharedTrade(snapshot, visible || detailsOpen);
  return <div ref={ref} className={snapshot.presentation === 'pnl' ? `shared-pnl-media${expanded ? ' is-expanded' : ''}` : undefined}>{snapshot.presentation === 'pnl' ? <>{onImageClick ? <button type="button" className="post-image-preview" aria-label={`Expand ${data.pair} PnL image`} onClick={onImageClick}><PnlImage data={data} imageUrl={imageUrl} active={visible} retryable={false}/><span className="post-image-expand-hint">View image ↗</span></button> : <PnlImage data={data} imageUrl={imageUrl} active={visible || expanded} quality={expanded ? 2 : 1.5}/>}{pending && <p className="trade-share-feedback">Refreshing · showing last known values</p>}</> : <CompactPosition data={data} pending={pending} onInspect={()=>setDetailsOpen(true)}/>}{detailsOpen&&<PositionDetailsDialog snapshot={{...data,hideAmounts:snapshot.hideAmounts,updatedAt:snapshot.updatedAt}} onClose={()=>setDetailsOpen(false)}/>}</div>;
}
