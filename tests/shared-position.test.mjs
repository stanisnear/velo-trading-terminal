import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { encodeEventTopics, encodeAbiParameters, parseAbi } from 'viem';
await mkdir('audit',{recursive:true});
const folder=await mkdtemp(path.resolve('audit/shared-position-')), file=path.join(folder,'service.mjs');
await build({stdin:{contents:"export * from './src/services/sharedPosition';export {parseTradeShare} from './src/utils/tradeShare';",resolveDir:process.cwd(),loader:'ts'},outfile:file,bundle:true,platform:'node',format:'esm',define:{'import.meta.env':'{}'}});
const {readSharedPosition,hasPositionReference,SHARED_ENGINE,parseTradeShare}=await import(pathToFileURL(file));
after(()=>rm(folder,{recursive:true,force:true}));
const trader='0x0000000000000000000000000000000000000001', hash='0x'+'ab'.repeat(32);
const share={pair:'BTC/USD',side:'LONG',leverage:10,entryPrice:100,size:100,collateral:10,pnl:0,pnlPct:0,status:'OPEN',chainId:84532,contract:SHARED_ENGINE,tradeId:'1',trader};
test('malformed public attachments cannot crash a feed or inject transaction links',()=>{
  assert.equal(parseTradeShare({...share,pnlPct:'20'}),undefined);
  assert.equal(parseTradeShare({...share,pnl:Infinity}),undefined);
  assert.equal(parseTradeShare(null),undefined);
  const safe=parseTradeShare({...share,txHash:'javascript:alert(1)',traderHandle:'@trader'});
  assert.equal(safe.txHash,undefined);assert.equal(safe.traderHandle,'@trader');
});
test('a live post reads actual position fields and fee-aware quotes from V4',async()=>{
  const rpc={readContract:async({functionName})=>({getPosition:{owner:trader,pairIndex:2,isLong:true,leverage:5,collateralUSDC_6:9900000n,entryPrice_E18:100000000000000000000n,openedAt:100n,originalNotional_6:49500000n},marketRisk:[0,0,0,0,50,0,1],positionOpenFee:100000n,quoteClose:{price:101000000000000000000n,pnl:2000000n}}[functionName])};
  const result=await readSharedPosition(share,101,rpc);
  assert.equal(result.pair,'SOL/USD');assert.equal(result.leverage,5);assert.equal(result.pnl,1.9);assert.equal(result.collateral,10);assert.equal(result.pnlPct,19);assert.equal(result.status,'OPEN');
});
test('missing position or provider failure never fabricates a close',async()=>{
  const rpc={readContract:async()=>({owner:'0x0000000000000000000000000000000000000000'}),getBlockNumber:async()=>50000n,getLogs:async()=>[]};
  await assert.rejects(readSharedPosition(share,101,rpc),/Refreshing settlement/);
  await assert.rejects(readSharedPosition(share,101,{readContract:async()=>{throw Error('RPC offline');}}),/RPC offline/);
});
test('settlement changes a previously open share to the receipt PnL and exit',async()=>{
  const abi=parseAbi(['event PositionClosed(uint256 indexed tradeId,address indexed trader,uint16 indexed pairIndex,uint128 exitPrice_E18,int256 pnlUSDC_6,uint64 payoutUSDC_6,uint64 feeUSDC_6)']);
  const inputs=abi[0].inputs.filter(x=>!x.indexed);
  const log={address:SHARED_ENGINE,logIndex:2,topics:encodeEventTopics({abi,eventName:'PositionClosed',args:{tradeId:1n,trader,pairIndex:0}}),data:encodeAbiParameters(inputs,[110000000000000000000n,1900000n,11900000n,100000n])};
  const rpc={readContract:async()=>({owner:'0x0000000000000000000000000000000000000000'}),getBlockNumber:async()=>50000n,getLogs:async()=>[{transactionHash:hash}],getTransactionReceipt:async()=>({status:'success',transactionHash:hash,blockNumber:49999n,logs:[log]})};
  const result=await readSharedPosition({...share,collateral:5000},101,rpc);
  assert.equal(result.status,'CLOSED');assert.equal(result.pnl,1.9);assert.equal(result.closePrice,110);assert.equal(result.txHash,hash);
  assert.equal(result.collateral,10);assert.equal(result.pnlPct,19,'return denominator comes from the settlement, not the post');
});
test('posts cannot redirect reads to an arbitrary contract, chain or owner',async()=>{
  assert.equal(hasPositionReference({...share,chainId:1}),false);
  assert.equal(hasPositionReference({...share,contract:trader}),false);
  assert.equal(hasPositionReference({...share,tradeId:'-1'}),false);
  await assert.rejects(readSharedPosition(share,101,{readContract:async()=>({owner:'0x0000000000000000000000000000000000000002'})}),/owner/);
});
