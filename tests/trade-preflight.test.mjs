import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTradePrice, validateProtectionPrices, validateTradeForm } from '../src/services/tradeFormValidation.mjs';
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

test('BTC prices require complete unambiguous decimal input and correct protection direction', () => {
  const base = { price: 69237.51, size: 1000, side: 'LONG', takeProfit: '75000.25', stopLoss: '65000.50' };
  assert.equal(validateTradeForm(base), null);
  for (const raw of ['15000,', '15000,00', '15,000', '69.237,51', '15 000', '75000.', '1e5', '0x10', '75000x', '+75000', 'NaN', 'Infinity', true, {}, []]) {
    assert(Number.isNaN(parseTradePrice(raw)), String(raw));
    assert.match(validateTradeForm({ ...base, takeProfit: raw }), /positive price/, String(raw));
    assert.match(validateTradeForm({ ...base, stopLoss: raw }), /positive price/, String(raw));
  }
  assert.match(validateTradeForm({ ...base, takeProfit: '15000' }), /above/);
  assert.equal(validateTradeForm({ ...base, side: 'SHORT', takeProfit: '15000', stopLoss: '75000' }), null);
  assert.match(validateTradeForm({ ...base, price: '69237.51,' }), /execution price/);
  assert.match(validateTradeForm({ ...base, size: '1000,' }), /size/);
  assert.match(validateTradeForm({ ...base, takeProfit: '0' }), /positive/);
  assert.equal(validateTradeForm({ ...base, takeProfit: '', stopLoss: '' }), null);
  assert.equal(parseTradePrice(' 69237.51 '), 69237.51);
  assert.equal(parseTradePrice('.125'), .125);
  assert.equal(validateProtectionPrices({ side: 'LONG', referencePrice: 69237.51, takeProfit: 0, stopLoss: 0, allowZero: true }), null);
  for (const raw of [NaN, Infinity, -1, 1e-19, 1e25]) assert.match(validateProtectionPrices({ side: 'LONG', takeProfit: raw, stopLoss: 0, allowZero: true }), /positive/);
});

test('V4 protection uses position-relative profit limits, including low-price PYTH targets', () => {
 const base={price:.0616,size:10141.74,side:'LONG',takeProfit:'100000',stopLoss:'',maxFavorableMove:1};
 assert.match(validateTradeForm(base),/engine profit limit/);
 assert(validateTradeForm(base).includes('$0.1232'));
 assert.equal(validateTradeForm({...base,takeProfit:'.1'}),null);
 assert.equal(validateTradeForm({...base,takeProfit:'.1232'}),null);
 assert.match(validateTradeForm({...base,takeProfit:'.1233'}),/profit limit/);
 assert.equal(validateTradeForm({...base,side:'SHORT',takeProfit:'.04'}),null);
 assert.match(validateTradeForm({...base,side:'SHORT',takeProfit:'100000'}),/below/);
 assert.match(validateTradeForm({...base,price:69237.51,takeProfit:'1000000'}),/profit limit/);
 assert.equal(validateTradeForm({...base,price:69237.51,takeProfit:'100000'}),null,'limits scale with each asset, not a fixed dollar threshold');
 assert.equal(validateTradeForm({...base,maxFavorableMove:undefined}),null,'legacy positions do not inherit V4 economics');
});
