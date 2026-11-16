import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const staticMotion={name:'motion-dom-fixture',setup(b){
 b.onResolve({filter:/^motion\/react$/},()=>({path:'motion',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({resolveDir:process.cwd(),contents:`import React from 'react';
 const cache={};export const motion=new Proxy({}, {get(_,tag){return cache[tag]??(cache[tag]=React.forwardRef(function StaticMotion({initial,animate,exit,transition,layout,children,...props},ref){return React.createElement(tag,{...props,ref},children);}));}});
 export const AnimatePresence=({children})=>children;export const useReducedMotion=()=>true;export const useIsPresent=()=>true;`}));
}};
async function fixture(contents, plugins = [staticMotion]) {
  const { outputFiles } = await build({ stdin: { contents, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, loader: { '.css': 'empty' }, plugins });
  const { window } = new JSDOM('<div id="root"></div>', { runScripts: 'outside-only', url: 'https://fixture.invalid', pretendToBeVisual: true });
  window.IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = () => ({ matches: true, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  window.eval(outputFiles[0].text);
  return { window, query: selector => window.document.querySelector(selector), click: selector => window.act(() => window.document.querySelector(selector).click()) };
}

test('notification center dismisses to its trigger and opens selected destinations without stealing focus', async () => {
  const f = await fixture(`
    import React,{act,useRef,useState} from 'react'; import {createRoot} from 'react-dom/client';
    import {NotificationCenter} from './src/components/NotificationCenter';
    function Fixture(){const[open,setOpen]=useState(false),[notices,setNotices]=useState([{id:'like',message:'Atlas liked your post',type:'LIKE',timestamp:1000},{id:'fill',message:'Position closed',timestamp:2000}]);const trigger=useRef(null);return <>
      <button id="trigger" ref={trigger} onClick={()=>setOpen(!open)}>Notifications</button><button id="destination">Position details</button>
      <button id="retract" onClick={()=>setNotices(items=>items.filter(n=>n.id!=='like'))}>Retract like</button>
      <NotificationCenter open={open} notifications={notices} unreadCount={notices.length} anchorRef={trigger} onClose={()=>setOpen(false)} onMarkAllRead={()=>{}}
        onSelect={n=>{window.selected=n.id;setOpen(false);document.getElementById('destination').focus();}}/>
    </>;}window.act=act;act(()=>createRoot(document.getElementById('root')).render(<Fixture/>));`);
  try {
    f.click('#trigger');
    assert.equal(f.window.document.activeElement.getAttribute('aria-label'), 'Close notifications');
    assert.deepEqual([...f.window.document.querySelectorAll('[data-notice-id]')].map(n=>n.dataset.noticeId), ['fill','like']);
    f.click('#retract');
    assert.equal(f.query('[data-notice-id=like]'), null);
    f.window.act(()=>f.window.document.dispatchEvent(new f.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
    assert.equal(f.query('[role=dialog]'),null);
    assert.equal(f.window.document.activeElement.id,'trigger');
    f.click('#trigger'); f.click('[data-notice-id=fill]');
    assert.equal(f.window.selected,'fill');
    assert.equal(f.query('[role=dialog]'),null);
    assert.equal(f.window.document.activeElement.id,'destination');
    f.click('#trigger');
    f.window.act(()=>f.query('#destination').dispatchEvent(new f.window.PointerEvent('pointerdown',{bubbles:true})));
    assert.equal(f.query('[role=dialog]'),null);
  } finally { f.window.close(); }
});

test('trading tabs keep controls mounted and support arrow, Home and End navigation', async () => {
 const f=await fixture(`
   import React,{act,useState} from 'react';import{createRoot}from'react-dom/client';import{MotionTabs}from'./src/components/ui/MotionTabs';
   function Fixture(){const[value,setValue]=useState('positions');return <><MotionTabs label="Trading activity" value={value} onChange={setValue} panelId="panel" options={['positions','orders','history'].map(value=>({value,label:value}))}/><div id="panel" role="tabpanel">{value}</div></>;}
   window.act=act;act(()=>createRoot(document.getElementById('root')).render(<Fixture/>));`);
 try{
  const first=f.query('[role=tab]');first.focus();
  const key=value=>f.window.act(()=>f.window.document.activeElement.dispatchEvent(new f.window.KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true})));
  key('ArrowRight');assert.equal(f.query('[aria-selected=true]').textContent,'orders');assert.equal(f.query('#panel').textContent,'orders');assert.equal(f.query('[role=tab]'),first);
  key('End');assert.equal(f.query('[aria-selected=true]').textContent,'history');
  key('ArrowRight');assert.equal(f.query('[aria-selected=true]'),first);
  key('Home');assert.equal(f.window.document.activeElement,first);
  assert.equal(f.query('[aria-selected=true]').getAttribute('aria-controls'),'panel');
  assert.equal([...f.window.document.querySelectorAll('[role=tab]')].filter(n=>n.tabIndex===0).length,1);
 }finally{f.window.close();}
});

test('view motion runs only for navigation, cancels interruptions and preserves fields', async () => {
 const motionStub={name:'reduced-motion-fixture',setup(b){b.onResolve({filter:/^motion\/react$/},()=>({path:'motion',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const useReducedMotion=()=>false;'}));}};
 const f=await fixture(`
  import React,{act,useRef,useState}from'react';import{createRoot}from'react-dom/client';import{useViewMotion}from'./src/hooks/useViewMotion';
  window.runs=0;window.cancels=0;Element.prototype.animate=function(){window.runs++;return{cancel(){window.cancels++;}}};
  function Fixture(){const[view,setView]=useState('trade'),[price,setPrice]=useState(1),ref=useRef(null);useViewMotion(ref,view);return <><button id="page" onClick={()=>setView(v=>v==='trade'?'social':'trade')}>Page</button><button id="tick" onClick={()=>setPrice(p=>p+1)}>Tick</button><main ref={ref}><input id="draft" defaultValue="Unsent draft"/>{price}</main></>;}
  window.act=act;act(()=>createRoot(document.getElementById('root')).render(<Fixture/>));`,[motionStub]);
 try{
  const input=f.query('#draft');assert.equal(f.window.runs,0);f.click('#tick');assert.equal(f.window.runs,0);
  f.click('#page');assert.equal(f.window.runs,1);assert.equal(f.query('#draft'),input);assert.equal(input.value,'Unsent draft');
  f.click('#tick');assert.equal(f.window.runs,1);f.click('#page');assert.equal(f.window.runs,2);assert.equal(f.window.cancels,1);
 }finally{f.window.close();}
});
