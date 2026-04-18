
import { Candle, Post, Trader, UserProfile, PAIRS, Position, Notification, BotStrategy, Transaction } from '../utils/types';

const getNow = () => Math.floor(Date.now() / 1000);

export const generateCandles = (count: number, startPrice: number, intervalSeconds: number = 900): Candle[] => {
  let price = startPrice;
  const candles: Candle[] = [];
  const now = getNow();

  for (let i = 0; i < count; i++) {
    const time = (now - (count - i) * intervalSeconds) as any; 
    // Higher volatility for shorter timeframes to make it look realistic
    const volatility = price * (0.005 * (Math.sqrt(intervalSeconds / 900))); 
    const change = (Math.random() - 0.5) * volatility;
    const close = price + change;
    const high = Math.max(price, close) + Math.random() * (volatility * 0.5);
    const low = Math.min(price, close) - Math.random() * (volatility * 0.5);
    const volume = Math.floor(Math.random() * 100000) + 10000;

    candles.push({ time, open: price, high, low, close, volume });
    price = close;
  }
  return candles;
};

// Keys
const KEY_USER = 'velo_user_v8';
const KEY_POSTS = 'velo_posts_v8';
const KEY_POSITIONS = 'velo_positions_v8';
const KEY_TRADERS = 'velo_traders_v8';

export const AVAILABLE_BOTS: BotStrategy[] = [
    { id: 'bot_momentum', name: 'Velocity Momentum', description: 'Trades breakouts on high volume pairs. Best for trending markets.', apy: 142, winRate: 68, tags: ['Trending', 'Aggressive'] },
    { id: 'bot_mean_rev', name: 'Mean Reversion', description: 'Buys the dip and sells the rip. Great for chopping markets.', apy: 85, winRate: 75, tags: ['Range', 'Conservative'] },
    { id: 'bot_arbitrage', name: 'Dex Arbitrage', description: 'Exploits price differences between Solana DEXs.', apy: 45, winRate: 98, tags: ['Low Risk', 'Stable'] },
    { id: 'bot_ai_alpha', name: 'Gemini Alpha', description: 'Uses LLMs to analyze social sentiment and trade memecoins.', apy: 320, winRate: 45, tags: ['High Risk', 'AI'] },
];

