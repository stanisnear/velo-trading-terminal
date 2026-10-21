import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { mkdtemp, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { tradeFixturePlugin } from './fixtures/trade-view.mjs';
const folder=await mkdtemp(path.resolve('audit/manage-position-')),file=path.join(folder,'view.mjs');
await build({entryPoints:['src/components/VeloManagePositionModal.tsx'],outfile:file,bundle:true,platform:'node',format:'esm',external:['react','react-dom','lucide-react'],loader:{'.css':'empty'},plugins:[tradeFixturePlugin]});
const {VeloManagePositionModal}=await import(pathToFileURL(file));
const position={id:'velo_5',onChainTradeId:'5',pair:'HYPE/USD',side:'LONG',entryPrice:80,size:998,leverage:10,timestamp:Date.now(),takeProfit:90,stopLoss:75,v4:{collateral:99.8,openFee:1,spreadRatio:.0002,borrowBpsPerHour:1,maintenanceBps:50}};
async function setup(){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.invalid'});
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const {createRoot}=await import('react-dom/client');
 const root=createRoot(document.querySelector('#root'));let finish;const calls=[];
 const pending=new Promise(resolve=>finish=resolve);
 const actions={setTriggers:async(...args)=>{calls.push(args);return pending;},partialClose:async(...args)=>{calls.push(args);return {txHash:'0x01'};}};
 const render=(mark=82)=>act(async()=>root.render(React.createElement(VeloManagePositionModal,{isOpen:true,onClose:()=>{},position:{...position},currentPrice:mark,actions,initialTab:'TRIGGERS'})));
 await render();return {calls,render,finish,close:async()=>{await act(async()=>root.unmount());dom.window.close();}};
}
test('TP/SL sliders update real prices and estimates; draft survives quotes; pending save cannot duplicate',async()=>{
 const f=await setup();try{
   const slider=document.querySelector('[aria-label="Take profit return slider"]');
   await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(slider,'50');slider.dispatchEvent(new window.Event('input',{bubbles:true}));slider.dispatchEvent(new window.Event('change',{bubbles:true}));});
   const tp=document.querySelector('#manage-TP');const draft=tp.value;assert(Number(draft)>80);assert.match(document.querySelector('#manage-TP-preview').textContent,/50.0%/);
   await f.render(83);assert.equal(document.querySelector('#manage-TP').value,draft);
   const save=[...document.querySelectorAll('button')].find(e=>e.textContent==='Save TP/SL');
   await act(async()=>{save.click();save.click();});assert.equal(f.calls.length,1);assert.equal(f.calls[0][0],5n);assert.equal(f.calls[0][1],Number(draft));
   assert(document.querySelector('dialog').getAttribute('aria-busy')==='true');assert(save.disabled);
   await act(async()=>f.finish({txHash:'0x01'}));assert.match(document.body.textContent,/Protection updated/);
 }finally{await f.close();}
});
test('close action retains full-position settlement and invalid triggers never submit',async()=>{
 const f=await setup();try{
   const tp=document.querySelector('#manage-TP');await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(tp,'70');tp.dispatchEvent(new window.Event('input',{bubbles:true}));});
   assert([...document.querySelectorAll('button')].find(e=>e.textContent==='Save TP/SL').disabled);
   await act(async()=>[...document.querySelectorAll('[role="tab"]')].find(e=>e.textContent==='Close position').click());
   assert.match(document.body.textContent,/Closing fee|Est. returned to wallet/);
   await act(async()=>[...document.querySelectorAll('button')].find(e=>e.textContent==='Close entire position').click());
   assert.deepEqual(f.calls,[[5n,10000,'HYPE/USD']]);assert.match(document.body.textContent,/Position closed/);
 }finally{await f.close();}
});
test.after(()=>rm(folder,{recursive:true,force:true}));
