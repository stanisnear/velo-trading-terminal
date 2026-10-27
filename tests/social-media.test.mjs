import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {socialTokenAt,insertSocialTag} from '../src/utils/socialTagging.mjs';

const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true,url:'https://velo.test/social'});
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.HTMLElement=dom.window.HTMLElement;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.requestAnimationFrame=callback=>setTimeout(callback,0);
const {createRoot}=await import('react-dom/client');
dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
const people=[{id:'stan',username:'Stan',handle:'@stan',avatar:'/avatar.png'}];
const assets=[{symbol:'BTC',name:'Bitcoin',assetId:'btc',logo:'/btc.png'},{symbol:'SOL',name:'Solana',assetId:'sol',logo:'/sol.png'}];
await mkdir('audit',{recursive:true});const folder=await mkdtemp(path.resolve('audit/social-media-')),file=path.join(folder,'ui.mjs');
await build({stdin:{contents:"export{SocialTextField,SocialTagContext}from'./src/components/social/SocialTextField';export{VeloShareCard}from'./src/components/VeloShareCard';export{PostCard}from'./src/components/social/PostCard';export{renderTradePng}from'./src/utils/tradeImage';",resolveDir:process.cwd(),loader:'ts'},outfile:file,bundle:true,format:'esm',platform:'node',external:['react','react-dom','lucide-react'],loader:{'.css':'empty'},plugins:[{name:'fixtures',setup(b){
  b.onResolve({filter:/services\/marketDiscovery$/},()=>({path:'markets',namespace:'fixture'}));
  b.onResolve({filter:/services\/sharedPosition$/},()=>({path:'chain',namespace:'fixture'}));
  b.onResolve({filter:/\/tradeImage$/},args=>args.importer.endsWith('VeloShareCard.tsx')?{path:'image',namespace:'fixture'}:undefined);
  b.onResolve({filter:/\/PnlImage$/},()=>({path:'pnl',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='markets'?`export const useMarketDiscovery=()=>({socialAssets:${JSON.stringify(assets)}});`:args.path==='chain'?"export const SHARED_ENGINE='0x'+'ab'.repeat(20);export const hasPositionReference=d=>!!d.tradeId;export const readSharedPosition=async d=>d;export const readPositionEvidence=async()=>({});":args.path==='image'?"export const renderTradePng=async()=>new Blob(['PNG'],{type:'image/png'});":"import React from 'react';export const PnlImage=({data})=>React.createElement('img',{className:'pnl-image',src:'/fixture.png',alt:data.pair+' PnL image'});"}));
}}]});
const {SocialTextField,SocialTagContext,VeloShareCard,PostCard,renderTradePng}=await import(pathToFileURL(file));
const click=async button=>{assert.ok(button);await act(async()=>button.click());};
const key=async(field,value)=>{await act(async()=>field.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true})));await act(async()=>new Promise(resolve=>setTimeout(resolve,5)));};
async function type(field,value,cursor=value.length){await act(async()=>{field.focus();Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set.call(field,value);field.setSelectionRange(cursor,cursor);field.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});}
function mount(view){const target=document.createElement('div');document.body.append(target);const root=createRoot(target);return {root,target,async render(){await act(async()=>root.render(React.createElement(SocialTagContext.Provider,{value:{people,assets}},view)));},async close(){await act(async()=>root.unmount());target.remove();}};}
const share={pair:'SOL/USD',side:'LONG',leverage:10,entryPrice:101,markPrice:103,size:8765,collateral:987,pnl:123.45,pnlPct:12.5,status:'OPEN',presentation:'pnl',updateMode:'snapshot',updatedAt:1700000000000};

test('tag detection respects boundaries, caret edits and dotted market symbols',()=>{
  assert.equal(socialTokenAt('mail@example.com',16),null);
  assert.equal(socialTokenAt('@stan',5,2),null);
  const middle='Watch $solana today';const active=socialTokenAt(middle,9);
  assert.deepEqual(insertSocialTag(middle,active,'$SOL'),{text:'Watch $SOL today',cursor:10});
  assert.equal(socialTokenAt('($BTC.B',7).query,'BTC.B');
  assert.deepEqual(insertSocialTag('Hi @st, welcome',socialTokenAt('Hi @st, welcome',6),'@stan'),{text:'Hi @stan, welcome',cursor:8});
});

test('shared editor selects people and coins without submitting, preserves surrounding text and dismisses with Escape',async()=>{
  let value='',submissions=0;
  function View(){const [text,setText]=React.useState('');value=text;return React.createElement(SocialTextField,{'aria-label':'Note',value:text,onValueChange:setText,onSubmit(){submissions++;}});}
  const view=mount(React.createElement(View));try{await view.render();const field=view.target.querySelector('textarea');
    await type(field,'Hello @st');assert.match(document.querySelector('[role=listbox]').textContent,/@stan/);
    await key(field,'Enter');assert.equal(value,'Hello @stan ');assert.equal(submissions,0);assert.ok(document.activeElement===field,"focus returns to the editor");assert.equal(field.selectionStart,12);
    await type(field,'Hello @stan and $s');assert.match(document.querySelector('[role=listbox]').textContent,/Solana/);
    await key(field,'Tab');assert.equal(value,'Hello @stan and $SOL ');
    await type(field,'Hello @st');await key(field,'Escape');assert.ok(!document.querySelector('[role=listbox]'),'suggestions close on Escape');assert.equal(value,'Hello @st');
  }finally{await view.close();}
});

