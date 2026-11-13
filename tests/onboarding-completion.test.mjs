import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const folder = await mkdtemp(path.resolve('audit/onboarding-'));
const file = path.join(folder, 'onboarding.mjs');
const stubs = {
  wagmi: `const client={}; const wallet={signMessage:async()=>''}; export const useAccount=()=>({address:'0x1111111111111111111111111111111111111111',isConnected:true}); export const useDisconnect=()=>({disconnect(){},disconnectAsync:async()=>{}}); export const useChainId=()=>84532; export const usePublicClient=()=>client; export const useWalletClient=()=>({data:wallet}); export const useSwitchChain=()=>({switchChain(){}});`,
  '@reown/appkit/react': `export const useAppKitAccount=()=>({});`,
  supabaseStore: `export const isConfigured=()=>true; export const supabase={rpc:async()=>({error:null}),from:()=>{const q={select:()=>q,ilike:()=>q,eq:()=>q,update:()=>q,maybeSingle:async()=>({data:null,error:null}),single:async()=>({data:{id:'new-account',username:'new_trader',handle:'@new_trader'},error:null})};return q;}};`,
  walletAuth: `export const signInWithWallet=async()=>({data:{user:{id:'new-account'}}});`,
  veloBurnerSetup: `export const createBurnerWalletClient=()=>({}); export const setupBurnerWallet=async options=>{globalThis.__onboarding.claims++;if(globalThis.__onboarding.fail)throw Error('Funding unavailable');const burner={veloAddress:'0x2222222222222222222222222222222222222222',privateKey:'fixture'};await options.onWalletReady(burner);return {burner,faucetTxHash:'0x'+'a'.repeat(64)};};`,
  veloUsdcService: `export const fetchUsdcBalance=async()=>1000;`,
  veloPerpsService: `export const VELO_USDC_BASE='fixture'; export const baseScanTxUrl=x=>'https://example.test/tx/'+x;`,
  usernameService: `export const validateUsername=()=>null;export const ensureUsernameRegistered=async()=>null;`,
  veloGasSponsor: `export const ensureBurnerGas=async()=>({ok:true});`,
  AnimatedValue: `import React from 'react'; export const AnimatedText=({text})=>React.createElement('span',null,text);`,
  shared: `import React from 'react'; export const VeloWordmark=()=>React.createElement('span',null,'Velo');`,
};
await build({stdin:{contents:"export {VeloOnboardingModal} from './src/components/VeloOnboardingModal';",resolveDir:process.cwd(),loader:'tsx'},outfile:file,bundle:true,platform:'node',format:'esm',external:['react','react-dom'],plugins:[{name:'offline-onboarding',setup(b){
  b.onResolve({filter:/.*/},args=>{const key=Object.hasOwn(stubs,args.path)?args.path:args.path.split('/').pop();if(Object.hasOwn(stubs,key))return {path:key,namespace:'fixture'};});
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:stubs[args.path],loader:'js'}));
}}]});
const {VeloOnboardingModal}=await import(pathToFileURL(file));
test.after(()=>rm(folder,{recursive:true,force:true}));

async function fixture(t) {
  const dom=new JSDOM('<div id="root"></div>',{url:'https://example.test',pretendToBeVisual:true});
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.localStorage=dom.window.localStorage;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
  globalThis.__onboarding={claims:0,fail:false};
  const {createRoot}=await import('react-dom/client');const root=createRoot(document.querySelector('#root'));const auth=[];let closes=0;
  t.mock.timers.enable({apis:['setTimeout']});
  const props={isOpen:true,onAuth:(...args)=>auth.push(args),onClose:()=>closes++};
  const render=async extra=>act(async()=>root.render(React.createElement(VeloOnboardingModal,{...props,...extra})));
  const click=async text=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text||b.getAttribute('aria-label')===text);assert.ok(button,`Missing ${text}`);await act(async()=>button.click());};
  const signup=async()=>{await render();await click('Get started →');const field=document.querySelector('input');await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(field,'new_trader');field.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});await click('Continue →');await click('Skip for now →');await click('Create account →');};
  t.after(async()=>{await act(async()=>root.unmount());t.mock.timers.reset();dom.window.close();delete globalThis.__onboarding;});
  return {auth,click,signup,render,closes:()=>closes,tick:async ms=>act(async()=>t.mock.timers.tick(ms))};
}

for (const action of ['Start trading →','Close','automatic completion']) {
  test(`funded signup completes once through ${action}`,async t=>{
    const f=await fixture(t);await f.signup();assert.match(document.body.textContent,/You're live/);assert.equal(f.auth.length,0);
    if(action==='automatic completion')await f.tick(3200);else {await f.click(action);await f.tick(3200);}
    assert.equal(f.auth.length,1);assert.equal(f.closes(),0,'success must hydrate the account instead of cancelling');
    assert.equal(f.auth[0][0].id,'new-account');assert.equal(f.auth[0][1].velo_wallet_address,'0x2222222222222222222222222222222222222222');assert.equal(f.auth[0][2],true);
    assert.equal(globalThis.__onboarding.claims,1,'onboarding funds the wallet once');
  });
}
test('failed funding cannot finish signup, and closing clears the completion timer',async t=>{
  const f=await fixture(t);globalThis.__onboarding.fail=true;await f.signup();assert.match(document.body.textContent,/Funding unavailable/);await f.tick(4000);assert.equal(f.auth.length,0);
  globalThis.__onboarding.fail=false;await f.click('Create account →');assert.match(document.body.textContent,/You're live/);await f.render({isOpen:false});await f.tick(4000);assert.equal(f.auth.length,0,'a closed flow cannot fire a delayed login');
});
test('market refresh renders do not restart completion or call a stale callback',async t=>{
  const f=await fixture(t);await f.signup();await f.tick(2000);
  const latest=[];await f.render({onAuth:(...args)=>latest.push(args)});await f.tick(1200);
  assert.equal(latest.length,1);assert.equal(f.auth.length,0);
});
