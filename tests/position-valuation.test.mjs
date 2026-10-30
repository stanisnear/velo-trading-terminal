import test from 'node:test';
import assert from 'node:assert/strict';
import { positionPnl, positionSettlement, triggerPriceForRoe, liquidationEstimate } from '../src/services/positionValuation.mjs';
const now = 100000000;
const position = { side:'LONG',entryPrice:100,size:998,leverage:10,timestamp:now,
  v4:{collateral:99.8,openFee:1,spreadRatio:.0002,borrowBpsPerHour:1,maintenanceBps:50} };
test('V4 display clamps profit and losses and includes entry, exit and borrowing fees', () => {
  assert.equal(positionPnl(position,0,now),-100.8);
  assert(Math.abs(positionPnl(position,1000,now)-(998-1-.998))<1e-8);
  assert(Math.abs(positionPnl(position,1000,now+3600000)-(998-1-.998-.0998))<1e-8);
  const short={...position,side:'SHORT'};
  assert.equal(positionPnl(short,10000,now),-100.8);
  assert(positionPnl(short,50,now)>0);
});
test('liquidation estimate accounts for maintenance and close fees, and moves with borrowing', () => {
  const price=liquidationEstimate(position,now);
  assert(price>90 && price<92);
  assert(liquidationEstimate(position,now+3600000)>price);
  const short={...position,side:'SHORT'};
  assert(liquidationEstimate(short,now+3600000)<liquidationEstimate(short,now));
});
test('legacy display calculations do not change', () => {
  assert.equal(positionPnl({...position,v4:undefined},110,now),99.8);
  assert.equal(positionPnl({...position,entryPrice:0},110,now),0);
});
test('trigger return sliders invert the fee-aware estimate for long and short positions', () => {
  for (const side of ['LONG', 'SHORT']) for (const target of [10, 50, 200, -10, -50, -90]) {
    const p = { ...position, side };
    const mark = triggerPriceForRoe(p, target, now);
    const settlement = positionSettlement(p, mark, now, true);
    assert(Math.abs(settlement.pnl / (p.v4.collateral + p.v4.openFee) * 100 - target) < .0001);
    assert.equal(settlement.keeperFee, p.size * .0005);
  }
  const exhausted = positionSettlement(position, 0, now, true);
  assert.equal(exhausted.payout, 0); assert.equal(exhausted.keeperFee, 0);
});

test('account equity counts cash, net payouts and pending escrow without charging entry fees twice', async()=>{
 const {accountEquity,accountPositionPnl}=await import('../src/services/positionValuation.mjs');
 const payout=positionSettlement(position,100,now).payout;
 const cashAfterOpen=899.2; // 1000 minus 99.8 collateral and the 1 entry fee
 assert.equal(accountEquity(cashAfterOpen,[position],{[position.pair]:100},[],now),cashAfterOpen+payout);
 assert(Math.abs(accountPositionPnl(position,100,now)-positionPnl(position,100,now)-1)<1e-8);
 const orders=[{active:true,collateralUSDC:30},{active:false,collateralUSDC:500}];
 assert.equal(accountEquity(970,[],{},orders,now),1000,'escrow is allocated money, not a loss');
 assert.equal(accountEquity(1000,[],{},[],now),1000,'cancelling returns escrow without creating profit');
 assert.equal(accountEquity(899.2,[position],{},[],now),null,'missing marks cannot produce an account snapshot');
 assert.equal(accountEquity(cashAfterOpen+payout,[],{},[],now),accountEquity(cashAfterOpen,[position],{[position.pair]:100},[],now),'settling at the quote conserves equity');
});
