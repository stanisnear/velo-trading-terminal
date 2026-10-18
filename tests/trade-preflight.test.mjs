import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTradeForm } from '../src/services/tradeFormValidation.mjs';
import { readTradingPreflight } from '../src/services/tradePreflight.mjs';

test('trade form rejects invalid numeric values and inverted TP/SL without silently ignoring clicks', () => {
  const form = { price: 100, size: 20, side: 'LONG', takeProfit: '120', stopLoss: '80' };
  assert.equal(validateTradeForm(form), null);
  for (const price of [0, NaN, Infinity, -1]) assert.match(validateTradeForm({ ...form, price }), /price/);
  for (const size of [0, NaN, Infinity, -1]) assert.match(validateTradeForm({ ...form, size }), /size/);
  assert.match(validateTradeForm({ ...form, takeProfit: '99' }), /above/);
  assert.match(validateTradeForm({ ...form, stopLoss: '101' }), /below/);
  assert.match(validateTradeForm({ ...form, stopLoss: '1x' }), /positive/);
  assert.equal(validateTradeForm({ ...form, side: 'SHORT', takeProfit: '80', stopLoss: '120' }), null);
});
test('registry and gas checks start concurrently and return fresh results', async () => {
  const calls = [], resolvers = [];
  const read = key => { calls.push(key); return new Promise(resolve => resolvers.push(resolve)); };
  const result = readTradingPreflight({ readContract: args => read(args.functionName), getBalance: () => read('gas') }, 'contract', [], 2, 'trader');
  assert.deepEqual(calls, ['pairFeedId', 'pairTradable', 'gas']);
  resolvers[0]('feed'); resolvers[1](true); resolvers[2](4n);
  assert.deepEqual(await result, { feedId: 'feed', tradable: true, gasBalance: 4n });
});
