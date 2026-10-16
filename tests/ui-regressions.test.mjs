import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const owner='0x0000000000000000000000000000000000000001';
const mocked = {
 wagmi:`export const useAccount=()=>({address:'${owner}'}); export const useBalance=()=>({}); export const useChainId=()=>84532; export const usePublicClient=()=>({}); export const useReadContract=()=>({}); export const useSignMessage=()=>({signMessageAsync:async()=>'0x11'}); export const useWalletClient=()=>({});`,
 store:`const query=()=>{const q={then:(yes,no)=>Promise.resolve(globalThis.__veloTestQuery()).then(yes,no)};for(const k of ['select','eq','order','limit','abortSignal'])q[k]=()=>q;return q;}; const channel={on(){return this},subscribe(){return this}};export const supabase={rpc:async()=>({data:null,error:null}),from:query};export const publicSupabase={from:query,channel:()=>channel,removeChannel:async()=>{}};export const isConfigured=()=>true;`,
 perps:`export const VELO_USDC_BASE='0x0000000000000000000000000000000000000002';`,
 prices:`export const pythPriceStream={getPrice:()=>0,subscribe:()=>()=>{}};`,
};
await mkdir('audit',{recursive:true});
const folder=await mkdtemp(path.resolve('audit/ui-regression-'));
const output=path.join(folder,'components.mjs');
await build({stdin:{contents:"export { SettingsModal } from './src/components/SettingsModal'; export { OrderDetailsModal } from './src/components/ui/OrderDetailsModal'; export { OrderBook } from './src/components/OrderBook'; export { buildBurnerFromSignature, storeBurner } from './src/services/veloBurnerWallet';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:output,external:['react','react-dom','react/jsx-runtime','lucide-react'],plugins:[{name:'isolated-fixtures',setup(b){
 b.onResolve({filter:/^(wagmi)$|supabaseStore$|veloPerpsService$|pythPriceService$/},args=>({path:args.path==='wagmi'?'wagmi':args.path.endsWith('supabaseStore')?'store':args.path.endsWith('veloPerpsService')?'perps':'prices',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:mocked[args.path],loader:'js'}));
}}]});
const {SettingsModal,OrderDetailsModal,OrderBook,buildBurnerFromSignature,storeBurner}=await import(pathToFileURL(output));
function setup(){
 const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://fixture.invalid',pretendToBeVisual:true});
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.localStorage=dom.window.localStorage;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
 globalThis.__veloTestQuery=()=>({data:[],error:null});
 const root=createRoot(document.querySelector('#root'));
 return {dom,root,close:async()=>{await act(async()=>root.unmount());dom.window.close();}};
}
const click=async label=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.includes(label));assert.ok(button,`Button ${label} exists`);await act(async()=>button.click());};
test('private-key confirmation/reveal survives fresh profile props and price refreshes',async()=>{
 const f=setup();const burner=buildBurnerFromSignature(owner,'0x'+'11'.repeat(65));storeBurner(burner);
 const render=()=>f.root.render(React.createElement(SettingsModal,{isOpen:true,onClose:()=>{},profile:{id:'fixture',username:'tester',email:'',veloWalletAddress:burner.veloAddress}}));
 try {
  await act(async()=>render());await click('Reveal Private Key');
  await act(async()=>render());assert.match(document.body.textContent,/I understand — show me/);
  await click('I understand — show me');await act(async()=>render());
  assert.match(document.body.textContent,/Hide Key/);assert.ok(document.body.textContent.includes(burner.privateKey));
 } finally {await f.close();}
});
test('trade detail tooltip stays open while market prices update',async()=>{
 const f=setup();const item={id:'fixture',pair:'BTC/USD',side:'LONG',entryPrice:50000,exitPrice:51000,size:1000,pnl:20,timestamp:Date.now(),action:'CLOSE',leverage:10};
 const render=price=>f.root.render(React.createElement(OrderDetailsModal,{payload:{kind:'HISTORY',item:{...item}},marketPrices:{'BTC/USD':price},onClose:()=>{},onClosePosition:()=>{},onEditPosition:()=>{},handleCancelOrder:()=>{}}));
 try {
  await act(async()=>render(51000));const label=[...document.querySelectorAll('span')].find(e=>e.textContent==='Entry Price');assert.ok(label);
  await act(async()=>{label.dispatchEvent(new window.MouseEvent('mouseover',{bubbles:true}));await new Promise(r=>setTimeout(r,80));});
  assert.match(document.body.textContent,/The average price at which this position was opened/);
  await act(async()=>render(51010));assert.match(document.body.textContent,/The average price at which this position was opened/);
 } finally {await f.close();}
});
test('failed fills request shows an error, and Retry recovers without clearing browser storage',async()=>{
 const f=setup();globalThis.__veloTestQuery=()=>({data:null,error:{message:'Offline'}});
 try {
  await act(async()=>f.root.render(React.createElement(OrderBook,{price:50000,pair:'BTC/USD',openOrders:[]})));
  assert.match(document.body.textContent,/Unable to refresh fills/);assert.doesNotMatch(document.body.textContent,/No fills yet/);
  globalThis.__veloTestQuery=()=>({data:[{id:'fill',pair:'BTC/USD',side:'LONG',entry_price:50123,size:1000,action:'OPEN',created_at:new Date().toISOString()}],error:null});
  await click('Retry');assert.doesNotMatch(document.body.textContent,/Unable to refresh fills|No fills yet|Loading fills/);assert.match(document.body.textContent,/50,123/);
 } finally {await f.close();}
});
test('successful empty fills read is distinct from a failed request',async()=>{
 const f=setup();try{await act(async()=>f.root.render(React.createElement(OrderBook,{price:1,pair:'ETH/USD',openOrders:[]})));assert.match(document.body.textContent,/No fills yet/);assert.doesNotMatch(document.body.textContent,/Unable to refresh/);}finally{await f.close();}
});
test.after(async()=>{await rm(folder,{recursive:true,force:true});});
