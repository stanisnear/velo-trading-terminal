import test from 'node:test';import assert from 'node:assert/strict';
import {build}from'esbuild';import{JSDOM}from'jsdom';import React,{act}from'react';import{createRoot}from'react-dom/client';
import{mkdir,mkdtemp,rm}from'node:fs/promises';import path from'node:path';import{pathToFileURL}from'node:url';
await mkdir('audit',{recursive:true});const folder=await mkdtemp(path.resolve('audit/share-studio-')),file=path.join(folder,'ui.mjs');
await build({stdin:{contents:"export{PositionComposerTools}from'./src/components/PositionComposerTools';export{VeloShareCard}from'./src/components/VeloShareCard';",resolveDir:process.cwd(),loader:'ts'},outfile:file,bundle:true,platform:'node',format:'esm',external:['react','react-dom','lucide-react'],loader:{'.css':'empty'},plugins:[{name:'share-fixtures',setup(b){
  b.onResolve({filter:/services\/sharedPosition$/},()=>({path:'chain',namespace:'fixture'}));
  b.onResolve({filter:/\/tradeImage$/},()=>({path:'image',namespace:'fixture'}));
  b.onResolve({filter:/PnlImage$/},()=>({path:'preview',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='chain'?`export const SHARED_ENGINE='0x'+'ab'.repeat(20);export const hasPositionReference=d=>!!d.tradeId;export const readSharedPosition=async d=>({...d,openedAt:1700000000000});export const readPositionEvidence=async()=>({openTxHash:'0x'+'cd'.repeat(32),openedAt:1700000000000});`:args.path==='image'?"export const renderTradePng=async()=>new Blob(['PNG'],{type:'image/png'});":"import React from 'react';export const PnlImage=({data})=>React.createElement('img',{alt:'PnL image preview '+data.theme});"}));
}}]});
const{PositionComposerTools,VeloShareCard}=await import(pathToFileURL(file));
const share={pair:'SOL/USD',side:'LONG',leverage:10,entryPrice:101,markPrice:103,size:8765,collateral:987,pnl:123.45,pnlPct:12.5,status:'OPEN',tradeId:'12',updatedAt:1700000000000};
function setup(){const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true});globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};return{dom,root:createRoot(document.querySelector('#root'))};}
const click=async button=>{assert.ok(button,'button exists');await act(async()=>button.click());};
const button=(name)=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===name||b.getAttribute('aria-label')===name);
test('composer percentage choice hides amounts in both the attachment and its clickable details',async()=>{
  const{root,dom}=setup();let attached=share;
  function View(){const[value,setValue]=React.useState(share);return React.createElement(PositionComposerTools,{choices:[share],attachment:value,onChange:next=>{attached=next;setValue(next);},onPnl(){}});}
  try{await act(async()=>root.render(React.createElement(View)));assert.match(document.body.textContent,/Margin invested/);
    await click(button('% Return only'));assert.equal(attached.hideAmounts,true);assert.doesNotMatch(document.body.textContent,/\$987|\$123\.45|Margin invested/);
    await click(button('View SOL/USD position details'));assert.ok(document.querySelector('dialog[open]'));assert.match(document.body.textContent,/Position details/);assert.match(document.body.textContent,/Opened/);assert.match(document.body.textContent,/12\.50%/);assert.doesNotMatch(document.body.textContent,/\$987|\$123\.45|\$8,765|Position size/);
    assert.equal(document.querySelector('.position-receipt a')?.href,'https://sepolia.basescan.org/tx/0x'+'cd'.repeat(32));
    await click(button('Close Position details'));await click(button('Remove position attachment'));assert.equal(attached,null);assert.equal(document.querySelector('dialog[open]'),null);
  }finally{await act(async()=>root.unmount());dom.window.close();}
});
test('share studio starts simple, keeps an independent theme and preserves the draft on publish failure',async()=>{
  const{root,dom}=setup();let published,closed=false;
  try{await act(async()=>root.render(React.createElement(VeloShareCard,{isOpen:true,data:{...share,presentation:'pnl'},onClose:()=>{closed=true;},onPost:async(content,data,image)=>{published={content,data,image};throw Error('Offline; draft kept');}})));
    assert.equal(document.querySelector('.share-customization').open,false);assert.equal(document.querySelectorAll('select').length,0);
    await click(button('Light card'));await click(button('% Return only'));assert.equal(document.documentElement.classList.contains('light'),false);
    await click(button('Post to Velo'));assert.equal(published.data.hideAmounts,true);assert.equal(published.data.theme,'light');assert.equal(published.data.design,'minimal');assert.equal(published.image.type,'image/png');assert.match(document.querySelector('[role=alert]').textContent,/draft kept/);assert.equal(closed,false);assert.match(document.querySelector('textarea').value,/Following my long/);
  }finally{await act(async()=>root.unmount());dom.window.close();}
});
test.after(()=>rm(folder,{recursive:true,force:true}));
