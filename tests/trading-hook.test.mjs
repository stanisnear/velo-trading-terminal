import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { mkdtemp, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const folder = await mkdtemp(path.resolve('audit/trading-hook-'));
const file = path.join(folder, 'hook.mjs');
const fixture = 'globalThis.__tradingFixture';
const writes = ['openPosition', 'closePosition', 'addMargin', 'reduceMargin', 'partialClose', 'setTriggers', 'depositCross', 'withdrawCross', 'placeConditionalOrder', 'cancelConditionalOrder'];
const stubs = {
  wagmi: `export const useAccount=()=>(${fixture}.account); export const useChainId=()=>84532; export const usePublicClient=()=>(${fixture}.client); export const useWalletClient=()=>({data:${fixture}.wallet});`,
  veloPerpsService: `export const IS_V3=false, IS_V4=true, VELO_PERPS_ADDRESS='0x01', VELO_USDC_BASE='0x02', VELO_PERPS_V3_ABI=[], PAIR_INDEX={'SOL-USD':2};
    export const fetchOpenPositions=(_c,a,engine)=>engine==='legacy'?Promise.resolve([]):${fixture}.read(a);
    export const fetchConditionalOrders=async()=>[],fetchPoolBalance=async()=>1000000,fetchCrossFreeBalance=async()=>0,fetchCrossTotalBalance=async()=>({free:0,total:0,locked:0});
    export const baseScanTxUrl=h=>'https://sepolia.basescan.org/tx/'+h;
    ${writes.map(name => `export const ${name}=(...args)=>${fixture}.write('${name}',...args);`).join('\n')}`,
  veloUsdcService: 'export const fetchUsdcBalance=async()=>1000,approveUsdcIfNeeded=async()=>{},mintMockUsdc=async()=>"0x11";',
  veloBurnerWallet: 'export const loadStoredBurner=()=>null;',
  veloGasSponsor: 'export const requireBurnerGas=async()=>({ok:true});',
  pythService: 'export const fetchPriceUpdate=async()=>[],PYTH_FEED_IDS={};',
  'tradePreflight.mjs': 'export const readTradingPreflight=async()=>({feedId:"0x11",tradable:true,gasBalance:1n});',
  'baseTransport.mjs': 'export const baseSepoliaTransport=()=>{},transactionError=e=>e,pendingTransaction=()=>null,recoverPendingTransaction=async()=>null,checkLegacyTransaction=async()=>{};',
  tradeReceipts: 'export const waitForSuccessfulReceipt=async()=>({status:"success"});',
  testnetReleaseGate: 'export const requireSafeTestnetAction=()=>{};',
  'markets.mjs': 'export const isEnabledTradingMarket=()=>true;',
};
await build({ entryPoints: ['src/services/useVeloPerpsTrading.ts'], bundle: true, platform: 'node', format: 'esm', outfile: file,
  external: ['react', 'viem', 'viem/accounts', 'viem/chains'], define: { 'import.meta.env': '{}' },
  plugins: [{ name: 'trading-fixtures', setup(b) {
    b.onResolve({ filter: /.*/ }, args => {
      const key = args.path.split('/').pop();
      if (stubs[key]) return { path: key, namespace: 'fixture' };
    });
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path] }));
  } }],
});
const { useVeloPerpsTrading } = await import(pathToFileURL(file));
const address = '0x0000000000000000000000000000000000000001';
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
async function setup() {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://fixture.invalid' });
  globalThis.window=dom.window; globalThis.document=dom.window.document; globalThis.localStorage=dom.window.localStorage;
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const reads = deferred(); const calls = [];
  const f = globalThis.__tradingFixture = {
    account: { address, isConnected: true }, client: { getBalance: async()=>1n }, wallet: {},
    read: ()=>reads.promise,
    write: async name => { calls.push(name); return {txHash:'0x11'}; },
  };
  let state;
  function Probe() { state=useVeloPerpsTrading(); return null; }
  const root=createRoot(document.querySelector('#root'));
  const render=()=>act(async()=>root.render(React.createElement(Probe)));
  await render();
  return { f, calls, reads, render, state:()=>state, close:async()=>{await act(async()=>root.unmount());dom.window.close();} };
}
const order = { pair:'SOL-USD', isLong:true, collateralUSDC:10, leverage:2, marginMode:'ISOLATED' };

test('initial handlers become usable after account loading, including open, close and limit orders', async()=>{
  const f=await setup();
  try {
    const initial=f.state();
    await assert.rejects(initial.openPosition(order), /still loading/);
    await act(async()=>{ f.reads.resolve([]); await f.reads.promise; });
    assert.equal(f.state().isInitialLoading,false);
    await act(async()=>{
      await initial.openPosition(order);
      await initial.closePosition(1n,'SOL-USD');
      await initial.placeConditionalOrder({...order,triggerKind:'LIMIT',triggerPrice:1});
    });
    assert.deepEqual(f.calls,['openPosition','closePosition','placeConditionalOrder']);
  } finally { await f.close(); }
});

test('failed initial reads never unlock trading, and a successful retry does', async()=>{
  const f=await setup();
  try {
    await act(async()=>{f.reads.reject(new Error('RPC unavailable'));await f.reads.promise.catch(()=>{});});
    await assert.rejects(f.state().openPosition(order), /still loading/);
    f.f.read=async()=>[];
    await act(async()=>f.state().refresh());
    await act(async()=>f.state().openPosition(order));
    assert.deepEqual(f.calls,['openPosition']);
  } finally { await f.close(); }
});

test('switching accounts rejects previous-account handlers and waits for the new account', async()=>{
  const f=await setup();
  try {
    await act(async()=>{f.reads.resolve([]);await f.reads.promise;});
    const old=f.state(); const next=deferred();
    f.f.account={address:'0x0000000000000000000000000000000000000002',isConnected:true};
    f.f.read=()=>next.promise;
    await f.render();
    await assert.rejects(old.openPosition(order), /wallet changed/);
    await assert.rejects(f.state().openPosition(order), /still loading/);
    await act(async()=>{next.resolve([]);await next.promise;});
    await act(async()=>f.state().openPosition(order));
    f.f.account={...f.f.account,isConnected:false};
    await f.render();
    await assert.rejects(f.state().openPosition(order), /wallet changed/);
  } finally { await f.close(); }
});

test('rapid duplicate submissions are locked until the first completes', async()=>{
  const f=await setup();
  try {
    await act(async()=>{f.reads.resolve([]);await f.reads.promise;});
    const write=deferred(); f.f.write=()=>write.promise;
    await act(async()=>{
      const first=f.state().openPosition(order);
      await assert.rejects(f.state().openPosition(order), /in progress/);
      write.resolve({txHash:'0x11'}); await first;
    });
  } finally { await f.close(); }
});
test.after(()=>rm(folder,{recursive:true,force:true}));
