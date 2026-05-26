
export interface Candle {
  time: number; 
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TradeHistoryItem {
  id: string;
  pair: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  size: number;
  pnl: number;
  timestamp: number;
  openedAt?: number;
  leverage?: number;
  marginMode?: 'ISOLATED' | 'CROSS';
  liquidationPrice?: number;
  copyTraderId?: string;
  action?: 'OPEN' | 'CLOSE';
  positionId?: string;
  // ── On-chain (Orderly testnet) metadata ─────────────────────────────────
  onChain?: boolean;            // true if routed through Orderly on Base Sepolia
  orderlyOrderId?: number;      // Orderly matching-engine order id
  orderlyOrderUrl?: string;     // link to Orderly portfolio page for this order
  txHash?: string;              // optional on-chain tx hash (for deposit/withdraw-adjacent rows)
}

export interface Transaction {
  id: string;
  type: 'DEPOSIT' | 'WITHDRAW' | 'SEND' | 'RECEIVE';
  amount: number;
  timestamp: number;
  status: 'COMPLETED' | 'PENDING' | 'FAILED';
  // ── On-chain (Orderly testnet / Base Sepolia) metadata ─────────────────
  onChain?: boolean;            // true = real on-chain tx (not simulated)
  txHash?: string;              // Base Sepolia tx hash
  withdrawNonce?: number;       // Orderly withdraw nonce (for withdrawals)
  counterparty?: string;        // SEND / RECEIVE counterpart label
}

export interface OpenOrder {
  id: string;
  pair: string;
  side: 'LONG' | 'SHORT';
  type: 'LIMIT' | 'STOP' | 'TAKE_PROFIT' | 'STOP_LOSS';
  price: number;
  size: number;
  leverage: number;
  timestamp: number;
  relatedPositionId?: string; // Links TP/SL orders to a position
  copyTraderId?: string;
  // ── On-chain (Orderly testnet) metadata ─────────────────────────────────
  onChain?: boolean;            // true if placed on Orderly matching engine
  orderlyOrderId?: number;      // Orderly order id for cancel / lookup
  orderlyOrderUrl?: string;
}

export interface UserProfile {
  id: string;
  username: string;
  handle: string;
  bio?: string;
  avatar: string;
  banner?: string;
  balance: number;
  pnlTotal: number;
  realizedPnL: number;
  following: string[];
  copying: string[];
  followers: string[];
  copierCount: number;
  earnedFees: number;
  veloRewards: number;
  tradeHistory: TradeHistoryItem[];
  transactionHistory: Transaction[];
  pnlHistory: { time: string; value: number }[];
  joinedDate: string;
  likes: string[];
  reposts: string[];
}

export type NotificationType =
  | 'SUCCESS' | 'ERROR' | 'INFO' | 'TRADE' | 'ALERT'
  | 'LIKE' | 'REPOST' | 'FOLLOW' | 'COMMENT' | 'MENTION' | 'WALL_POST'
  | 'DEPOSIT' | 'WITHDRAW' | 'EARN'
  | 'LIQUIDATION' | 'POSITION_CLOSED' | 'TAKE_PROFIT' | 'STOP_LOSS';

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  timestamp: number;
  read: boolean;
  relatedId?: string;
}

export interface Comment {
  id: string;
  authorId: string;
  authorHandle: string;
  authorAvatar: string;
  content: string;
  timestamp: string;
}

export interface Post {
  id: string;
  authorId: string;
  authorHandle: string;
  authorAvatar: string;
  content: string;
  image?: string; 
  timestamp: string;
  likes: number;
  likedBy: string[];
  reposts: number; 
  repostedBy: string[];
  comments: Comment[];
  isTradeSignal?: boolean;
  targetProfileId?: string;  // wall post: posted on another user's profile
  mentions?: string[];        // user ids mentioned via @handle
  tradeDetails?: {
    pair: string;
    side: 'LONG' | 'SHORT';
    leverage: number;
    entry: number;
  };
}

export type OrderType = 'MARKET' | 'LIMIT' | 'STOP' | 'TAKE_PROFIT' | 'STOP_LOSS';
export type MarginMode = 'ISOLATED' | 'CROSS';

export interface Position {
  id: string;
  pair: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  size: number;
  leverage: number;
  marginMode: MarginMode;
  liquidationPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  timestamp: number;
  pnl?: number;
  isCopyTrade?: boolean;
  copyTraderId?: string;
  // ── On-chain (Orderly testnet) metadata ─────────────────────────────────
  onChain?: boolean;
  orderlyOrderId?: number;      // open order id
  orderlyOrderUrl?: string;
}

export interface Trader {
  id: string;
  handle: string;
  username: string;
  bio: string;
  avatar: string;
  banner: string;
  pnl: number;
  followers: string[];
  following: string[];
  veloRewards: number; 
  winRate: number;
  activePositions: Position[];
  isPrivate: boolean; 
  joinedDate: string;
}

