import test from 'node:test';
import assert from 'node:assert/strict';
import {activeTradingOrders, protectionAfterCancellation} from '../src/services/activeTradingOrders.mjs';
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
test('cancelling one protection leg preserves the other and rejects a foreign engine',()=>{
 const orders=activeTradingOrders([],[p],contract);
 const position={id:'velo_5',onChainTradeId:'5',onChain:true,onChainContract:contract,takeProfit:81,stopLoss:73};
 assert.deepEqual(protectionAfterCancellation(orders[0],position,contract),{tradeId:5n,takeProfit:0,stopLoss:73});
 assert.deepEqual(protectionAfterCancellation(orders[1],position,contract),{tradeId:5n,takeProfit:81,stopLoss:0});
 assert.throws(()=>protectionAfterCancellation(orders[0],{...position,onChainContract:'0x02'},contract),/Refresh/);
});
