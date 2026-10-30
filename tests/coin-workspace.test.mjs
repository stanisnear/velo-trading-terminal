import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React,{act} from 'react';
import { mkdtemp,rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.invalid',pretendToBeVisual:true});
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.HTMLElement=dom.window.HTMLElement;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.requestAnimationFrame=callback=>setTimeout(callback,0);
globalThis.SVGElement=dom.window.SVGElement;globalThis.Element=dom.window.Element;globalThis.getComputedStyle=dom.window.getComputedStyle;
globalThis.ResizeObserver=class{observe(){}disconnect(){}};
const {createRoot}=await import('react-dom/client');
const folder=await mkdtemp(path.resolve('audit/coin-workspace-')),file=path.join(folder,'ui.mjs');
const rows=[[1700000000000,100],[1700000060000,103],[1700000120000,102]];
await build({stdin:{contents:"export * from './src/components/social/CoinComposer';export {SocialTagContext} from './src/components/social/SocialTextField';export {TokenInteractiveChart} from './src/components/TokenInteractiveChart';",resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'node',format:'esm',outfile:file,external:['react','react-dom','lucide-react'],loader:{'.css':'empty'},plugins:[{name:'offline-data',setup(b){
 b.onResolve({filter:/services\/marketDiscovery$/},()=>({path:'markets',namespace:'offline'}));
 b.onResolve({filter:/^@tanstack\/react-query$/},()=>({path:'query',namespace:'offline'}));
 b.onLoad({filter:/.*/,namespace:'offline'},args=>({contents:args.path==='query'?`export const useQuery=()=>({data:{prices:${JSON.stringify(rows)},market_caps:${JSON.stringify(rows.map(([t,v])=>[t,v*1e9]))}},isPending:false,refetch:async()=>{}});`:'export const useMarketDiscovery=()=>({socialAssets:[]});export const fetchMarketData=async()=>({});'}));
}}]});
const ui=await import(pathToFileURL(file));
const people=[{id:'stan',username:'Stan',handle:'@stan'}],assets=[{symbol:'SOL',name:'Solana',assetId:'sol'}];
function mount(view){const target=document.createElement('div');document.body.append(target);const root=createRoot(target);return{target,async render(node=view){await act(async()=>root.render(React.createElement(ui.SocialTagContext.Provider,{value:{people,assets}},node)));},async close(){await act(async()=>root.unmount());target.remove();}};}
async function type(field,value){await act(async()=>{field.focus();Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set.call(field,value);field.setSelectionRange(value.length,value.length);field.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});}
async function key(field,key){await act(async()=>field.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true})));await act(async()=>new Promise(resolve=>setTimeout(resolve,5)));}
async function submit(target){await act(async()=>target.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));}

test('coin posts add exactly one matching cashtag and reject empty drafts',()=>{
 assert.equal(ui.coinPostContent('  Watching support  ','BTC'),'Watching support\n\n$BTC');
 assert.equal(ui.coinPostContent('Watching $btc.','BTC'),'Watching $btc.');
 assert.equal(ui.coinPostContent('Watching $BTCB','BTC'),'Watching $BTCB\n\n$BTC');
 assert.equal(ui.coinPostContent(' \n ','BTC'),'');
});
test('coin composer tags people and coins, prevents duplicate sends and clears only a confirmed post',async()=>{
 let calls=[],resolve;const pending=new Promise(r=>resolve=r);
 const view=mount(React.createElement(ui.CoinComposer,{ticker:'BTC',user:{id:'stan'},onRequireAuth(){},onPostCreate:content=>{calls.push(content);return pending;}}));
 try{await view.render();const field=view.target.querySelector('textarea');
  await type(field,'Hello @st');await key(field,'Enter');assert.equal(field.value,'Hello @stan ');assert.equal(calls.length,0);
  await type(field,field.value+'watching $so');await key(field,'Enter');assert.equal(field.value,'Hello @stan watching $SOL ');
  await submit(view.target);await submit(view.target);assert.equal(calls.length,1);assert.equal(calls[0],'Hello @stan watching $SOL\n\n$BTC');assert.equal(field.disabled,true);
  await act(async()=>resolve('confirmed-post'));assert.equal(field.value,'');assert.match(view.target.querySelector('[role="status"]').textContent,/conversation and your feed/);
 }finally{await view.close();}
});
test('unconfirmed publication keeps a retryable draft and sign-in does not publish or erase it',async()=>{
 let calls=0,signins=0;const props={ticker:'BTC',onRequireAuth:()=>signins++,onPostCreate:async()=>{calls++;return null;}};
 const view=mount(React.createElement(ui.CoinComposer,props));
 try{await view.render();let field=view.target.querySelector('textarea');await type(field,'Keep this draft');await submit(view.target);assert.equal(signins,1);assert.equal(calls,0);assert.equal(field.value,'Keep this draft');
  await view.render(React.createElement(ui.CoinComposer,{...props,user:{id:'stan'}}));await submit(view.target);field=view.target.querySelector('textarea');assert.equal(field.value,'Keep this draft');assert.match(view.target.querySelector('[role="alert"]').textContent,/not confirmed/);assert.equal(field.disabled,false);
  await submit(view.target);assert.equal(calls,2);
 }finally{await view.close();}
});
test('asset chart supports keyboard inspection with the actual timestamp and both data metrics',async()=>{
 const view=mount(React.createElement(ui.TokenInteractiveChart,{ticker:'SOL',assetId:'sol',currentPrice:102,up:true}));
 try{await view.render();let slider=view.target.querySelector('[role="slider"]');await key(slider,'Home');assert.equal(slider.getAttribute('aria-valuenow'),'0');assert.match(slider.getAttribute('aria-valuetext'),/100/);
  await key(slider,'ArrowRight');assert.equal(slider.getAttribute('aria-valuenow'),'1');assert.match(slider.getAttribute('aria-valuetext'),/103/);
  await key(slider,'End');assert.equal(slider.getAttribute('aria-valuenow'),'2');
  const cap=[...view.target.querySelectorAll('button')].find(button=>button.textContent==='Market cap');await act(async()=>cap.click());slider=view.target.querySelector('[role="slider"]');assert.match(slider.getAttribute('aria-label'),/market cap/);assert.match(slider.getAttribute('aria-valuetext'),/102.0B/);
 }finally{await view.close();}
});
test.after(async()=>{dom.window.close();await rm(folder,{recursive:true,force:true});});
