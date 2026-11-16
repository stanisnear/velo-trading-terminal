import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

test('account categories select independently and reconcile when reserved collateral disappears', async () => {
  const {outputFiles}=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
    import React,{act,useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {AccountOverview} from './src/components/ui/AccountOverview';
    import {DiscussionReveal} from './src/components/ui/ProductMotion';
    function Fixture(){
      const [reserved,setReserved]=useState(100),[open,setOpen]=useState(false);
      return <><button id="clear" onClick={()=>setReserved(0)}>Clear reserve</button>
        <AccountOverview equity={1050} available={600} margin={300} reserved={reserved} pnl={50}/>
        <button id="thread" onClick={()=>setOpen(!open)}>Discussion</button>
        <DiscussionReveal id="comments" open={open}><textarea aria-label="Reply"/></DiscussionReveal></>;
    }
    window.act=act;window.root=createRoot(document.getElementById('root'));act(()=>window.root.render(<Fixture/>));
  `},bundle:true,write:false,loader:{'.css':'empty'}});
  const {window}=new JSDOM('<div id="root"></div>',{runScripts:'outside-only',url:'https://fixture.invalid'});
  window.IS_REACT_ACT_ENVIRONMENT=true;
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  try{
    window.eval(outputFiles[0].text);
    const query=selector=>window.document.querySelector(selector);
    const click=selector=>window.act(()=>query(selector).click());
    assert.equal(query('textarea'),null,'closed discussions do not mount a composer');
    click('#thread');assert(query('textarea'));
    click('#thread');assert.equal(query('textarea'),null);
    click('[aria-label="View equity breakdown"]');
    const choices=()=>[...window.document.querySelectorAll('.account-allocation-legend button')];
    assert.equal(choices().length,3);
    window.act(()=>choices()[2].click());
    assert.equal(choices().filter(button=>button.getAttribute('aria-pressed')==='true').length,1);
    assert.match(query('.account-allocation-chart').getAttribute('aria-label'),/Pending order collateral: 10.0%/);
    window.act(()=>choices()[0].click());
    assert.match(query('.account-allocation-chart').getAttribute('aria-label'),/Available balance: 60.0%/);
    window.act(()=>choices()[2].click());click('#clear');
    assert.equal(choices().length,2);
    assert.equal(choices().filter(button=>button.getAttribute('aria-pressed')==='true').length,1);
    assert.match(query('.account-allocation-chart').getAttribute('aria-label'),/Position margin: 33.3%/);
  }finally{window.act(()=>window.root.unmount());await new Promise(resolve=>setImmediate(resolve));window.close();}
});
