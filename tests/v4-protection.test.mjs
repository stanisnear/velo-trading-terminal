import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { parseAbi, encodeEventTopics, encodeAbiParameters, parseUnits } from 'viem';
import { mkdtemp, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { publicConfig } from '../supabase/functions/_shared/public-config.js';
const folder = await mkdtemp(path.resolve('audit/v4-protection-'));
const file = path.join(folder, 'service.mjs');
await build({entryPoints:['src/services/veloPerpsService.ts'],outfile:file,bundle:true,platform:'node',format:'esm',define:{'import.meta.env':JSON.stringify(publicConfig)},plugins:[{name:'price-fixture',setup(b){
  b.onResolve({filter:/pythService$/},()=>({path:'price',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"export const PYTH_FEED_IDS={'HYPE-USD':'0x01'},fetchPriceUpdate=async()=>({updateData:['0x01'],parsedPrice:80});"}));
}}]});
const { openPosition, addMargin, reduceMargin, partialClose, depositCross, withdrawCross, setTriggers, placeConditionalOrder } = await import(pathToFileURL(file));
const contract=publicConfig.VITE_VELO_PERPS_V4_ADDRESS, trader='0x0000000000000000000000000000000000000001',hash='0x'+'ab'.repeat(32);
const abi=parseAbi(['event PositionOpened(uint256 indexed tradeId,address indexed trader,uint16 indexed pairIndex,bool isLong,uint16 leverage,uint8 marginMode,uint64 collateralUSDC_6,uint128 entryPrice_E18)','event TriggersSet(uint256 indexed tradeId,uint128 takeProfit_E18,uint128 stopLoss_E18)']);
function event(name,values){const item=abi.find(e=>e.name===name);return {address:contract,logIndex:name==='TriggersSet'?2:1,topics:encodeEventTopics({abi:[item],eventName:name,args:values}),data:encodeAbiParameters(item.inputs.filter(i=>!i.indexed),item.inputs.filter(i=>!i.indexed).map(i=>values[i.name]))};}
function fixture(isLong=true,mode='valid'){
  const calls=[]; const tp=isLong?100:60,sl=isLong?60:100;
  const opened=event('PositionOpened',{tradeId:5n,trader,pairIndex:7,isLong,leverage:2,marginMode:0,collateralUSDC_6:9980000n,entryPrice_E18:parseUnits('80',18)});
  const trigger=event('TriggersSet',{tradeId:mode==='wrong'?6n:5n,takeProfit_E18:parseUnits(String(tp),18),stopLoss_E18:parseUnits(String(sl),18)});
  const wallet={account:{address:trader},chain:{id:84532},writeContract:async args=>{calls.push(args);return hash;}};
  const client={readContract:async args=>args.functionName==='getPosition'?{isLong,entryPrice_E18:parseUnits('80',18)}:args.functionName==='allowance'?10000000000n:1n,waitForTransactionReceipt:async()=>({status:'success',transactionHash:hash,logs:mode==='missing'?[opened]:[opened,trigger]})};
  return {calls,wallet,client,args:{pair:'HYPE-USD',isLong,collateralUSDC:10,leverage:2,takeProfit:tp,stopLoss:sl}};
}
test('V4 market entry includes and confirms both triggers in one transaction, for both directions',async()=>{
  for(const isLong of [true,false]){const f=fixture(isLong);const result=await openPosition(f.wallet,f.client,f.args);
    assert.equal(f.calls.length,1);assert.equal(f.calls[0].functionName,'openPosition');
    assert.equal(f.calls[0].args[0].takeProfit_E18,parseUnits(String(f.args.takeProfit),18));
    assert.equal(f.calls[0].args[0].stopLoss_E18,parseUnits(String(f.args.stopLoss),18));
    assert.equal(result.takeProfit,f.args.takeProfit);assert.equal(result.stopLoss,f.args.stopLoss);
  }
});
test('missing or unrelated protection event preserves the hash and never reports protected success',async()=>{
  for(const mode of ['missing','wrong']){const f=fixture(true,mode);await assert.rejects(openPosition(f.wallet,f.client,f.args),e=>e.txHash===hash&&/protection could not be verified/.test(e.message));assert.equal(f.calls.length,1);}
});
test('V4 rejects legacy margin, cross and partial-close methods before any approval or transaction',async()=>{
  const f=fixture();
  await assert.rejects(addMargin(f.wallet,f.client,5n,10),/V4/);
  await assert.rejects(reduceMargin(f.wallet,f.client,5n,10,[],0n),/V4/);
  await assert.rejects(partialClose(f.wallet,f.client,5n,5000,[],0n),/V4/);
  await assert.rejects(depositCross(f.wallet,f.client,10),/V4/);
  await assert.rejects(withdrawCross(f.wallet,f.client,10),/legacy exit/);
  assert.equal(f.calls.length,0);
});
test('transaction boundary rejects malformed protections and wrong-side prices without any writes',async()=>{
 for(const raw of ['15000,','15,000',NaN,Infinity,-1,1e-19,1e25]){
  const f=fixture();
  await assert.rejects(openPosition(f.wallet,f.client,{...f.args,takeProfit:raw}),/positive price/);
  await assert.rejects(setTriggers(f.wallet,f.client,5n,raw,0),/positive price/);
  await assert.rejects(placeConditionalOrder(f.wallet,f.client,{...f.args,marginMode:'ISOLATED',triggerKind:'LIMIT',triggerPrice:80,takeProfit:raw}),/positive price/);
  assert.equal(f.calls.length,0);
 }
 for(const isLong of [true,false]){
  const f=fixture(isLong),wrongTP=isLong?70:90,wrongSL=isLong?90:70;
  const read=f.client.readContract;f.client.readContract=async args=>args.functionName==='allowance'?0n:read(args);
  await assert.rejects(openPosition(f.wallet,f.client,{...f.args,takeProfit:wrongTP}),/must be (above|below)/);
  await assert.rejects(setTriggers(f.wallet,f.client,5n,wrongTP,0),/entry price/);
  await assert.rejects(setTriggers(f.wallet,f.client,5n,0,wrongSL),/entry price/);
  await assert.rejects(placeConditionalOrder(f.wallet,f.client,{...f.args,marginMode:'ISOLATED',triggerKind:'LIMIT',triggerPrice:80,takeProfit:wrongTP}),/order price/);
  await assert.rejects(placeConditionalOrder(f.wallet,f.client,{...f.args,marginMode:'ISOLATED',triggerKind:'LIMIT',triggerPrice:'80,'}),/order price/);
  assert.equal(f.calls.length,0);
 }
});
test('confirmed-entry TP/SL edits and explicit trigger removal retain correct contract values',async()=>{
 for(const isLong of [true,false]){
  const f=fixture(isLong);
  await setTriggers(f.wallet,f.client,5n,f.args.takeProfit,f.args.stopLoss);
  assert.deepEqual(f.calls[0].args,[5n,parseUnits(String(f.args.takeProfit),18),parseUnits(String(f.args.stopLoss),18)]);
  await setTriggers(f.wallet,f.client,5n,0,0);
  assert.deepEqual(f.calls[1].args,[5n,0n,0n]);
 }
});
test('V4 market, conditional, and edit paths reject economically unsupported TP before approval or writes',async()=>{
 const f=fixture();const read=f.client.readContract;
 f.client.readContract=async args=>args.functionName==='allowance'?0n:read(args);
 await assert.rejects(openPosition(f.wallet,f.client,{...f.args,takeProfit:100000}),/profit limit/);
 await assert.rejects(setTriggers(f.wallet,f.client,5n,100000,0),/profit limit/);
 await assert.rejects(placeConditionalOrder(f.wallet,f.client,{...f.args,marginMode:'ISOLATED',triggerKind:'LIMIT',triggerPrice:80,takeProfit:100000}),/profit limit/);
 assert.equal(f.calls.length,0);
});
test.after(()=>rm(folder,{recursive:true,force:true}));
