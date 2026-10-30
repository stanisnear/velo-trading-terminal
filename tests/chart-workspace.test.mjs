import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {equityHistoryKey,normalizeEquityHistory,observeEquity,equityPeriod} from '../src/services/equityHistory.mjs';

const now=Date.UTC(2026,9,29,12);
test('equity observations preserve genuine timestamps, finite zero, deduplication and retention',()=>{
 const rows=normalizeEquityHistory([{timestamp:now-120000,value:100},{timestamp:now,value:0},{timestamp:now-30000,value:120},{timestamp:now,value:125},{time:'12:00',value:1000},{timestamp:now,value:NaN},{timestamp:now,value:-1},{timestamp:now-91*86400000,value:100}],now);
 assert.deepEqual(rows,[{timestamp:now-120000,value:100},{timestamp:now-60000,value:120},{timestamp:now,value:125}]);
 assert.equal(observeEquity(rows,Infinity,now),rows);
 assert.equal(observeEquity(rows,125,now),rows);
 assert.equal(observeEquity(rows,0,now).at(-1).value,0,'confirmed zero is genuine data');
 assert.deepEqual(equityPeriod(rows,'1D',now),rows);
 assert.notEqual(equityHistoryKey('a','wallet','engine'),equityHistoryKey('b','wallet','engine'));
 assert.notEqual(equityHistoryKey('a','wallet','engine'),equityHistoryKey('a','wallet','new-engine'));
});

const chartStub=`
export const BaselineSeries='baseline',AreaSeries='area',BarSeries='bar',CandlestickSeries='candles',HistogramSeries='hist',LineSeries='line';
export const ColorType={Solid:'solid'},CrosshairMode={Magnet:1},LineStyle={Solid:0,Dotted:1,Dashed:2},TickMarkType={Year:0,Month:1,DayOfMonth:2,Time:3,TimeWithSeconds:4};
export const createTextWatermark=()=>({detach(){},applyOptions(){}});
export function createChart(element,options){
 const state={element,options,series:[],removed:false,range:{from:0,to:100},sets:[],realtime:0,sub:null};
 const scale={getVisibleLogicalRange:()=>state.range,setVisibleLogicalRange:r=>{state.range=r;state.sets.push(r);state.sub?.(r);},fitContent:()=>{state.fits=(state.fits||0)+1;},subscribeVisibleLogicalRangeChange:cb=>state.sub=cb,unsubscribeVisibleLogicalRangeChange:()=>state.sub=null,scrollToRealTime:()=>{state.realtime++;const last=state.series[0].data.length-1;const width=state.range.to-state.range.from;scale.setVisibleLogicalRange({from:last+4-width,to:last+4});}};
 const chart={timeScale:()=>scale,addSeries:(type,options)=>{const s={type,options,data:[],sets:0,updates:0,setData:d=>{s.data=d;s.sets++;state.sub?.(state.range);},update:p=>{s.updates++;if(s.data.at(-1)?.time===p.time)s.data=[...s.data.slice(0,-1),p];else s.data=[...s.data,p];state.sub?.(state.range);},applyOptions:o=>Object.assign(s.options,o),priceScale:()=>({applyOptions(){}}),createPriceLine:()=>({}),removePriceLine(){}};state.series.push(s);return s;},panes:()=>[{}],removePane(){},removeSeries(){},applyOptions:o=>{state.lastOptions=o;},subscribeCrosshairMove:cb=>state.crosshair=cb,remove(){state.removed=true;},clearCrosshairPosition(){},setCrosshairPosition(){}};
 state.api=chart;globalThis.__charts.push(state);return chart;
}`;
const plugin={name:'charts-offline',setup(b){
 const mocks={'lightweight-charts':chartStub,pythPriceService:`export const pythPriceStream={subscribe:cb=>{globalThis.__quote=cb;return()=>{};},getMeta:()=>globalThis.__meta};`,priceService:`export const subscribeKlines=()=>()=>{};`,shared:`export const formatPrice=x=>Number(x).toFixed(2);`,AnimatedValue:`import React from 'react';export const AnimatedValue=({value})=>React.createElement('span',null,value);export const AnimatedText=({text})=>React.createElement('span',null,text);`};
 b.onResolve({filter:/.*/},a=>{const key=mocks[a.path]?a.path:a.path.split('/').pop();if(mocks[key])return{path:key,namespace:'chart-fixture'};});
 b.onLoad({filter:/.*/,namespace:'chart-fixture'},a=>({contents:mocks[a.path],loader:'js',resolveDir:process.cwd()}));
}};

