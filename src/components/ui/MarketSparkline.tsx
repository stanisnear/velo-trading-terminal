import React, { useId, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { AnimatedText } from './AnimatedValue';

/** A compact chart of the actual history, with a nearest-point hover readout. */
export const MarketSparkline = React.memo(function MarketSparkline({values,positive}:{values:number[];positive:boolean}) {
  const id=useId().replace(/:/g,'');
  const [hovered,setHovered]=useState<number|null>(null);
  const reduced=useReducedMotion();
  const data=useMemo(()=>values.filter(Number.isFinite),[values]);
  const geometry=useMemo(()=>{
    const min=Math.min(...data),range=Math.max(...data)-min||1;
    return data.map((value,index)=>({x:index/(data.length-1)*100,y:26-(value-min)/range*22,value}));
  },[data]);
  if(data.length<2)return <div className="velo-market-sparkline velo-market-sparkline--empty" aria-label="Price history unavailable"/>;
  const color=positive?'var(--pnl-up)':'var(--pnl-down)';
  const point=hovered!==null?geometry[Math.min(hovered,geometry.length-1)]:null;
  // Keep every recorded point. A different sample count starts a new path;
  // matching paths can interpolate without resampling or inventing history.
  const line=geometry.map((p,index)=>`${index?'L':'M'}${p.x},${p.y}`).join(' ');
  const area=`${line} L100,30 L0,30 Z`;
  const transition={duration:reduced?0:.28,ease:'easeOut' as const};
  return <div className="velo-market-sparkline" style={{color}}
    onPointerMove={event=>{
      if(event.pointerType==='touch')return;
      const rect=event.currentTarget.getBoundingClientRect();
      const index=Math.round(Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width))*(data.length-1));
      setHovered(previous=>previous===index?previous:index);
    }} onPointerLeave={()=>setHovered(null)}>
    {point&&<span className="velo-market-sparkline__readout"><AnimatedText text={point.value.toLocaleString(undefined,{style:'currency',currency:'USD',maximumFractionDigits:point.value<1?6:2})}/></span>}
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" role="img" aria-label="24-hour reference price trend">
      <defs><linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="currentColor" stopOpacity=".1"/><stop offset="1" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs>
      <motion.path key={`area-${data.length}`} initial={false} animate={{d:area}} transition={transition} fill={`url(#spark-${id})`}/>
      <motion.path key={`line-${data.length}`} initial={false} animate={{d:line}} transition={transition} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>
      {point&&<><line x1={point.x} x2={point.x} y1={0} y2={30} stroke="currentColor" strokeWidth=".6" opacity=".3"/><circle cx={point.x} cy={point.y} r="2" fill="currentColor"/></>}
    </svg>
  </div>;
});
