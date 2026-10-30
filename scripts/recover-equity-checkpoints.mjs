// Read-only recovery. Uses archive state and the transaction's signed Pyth update;
// an unpriceable position makes the entire checkpoint unavailable, never zero.
import { readFileSync, writeFileSync } from 'node:fs';
import { createPublicClient, http, decodeFunctionData, decodeEventLog, erc20Abi } from 'viem';
import { baseSepolia } from 'viem/chains';
const [trader, input, output] = process.argv.slice(2);
if (!/^0x[0-9a-f]{40}$/i.test(trader || '') || !input || !output) throw Error('Usage: node scripts/recover-equity-checkpoints.mjs TRADER RECEIPTS_JSON OUTPUT_JSON');
const abi = JSON.parse(readFileSync('contracts/out/VeloPerpsV4.sol/VeloPerpsV4.json')).abi;
const pythAbi = JSON.parse(readFileSync('contracts/out/IPythV2.sol/IPythV2.json')).abi;
const engine = '0xE9AEcFbc5814ce3b2dB0107594d80F054e6dB52f';
const token = '0x5EFaF3F69b09bC2abF3439bDC0C93bf611026699';
const rpc = createPublicClient({ chain:baseSepolia, transport:http(process.env.EQUITY_ARCHIVE_RPC || 'https://base-sepolia-rpc.publicnode.com', {timeout:12000,retryCount:1}) });
const read = (name,args=[],blockNumber) => rpc.readContract({address:engine,abi,functionName:name,args,blockNumber});
const same = address => address?.toLowerCase() === trader.toLowerCase();
const evidence = JSON.parse(readFileSync(input));
const hashes = new Set([...evidence.transactions || [],...evidence.trades || []].map(row=>row.hash?.replace(/^faucet:/,'')).filter(hash=>/^0x[0-9a-f]{64}$/i.test(hash || '')));
const latest = await rpc.getBlock();
const earlier = await rpc.getBlock({blockNumber:latest.number-1000n});
const secondsPerBlock = Number(latest.timestamp-earlier.timestamp)/1000;
// Recover active-position opening receipts even when the app did not save a hash.
for (const id of await read('getTraderTrades',[trader])) {
  const p = await read('getPosition',[id]);
  const estimated = latest.number-BigInt(Math.round(Number(latest.timestamp-p.openedAt)/secondsPerBlock));
  const logs = await rpc.getLogs({address:engine,event:abi.find(x=>x.name==='PositionOpened'),args:{tradeId:id,trader},fromBlock:estimated>128n?estimated-128n:0n,toBlock:estimated+128n<latest.number?estimated+128n:latest.number,strict:true});
  for (const log of logs) hashes.add(log.transactionHash);
}
const points=[], skipped=[];
for (const hash of hashes) {
  try {
    const receipt=await rpc.getTransactionReceipt({hash});
    if(receipt.status!=='success')throw Error('Receipt not successful');
    // Only V4 events or actual collateral-token movements involving this wallet.
    const relevant=receipt.logs.some(log=>{
      try {if(log.address.toLowerCase()===engine.toLowerCase())return same(decodeEventLog({abi,data:log.data,topics:log.topics}).args.trader);
        if(log.address.toLowerCase()===token.toLowerCase()){const event=decodeEventLog({abi:erc20Abi,data:log.data,topics:log.topics});return event.eventName==='Transfer'&&(same(event.args.from)||same(event.args.to));}
      }catch{} return false;
    });
    if(!relevant)throw Error('No matching wallet/engine event');
    // A pre-V4 token receipt cannot describe the current engine's account.
    points.push(await checkpoint(receipt.blockNumber,hash));
    console.log('Recovered',new Date(points.at(-1).timestamp).toISOString(),points.at(-1).value);
  }catch(error){skipped.push({hash,reason:error.shortMessage||error.message});}
}
// Sample actual archive balances between receipts only when there is no open
// exposure. Never project an entry price or a current quote into an older block.
const first=Math.min(...points.map(p=>p.timestamp));
for(let at=Math.ceil(first/21600000)*21600000;at<=Number(latest.timestamp)*1000;at+=21600000){
  const blockNumber=latest.number-BigInt(Math.round((Number(latest.timestamp)-at/1000)/secondsPerBlock));
  try {points.push(await checkpoint(blockNumber));}catch(error){skipped.push({blockNumber:String(blockNumber),reason:error.shortMessage||error.message});}
}
async function checkpoint(blockNumber,hash){
    const block=await rpc.getBlock({blockNumber});
    const ids=await read('getTraderTrades',[trader],blockNumber);
    const positions=await Promise.all(ids.map(id=>read('getPosition',[id],blockNumber)));
    let payout=0n;
    if(ids.length){
      if(!hash)throw Error('Open exposure without a signed historical mark');
      const tx=await rpc.getTransaction({hash});
      const decoded=decodeFunctionData({abi,data:tx.input});
      const updateData=decoded.args.find(arg=>Array.isArray(arg)&&arg.length&&typeof arg[0]==='string'&&arg[0].startsWith('0x'));
      if(!updateData)throw Error('Open exposure without a signed historical mark');
      const pairs=[...new Set(positions.map(p=>p.pairIndex))];
      const feeds=await Promise.all(pairs.map(pair=>read('pairFeedId',[pair],blockNumber)));
      const pyth=await read('PYTH',[],blockNumber);
      const fee=await rpc.readContract({address:pyth,abi:pythAbi,functionName:'getUpdateFee',args:[updateData],blockNumber});
      const maximumAge=await read('PYTH_MAX_AGE_SECONDS',[],blockNumber);
      const {result:prices}=await rpc.simulateContract({address:pyth,abi:pythAbi,functionName:'parsePriceFeedUpdates',args:[updateData,feeds,block.timestamp-maximumAge,block.timestamp],account:tx.from,value:fee,blockNumber});
      const marks=new Map(prices.map(feed=>{
        const exponent=18+feed.price.expo;
        const mark=exponent>=0?feed.price.price*10n**BigInt(exponent):feed.price.price/10n**BigInt(-exponent);
        if(mark<=0n)throw Error('Invalid historical oracle price');
        const index=feeds.findIndex(id=>id.toLowerCase()===feed.id.toLowerCase());
        if(index<0)throw Error('Unexpected historical price feed');
        return [pairs[index],mark];
      }));
      if(pairs.some(pair=>!marks.has(pair)))throw Error('Incomplete historical prices');
      for(let i=0;i<ids.length;i++)payout+=(await read('quoteClose',[ids[i],marks.get(positions[i].pairIndex),false],blockNumber)).payout;
    }
    let escrow=0n;
    for(const id of await read('getTraderOrders',[trader],blockNumber)){
      const order=await read('conditionalOrders',[id],blockNumber);
      if(!same(order[0])||!order[11])throw Error('Invalid escrow ownership');
      escrow+=order[8];
    }
    const cash=await rpc.readContract({address:token,abi:erc20Abi,functionName:'balanceOf',args:[trader],blockNumber});
    return {timestamp:Number(block.timestamp)*1000,value:Number(cash+payout+escrow)/1e6,blockNumber:String(blockNumber),blockHash:block.hash,txHash:hash??null,source:'chain_checkpoint'};
}
const result={chainId:84532,trader:trader.toLowerCase(),engine:engine.toLowerCase(),points:[...new Map(points.map(p=>[p.blockNumber,p])).values()].sort((a,b)=>a.timestamp-b.timestamp),skipped};
writeFileSync(output,JSON.stringify(result,null,2));
console.log('Verified checkpoints:',result.points.length,'Skipped:',skipped.length);
