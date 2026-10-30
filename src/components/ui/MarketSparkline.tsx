import React, { useId, useMemo, useState } from 'react';
import { AnimatedText } from './AnimatedValue';

/** A compact chart of the actual history, with a nearest-point hover readout. */
export const MarketSparkline = React.memo(function MarketSparkline({values,positive}:{values:number[];positive:boolean}) {
  const id=useId().replace(/:/g,'');
  const [hovered,setHovered]=useState<number|null>(null);
  const data=useMemo(()=>values.filter(Number.isFinite),[values]);
  const geometry=useMemo(()=>{
    const min=Math.min(...data),range=Math.max(...data)-min||1;
    return data.map((value,index)=>({x:index/(data.length-1)*100,y:26-(value-min)/range*22,value}));
  },[data]);
  if(data.length<2)return <div className="velo-market-sparkline velo-market-sparkline--empty" aria-label="Price history unavailable"/>;
  const color=positive?'var(--pnl-up)':'var(--pnl-down)';
  const point=hovered!==null?geometry[Math.min(hovered,geometry.length-1)]:null;
  const points=geometry.map(p=>`${p.x},${p.y}`).join(' ');
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
      <polygon points={`0,30 ${points} 100,30`} fill={`url(#spark-${id})`}/>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>
      {point&&<><line x1={point.x} x2={point.x} y1={0} y2={30} stroke="currentColor" strokeWidth=".6" opacity=".3"/><circle cx={point.x} cy={point.y} r="2" fill="currentColor"/></>}
    </svg>
  </div>;
});
