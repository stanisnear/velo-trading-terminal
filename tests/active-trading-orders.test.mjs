import test from 'node:test';
import assert from 'node:assert/strict';
import {activeTradingOrders, protectionCancellation, requiresLiveEntry} from '../src/services/activeTradingOrders.mjs';
const contract='0x0000000000000000000000000000000000000001';
const p={tradeId:5n,pair:'HYPE-USD',isLong:true,leverage:10,notionalUSDC:11442,openedAt:100,takeProfit:81,stopLoss:73};
test('V4 protection appears alongside entry orders, with stable IDs and no duplicate rows on refresh',()=>{
 const conditional=[{orderId:4n,pair:'SOL-USD',isLong:false,triggerKind:'LIMIT',triggerPrice:100,collateralUSDC:20,leverage:5,createdAt:100}];
 const orders=activeTradingOrders(conditional,[p],contract);
 assert.equal(orders.length,3);assert.deepEqual(orders.map(o=>o.type),['LIMIT','TAKE_PROFIT','STOP_LOSS']);
 assert(orders.every(o=>o.onChain&&o.onChainContract===contract));
 assert.deepEqual(activeTradingOrders(conditional,[{...p}],contract),orders);
 assert.equal(activeTradingOrders([],[],contract).length,0);
 assert.equal(activeTradingOrders([],[{...p,stopLoss:undefined}],contract).length,1);
});
test('protection cancellation identifies only the leg and never copies stale sibling prices',()=>{
 const [tp,sl]=activeTradingOrders([],[p],contract);
 assert.deepEqual(protectionCancellation(tp,contract),{tradeId:5n,leg:'TAKE_PROFIT'});
 assert.deepEqual(protectionCancellation(sl,contract),{tradeId:5n,leg:'STOP_LOSS'});
 for(const patch of [{onChainContract:'0x02'},{onChainTradeId:'-1'},{relatedPositionId:'velo_6'},{onChain:false}])
  assert.throws(()=>protectionCancellation({...tp,...patch},contract),/Refresh/);
});

test('existing oversized PYTH protection stays visible for review and cancellation, with the position direction',()=>{
 const py={...p,pair:'PYTH-USD',entryPrice:.0616,takeProfit:100000,stopLoss:undefined,v4:{}};
 const [order]=activeTradingOrders([],[py],contract);
 assert.equal(order.side,'SHORT');assert.equal(order.positionSide,'LONG');
 assert.equal(order.price,100000);assert.match(order.validationError,/profit limit/);
 assert.equal(activeTradingOrders([],[{...py,takeProfit:.1}],contract)[0].validationError,undefined);
 const position={id:'velo_5',onChainTradeId:'5',onChain:true,onChainContract:contract,takeProfit:100000};
 assert.deepEqual(protectionCancellation(order,contract),{tradeId:5n,leg:'TAKE_PROFIT'});
});

test('live account routing survives wallet disconnects and cannot fall back to simulation',()=>{
 assert.equal(requiresLiveEntry('0x01',undefined),true);
 assert.equal(requiresLiveEntry(undefined,'0x01'),true);
 assert.equal(requiresLiveEntry(undefined,undefined),false);
});
