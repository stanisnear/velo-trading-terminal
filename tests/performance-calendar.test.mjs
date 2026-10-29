import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

test('calendar groups local-day settlements, navigates actual months and opens the original records',async()=>{
 const folder=await mkdtemp(path.resolve('audit/preview-calendar-')),file=path.join(folder,'ui.mjs');
 await build({stdin:{contents:"export{PerformanceCalendar}from'./src/components/ui/PerformanceCalendar';",resolveDir:process.cwd(),loader:'tsx'},outfile:file,bundle:true,platform:'node',format:'esm',external:['react','react-dom','lucide-react','motion/react'],loader:{'.css':'empty'},plugins:[{name:'values',setup(b){b.onResolve({filter:/\/AnimatedValue$/},()=>({path:'values',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"import React from'react';export const AnimatedValue=({value,currency=true,digits=2})=>React.createElement('span',null,(currency?'$':'')+new Intl.NumberFormat('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits,useGrouping:false}).format(value));",loader:'js'}));}}]});
 const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true});
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.Element=dom.window.Element;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 dom.window.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
 const{createRoot}=await import('react-dom/client'),{PerformanceCalendar}=await import(pathToFileURL(file));
 const root=createRoot(document.querySelector('#root'));
 try{
  // Two actual closes on one local day, and a settlement in a separate month.
  const trades=[{id:'may',timestamp:new Date(2026,4,26,10).getTime(),pnl:100,pair:'BTC/USD',side:'LONG'},
   {id:'oct-a',timestamp:new Date(2026,9,2,0,5).getTime(),pnl:80,pair:'SOL/USD',side:'LONG'},
   {id:'oct-b',timestamp:new Date(2026,9,2,23,55).getTime(),pnl:-30,pair:'ETH/USD',side:'SHORT'}];
  let inspected;
  await act(async()=>root.render(React.createElement(PerformanceCalendar,{trades,onInspect:t=>inspected=t})));
  const october=[...document.querySelectorAll('.performance-calendar__grid button')].find(b=>b.textContent.startsWith('2$'));
  assert.ok(october);assert.match(october.getAttribute('aria-label'),/50.00, 2 settlements/);
  await act(async()=>october.click());assert.equal(document.querySelectorAll('.performance-calendar__selection button').length,2);
  await act(async()=>document.querySelector('.performance-calendar__selection button').click());assert.equal(inspected.id,'oct-b');
  await act(async()=>document.querySelector('[aria-label="Earlier settlement month"]').click());
  assert.match(document.querySelector('.performance-calendar__nav').textContent,/May 2026/);
  assert.equal(document.querySelector('[aria-label="Earlier settlement month"]').disabled,true);
  assert.equal(document.querySelector('.performance-calendar__selection'),null,'a month change clears the day selection');
 }finally{await act(async()=>root.unmount());dom.window.close();await rm(folder,{recursive:true,force:true});}
});
