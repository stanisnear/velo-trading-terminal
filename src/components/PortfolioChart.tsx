import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createChart, ColorType, AreaSeries, CrosshairMode, TickMarkType, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import { AnimatedValue } from './ui/AnimatedValue';
import type { EquityObservation } from '../hooks/useEquityHistory';
import './PortfolioChart.css';

type Point = { time:UTCTimestamp; value:number };
export function PortfolioChart({ data, theme, loading=false, label='Account equity', negative=false, dateOnly=false, emptyLabel='No equity observations in this period.' }:{data:EquityObservation[];theme:'light'|'dark';loading?:boolean;negative?:boolean;dateOnly?:boolean;label?:string;emptyLabel?:string}) {
  const container = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi|null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'>|null>(null);
  const pointsRef = useRef<Point[]>([]);
  const [inspected,setInspected] = useState<Point|null>(null);
  const points = useMemo<Point[]>(()=>[...new Map(data.filter(p=>Number.isFinite(p.timestamp)&&Number.isFinite(p.value)).map(p=>[Math.floor(p.timestamp/1000),p])).values()].sort((a,b)=>a.timestamp-b.timestamp).map(p=>({time:Math.floor(p.timestamp/1000) as UTCTimestamp,value:p.value})),[data]);
  useEffect(()=>{
    if (!container.current) return;
    let disposed=false;
    const css=getComputedStyle(document.documentElement);
    const accent=css.getPropertyValue(negative?'--pnl-down':'--accent').trim()||(negative?'#cf7773':theme==='dark'?'#91b99f':'#557a62');
    const chart=createChart(container.current,{
      width:container.current.clientWidth||300,height:container.current.clientHeight||200,
      layout:{background:{type:ColorType.Solid,color:'transparent'},textColor:css.getPropertyValue('--fg-muted').trim()||'#8b9c91',fontFamily:css.getPropertyValue('--font-sans').trim()||'Switzer, sans-serif',fontSize:10},
      grid:{vertLines:{visible:false},horzLines:{visible:false}},
      timeScale:{visible:true,timeVisible:!dateOnly,secondsVisible:false,borderVisible:false,rightOffset:1,tickMarkFormatter:(time,type)=>new Date(Number(time)*1000).toLocaleString([],type===TickMarkType.Year?{year:'numeric'}:type===TickMarkType.Month?{month:'short',year:'numeric'}:dateOnly||type===TickMarkType.DayOfMonth?{month:'short',day:'numeric'}:{hour:'2-digit',minute:'2-digit'})},
      localization:{timeFormatter:time=>new Date(Number(time)*1000).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})},
      rightPriceScale:{visible:false,borderVisible:false,scaleMargins:{top:.18,bottom:.10}},
      crosshair:{mode:CrosshairMode.Magnet,vertLine:{color:accent,style:2,labelVisible:false},horzLine:{visible:false,labelVisible:false}},
      handleScale:false,handleScroll:false,
    });
    const series=chart.addSeries(AreaSeries,{lineColor:accent,topColor:negative?'rgba(207,119,115,.12)':theme==='dark'?'rgba(145,185,159,.14)':'rgba(85,122,98,.10)',bottomColor:'rgba(145,185,159,0)',lineWidth:2,lastValueVisible:false,priceLineVisible:false,crosshairMarkerRadius:4});
    chart.subscribeCrosshairMove(param=>{
      const value=param.seriesData.get(series);
      setInspected(param.time && value && 'value' in value ? {time:param.time as UTCTimestamp,value:value.value} : null);
    });
    chartRef.current=chart;seriesRef.current=series;pointsRef.current=[];
    const resize=new ResizeObserver(entries=>{
      const rect=entries[0]?.contentRect;
      if(rect?.width>0 && rect?.height>0) requestAnimationFrame(()=>{if(!disposed)chart.applyOptions({width:rect.width,height:rect.height});});
    });
    resize.observe(container.current);
    return()=>{disposed=true;resize.disconnect();chart.remove();chartRef.current=null;seriesRef.current=null;pointsRef.current=[];};
  },[theme,negative,dateOnly]);
  useEffect(()=>{
    const chart=chartRef.current,series=seriesRef.current;
    if(!chart||!series)return;
    const previous=pointsRef.current;
    // Quotes update the last minute in place. Only a range/history change replaces the series.
    const tailOnly=previous.length>0 && points.length>=previous.length && points.length<=previous.length+1 && previous.slice(0,-1).every((p,i)=>p.time===points[i]?.time&&p.value===points[i]?.value) && previous.at(-1)!.time===points[previous.length-1]?.time;
    if(tailOnly){for(const point of points.slice(previous.length-1))series.update(point);}
    else series.setData(points);
    series.applyOptions({pointMarkersVisible:points.length===1});
    pointsRef.current=points;
    if(!tailOnly||points.length!==previous.length)chart.timeScale().fitContent();
    setInspected(null);
  },[points,theme,negative,dateOnly]);
  const inspect=(event:React.KeyboardEvent)=>{
    if(!points.length)return;
    if(event.key==='Escape'){setInspected(null);chartRef.current?.clearCrosshairPosition();return;}
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();
    const current=inspected?points.findIndex(p=>p.time===inspected.time):points.length-1;
    const index=event.key==='Home'?0:event.key==='End'?points.length-1:Math.max(0,Math.min(points.length-1,current+(event.key==='ArrowLeft'?-1:1)));
    const point=points[index];setInspected(point);
    if(seriesRef.current)chartRef.current?.setCrosshairPosition(point.value,point.time,seriesRef.current);
  };
  return <div className="portfolio-chart" tabIndex={points.length?0:undefined} role="group" aria-label={`${label} chart. Use left and right arrow keys to inspect observations.`} onKeyDown={inspect}>
    <div ref={container} className="portfolio-chart__canvas"/>
    {inspected&&<div className="portfolio-chart__readout" aria-live="polite"><AnimatedValue value={inspected.value}/><time dateTime={new Date(inspected.time*1000).toISOString()}>{new Date(inspected.time*1000).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</time></div>}
    {points.length<2&&!inspected&&<div className="portfolio-chart__status" role="status">{loading?'Loading account history…':points.length?'History starts with this observation.':emptyLabel}</div>}
  </div>;
}