test('blank ticker suggestions support arrow selection, composition input and touch choice',async()=>{
  let value='';
  function View(){const [text,setText]=React.useState('');value=text;return React.createElement(SocialTextField,{'aria-label':'Note',value:text,onValueChange:setText});}
  const view=mount(React.createElement(View));try{await view.render();const field=view.target.querySelector('textarea');
    await type(field,'$');await key(field,'ArrowDown');await key(field,'Enter');assert.equal(value,'$SOL ');
    await type(field,'@st');await act(async()=>field.dispatchEvent(new dom.window.CompositionEvent('compositionstart',{bubbles:true})));
    assert.ok(!document.querySelector('[role=listbox]'));await key(field,'Enter');assert.equal(value,'@st');
    await act(async()=>field.dispatchEvent(new dom.window.CompositionEvent('compositionend',{bubbles:true})));
    const option=document.querySelector('[role=option]');assert.ok(option);
    const touch=new dom.window.Event('pointerdown',{bubbles:true,cancelable:true});Object.defineProperty(touch,'pointerType',{value:'touch'});
    await act(async()=>option.dispatchEvent(touch));assert.equal(touch.defaultPrevented,true);await click(option);
    await act(async()=>new Promise(resolve=>setTimeout(resolve,5)));assert.equal(value,'@stan ');assert.ok(document.activeElement===field);
  }finally{await view.close();}
});

test('PnL sharing note provides tagging inside its native dialog and keeps the completed note on publish failure',async()=>{
  let submitted;
  const view=mount(React.createElement(VeloShareCard,{isOpen:true,data:share,onClose(){},onPost:async content=>{submitted=content;throw Error('Offline; draft preserved');}}));
  try{await view.render();const dialog=document.querySelector('dialog'),field=dialog.querySelector('textarea');
    await type(field,'Discussing with @st');assert.ok(dialog.contains(document.querySelector('[role=listbox]')),'suggestions must share the dialog top layer');
    await key(field,'Enter');await type(field,field.value+'$bt');await key(field,'Tab');
    await click([...dialog.querySelectorAll('button')].find(b=>b.textContent==='Post to Velo'));
    assert.equal(submitted,'Discussing with @stan $BTC');assert.equal(field.value,'Discussing with @stan $BTC ');assert.match(dialog.querySelector('[role=alert]').textContent,/draft preserved/);
  }finally{await view.close();}
});

test('expanded image reuses the live post actions/comments and returns focus to its preview',async()=>{
  const user={id:'me',username:'Me',avatar:'/me.png'},post={id:'p1',authorId:'stan',authorHandle:'@stan',authorAvatar:'/avatar.png',timestamp:Date.now(),content:'Watching $SOL with @stan',likes:0,reposts:0,likedBy:[],repostedBy:[],comments:[],tradeSnapshot:share};
  let comment;
  function View(){const [current,setCurrent]=React.useState(post);return React.createElement(PostCard,{post:current,user,traders:people,onViewProfile(){},onTickerClick(){},onLike:id=>setCurrent(p=>({...p,likes:p.likes+1,likedBy:['me']})),onRepost(){},onComment:async(id,text)=>{comment={id,text};},onDeleteComment(){}});}
  const view=mount(React.createElement(View));try{await view.render();const preview=view.target.querySelector('.post-image-preview');assert.ok(preview);preview.focus();await click(preview);
    const dialog=document.querySelector('dialog[open]');assert.ok(dialog);assert.match(dialog.querySelector('.post-media-discussion').textContent,/Watching/);assert.equal(dialog.querySelectorAll('.post-image-preview').length,0,'discussion must not recursively open another media viewer');
    const like=dialog.querySelector('[aria-label=Like]');await click(like);assert.match(like.textContent,/1/);assert.match(view.target.querySelector('[aria-label=Like]').textContent,/1/);
    const field=dialog.querySelector('textarea');await type(field,'Agree with @st');await key(field,'Tab');await type(field,field.value+'$so');await key(field,'Enter');
    await click([...dialog.querySelectorAll('button')].find(b=>b.textContent==='Reply'));assert.deepEqual(comment,{id:'p1',text:'Agree with @stan $SOL'});assert.equal(field.value,'');
    await click(dialog.querySelector('[aria-label="Close Post image"]'));assert.ok(!document.querySelector('dialog'),'dialog closes');assert.ok(document.activeElement===preview,"focus returns to the image");
  }finally{await view.close();}
});

test('image export uses a 2400×1600 backing canvas and loads the branded font weights',async()=>{
  const original=document.createElement.bind(document),texts=[],loads=[];let canvas,scale;
  const ctx=new Proxy({measureText:()=>({width:400}),scale:(...v)=>{scale=v;},fillText:value=>texts.push(value),createLinearGradient:()=>({addColorStop(){}})},{get:(target,key)=>key in target?target[key]:()=>{},set:(target,key,value)=>(target[key]=value,true)});
  document.createElement=(name,...args)=>{const node=original(name,...args);if(name==='canvas'){canvas=node;node.getContext=()=>ctx;node.toBlob=callback=>callback(new Blob(['PNG'],{type:'image/png'}));}return node;};
  Object.defineProperty(document,'fonts',{configurable:true,value:{load:async font=>{loads.push(font);}}});
  globalThis.getComputedStyle=dom.window.getComputedStyle;
  globalThis.Image=class{set src(value){queueMicrotask(()=>this.onload?.());}};
  try{const png=await renderTradePng({...share,hideAmounts:true},false,true);assert.equal(canvas.width,2400);assert.equal(canvas.height,1600);assert.deepEqual(scale,[2,2]);assert.equal(png.type,'image/png');assert.ok(loads.some(font=>font.startsWith('italic 56px')));assert.ok(texts.includes('+12.50%'));assert.ok(!texts.includes('Margin invested'));}
  finally{document.createElement=original;delete globalThis.Image;}
});

test.after(async()=>{dom.window.close();await rm(folder,{recursive:true,force:true});});
