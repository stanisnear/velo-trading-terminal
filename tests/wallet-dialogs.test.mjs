import test from 'node:test';import assert from 'node:assert/strict';import React,{act}from'react';import{JSDOM}from'jsdom';import{build}from'esbuild';import{mkdtemp,rm}from'node:fs/promises';import path from'node:path';import{pathToFileURL}from'node:url';import{walletDialogFixturePlugin}from'./fixtures/wallet-dialogs.mjs';
test('funds and settings preserve recipient, pending locks, callback identity, contact drafts and key visibility in the shared dialogs',async()=>{
 const folder=await mkdtemp(path.resolve('audit/wallet-dialogs-')),file=path.join(folder,'dialogs.mjs');
 await build({stdin:{contents:"export{VeloDepositModal}from'./src/components/VeloDepositModal';export{SettingsModal}from'./src/components/SettingsModal';export{VeloFaucetModal}from'./src/components/VeloFaucetModal';export{VeloSendModal}from'./src/components/VeloSendModal';",resolveDir:process.cwd(),loader:'tsx'},outfile:file,bundle:true,platform:'node',format:'esm',define:{'import.meta.env':'{}'},external:['react','react-dom','lucide-react','motion/react'],loader:{'.css':'empty'},plugins:[walletDialogFixturePlugin]});
 const dom=new JSDOM('<button id="trigger">Open</button><div id="root"></div>',{pretendToBeVisual:true,url:'https://example.test'});
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.Element=dom.window.Element;globalThis.localStorage=dom.window.localStorage;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 dom.window.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
 let release;globalThis.__walletFixture={owner:'0x1111111111111111111111111111111111111111',burner:{veloAddress:'0x2222222222222222222222222222222222222222',privateKey:'test-only'},wallet:{chain:{id:84532}},client:{waitForTransactionReceipt:async()=>{}},hash:'0x'+'a'.repeat(64),receipt:new Promise(resolve=>release=resolve),transfers:[],bridges:[],rpc:[],exports:0,recoveries:0,claims:0,receiptRequests:0};
 const f=globalThis.__walletFixture,{createRoot}=await import('react-dom/client'),{VeloDepositModal,SettingsModal,VeloFaucetModal,VeloSendModal}=await import(pathToFileURL(file)),root=createRoot(document.querySelector('#root'));
 const buttons=()=>[...document.querySelectorAll('button')],button=text=>buttons().find(b=>b.textContent.trim()===text);
 const input=(element,value)=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(element,value);element.dispatchEvent(new dom.window.Event('input',{bubbles:true}));};
 let closes=0;const success=[];
 try{
  document.querySelector('#trigger').focus();
  await act(async()=>root.render(React.createElement(VeloDepositModal,{isOpen:true,onClose:()=>closes++,onSuccess:(...args)=>success.push(args)})));
  assert.ok(document.querySelector('dialog.wallet-dialog'));assert.equal(document.querySelector('.velo-modal-enter-backdrop'),null);
  await act(async()=>button('Max').click());assert.equal(document.querySelector('.wallet-amount input').value,'100.00');
  await act(async()=>document.querySelector('[aria-label="Transfer direction"] button:last-child').click());
  await act(async()=>document.querySelector('[aria-label="Withdrawal recipient"] button:last-child').click());
  const recipient=document.querySelector('.wallet-field--address');assert.equal(recipient.closest('[hidden]'),null);
  await act(async()=>input(recipient,'invalid'));assert.equal(button('Withdraw mUSDC').disabled,true);
  const destination='0x4444444444444444444444444444444444444444';await act(async()=>{input(recipient,destination);input(document.querySelector('.wallet-amount input'),'5');});
  const submit=button('Withdraw mUSDC');assert.equal(submit.disabled,false);
  await act(async()=>{submit.click();submit.click();});assert.equal(f.transfers.length,1);assert.equal(f.transfers[0][2],destination);assert.equal(f.transfers[0][3],5);
  assert.equal(f.receiptRequests,1);assert.equal(document.querySelector('dialog').getAttribute('aria-busy'),'true');
  assert.ok([...document.querySelectorAll('[aria-label="Transfer direction"] button')].every(b=>b.disabled));
  await act(async()=>document.querySelector('dialog').dispatchEvent(new dom.window.Event('cancel',{bubbles:true,cancelable:true})));assert.equal(closes,0);
  await act(async()=>release({status:'success'}));assert.equal(success.length,1);assert.deepEqual(success[0],[f.hash,5,'withdraw']);assert.match(document.body.textContent,/Withdrawal confirmed/);
  await act(async()=>root.render(null));assert.equal(document.activeElement.id,'trigger');

  // Test the same confirmed-send lifecycle through its new fixed action footer.
  let releaseSend;f.receipt=new Promise(resolve=>releaseSend=resolve);f.wallet.writeContract=async request=>{f.sendRequest=request;return f.hash;};
  const sends=[];await act(async()=>root.render(React.createElement(VeloSendModal,{isOpen:true,onClose:()=>closes++,onSuccess:info=>sends.push(info)})));
  const sendRecipient=document.querySelector('input[placeholder="@username or 0x…"]');
  await act(async()=>{input(sendRecipient,destination);input(document.querySelector('.wallet-amount input'),'7');});
  const sendButton=button('Send mUSDC');assert.equal(sendButton.disabled,false);
  await act(async()=>{sendButton.click();sendButton.click();});assert.deepEqual(f.sendRequest.args,[destination,7000000n]);assert.equal(sends.length,0,'submitted is not confirmed');
  assert.match(document.body.textContent,/Awaiting confirmation/);assert.equal(document.querySelector('.velo-dialog-close').disabled,true);
  await act(async()=>releaseSend({status:'success'}));assert.equal(sends.length,1);assert.equal(sends[0].amount,7);assert.equal(sends[0].recipientAddress,destination);
  assert.match(document.body.textContent,/Transfer confirmed/);await act(async()=>root.render(null));

  const profile={id:'fixture',email:'old@example.test'};await act(async()=>root.render(React.createElement(SettingsModal,{isOpen:true,onClose:()=>closes++,profile})));
  assert.equal(document.querySelectorAll('.settings-wallet-card').length,2);assert.equal(f.exports,0);
  await act(async()=>document.querySelector('[aria-label="Hide wallet balances"]').click());assert.ok(document.querySelector('.settings-wallet-card').textContent.includes('••••'));
  await act(async()=>button('Preferences').click());const email=document.querySelector('input[type=email]');await act(async()=>input(email,'new@example.test'));
  await act(async()=>button('Security').click());assert.equal(f.exports,0);
  await act(async()=>button('Preferences').click());assert.equal(document.querySelector('input[type=email]').value,'new@example.test','tab changes preserve drafts');
  await act(async()=>button('Save email').click());assert.deepEqual(f.rpc.filter(call=>call.name==='set_my_contact_email'),[{name:'set_my_contact_email',args:{contact_email:'new@example.test'}}]);
  await act(async()=>button('Security').click());await act(async()=>button('Reveal private key').click());assert.equal(f.exports,0,'warning comes before revealing');
  await act(async()=>button('Reveal key').click());assert.equal(f.exports,1);assert.match(document.body.textContent,/test-only-key/);
  await act(async()=>button('Wallets').click());assert.doesNotMatch(document.body.textContent,/test-only-key/);await act(async()=>button('Security').click());assert.doesNotMatch(document.body.textContent,/test-only-key/,'returning to security does not reveal the key again');
  await act(async()=>root.render(null));
  await act(async()=>root.render(React.createElement(VeloFaucetModal,{isOpen:true,userId:'fixture',onClose:()=>{},onReady:()=>{}})));
  assert.ok(document.querySelector('dialog.wallet-dialog'));assert.equal(f.claims,0,'opening the faucet never claims automatically');
 }finally{await act(async()=>root.unmount());dom.window.close();delete globalThis.__walletFixture;await rm(folder,{recursive:true,force:true});}
});
