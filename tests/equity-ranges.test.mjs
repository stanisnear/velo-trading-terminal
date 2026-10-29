import test from 'node:test';
import assert from 'node:assert/strict';
import {equityView,equityPeriod} from '../src/services/equityHistory.mjs';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

const day=86400000,now=Date.UTC(2026,9,29,16,30);
const daily=count=>Array.from({length:count+1},(_,i)=>({timestamp:now-(count-i)*day,value:100+i}));
const enabled=view=>view.options.filter(o=>!o.disabled).map(o=>o.value);

test('a few hours of equity data enables All, not four identical ranges',()=>{
 const rows=[{timestamp:now-6*3600000,value:100},{timestamp:now,value:110}];
 const view=equityView(rows,'1D',now);
 assert.deepEqual(enabled(view),['ALL']);assert.equal(view.period,'ALL');
 assert.equal(view.firstAt,rows[0].timestamp);assert.equal(view.lastAt,now);
 assert.equal(view.change,10);assert.equal(view.percent,10);
});

test('available equity windows are distinct, timestamp-filtered and calculate their own changes',()=>{
 const rows=daily(40);
 for(const [period,count,change] of [['1D',2,1],['1W',8,7],['1M',31,30],['ALL',41,40]]){
  const view=equityView(rows,period,now);
  assert.equal(view.period,period);assert.deepEqual(enabled(view),['1D','1W','1M','ALL']);
  assert.equal(view.points.length,count);assert.equal(view.change,change);
  assert.equal(view.lastAt,now);assert.equal(view.firstAt,rows.at(-count).timestamp);
 }
 const young=equityView(daily(10),'1M',now);
 assert.equal(young.period,'ALL');assert.deepEqual(enabled(young),['1D','1W','ALL']);
});

test('gaps, bad points, zero balances and account switches never fabricate history or returns',()=>{
 const sparse=[{timestamp:now-40*day,value:90},{timestamp:now-2*3600000,value:0},{timestamp:now,value:100}];
 assert.deepEqual(enabled(equityView(sparse,'ALL',now)),['1D','ALL'],'longer windows with identical observations are disabled');
 const view=equityView([...sparse,{timestamp:now+1,value:50000},{timestamp:NaN,value:1},{timestamp:now-1000,value:NaN}], '1D',now);
 assert.equal(view.change,100);assert.equal(view.percent,null,'a zero opening value has no percentage return');
 assert.equal(equityPeriod(sparse,'1D',now).length,2);
 assert.deepEqual(enabled(equityView([{timestamp:now,value:1}],'1M',now)),['ALL']);
 assert.deepEqual(enabled(equityView([],'1D',now)),[]);
 assert.equal(equityView([],'1D',now).change,null);
 assert.deepEqual(equityView(sparse,'invalid',now).points,sparse);
 const switched=equityView([{timestamp:now-10000,value:20},{timestamp:now,value:21}],'1M',now);
 assert.equal(switched.period,'ALL');assert.equal(switched.change,1);
});

test('range controls disable unavailable options and keyboard navigation skips them',async()=>{
 const dir=await mkdtemp(path.resolve('audit/equity-options-')),file=path.join(dir,'control.mjs');
 await build({stdin:{contents:"export{SegmentedControl}from'./src/components/ui/SegmentedControl';",loader:'tsx',resolveDir:process.cwd()},outfile:file,bundle:true,platform:'node',format:'esm',external:['react','react-dom','motion/react'],loader:{'.css':'empty'}});
 const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true});
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.Element=dom.window.Element;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 dom.window.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
 const {createRoot}=await import('react-dom/client'),{SegmentedControl}=await import(pathToFileURL(file));
 const root=createRoot(document.querySelector('#root')),calls=[];
 try{
  const options=equityView(daily(10),'ALL',now).options;
  await act(async()=>root.render(React.createElement(SegmentedControl,{label:'Portfolio period',options,value:'ALL',onChange:v=>calls.push(v)})));
  const buttons=[...document.querySelectorAll('button')];assert.equal(buttons[2].disabled,true);
  await act(async()=>buttons[2].click());assert.deepEqual(calls,[]);
  await act(async()=>{buttons[1].focus();buttons[1].dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));});
  assert.equal(document.activeElement,buttons[3]);assert.equal(calls.at(-1),'ALL');
  await act(async()=>buttons[3].dispatchEvent(new window.KeyboardEvent('keydown',{key:'Home',bubbles:true})));
  assert.equal(document.activeElement,buttons[0]);assert.equal(calls.at(-1),'1D');
 }finally{await act(async()=>root.unmount());dom.window.close();await rm(dir,{recursive:true,force:true});}
});
