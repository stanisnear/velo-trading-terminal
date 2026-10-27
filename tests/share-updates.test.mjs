import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
await mkdir('audit',{recursive:true});
const folder=await mkdtemp(path.resolve('audit/share-updates-')),file=path.join(folder,'hook.mjs');
await build({entryPoints:['src/components/useSharedTrade.ts'],outfile:file,bundle:true,platform:'node',format:'esm',external:['react'],loader:{'.css':'empty'},plugins:[{name:'rpc-fixture',setup(b){
  b.onResolve({filter:/services\/sharedPosition$/},()=>({path:'rpc',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const hasPositionReference = d => !!d.tradeId; export const readSharedPosition = d => globalThis.__readPosition(d); export const readPositionEvidence = async () => ({}); export const SHARED_ENGINE = "0x0000000000000000000000000000000000000001";'}));
}}]});
const {useSharedTrade,SharedMarkContext}=await import(pathToFileURL(file));
test('snapshot hook ignores live prices and RPC; live hook settles and freeze keeps captured PnL',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true});
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const root=createRoot(document.querySelector('#root'));let result,calls=0,closed=false;
  const original={pair:'SOL/USD',side:'LONG',leverage:10,entryPrice:100,markPrice:101,size:100,collateral:10,pnl:1,pnlPct:10,status:'OPEN',tradeId:'12',v4:{collateral:10,openFee:0,spreadRatio:0,borrowBpsPerHour:0,maintenanceBps:50}};
  globalThis.__readPosition=async d=>{calls++;return {...d,status:closed?'CLOSED':'OPEN',pnl:closed?4:2,pnlPct:closed?40:20,closePrice:104};};
  function View({snapshot,mark}){result=useSharedTrade(snapshot);return React.createElement('div',{},result.data.status);}
  const render=(snapshot,mark=101)=>act(async()=>root.render(React.createElement(SharedMarkContext.Provider,{value:{'SOL/USD':mark}},React.createElement(View,{snapshot,mark}))));
  try{
    await render({...original,updateMode:'snapshot'},120);assert.equal(calls,0);assert.equal(result.data.pnl,1);assert.equal(result.pending,false);
    await render({...original,updateMode:'snapshot'},140);assert.equal(result.data.markPrice,101);assert.equal(calls,0);
    await render({...original,updateMode:'live'});assert.equal(calls,1);assert.equal(result.data.status,'OPEN');
    await render({...original,updateMode:'live',hideAmounts:true});assert.equal(result.data.hideAmounts,true);
    await render({...original,updateMode:'live',hideAmounts:false});assert.equal(result.data.hideAmounts,false);
    closed=true;await act(async()=>window.dispatchEvent(new dom.window.Event('online')));assert.equal(result.data.status,'CLOSED');assert.equal(result.data.pnl,4);
    await render({...original,updateMode:'live',onClose:'freeze'});assert.equal(result.data.status,'CLOSED');assert.equal(result.data.pnl,1);assert.equal(result.data.closedSnapshot,true);
  }finally{await act(async()=>root.unmount());dom.window.close();}
});
test.after(()=>rm(folder,{recursive:true,force:true}));
