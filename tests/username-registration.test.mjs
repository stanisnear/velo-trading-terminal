import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { zeroAddress } from 'viem';

const output = await build({ entryPoints: ['src/services/usernameService.ts'], bundle: true, write: false, platform: 'node', format: 'esm', define: { 'import.meta.env': '{}' },
  plugins: [{ name:'receipt-fixture', setup(b) {
    b.onResolve({filter:/tradeReceipts$/},()=>({path:'receipt',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const waitForSuccessfulReceipt=(...args)=>globalThis.__usernameReceipt(...args);'}));
  } }],
});
const { ensureUsernameRegistered } = await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
const address='0x0000000000000000000000000000000000000001';
function setup() {
  let existing='', owner=zeroAddress, writes=0; const reads=[];
  const client={readContract:async({functionName,args})=>{reads.push({functionName,args});return functionName==='usernameOf'?existing:owner;}};
  const wallet={account:{address},chain:{id:84532},writeContract:async()=>{writes++;return '0x11';}};
  globalThis.__usernameReceipt=async()=>{existing='velo_test';};
  return {client,wallet,reads,writes:()=>writes,setExisting:v=>existing=v,setOwner:v=>owner=v};
}
test('registration reads the signing trading wallet and confirms the name after the receipt',async()=>{
  const f=setup();assert.equal(await ensureUsernameRegistered(f.client,f.wallet,'velo_test'),'0x11');
  assert.equal(f.writes(),1);assert.deepEqual(f.reads.filter(r=>r.functionName==='usernameOf').map(r=>r.args),[[address],[address]]);
  assert.equal(await ensureUsernameRegistered(f.client,f.wallet,'velo_test'),null);assert.equal(f.writes(),1);
});
test('on-chain conflicts and RPC failures never report successful registration',async()=>{
  const f=setup();f.setOwner('0x0000000000000000000000000000000000000002');
  await assert.rejects(ensureUsernameRegistered(f.client,f.wallet,'velo_test'),/already registered/);assert.equal(f.writes(),0);
  f.client.readContract=async()=>{throw new Error('RPC unavailable');};
  await assert.rejects(ensureUsernameRegistered(f.client,f.wallet,'velo_test'),/RPC unavailable/);assert.equal(f.writes(),0);
});
test('receipt failure is surfaced and a later confirmed mapping makes retry idempotent',async()=>{
  const f=setup();globalThis.__usernameReceipt=async()=>{throw new Error('confirmation is delayed');};
  await assert.rejects(ensureUsernameRegistered(f.client,f.wallet,'velo_test'),/confirmation is delayed/);
  f.setExisting('velo_test');assert.equal(await ensureUsernameRegistered(f.client,f.wallet,'velo_test'),null);assert.equal(f.writes(),1);
});
