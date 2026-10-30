import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
await mkdir('audit',{recursive:true});const folder=await mkdtemp(path.resolve('audit/theme-check-'));
const file=path.join(folder,'theme.mjs');
await build({entryPoints:['src/utils/appearanceTransition.ts'],outfile:file,bundle:true,format:'esm',platform:'node'});
const {transitionAppearance}=await import(pathToFileURL(file));
const origin={getBoundingClientRect:()=>({left:80,top:20,width:40,height:40})};
globalThis.innerWidth=1000;globalThis.innerHeight=800;
function setup(reduce=false){globalThis.window={matchMedia:()=>({matches:reduce})};globalThis.document={documentElement:{animate(){}}};}
test('theme changes immediately when transitions are unsupported or reduced motion is requested',()=>{
  for(const reduced of [false,true]){setup(reduced);let calls=0;
    if(reduced)document.startViewTransition=()=>{throw new Error('must not request a motion transition');};
    transitionAppearance(()=>calls++,origin);assert.equal(calls,1);
  }
});
test('supported theme transition applies once and reveals from the actual button position',async()=>{
  setup();let calls=0,animation;
  document.documentElement.animate=(frames,options)=>{animation={frames,options};};
  document.startViewTransition=update=>{update();update();return {ready:Promise.resolve(),finished:Promise.resolve(),skipTransition(){}};};
  transitionAppearance(()=>calls++,origin);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls,1);assert.equal(animation.frames.clipPath[0],'circle(0px at 100px 40px)');
  assert.equal(animation.options.pseudoElement,'::view-transition-new(root)');
});
test('theme callback is not lost or duplicated when the browser transition API throws',()=>{
  for(const alreadyApplied of [false,true]){setup();let calls=0;
    document.startViewTransition=update=>{if(alreadyApplied)update();throw new Error('transition unavailable');};
    transitionAppearance(()=>calls++,origin);assert.equal(calls,1);
  }
});
test.after(async()=>{await rm(folder,{recursive:true,force:true});});
