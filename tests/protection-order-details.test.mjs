import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {mkdtemp,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {tradeFixturePlugin} from './fixtures/trade-view.mjs';
import {activeTradingOrders} from '../src/services/activeTradingOrders.mjs';
const folder=await mkdtemp(path.resolve('audit/protection-details-')),file=path.join(folder,'view.mjs');
await build({entryPoints:['src/components/ui/OrderDetailsModal.tsx'],outfile:file,bundle:true,platform:'node',format:'esm',external:['react','react-dom','lucide-react'],loader:{'.css':'empty'},plugins:[tradeFixturePlugin]});
const {OrderDetailsModal}=await import(pathToFileURL(file));
test('existing unsupported protection is labeled sell-to-close, explains its bound, and remains cancellable',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.invalid'});
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const {createRoot}=await import('react-dom/client'),root=createRoot(document.querySelector('#root')),cancelled=[];
 const [order]=activeTradingOrders([],[{tradeId:5n,pair:'PYTH-USD',isLong:true,entryPrice:.0616,takeProfit:100000,notionalUSDC:10141.74,leverage:10,openedAt:100,v4:{}}],'0x01');
 try{
  await act(async()=>root.render(React.createElement(OrderDetailsModal,{payload:{kind:'ORDER',item:order},marketPrices:{'PYTH/USD':.0654},onClose(){},onClosePosition(){},onEditPosition(){},handleCancelOrder:id=>cancelled.push(id)})));
  assert.match(document.querySelector('.trade-dialog-identity').textContent,/CLOSE LONG/);
  assert.match(document.body.textContent,/Review trigger/);
  assert.match(document.querySelector('[role=alert]').textContent,/0.1232.*engine profit limit/);
  const cancel=[...document.querySelectorAll('button')].find(b=>b.textContent==='Cancel Order');
  assert(cancel&&!cancel.disabled);await act(async()=>cancel.click());assert.deepEqual(cancelled,[order.id]);
 }finally{await act(async()=>root.unmount());dom.window.close();}
});
test.after(()=>rm(folder,{recursive:true,force:true}));