export const INITIAL_TRADERS: Trader[] = [
  { id: '1', handle: '@SolanaWhale', username: 'Solana Whale', bio: 'Hunting alpha on SOL chain. High leverage, high reward.', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Whale', banner: 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?auto=format&fit=crop&w=1000&q=80', pnl: 452.3, followers: ['2','3','4','5'], following: ['7'], veloRewards: 54000, winRate: 78, activePositions: [], isPrivate: false, joinedDate: '2023-01-15' },
  { id: '2', handle: '@DegenSpartan', username: 'Degen Spartan', bio: 'Leverage is my middle name. I trade macro trends.', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Spartan', banner: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1000&q=80', pnl: 1240.5, followers: ['1','3'], following: ['1','9'], veloRewards: 32500, winRate: 65, activePositions: [], isPrivate: false, joinedDate: '2023-03-22' },
  { id: '3', handle: '@BonkMaster', username: 'Bonk King', bio: 'WIF to the moon. Memecoin specialist.', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Bonk', banner: 'https://images.unsplash.com/photo-1621504450168-38f647311816?auto=format&fit=crop&w=1000&q=80', pnl: -12.4, followers: ['1'], following: ['1','2','4','5','6','7'], veloRewards: 120, winRate: 42, activePositions: [], isPrivate: false, joinedDate: '2024-01-05' },
  { id: '4', handle: '@CryptoWizard', username: 'Merlin', bio: 'Analyzing charts since 2017. Technical Analysis only.', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Merlin', banner: 'https://images.unsplash.com/photo-1642104704074-907c0698cbd9?auto=format&fit=crop&w=1000&q=80', pnl: 89.2, followers: ['3','5'], following: ['7'], veloRewards: 15600, winRate: 55, activePositions: [], isPrivate: true, joinedDate: '2022-11-10' },
  { id: '5', handle: '@SBF_Ghost', username: 'Alameda Intern', bio: 'Too soon? I trade news events.', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Ghost', banner: 'https://images.unsplash.com/photo-1605792657660-596af9009e82?auto=format&fit=crop&w=1000&q=80', pnl: 210.5, followers: ['1','2','3'], following: ['1','2','3','7','9'], veloRewards: 41000, winRate: 61, activePositions: [], isPrivate: false, joinedDate: '2023-06-12' },
  { id: '6', handle: '@LadyTrade', username: 'Sarah Trades', bio: 'Conservative gains. Slow and steady wins the race.', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah', banner: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1000&q=80', pnl: 45.1, followers: [], following: ['1','7'], veloRewards: 4500, winRate: 88, activePositions: [], isPrivate: false, joinedDate: '2023-09-01' },
  { id: '7', handle: '@VeloGod', username: 'The Velo God', bio: 'I built the bots.', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=God', banner: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1000&q=80', pnl: 3400.2, followers: ['1','2','3','4','5','6','8','9','10','11','12'], following: [], veloRewards: 150000, winRate: 92, activePositions: [], isPrivate: false, joinedDate: '2022-01-01' },
  { id: '8', handle: '@RektPlebs', username: 'Liquidator', bio: 'Counter trading the masses.', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Rekt', banner: 'https://images.unsplash.com/photo-1611974765270-ca1258634369?auto=format&fit=crop&w=1000&q=80', pnl: 156.7, followers: [], following: ['7'], veloRewards: 18900, winRate: 59, activePositions: [], isPrivate: true, joinedDate: '2023-04-14' },
  { id: '9', handle: '@Ansem', username: 'Ansem', bio: 'The leader of the bull run.', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Ansem', banner: '', pnl: 5600.2, followers: ['1','2','5','7'], following: ['10','11'], veloRewards: 98000, winRate: 82, activePositions: [], isPrivate: false, joinedDate: '2021-08-15' },
  { id: '10', handle: '@Hsaka', username: 'Hsaka', bio: 'Price action and flow.', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Hsaka', banner: '', pnl: 2100.0, followers: ['9'], following: ['11'], veloRewards: 67000, winRate: 75, activePositions: [], isPrivate: false, joinedDate: '2020-05-20' },
  { id: '11', handle: '@GCR', username: 'Gigantic Rebirth', bio: 'Betting against the crowd.', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=GCR', banner: '', pnl: 8900.5, followers: ['7','9','10'], following: [], veloRewards: 200000, winRate: 95, activePositions: [], isPrivate: true, joinedDate: '2021-02-10' },
  { id: '12', handle: '@Cobie', username: 'Cobie', bio: 'Crypto is a scam, but I love it.', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Cobie', banner: '', pnl: 150.0, followers: ['7'], following: [], veloRewards: 12000, winRate: 50, activePositions: [], isPrivate: false, joinedDate: '2019-11-01' },
];

export const INITIAL_POSTS: Post[] = [
  {
    id: 'p1',
    authorId: '1',
    authorHandle: '@SolanaWhale',
    authorAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Whale',
    content: 'Just longed $SOL at $145. Breakout imminent. 🚀 The chart looks exactly like it did in 2021 before the mega run.',
    image: 'https://images.unsplash.com/photo-1642543492481-44e81e3914a7?auto=format&fit=crop&w=800&q=80',
    timestamp: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
    likes: 245,
    reposts: 45,
    likedBy: ['2', '7'],
    repostedBy: [],
    comments: [
        { id: 'c1', authorId: '3', authorHandle: '@BonkMaster', authorAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Bonk', content: "Aping in with you! LFG", timestamp: new Date(Date.now() - 1000 * 60).toISOString() }
    ],
    isTradeSignal: true,
    tradeDetails: { pair: 'SOL/USD', side: 'LONG', leverage: 5, entry: 145.20 }
  },
  {
    id: 'p2',
    authorId: '2',
    authorHandle: '@DegenSpartan',
    authorAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Spartan',
    content: 'Market looking choppy. I am sitting on hands until 62k BTC support confirms. Don\'t get chopped up by these wicks.',
    timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    likes: 120,
    reposts: 12,
    likedBy: [],
    repostedBy: [],
    comments: [],
    isTradeSignal: false
  },
];

const generatePnlHistory = () => {
    const history = [];
    const now = Date.now();
    for (let i = 12; i >= 0; i--) {
        const d = new Date(now);
        d.setMonth(d.getMonth() - i);
        history.push({ time: d.toLocaleDateString(), value: 10000 + (Math.random() * 5000 - 1000), timestamp: d.getTime(), type: '1Y' });
    }
    for (let i = 30; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        history.push({ time: d.toLocaleDateString(), value: 10000 + (Math.random() * 3000 - 500), timestamp: d.getTime(), type: '1M' });
    }
    for(let i=24; i>=0; i--) {
        const d = new Date(now);
        d.setHours(d.getHours() - i);
        history.push({ time: d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), value: 10000 + (Math.random() * 500), timestamp: d.getTime(), type: '1D' });
    }
    return history.sort((a,b) => a.timestamp - b.timestamp);
}

const MOCK_PNL_HISTORY = generatePnlHistory();

export const getStoredUser = (): UserProfile | null => {
    const data = localStorage.getItem(KEY_USER);
    return data ? JSON.parse(data) : null;
};

export const saveUser = (user: UserProfile) => {
    localStorage.setItem(KEY_USER, JSON.stringify(user));
};

export const registerUser = (username: string, email: string): UserProfile => {
    const newUser: UserProfile = {
        id: `user_${Date.now()}`,
        username: username,
        handle: `@${username.replace(/\s+/g, '')}`,
        bio: 'Just joined VELO. Ready to trade.',
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
        banner: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=1000&q=80',
        balance: 10000, 
        pnlTotal: 0,
        realizedPnL: 0,
        following: ['1', '7'], 
        copying: [],
        followers: ['7'],
        copierCount: 0,
        earnedFees: 0,
        veloRewards: 50,
        tradeHistory: [],
        transactionHistory: [],
        activeBots: [],
        pnlHistory: MOCK_PNL_HISTORY, 
        joinedDate: new Date().toISOString(),
        likes: [],
        reposts: []
    };
    saveUser(newUser);
    return newUser;
};

export const depositFunds = (user: UserProfile, amount: number): UserProfile => {
    const transaction: Transaction = { id: `txn_${Date.now()}`, type: 'DEPOSIT', amount, timestamp: Date.now(), status: 'COMPLETED' };
    const updated = { ...user, balance: user.balance + amount, transactionHistory: [transaction, ...user.transactionHistory] };
    saveUser(updated); return updated;
}
export const withdrawFunds = (user: UserProfile, amount: number): UserProfile => {
    const transaction: Transaction = { id: `txn_${Date.now()}`, type: 'WITHDRAW', amount, timestamp: Date.now(), status: 'COMPLETED' };
    const updated = { ...user, balance: user.balance - amount, transactionHistory: [transaction, ...user.transactionHistory] };
    saveUser(updated); return updated;
}
export const getStoredPosts = (): Post[] => { const data = localStorage.getItem(KEY_POSTS); return data ? JSON.parse(data) : INITIAL_POSTS; };
export const savePosts = (posts: Post[]) => { localStorage.setItem(KEY_POSTS, JSON.stringify(posts)); };
export const getStoredPositions = (): Position[] => { const data = localStorage.getItem(KEY_POSITIONS); return data ? JSON.parse(data) : []; };
export const savePositions = (positions: Position[]) => { localStorage.setItem(KEY_POSITIONS, JSON.stringify(positions)); };
export const getStoredTraders = (): Trader[] => { const data = localStorage.getItem(KEY_TRADERS); return data ? JSON.parse(data) : INITIAL_TRADERS; };
export const saveTraders = (traders: Trader[]) => { localStorage.setItem(KEY_TRADERS, JSON.stringify(traders)); };
export const resetAccount = () => { localStorage.removeItem(KEY_USER); localStorage.removeItem(KEY_POSTS); localStorage.removeItem(KEY_POSITIONS); localStorage.removeItem(KEY_TRADERS); window.location.reload(); }

export const simulateTradersActivity = (traders: Trader[], marketPrices: Record<string, number>) => {
    const updatedTraders = [...traders];
    const newActions: { traderId: string, action: 'OPEN' | 'CLOSE', position: Position, pairId: string }[] = [];
    
    updatedTraders.forEach(trader => {
        // Close existing positions
        if (trader.activePositions.length > 0) {
            if (Math.random() < 0.05) { 
                const posToClose = trader.activePositions[0];
                trader.activePositions = trader.activePositions.slice(1);
                const currentPrice = marketPrices[posToClose.pair] || posToClose.entryPrice;
                const pnl = (currentPrice - posToClose.entryPrice) * (posToClose.side === 'LONG' ? 1 : -1) * (posToClose.size/posToClose.entryPrice);
                trader.pnl += pnl;
                newActions.push({ traderId: trader.id, action: 'CLOSE', position: posToClose, pairId: posToClose.pair });
            }
        } 
        
        // Open new positions
        if (trader.activePositions.length < 3 && Math.random() < 0.05) { 
            const pair = PAIRS[Math.floor(Math.random() * PAIRS.length)];
            const price = marketPrices[pair.id];
            const side = Math.random() > 0.5 ? 'LONG' : 'SHORT';
            const leverage = Math.floor(Math.random() * 10) + 2;
            
            const liquidationPrice = side === 'LONG' 
                ? price * (1 - 1/leverage) 
                : price * (1 + 1/leverage);

            const newPos: Position = { id: `tpos_${trader.id}_${Date.now()}`, pair: pair.id, side, entryPrice: price, size: 1000 + Math.random() * 9000, leverage, marginMode: 'ISOLATED', liquidationPrice: Math.max(0, liquidationPrice), timestamp: Date.now(), takeProfit: side === 'LONG' ? price * 1.5 : price * 0.5, stopLoss: side === 'LONG' ? price * 0.8 : price * 1.2 };
            trader.activePositions.push(newPos);
            newActions.push({ traderId: trader.id, action: 'OPEN', position: newPos, pairId: pair.id });
        }
    });
    return { updatedTraders, newActions };
};

export const simulateUserBotActivity = (user: UserProfile | null, positions: Position[], marketPrices: Record<string, number>) => {
    if (!user || !user.activeBots || user.activeBots.length === 0) return { newPosition: null, closedPositionId: null };
    const bot = user.activeBots[Math.floor(Math.random() * user.activeBots.length)];
    if(bot.status === 'PAUSED') return { newPosition: null, closedPositionId: null };
    
    const botTrades = positions.filter(p => p.botId === bot.id);
    
    // Increased probability for demo purposes
    if (botTrades.length < 5 && Math.random() < 0.1) { 
        const allowedPairs = bot.pairs.length > 0 ? bot.pairs : PAIRS.map(p => p.id);
        const pairId = allowedPairs[Math.floor(Math.random() * allowedPairs.length)];
        const currentPrice = marketPrices[pairId];
        if (currentPrice) {
            const side = Math.random() > 0.5 ? 'LONG' : 'SHORT';
            const leverage = bot.risk === 'DEGEN' ? 50 : bot.risk === 'AGGRESSIVE' ? 20 : 5;
            const size = 1000;
            
            const liquidationPrice = side === 'LONG' 
                ? currentPrice * (1 - 1/leverage) 
                : currentPrice * (1 + 1/leverage);

            const newPosition: Position = { id: `bot_${Date.now()}`, pair: pairId, side, entryPrice: currentPrice, size, leverage, marginMode: 'ISOLATED', liquidationPrice: Math.max(0, liquidationPrice), timestamp: Date.now(), isBotTrade: true, botId: bot.id, takeProfit: side === 'LONG' ? currentPrice * 1.2 : currentPrice * 0.8, stopLoss: side === 'LONG' ? currentPrice * 0.9 : currentPrice * 1.1 };
            return { newPosition, closedPositionId: null };
        }
    }
    
    if (botTrades.length > 0 && Math.random() < 0.05) {
        const tradeToClose = botTrades[0];
        return { newPosition: null, closedPositionId: tradeToClose.id };
    }
    
    return { newPosition: null, closedPositionId: null };
}

export const simulateSocialActivity = (traders: Trader[], posts: Post[], currentUserId?: string, userHasPositions: boolean = false) => {
    const newPosts: Post[] = [];
    let updatedPosts = [...posts];
    const newNotifications: Notification[] = [];
    let copierStatsUpdate = { newCopiers: 0, feesEarned: 0 };

    // Reduced rate: ~1.5% per tick (was 5%) — more realistic pacing
    if (Math.random() < 0.015) {
        const trader = traders[Math.floor(Math.random() * traders.length)];
        const topics = ['$SOL', '$BTC', 'long', 'short', 'moon', 'rekt', 'alpha', 'airdrop'];
        const topic = topics[Math.floor(Math.random() * topics.length)];
        const content = `Market is looking ${Math.random() > 0.5 ? 'bullish' : 'bearish'} on ${topic}. ${Math.random() > 0.5 ? '🚀' : '📉'}`;
        newPosts.push({ id: `p_${Date.now()}_${Math.random()}`, authorId: trader.id, authorHandle: trader.handle, authorAvatar: trader.avatar, content, timestamp: new Date().toISOString(), likes: 0, reposts: 0, likedBy: [], repostedBy: [], comments: [] });
    }
    
    // External likes on user posts — reduced rate
    if (currentUserId && Math.random() < 0.02) {
        const userPosts = updatedPosts.filter(p => p.authorId === currentUserId);
        if (userPosts.length > 0) {
            const randomPost = userPosts[Math.floor(Math.random() * userPosts.length)];
            const reactor = traders[Math.floor(Math.random() * traders.length)];
            if (Math.random() > 0.5) {
                if (!randomPost.likedBy.includes(reactor.id)) {
                    randomPost.likes += 1;
                    randomPost.likedBy.push(reactor.id);
                    newNotifications.push({ id: `notif_like_${Date.now()}`, type: 'LIKE', message: `${reactor.username} liked your post`, timestamp: Date.now(), read: false, relatedId: randomPost.id });
                }
            } else {
                if (!randomPost.repostedBy.includes(reactor.id)) {
                    randomPost.reposts += 1;
                    randomPost.repostedBy.push(reactor.id);
                    newNotifications.push({ id: `notif_repost_${Date.now()}`, type: 'REPOST', message: `${reactor.username} reposted your post`, timestamp: Date.now(), read: false, relatedId: randomPost.id });
                }
            }
        }
    }

    // New Copiers logic
    if (currentUserId && Math.random() < 0.02) {
        const copier = traders[Math.floor(Math.random() * traders.length)];
        copierStatsUpdate.newCopiers += 1;
        newNotifications.push({ id: `notif_copy_${Date.now()}`, type: 'FOLLOW', message: `${copier.username} started copy trading you!`, timestamp: Date.now(), read: false });
    }

    // Fee Earnings Logic
    if (currentUserId && userHasPositions && Math.random() < 0.03) {
        const fees = parseFloat((Math.random() * 5).toFixed(2));
        if(fees > 0) {
            copierStatsUpdate.feesEarned += fees;
            newNotifications.push({ id: `notif_earn_${Date.now()}`, type: 'EARN', message: `You earned $${fees} in fees from your copiers.`, timestamp: Date.now(), read: false });
        }
    }
    
    return { newPosts, updatedPosts, newNotifications, copierStatsUpdate };
}
