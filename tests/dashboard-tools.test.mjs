import test from 'node:test';import assert from 'node:assert/strict';import React,{act}from'react';import{JSDOM}from'jsdom';import{build}from'esbuild';import{mkdtemp,rm}from'node:fs/promises';import path from'node:path';import{pathToFileURL}from'node:url';
test('account allocation keeps PnL separate, updates values in place, and account dock preserves keyboard and callback behavior',async()=>{
 const folder=await mkdtemp(path.resolve('audit/dashboard-tools-')),file=path.join(folder,'tools.mjs');
 await build({stdin:{contents:"export{AccountOverview}from'./src/components/ui/AccountOverview';export{DashboardActions}from'./src/components/ui/DashboardActions';",resolveDir:process.cwd(),loader:'tsx'},outfile:file,bundle:true,platform:'node',format:'esm',external:['react','react-dom','lucide-react','motion/react'],loader:{'.css':'empty'}});
 const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true});globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.Element=dom.window.Element;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 dom.window.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
 const{createRoot}=await import('react-dom/client'),{AccountOverview,DashboardActions}=await import(pathToFileURL(file)),root=createRoot(document.querySelector('#root'));
 const key=(element,key)=>element.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key,bubbles:true}));
 try{
  await act(async()=>root.render(React.createElement(AccountOverview,{equity:350,available:100,margin:200,pnl:50})));
  const trigger=document.querySelector('button');await act(async()=>{trigger.focus();trigger.click();});
  assert.match(document.querySelector('[role=img]').getAttribute('aria-label'),/66.7%/);assert.match(document.querySelector('.account-overview-pnl').textContent,/50.00/);
  const available=document.querySelector('[aria-label="Inspect collateral allocation"] button');await act(async()=>available.click());assert.equal(available.getAttribute('aria-pressed'),'true');assert.match(document.querySelector('.account-allocation-chart').textContent,/33.3%/);
  await act(async()=>root.render(React.createElement(AccountOverview,{equity:400,available:200,margin:200,pnl:0})));assert.match(document.querySelector('.account-allocation-chart').textContent,/50.0%/);assert.equal(document.activeElement,trigger);
  await act(async()=>document.querySelector('.account-overview-done').click());assert.equal(document.querySelector('dialog'),null);assert.equal(document.activeElement,trigger);
  const calls=[];await act(async()=>root.render(React.createElement(DashboardActions,{deposit:()=>calls.push('deposit'),withdraw:()=>calls.push('withdraw'),faucet:()=>calls.push('faucet'),send:()=>calls.push('send'),claiming:true})));
  const buttons=[...document.querySelectorAll('button')];assert.equal(buttons.length,4);assert.equal(buttons[2].disabled,true);
  await act(async()=>{buttons[0].focus();key(buttons[0],'ArrowRight');});assert.equal(document.activeElement,buttons[1]);
  await act(async()=>key(buttons[1],'ArrowRight'));assert.equal(document.activeElement,buttons[3],'arrow navigation skips pending faucet');
  await act(async()=>buttons[3].click());assert.deepEqual(calls,['send']);await act(async()=>buttons[0].click());assert.deepEqual(calls,['send','deposit']);
  await act(async()=>root.render(React.createElement(AccountOverview,{equity:0,available:0,margin:0,pnl:0})));await act(async()=>document.querySelector('button').click());assert.doesNotMatch(document.body.textContent,/NaN|Infinity/);
 }finally{await act(async()=>root.unmount());dom.window.close();await rm(folder,{recursive:true,force:true});}
});
