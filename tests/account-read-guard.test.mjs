import test from 'node:test';
import assert from 'node:assert/strict';
import { assertAccountFresh } from '../src/services/accountReadGuard.mjs';
test('offline, failed and stale account reads cannot submit; a confirmed reconnect can',()=>{
 const state={online:true,confirmedAt:100000,now:105000,failed:false};
 assert.doesNotThrow(()=>assertAccountFresh(state));
 for(const change of [{online:false},{failed:true},{confirmedAt:0},{now:131000},{now:99000}])
  assert.throws(()=>assertAccountFresh({...state,...change}));
 assert.doesNotThrow(()=>assertAccountFresh({...state,now:131000,confirmedAt:130000}));
});
