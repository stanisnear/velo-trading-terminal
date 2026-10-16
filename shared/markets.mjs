// Pyth Terminal trial grants verified 2026-10-16. Registry indices are immutable:
// never reuse an old slot, or historical positions will point at another asset.
/** @type {Array<[string, string, string, string, string, number | null]>} */
const definitions = [
  ['SOL', 'Solana', 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d', 'solana', '4128/large/solana.png', 2],
  ['BTC', 'Bitcoin', 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43', 'bitcoin', '1/large/bitcoin.png', 0],
  ['ETH', 'Ethereum', 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace', 'ethereum', '279/large/ethereum.png', 1],
  ['DOGE', 'Dogecoin', 'dcef50dd0a4cd2dcc17e45df1676dcb336a11a61c69df7a0299b0150c672d25c', 'dogecoin', '5/large/dogecoin.png', 5],
  ['PYTH', 'Pyth Network', '0bbf28e9a841a1cc788f6a361b17ca072d0ea3098a1e5df1c3922d06719579ff', 'pyth-network', '31924/large/pyth.png', null],
  ['BNB', 'BNB', '2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f', 'binancecoin', '825/large/bnb-icon2_2x.png', null],
  ['XRP', 'XRP', 'ec5d399846a9209f3fe5881d70aae9268c94339ff9817e8d18ff19fa05eea1c8', 'ripple', '44/large/xrp-symbol-white-128.png', null],
  ['HYPE', 'Hyperliquid', '4279e31cc369bbcc2faf022b382b080e32a8e689ff20fbc530d2a603eb6cd98b', 'hyperliquid', '50882/large/hyperliquid.jpg', null],
  ['WBTC', 'Wrapped Bitcoin', 'c9d8b075a5c69303365ae23633d4e085199bf5c520a3b90fed1322a0342ffc33', 'wrapped-bitcoin', '7598/large/WBTCLOGO.png', null],
  ['JITOSOL', 'Jito Staked SOL', '67be9f519b95cf24338801051f9a808eff0a578ccb388db73b7f6fe1de019ffb', 'jito-staked-sol', '28046/large/JitoSOL_Token_Logo_Green.png', null],
  ['STETH', 'Lido Staked Ether', '846ae1bdb6300b817cee5fdee2a6da192775030db5615b94a465f53bd40850b5', 'staked-ether', '13442/large/steth_logo.png', null],
  ['USDC', 'USDC', 'eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a', 'usd-coin', '6319/large/USDC.png', null],
  ['USDT', 'Tether', '2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b', 'tether', '325/large/Tether.png', null],
];
const binanceSymbols = new Set(['BTC', 'ETH', 'SOL', 'DOGE', 'PYTH', 'BNB', 'XRP', 'USDC']);
export const MARKETS = definitions.map(([symbol, name, feed, geckoId, logo, contractIndex]) => Object.freeze({
  symbol, name, feed, geckoId, contractIndex,
  binance: binanceSymbols.has(symbol) ? `${symbol}USDT` : null,
  id: `${symbol}/USD`, logo: `https://coin-images.coingecko.com/coins/images/${logo}`,
}));
export const TRADING_MARKETS = MARKETS.filter(market => market.contractIndex !== null);
export const isEnabledTradingMarket = pair => TRADING_MARKETS.some(market => market.id === pair?.replace('-', '/'));
