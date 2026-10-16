import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { encodeEventTopics, encodeAbiParameters, parseAbi, zeroAddress } from 'viem';
import { mkdtemp, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const folder = await mkdtemp(path.resolve('audit/receipt-tests-'));
const file = path.join(folder, 'service.mjs');
await build({stdin:{contents:"export * from './src/services/tradeReceipts'; export {fetchOpenPositions,fetchConditionalOrders,partialClose} from './src/services/veloPerpsService';",resolveDir:process.cwd(),loader:'ts'},outfile:file,bundle:true,platform:'node',format:'esm',define:{'import.meta.env':'{}'},plugins:[{name:'oracle-fixture',setup(b){b.onResolve({filter:/pythConnection$/},()=>({path:'oracle',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const fetchPyth=()=>{throw Error("Not used")};',loader:'js'}));}}]});
const {decodeConfirmedClose,decodeOrderOutcome,waitForSuccessfulReceipt,fetchOpenPositions,fetchConditionalOrders,partialClose}=await import(pathToFileURL(file));
const contract='0x41fDb544D7247a5ddc6B4C06F29D09f2b20de907';
const trader='0x0000000000000000000000000000000000000001';
const hash='0x'+'ab'.repeat(32);
const abi=parseAbi([
 'event PositionClosed(uint256 indexed tradeId,address indexed trader,uint16 indexed pairIndex,uint128 exitPrice_E18,int256 pnlUSDC_6,uint64 payoutUSDC_6,uint64 feeUSDC_6)',
 'event PositionPartiallyClosed(uint256 indexed tradeId,address indexed trader,uint16 fractionBps,uint128 exitPrice_E18,int256 pnlUSDC_6,uint64 payoutUSDC_6,uint64 feeUSDC_6)',
 'event PositionLiquidated(uint256 indexed tradeId,address indexed trader,address indexed liquidator,uint128 exitPrice_E18,uint64 bountyUSDC_6)',
 'event ConditionalOrderCancelled(uint256 indexed orderId,address indexed trader)',
 'event ConditionalOrderExecuted(uint256 indexed orderId,address indexed trader,uint256 linkedTradeId,uint128 markPrice_E18)',
 'event PositionOpened(uint256 indexed tradeId,address indexed trader,uint16 indexed pairIndex,bool isLong,uint16 leverage,uint8 marginMode,uint64 collateralUSDC_6,uint128 entryPrice_E18)',
]);
function event(name, values) {
 const item=abi.find(e=>e.name===name), indexed=Object.fromEntries(item.inputs.filter(i=>i.indexed).map(i=>[i.name,values[i.name]]));
 return {address:contract,topics:encodeEventTopics({abi:[item],eventName:name,args:indexed}),data:encodeAbiParameters(item.inputs.filter(i=>!i.indexed),item.inputs.filter(i=>!i.indexed).map(i=>values[i.name])),logIndex:4};
}
const closed=()=>event('PositionClosed',{tradeId:108n,trader,pairIndex:2,exitPrice_E18:105140798320000000000n,pnlUSDC_6:-63745528n,payoutUSDC_6:997876912n,feeUSDC_6:998875n});
const receipt=logs=>({status:'success',transactionHash:hash,blockNumber:100n,logs});
test('manual close without TP/SL uses exact receipt amounts, not a full-collateral liquidation',()=>{
 const result=decodeConfirmedClose(receipt([closed()]),contract,108n,trader,1062.621315);
 assert.equal(result.action,'CLOSE');assert.equal(result.reason,'CLOSE');assert.equal(result.pnlUSDC,-63.745528);assert.equal(result.exitPrice,105.14079832);assert.equal(result.payoutUSDC,997.876912);
 assert.equal(result.id,decodeConfirmedClose(receipt([closed()]),contract,108n,trader).id);
});
test('no event, wrong trade, wrong owner, or wrong contract never invents a close',()=>{
 assert.equal(decodeConfirmedClose(receipt([]),contract,108n,trader),null);
 assert.equal(decodeConfirmedClose(receipt([closed()]),contract,109n,trader),null);
 assert.equal(decodeConfirmedClose(receipt([closed()]),contract,108n,zeroAddress),null);
 assert.equal(decodeConfirmedClose(receipt([{...closed(),address:zeroAddress}]),contract,108n,trader),null);
});
test('only PositionLiquidated marks liquidation',()=>{
 const log=event('PositionLiquidated',{tradeId:108n,trader,liquidator:zeroAddress,exitPrice_E18:96000000000000000000n,bountyUSDC_6:1000000n});
 const result=decodeConfirmedClose(receipt([log]),contract,108n,trader,100);
 assert.equal(result.action,'LIQUIDATION');assert.equal(result.pnlUSDC,-100);
});
test('partial close uses event fraction and realized PnL',()=>{
 const log=event('PositionPartiallyClosed',{tradeId:108n,trader,fractionBps:2500,exitPrice_E18:105000000000000000000n,pnlUSDC_6:12345678n,payoutUSDC_6:20000000n,feeUSDC_6:10000n});
 const result=decodeConfirmedClose(receipt([log]),contract,108n,trader);
 assert.equal(result.fractionBps,2500);assert.equal(result.pnlUSDC,12.345678);assert.equal(result.action,'CLOSE');
});
test('100% close through Manage returns the full PositionClosed event',async()=>{
 const result=await partialClose({account:{address:trader},chain:{id:84532},writeContract:async()=>hash},{waitForTransactionReceipt:async()=>receipt([closed()])},108n,10000,[],0n);
 assert.equal(result.action,'CLOSE');assert.equal(result.fractionBps,10000);assert.equal(result.pnlUSDC,-63.745528);
});
test('reverted receipt and missing-event receipt are not successful trades',async()=>{
 await assert.rejects(waitForSuccessfulReceipt({waitForTransactionReceipt:async()=>({...receipt([]),status:'reverted'})},hash),/reverted/);
 await assert.rejects(partialClose({account:{address:trader},writeContract:async()=>hash},{waitForTransactionReceipt:async()=>receipt([])},108n,10000,[],0n),/no matching close event/);
});
test('confirmation timeout retains submitted transaction hash for recovery',async()=>{
 await assert.rejects(waitForSuccessfulReceipt({waitForTransactionReceipt:async()=>{throw Error('timeout');}},hash),e=>e.txHash===hash&&e.message.includes('submitted'));
});
test('failed index and failed position row reject instead of removing positions',async()=>{
 await assert.rejects(fetchOpenPositions({getBlockNumber:async()=>123n,readContract:async()=>{throw Error('RPC offline');}},trader),/RPC offline/);
 const seen=[];
 await assert.rejects(fetchOpenPositions({getBlockNumber:async()=>123n,readContract:async args=>{seen.push(args);if(args.functionName==='getTraderTrades')return [108n];throw Error('row timed out');}},trader),/row timed out/);
 assert.equal(seen.length,2);assert.ok(seen.every(r=>r.blockNumber===123n));
});
test('failed order read is not a cancellation or fill',async()=>{
 await assert.rejects(fetchConditionalOrders({getBlockNumber:async()=>123n,readContract:async()=>{throw Error('RPC offline');}},trader),/RPC offline/);
});
test('cancelled order is never matched to another position with the same pair',()=>{
 const cancelled=event('ConditionalOrderCancelled',{orderId:5n,trader});
 assert.deepEqual(decodeOrderOutcome(receipt([cancelled]),contract,5n,trader),{kind:'cancelled'});
 assert.equal(decodeOrderOutcome(receipt([cancelled]),contract,6n,trader),null);
});
test('conditional fill uses linked trade ID and actual opening event',()=>{
 const execution=event('ConditionalOrderExecuted',{orderId:5n,trader,linkedTradeId:108n,markPrice_E18:105000000000000000000n});
 const opened=id=>event('PositionOpened',{tradeId:id,trader,pairIndex:2,isLong:true,leverage:10,marginMode:0,collateralUSDC_6:100000000n,entryPrice_E18:105140798320000000000n});
 const result=decodeOrderOutcome(receipt([execution,opened(107n),opened(108n)]),contract,5n,trader);
 assert.equal(result.kind,'opened');assert.equal(result.tradeId,108n);assert.equal(result.entryPrice,105.14079832);assert.equal(result.size,1000);
});
test.after(()=>rm(folder,{recursive:true,force:true}));
