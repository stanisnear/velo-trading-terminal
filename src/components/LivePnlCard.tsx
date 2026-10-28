import React from 'react';
import { AnimatedText } from './ui/AnimatedValue';
import { isWalletPlaceholder } from '../utils/profileIdentity.mjs';
import { shareReturn } from '../utils/shareFormatting.mjs';
import type { TradeShare } from '../utils/tradeShare';
import './LivePnlCard.css';

/** The live presentation keeps its DOM and rolling glyphs mounted between quotes.
 * Static exports still use the same Clean composition in tradeImage.ts. */
export function LivePnlCard({data,animated=true}:{data:TradeShare;animated?:boolean}) {
  const open=data.status==='OPEN',hidden=!!data.hideAmounts;
  const money=(value:number)=>`$${value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:value>0&&value<1?6:2})}`;
  const result=hidden?shareReturn(data.pnlPct):`${data.pnl>=0?'+':'−'}${money(Math.abs(data.pnl))}`;
  const handle=(isWalletPlaceholder(data.traderHandle)?'@trader':data.traderHandle||'velotrading.live').slice(0,35);
  const facts=[...(!hidden?[['Margin invested',money(data.collateral)]]:[]),['Entry price',money(data.entryPrice)],[data.closedSnapshot?'Captured mark':open?'Mark price':'Exit price',money((data.closedSnapshot||open?data.markPrice:data.closePrice)||data.entryPrice)]];
  const number=(text:string)=>animated?<AnimatedText text={text}/>:text;
  return <div className="pnl-image pnl-live-card" data-theme={data.theme==='light'?'light':'dark'} data-positive={data.pnl>=0} data-live={animated&&open} aria-label={`${data.pair} ${data.side.toLowerCase()} · ${open?'Open position':'Position closed'} · ${hidden?'Return on margin':open?'Unrealized PnL':'Realized PnL'}`}>
    <div className="pnl-live-brand">Velo</div><div className="pnl-live-network">BASE SEPOLIA / TESTNET</div>
    <div className="pnl-live-market">{data.pair}</div><div className="pnl-live-side">{data.side} · {data.leverage}× · {open?'Open':data.status==='LIQUIDATED'?'Liquidated':'Closed'}</div>
    <div className="pnl-live-label">{hidden?(data.closedSnapshot?'Captured return':'Return on margin'):data.closedSnapshot?'Captured return':open?'Unrealized PnL':'Realized PnL'}</div>
    <div className="pnl-live-result" style={{fontSize:`${Math.min(9.333,150/Math.max(1,result.length))}cqw`}}>{number(result)}</div>{!hidden&&<div className="pnl-live-return">{number(shareReturn(data.pnlPct))} return on margin</div>}
    <dl className="pnl-live-facts">{facts.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{number(value)}</dd></div>)}</dl>
    <footer className="pnl-live-footer"><span>{data.closedSnapshot?'Closed · PnL snapshot':open?animated?'Live position':'Position snapshot':'Position settled'}{animated&&open&&<i aria-hidden="true"/>}</span><span>{handle}</span></footer>
  </div>;
}
