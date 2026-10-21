import { MARKETS } from './markets.mjs';

// Verified provider identities, never ticker-only matches (symbols can collide).
export const CMC_IDS = Object.freeze({ SOL: 5426, BTC: 1, ETH: 1027, DOGE: 74, PYTH: 28177,
  BNB: 1839, XRP: 52, HYPE: 32196, WBTC: 3717, JITOSOL: 22533, STETH: 8085, USDC: 3408, USDT: 825 });

export function normalizeMarketCoins(rows) {
  if (!Array.isArray(rows)) throw new Error('Market data is unavailable');
  const seen = new Set();
  return rows.filter(row => row && Number.isSafeInteger(row.id) && row.id > 0
    && typeof row.symbol === 'string' && /^[a-z0-9.-]{1,20}$/i.test(row.symbol)
    && typeof row.name === 'string' && !seen.has(row.id) && seen.add(row.id))
    .slice(0, 50).map(row => {
      const known = MARKETS.find(market => CMC_IDS[market.symbol] === row.id);
      const symbol = row.symbol.toUpperCase();
      const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
      const quote = row.quote?.USD || {};
      return {
        assetId: known?.geckoId || `cmc-${row.id}`, geckoId: known?.geckoId || null,
        cmcId: row.id, cmcSlug: /^[a-z0-9-]+$/.test(row.slug || '') ? row.slug : null, symbol, name: row.name.slice(0, 100),
        logo: `https://s2.coinmarketcap.com/static/img/coins/128x128/${row.id}.png`,
        id: `${symbol}/USD`, pairId: `${symbol}/USD`, binance: known?.binance || null,
        rank: number(row.cmc_rank), price: number(quote.price),
        change: number(quote.percent_change_24h), volume: number(quote.volume_24h),
        change7d: number(quote.percent_change_7d), change30d: number(quote.percent_change_30d),
        marketCap: number(quote.market_cap), supply: number(row.circulating_supply),
        fdv: number(quote.fully_diluted_market_cap), updatedAt: quote.last_updated || row.last_updated,
        tags: Array.isArray(row.tags) ? row.tags.filter(tag => typeof tag === 'string').slice(0, 100) : [],
        sparkline: [],
      };
    });
}

export function resolveMarketAsset(assets, identifier) {
  const key = String(identifier || '').toLowerCase();
  // Stable provider IDs avoid collisions between coins sharing a ticker.
  return assets.find(asset => asset.assetId.toLowerCase() === key)
    || assets.find(asset => asset.symbol.toLowerCase() === key);
}

export function mentionsTicker(content, symbol) {
  if (typeof symbol !== 'string' || !symbol) return false;
  const tokens = String(content || '').match(/\$[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*/g) || [];
  return tokens.some(token => token.slice(1).toUpperCase() === symbol.toUpperCase());
}
