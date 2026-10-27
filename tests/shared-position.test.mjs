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
const {readSharedPosition,hasPositionReference,SHARED_ENGINE,parseTradeShare,readPositionEvidence}=await import(pathToFileURL(file));
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

test('public card settings survive persistence while unknown modes are discarded',()=>{
  const parsed=parseTradeShare({...share,presentation:'pnl',updateMode:'snapshot',theme:'light',design:'ledger',hideAmounts:true,onClose:'freeze'});
  assert.equal(parsed.presentation,'pnl');assert.equal(parsed.updateMode,'snapshot');assert.equal(parsed.theme,'light');assert.equal(parsed.hideAmounts,true);assert.equal(parsed.onClose,'freeze');
  const invalid=parseTradeShare({...share,updateMode:'execute',theme:'javascript:alert(1)',design:{bad:true}});
  assert.equal(invalid.updateMode,undefined);assert.equal(invalid.theme,undefined);assert.equal(invalid.design,undefined);
});

const openAbi=parseAbi(['event PositionOpened(uint256 indexed tradeId,address indexed trader,uint16 indexed pairIndex,bool isLong,uint16 leverage,uint8 marginMode,uint64 collateralUSDC_6,uint128 entryPrice_E18)']);
const openLog={address:SHARED_ENGINE,logIndex:1,topics:encodeEventTopics({abi:openAbi,eventName:'PositionOpened',args:{tradeId:1n,trader,pairIndex:2}}),data:encodeAbiParameters(openAbi[0].inputs.filter(x=>!x.indexed),[true,10,0,6000000n,100000000000000000000n])};
test('position details verify an opening receipt and use block time and opening terms',async()=>{
  const result=await readPositionEvidence({...share,openTxHash:hash},{getTransactionReceipt:async()=>({status:'success',transactionHash:hash,blockNumber:500n,logs:[openLog]}),getBlock:async()=>({timestamp:1000n})});
  assert.equal(result.openTxHash,hash);assert.equal(result.openedAt,1000000);assert.equal(result.opening.pair,'SOL/USD');assert.equal(result.opening.size,60);assert.equal(result.opening.entryPrice,100);
});
test('an unrelated transaction, another owner or another engine never becomes a verified receipt',async()=>{
  for(const log of [{...openLog,address:trader},{...openLog,topics:encodeEventTopics({abi:openAbi,eventName:'PositionOpened',args:{tradeId:2n,trader,pairIndex:2}})}]){
    const result=await readPositionEvidence({...share,openTxHash:hash},{getTransactionReceipt:async()=>({status:'success',transactionHash:hash,blockNumber:500n,logs:[log]})});assert.equal(result.openTxHash,undefined);
  }
  assert.deepEqual(await readPositionEvidence({...share,contract:trader},{}),{});
});
test('older shares can recover an opening receipt from a bounded observed-time log window',async()=>{
  let span;
  const rpc={getBlock:async({blockNumber}={})=>blockNumber===0n?{number:0n,timestamp:0n}:blockNumber===500n?{number:500n,timestamp:1000n}:{number:1000n,timestamp:2000n},getLogs:async query=>{span=query.toBlock-query.fromBlock;assert.equal(query.args.tradeId,1n);assert.equal(query.address,SHARED_ENGINE);return[{transactionHash:hash}];},getTransactionReceipt:async()=>({status:'success',transactionHash:hash,blockNumber:500n,logs:[openLog]})};
  const result=await readPositionEvidence({...share,openedAt:1000000},rpc);assert.ok(span<=512n);assert.equal(result.openedAt,1000000);assert.equal(result.openTxHash,hash);
});
