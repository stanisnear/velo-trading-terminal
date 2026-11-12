import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeFunctionResult,decodeFunctionResult } from 'viem';
import { VELO_PERPS_V4_ABI as abi } from '../supabase/functions/velo-keepers/generated/abi.js';
import { normalizeConditionalOrder } from '../shared/conditional-order.mjs';
test('actual V4 mapping ABI preserves owner, collateral, trigger, leverage and active flag',()=>{
 const owner='0x'+'11'.repeat(20);
 const wire=encodeFunctionResult({abi,functionName:'conditionalOrders',result:[owner,20,true,10,0,1,false,0,25000000n,80n*10n**18n,123n,true]});
 const result=normalizeConditionalOrder(decodeFunctionResult({abi,functionName:'conditionalOrders',data:wire}));
 assert.equal(result.owner,owner);assert.equal(result.collateralUSDC_6,25000000n);
 assert.equal(result.pairIndex,20);assert.equal(result.triggerKind,1);assert.equal(result.leverage,10);assert.equal(result.active,true);
 assert.equal(result.triggerPrice_E18,80n*10n**18n);assert.equal(result.createdAt,123n);
 assert.equal(normalizeConditionalOrder(result),result);assert.throws(()=>normalizeConditionalOrder([owner]));
});
