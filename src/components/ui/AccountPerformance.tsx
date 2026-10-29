import React, { useMemo, useState } from 'react';
import { ArrowUpRight, Star } from 'lucide-react';
import { accountPerformance, performancePeriods } from '../../services/accountPerformance.mjs';
import type { TradeHistoryItem } from '../../utils/types';
import { PortfolioChart } from '../PortfolioChart';
import { AnimatedValue } from './AnimatedValue';
import { TradingDialog } from './TradingDialog';
import { SegmentedControl } from './SegmentedControl';
import './AccountPerformance.css';
import { PerformanceCalendar } from './PerformanceCalendar';

export function AccountPerformance({history,theme,onInspect}:{history:TradeHistoryItem[];theme:'light'|'dark';onInspect:(trade:TradeHistoryItem)=>void}) {
  const [open,setOpen]=useState(false),[period,setPeriod]=useState('ALL');
  const total=useMemo(()=>accountPerformance(history),[history]);
  const result=useMemo(()=>accountPerformance(history,period),[history,period]);
  const maximum=Math.max(1,...result.markets.map(m=>Math.abs(m.pnl)));
  return <>
    <button type="button" className="account-performance-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)}>
      <span className="account-performance-heading"><Star size={15}/><strong>Performance</strong><small>{total.totalTrades} settled</small><ArrowUpRight size={14}/></span>
      <span className="account-performance-summary">
        <span>Realized PnL<strong data-positive={total.realizedPnl>=0}><AnimatedValue value={total.realizedPnl}/></strong></span>
        <span>Win rate<strong>{total.totalTrades?<><AnimatedValue value={total.winRate} digits={1} currency={false}/>%</>:'—'}</strong></span>
      </span>
      <span className="account-performance-track" aria-hidden="true"><i style={{width:`${total.winRate}%`}}/></span>
      <span className="account-performance-caption">View analysis <ArrowUpRight size={12}/></span>
    </button>
    <TradingDialog open={open} onClose={()=>setOpen(false)} title="Your performance" className="account-performance-dialog"
      identity={<span>Account trade history · All recorded settlements</span>}
      footer={<button type="button" onClick={()=>setOpen(false)}>Done</button>}>
      <div className="account-performance-controls"><SegmentedControl label="Performance period" compact value={period} onChange={setPeriod} options={performancePeriods.map(value=>({value,label:value==='ALL'?'All time':value}))}/></div>
      <div className="account-performance-result" data-positive={result.realizedPnl>=0}><span>Realized trading PnL</span><strong><AnimatedValue value={result.realizedPnl}/></strong><small>{result.totalTrades} settlements in this period</small></div>
      <div className="account-performance-chart"><PortfolioChart dateOnly={period !== '1D'} baseline={0} data={result.points} theme={theme} label="Cumulative realized PnL" emptyLabel="No settlements in this period."/></div>
      <div className="account-performance-metrics">
        <div><span>Win rate</span><strong>{result.totalTrades?<><AnimatedValue value={result.winRate} currency={false} digits={1}/>%</>:'—'}</strong><small>{result.wins} wins · {result.losses} losses · {result.breakeven} flat</small></div>
        <div><span>Profit factor</span><strong>{result.profitFactor===null?'—':<AnimatedValue value={result.profitFactor} currency={false} digits={2}/>}</strong><small>Gross profits / gross losses</small></div>
        <div><span>Average result</span><strong>{result.totalTrades?<AnimatedValue value={result.average}/>:'—'}</strong><small>Per settlement</small></div>
        <div><span>Largest PnL drawdown</span><strong>{result.totalTrades?<AnimatedValue value={result.drawdown}/>:'—'}</strong><small>From a realized PnL peak</small></div>
      </div>
      {result.trades.length>0&&<PerformanceCalendar trades={result.trades} onInspect={trade=>{setOpen(false);onInspect(trade);}}/>}
      {result.markets.length>0&&<section className="account-performance-markets"><h3>Market results</h3>{result.markets.map(m=><div key={m.pair} data-positive={m.pnl>=0}>
        <span><strong>{m.pair}</strong><small>{m.count} settled</small><b><AnimatedValue value={m.pnl}/></b></span>
        <span className="account-performance-market-track" aria-hidden="true"><i style={{width:`${Math.abs(m.pnl)/maximum*100}%`}}/></span>
      </div>)}</section>}
      {result.trades.length>0&&<section className="account-performance-recent"><h3>Recent settlements</h3>{result.trades.slice(-6).reverse().map(trade=><button type="button" key={trade.id} onClick={()=>{setOpen(false);onInspect(trade);}}>
        <span><strong>{trade.pair} <small>{trade.side==='LONG'?'Long':'Short'}</small></strong><time dateTime={new Date(trade.timestamp).toISOString()}>{new Date(trade.timestamp).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</time></span>
        <b data-positive={trade.pnl>=0}><AnimatedValue value={trade.pnl}/></b><ArrowUpRight size={14}/>
      </button>)}</section>}
      <p className="account-performance-note">Includes recorded closes and liquidations across your account history. Partial closes count as separate settlements. Open-position PnL and transfers are excluded; stored results are used without adding estimated fees.</p>
    </TradingDialog>
  </>;
}
