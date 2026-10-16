import { MARKETS } from '../shared/markets.mjs';
// Restrict live and history requests to the account's entitled crypto feeds.
export const allowedFeeds = new Set(MARKETS.map(market => market.feed));
export const allowedSymbols = new Set(MARKETS.map(market => 'Crypto.' + market.id));
