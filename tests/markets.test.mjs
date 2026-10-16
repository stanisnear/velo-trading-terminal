import test from 'node:test';
import assert from 'node:assert/strict';
import { MARKETS, TRADING_MARKETS, isEnabledTradingMarket } from '../shared/markets.mjs';
import { allowedFeeds, allowedSymbols } from '../cloudflare/pyth-feeds.js';

test('only the thirteen entitled crypto feeds are exposed to the UI and proxy', () => {
  assert.deepEqual(MARKETS.map(m => m.symbol).sort(), ['BNB','BTC','DOGE','ETH','HYPE','JITOSOL','PYTH','SOL','STETH','USDC','USDT','WBTC','XRP']);
  assert.equal(new Set(MARKETS.map(m => m.feed)).size, 13);
  assert.deepEqual(allowedFeeds, new Set(MARKETS.map(m => m.feed)));
  assert.deepEqual(allowedSymbols, new Set(MARKETS.map(m => `Crypto.${m.id}`)));
  for (const market of MARKETS) assert.match(market.feed, /^[a-f0-9]{64}$/);
});

test('new orders use only supported original registry slots, never reassigned indices', () => {
  assert.deepEqual(Object.fromEntries(TRADING_MARKETS.map(m => [m.symbol, m.contractIndex])), { SOL: 2, BTC: 0, ETH: 1, DOGE: 5 });
  for (const market of MARKETS) assert.equal(isEnabledTradingMarket(market.id), ['BTC','ETH','SOL','DOGE'].includes(market.symbol));
  for (const pair of ['APT/USD','AVAX/USD','NEAR/USD','LINK/USD',undefined]) assert.equal(isEnabledTradingMarket(pair), false);
  assert.equal(isEnabledTradingMarket('BTC-USD'), true);
});
