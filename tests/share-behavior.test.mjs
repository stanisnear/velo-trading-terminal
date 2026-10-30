import test from 'node:test';
import assert from 'node:assert/strict';
import { createProfileHydrationGate, profileDisplayName, isWalletPlaceholder } from '../src/utils/profileIdentity.mjs';
import { resolveSharedTrade, shareUpdates, useStoredShareImage } from '../src/utils/shareBehavior.mjs';
const snapshot = { status:'OPEN',pnl:14,markPrice:101,presentation:'pnl',theme:'light',design:'ledger',updateMode:'live',hideAmounts:true };
test('a newer onboarding result prevents an older session response restoring the bootstrap identity', async () => {
  const gate = createProfileHydrationGate(); let name = 'Trader';
  let finish; const slowProfile = new Promise(resolve=>{finish=resolve;});
  const restore = gate.begin();
  const pending = slowProfile.then(profile=>{if(gate.current(restore))name=profile.username;});
  const onboarding = gate.begin();
  assert.ok(gate.current(onboarding));name='test';
  finish({username:'wallet_'+'c'.repeat(40)});await pending;
  assert.equal(name,'test');gate.invalidate();assert.equal(gate.current(onboarding),false);
});
test('bootstrap names are never public labels; chosen usernames and handles survive',()=>{
  assert.equal(profileDisplayName({username:'wallet_'+'c'.repeat(40),handle:'@test'}),'test');
  assert.equal(profileDisplayName({username:'wallet_'+'c'.repeat(40)}),'Trader');
  assert.equal(profileDisplayName({username:'test'}),'test');
  assert.equal(isWalletPlaceholder('@wallet_'+'C'.repeat(40)),true);
});
test('a snapshot stays fixed even after a mark update or settlement',()=>{
  const fixed={...snapshot,updateMode:'snapshot'};
  assert.equal(shareUpdates(fixed),false);
  assert.equal(resolveSharedTrade(fixed,{status:'CLOSED',pnl:90}),fixed);
});
test('a live image keeps its own appearance and privacy while adopting confirmed settlement',()=>{
  const result=resolveSharedTrade(snapshot,{status:'CLOSED',pnl:90,closePrice:109,theme:'dark',hideAmounts:false});
  assert.equal(result.status,'CLOSED');assert.equal(result.pnl,90);assert.equal(result.theme,'light');assert.equal(result.hideAmounts,true);assert.equal(result.design,'ledger');
});
test('freeze-on-close preserves captured PnL and explicitly labels it as a closed snapshot',()=>{
  const result=resolveSharedTrade({...snapshot,onClose:'freeze'},{status:'CLOSED',pnl:90,txHash:'confirmed'});
  assert.equal(result.pnl,14);assert.equal(result.status,'CLOSED');assert.equal(result.closedSnapshot,true);assert.equal(result.updateMode,'snapshot');assert.equal(result.txHash,'confirmed');
});

test('a frozen-at-close image must be redrawn with its closed label, not reuse the original open PNG',()=>{
  assert.equal(useStoredShareImage({...snapshot,updateMode:'snapshot'}),true);
  assert.equal(useStoredShareImage(snapshot),false);
  const frozen=resolveSharedTrade({...snapshot,onClose:'freeze'},{status:'CLOSED',pnl:90});
  assert.equal(useStoredShareImage(frozen),false);
  assert.equal(resolveSharedTrade(snapshot,{status:'OPEN',pnl:2,closedSnapshot:true}).closedSnapshot,undefined);
});
