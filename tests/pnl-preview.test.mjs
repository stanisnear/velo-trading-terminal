import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

test('PnL preview hides an outdated amount presentation immediately and retains image URLs until replacement loads',async()=>{
  await mkdir('audit',{recursive:true});const dir=await mkdtemp(path.resolve('audit/pnl-preview-')),file=path.join(dir,'preview.mjs');
  await build({entryPoints:['src/components/PnlImage.tsx'],outfile:file,bundle:true,platform:'node',format:'esm',external:['react'],plugins:[{name:'renderer',setup(b){b.onResolve({filter:/\/tradeImage$/},()=>({path:'render',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const renderTradePng=(...args)=>globalThis.__pnlRender(...args);'}));}}]});
  const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true});globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL;const generated=[],revoked=[];
  URL.createObjectURL=()=>`blob:preview-${generated.length}`;URL.revokeObjectURL=url=>revoked.push(url);
  globalThis.__pnlRender=async data=>{generated.push(data);return new Blob(['PNG'],{type:'image/png'});};
  const {PnlImage}=await import(pathToFileURL(file));const root=createRoot(document.querySelector('#root'));
  const data={pair:'BTC/USD',side:'LONG',entryPrice:100,collateral:10,pnl:1,pnlPct:10,status:'OPEN',updateMode:'snapshot'};
  try{
    await act(async()=>root.render(React.createElement(PnlImage,{data})));await act(async()=>new Promise(resolve=>setTimeout(resolve,20)));
    const first=document.querySelector('img').src;assert.equal(generated.length,1);
    await act(async()=>root.render(React.createElement(PnlImage,{data:{...data,hideAmounts:true}})));
    assert.ok(!document.querySelector('img'),'the old dollar image must not remain while the percentage image is prepared');
    assert.ok(!revoked.includes(first),'keep the prior URL until its replacement has decoded');
    await act(async()=>new Promise(resolve=>setTimeout(resolve,1050)));
    assert.equal(generated.at(-1).hideAmounts,true);const next=document.querySelector('img');assert.notEqual(next.src,first);assert.match(next.alt,/10.00%/);
    await act(async()=>next.dispatchEvent(new dom.window.Event('load')));assert.ok(revoked.includes(first));
    const count=generated.length;await act(async()=>root.render(React.createElement(PnlImage,{active:false,data:{...data,hideAmounts:true,pnl:2}})));
    await act(async()=>new Promise(resolve=>setTimeout(resolve,1050)));assert.equal(generated.length,count,'hidden previews do not render each quote');
  }finally{await act(async()=>root.unmount());URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;delete globalThis.__pnlRender;dom.window.close();await rm(dir,{recursive:true,force:true});}
});

test('live cards keep their DOM through quotes, never rasterize, and render one immutable settlement image',async()=>{
 await mkdir('audit',{recursive:true});const dir=await mkdtemp(path.resolve('audit/pnl-live-')),file=path.join(dir,'preview.mjs');
 await build({entryPoints:['src/components/PnlImage.tsx'],outfile:file,bundle:true,platform:'node',format:'esm',external:['react'],plugins:[{name:'renderer',setup(b){b.onResolve({filter:/\/tradeImage$/},()=>({path:'render',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const renderTradePng=(...args)=>globalThis.__liveRender(...args);'}));}}]});
 const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true});globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL;const generated=[];URL.createObjectURL=()=>`blob:settlement-${generated.length}`;URL.revokeObjectURL=()=>{};
 globalThis.__liveRender=async data=>{generated.push(data);return new Blob(['PNG'],{type:'image/png'});};
 const{PnlImage}=await import(pathToFileURL(file)),root=createRoot(document.querySelector('#root'));const data={pair:'SOL/USD',side:'LONG',leverage:10,entryPrice:100,collateral:10,size:100,pnl:1,pnlPct:10,status:'OPEN',updateMode:'live',theme:'dark'};
 try{
  await act(async()=>root.render(React.createElement(PnlImage,{data,imageUrl:'https://fixture.invalid/old-open.png'})));const card=document.querySelector('.pnl-live-card'),value=document.querySelector('.pnl-live-result');assert.ok(card);
  for(let n=2;n<8;n++)await act(async()=>root.render(React.createElement(PnlImage,{data:{...data,pnl:n,pnlPct:n*10,markPrice:100+n}})));
  assert.equal(document.querySelector('.pnl-live-card'),card);assert.equal(document.querySelector('.pnl-live-result'),value);assert.equal(document.querySelector('img'),null);assert.equal(generated.length,0);
  await act(async()=>root.render(React.createElement(PnlImage,{data:{...data,hideAmounts:true}})));assert.equal(document.querySelector('.pnl-live-facts').children.length,2);assert.doesNotMatch(document.querySelector('.pnl-live-facts').textContent,/Margin invested/);assert.equal(generated.length,0);
  const closed={...data,status:'CLOSED',closePrice:104,pnl:4,pnlPct:40};await act(async()=>root.render(React.createElement(PnlImage,{data:closed,imageUrl:'https://fixture.invalid/old-open.png'})));assert.match(document.querySelector('.pnl-live-footer').textContent,/Position settled/);
  await act(async()=>new Promise(resolve=>setTimeout(resolve,20)));assert.equal(generated.length,1);assert.equal(generated[0].status,'CLOSED');assert.equal(generated[0].closePrice,104);
  const image=document.querySelector('img');assert.equal(image.src,'blob:settlement-1');await act(async()=>image.dispatchEvent(new dom.window.Event('load')));assert.equal(document.querySelector('.pnl-live-card'),null);
  await act(async()=>root.render(React.createElement(PnlImage,{data:{...closed,markPrice:999,updatedAt:Date.now()}})));await act(async()=>new Promise(resolve=>setTimeout(resolve,30)));assert.equal(generated.length,1);assert.equal(document.querySelector('img'),image);
  await act(async()=>root.render(React.createElement(PnlImage,{data:{...closed,closedSnapshot:true,markPrice:102,closePrice:999}})));assert.match(document.querySelector('.pnl-live-facts').textContent,/Captured mark/);assert.doesNotMatch(document.querySelector('.pnl-live-facts').textContent,/999/);
 }finally{await act(async()=>root.unmount());URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;delete globalThis.__liveRender;dom.window.close();await rm(dir,{recursive:true,force:true});}
});
