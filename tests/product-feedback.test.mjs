import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';

const folder=await mkdtemp(path.resolve('audit/product-feedback-'));
const file=path.join(folder,'feedback.mjs');
await build({stdin:{contents:"export * from './src/components/ui/CopyButton';export * from './src/services/interfaceSound';",resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'node',format:'esm',outfile:file,external:['react','react-dom','lucide-react']});
const ui=await import(pathToFileURL(file));
const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.invalid',pretendToBeVisual:true});
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.localStorage=dom.window.localStorage;globalThis.Event=dom.window.Event;globalThis.IS_REACT_ACT_ENVIRONMENT=true;

test('interface sounds are opt-in, reuse one context and coalesce duplicate feedback',()=>{
  let contexts=0,tones=0;
  window.AudioContext=class {
    constructor(){contexts++;this.state='running';this.currentTime=0;}
    createOscillator(){return {frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){},start(){tones++;},stop(){this.onended?.();}};}
    createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
  };
  ui.playInterfaceSound('CLICK');assert.equal(contexts,0);
  ui.setInterfaceSounds(true);assert.equal(ui.interfaceSoundsEnabled(),true);
  ui.playInterfaceSound('SUCCESS');ui.playInterfaceSound('SUCCESS');
  assert.equal(contexts,1);assert.equal(tones,1);
  ui.setInterfaceSounds(false);ui.playInterfaceSound('ERROR');assert.equal(tones,1);
});
test('copy confirmation follows clipboard success and exposes a failure instead of false success',async()=>{
  let reject=true,copied='';
  Object.defineProperty(globalThis,'navigator',{value:{clipboard:{writeText:async value=>{if(reject)throw new Error('denied');copied=value;}}},configurable:true});
  const root=createRoot(document.querySelector('#root'));
  try {
    await act(async()=>root.render(React.createElement(ui.CopyButton,{value:'0x1234',label:'Copy transaction'})));
    await act(async()=>document.querySelector('button').click());
    assert.equal(document.querySelector('[role="alert"]').textContent,'Copy unavailable');
    assert.equal(document.querySelector('button').getAttribute('data-state'),'error');
    reject=false;await act(async()=>document.querySelector('button').click());
    assert.equal(copied,'0x1234');assert.equal(document.querySelector('[role="status"]').textContent,'Copied');
    assert.equal(document.querySelector('button').disabled,false);
  } finally {await act(async()=>root.unmount());}
});
test.after(async()=>{dom.window.close();await rm(folder,{recursive:true,force:true});});
