// ─── TRADING PAIRS CONFIG ──────────────────────────────────────────────
export const PAIRS = [
  { id: "BTC/USD", coin: "BTC", name: "Bitcoin", geckoId: "bitcoin", icon: "https://assets.coingecko.com/coins/images/1/standard/bitcoin.png" },
  { id: "ETH/USD", coin: "ETH", name: "Ethereum", geckoId: "ethereum", icon: "https://assets.coingecko.com/coins/images/279/standard/ethereum.png" },
  { id: "SOL/USD", coin: "SOL", name: "Solana", geckoId: "solana", icon: "https://assets.coingecko.com/coins/images/4128/standard/solana.png" },
  { id: "AVAX/USD", coin: "AVAX", name: "Avalanche", geckoId: "avalanche-2", icon: "https://assets.coingecko.com/coins/images/12559/standard/Avalanche_Circle_RedWhite_Trans.png" },
  { id: "LINK/USD", coin: "LINK", name: "Chainlink", geckoId: "chainlink", icon: "https://assets.coingecko.com/coins/images/877/standard/chainlink-new-logo.png" },
  { id: "DOGE/USD", coin: "DOGE", name: "Dogecoin", geckoId: "dogecoin", icon: "https://assets.coingecko.com/coins/images/5/standard/dogecoin.png" },
  { id: "NEAR/USD", coin: "NEAR", name: "NEAR Protocol", geckoId: "near", icon: "https://assets.coingecko.com/coins/images/10365/standard/near.jpg" },
  { id: "INJ/USD", coin: "INJ", name: "Injective", geckoId: "injective-protocol", icon: "https://assets.coingecko.com/coins/images/12882/standard/Secondary_Symbol.png" },
  { id: "RNDR/USD", coin: "RNDR", name: "Render", geckoId: "render-token", icon: "https://assets.coingecko.com/coins/images/11636/standard/rndr.png" },
  { id: "TIA/USD", coin: "TIA", name: "Celestia", geckoId: "celestia", icon: "https://assets.coingecko.com/coins/images/31967/standard/tia.jpg" },
  { id: "SUI/USD", coin: "SUI", name: "Sui", geckoId: "sui", icon: "https://assets.coingecko.com/coins/images/26375/standard/sui_asset.jpeg" },
  { id: "WIF/USD", coin: "WIF", name: "dogwifhat", geckoId: "dogwifcoin", icon: "https://assets.coingecko.com/coins/images/33566/standard/dogwifhat.jpg" },
  { id: "PEPE/USD", coin: "PEPE", name: "Pepe", geckoId: "pepe", icon: "https://assets.coingecko.com/coins/images/29850/standard/pepe-token.jpeg" },
  { id: "JUP/USD", coin: "JUP", name: "Jupiter", geckoId: "jupiter-exchange-solana", icon: "https://assets.coingecko.com/coins/images/34188/standard/jup.png" },
  { id: "BONK/USD", coin: "BONK", name: "Bonk", geckoId: "bonk", icon: "https://assets.coingecko.com/coins/images/28600/standard/bonk.jpg" },
  { id: "PYTH/USD", coin: "PYTH", name: "Pyth Network", geckoId: "pyth-network", icon: "https://assets.coingecko.com/coins/images/31924/standard/pyth.png" },
];

export const PAIR_MAP = Object.fromEntries(PAIRS.map(p => [p.id, p]));
export const GECKO_IDS = PAIRS.map(p => p.geckoId).join(",");

// Fallback prices when API is unavailable
export const FALLBACK_PRICES = {
  "BTC/USD": 84500, "ETH/USD": 1590, "SOL/USD": 134, "AVAX/USD": 20,
  "LINK/USD": 12.8, "DOGE/USD": 0.155, "NEAR/USD": 2.4, "INJ/USD": 9.1,
  "RNDR/USD": 4.1, "TIA/USD": 3.5, "SUI/USD": 2.15, "WIF/USD": 0.48,
  "PEPE/USD": 0.0000072, "JUP/USD": 0.42, "BONK/USD": 0.000012, "PYTH/USD": 0.15,
};

export const LEVERAGE_OPTIONS = [1, 2, 3, 5, 10, 20, 50, 75, 100, 125];
export const TIMEFRAMES = ["1m", "5m", "15m", "1H", "4H", "1D"];
export const INDICATORS_LIST = [
  { id: "sma20", name: "SMA 20", color: "#8b5cf6", period: 20 },
  { id: "sma50", name: "SMA 50", color: "#f59e0b", period: 50 },
  { id: "ema12", name: "EMA 12", color: "#06b6d4", period: 12 },
  { id: "ema26", name: "EMA 26", color: "#ec4899", period: 26 },
  { id: "bb", name: "Bollinger Bands", color: "#6366f1", period: 20 },
];
