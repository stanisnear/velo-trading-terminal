import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {mountPressFeedback} from '../src/services/pressFeedback.mjs';
test('press feedback never clicks or submits; ignores disabled controls and reduced motion; cleans up',async()=>{
 const dom=new JSDOM('<form><button type="button" id="action">Like</button><button disabled id="disabled">Save</button><textarea></textarea></form><dialog open><button id="inside">Wallet</button></dialog>',{pretendToBeVisual:true});
 const {document}=dom.window;let reduced=false,clicks=0,submits=0;
 dom.window.matchMedia=()=>({matches:reduced});document.querySelector('#action').addEventListener('click',()=>clicks++);document.querySelector('form').addEventListener('submit',e=>{e.preventDefault();submits++;});
 const completions=[];dom.window.Element.prototype.animate=function(){let done;const finished=new Promise(resolve=>done=resolve);completions.push(done);return{finished};};
 dom.window.Element.prototype.getBoundingClientRect=()=>({left:10,top:20,width:100,height:40});
 const dispose=mountPressFeedback(document),press=(target,type='pointerdown',extra={})=>target.dispatchEvent(type==='keydown'?new dom.window.KeyboardEvent(type,{key:'Enter',bubbles:true,...extra}):new dom.window.MouseEvent(type,{bubbles:true,button:0,clientX:30,clientY:30,...extra}));
 try{
  press(document.querySelector('#action'));assert.equal(clicks,0);assert.equal(submits,0);assert.equal(document.querySelectorAll('.velo-press-bloom').length,1);
  document.querySelector('#action').click();assert.equal(clicks,1);
  press(document.querySelector('#disabled'));press(document.querySelector('textarea'),'keydown');assert.equal(completions.length,1);
  press(document.querySelector('#inside'),'keydown');assert.ok(document.querySelector('dialog>.velo-press-bloom'));assert.equal(submits,0);
  reduced=true;press(document.querySelector('#action'));assert.equal(completions.length,2);
  completions.forEach(done=>done());await Promise.resolve();assert.equal(document.querySelectorAll('.velo-press-bloom').length,0);
  reduced=false;press(document.querySelector('#action'));dispose();assert.equal(document.querySelectorAll('.velo-press-bloom').length,0);press(document.querySelector('#action'));assert.equal(completions.length,3);
 }finally{dispose();dom.window.close();}
});
