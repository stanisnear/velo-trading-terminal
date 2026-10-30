import React, { useId, useMemo, useState } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react';
import type { TradeHistoryItem } from '../../utils/types';
import { AnimatedValue } from './AnimatedValue';
import { ContentDisclosure } from './ProductMotion';
import './PerformanceCalendar.css';

const key=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
/** Calendar intensity/selection pattern inspired by beUI Returns Calendar.
 * Velo shows actual daily settlement dollars, never a fabricated percentage return.
 * Days and settlement details use the same local timezone. */
export function PerformanceCalendar({trades,onInspect}:{trades:TradeHistoryItem[];onInspect:(trade:TradeHistoryItem)=>void}) {
  const [selectedMonth,setSelectedMonth]=useState(''),[selectedDay,setSelectedDay]=useState('');
  const selectionId=useId();
  const days=useMemo(()=>{
    const result=new Map<string,{date:Date;pnl:number;trades:TradeHistoryItem[]}>();
    for(const trade of trades){
      const date=new Date(trade.timestamp);
      if(!Number.isFinite(date.getTime())||!Number.isFinite(trade.pnl))continue;
      const id=key(date),day=result.get(id)||{date,pnl:0,trades:[]};
      day.pnl+=trade.pnl;day.trades.push(trade);result.set(id,day);
    }
    return result;
  },[trades]);
  const months=[...new Set([...days.keys()].map(day=>day.slice(0,7)))].sort();
  const month=months.includes(selectedMonth)?selectedMonth:months.at(-1);
  if(!month)return null;
  const index=months.indexOf(month),[year,m]=month.split('-').map(Number),first=new Date(year,m-1,1),count=new Date(year,m,0).getDate(),offset=(first.getDay()+6)%7;
  const values=[...days].filter(([id])=>id.startsWith(month));
  const maximum=Math.max(1,...values.map(([,day])=>Math.abs(day.pnl))),monthPnl=values.reduce((sum,[,day])=>sum+day.pnl,0);
  const selection=selectedDay.startsWith(month)?days.get(selectedDay):null;
  const navigate=(next:string)=>{setSelectedMonth(next);setSelectedDay('');};
  return <section className="performance-calendar" aria-label="Daily realized PnL">
    <header><div><h3>Settlement calendar</h3><small>Realized PnL · Your local time</small></div><span data-sign={Math.sign(monthPnl)}><AnimatedValue value={monthPnl}/></span></header>
    <div className="performance-calendar__nav"><button type="button" disabled={index===0} aria-label="Earlier settlement month" onClick={()=>navigate(months[index-1])}><ChevronLeft size={15}/></button><span aria-live="polite">{first.toLocaleDateString([],{month:'long',year:'numeric'})}</span><button type="button" disabled={index===months.length-1} aria-label="Later settlement month" onClick={()=>navigate(months[index+1])}><ChevronRight size={15}/></button></div>
    <div key={month} className="performance-calendar__grid">
      {Array.from({length:7},(_,i)=><span className="performance-calendar__weekday" key={`weekday${i}`}>{new Date(2026,1,2+i).toLocaleDateString([],{weekday:'short'})}</span>)}
      {Array.from({length:offset},(_,i)=><span key={`blank${i}`} aria-hidden="true"/>)}
      {Array.from({length:count},(_,i)=>{
        const date=new Date(year,m-1,i+1),id=key(date),day=days.get(id),dateLabel=date.toLocaleDateString([],{month:'long',day:'numeric',year:'numeric'});
        return <button type="button" key={id} disabled={!day} data-sign={day?Math.sign(day.pnl):undefined} aria-pressed={selectedDay===id} aria-controls={selectionId}
          aria-label={`${dateLabel}${day?`: ${new Intl.NumberFormat([],{style:'currency',currency:'USD',signDisplay:'always'}).format(day.pnl)}, ${day.trades.length} settlements`:': no settlements'}`}
          title={day?`${day.trades.length} settlements · ${new Intl.NumberFormat([],{style:'currency',currency:'USD'}).format(day.pnl)}`:undefined}
          style={{'--day-intensity':day?Math.max(.09,Math.abs(day.pnl)/maximum*.22):0} as React.CSSProperties} onClick={()=>setSelectedDay(previous=>previous===id?'':id)}>
          <span>{i+1}</span>{day&&<small><AnimatedValue value={day.pnl} digits={0}/></small>}
        </button>;
      })}
    </div>
    <ContentDisclosure open={!!selection} id={selectionId}>{selection&&<div className="performance-calendar__selection"><h4>{selection.date.toLocaleDateString([],{month:'short',day:'numeric'})} · {selection.trades.length} settlements</h4>{selection.trades.slice().reverse().map(trade=><button type="button" key={trade.id} onClick={()=>onInspect(trade)}><span>{trade.pair}<small>{new Date(trade.timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</small></span><b data-sign={Math.sign(trade.pnl)}><AnimatedValue value={trade.pnl}/></b><ArrowUpRight size={13}/></button>)}</div>}</ContentDisclosure>
    {!selection&&<p className="performance-calendar__hint">Select a trading day to inspect its settlements.</p>}
  </section>;
}