test('real chart components follow first history, timeframe changes and explicit return to live, without stealing historical browsing',async()=>{
 const dir=await mkdtemp(path.resolve('audit/chart-workspace-')),file=path.join(dir,'charts.mjs');
 await build({stdin:{contents:"export{TradingViewChart}from'./src/components/TradingViewChart';export{PortfolioChart}from'./src/components/PortfolioChart';export{useEquityHistory}from'./src/hooks/useEquityHistory';",resolveDir:process.cwd(),loader:'tsx'},outfile:file,bundle:true,format:'esm',platform:'node',external:['react','react-dom','lucide-react','motion/react'],loader:{'.css':'empty'},plugins:[plugin]});
 const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true,url:'https://velo.test'});
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.Element=dom.window.Element;globalThis.MutationObserver=dom.window.MutationObserver;globalThis.getComputedStyle=dom.window.getComputedStyle;globalThis.localStorage=dom.window.localStorage;
 globalThis.__resizeObservers=[];globalThis.ResizeObserver=class{constructor(callback){this.callback=callback;globalThis.__resizeObservers.push(this);}observe(){}disconnect(){}};globalThis.requestAnimationFrame=cb=>setTimeout(cb,0);globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.__charts=[];
 dom.window.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
 const {createRoot}=await import('react-dom/client'),{TradingViewChart,PortfolioChart,useEquityHistory}=await import(pathToFileURL(file));
 const root=createRoot(document.querySelector('#root'));
 const time=Math.floor(Date.now()/1000)-300*60;
 const rows=Array.from({length:300},(_,i)=>({time:time+i*60,open:100,high:102,low:99,close:101,source:'pyth'}));
 const render=(data,tf='1m',extra={})=>root.render(React.createElement(TradingViewChart,{theme:'dark',pairName:'SOL/USD',currentPrice:101,externalTimeframe:tf,initialData:data,externalIndicators:[],...extra}));
 try{
  await act(async()=>render([]));let state=globalThis.__charts.at(-1);
  await act(async()=>render(rows));assert.equal(state.range.to,304,'first nonempty response opens at latest candle');
  const older=Array.from({length:800},(_,i)=>({...rows[0],time:time+(i-500)*60}));
  await act(async()=>render([], '5m'));state=globalThis.__charts.at(-1);
  await act(async()=>render(older,'5m'));assert.deepEqual(state.range,{from:200,to:804},'timeframe change does not keep empty initial range');
  await act(async()=>state.api.timeScale().setVisibleLogicalRange({from:100,to:200}));
  assert.ok(document.querySelector('.chart-back-to-live'));
  const fresh={...older.at(-1),close:102};
  await act(async()=>render([...older.slice(0,-1),fresh],'5m'));
  assert.deepEqual(state.range,{from:100,to:200},'quote/history refresh preserves user browsing');
  await act(async()=>document.querySelector('.chart-back-to-live').click());
  assert.equal(state.realtime,1);assert.ok(state.range.to>799);
  const liveRange={...state.range};
  const appended={...older.at(-1),time:older.at(-1).time+300};
  await act(async()=>render([...older,appended],'5m'));
  assert.deepEqual(state.range,{from:liveRange.from+1,to:liveRange.to+1},'history refresh follows new candles while already live');
  // Leave time for reduced-motion exit completion.
  await act(async()=>{await new Promise(r=>setTimeout(r,30));});
  assert.equal(document.querySelector('.chart-back-to-live'),null);
  await act(async()=>state.api.timeScale().setVisibleLogicalRange({from:100,to:200}));
  const prepended=Array.from({length:10},(_,i)=>({...older[0],time:older[0].time-(10-i)*300}));
  await act(async()=>render([...prepended,...older],'5m'));
  assert.deepEqual(state.range,{from:110,to:210},'prepending older candles preserves the viewed bars');

  const observedNow=Math.floor(Date.now()/60000)*60000;
  await act(async()=>root.render(React.createElement(PortfolioChart,{data:[{timestamp:observedNow-120000,value:100},{timestamp:observedNow,value:110}],theme:'dark'})));
  state=globalThis.__charts.at(-1);const series=state.series[0];
  assert.deepEqual(series.data.map(p=>p.time),[(observedNow-120000)/1000,observedNow/1000],'portfolio uses observation times, not generated days');
  const sets=series.sets;
  await act(async()=>root.render(React.createElement(PortfolioChart,{data:[{timestamp:observedNow-120000,value:100},{timestamp:observedNow,value:115}],theme:'dark'})));
  assert.equal(series.sets,sets);assert.equal(series.updates,1);assert.equal(series.data.at(-1).value,115);

  assert.equal(series.type,'baseline');assert.equal(series.options.baseValue.price,100,'equity uses the selected period starting account value');
  const chartCount=globalThis.__charts.length;
  const may=Date.parse('2026-05-26T18:13:20Z');
  await act(async()=>root.render(React.createElement(PortfolioChart,{data:[{timestamp:may,value:0},{timestamp:observedNow,value:-219.22}],theme:'dark',label:'Realized trading PnL',baseline:0})));
  assert.equal(globalThis.__charts.at(-1).series[0].data[0].time,may/1000,'historical realized PnL is not subject to the device equity cache retention');

  assert.equal(globalThis.__charts.length,chartCount,'changing to loss data does not recreate the chart');
  assert.equal(series.options.baseValue.price,0,'settlement PnL uses zero, not starting equity');
  assert.notEqual(series.options.topLineColor,series.options.bottomLineColor,'profits and losses have separate colors');

  let fits=state.fits;
  await act(async()=>{globalThis.__resizeObservers.at(-1).callback([{contentRect:{width:1100,height:220}}]);await new Promise(resolve=>setTimeout(resolve,5));});
  assert.equal(state.lastOptions.width,1100);
  assert.ok(state.fits>fits,'resize refits the data rather than leaving a narrow plot at the right');
  fits=state.fits;
  await act(async()=>root.render(React.createElement(PortfolioChart,{data:[{timestamp:may,value:0},{timestamp:observedNow,value:-219.22}],theme:'dark',label:'Realized trading PnL',baseline:0,rangeKey:'ALL'})));
  assert.ok(state.fits>fits,'an explicit range selection refits even if the points have not changed');
  assert.equal(globalThis.__charts.length,chartCount,'range selection preserves the chart instance');

  const priorZone=process.env.TZ;
  process.env.TZ='Europe/Rome';
  try {
    const start=Date.parse('2026-10-29T17:51:00Z'),finish=start+26*3600000;
    const history=[{timestamp:start,value:100},{timestamp:finish,value:115}];
    await act(async()=>root.render(React.createElement(PortfolioChart,{data:history,theme:'dark',dateOnly:false})));
    const clock=state.options.timeScale;
    assert.equal(clock.timeVisible,true,'crossing midnight must not hide intraday times');
    assert.equal(clock.tickMarkFormatter(start/1000,3,'en-GB'),'18:51');
    assert.equal(clock.tickMarkFormatter((start+3600000)/1000,3,'en-GB'),'19:51','intraday ticks cannot repeat a day label');
    assert.match(clock.tickMarkFormatter(start/1000,3,'en-US'),/6:51/,'locale controls the clock format');
    assert.match(clock.tickMarkFormatter(start/1000,2,'en-GB'),/29/,'day boundaries retain date context');
    assert.equal(document.querySelectorAll('.portfolio-chart__range time').length,2);
    assert.equal(document.querySelector('.portfolio-chart__range time').dateTime,new Date(start).toISOString());
    await act(async()=>document.querySelector('.portfolio-chart').dispatchEvent(new window.KeyboardEvent('keydown',{key:'Home',bubbles:true})));
    const readout=document.querySelector('.portfolio-chart__readout');
    assert.equal(readout.parentElement.className,'portfolio-chart__summary','inspection stays outside the drawing canvas');
    assert.equal(readout.querySelector('time').dateTime,new Date(start).toISOString());
    assert.match(readout.textContent,/100/);
    await act(async()=>root.render(React.createElement(PortfolioChart,{data:[history[0],{timestamp:finish,value:120}],theme:'dark',dateOnly:false})));
    assert.equal(document.querySelector('.portfolio-chart__readout'),readout,'live updates preserve the inspected observation');
  } finally { if(priorZone===undefined)delete process.env.TZ;else process.env.TZ=priorZone; }

  let observed;
  function History({owner,value,ready,remote}){observed=useEquityHistory(owner,'wallet','engine',value,ready,remote);return null;}
  await act(async()=>root.render(React.createElement(History,{owner:'one',value:0,ready:false})));
  assert.deepEqual(observed,[],'wallet hydration zero is never recorded');
  await act(async()=>root.render(React.createElement(History,{owner:'one',value:200,ready:true})));
  assert.equal(observed.at(-1).value,200);
  await act(async()=>root.render(React.createElement(History,{owner:'two',value:0,ready:false})));
  assert.deepEqual(observed,[],'switching accounts cannot leak previous history');
  const loads=[],writes=[];
  const remote={load:owner=>new Promise(resolve=>loads.push({owner,resolve})),save:async(...args)=>{writes.push(args);}};
  await act(async()=>root.render(React.createElement(History,{owner:'remote-a',value:0,ready:false,remote})));
  await act(async()=>root.render(React.createElement(History,{owner:'remote-b',value:0,ready:false,remote})));
  const ancient={timestamp:Date.now()-180*86400000,value:100};
  await act(async()=>loads.find(x=>x.owner==='remote-b').resolve([ancient]));
  assert.equal(observed[0].timestamp,ancient.timestamp,'a new device loads the full shared history');
  await act(async()=>loads.find(x=>x.owner==='remote-a').resolve([{...ancient,value:9999}]));
  assert.equal(observed[0].value,100,'late network results cannot cross accounts');
  await act(async()=>root.render(React.createElement(History,{owner:'remote-b',value:200,ready:true,remote})));
  await act(async()=>root.render(React.createElement(History,{owner:'remote-b',value:201,ready:true,remote})));
  assert.equal(observed.at(-1).value,201);assert.equal(observed[0].value,100);
  assert.equal(writes.length,1,'live ticks produce at most one shared write in a five-minute bucket');
  assert.equal(writes[0][0],'remote-b');assert.equal(writes[0][3][0].valuationVersion,2);

 }finally{await act(async()=>root.unmount());dom.window.close();await rm(dir,{recursive:true,force:true});}
});
