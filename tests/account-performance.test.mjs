import test from 'node:test';
import assert from 'node:assert/strict';
import { accountPerformance, readHistoryPages } from '../src/services/accountPerformance.mjs';

test('history pagination loads past the API page boundary and preserves explicit limits',async()=>{
  const rows=Array.from({length:1128},(_,i)=>({id:String(i)})),calls=[];
  const fetch=async(offset,size)=>{calls.push([offset,size]);return rows.slice(offset,offset+size);};
  assert.equal((await readHistoryPages(fetch)).length,1128);
  assert.deepEqual(calls,[[0,500],[500,500],[1000,500]]);
  calls.length=0;
  assert.equal((await readHistoryPages(fetch,128)).length,128);
  assert.deepEqual(calls,[[0,128]]);
  await assert.rejects(readHistoryPages(async(offset)=>{if(offset)throw Error('offline');return rows.slice(0,500);}),/offline/,'failed older pages must not look like complete history');
});

test('performance keeps May history, counts liquidations and break-even, and excludes opens and duplicates',()=>{
  const now=Date.parse('2026-10-29T12:00:00Z');
  const row=(id,pnl,date,action='CLOSE')=>({id,pnl,timestamp:Date.parse(date),action,pair:'SOL/USD',size:10000});
  const may=row('may',100,'2026-05-26T18:13:20Z');
  const history=[row('loss',-40,'2026-10-28T12:00:00Z','LIQUIDATION'),may,{...may},row('flat',0,'2026-10-28T13:00:00Z'),row('open',999,'2026-10-28T14:00:00Z','OPEN'),row('future',999,'2026-10-30T12:00:00Z')];
  const result=accountPerformance(history,'ALL',now);
  assert.equal(result.totalTrades,3);assert.equal(result.realizedPnl,60);
  assert.equal(result.wins,1);assert.equal(result.losses,1);assert.equal(result.breakeven,1);
  assert.equal(result.profitFactor,2.5);assert.equal(result.drawdown,40);
  assert.equal(result.average,20);assert.equal(result.points.at(-1).value,60);
  assert.ok(result.points[0].timestamp<Date.parse('2026-05-27'),'not clipped to 90 days');
  assert.equal(accountPerformance(history,'1W',now).realizedPnl,-40,'period PnL starts at zero, not at the previous all-time total');
  assert.deepEqual(accountPerformance([]).points,[]);
  assert.equal(accountPerformance([may],'ALL',now).profitFactor,null,'no losses is unavailable, never Infinity');
});

test('settlements in one second aggregate without dropping results and numeric strings are normalized',()=>{
  const timestamp=Date.now()-10000;
  const r=accountPerformance([{id:'a',action:'CLOSE',pnl:'10',timestamp,pair:'ETH/USD'},{id:'b',action:'CLOSE',pnl:'-4',timestamp,pair:'ETH/USD'}]);
  assert.equal(r.points.at(-1).value,6);assert.equal(r.points.length,2);assert.equal(r.markets[0].pnl,6);
});
