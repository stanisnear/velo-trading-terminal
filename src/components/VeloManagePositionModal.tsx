import React, { useEffect, useRef, useState } from 'react';
import { positionPnl } from '@/services/positionValuation.mjs';
import { CheckCircle2, ExternalLink, Loader2, XCircle } from 'lucide-react';
import { Dialog } from './ui/Dialog';
import { baseScanTxUrl } from '@/services/veloPerpsService';
import type { Position } from '@/utils/types';

type Result = { txHash:`0x${string}`; explorerUrl:string };
interface Actions {
  addMargin?: (id:bigint, amount:number) => Promise<Result>;
  reduceMargin?: (id:bigint, amount:number, pair:string) => Promise<Result>;
  partialClose: (id:bigint, fraction:number, pair:string) => Promise<Result>;
  setTriggers: (id:bigint, tp:number, sl:number) => Promise<Result>;
}
interface Props {
  isOpen:boolean; onClose:()=>void; position:Position|null; currentPrice:number;
  userBalance?:number; actions:Actions; initialTab?:'ADD'|'REDUCE'|'PARTIAL'|'TRIGGERS';
}
export function VeloManagePositionModal({isOpen,onClose,position,currentPrice,actions,initialTab}:Props) {
  const [tab,setTab]=useState<'CLOSE'|'TRIGGERS'>('CLOSE');
  const [tp,setTp]=useState(''),[sl,setSl]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [hash,setHash]=useState<`0x${string}`|null>(null),[success,setSuccess]=useState(false);
  const lock=useRef(false);
  useEffect(()=>{
    if(!isOpen)return;
    setTab(initialTab==='TRIGGERS'?'TRIGGERS':'CLOSE');
    setTp(position?.takeProfit?String(position.takeProfit):'');
    setSl(position?.stopLoss?String(position.stopLoss):'');
    setError('');setHash(null);setSuccess(false);
  },[isOpen,position?.id,initialTab]);
  if(!position)return null;
  const p=position;
  const amount=(value:string)=>{
    if(!value.trim())return 0;
    const number=Number(value);
    if(!Number.isFinite(number)||number<=0)throw new Error('Enter a valid positive price, or leave the field empty.');
    return number;
  };
  const submit=async()=>{
    if(lock.current||hash)return;
    lock.current=true;setBusy(true);setError('');
    try {
      if(!p.onChainTradeId)throw new Error('Position has no confirmed trade ID.');
      const id=BigInt(p.onChainTradeId);
      let result:Result;
      if(tab==='CLOSE')result=await actions.partialClose(id,10000,p.pair);
      else {
        const takeProfit=amount(tp),stopLoss=amount(sl);
        if((takeProfit && (p.side==='LONG'?takeProfit<=p.entryPrice:takeProfit>=p.entryPrice))||
           (stopLoss && (p.side==='LONG'?stopLoss>=p.entryPrice:stopLoss<=p.entryPrice)))throw new Error('TP and SL must be on the correct side of the entry price.');
        result=await actions.setTriggers(id,takeProfit,stopLoss);
      }
      setHash(result.txHash);setSuccess(true);
    } catch(e:unknown) {
      const failure=e as {message?:string;txHash?:`0x${string}`};
      if(failure.txHash)setHash(failure.txHash);
      setError(failure.message||'The action was not confirmed.');
    } finally {lock.current=false;setBusy(false);}
  };
  const pnl=positionPnl(p,currentPrice);
  const field:React.CSSProperties={width:'100%',padding:'11px 12px',border:'1px solid var(--hairline-strong)',borderRadius:8,background:'var(--chip-bg)',color:'var(--fg)',fontFamily:'var(--font-sans)',fontVariantNumeric:'tabular-nums'};
  return <Dialog open={isOpen} onClose={onClose} title={p.pair+' · '+p.side} busy={busy}>
    <div style={{padding:20,display:'grid',gap:20,fontFamily:'var(--font-sans)'}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:12}}>
        {[['Entry',p.entryPrice],['Mark',currentPrice],['Leverage',p.leverage]].map(([label,value])=><div key={label}>
          <div style={{fontSize:12,color:'var(--fg-muted)',marginBottom:5}}>{label}</div>
          <strong style={{fontSize:16,fontVariantNumeric:'tabular-nums'}}>{label==='Leverage'?value+'x':Number(value).toLocaleString(undefined,{style:'currency',currency:'USD',maximumFractionDigits:4})}</strong>
        </div>)}
      </div>
      {success?<div role="status" style={{display:'grid',justifyItems:'center',gap:12,padding:'20px 0'}}>
        <CheckCircle2 size={32} color="var(--pnl-up)"/><strong>{tab==='CLOSE'?'Position closed':'TP/SL updated'}</strong>
      </div>:<>
        <div role="tablist" aria-label="Position action" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          {(['CLOSE','TRIGGERS'] as const).map(mode=><button key={mode} role="tab" aria-selected={tab===mode} disabled={busy||!!hash} onClick={()=>{setTab(mode);setError('');}} style={{...field,cursor:'pointer',background:tab===mode?'var(--glass-bg-strong)':'var(--chip-bg)',borderColor:tab===mode?'var(--accent)':'var(--hairline)'}}>{mode==='CLOSE'?'Close position':'Take profit / Stop loss'}</button>)}
        </div>
        {tab==='CLOSE'?<div style={{display:'grid',gap:12}}>
          <div style={{display:'flex',justifyContent:'space-between'}}><span>Position size</span><strong>{p.size.toLocaleString(undefined,{style:'currency',currency:'USD'})}</strong></div>
          <div style={{display:'flex',justifyContent:'space-between'}}><span>{p.v4?'Est. net PnL':'Est. PnL before fees'}</span><strong style={{color:pnl>=0?'var(--pnl-up)':'var(--pnl-down)'}}>{pnl.toLocaleString(undefined,{style:'currency',currency:'USD'})}</strong></div>
        </div>:<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          <label style={{display:'grid',gap:8,fontSize:13}}>Take profit<input type="number" min="0" step="any" value={tp} disabled={busy||!!hash} onChange={e=>setTp(e.target.value)} placeholder="Not set" style={field}/></label>
          <label style={{display:'grid',gap:8,fontSize:13}}>Stop loss<input type="number" min="0" step="any" value={sl} disabled={busy||!!hash} onChange={e=>setSl(e.target.value)} placeholder="Not set" style={field}/></label>
        </div>}
      </>}
      {error&&<div role="alert" style={{color:'var(--pnl-down)',fontSize:13,lineHeight:1.5}}>{error}</div>}
      {hash&&<a href={baseScanTxUrl(hash)} target="_blank" rel="noopener noreferrer" style={{display:'inline-flex',alignItems:'center',gap:8,color:'var(--accent)',fontSize:13}}><ExternalLink size={15}/>{success?'View confirmed transaction':'Check pending transaction'}</a>}
      {success?<button onClick={onClose} style={field}>Done</button>:<button disabled={busy||!!hash} onClick={()=>void submit()} style={{...field,display:'flex',alignItems:'center',justifyContent:'center',gap:8,fontWeight:600,cursor:busy?'wait':'pointer',color:tab==='CLOSE'?'var(--pnl-down)':'var(--fg)'}}>
        {busy?<Loader2 size={17} className="animate-spin"/>:tab==='CLOSE'?<XCircle size={17}/>:null}
        {busy?'Waiting for confirmation':tab==='CLOSE'?'Close entire position':'Save TP/SL'}
      </button>}
    </div>
  </Dialog>;
}
