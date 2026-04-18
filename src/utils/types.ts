
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
  botId?: string;
  copyTraderId?: string;
  action?: 'OPEN' | 'CLOSE';
}

export interface Transaction {
  id: string;
  type: 'DEPOSIT' | 'WITHDRAW';
  amount: number;
  timestamp: number;
  status: 'COMPLETED' | 'PENDING';
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
  botId?: string;
  copyTraderId?: string;
}

export interface ActiveBot {
  id: string;
  name: string;
  pairs: string[];
  risk: 'AGGRESSIVE' | 'CONSERVATIVE' | 'DEGEN';
  status: 'RUNNING' | 'PAUSED';
  pnl: number; // Total PnL (Realized + Unrealized display snapshot)
  realizedPnL: number; // Strictly closed trades
  startedAt: number;
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
  activeBots: ActiveBot[]; 
  tradeHistory: TradeHistoryItem[];
  transactionHistory: Transaction[]; 
  pnlHistory: { time: string; value: number }[]; 
  joinedDate: string;
  likes: string[]; 
  reposts: string[]; 
}

export interface Notification {
  id: string;
  type: 'SUCCESS' | 'ERROR' | 'INFO' | 'TRADE' | 'ALERT' | 'LIKE' | 'REPOST' | 'FOLLOW' | 'COMMENT' | 'DEPOSIT' | 'WITHDRAW' | 'LIQUIDATION' | 'EARN';
  message: string;
  timestamp: number;
  read: boolean;
  relatedId?: string; 
}

export interface BotStrategy {
  id: string;
  name: string;
  description: string;
  apy: number;
  winRate: number;
  tags: string[];
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
  isBotTrade?: boolean;
  botId?: string; 
  copyTraderId?: string;
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
  SOCIAL = 'SOCIAL',
  LEADERBOARD = 'LEADERBOARD', 
  STRATEGY = 'STRATEGY',
  PROFILE = 'PROFILE',
  PUBLIC_PROFILE = 'PUBLIC_PROFILE'
}

export type ChartTimeframe = '1m' | '5m' | '15m' | '1H' | '4H' | '1D';
export type ChartStyle = 'CANDLES' | 'LINE' | 'AREA' | 'BARS';
export type SocialSort = 'LATEST' | 'TRENDING';
export type ProfileTab = 'POSTS' | 'REPLIES' | 'MEDIA' | 'LIKES' | 'TRADES';

export const PAIRS = [
  { id: 'SOL/USD', name: 'Solana', basePrice: 145, logo: 'https://assets.coingecko.com/coins/images/4128/standard/solana.png', geckoId: 'solana' },
  { id: 'BTC/USD', name: 'Bitcoin', basePrice: 64200, logo: 'https://assets.coingecko.com/coins/images/1/standard/bitcoin.png', geckoId: 'bitcoin' },
  { id: 'ETH/USD', name: 'Ethereum', basePrice: 3400, logo: 'https://assets.coingecko.com/coins/images/279/standard/ethereum.png', geckoId: 'ethereum' },
  { id: 'WIF/USD', name: 'dogwifhat', basePrice: 3.40, logo: 'https://assets.coingecko.com/coins/images/33566/standard/dogwifhat.jpg', geckoId: 'dogwifcoin' },
  { id: 'JUP/USD', name: 'Jupiter', basePrice: 1.20, logo: 'https://assets.coingecko.com/coins/images/34188/standard/jup.png', geckoId: 'jupiter-exchange-solana' },
  { id: 'BONK/USD', name: 'Bonk', basePrice: 0.000024, logo: 'https://assets.coingecko.com/coins/images/28600/standard/bonk.jpg', geckoId: 'bonk' },
  { id: 'AVAX/USD', name: 'Avalanche', basePrice: 48.50, logo: 'https://assets.coingecko.com/coins/images/12559/standard/Avalanche_Circle_RedWhite_Trans.png', geckoId: 'avalanche-2' },
  { id: 'LINK/USD', name: 'Chainlink', basePrice: 18.20, logo: 'https://assets.coingecko.com/coins/images/877/standard/chainlink-new-logo.png', geckoId: 'chainlink' },
  { id: 'DOGE/USD', name: 'Dogecoin', basePrice: 0.16, logo: 'https://assets.coingecko.com/coins/images/5/standard/dogecoin.png', geckoId: 'dogecoin' },
  { id: 'PEPE/USD', name: 'Pepe', basePrice: 0.0000078, logo: 'https://assets.coingecko.com/coins/images/29850/standard/pepe-token.jpeg', geckoId: 'pepe' },
  { id: 'RNDR/USD', name: 'Render', basePrice: 10.40, logo: 'https://assets.coingecko.com/coins/images/11636/standard/rndr.png', geckoId: 'render-token' },
  { id: 'NEAR/USD', name: 'Near Protocol', basePrice: 7.20, logo: 'https://assets.coingecko.com/coins/images/10365/standard/near.jpg', geckoId: 'near' },
  { id: 'TIA/USD', name: 'Celestia', basePrice: 14.30, logo: 'https://assets.coingecko.com/coins/images/31967/standard/tia.jpg', geckoId: 'celestia' },
  { id: 'INJ/USD', name: 'Injective', basePrice: 38.90, logo: 'https://assets.coingecko.com/coins/images/12882/standard/Secondary_Symbol.png', geckoId: 'injective-protocol' },
  { id: 'PYTH/USD', name: 'Pyth Network', basePrice: 0.85, logo: 'https://assets.coingecko.com/coins/images/31924/standard/pyth.png', geckoId: 'pyth-network' },
];
