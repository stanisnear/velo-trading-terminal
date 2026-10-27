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
  const data={pair:'BTC/USD',side:'LONG',entryPrice:100,collateral:10,pnl:1,pnlPct:10,status:'OPEN',updateMode:'live'};
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