export enum TabView {
  DASHBOARD = 'DASHBOARD',
  TRADE = 'TRADE',
  MARKETS = 'MARKETS',
  SOCIAL = 'SOCIAL',
  LEADERBOARD = 'LEADERBOARD',
  PROFILE = 'PROFILE',
  PUBLIC_PROFILE = 'PUBLIC_PROFILE',
  ADMIN = 'ADMIN'
}

export type ChartTimeframe = '1m' | '3m' | '5m' | '15m' | '30m' | '1H' | '2H' | '4H' | '6H' | '12H' | '1D' | '3D' | '1W' | '1M';
export type ChartStyle = 'CANDLES' | 'LINE' | 'AREA' | 'BARS';
export type SocialSort = 'LATEST' | 'TRENDING';
export type ProfileTab = 'POSTS' | 'REPLIES' | 'MEDIA' | 'LIKES' | 'TRADES';

// ─── All pairs (used in DEMO mode with simulated trading) ────────────────────
export const PAIRS = [
  { id: 'SOL/USD',  name: 'Solana',       basePrice: 145,       logo: 'https://assets.coingecko.com/coins/images/4128/standard/solana.png',       geckoId: 'solana' },
  { id: 'BTC/USD',  name: 'Bitcoin',      basePrice: 64200,     logo: 'https://assets.coingecko.com/coins/images/1/standard/bitcoin.png',          geckoId: 'bitcoin' },
  { id: 'ETH/USD',  name: 'Ethereum',     basePrice: 3400,      logo: 'https://assets.coingecko.com/coins/images/279/standard/ethereum.png',       geckoId: 'ethereum' },
  { id: 'WIF/USD',  name: 'dogwifhat',    basePrice: 3.40,      logo: 'https://assets.coingecko.com/coins/images/33566/standard/dogwifhat.jpg',    geckoId: 'dogwifcoin' },
  { id: 'JUP/USD',  name: 'Jupiter',      basePrice: 1.20,      logo: 'https://assets.coingecko.com/coins/images/34188/standard/jup.png',          geckoId: 'jupiter-exchange-solana' },
  { id: 'BONK/USD', name: 'Bonk',         basePrice: 0.000024,  logo: 'https://assets.coingecko.com/coins/images/28600/standard/bonk.jpg',         geckoId: 'bonk' },
  { id: 'AVAX/USD', name: 'Avalanche',    basePrice: 48.50,     logo: 'https://assets.coingecko.com/coins/images/12559/standard/Avalanche_Circle_RedWhite_Trans.png', geckoId: 'avalanche-2' },
  { id: 'LINK/USD', name: 'Chainlink',    basePrice: 18.20,     logo: 'https://assets.coingecko.com/coins/images/877/standard/chainlink-new-logo.png', geckoId: 'chainlink' },
  { id: 'DOGE/USD', name: 'Dogecoin',     basePrice: 0.16,      logo: 'https://assets.coingecko.com/coins/images/5/standard/dogecoin.png',         geckoId: 'dogecoin' },
  { id: 'PEPE/USD', name: 'Pepe',         basePrice: 0.0000078, logo: 'https://assets.coingecko.com/coins/images/29850/standard/pepe-token.jpeg',  geckoId: 'pepe' },
  { id: 'RNDR/USD', name: 'Render',       basePrice: 10.40,     logo: 'https://assets.coingecko.com/coins/images/11636/standard/rndr.png',         geckoId: 'render-token' },
  { id: 'NEAR/USD', name: 'Near Protocol',basePrice: 7.20,      logo: 'https://assets.coingecko.com/coins/images/10365/standard/near.jpg',         geckoId: 'near' },
  { id: 'TIA/USD',  name: 'Celestia',     basePrice: 14.30,     logo: 'https://assets.coingecko.com/coins/images/31967/standard/tia.jpg',          geckoId: 'celestia' },
  { id: 'INJ/USD',  name: 'Injective',    basePrice: 38.90,     logo: 'https://assets.coingecko.com/coins/images/12882/standard/Secondary_Symbol.png', geckoId: 'injective-protocol' },
  { id: 'PYTH/USD', name: 'Pyth Network', basePrice: 0.85,      logo: 'https://assets.coingecko.com/coins/images/31924/standard/pyth.png',         geckoId: 'pyth-network' },
];

