import React from 'react';
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react';
import { RefreshCw } from 'lucide-react';
import './ChartHistoryState.css';

const candles=[62,73,66,48,53,39,44,58,41,35,45,26,32,18,31,40,24,17,28,12];

function HistoryPanel({loading,onRetry}:{loading:boolean;onRetry?:()=>void}) {
  const present=useIsPresent(),reduced=useReducedMotion();
  return <motion.div className="chart-history-panel" inert={!present} aria-hidden={!present}
    initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
    transition={{duration:reduced?0:.16}}>
    {loading&&<div className="chart-history-placeholder" aria-hidden="true">
      <svg viewBox="0 0 400 120" preserveAspectRatio="none">
        {candles.map((y,index)=><g key={index}>
          <path d={`M${index*20+10},${y-10}V${y+34}`} fill="none" stroke="currentColor"/>
          <rect x={index*20+6} y={y} width="8" height={index%3===0?24:16} rx="1" fill="currentColor"/>
        </g>)}
      </svg><i/>
    </div>}
    <div className="chart-history-message">
      {loading?<><span className="chart-history-spinner"><RefreshCw size={14}/></span><span>Loading historical candles</span></>:
        <><span>Market history is temporarily unavailable</span><button className="chart-history-retry" type="button" onClick={onRetry}><RefreshCw size={13}/>Retry</button></>}
    </div>
  </motion.div>;
}

/** Shown only before usable history arrives; live candles remain unobstructed. */
export function ChartHistoryState({visible,status,onRetry}:{visible:boolean;status:'loading'|'ready'|'unavailable';onRetry?:()=>void}) {
  return <div className="chart-history-announcement" role="status" aria-live="polite">
    <AnimatePresence initial={false}>{visible&&<HistoryPanel key={status==='loading'?'loading':'unavailable'} loading={status==='loading'} onRetry={onRetry}/>}</AnimatePresence>
  </div>;
}
