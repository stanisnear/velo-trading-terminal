import { AnimatedText } from './ui/AnimatedValue';
import React,{useEffect,useState} from 'react';
import { ArrowUpRight, Copy, Check, ShieldCheck, Clock3 } from 'lucide-react';
import { Dialog } from './ui/Dialog';
import { useSharedTrade } from './useSharedTrade';
import { readPositionEvidence,hasPositionReference,SHARED_ENGINE,type PositionEvidence } from '../services/sharedPosition';
import { shareDate,shareReturn } from '../utils/shareFormatting.mjs';
import { formatPrice } from './ui/shared';
import type { TradeShare } from '../utils/tradeShare';
export function PositionDetailsDialog({snapshot,onClose}:{snapshot:TradeShare;onClose:()=>void}) {
  const {data:canonical,pending,verified,failed,retry,liveMark}=useSharedTrade({...snapshot,updateMode:'live',onClose:'settle'});
  const [evidence,setEvidence]=useState<PositionEvidence>({}),[checking,setChecking]=useState(true),[copied,setCopied]=useState('');
  const data={...canonical,...evidence.opening};
  useEffect(()=>{let active=true;setEvidence({});setChecking(true);void readPositionEvidence(canonical).then(value=>{if(active)setEvidence(value);}).catch(()=>{}).finally(()=>{if(active)setChecking(false);});return()=>{active=false;};},[canonical.contract,canonical.tradeId,canonical.trader,canonical.openTxHash,canonical.txHash,canonical.status,canonical.openedAt]);
  const open=data.status==='OPEN',amounts=!snapshot.hideAmounts;
  const money=(value:number)=>`$${value.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const copy=async(hash:string)=>{try{await navigator.clipboard.writeText(hash);setCopied(hash);}catch{setCopied('Copy unavailable');}};
  const receipt=(label:string,hash:string|undefined)=><div className="position-receipt"><span>{label}</span>{hash?<div><a href={`https://sepolia.basescan.org/tx/${hash}`} target="_blank" rel="noopener noreferrer">{hash}<ArrowUpRight size={14}/></a><button type="button" aria-label={`Copy ${label.toLowerCase()}`} onClick={()=>void copy(hash)}>{copied===hash?<Check size={14}/>:<Copy size={14}/>}</button></div>:<small>{checking?'Finding receipt…':'Receipt not available'}</small>}</div>;
  return <Dialog open onClose={onClose} title="Position details" className="position-details-dialog"><div className="position-details-body">
    <div className="position-details-market"><div><h3>{data.pair}</h3><span>{data.side} · {data.leverage}× · Isolated</span></div><span className={`position-details-state ${open?'is-open':''}`}>{open?'Open':data.status==='LIQUIDATED'?'Liquidated':'Closed'}</span></div>
    <div className="position-details-result" data-positive={data.pnl>=0}><span>{verified ? (open?liveMark?'Estimated net PnL':'PnL at shared mark':'Realized PnL'):'Shared PnL'}</span><strong>{<AnimatedText text={amounts?`${data.pnl>=0?'+':'−'}${money(Math.abs(data.pnl))}`:shareReturn(data.pnlPct)}/>}</strong>{amounts&&<small>{<AnimatedText text={shareReturn(data.pnlPct)}/>} return on margin</small>}</div>
    <dl className="position-details-facts">{amounts&&<><div><dt>Margin invested</dt><dd>{money(data.collateral)}</dd></div><div><dt>{!open&&!evidence.opening?'Shared position size':'Position size'}</dt><dd>{money(data.size)}</dd></div></>}<div><dt>{!open&&!evidence.opening?'Shared entry price':'Entry price'}</dt><dd>${<AnimatedText text={formatPrice(data.entryPrice)}/>}</dd></div><div><dt>{open?liveMark?'Mark price':'Shared mark price':'Exit price'}</dt><dd>${<AnimatedText text={formatPrice((open?data.markPrice:data.closePrice)||data.entryPrice)}/>}</dd></div></dl>
    <div className="position-details-timeline"><Clock3 size={15}/><dl><div><dt>{evidence.openedAt || verified&&open?'Opened':'Reported open time'}</dt><dd>{shareDate(evidence.openedAt || data.openedAt)}</dd></div>{!open&&<div><dt>{evidence.closedAt?'Closed':'Reported close time'}</dt><dd>{shareDate(evidence.closedAt || snapshot.closedAt)}</dd></div>}<div><dt>Shared snapshot</dt><dd>{shareDate(snapshot.updatedAt)}</dd></div></dl></div>
    <div className="position-details-evidence"><h4><ShieldCheck size={15}/>{verified ? pending?'Refresh delayed · Last verified values':open?'V4 position verified':evidence.opening?'V4 trade verified':'Settlement verified' : hasPositionReference(snapshot)?failed?'Position check unavailable':'Checking V4 position…':'Unlinked snapshot'}<small>Base Sepolia</small></h4>
      {data.tradeId&&<div className="position-details-id"><span>Position ID</span><b>#{data.tradeId}</b></div>}
      {receipt('Opening transaction',evidence.openTxHash)}{!open&&receipt('Settlement transaction',evidence.closeTxHash)}
      {hasPositionReference(snapshot)&&<a className="position-details-engine" href={`https://sepolia.basescan.org/address/${SHARED_ENGINE}#code`} target="_blank" rel="noopener noreferrer">Trading engine <span>0xE9AE…B52f <ArrowUpRight size={13}/></span></a>}
    </div>
    {failed&&<button type="button" className="position-details-retry" onClick={retry}>Refresh position details</button>}
    {!amounts&&<p className="position-details-note">The author chose to show percentage returns in this post.</p>}
    {snapshot.updateMode==='snapshot'&&<p className="position-details-note">The post is a fixed snapshot. These details check the current position on-chain.</p>}
    <span className="sr-only" role="status">{copied ? copied==='Copy unavailable'?copied:'Transaction ID copied':''}</span>
  </div></Dialog>;
}