// ─── Orderly-supported pairs (used in LIVE/WALLET mode) ───────────────────────
// Only pairs that exist on Orderly testnet as perpetual contracts.
// Everything else is simulated demo-only.
// Pairs that Velo Perps supports on Base Sepolia. Order matches PAIR_INDEX in
// veloPerpsService.ts so slot 0 = BTC, slot 1 = ETH, etc.
//
// Slots 0–5 (BTC..DOGE) are registered at deploy time. Slots 6+ are visible
// in the UI but the contract owner needs to register them through the Admin
// Panel before they're tradable on-chain. Until then, the pair-tradable
// pre-flight check in useVeloPerpsTrading surfaces a clean error.
export const VELO_PAIRS = [
  { id: 'BTC/USD',    name: 'Bitcoin',    basePrice: 64200,    logo: 'https://assets.coingecko.com/coins/images/1/standard/bitcoin.png',          geckoId: 'bitcoin' },
  { id: 'ETH/USD',    name: 'Ethereum',   basePrice: 3400,     logo: 'https://assets.coingecko.com/coins/images/279/standard/ethereum.png',       geckoId: 'ethereum' },
  { id: 'SOL/USD',    name: 'Solana',     basePrice: 145,      logo: 'https://assets.coingecko.com/coins/images/4128/standard/solana.png',        geckoId: 'solana' },
  { id: 'AVAX/USD',   name: 'Avalanche',  basePrice: 48.50,    logo: 'https://assets.coingecko.com/coins/images/12559/standard/Avalanche_Circle_RedWhite_Trans.png', geckoId: 'avalanche-2' },
  { id: 'LINK/USD',   name: 'Chainlink',  basePrice: 18.20,    logo: 'https://assets.coingecko.com/coins/images/877/standard/chainlink-new-logo.png', geckoId: 'chainlink' },
  { id: 'DOGE/USD',   name: 'Dogecoin',   basePrice: 0.16,     logo: 'https://assets.coingecko.com/coins/images/5/standard/dogecoin.png',         geckoId: 'dogecoin' },
  { id: 'NEAR/USD',   name: 'Near',       basePrice: 7.20,     logo: 'https://assets.coingecko.com/coins/images/10365/standard/near.jpg',         geckoId: 'near' },
  { id: 'INJ/USD',    name: 'Injective',  basePrice: 38.90,    logo: 'https://assets.coingecko.com/coins/images/12882/standard/Secondary_Symbol.png', geckoId: 'injective-protocol' },
  { id: 'APT/USD',    name: 'Aptos',      basePrice: 12.10,    logo: 'https://assets.coingecko.com/coins/images/26455/standard/aptos_round.png',  geckoId: 'aptos' },
  { id: 'ARB/USD',    name: 'Arbitrum',   basePrice: 1.05,     logo: 'https://assets.coingecko.com/coins/images/16547/standard/arb.jpg',          geckoId: 'arbitrum' },
  { id: 'OP/USD',     name: 'Optimism',   basePrice: 2.45,     logo: 'https://assets.coingecko.com/coins/images/25244/standard/Optimism.png',     geckoId: 'optimism' },
  { id: 'SUI/USD',    name: 'Sui',        basePrice: 1.85,     logo: 'https://assets.coingecko.com/coins/images/26375/standard/sui_asset.jpeg',   geckoId: 'sui' },
  { id: 'TIA/USD',    name: 'Celestia',   basePrice: 9.80,     logo: 'https://assets.coingecko.com/coins/images/31967/standard/tia.jpg',          geckoId: 'celestia' },
  { id: 'SEI/USD',    name: 'Sei',        basePrice: 0.55,     logo: 'https://assets.coingecko.com/coins/images/28205/standard/Sei_Logo_-_Transparent.png', geckoId: 'sei-network' },
  { id: 'RENDER/USD', name: 'Render',     basePrice: 7.50,     logo: 'https://assets.coingecko.com/coins/images/11636/standard/rndr.png',         geckoId: 'render-token' },
  { id: 'WLFI/USD',   name: 'World Liberty Financial', basePrice: 0.32, logo: 'https://assets.coingecko.com/coins/images/72012/standard/WLFI_Token.png', geckoId: 'world-liberty-financial' },
  { id: 'POL/USD',    name: 'Polygon',    basePrice: 0.48,     logo: 'https://assets.coingecko.com/coins/images/32440/standard/polygon.png',      geckoId: 'matic-network' },
];

// Backwards-compat alias — many call sites still reference ORDERLY_PAIRS.
// New code should use VELO_PAIRS.
export const ORDERLY_PAIRS = VELO_PAIRS;

/** Returns true when the user authenticated with a crypto wallet (not demo/email). */
export const isWalletUser = (userId: string | undefined): boolean => {
  if (!userId) return false;
  // Supabase UUIDs from wallet login are proper UUIDs — demo users have ids
  // starting with "local_" and social/email users also get UUIDs but the
  // definitive check is whether they have an associated wallet address.
  // We expose this as a helper that App.tsx enriches with walletAddress presence.
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId) &&
    !userId.startsWith('local_');
};
