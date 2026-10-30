import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

test('performance drill-down filters actual settlements and hands the latest row to receipt inspection',async()=>{
 const folder=await mkdtemp(path.resolve('audit/performance-ui-')),file=path.join(folder,'ui.mjs');
 await build({stdin:{contents:"export{AccountPerformance}from'./src/components/ui/AccountPerformance';",resolveDir:process.cwd(),loader:'tsx'},outfile:file,bundle:true,platform:'node',format:'esm',external:['react','react-dom','lucide-react','motion/react'],loader:{'.css':'empty'},plugins:[{name:'chart-fixture',setup(b){b.onResolve({filter:/\/PortfolioChart$/},()=>({path:'chart',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`import React from'react';export const PortfolioChart=({data,label})=>React.createElement('div',{'data-points':JSON.stringify(data),role:'img','aria-label':label});`,loader:'js'}));}}]});
 const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true});
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.Element=dom.window.Element;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
 dom.window.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
 const{createRoot}=await import('react-dom/client'),{AccountPerformance}=await import(pathToFileURL(file));
 const root=createRoot(document.querySelector('#root')),calls=[];
 const old={id:'old',pair:'SOL/USD',side:'LONG',action:'CLOSE',timestamp:Date.now()-150*86400000,pnl:100};
 const latest={id:'new',pair:'ETH/USD',side:'SHORT',action:'LIQUIDATION',timestamp:Date.now()-10000,pnl:-25};
 const render=history=>root.render(React.createElement(AccountPerformance,{history,theme:'dark',onInspect:r=>calls.push(r)}));
 try{
  await act(async()=>render([old,latest]));
  const trigger=document.querySelector('.account-performance-trigger');
  await act(async()=>{trigger.focus();trigger.click();});
  assert.match(document.querySelector('dialog').textContent,/Your performance/);
  let points=JSON.parse(document.querySelector('[data-points]').dataset.points);
  assert.ok(points[0].timestamp<Date.now()-90*86400000);assert.equal(points.at(-1).value,75);
  const oneDay=[...document.querySelectorAll('dialog .velo-segments button')].find(b=>b.textContent==='1D');
  await act(async()=>oneDay.click());
  points=JSON.parse(document.querySelector('[data-points]').dataset.points);assert.equal(points.at(-1).value,-25);
  assert.equal(document.querySelectorAll('.account-performance-markets>div').length,1);
  const receipt=document.querySelector('.account-performance-recent button');
  const updated={...latest,pnl:-30};
  await act(async()=>{receipt.focus();render([old,updated]);});
  assert.equal(document.activeElement,receipt,'history updates preserve receipt focus');
  await act(async()=>receipt.click());assert.deepEqual(calls[0],updated);assert.equal(document.querySelector('dialog'),null);assert.equal(document.activeElement,trigger);
  await act(async()=>render([old]));await act(async()=>trigger.click());
  assert.equal(document.querySelector('[data-points]'),null,'an empty period never mounts a blank financial chart');
  const allHistory=document.querySelector('.account-performance-empty button');
  await act(async()=>allHistory.click());
  assert.equal(JSON.parse(document.querySelector('[data-points]').dataset.points).at(-1).value,100,'the empty state leads to the actual older settlements');
  await act(async()=>render([]));
  assert.equal(document.querySelector('[data-points]'),null);assert.equal(document.querySelector('.account-performance-metrics'),null);
  assert.match(document.querySelector('dialog').textContent,/0 settlements/);assert.doesNotMatch(document.querySelector('dialog').textContent,/NaN|Infinity/);
 }finally{await act(async()=>root.unmount());dom.window.close();await rm(folder,{recursive:true,force:true});}
});
