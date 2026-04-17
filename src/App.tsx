
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Wallet, Users, Bot, TrendingUp, Bell, Menu, X, ArrowRightLeft, 
  Copy, ThumbsUp, MessageCircle, Share2, Cpu, Zap, Settings, 
  LogOut, PlusCircle, BarChart2, Send, Trash2, Sun, Moon, 
  LayoutDashboard, UserCircle, Briefcase, ChevronRight, ChevronLeft, PlayCircle, PauseCircle,
  Clock, AlertTriangle, ExternalLink, Activity, Trophy, Search, Lock,
  Repeat, Image as ImageIcon, Heart, CreditCard, LogIn, ArrowDownCircle, ArrowUpCircle,
  Hash, Calculator, CheckCircle, Info, RefreshCw, MoreHorizontal, Sliders, ChevronDown, Flame, Timer, Check, Filter, Edit, Coins, Wallet as WalletIcon, Rocket, AlertCircle, Sparkles, MessageSquare, History, User, Volume2, Shield
} from 'lucide-react';

import { TradingViewChart } from './components/TradingViewChart';
import { v4 as uuidv4 } from 'uuid';
import { PortfolioChart } from './components/PortfolioChart';
import { OrderBook } from './components/OrderBook';
import { 
  generateCandles, getStoredUser, saveUser, getStoredPosts, 
  savePosts, getStoredPositions, savePositions, getStoredTraders, 
  saveTraders, resetAccount, simulateTradersActivity, registerUser, depositFunds, withdrawFunds, simulateSocialActivity, AVAILABLE_BOTS, simulateUserBotActivity, INITIAL_TRADERS, INITIAL_POSTS
} from './services/mockStore';
import { analyzeMarketSentiment, chatWithAi, generateBotStrategy } from './services/geminiService';
import { fetchRealPrices } from './services/priceService';
import { AuthModal } from './components/AuthModal';
import { supabase, getProfile, signOut as supabaseSignOut, isSupabaseConfigured, createPost as supabaseCreatePost } from './services/supabase';
import { Candle, Post, TabView, Trader, UserProfile, Position, PAIRS, Notification, OrderType, TradeHistoryItem, Comment, MarginMode, SocialSort, ProfileTab, BotStrategy, ActiveBot, Transaction, OpenOrder, ChartTimeframe } from './utils/types';

// --- Sound Service (Refined) ---
const playSound = (type: 'SUCCESS' | 'ERROR' | 'OPEN' | 'CLOSE' | 'CLICK') => {
    try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        const now = ctx.currentTime;
        
        if (type === 'SUCCESS') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(523.25, now); // C5
            osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.1); // E5
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
            osc.start(now);
            osc.stop(now + 0.4);
        } else if (type === 'ERROR') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.linearRampToValueAtTime(100, now + 0.15);
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
        } else if (type === 'OPEN') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, now);
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
        } else if (type === 'CLOSE') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, now);
            gain.gain.setValueAtTime(0.03, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
        } else {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1200, now);
            gain.gain.setValueAtTime(0.01, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
            osc.start(now);
            osc.stop(now + 0.03);
        }
    } catch (e) {
        // Ignore audio context errors
    }
};

// --- Helper Functions ---
const formatMoney = (amount: number | undefined | null) => {
    if (amount === undefined || amount === null) return '0.00';
    return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatPrice = (price: number | undefined | null) => {
    if (price === undefined || price === null) return '0.00';
    if (price < 0.0001) return price.toFixed(8);
    if (price < 0.01) return price.toFixed(6);
    if (price < 1) return price.toFixed(4);
    if (price < 10) return price.toFixed(4);
    return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const calculateStats = (tradeHistory: TradeHistoryItem[]) => {
    if (!tradeHistory || tradeHistory.length === 0) return { winRate: 0, realizedPnl: 0, totalTrades: 0, fees: 0 };
    const closedTrades = tradeHistory.filter(t => t.action === 'CLOSE' || (!t.action && t.pnl !== 0)); // Backwards compatibility
    const wins = closedTrades.filter(t => t.pnl > 0).length;
    const realizedPnl = closedTrades.reduce((acc, t) => acc + t.pnl, 0);
    const fees = closedTrades.length * 2.5; 
    return {
        winRate: closedTrades.length > 0 ? (wins / closedTrades.length) * 100 : 0,
        realizedPnl,
        totalTrades: closedTrades.length,
        fees
    };
};


// Check if user is Supabase-verified (UUID format vs demo timestamp format)
const isVerifiedUser = (userId: string) => {
    // UUID format: 8-4-4-4-12 hex chars
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
};
const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// --- Animations Components ---

const CoinAnimation = ({ type }: { type: 'DEPOSIT' | 'WITHDRAW' | 'DEPLOY' }) => (
    <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"></div>
        <div className="relative bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-white/10 p-8 rounded-3xl shadow-2xl flex flex-col items-center animate-float-up text-center">
            <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 shadow-lg ${
                type === 'DEPOSIT' ? 'bg-emerald-500/20 text-emerald-500' : 
                type === 'WITHDRAW' ? 'bg-amber-500/20 text-amber-500' : 
                'bg-purple-500/20 text-purple-500' // DEPLOY
            }`}>
                {type === 'DEPOSIT' ? <Coins size={48} className="animate-bounce" /> : 
                 type === 'WITHDRAW' ? <WalletIcon size={48} className="animate-pulse"/> :
                 <Rocket size={48} className="animate-bounce"/>}
            </div>
            <h2 className="text-3xl font-black text-gray-900 dark:text-white mb-2">
                {type === 'DEPOSIT' ? 'Deposit Successful' : 
                 type === 'WITHDRAW' ? 'Withdrawal Initiated' :
                 'Agent Deployed'}
            </h2>
            <p className="text-gray-500 font-medium">
                {type === 'DEPLOY' ? 'Initializing AI Strategy...' : 'Your funds are being processed.'}
            </p>
        </div>
    </div>
);

const ToastNotification = ({ message, type, onClose }: { message: string, type: 'SUCCESS' | 'ERROR' | 'INFO', onClose: () => void }) => {
    useEffect(() => {
        playSound(type === 'SUCCESS' ? 'SUCCESS' : type === 'ERROR' ? 'ERROR' : 'CLICK');
        const timer = setTimeout(onClose, 4000);
        return () => clearTimeout(timer);
    }, []);

    const icons = {
        SUCCESS: <CheckCircle size={20} className="text-emerald-500" fill="currentColor" color="white" />,
        ERROR: <AlertCircle size={20} className="text-red-500" fill="currentColor" color="white" />,
        INFO: <Info size={20} className="text-blue-500" fill="currentColor" color="white" />
    };

    return (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] w-auto pointer-events-none">
            <div className={`glass-panel border px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 animate-bounce-in pointer-events-auto bg-white dark:bg-[#1A1A1A] border-gray-200 dark:border-white/10`}>
                <div className="shrink-0">
                    {icons[type]}
                </div>
                <span className="text-sm font-bold text-gray-900 dark:text-white whitespace-nowrap">{message}</span>
            </div>
        </div>
    )
}

// --- Shared Components ---

const GlassCard = ({ children, className = '', onClick }: { children: React.ReactNode, className?: string, onClick?: (e: any) => void }) => (
  <div 
    onClick={onClick}
    className={`glass-panel rounded-3xl p-5 transition-all duration-300 backdrop-blur-3xl border 
    bg-white/60 dark:bg-[#0a0a0a]/60 border-white/40 dark:border-white/10 shadow-2xl shadow-black/5 dark:shadow-black/40
    text-gray-900 dark:text-white backdrop-saturate-150
    ${onClick ? 'cursor-pointer hover:border-blue-500/30 hover:bg-white/70 dark:hover:bg-[#121212]/70' : ''}
    ${className}`}
    style={{
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05), 0 20px 40px -10px rgba(0,0,0,0.1)'
    }}
  >
    {children}
  </div>
);

const Button = ({ children, onClick, variant = 'primary', className = '', disabled = false, isLoading = false }: any) => {
  const base = "px-5 py-2.5 rounded-xl font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20",
    secondary: "bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-white/10 border border-gray-200 dark:border-white/5",
    danger: "bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/10",
    success: "bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/20",
  };
  return (
    <button onClick={(e) => { playSound('CLICK'); onClick && onClick(e); }} disabled={disabled || isLoading} className={`${base} ${variants[variant as keyof typeof variants]} ${className}`}>
      {isLoading ? <RefreshCw className="animate-spin" size={16}/> : children}
    </button>
  );
};

const Input = ({ label, rightLabel, error, className = '', ...props }: any) => (
  <div className="w-full group">
    <div className="flex justify-between mb-1 ml-1">
        {label && <label className={`block text-[10px] font-bold uppercase tracking-wider transition-colors ${error ? 'text-red-500' : 'text-gray-500 group-focus-within:text-blue-500'}`}>{label}</label>}
        {rightLabel && <span className="text-[10px] text-gray-400">{rightLabel}</span>}
    </div>
    <div className="relative">
        <input className={`w-full px-4 py-2 rounded-xl bg-gray-50 dark:bg-[#1A1A1A] border focus:border-blue-500 outline-none text-gray-900 dark:text-white placeholder-gray-500 transition-all font-mono font-medium text-sm ${error ? 'border-red-500' : 'border-gray-200 dark:border-white/5'} ${className}`} {...props} />
    </div>
    {error && <p className="text-[10px] text-red-500 mt-1 ml-1 font-bold">{error}</p>}
  </div>
);

const PairSelector = ({ isOpen, onClose, onSelect, marketPrices = {} }: any) => {
    const [search, setSearch] = useState('');
    if (!isOpen) return null;
    const filtered = PAIRS.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.id.toLowerCase().includes(search.toLowerCase()));
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-fade-in" onClick={onClose}>
            <GlassCard className="w-full max-w-sm max-h-[600px] flex flex-col p-0 overflow-hidden !rounded-2xl" onClick={(e:any) => e.stopPropagation()}>
                <div className="p-4 border-b border-gray-200 dark:border-white/5">
                    <div className="relative">
                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                        <input autoFocus placeholder="Search markets..." className="w-full bg-gray-100 dark:bg-white/5 rounded-xl py-3 pl-10 pr-4 outline-none text-gray-900 dark:text-white" value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                </div>
                <div className="overflow-y-auto flex-1 p-2">
                    {filtered.map(p => (
                        <button key={p.id} onClick={() => {onSelect(p); onClose();}} className="w-full flex items-center justify-between p-3 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl transition-colors group">
                            <div className="flex items-center gap-3">
                                {p.logo ? (
                                    <img src={p.logo} alt={p.name} className="w-8 h-8 rounded-full group-hover:scale-110 transition-transform" />
                                ) : (
                                    <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 font-bold text-[10px] group-hover:bg-blue-500 group-hover:text-white transition-colors">{p.id.split('/')[0][0]}</div>
                                )}
                                <div className="text-left"><p className="font-bold text-gray-900 dark:text-white">{p.id}</p><p className="text-xs text-gray-500">{p.name}</p></div>
                            </div>
                            <div className="text-right"><span className="block text-sm font-medium text-gray-900 dark:text-white">${formatPrice(marketPrices[p.id] || p.basePrice)}</span><span className="text-[10px] text-gray-500">{p.name}</span></div>
                        </button>
                    ))}
                </div>
            </GlassCard>
        </div>
    )
}

const DepositWithdrawModal = ({ isOpen, onClose, type, onConfirm, balance }: any) => {
    const [amount, setAmount] = useState('');
    useEffect(() => { setAmount(''); }, [isOpen]);
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in" onClick={onClose}>
            <GlassCard className="w-full max-w-sm relative overflow-hidden" onClick={(e: any) => e.stopPropagation()}>
                <h3 className="text-xl font-bold mb-1 text-gray-900 dark:text-white">{type === 'DEPOSIT' ? 'Deposit Assets' : 'Withdraw Funds'}</h3>
                <p className="text-sm text-gray-500 mb-6">Available Balance: ${formatMoney(balance)}</p>
                <div className="mb-6 relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg">$</span><input type="number" autoFocus className="w-full bg-transparent border-b-2 border-gray-200 dark:border-white/10 py-2 pl-8 pr-4 text-3xl font-bold text-gray-900 dark:text-white outline-none focus:border-blue-500 transition-colors placeholder-gray-700" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
                <div className="grid grid-cols-4 gap-2 mb-6">{[100, 500, 1000, 5000].map(val => (<button key={val} onClick={() => setAmount(val.toString())} className="py-2 rounded-lg bg-gray-100 dark:bg-white/5 text-xs font-medium hover:bg-gray-200 dark:hover:bg-white/10 transition-colors text-gray-900 dark:text-white">+${val}</button>))}</div>
                <div className="flex gap-3"><Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button><Button onClick={() => {onConfirm(parseFloat(amount)); onClose();}} disabled={!amount || parseFloat(amount) <= 0 || (type === 'WITHDRAW' && parseFloat(amount) > balance)} variant={type === 'DEPOSIT' ? 'success' : 'primary'} className="flex-1">{type === 'DEPOSIT' ? 'Deposit' : 'Withdraw'}</Button></div>
            </GlassCard>
        </div>
    );
};

// Expanded Strategy Modal
const StrategyDetailsModal = ({ isOpen, type, data, onClose, positions, openOrders, marketPrices, onBotAction, onCopyAction, onViewProfile }: any) => {
    if(!isOpen || !data) return null;
    
    // Filter positions based on type
    const activePositions = positions.filter((p: Position) => type === 'BOT' ? p.botId === data.id : p.copyTraderId === data.id);
    const linkedOrders = openOrders ? openOrders.filter((o: OpenOrder) => type === 'BOT' ? o.botId === data.id : o.copyTraderId === data.id) : [];
    
    const unrealizedPnl = activePositions.reduce((acc: number, p: Position) => {
        const cp = marketPrices[p.pair] || p.entryPrice;
        const pnl = p.side === 'LONG' 
            ? (cp - p.entryPrice) / p.entryPrice * p.size 
            : (p.entryPrice - cp) / p.entryPrice * p.size;
        return acc + pnl;
    }, 0);

    const totalPnl = (data.realizedPnL || 0) + unrealizedPnl; 

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in" onClick={onClose}>
            <GlassCard className="w-full max-w-2xl flex flex-col max-h-[85vh] text-gray-900 dark:text-white" onClick={(e: any) => e.stopPropagation()}>
                <div className="flex justify-between items-start mb-6 border-b border-gray-200 dark:border-white/5 pb-4">
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white ${type === 'BOT' ? 'bg-purple-500' : 'bg-blue-500'}`}>
                            {type === 'BOT' ? <Bot size={24}/> : <UserCircle size={24}/>}
                        </div>
                        <div>
                            <h3 className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2">
                                {type === 'BOT' ? data.name : data.username}
                                {type === 'BOT' && data.status === 'PAUSED' && <span className="text-xs bg-yellow-500/10 text-yellow-500 px-2 py-0.5 rounded">PAUSED</span>}
                            </h3>
                            <p className="text-sm text-gray-500 flex items-center gap-2">
                                {type === 'BOT' ? `${data.risk} Mode` : data.handle}
                                {type === 'TRADER' && <ExternalLink size={12} className="cursor-pointer hover:text-blue-500" onClick={() => { onViewProfile(data); onClose(); }}/>}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-900 dark:hover:text-white"><X size={24}/></button>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="bg-gray-50 dark:bg-white/5 p-4 rounded-xl border border-gray-100 dark:border-white/5">
                        <p className="text-xs uppercase text-gray-500 font-bold mb-1">Total PnL (Est)</p>
                        <p className={`text-xl font-black ${totalPnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {totalPnl >= 0 ? '+' : ''}${formatMoney(totalPnl)}
                        </p>
                    </div>
                    <div className="bg-gray-50 dark:bg-white/5 p-4 rounded-xl border border-gray-100 dark:border-white/5">
                        <p className="text-xs uppercase text-gray-500 font-bold mb-1">Open Trades</p>
                        <p className="text-xl font-black text-gray-900 dark:text-white">{activePositions.length}</p>
                    </div>
                    <div className="bg-gray-50 dark:bg-white/5 p-4 rounded-xl border border-gray-100 dark:border-white/5">
                        <p className="text-xs uppercase text-gray-500 font-bold mb-1">Open Orders</p>
                        <p className="text-xl font-black text-gray-900 dark:text-white">{linkedOrders.length}</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pr-2">
                    <div>
                        <h4 className="font-bold text-gray-900 dark:text-white mb-2 text-sm uppercase">Active Positions</h4>
                        <div className="space-y-2">
                            {activePositions.length === 0 ? <p className="text-sm text-gray-500 italic text-center py-4 bg-gray-50 dark:bg-white/5 rounded-xl">No active positions.</p> : 
                                activePositions.map((p: Position) => {
                                    const cp = marketPrices[p.pair] || p.entryPrice;
                                    const pnl = p.side === 'LONG' ? (cp - p.entryPrice) / p.entryPrice * p.size : (p.entryPrice - cp) / p.entryPrice * p.size;
                                    return (
                                        <div key={p.id} className="bg-gray-50 dark:bg-white/5 p-3 rounded-xl flex justify-between items-center border border-gray-200 dark:border-white/5">
                                            <div>
                                                <p className="font-bold text-sm text-gray-900 dark:text-white">{p.pair} <span className={p.side === 'LONG' ? 'text-emerald-500' : 'text-red-500'}>{p.side}</span> <span className="text-gray-500 text-xs ml-1">{p.leverage}x</span></p>
                                                <p className="text-xs text-gray-500">Entry: ${formatPrice(p.entryPrice)} • Mark: ${formatPrice(cp)}</p>
                                            </div>
                                            <div className="text-right">
                                                <div className={`font-bold text-sm ${pnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                                    {pnl >= 0 ? '+' : ''}${formatMoney(pnl)}
                                                </div>
                                                <div className="text-xs text-gray-500">Size: ${formatMoney(p.size)}</div>
                                            </div>
                                        </div>
                                    )
                                })
                            }
                        </div>
                    </div>

                    <div>
                        <h4 className="font-bold text-gray-900 dark:text-white mb-2 text-sm uppercase">Managed Orders</h4>
                        <div className="space-y-2">
                            {linkedOrders.length === 0 ? <p className="text-sm text-gray-500 italic text-center py-4 bg-gray-50 dark:bg-white/5 rounded-xl">No active orders.</p> :
                                linkedOrders.map((o: OpenOrder) => (
                                    <div key={o.id} className="bg-gray-50 dark:bg-white/5 p-3 rounded-xl flex justify-between items-center border border-gray-200 dark:border-white/5">
                                        <p className="text-sm font-medium text-gray-900 dark:text-white">{o.type} <span className={o.side === 'LONG' ? 'text-emerald-500' : 'text-red-500'}>{o.side}</span> {o.pair} @ ${formatPrice(o.price)}</p>
                                        <p className="text-xs text-gray-500">${formatMoney(o.size)}</p>
                                    </div>
                                ))
                            }
                        </div>
                    </div>
                </div>

                <div className="pt-6 mt-4 border-t border-gray-200 dark:border-white/5 flex gap-3">
                    {type === 'BOT' ? (
                        <>
                            <Button 
                                variant={data.status === 'PAUSED' ? 'success' : 'secondary'}
                                className="flex-1" 
                                onClick={() => onBotAction(data.id, data.status === 'PAUSED' ? 'RESUME' : 'PAUSE')}
                            >
                                {data.status === 'PAUSED' ? 'Resume Agent' : 'Pause Agent'}
                            </Button>
                            <Button 
                                variant="danger" 
                                className="flex-1" 
                                onClick={() => { onBotAction(data.id, 'STOP'); onClose(); }}
                            >
                                Stop Agent
                            </Button>
                        </>
                    ) : (
                        <Button 
                            variant="danger" 
                            className="flex-1" 
                            onClick={() => { onCopyAction(data.id); onClose(); }}
                        >
                            Stop Copying
                        </Button>
                    )}
                </div>
            </GlassCard>
        </div>
    )
}

const BotDetailsModal = ({ isOpen, bot, onClose, positions, marketPrices, onBotAction }: any) => {
    if(!isOpen || !bot) return null;
    
    // Filter positions for this bot
    const botPositions = positions.filter((p: Position) => p.botId === bot.id);
    const unrealizedPnl = botPositions.reduce((acc: number, p: Position) => {
        const cp = marketPrices[p.pair] || p.entryPrice;
        const pnl = p.side === 'LONG' ? (cp - p.entryPrice) / p.entryPrice * p.size : (p.entryPrice - cp) / p.entryPrice * p.size;
        return acc + pnl;
    }, 0);

    const totalPnl = bot.realizedPnL + unrealizedPnl;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in" onClick={onClose}>
            <GlassCard className="w-full max-w-lg flex flex-col max-h-[80vh] text-gray-900 dark:text-white" onClick={(e: any) => e.stopPropagation()}>
                <div className="flex justify-between items-start mb-6 border-b border-gray-200 dark:border-white/5 pb-4">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-purple-500 flex items-center justify-center text-white">
                            <Bot size={24}/>
                        </div>
                        <div>
                            <h3 className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2">
                                {bot.name}
                                {bot.status === 'PAUSED' && <span className="text-xs bg-yellow-500/10 text-yellow-500 px-2 py-0.5 rounded">PAUSED</span>}
                            </h3>
                            <p className="text-sm text-gray-500">{bot.risk} Mode • {bot.pairs.length} Pairs</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-900 dark:hover:text-white"><X size={24}/></button>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-gray-50 dark:bg-white/5 p-4 rounded-xl border border-gray-100 dark:border-white/5">
                        <p className="text-xs uppercase text-gray-500 font-bold mb-1">Total PnL</p>
                        <p className={`text-2xl font-black ${totalPnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {totalPnl >= 0 ? '+' : ''}${formatMoney(totalPnl)}
                        </p>
                    </div>
                    <div className="bg-gray-50 dark:bg-white/5 p-4 rounded-xl border border-gray-100 dark:border-white/5">
                        <p className="text-xs uppercase text-gray-500 font-bold mb-1">Active Positions</p>
                        <p className="text-2xl font-black text-gray-900 dark:text-white">{botPositions.length}</p>
                    </div>
                </div>

                <div className="flex gap-2 mb-4">
                    <Button 
                        variant={bot.status === 'PAUSED' ? 'success' : 'secondary'}
                        className="flex-1 text-xs" 
                        onClick={() => onBotAction(bot.id, bot.status === 'PAUSED' ? 'RESUME' : 'PAUSE')}
                    >
                        {bot.status === 'PAUSED' ? 'Resume Agent' : 'Pause Agent'}
                    </Button>
                    <Button 
                        variant="danger" 
                        className="flex-1 text-xs" 
                        onClick={() => { onBotAction(bot.id, 'STOP'); onClose(); }}
                    >
                        Stop Agent
                    </Button>
                </div>

                <h4 className="font-bold text-gray-900 dark:text-white mb-3">Live Trades</h4>
                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
                    {botPositions.length === 0 ? <p className="text-center text-gray-500 py-4">No active trades.</p> : 
                        botPositions.map((p: Position) => {
                            const cp = marketPrices[p.pair] || p.entryPrice;
                            const pnl = p.side === 'LONG' ? (cp - p.entryPrice) / p.entryPrice * p.size : (p.entryPrice - cp) / p.entryPrice * p.size;
                            return (
                                <div key={p.id} className="bg-gray-50 dark:bg-white/5 p-3 rounded-xl flex justify-between items-center border border-gray-100 dark:border-white/5">
                                    <div>
                                        <p className="font-bold text-sm text-gray-900 dark:text-white">{p.pair} <span className={p.side === 'LONG' ? 'text-emerald-500' : 'text-red-500'}>{p.side}</span></p>
                                        <p className="text-xs text-gray-500">Entry: ${formatMoney(p.entryPrice)}</p>
                                    </div>
                                    <div className={`font-bold text-sm ${pnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                        {pnl >= 0 ? '+' : ''}${formatMoney(pnl)}
                                    </div>
                                </div>
                            )
                        })
                    }
                </div>
            </GlassCard>
        </div>
    )
}

const LoginModal = ({ isOpen, onClose, onLogin }: any) => {
    const [username, setUsername] = useState('');
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in" onClick={onClose}>
            <GlassCard className="w-full max-w-sm" onClick={(e: any) => e.stopPropagation()}>
                <h3 className="text-2xl font-black text-gray-900 dark:text-white mb-2">Welcome to VELO</h3>
                <p className="text-sm text-gray-500 mb-6">Enter a username to start trading.</p>
                <input 
                    autoFocus
                    className="w-full bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 mb-4 outline-none text-gray-900 dark:text-white font-bold"
                    placeholder="Username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && onLogin(username)}
                />
                <Button onClick={() => onLogin(username)} disabled={!username.trim()} className="w-full">Start Trading</Button>
            </GlassCard>
        </div>
    );
};

const EditPositionModal = ({ isOpen, position, onClose, onSave }: any) => {
    const [tp, setTp] = useState('');
    const [sl, setSl] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [projections, setProjections] = useState<{ tpPnl: number, slPnl: number } | null>(null);
    
    useEffect(() => {
        if(position) {
            setTp(position.takeProfit || '');
            setSl(position.stopLoss || '');
            setError(null);
            setProjections(null);
        }
    }, [position]);

    // Validation & Projection Effect
    useEffect(() => {
        if (!position) return;
        
        let err = null;
        let proj = null;
        const tpVal = parseFloat(tp);
        const slVal = parseFloat(sl);

        if (position.side === 'LONG') {
            if (tp && tpVal <= position.entryPrice) err = "Take Profit must be above Entry Price for Longs";
            if (sl && slVal >= position.entryPrice) err = "Stop Loss must be below Entry Price for Longs";
        } else {
            if (tp && tpVal >= position.entryPrice) err = "Take Profit must be below Entry Price for Shorts";
            if (sl && slVal <= position.entryPrice) err = "Stop Loss must be above Entry Price for Shorts";
        }

        if (!err) {
            const tpPnl = tp ? (Math.abs(tpVal - position.entryPrice) / position.entryPrice) * position.size : 0;
            const slPnl = sl ? (Math.abs(slVal - position.entryPrice) / position.entryPrice) * position.size * -1 : 0;
            proj = { tpPnl, slPnl };
        }

        setError(err);
        setProjections(proj);

    }, [tp, sl, position]);

    if (!isOpen || !position) return null;

    const handleSave = () => {
        if (error) {
            playSound('ERROR');
            return;
        }
        onSave(position.id, tp, sl);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in" onClick={onClose}>
            <GlassCard className="w-full max-w-sm" onClick={(e: any) => e.stopPropagation()}>
                <h3 className="font-bold text-gray-900 dark:text-white mb-2">Edit Position: {position.pair}</h3>
                <p className="text-xs text-gray-500 mb-6 font-mono">Entry: ${formatPrice(position.entryPrice)} • Size: ${formatMoney(position.size)}</p>
                
                <div className="space-y-4 mb-4">
                    <Input 
                        label="Take Profit" 
                        placeholder="Price" 
                        value={tp} 
                        onChange={(e: any) => setTp(e.target.value)} 
                        type="number"
                        error={position.side === 'LONG' && parseFloat(tp) <= position.entryPrice ? "Must be > Entry" : position.side === 'SHORT' && parseFloat(tp) >= position.entryPrice ? "Must be < Entry" : null}
                    />
                    {projections?.tpPnl ? (
                        <p className="text-right text-[10px] font-bold text-emerald-500">
                            Est. Profit: +${formatMoney(projections.tpPnl)}
                        </p>
                    ) : null}

                    <Input 
                        label="Stop Loss" 
                        placeholder="Price" 
                        value={sl} 
                        onChange={(e: any) => setSl(e.target.value)} 
                        type="number"
                        error={position.side === 'LONG' && parseFloat(sl) >= position.entryPrice ? "Must be < Entry" : position.side === 'SHORT' && parseFloat(sl) <= position.entryPrice ? "Must be > Entry" : null}
                    />
                    {projections?.slPnl ? (
                        <p className="text-right text-[10px] font-bold text-red-500">
                            Est. Loss: -${formatMoney(Math.abs(projections.slPnl))}
                        </p>
                    ) : null}
                </div>

                {error && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg mb-4">
                        <p className="text-red-500 text-xs font-bold flex items-center gap-2">
                            <AlertCircle size={14}/> {error}
                        </p>
                    </div>
                )}

                <div className="flex gap-3">
                    <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
                    <Button onClick={handleSave} className="flex-1" disabled={!!error}>Save Orders</Button>
                </div>
            </GlassCard>
        </div>
    );
};

const EditProfileModal = ({ isOpen, onClose, user, onSave }: any) => { const [formData, setFormData] = useState({ bio: '', avatar: '', banner: '' }); useEffect(() => { if(user) setFormData({ bio: user.bio || '', avatar: user.avatar || '', banner: user.banner || '' }); }, [user]); if(!isOpen) return null; return ( <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in" onClick={onClose}> <GlassCard className="w-full max-w-md" onClick={(e: any) => e.stopPropagation()}> <h3 className="font-bold text-gray-900 dark:text-white mb-4">Edit Profile</h3> <div className="space-y-4 mb-6"> <Input label="Bio" value={formData.bio} onChange={(e: any) => setFormData({...formData, bio: e.target.value})} /> <Input label="Avatar URL" value={formData.avatar} onChange={(e: any) => setFormData({...formData, avatar: e.target.value})} /> <Input label="Banner URL" value={formData.banner} onChange={(e: any) => setFormData({...formData, banner: e.target.value})} /> </div> <div className="flex gap-3"> <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button> <Button onClick={() => { onSave(formData); onClose(); }} className="flex-1">Save Changes</Button> </div> </GlassCard> </div> ); };
const UsersListModal = ({ isOpen, onClose, title, userIds, traders, onViewProfile }: any) => { if(!isOpen) return null; const users = traders.filter((t: any) => userIds.includes(t.id)); return ( <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in" onClick={onClose}> <GlassCard className="w-full max-w-md max-h-[60vh] flex flex-col" onClick={(e: any) => e.stopPropagation()}> <div className="flex justify-between items-center mb-4 border-b border-gray-200 dark:border-white/5 pb-2"> <h3 className="font-bold text-gray-900 dark:text-white">{title}</h3> <button onClick={onClose}><X size={20}/></button> </div> <div className="flex-1 overflow-y-auto space-y-2"> {users.length === 0 ? <p className="text-gray-500 text-center py-4">No users found.</p> : users.map((u: any) => ( <div key={u.id} className="flex items-center justify-between p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg cursor-pointer" onClick={() => { onViewProfile(u); onClose(); }}> <div className="flex items-center gap-3"> <img src={u.avatar} className="w-8 h-8 rounded-full"/> <span className="font-bold text-gray-900 dark:text-white text-sm">{u.username}</span> </div> <ArrowRightLeft size={14} className="text-gray-400"/> </div> )) } </div> </GlassCard> </div> ) }
const DeployBotModal = ({ isOpen, bot, onClose, onDeploy }: any) => { const [risk, setRisk] = useState('AGGRESSIVE'); const [selectedPairs, setSelectedPairs] = useState<string[]>(['SOL/USD']); if(!isOpen || !bot) return null; const togglePair = (pairId: string) => { if (selectedPairs.includes(pairId)) setSelectedPairs(selectedPairs.filter(p => p !== pairId)); else setSelectedPairs([...selectedPairs, pairId]); }; const handleDeploy = () => { onDeploy(bot, selectedPairs, risk); onClose(); }; return ( <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in" onClick={onClose}> <GlassCard className="w-full max-w-md max-h-[80vh] flex flex-col" onClick={(e: any) => e.stopPropagation()}> <h3 className="font-bold text-gray-900 dark:text-white mb-2">Deploy {bot.name}</h3> <p className="text-xs text-gray-500 mb-6">{bot.description}</p> <div className="space-y-4 mb-6 flex-1 overflow-y-auto"> <div><label className="text-xs font-bold text-gray-500 uppercase">Risk Level</label><div className="flex gap-2 mt-2">{['CONSERVATIVE', 'AGGRESSIVE', 'DEGEN'].map(r => (<button key={r} onClick={() => setRisk(r)} className={`flex-1 py-2 text-xs font-bold rounded-lg border ${risk === r ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-200 dark:border-white/10 text-gray-500'}`}>{r}</button>))}</div></div> <div><label className="text-xs font-bold text-gray-500 uppercase">Allowed Pairs</label><div className="grid grid-cols-2 gap-2 mt-2">{PAIRS.map(p => (<button key={p.id} onClick={() => togglePair(p.id)} className={`py-2 px-3 text-xs font-bold rounded-lg border text-left ${selectedPairs.includes(p.id) ? 'bg-blue-500/10 border-blue-500 text-blue-500' : 'border-gray-200 dark:border-white/10 text-gray-500'}`}>{p.id}</button>))}</div></div> </div> <div className="flex gap-3 pt-4 border-t border-gray-100 dark:border-white/5"> <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button> <Button onClick={handleDeploy} className="flex-1">Deploy Agent</Button> </div> </GlassCard> </div> ) }
const Navbar = ({ activeTab, setActiveTab, toggleTheme, theme, handleLogout, user, onRequireAuth, unreadCount, setMobileMenuOpen, notifications, onNotificationClick, isNotifOpen, setNotifOpen, totalEquity }: any) => { const navItems = [ { id: TabView.DASHBOARD, icon: LayoutDashboard, label: 'Dashboard', requiresAuth: true }, { id: TabView.TRADE, icon: TrendingUp, label: 'Trade', requiresAuth: false }, { id: TabView.STRATEGY, icon: Bot, label: 'AI Strategy', requiresAuth: false }, { id: TabView.SOCIAL, icon: Users, label: 'Social', requiresAuth: false }, { id: TabView.LEADERBOARD, icon: Trophy, label: 'Leaderboard', requiresAuth: false }, ].filter(item => !item.requiresAuth || user); return ( <nav className="border-b border-gray-200 dark:border-white/5 bg-white/80 dark:bg-black/80 backdrop-blur-md sticky top-0 z-50 px-4 md:px-6 h-14 flex items-center justify-between"> <div className="flex items-center gap-2"> <button className="lg:hidden p-2 -ml-2 text-gray-500" onClick={() => setMobileMenuOpen(true)}><Menu size={24}/></button> <div className="flex items-center gap-2 font-black text-xl text-gray-900 dark:text-white tracking-tighter cursor-pointer" onClick={() => user && setActiveTab(TabView.DASHBOARD)}> <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white"><Zap size={20} fill="currentColor"/></div> VELO </div> </div> <div className="hidden lg:flex items-center gap-1 bg-gray-100 dark:bg-white/5 p-1 rounded-xl"> {navItems.map(item => ( <button key={item.id} onClick={() => setActiveTab(item.id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === item.id ? 'bg-white dark:bg-[#1A1A1A] shadow-sm text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}> <item.icon size={16}/> {item.label} </button> ))} </div> <div className="flex items-center gap-3"> <div className="relative"> <button onClick={() => setNotifOpen(!isNotifOpen)} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5 rounded-full relative transition-colors"> <Bell size={20}/> {unreadCount > 0 && <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-black"></span>} </button> {isNotifOpen && ( <> <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)}></div> <div className="fixed left-4 right-4 top-16 lg:absolute lg:left-auto lg:right-0 lg:top-full lg:mt-2 lg:w-80 bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-white/10 rounded-xl shadow-2xl z-50 flex flex-col max-h-[400px]"> <div className="p-4 border-b border-gray-200 dark:border-white/5 font-bold">Notifications</div> <div className="flex-1 overflow-y-auto"> {notifications.length === 0 ? <p className="p-4 text-center text-sm text-gray-500">No notifications</p> : notifications.slice().reverse().map((n: any) => ( <div key={n.id} onClick={() => { onNotificationClick(n); setNotifOpen(false); }} className={`p-4 border-b border-gray-100 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer ${!n.read ? 'bg-blue-50/50 dark:bg-blue-500/5' : ''}`}> <p className="text-xs text-gray-500 mb-1">{new Date(n.timestamp).toLocaleTimeString()}</p> <p className="text-sm text-gray-900 dark:text-white">{n.message}</p> </div> )) } </div> </div> </> )} </div> <button onClick={toggleTheme} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5 rounded-full transition-colors"> {theme === 'dark' ? <Sun size={20}/> : <Moon size={20}/>} </button> {user ? ( <div className="flex items-center gap-3 pl-3 border-l border-gray-200 dark:border-white/10"> <div className="text-right hidden sm:block"> <p className="text-xs font-bold text-gray-900 dark:text-white">{user.username}</p> <p className="text-xs text-emerald-500 font-mono cursor-pointer hover:text-emerald-400" onClick={() => setActiveTab(TabView.DASHBOARD)}>${formatMoney(totalEquity || user.balance)}</p> </div> <button onClick={() => setActiveTab(TabView.PROFILE)} className="w-9 h-9 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden border border-gray-200 dark:border-white/10"> <img src={user.avatar} className="w-full h-full object-cover"/> </button> <button onClick={handleLogout} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-full"><LogOut size={18}/></button> </div> ) : ( <Button onClick={onRequireAuth} className="px-6 h-9 text-xs">Connect</Button> )} </div> </nav> ) }
const MobileSidebar = ({ isOpen, activeTab, setActiveTab, toggleTheme, theme, setSidebarOpen, handleLogout, user, onRequireAuth, unreadCount }: any) => { const navItems = [ { id: TabView.DASHBOARD, icon: LayoutDashboard, label: 'Dashboard', requiresAuth: true }, { id: TabView.TRADE, icon: TrendingUp, label: 'Trade', requiresAuth: false }, { id: TabView.STRATEGY, icon: Bot, label: 'AI Strategy', requiresAuth: false }, { id: TabView.SOCIAL, icon: Users, label: 'Social', requiresAuth: false }, { id: TabView.LEADERBOARD, icon: Trophy, label: 'Leaderboard', requiresAuth: false }, { id: TabView.PROFILE, icon: UserCircle, label: 'Profile', requiresAuth: false }, ].filter(item => !item.requiresAuth || user); return ( <> <div className={`fixed inset-0 bg-black/50 z-[60] transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setSidebarOpen(false)}></div> <div className={`fixed inset-y-0 left-0 w-64 bg-white dark:bg-[#121212] z-[70] transform transition-transform duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full'} shadow-2xl flex flex-col`}> <div className="p-6 border-b border-gray-200 dark:border-white/5 flex justify-between items-center"> <div className="font-black text-xl text-gray-900 dark:text-white tracking-tighter">VELO</div> <button onClick={() => setSidebarOpen(false)}><X size={20} className="text-gray-500"/></button> </div> <div className="flex-1 p-4 space-y-2"> {navItems.map(item => ( <button key={item.id} onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === item.id ? 'bg-blue-500 text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5'}`} > <item.icon size={18}/> {item.label} </button> ))} </div> {user && ( <div className="p-4 border-t border-gray-200 dark:border-white/5"> <div className="flex items-center gap-3 mb-4"> <img src={user.avatar} className="w-10 h-10 rounded-full"/> <div> <p className="font-bold text-gray-900 dark:text-white">{user.username}</p> <p className="text-xs text-emerald-500">${formatMoney(user.balance)}</p> </div> </div> <Button onClick={handleLogout} variant="danger" className="w-full">Logout</Button> </div> )} </div> </> ) }
const MobileBottomNav = ({ activeTab, setActiveTab, setSidebarOpen }: any) => { return ( <div className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-white/90 dark:bg-black/90 backdrop-blur-lg border-t border-gray-200 dark:border-white/5 z-[60] flex items-center justify-around px-2 pb-safe"> {[ { id: TabView.DASHBOARD, icon: LayoutDashboard, label: 'Home' }, { id: TabView.TRADE, icon: TrendingUp, label: 'Trade' }, { id: TabView.SOCIAL, icon: MessageSquare, label: 'Social' }, { id: 'MENU', icon: Menu, label: 'Menu', action: () => setSidebarOpen(true) }, ].map(item => ( <button key={item.id} onClick={item.action ? item.action : () => setActiveTab(item.id)} className={`flex flex-col items-center justify-center w-full h-full gap-1 ${activeTab === item.id ? 'text-blue-500' : 'text-gray-500 dark:text-gray-400'}`} > <item.icon size={20} strokeWidth={activeTab === item.id ? 2.5 : 2} /> <span className="text-[10px] font-bold">{item.label}</span> </button> ))} </div> ) }
const LeaderboardView = ({ traders, user, handleFollow, handleCopyTrade, handleViewProfile }: any) => { const sortedTraders = [...traders].sort((a, b) => b.pnl - a.pnl); return ( <div className="w-full max-w-7xl mx-auto pb-20 animate-fade-in"> <div className="text-center mb-10"> <h1 className="text-3xl font-black text-gray-900 dark:text-white mb-2">Top Traders</h1> <p className="text-gray-500">Copy the most profitable strategies on VELO.</p> </div> <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8"> {sortedTraders.slice(0, 3).map((trader: any, i: number) => ( <GlassCard key={trader.id} className="relative overflow-hidden flex flex-col items-center text-center pt-8 border-t-4 border-t-blue-500"> <div className="absolute top-4 left-4 text-6xl font-black text-gray-200 dark:text-white/5 pointer-events-none">0{i+1}</div> <img src={trader.avatar} className="w-24 h-24 rounded-full border-4 border-white dark:border-[#121212] shadow-xl mb-4"/> <h3 className="text-xl font-bold text-gray-900 dark:text-white">{trader.username}</h3> <p className="text-gray-500 text-sm mb-4">{trader.handle}</p> <div className="flex gap-8 mb-6"> <div> <p className="text-[10px] uppercase text-gray-400 font-bold">PnL</p> <p className="text-xl font-black text-emerald-500">${formatMoney(trader.pnl)}</p> </div> <div> <p className="text-[10px] uppercase text-gray-400 font-bold">Win Rate</p> <p className="text-xl font-black text-blue-500">{trader.winRate}%</p> </div> </div> <Button onClick={() => handleViewProfile(trader)} className="w-full mt-auto">View Profile</Button> </GlassCard> ))} </div> <GlassCard className="overflow-hidden p-0"> <div className="overflow-x-auto"> <table className="w-full text-left whitespace-nowrap"> <thead className="bg-gray-50 dark:bg-white/5 text-[10px] font-bold text-gray-500 uppercase"> <tr> <th className="px-6 py-4">Rank</th> <th className="px-6 py-4">Trader</th> <th className="px-6 py-4">PnL (All Time)</th> <th className="px-6 py-4">Win Rate</th> <th className="px-6 py-4">Followers</th> <th className="px-6 py-4 text-right">Action</th> </tr> </thead> <tbody className="divide-y divide-gray-200 dark:divide-white/5"> {sortedTraders.map((trader: any, i: number) => ( <tr key={trader.id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"> <td className="px-6 py-4 font-bold text-gray-400">#{i + 1}</td> <td className="px-6 py-4 flex items-center gap-3"> <img src={trader.avatar} className="w-8 h-8 rounded-full"/> <div> <p className="font-bold text-gray-900 dark:text-white text-sm">{trader.username}</p> <p className="text-xs text-gray-500">{trader.handle}</p> </div> </td> <td className="px-6 py-4 font-bold text-emerald-500">${formatMoney(trader.pnl)}</td> <td className="px-6 py-4 text-gray-900 dark:text-white font-mono">{trader.winRate}%</td> <td className="px-6 py-4 text-gray-500">{trader.followers.length}</td> <td className="px-6 py-4 text-right"> <Button onClick={() => handleViewProfile(trader)} variant="secondary" className="px-4 h-8 text-xs">View</Button> </td> </tr> ))} </tbody> </table> </div> </GlassCard> </div> ) }
const PostCard = ({ post, user, onLike, onRepost, onComment, handleCopyTrade, onViewProfile, showUsersModal, onDelete }: any) => { const hasLiked = post.likedBy.includes(user?.id); const hasReposted = post.repostedBy.includes(user?.id); const isOwner = user?.id === post.authorId; return ( <GlassCard className="p-0 overflow-hidden hover:border-gray-300 dark:hover:border-white/20 transition-colors"> {post.repostedBy.length > 0 && ( <div className="px-4 py-2 text-xs font-bold text-gray-500 flex items-center gap-2 bg-gray-50 dark:bg-white/5"> <Repeat size={12}/> {post.repostedBy.length} reposts </div> )} <div className="p-4 flex gap-4"> <div className="shrink-0 cursor-pointer" onClick={() => onViewProfile({ id: post.authorId })}> <img src={post.authorAvatar} className="w-10 h-10 rounded-full"/> </div> <div className="flex-1 min-w-0"> <div className="flex justify-between items-start"> <div className="flex items-center gap-2"> <span className="font-bold text-gray-900 dark:text-white cursor-pointer hover:underline" onClick={() => onViewProfile({ id: post.authorId })}>{post.authorHandle}</span>{isVerifiedUser(post.authorId) && <span className="inline-flex items-center justify-center w-4 h-4 bg-blue-500 rounded-full ml-0.5"><Check size={9} className="text-white" strokeWidth={3}/></span>} <span className="text-xs text-gray-500">• {new Date(post.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span> </div> {isOwner && onDelete && ( <button onClick={() => onDelete(post.id)} className="text-gray-400 hover:text-red-500 transition-colors"> <Trash2 size={16}/> </button> )} </div> <p className="text-gray-800 dark:text-gray-200 mt-2 whitespace-pre-wrap">{post.content}</p> {post.image && ( <div className="mt-3 rounded-xl overflow-hidden border border-gray-200 dark:border-white/10"> <img src={post.image} className="w-full h-auto object-cover max-h-[300px]"/> </div> )} {post.isTradeSignal && post.tradeDetails && ( <div className="mt-3 bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 flex justify-between items-center"> <div> <p className="text-xs font-bold text-blue-500 uppercase">Trade Signal</p> <p className="font-black text-gray-900 dark:text-white"> {post.tradeDetails.side} {post.tradeDetails.pair} <span className="opacity-50">@</span> ${post.tradeDetails.entry} </p> </div> <Button onClick={() => handleCopyTrade(post)} className="px-4 py-1.5 h-auto text-xs"> Copy Trade </Button> </div> )} <div className="flex items-center justify-between mt-4 text-gray-500"> <button onClick={() => onComment(post.id, "Nice!")} className="flex items-center gap-2 hover:text-blue-500 transition-colors group"> <div className="p-2 group-hover:bg-blue-500/10 rounded-full"><MessageCircle size={18}/></div> <span className="text-xs">{post.comments.length}</span> </button> <button onClick={() => onRepost(post.id)} className={`flex items-center gap-2 hover:text-green-500 transition-colors group ${hasReposted ? 'text-green-500' : ''}`}> <div className="p-2 group-hover:bg-green-500/10 rounded-full"><Repeat size={18}/></div> <span className="text-xs">{post.reposts}</span> </button> <button onClick={() => onLike(post.id)} className={`flex items-center gap-2 hover:text-red-500 transition-colors group ${hasLiked ? 'text-red-500' : ''}`}> <div className="p-2 group-hover:bg-red-500/10 rounded-full"><Heart size={18} fill={hasLiked ? "currentColor" : "none"}/></div> <span className="text-xs" onClick={(e) => { e.stopPropagation(); showUsersModal("Liked by", post.likedBy, onViewProfile); }}>{post.likes}</span> </button> <button className="flex items-center gap-2 hover:text-blue-500 transition-colors group"> <div className="p-2 group-hover:bg-blue-500/10 rounded-full"><Share2 size={18}/></div> </button> </div> </div> </div> </GlassCard> ); };
const SocialFeed = ({ traders, posts, user, handleFollow, handleCopyTrade, onViewProfile, onPostCreate, onRequireAuth, onLike, onRepost, onComment, showUsersModal, onDeletePost }: any) => { const [newPostContent, setNewPostContent] = useState(''); const [filter, setFilter] = useState<SocialSort>('LATEST'); const filteredPosts = [...posts].sort((a, b) => { if (filter === 'TRENDING') return b.likes - a.likes; return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(); }); const handleViewProfileWrapper = (partial: { id: string }) => { const trader = traders.find((t: any) => t.id === partial.id); if (trader) { onViewProfile(trader); } else if (user && user.id === partial.id) { onViewProfile(user); } }; return ( <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 animate-fade-in w-full max-w-7xl mx-auto"> <div className="hidden lg:block lg:col-span-1 space-y-6"> <GlassCard> <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><Flame size={18} className="text-orange-500"/> Trending Topics</h3> <div className="space-y-3"> {['$SOL', '$WIF', '#Bitcoin', 'Memecoins', 'Gemini'].map((t, i) => ( <div key={t} className="flex justify-between items-center text-sm"> <span className="text-gray-500 hover:text-blue-500 cursor-pointer">{t}</span> <span className="text-xs text-gray-400">{10 - i}k posts</span> </div> ))} </div> </GlassCard> </div> <div className="col-span-1 lg:col-span-2 space-y-4"> <GlassCard className="p-4"> <div className="flex gap-4"> <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-white/10 shrink-0 overflow-hidden"> {user ? <img src={user.avatar} className="w-full h-full object-cover"/> : <UserCircle size={40} className="text-gray-400"/>} </div> <div className="flex-1"> <textarea placeholder="What's happening in the markets?" className="w-full bg-transparent border-none outline-none text-gray-900 dark:text-white placeholder-gray-500 resize-none h-20 text-lg font-medium" value={newPostContent} onChange={(e) => setNewPostContent(e.target.value)} /> <div className="flex justify-between items-center mt-2 border-t border-gray-100 dark:border-white/5 pt-2"> <div className="flex gap-2 text-blue-500"> <button className="p-2 hover:bg-blue-500/10 rounded-full"><ImageIcon size={20}/></button> <button className="p-2 hover:bg-blue-500/10 rounded-full"><BarChart2 size={20}/></button> </div> <Button onClick={() => { onPostCreate(newPostContent); setNewPostContent(''); }} disabled={!newPostContent.trim()} className="rounded-full px-6"> Post </Button> </div> </div> </div> </GlassCard> <div className="flex gap-4 border-b border-gray-200 dark:border-white/5 pb-2"> {['LATEST', 'TRENDING'].map((f) => ( <button key={f} onClick={() => setFilter(f as any)} className={`text-sm font-bold pb-2 relative transition-colors ${filter === f ? 'text-blue-500' : 'text-gray-500'}`}> {f} {filter === f && <div className="absolute bottom-[-9px] left-0 right-0 h-0.5 bg-blue-500 rounded-t-full"></div>} </button> ))} </div> <div className="space-y-4"> {filteredPosts.map(post => ( <PostCard key={post.id} post={post} user={user} onLike={onLike} onRepost={onRepost} onComment={onComment} handleCopyTrade={handleCopyTrade} onViewProfile={handleViewProfileWrapper} showUsersModal={showUsersModal} onDelete={onDeletePost} /> ))} </div> </div> <div className="hidden lg:block lg:col-span-1 space-y-6"> <GlassCard> <h3 className="font-bold text-gray-900 dark:text-white mb-4">Who to follow</h3> <div className="space-y-4"> {traders.slice(0, 4).map((t: any) => ( <div key={t.id} className="flex items-center justify-between"> <div className="flex items-center gap-2 cursor-pointer" onClick={() => onViewProfile(t)}> <img src={t.avatar} className="w-10 h-10 rounded-full"/> <div className="overflow-hidden"> <p className="font-bold text-sm text-gray-900 dark:text-white truncate">{t.username}</p> <p className="text-xs text-gray-500 truncate">{t.handle}</p> </div> </div> <Button onClick={() => handleFollow(t.id)} variant="secondary" className="px-3 py-1 text-xs h-8"> {user?.following.includes(t.id) ? 'Following' : 'Follow'} </Button> </div> ))} </div> </GlassCard> </div> </div> ) }
const ProfileHeader = ({ profile, isOwn, onEdit, onFollow, isFollowing, onCopy, isCopying, showUsersModal, onViewProfile, stats }: any) => { return ( <GlassCard className="mb-6 p-0 overflow-hidden"> <div className="h-32 sm:h-48 w-full bg-gray-800 relative"> {profile.banner ? ( <img src={profile.banner} className="w-full h-full object-cover"/> ) : ( <div className="w-full h-full bg-gray-900 dark:bg-black"></div> )} </div> <div className="px-6 pb-6 relative"> <div className="flex justify-between items-end -mt-10 sm:-mt-12 mb-4"> <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full border-4 border-white dark:border-[#1A1A1A] overflow-hidden bg-gray-200 shadow-xl"> <img src={profile.avatar} className="w-full h-full object-cover"/> </div> <div className="flex gap-2 mb-1"> {isOwn ? ( <Button variant="secondary" onClick={onEdit} className="h-9 px-4 text-xs">Edit Profile</Button> ) : ( <> <Button onClick={onFollow} variant={isFollowing ? 'secondary' : 'primary'} className="h-9 px-4 text-xs"> {isFollowing ? 'Unfollow' : 'Follow'} </Button> <Button onClick={onCopy} variant={isCopying ? 'danger' : 'success'} className="h-9 px-4 text-xs"> {isCopying ? 'Stop Copying' : 'Copy'} </Button> </> )} </div> </div> <div className="mb-4"> <h2 className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2"> {profile.username} {profile.veloRewards > 10000 && <Sparkles size={20} className="text-yellow-500" fill="currentColor"/>}
                {isVerifiedUser(profile.id) && <span title="Verified Account" className="inline-flex items-center justify-center w-5 h-5 bg-blue-500 rounded-full"><Check size={12} className="text-white" strokeWidth={3}/></span>} </h2> <p className="text-gray-500 font-medium">{profile.handle}</p> </div> <p className="text-gray-700 dark:text-gray-300 mb-6 max-w-2xl">{profile.bio}</p> <div className="flex flex-wrap gap-6 text-sm border-t border-gray-100 dark:border-white/5 pt-4"> <div className="flex gap-1 cursor-pointer hover:opacity-80" onClick={() => showUsersModal("Followers", profile.followers, onViewProfile)}> <span className="font-bold text-gray-900 dark:text-white">{profile.followers.length}</span> <span className="text-gray-500">Followers</span> </div> <div className="flex gap-1 cursor-pointer hover:opacity-80" onClick={() => showUsersModal("Following", profile.following, onViewProfile)}> <span className="font-bold text-gray-900 dark:text-white">{profile.following.length}</span> <span className="text-gray-500">Following</span> </div> <div className="flex gap-1"> <span className={`font-bold ${stats?.realizedPnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>${formatMoney(stats?.realizedPnl || profile.pnl || profile.pnlTotal)}</span> <span className="text-gray-500">PnL</span> </div> <div className="flex gap-1"> <span className="font-bold text-gray-900 dark:text-white">{(stats?.winRate || profile.winRate || 0).toFixed(1)}%</span> <span className="text-gray-500">Win Rate</span> </div> </div> </div> </GlassCard> ) }
const ProfileView = ({ user, handleUpdateProfile, posts, onPostCreate, positions, onLike, onRepost, onComment, showUsersModal, onViewProfile, onDeletePost }: any) => { const [isEditOpen, setEditOpen] = useState(false); const [activeTab, setActiveTab] = useState<'POSTS' | 'REPOSTS' | 'TRADES'>('POSTS'); const stats = calculateStats(user.tradeHistory); const userPosts = posts.filter((p: Post) => p.authorId === user.id); const userReposts = posts.filter((p: Post) => p.repostedBy.includes(user.id)); const activePositions = positions.filter((p: Position) => !p.isBotTrade && !p.isCopyTrade); return ( <div className="max-w-4xl mx-auto pb-20 animate-fade-in"> <EditProfileModal isOpen={isEditOpen} onClose={() => setEditOpen(false)} user={user} onSave={handleUpdateProfile} /> <ProfileHeader profile={user} isOwn={true} onEdit={() => setEditOpen(true)} showUsersModal={showUsersModal} onViewProfile={onViewProfile} stats={stats} /> <div className="flex border-b border-gray-200 dark:border-white/5 mb-6"> {['POSTS', 'REPOSTS', 'TRADES'].map(t => ( <button key={t} onClick={() => setActiveTab(t as any)} className={`px-6 py-3 text-xs font-bold transition-all border-b-2 ${activeTab === t ? 'border-blue-500 text-blue-500' : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'}`} > {t} </button> ))} </div> <div className="space-y-4"> {activeTab === 'POSTS' && ( <> {userPosts.map((post: Post) => ( <PostCard key={post.id} post={post} user={user} onLike={onLike} onRepost={onRepost} onComment={onComment} handleCopyTrade={()=>{}} onViewProfile={()=>{}} showUsersModal={()=>{}} onDelete={onDeletePost}/> ))} {userPosts.length === 0 && <p className="text-center text-gray-500 py-8">No posts yet.</p>} </> )} {activeTab === 'REPOSTS' && ( <> {userReposts.map((post: Post) => ( <PostCard key={post.id} post={post} user={user} onLike={onLike} onRepost={onRepost} onComment={onComment} handleCopyTrade={()=>{}} onViewProfile={()=>{}} showUsersModal={()=>{}} onDelete={onDeletePost}/> ))} {userReposts.length === 0 && <p className="text-center text-gray-500 py-8">No reposts yet.</p>} </> )} {activeTab === 'TRADES' && ( <> {activePositions.length === 0 ? <p className="text-center text-gray-500 py-8">No active manual trades.</p> : activePositions.map((p: Position) => ( <GlassCard key={p.id} className="flex justify-between items-center"> <div> <p className="font-bold text-gray-900 dark:text-white">{p.pair} <span className={p.side === 'LONG' ? 'text-emerald-500' : 'text-red-500'}>{p.side}</span></p> <p className="text-xs text-gray-500">Entry: ${formatPrice(p.entryPrice)} • Size: ${formatMoney(p.size)}</p> </div> <div className="text-right"> <p className="text-xs font-bold bg-blue-500/10 text-blue-500 px-2 py-1 rounded">{p.leverage}x</p> </div> </GlassCard> )) } </> )} </div> </div> ) }
const PublicProfileView = ({ trader, user, posts, onBack, handleFollow, handleCopyTrade, onRequireAuth, onViewProfile, showUsersModal, positions, onUpdateProfile, onLike, onRepost, onComment, onDeletePost, onPostCreate }: any) => { if (user && user.id === trader.id) { return <ProfileView user={user} handleUpdateProfile={onUpdateProfile} posts={posts} positions={positions} onLike={onLike} onRepost={onRepost} onComment={onComment} showUsersModal={showUsersModal} onViewProfile={onViewProfile} onDeletePost={onDeletePost} onPostCreate={onPostCreate}/> } const [activeTab, setActiveTab] = useState<'POSTS' | 'REPOSTS' | 'TRADES'>('POSTS'); const [newPostContent, setNewPostContent] = useState(''); const traderPosts = posts.filter((p: Post) => p.authorId === trader.id); const traderReposts = posts.filter((p: Post) => p.repostedBy.includes(trader.id)); const displayPositions = trader.activePositions || []; const isFollowing = user?.following.includes(trader.id); const isCopying = user?.copying.includes(trader.id); const stats = { winRate: trader.winRate, realizedPnl: trader.pnl }; return ( <div className="max-w-4xl mx-auto pb-20 animate-fade-in"> <button onClick={onBack} className="mb-4 flex items-center gap-2 text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors font-bold text-sm"> <ChevronLeft size={16}/> Back </button> <ProfileHeader profile={trader} isOwn={false} onFollow={() => user ? handleFollow(trader.id) : onRequireAuth()} isFollowing={isFollowing} onCopy={() => user ? handleCopyTrade(trader.id) : onRequireAuth()} isCopying={isCopying} showUsersModal={showUsersModal} onViewProfile={onViewProfile} stats={stats} /> <div className="flex border-b border-gray-200 dark:border-white/5 mb-6"> {['POSTS', 'REPOSTS', 'TRADES'].map(t => ( <button key={t} onClick={() => setActiveTab(t as any)} className={`px-6 py-3 text-xs font-bold transition-all border-b-2 ${activeTab === t ? 'border-blue-500 text-blue-500' : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'}`} > {t} </button> ))} </div> <div className="space-y-4"> {activeTab === 'POSTS' && ( <> {user && ( <GlassCard className="p-4 mb-4"> <div className="flex gap-4"> <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-white/10 shrink-0 overflow-hidden"> <img src={user.avatar} className="w-full h-full object-cover"/> </div> <div className="flex-1"> <textarea placeholder={`Post to ${trader.username}'s profile...`} className="w-full bg-transparent border-none outline-none text-gray-900 dark:text-white placeholder-gray-500 resize-none h-16 text-sm font-medium" value={newPostContent} onChange={(e) => setNewPostContent(e.target.value)} /> <div className="flex justify-end mt-2 border-t border-gray-100 dark:border-white/5 pt-2"> <Button onClick={() => { onPostCreate(newPostContent); setNewPostContent(''); }} disabled={!newPostContent.trim()} className="rounded-full px-6 h-8 text-xs"> Post </Button> </div> </div> </div> </GlassCard> )} {traderPosts.map((post: Post) => ( <PostCard key={post.id} post={post} user={user} onLike={onLike} onRepost={onRepost} onComment={onComment} handleCopyTrade={handleCopyTrade} onViewProfile={onViewProfile} showUsersModal={showUsersModal}/> ))} {traderPosts.length === 0 && <p className="text-center text-gray-500 py-8">No posts yet.</p>} </> )} {activeTab === 'REPOSTS' && ( <> {traderReposts.map((post: Post) => ( <PostCard key={post.id} post={post} user={user} onLike={onLike} onRepost={onRepost} onComment={onComment} handleCopyTrade={handleCopyTrade} onViewProfile={onViewProfile} showUsersModal={showUsersModal}/> ))} {traderReposts.length === 0 && <p className="text-center text-gray-500 py-8">No reposts yet.</p>} </> )} {activeTab === 'TRADES' && ( <> {displayPositions.length === 0 ? <p className="text-center text-gray-500 py-8">No active trades.</p> : displayPositions.map((p: Position) => ( <GlassCard key={p.id} className="flex justify-between items-center"> <div> <p className="font-bold text-gray-900 dark:text-white">{p.pair} <span className={p.side === 'LONG' ? 'text-emerald-500' : 'text-red-500'}>{p.side}</span></p> <p className="text-xs text-gray-500">Entry: ${formatPrice(p.entryPrice)} • Size: ${formatMoney(p.size)}</p> </div> <div className="text-right"> <p className="text-xs font-bold bg-blue-500/10 text-blue-500 px-2 py-1 rounded">{p.leverage}x</p> </div> </GlassCard> )) } </> )} </div> </div> ) }
const TradeView = ({ 
    activePair, setActivePair, marketPrices, candles, user, positions, onOpenPosition, onClosePosition, onRequireAuth, onEditPosition, openOrders, handleCancelOrder, onTimeframeChange, appTheme
}: any) => {
    const [side, setSide] = useState<'LONG' | 'SHORT'>('LONG');
    const [leverage, setLeverage] = useState(10);
    const [sizeSlider, setSizeSlider] = useState(10); 
    const [sizeAmount, setSizeAmount] = useState('0'); 
    const [pairSelectorOpen, setPairSelectorOpen] = useState(false);
    const [orderType, setOrderType] = useState<OrderType>('MARKET');
    const [marginMode, setMarginMode] = useState<MarginMode>('ISOLATED');
    const [limitPrice, setLimitPrice] = useState('');
    const [takeProfit, setTakeProfit] = useState('');
    const [stopLoss, setStopLoss] = useState('');
    const [tab, setTab] = useState<'POSITIONS'|'OPEN ORDERS'|'HISTORY'>('POSITIONS');
    
    // Mobile Detection
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 1024);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const currentPrice = marketPrices[activePair.id] || activePair.basePrice;
    const activePosition = positions.find((p: Position) => p.pair === activePair.id);

    // Dynamic estimated Liq Price for form
    let estLiqPrice = 0;
    const maintenanceMargin = 0.005; // 0.5% MMR
    const currentPriceNum = parseFloat(currentPrice.toString());
    
    if (marginMode === 'ISOLATED') {
        if (side === 'LONG') {
            estLiqPrice = currentPriceNum * (1 - (1/leverage) + maintenanceMargin);
        } else {
            estLiqPrice = currentPriceNum * (1 + (1/leverage) - maintenanceMargin);
        }
    } else {
        // Cross Margin Approximation
        // Buying Power = Balance + Unrealized PnL of other positions
        const balance = buyingPower; // Use buying power which includes Cross PnL
        const positionSize = parseFloat(sizeAmount);
        
        if (positionSize > 0) {
            // Liq Price = Entry - (Equity / Position Size * Entry) + MMR
            // Equity = Buying Power + Margin Used for this position (which is 0 before open, but effectively we use buying power)
            // Simplified:
            const effectiveEquity = balance; 
            if (side === 'LONG') {
                estLiqPrice = currentPriceNum - (effectiveEquity / positionSize * currentPriceNum) + (currentPriceNum * maintenanceMargin);
            } else {
                estLiqPrice = currentPriceNum + (effectiveEquity / positionSize * currentPriceNum) - (currentPriceNum * maintenanceMargin);
            }
        }
    }

    // Calculate Buying Power (Balance + Cross Margin Unrealized PnL)
    const crossMarginPnl = positions
        .filter((p: Position) => p.marginMode === 'CROSS' && !p.isBotTrade && !p.isCopyTrade)
        .reduce((acc: number, p: Position) => {
            const cp = marketPrices[p.pair] || p.entryPrice;
            const pnl = (cp - p.entryPrice) * (p.side === 'LONG' ? 1 : -1) * (p.size/p.entryPrice);
            return acc + pnl;
        }, 0);
    
    const buyingPower = user ? Math.max(0, user.balance + crossMarginPnl) : 0;

    // Risk Level Calculation
    let riskLevel = 'LOW';
    let riskColor = 'text-emerald-500';
    
    // Calculate distance to liquidation as percentage
    const distToLiq = estLiqPrice > 0 ? Math.abs((currentPriceNum - estLiqPrice) / currentPriceNum) * 100 : 100;

    if (distToLiq < 1) { riskLevel = 'EXTREME'; riskColor = 'text-red-600'; }
    else if (distToLiq < 5) { riskLevel = 'HIGH'; riskColor = 'text-red-500'; }
    else if (distToLiq < 10) { riskLevel = 'MEDIUM'; riskColor = 'text-orange-500'; }

    useEffect(() => {
        if(user) {
            // Use Buying Power instead of just balance
            const raw = (buyingPower * (sizeSlider / 100)) * leverage;
            setSizeAmount(raw.toFixed(2));
        }
    }, [sizeSlider, leverage, user, buyingPower]);

    const handleOrderSubmit = () => {
        if (!user) return onRequireAuth();
        const price = orderType === 'MARKET' ? currentPrice : parseFloat(limitPrice);
        if (!price) return;
        
        // Prevent double submission
        if (Date.now() - (window as any)._lastTradeTime < 1000) return;
        (window as any)._lastTradeTime = Date.now();

        onOpenPosition(
            activePair.id, 
            side, 
            parseFloat(sizeAmount), 
            leverage, 
            orderType, 
            price, 
            parseFloat(takeProfit), 
            parseFloat(stopLoss),
            marginMode
        );
    };

    const PairSelectorButton = () => (
        <button 
            onClick={() => setPairSelectorOpen(true)}
            className="w-full flex items-center justify-between bg-white dark:bg-[#1A1A1A] p-2 rounded-xl border border-gray-200 dark:border-white/10 hover:border-blue-500/50 transition-colors shadow-lg"
        >
            <div className="flex items-center gap-3">
                {activePair.logo ? (
                    <img src={activePair.logo} alt={activePair.name} className="w-8 h-8 rounded-full shadow-lg" />
                ) : (
                    <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-blue-500 font-black text-[10px] shadow-lg">
                        {activePair.id.split('/')[0][0]}
                    </div>
                )}
                <div className="text-left">
                    <p className="font-black text-sm text-gray-900 dark:text-white">{activePair.id}</p>
                    <p className="text-[10px] text-gray-500 font-mono">Perpetual</p>
                </div>
            </div>
            <div className="text-right">
                <p className="font-bold text-gray-900 dark:text-white text-sm">${formatPrice(currentPrice)}</p>
                <p className="text-[10px] text-emerald-500 font-bold">+2.45%</p>
            </div>
        </button>
    );

    const PositionsPanel = () => {
        const [pageState, setPageState] = useState({ POSITIONS: 1, ORDERS: 1, HISTORY: 1 });
        const ITEMS_PER_PAGE = 5;
    
        const paginate = (items: any[], type: 'POSITIONS'|'ORDERS'|'HISTORY') => {
            const page = pageState[type];
            const total = Math.ceil(items.length / ITEMS_PER_PAGE);
            const paginated = items.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
            return { paginated, total, page };
        };

        const { paginated: pPositions, total: totalPos, page: pagePos } = paginate(positions, 'POSITIONS');
        const { paginated: pOrders, total: totalOrd, page: pageOrd } = paginate(openOrders, 'ORDERS');
        const { paginated: pHistory, total: totalHist, page: pageHist } = paginate(user?.tradeHistory || [], 'HISTORY');

        return (
        <GlassCard className="flex-1 flex flex-col p-0 overflow-hidden relative bg-white/40 dark:bg-[#121212]/40 !backdrop-blur-none shadow-none border-gray-200 dark:border-white/5 !rounded-3xl min-h-0">
            {!user && (
                <div className="absolute inset-0 z-30 bg-gray-50/95 dark:bg-[#0a0a0a]/95 flex items-center justify-center">
                    <div className="flex items-center gap-3 text-gray-400">
                        <Lock size={14} />
                        <span className="text-xs font-semibold">Sign in to view positions & orders</span>
                        <Button onClick={onRequireAuth} className="px-3 py-1 text-[10px] h-6">Log In</Button>
                    </div>
                </div>
            )}
            <div className={`flex border-b border-gray-200 dark:border-white/5 shrink-0 ${!user ? 'opacity-0 pointer-events-none' : ''}`}>
                {['POSITIONS', 'OPEN ORDERS', 'HISTORY'].map(t => (
                    <button 
                        key={t} 
                        onClick={() => setTab(t as any)} 
                        className={`px-6 py-3 text-[11px] font-bold transition-all border-b-2 whitespace-nowrap ${tab === t ? 'border-blue-500 text-blue-500 bg-blue-500/5' : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}
                    >
                        {t} <span className="opacity-50 ml-1">({t === 'POSITIONS' ? positions.length : t === 'OPEN ORDERS' ? openOrders.length : user?.tradeHistory?.length || 0})</span>
                    </button>
                ))}
            </div>
            <div className={`flex-1 overflow-auto bg-gray-50/20 dark:bg-black/10 relative custom-scrollbar ${!user ? 'opacity-20 pointer-events-none blur-[2px]' : ''}`}>
                {tab === 'POSITIONS' && (
                    <>
                        <table className="hidden md:table w-full text-left whitespace-nowrap"><thead className="sticky top-0 bg-white/80 dark:bg-[#121212]/80 backdrop-blur-sm z-10 shadow-sm"><tr className="text-[10px] font-bold text-gray-500 uppercase"><th className="py-2 pl-4">Pair</th><th className="py-2">Side</th><th className="py-2">Size</th><th className="py-2">Entry</th><th className="py-2">Mark</th><th className="py-2">Liq. Price</th><th className="py-2">Margin Risk</th><th className="py-2">PnL (ROE%)</th><th className="py-2">TP / SL</th><th className="py-2 text-right pr-4">Action</th></tr></thead><tbody className="divide-y divide-gray-200 dark:divide-white/5 text-xs font-medium">{pPositions.length === 0 ? <tr><td colSpan={10} className="text-center py-8 text-gray-500">No open positions</td></tr> :
                                    pPositions.map((p: Position) => {
                                        const cp = marketPrices[p.pair] || p.entryPrice;
                                        const pnl = (cp - p.entryPrice) * (p.side === 'LONG' ? 1 : -1) * (p.size/p.entryPrice);
                                        const roe = (pnl / (p.size/p.leverage)) * 100;
                                        
                                        // Risk Calc: Distance to Liq
                                        const distToLiq = Math.abs((cp - p.liquidationPrice) / cp) * 100;
                                        let riskColor = 'text-emerald-500';
                                        if (distToLiq < 5) riskColor = 'text-red-500';
                                        else if (distToLiq < 10) riskColor = 'text-orange-500';

                                        return (
                                            <tr key={p.id} className="hover:bg-white dark:hover:bg-white/5">
                                                <td className="py-2 pl-4 font-bold">
                                                    <div className="flex items-center gap-2">
                                                        {(() => {
                                                            const pairInfo = PAIRS.find(pair => pair.id === p.pair);
                                                            return pairInfo?.logo ? <img src={pairInfo.logo} className="w-6 h-6 rounded-full"/> : null;
                                                        })()}
                                                        <div className="flex flex-col">
                                                            <span>{p.pair} <span className="opacity-50 text-[10px]">{p.leverage}x</span></span>
                                                            <span className="text-[9px] bg-gray-200 dark:bg-white/10 px-1 rounded w-fit mt-0.5 text-gray-500 uppercase font-bold">{p.marginMode || 'ISOLATED'}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className={p.side === 'LONG' ? 'text-emerald-500' : 'text-red-500'}>{p.side}</td>
                                                <td>${formatMoney(p.size)}</td>
                                                <td>${formatPrice(p.entryPrice)}</td>
                                                <td>${formatPrice(cp)}</td>
                                                <td className="font-mono font-bold text-orange-500">${formatPrice(p.liquidationPrice)}</td>
                                                <td>
                                                    <div className="flex items-center gap-1">
                                                        <span className={`text-[9px] font-bold ${riskColor}`}>{distToLiq.toFixed(2)}% Buffer</span>
                                                    </div>
                                                </td>
                                                <td className={pnl >= 0 ? 'text-emerald-500' : 'text-red-500'}>
                                                    ${formatMoney(pnl)} <span className="text-[10px] opacity-70">({roe.toFixed(2)}%)</span>
                                                </td>
                                                <td>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-gray-500 text-[10px]">
                                                            {p.takeProfit ? formatPrice(p.takeProfit) : '--'} / {p.stopLoss ? formatPrice(p.stopLoss) : '--'}
                                                        </span>
                                                        <button onClick={() => onEditPosition(p)} className="p-1 hover:bg-gray-200 dark:hover:bg-white/10 rounded"><Edit size={12}/></button>
                                                    </div>
                                                </td>
                                                <td className="text-right pr-6"><button onClick={() => onClosePosition(p.id)} className="text-red-500 hover:underline">Close</button></td>
                                            </tr>
                                        );
                                    })
                                }</tbody></table>
                        
                        {/* Mobile Cards */}
                        <div className="md:hidden space-y-2 p-2">
                            {pPositions.length === 0 ? <p className="text-center py-8 text-gray-500 text-xs">No open positions</p> :
                                pPositions.map((p: Position) => {
                                    const cp = marketPrices[p.pair] || p.entryPrice;
                                    const pnl = (cp - p.entryPrice) * (p.side === 'LONG' ? 1 : -1) * (p.size/p.entryPrice);
                                    const roe = (pnl / (p.size/p.leverage)) * 100;
                                    const distToLiq = Math.abs((cp - p.liquidationPrice) / cp) * 100;
                                    let riskColor = 'text-emerald-500';
                                    if (distToLiq < 5) riskColor = 'text-red-500';
                                    else if (distToLiq < 10) riskColor = 'text-orange-500';
                                    
                                    return (
                                        <div key={p.id} className="bg-white dark:bg-[#1A1A1A] p-4 rounded-xl border border-gray-200 dark:border-white/5 shadow-sm">
                                            <div className="flex justify-between items-center mb-3">
                                                <div className="flex items-center gap-2">
                                                    {(() => {
                                                        const pairInfo = PAIRS.find(pair => pair.id === p.pair);
                                                        return pairInfo?.logo ? <img src={pairInfo.logo} className="w-6 h-6 rounded-full"/> : null;
                                                    })()}
                                                    <span className="font-black text-sm text-gray-900 dark:text-white">{p.pair}</span>
                                                    <span className="text-xs bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 rounded text-gray-500">{p.leverage}x</span>
                                                    <span className="text-[9px] bg-gray-200 dark:bg-white/10 px-1.5 py-0.5 rounded text-gray-500 uppercase">{p.marginMode || 'ISOLATED'}</span>
                                                </div>
                                                <span className={`text-xs font-bold px-2 py-1 rounded ${p.side === 'LONG' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>{p.side}</span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-y-2 text-xs mb-3">
                                                <div className="text-gray-500">Entry</div>
                                                <div className="text-right font-mono text-gray-900 dark:text-white">${formatPrice(p.entryPrice)}</div>
                                                <div className="text-gray-500">Mark Price</div>
                                                <div className="text-right font-mono text-gray-900 dark:text-white">${formatPrice(cp)}</div>
                                                <div className="text-gray-500 font-bold text-orange-500">Liq. Price</div>
                                                <div className="text-right font-mono font-bold text-orange-500">${formatPrice(p.liquidationPrice)}</div>
                                                <div className="text-gray-500">Size</div>
                                                <div className="text-right font-mono text-gray-900 dark:text-white">${formatMoney(p.size)}</div>
                                                <div className="text-gray-500 font-bold">PnL</div>
                                                <div className={`text-right font-black font-mono ${pnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>${formatMoney(pnl)} ({roe.toFixed(2)}%)</div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={() => onEditPosition(p)} className="flex-1 bg-gray-100 dark:bg-white/5 py-2 rounded-lg text-xs font-bold text-gray-500">Edit TP/SL</button>
                                                <button onClick={() => onClosePosition(p.id)} className="flex-1 bg-red-500/10 text-red-500 py-2 rounded-lg text-xs font-bold">Close Position</button>
                                            </div>
                                        </div>
                                    )
                                })
                            }
                        </div>
                        {/* Pagination Footer */}
                        {totalPos > 1 && (
                            <div className="flex justify-between items-center px-6 py-3 border-t border-gray-100 dark:border-white/5">
                                <button disabled={pagePos === 1} onClick={() => setPageState(prev => ({...prev, POSITIONS: prev.POSITIONS - 1}))} className="text-xs text-gray-500 disabled:opacity-50">Prev</button>
                                <span className="text-[10px] text-gray-400">Page {pagePos} of {totalPos}</span>
                                <button disabled={pagePos === totalPos} onClick={() => setPageState(prev => ({...prev, POSITIONS: prev.POSITIONS + 1}))} className="text-xs text-gray-500 disabled:opacity-50">Next</button>
                            </div>
                        )}
                    </>
                )}
                {tab === 'OPEN ORDERS' && (
                    <>
                        <div className="p-4">
                            {pOrders.length === 0 ? <p className="text-center text-gray-500 text-sm">No open orders</p> :
                                <div className="space-y-2">
                                    {pOrders.map((o: OpenOrder) => (
                                        <div key={o.id} className="flex justify-between items-center p-3 bg-white dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-white/5">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-bold text-sm text-gray-900 dark:text-white">{o.pair} <span className="opacity-50">{o.leverage}x</span></span>
                                                    {o.botId && <span className="text-[9px] bg-purple-500/10 text-purple-500 px-1.5 py-0.5 rounded font-bold uppercase flex items-center gap-1"><Bot size={10}/> Bot</span>}
                                                    {o.copyTraderId && <span className="text-[9px] bg-blue-500/10 text-blue-500 px-1.5 py-0.5 rounded font-bold uppercase flex items-center gap-1"><Copy size={10}/> Copy</span>}
                                                    {!o.botId && !o.copyTraderId && <span className="text-[9px] bg-gray-100 dark:bg-white/10 text-gray-500 px-1.5 py-0.5 rounded font-bold uppercase flex items-center gap-1"><User size={10}/> Manual</span>}
                                                </div>
                                                <p className="text-xs text-gray-500">
                                                    {o.type} {o.side} @ ${formatPrice(o.price)} • {formatTime(o.timestamp)}
                                                </p>
                                            </div>
                                            <Button 
                                                variant="danger" 
                                                onClick={() => handleCancelOrder(o.id)} 
                                                className="h-8 px-3 text-xs"
                                                disabled={!!o.botId || !!o.copyTraderId}
                                            >
                                                Cancel
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            }
                        </div>
                        {totalOrd > 1 && (
                            <div className="flex justify-between items-center px-6 py-3 border-t border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-white/5">
                                <button disabled={pageOrd === 1} onClick={() => setPageState(prev => ({...prev, ORDERS: prev.ORDERS - 1}))} className="text-xs text-gray-500 disabled:opacity-50">Prev</button>
                                <span className="text-[10px] text-gray-400">Page {pageOrd} of {totalOrd}</span>
                                <button disabled={pageOrd === totalOrd} onClick={() => setPageState(prev => ({...prev, ORDERS: prev.ORDERS + 1}))} className="text-xs text-gray-500 disabled:opacity-50">Next</button>
                            </div>
                        )}
                    </>
                )}
                {tab === 'HISTORY' && (
                    <>
                        <div className="p-4">
                            {pHistory.length === 0 ? <p className="text-center text-gray-500 text-sm">No trade history</p> :
                                <div className="space-y-2">
                                    {pHistory.map((t: TradeHistoryItem) => (
                                        <div key={t.id} className="flex justify-between items-center p-3 bg-white dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-white/5 opacity-70 hover:opacity-100 transition-opacity">
                                            <div>
                                                <p className="font-bold text-sm text-gray-900 dark:text-white">{t.pair} <span className={t.side==='LONG'?'text-emerald-500':'text-red-500'}>{t.side}</span></p>
                                                <p className="text-xs text-gray-500">PnL: <span className={t.pnl>=0?'text-emerald-500':'text-red-500'}>${formatMoney(t.pnl)}</span></p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xs text-gray-500">{new Date(t.timestamp).toLocaleDateString()}</p>
                                                <p className="text-[10px] text-gray-400">{formatTime(t.timestamp)}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            }
                        </div>
                        {totalHist > 1 && (
                            <div className="flex justify-between items-center px-6 py-3 border-t border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-white/5">
                                <button disabled={pageHist === 1} onClick={() => setPageState(prev => ({...prev, HISTORY: prev.HISTORY - 1}))} className="text-xs text-gray-500 disabled:opacity-50">Prev</button>
                                <span className="text-[10px] text-gray-400">Page {pageHist} of {totalHist}</span>
                                <button disabled={pageHist === totalHist} onClick={() => setPageState(prev => ({...prev, HISTORY: prev.HISTORY + 1}))} className="text-xs text-gray-500 disabled:opacity-50">Next</button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </GlassCard>
        );
    };

    return (
        <div className="flex flex-col lg:flex-row gap-0 lg:h-[calc(100vh-56px)] animate-slide-in pb-20 lg:pb-0 overflow-y-auto lg:overflow-hidden">
             <PairSelector isOpen={pairSelectorOpen} onClose={() => setPairSelectorOpen(false)} onSelect={setActivePair} marketPrices={marketPrices}/>
             
             {/* Mobile Header: Pair Selector */}
             <div className="lg:hidden">
                 <PairSelectorButton />
             </div>

             {/* Left Column: Chart + Positions */}
             <div className="flex-1 flex flex-col gap-0 min-w-0 h-full overflow-hidden">
                 <div className="flex-[3] overflow-hidden flex flex-col h-[60vh] lg:h-auto min-h-[350px] lg:min-h-0 relative bg-white dark:bg-[#080808] border-b lg:border-b-0 border-gray-200 dark:border-white/5 lg:rounded-tl-xl">
                      <TradingViewChart 
                         initialData={candles[activePair.id] || []} 
                         theme={appTheme || 'dark'} 
                         pairName={activePair.id} 
                         currentPrice={currentPrice}
                         activePosition={activePosition}
                         onTimeframeChange={onTimeframeChange}
                      />
                 </div>
                 
                 {/* Desktop Bottom Panel (Positions) */}
                 <div className="flex flex-[1] min-h-[140px] max-h-[200px] lg:max-h-[200px] overflow-hidden border-t border-gray-200 dark:border-white/5">
                    <PositionsPanel />
                 </div>
             </div>

             {/* Right Column: Order Book + Form */}
             <div className="w-full lg:w-[320px] flex flex-col gap-0 shrink-0 lg:h-full lg:overflow-y-auto custom-scrollbar">
                 {/* Desktop Pair Selector */}
                 <div className="hidden lg:block shrink-0 px-3 py-2 border-b border-gray-200 dark:border-white/5 bg-white dark:bg-[#0d0d0d]">
                    <div className="flex items-center justify-between">
                        <button onClick={() => setPairSelectorOpen(true)} className="flex items-center gap-2 group">
                            {activePair.logo && <img src={activePair.logo} className="w-6 h-6 rounded-full" onError={(e: any) => e.target.style.display='none'}/>}
                            <span className="font-bold text-sm text-gray-900 dark:text-white group-hover:text-blue-500 transition-colors">{activePair.id}</span>
                        </button>
                        <div className="text-right">
                            <div className="text-sm font-bold font-mono text-gray-900 dark:text-white">${formatPrice(currentPrice)}</div>
                            <div className="text-[9px] text-emerald-500 font-bold">Perp · <span className="text-gray-400">Fund: +0.01%</span></div>
                        </div>
                    </div>
                 </div>

                 {/* Order Book Section - Detached */}
                 <div className="h-[28%] min-h-[150px] max-h-[220px] overflow-hidden bg-white dark:bg-[#0d0d0d] border-b border-gray-200 dark:border-white/5 flex flex-col shrink-0">
                     <div className="flex-1 overflow-hidden flex flex-col">
                        <OrderBook price={currentPrice} pair={activePair.id} rows={isMobile ? 8 : 10} />
                     </div>
                 </div>

                 {/* Order Form Section - Detached */}
                 <div className="flex-1 flex flex-col overflow-y-auto min-h-0 bg-white dark:bg-[#0d0d0d] relative custom-scrollbar">
                     <div className="flex-1 overflow-y-auto p-2.5 relative custom-scrollbar flex flex-col">
                         {!user && (
                            <div className="absolute inset-0 z-30 bg-white/90 dark:bg-[#0d0d0d]/90 flex flex-col items-center justify-center text-center backdrop-blur-md">
                                <Lock size={20} className="text-gray-400 mb-2" />
                                <h3 className="text-xs font-bold text-gray-500 mb-2">Connect to trade</h3>
                                <Button onClick={onRequireAuth} className="px-5 py-1.5 text-xs">Log In</Button>
                            </div>
                         )}
                         <div className={`space-y-2 mb-3 ${!user ? 'opacity-10 pointer-events-none' : ''}`}>
                             <div className="flex bg-gray-100 dark:bg-white/5 rounded-md p-0.5">
                                {['ISOLATED', 'CROSS'].map(m => {
                                    const hasPosition = positions.some((p: Position) => p.pair === activePair.id && !p.isBotTrade && !p.isCopyTrade);
                                    return (
                                        <button 
                                            key={m} 
                                            onClick={() => {
                                                if (hasPosition) {
                                                    setToast({ message: 'Close existing position first to switch margin mode', type: 'ERROR' });
                                                    playSound('ERROR');
                                                } else {
                                                    try { setMarginMode(m as any); } catch(e) { console.warn('Margin mode switch error:', e); }
                                                }
                                            }} 
                                            className={`flex-1 py-1 text-[10px] font-bold rounded transition-all ${marginMode === m ? 'bg-white dark:bg-[#2A2A2A] shadow text-gray-900 dark:text-white' : 'text-gray-500'} ${hasPosition ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        >
                                            {m}
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="flex gap-4 border-b border-gray-200 dark:border-white/5 pb-1">
                                {['MARKET', 'LIMIT', 'STOP'].map(t => (
                                    <button key={t} onClick={() => setOrderType(t as any)} className={`text-[10px] font-bold pb-1 relative transition-colors ${orderType === t ? 'text-blue-500' : 'text-gray-500'}`}>
                                        {t}
                                        {orderType === t && <div className="absolute bottom-[-5px] left-0 right-0 h-0.5 bg-blue-500 rounded-t-full"></div>}
                                    </button>
                                ))}
                            </div>
                         </div>

                         <div className="space-y-3 flex-1">
                             <div className="flex bg-gray-100 dark:bg-white/5 rounded-lg p-0.5 relative">
                                <div className={`absolute inset-y-0.5 w-1/2 rounded-md bg-white dark:bg-[#2A2A2A] shadow-sm transition-all duration-200 ${side === 'SHORT' ? 'translate-x-full' : 'translate-x-0'}`}></div>
                                <button onClick={() => setSide('LONG')} className={`flex-1 relative z-10 py-1 text-xs font-bold transition-colors ${side === 'LONG' ? 'text-emerald-500' : 'text-gray-500'}`}>Buy / Long</button>
                                <button onClick={() => setSide('SHORT')} className={`flex-1 relative z-10 py-1 text-xs font-bold transition-colors ${side === 'SHORT' ? 'text-red-500' : 'text-gray-500'}`}>Sell / Short</button>
                            </div>

                            {orderType !== 'MARKET' && (
                                <Input label="Price" placeholder={currentPrice} value={limitPrice} onChange={(e: any) => setLimitPrice(e.target.value)} type="number" className="text-xs py-1" />
                            )}

                            <div>
                                <div className="flex justify-between mb-1">
                                    <label className="text-[9px] font-bold text-gray-500 uppercase">Size (Margin %)</label>
                                    <span className="text-[9px] font-mono text-gray-400">{sizeSlider}%</span>
                                </div>
                                <input 
                                    type="range" 
                                    min="0" max="100" step="1"
                                    value={sizeSlider} 
                                    onChange={(e) => setSizeSlider(parseInt(e.target.value))}
                                    className="w-full h-1 bg-gray-200 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                />
                                <div className="flex justify-between mt-1">
                                    <p className="text-xs font-bold text-gray-900 dark:text-white">${formatMoney(parseFloat(sizeAmount))}</p>
                                    <p className="text-[9px] text-gray-500">Lev: {leverage}x</p>
                                </div>
                            </div>

                            <div>
                                <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Leverage</label>
                                <div className="relative">
                                    <select 
                                        value={leverage} 
                                        onChange={(e) => {
                                            const newLev = parseInt(e.target.value);
                                            const existingPosition = positions.find((p: Position) => p.pair === activePair.id && !p.isBotTrade && !p.isCopyTrade);
                                            
                                            if (existingPosition) {
                                                // Trigger leverage change modal via onOpenPosition logic
                                                // We pass the SAME side to trigger the merge/update logic
                                                onOpenPosition(
                                                    activePair.id, 
                                                    existingPosition.side, 
                                                    0, // 0 size means we just want to update leverage
                                                    newLev, 
                                                    'MARKET', 
                                                    currentPrice, 
                                                    existingPosition.takeProfit, 
                                                    existingPosition.stopLoss,
                                                    existingPosition.marginMode
                                                );
                                            } else {
                                                setLeverage(newLev);
                                            }
                                        }}
                                        className="w-full appearance-none bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/5 rounded-lg px-3 py-1.5 text-xs font-bold text-gray-900 dark:text-white outline-none focus:border-blue-500 transition-all"
                                    >
                                        {[1, 2, 5, 10, 20, 50, 100].map(l => (
                                            <option key={l} value={l}>{l}x</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" size={14}/>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <Input label="TP" placeholder="Optional" value={takeProfit} onChange={(e:any) => setTakeProfit(e.target.value)} className="text-xs py-1" />
                                <Input label="SL" placeholder="Optional" value={stopLoss} onChange={(e:any) => setStopLoss(e.target.value)} className="text-xs py-1" />
                            </div>
                         </div>

                         <div className="mt-auto pt-2 border-t border-gray-200 dark:border-white/5">
                            {/* Trade Summary Section */}
                            <div className="mb-2 bg-gray-50 dark:bg-white/5 p-2 rounded-lg space-y-1">
                                <div className="flex justify-between text-[9px] uppercase font-bold text-gray-500">
                                    <span>Margin Mode</span>
                                    <span className="text-gray-900 dark:text-white">{marginMode}</span>
                                </div>
                                <div className="flex justify-between text-[9px] uppercase font-bold text-gray-500">
                                    <span>Leverage</span>
                                    <span className="text-gray-900 dark:text-white">{leverage}x</span>
                                </div>
                                <div className="flex justify-between text-[9px] uppercase font-bold text-gray-500">
                                    <span>Est. Liq Price</span>
                                    <span className="text-orange-500">${formatPrice(estLiqPrice)}</span>
                                </div>
                                <div className="flex justify-between text-[9px] uppercase font-bold text-gray-500">
                                    <span>Margin Risk</span>
                                    <span className={riskColor}>{riskLevel}</span>
                                </div>
                            </div>

                            <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                                <span>Cost</span>
                                <span className="font-bold text-gray-900 dark:text-white">${formatMoney(parseFloat(sizeAmount)/leverage)}</span>
                            </div>
                            <div className="flex justify-between text-[10px] text-gray-500 mb-2">
                                <span>Buying Power</span>
                                <span className="font-bold text-emerald-500">${formatMoney(buyingPower * leverage)}</span>
                            </div>
                            <Button 
                                onClick={handleOrderSubmit} 
                                variant={side === 'LONG' ? 'success' : 'danger'} 
                                className="w-full py-2.5 text-xs shadow-lg font-black tracking-wide uppercase"
                                disabled={parseFloat(sizeAmount) <= 0}
                            >
                                {user ? (orderType === 'MARKET' ? `${side} ${activePair.id.split('/')[0]}` : `Place ${orderType}`) : 'Connect Wallet'}
                            </Button>
                            </div>
                     </div>
                 </div>
             </div>

             {/* Mobile positions panel is now integrated above */}
        </div>
    )
}

const Dashboard = ({ user, positions, marketPrices, handleClosePosition, traders, handleDeposit, handleWithdraw, onEditPosition, onViewProfile, onOpenStrategyDetails, handleBotAction, handleCopyTrade }: any) => {
    const [depositModalOpen, setDepositModalOpen] = useState(false);
    const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
    const [chartPeriod, setChartPeriod] = useState<'1D'|'1W'|'1M'|'1Y'|'ALL'>('1M');
    
    // Pagination for recent activity
    const [activityPage, setActivityPage] = useState(1);
    const ITEMS_PER_PAGE = 5;

    // Calc Total Equity & PnL
    const allPositionsPnl = positions.reduce((acc: number, p: Position) => {
        const cp = marketPrices[p.pair] || p.entryPrice;
        const pnl = p.side === 'LONG' 
            ? (cp - p.entryPrice) / p.entryPrice * p.size 
            : (p.entryPrice - cp) / p.entryPrice * p.size;
        return acc + pnl;
    }, 0);

    const totalMarginUsed = positions.reduce((acc: number, p: Position) => acc + (p.size / p.leverage), 0);
    const equity = user.balance + totalMarginUsed + allPositionsPnl;

    // Total PnL (Realized + Unrealized) for the "Change" metric
    const totalPnl = user.realizedPnL + allPositionsPnl;

    const stats = calculateStats(user.tradeHistory);

    // Correct the chart data to match current equity
    const getAdjustedChartData = () => {
        const history = [...user.pnlHistory];
        // Force last point to be current equity for consistency
        if(history.length > 0) {
            history[history.length - 1] = {
                ...history[history.length - 1],
                value: equity
            };
        }
        
        if (chartPeriod === '1D') return history.slice(-24); // Assuming hourly data points for last 24h
        if (chartPeriod === '1W') return history.slice(-7);
        if (chartPeriod === '1M') return history.slice(-30);
        if (chartPeriod === '1Y') return history; 
        return history;
    };

    // Combine transactions and trades for "Recent Activity"
    const allRecentActivity = [
        ...user.transactionHistory.map((t: Transaction) => ({ ...t, kind: 'TX' })),
        ...user.tradeHistory.map((t: TradeHistoryItem) => ({ 
            id: t.id, 
            type: t.side, 
            amount: t.pnl, 
            timestamp: t.timestamp, 
            kind: 'TRADE',
            pair: t.pair,
            botId: t.botId,
            copyTraderId: t.copyTraderId,
            action: t.action
        }))
    ].sort((a, b) => b.timestamp - a.timestamp);

    const paginatedActivity = allRecentActivity.slice((activityPage - 1) * ITEMS_PER_PAGE, activityPage * ITEMS_PER_PAGE);
    const activityTotalPages = Math.ceil(allRecentActivity.length / ITEMS_PER_PAGE);

    return (
        <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-20">
            <DepositWithdrawModal isOpen={depositModalOpen} type="DEPOSIT" onClose={() => setDepositModalOpen(false)} onConfirm={handleDeposit} balance={user.balance} />
            <DepositWithdrawModal isOpen={withdrawModalOpen} type="WITHDRAW" onClose={() => setWithdrawModalOpen(false)} onConfirm={handleWithdraw} balance={user.balance} />
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                 {/* Portfolio Card */}
                 <GlassCard className="col-span-1 lg:col-span-2 relative overflow-hidden min-h-[350px] flex flex-col">
                     <div className="flex flex-col md:flex-row justify-between items-start mb-6 relative z-10 gap-4">
                         <div>
                             <p className="text-gray-500 text-sm font-bold uppercase tracking-wider">Total Equity</p>
                             <h2 className="text-4xl font-black text-gray-900 dark:text-white mt-1">${formatMoney(equity)}</h2>
                             <div className="flex items-center gap-4 mt-2">
                                <div className={`flex items-center gap-1 font-bold ${totalPnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                    {totalPnl >= 0 ? <TrendingUp size={16}/> : <TrendingUp size={16} className="rotate-180"/>}
                                    ${formatMoney(totalPnl)} ({(equity > 0 ? (totalPnl / (equity - totalPnl) * 100) : 0).toFixed(2)}%)
                                </div>
                                <div className="text-xs font-bold text-gray-500">
                                    Buying Power: <span className="text-gray-900 dark:text-white">${formatMoney(user.balance)}</span>
                                </div>
                             </div>
                         </div>
                         <div className="flex gap-2">
                             {['1D', '1W', '1M', '1Y', 'ALL'].map((p) => (
                                 <button 
                                    key={p} 
                                    onClick={() => setChartPeriod(p as any)}
                                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${chartPeriod === p ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-white/10 text-gray-500'}`}
                                 >
                                     {p}
                                 </button>
                             ))}
                         </div>
                     </div>
                     <div className="flex-1 w-full min-h-[200px]">
                         <PortfolioChart data={getAdjustedChartData()} theme={appTheme || 'dark'} />
                     </div>
                     <div className="flex gap-4 mt-4 relative z-10">
                         <Button onClick={() => setDepositModalOpen(true)} variant="success" className="flex-1">Deposit</Button>
                         <Button onClick={() => setWithdrawModalOpen(true)} variant="secondary" className="flex-1">Withdraw</Button>
                     </div>
                 </GlassCard>

                 {/* Right Column: Performance, Strategies, Copiers */}
                 <div className="space-y-6 flex flex-col">
                    {/* Performance */}
                    <GlassCard>
                        <h3 className="text-sm font-bold text-gray-500 uppercase mb-4">Performance</h3>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 rounded bg-orange-500/10 text-orange-500"><Trophy size={16}/></div>
                                    <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Win Rate</span>
                                </div>
                                <span className="font-bold text-gray-900 dark:text-white">{stats.winRate.toFixed(1)}%</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 rounded bg-emerald-500/10 text-emerald-500"><TrendingUp size={16}/></div>
                                    <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Realized PnL</span>
                                </div>
                                <span className={`font-bold ${stats.realizedPnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>${formatMoney(stats.realizedPnl)}</span>
                            </div>
                        </div>
                    </GlassCard>

                    {/* Active Strategies (Bots & Copying) */}
                    <GlassCard className="flex-1 overflow-hidden flex flex-col">
                         <h3 className="text-sm font-bold text-gray-500 uppercase mb-4 flex items-center gap-2">
                             <Zap size={16}/> Active Strategies
                         </h3>
                         <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                            {/* Bots */}
                            {user.activeBots.map((bot: ActiveBot) => (
                                <div key={bot.id} onClick={() => onOpenStrategyDetails({ type: 'BOT', data: bot })} className="flex justify-between items-center p-2 rounded-lg bg-gray-50 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 cursor-pointer border border-transparent hover:border-purple-500/30 transition-all">
                                    <div className="flex items-center gap-3">
                                        <div className="p-1.5 rounded bg-purple-500/10 text-purple-500"><Bot size={14}/></div>
                                        <div className="flex flex-col">
                                            <span className="text-xs font-bold text-gray-900 dark:text-white">{bot.name}</span>
                                            <span className="text-[10px] text-gray-500 uppercase">{bot.risk}</span>
                                        </div>
                                    </div>
                                    <div className={`text-xs font-bold ${bot.pnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                        {bot.pnl >= 0 ? '+' : ''}${formatMoney(bot.pnl)}
                                    </div>
                                </div>
                            ))}
                            {/* Copy Traders */}
                            {user.copying.map((traderId: string) => {
                                const trader = traders.find((t: any) => t.id === traderId);
                                return trader ? (
                                    <div key={traderId} onClick={() => onOpenStrategyDetails({ type: 'TRADER', data: trader })} className="flex justify-between items-center p-2 rounded-lg bg-gray-50 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 cursor-pointer border border-transparent hover:border-blue-500/30 transition-all">
                                        <div className="flex items-center gap-3">
                                            <img src={trader.avatar} className="w-6 h-6 rounded-full"/>
                                            <span className="text-xs font-bold text-gray-900 dark:text-white">{trader.username}</span>
                                        </div>
                                        <span className="text-[10px] bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded font-bold">COPYING</span>
                                    </div>
                                ) : null;
                            })}
                            {user.activeBots.length === 0 && user.copying.length === 0 && (
                                <p className="text-center text-gray-500 text-xs py-4">No active strategies.</p>
                            )}
                         </div>
                    </GlassCard>

                    {/* My Copiers & Earnings */}
                    <GlassCard>
                        <h3 className="text-sm font-bold text-gray-500 uppercase mb-4 flex items-center gap-2">
                             <Users size={16}/> My Signal Stats
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-[10px] uppercase text-gray-500 font-bold">Copiers</p>
                                <p className="text-xl font-black text-gray-900 dark:text-white">{user.copierCount || 0}</p>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase text-gray-500 font-bold">Fees Earned</p>
                                <p className="text-xl font-black text-emerald-500">${formatMoney(user.earnedFees || 0)}</p>
                            </div>
                        </div>
                    </GlassCard>
                 </div>
            </div>

            {/* FULL WIDTH ACTIVE POSITIONS */}
            <GlassCard className="p-0 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-white/5 flex justify-between items-center bg-gray-50/50 dark:bg-white/5">
                    <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Activity size={18} className="text-blue-500"/> All Active Positions
                    </h3>
                    <span className="text-xs font-bold bg-blue-500 text-white px-2 py-1 rounded-full">{positions.length} Open</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left whitespace-nowrap">
                        <thead className="text-[10px] text-gray-500 uppercase bg-gray-50 dark:bg-black/20">
                            <tr>
                                <th className="px-6 py-3">Source</th>
                                <th className="px-6 py-3">Pair</th>
                                <th className="px-6 py-3">Side</th>
                                <th className="px-6 py-3">Size</th>
                                <th className="px-6 py-3">Entry Price</th>
                                <th className="px-6 py-3">Mark Price</th>
                                <th className="px-6 py-3">TP / SL</th>
                                <th className="px-6 py-3">PnL</th>
                                <th className="px-6 py-3 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-white/5 text-xs">
                            {positions.length === 0 ? 
                                <tr><td colSpan={9} className="text-center py-8 text-gray-500 font-medium">No active positions running.</td></tr> 
                            : positions.map((p: Position) => {
                                const cp = marketPrices[p.pair] || p.entryPrice;
                                const pnl = (cp - p.entryPrice) * (p.side === 'LONG' ? 1 : -1) * (p.size/p.entryPrice);
                                let sourceIcon = <User size={14} className="text-gray-400"/>;
                                let sourceLabel = "Manual";
                                if (p.isBotTrade) { sourceIcon = <Bot size={14} className="text-purple-500"/>; sourceLabel = "Bot"; }
                                else if (p.isCopyTrade) { sourceIcon = <Copy size={14} className="text-blue-500"/>; sourceLabel = "Copy"; }

                                return (
                                    <tr key={p.id} className="hover:bg-white dark:hover:bg-white/5 transition-colors group">
                                        <td className="px-6 py-3">
                                            <div className="flex items-center gap-2 font-bold text-gray-500">
                                                {sourceIcon} {sourceLabel}
                                            </div>
                                        </td>
                                        <td className="px-6 py-3 font-bold text-gray-900 dark:text-white">
                                            {p.pair} <span className="opacity-50 ml-1 text-[10px] bg-gray-200 dark:bg-white/10 px-1.5 py-0.5 rounded">{p.leverage}x</span>
                                        </td>
                                        <td className={`px-6 py-3 font-bold ${p.side === 'LONG' ? 'text-emerald-500' : 'text-red-500'}`}>{p.side}</td>
                                        <td className="px-6 py-3 font-mono text-gray-900 dark:text-white">${formatMoney(p.size)}</td>
                                        <td className="px-6 py-3 font-mono text-gray-500">${formatPrice(p.entryPrice)}</td>
                                        <td className="px-6 py-3 font-mono text-gray-900 dark:text-white">${formatPrice(cp)}</td>
                                        <td className="px-6 py-3 font-mono text-gray-500">
                                            <div className="flex items-center gap-2">
                                                <span>{p.takeProfit ? formatPrice(p.takeProfit) : '--'} / {p.stopLoss ? formatPrice(p.stopLoss) : '--'}</span>
                                                <button onClick={() => onEditPosition(p)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-200 dark:hover:bg-white/10 rounded"><Edit size={12}/></button>
                                            </div>
                                        </td>
                                        <td className={`px-6 py-3 font-black font-mono ${pnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                            {pnl >= 0 ? '+' : ''}${formatMoney(pnl)}
                                        </td>
                                        <td className="px-6 py-3 text-right">
                                             <button onClick={() => handleClosePosition(p.id)} className="text-[10px] font-bold text-red-500 bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5 rounded transition-colors">Close</button>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </GlassCard>

            {/* FULL WIDTH RECENT ACTIVITY */}
            <GlassCard className="p-0 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-white/5 bg-gray-50/50 dark:bg-white/5">
                    <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <History size={18}/> Recent Activity
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left whitespace-nowrap">
                        <thead className="text-[10px] text-gray-500 uppercase bg-gray-50 dark:bg-black/20">
                            <tr>
                                <th className="px-6 py-3">Type</th>
                                <th className="px-6 py-3">Details</th>
                                <th className="px-6 py-3">Amount/PnL</th>
                                <th className="px-6 py-3 text-right">Time</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-white/5 text-xs">
                            {paginatedActivity.length === 0 ? 
                                <tr><td colSpan={4} className="text-center py-8 text-gray-500">No recent activity</td></tr>
                            : paginatedActivity.map((t: any) => (
                                <tr key={t.id} className="hover:bg-white dark:hover:bg-white/5 transition-colors">
                                    <td className="px-6 py-3 font-bold">
                                        {t.kind === 'TX' ? (
                                            <span className={`flex items-center gap-2 ${t.type === 'DEPOSIT' ? 'text-emerald-500' : 'text-orange-500'}`}>
                                                {t.type === 'DEPOSIT' ? <ArrowDownCircle size={14}/> : <ArrowUpCircle size={14}/>}
                                                {t.type}
                                            </span>
                                        ) : (
                                            <span className={`flex items-center gap-2 ${t.action === 'OPEN' ? 'text-blue-500' : (t.amount >= 0 ? 'text-emerald-500' : 'text-red-500')}`}>
                                                {t.botId ? <Bot size={14} className="text-purple-500"/> : t.copyTraderId ? <Copy size={14} className="text-blue-500"/> : <History size={14}/>}
                                                {t.action === 'OPEN' ? 'OPEN' : 'CLOSE'}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-3 text-gray-900 dark:text-white">
                                        {t.kind === 'TRADE' ? `${t.type} ${t.pair}` : '-'}
                                    </td>
                                    <td className={`px-6 py-3 font-mono ${t.kind === 'TRADE' ? (t.action === 'OPEN' ? 'text-gray-500' : (t.amount >= 0 ? 'text-emerald-500' : 'text-red-500')) : 'text-gray-900 dark:text-white'}`}>
                                        {t.kind === 'TRADE' ? (t.action === 'OPEN' ? '-' : `${t.amount >= 0 ? '+' : ''}${formatMoney(t.amount)}`) : `${t.amount >= 0 ? '+' : ''}${formatMoney(t.amount)}`}
                                    </td>
                                    <td className="px-6 py-3 text-right text-gray-500">{new Date(t.timestamp).toLocaleDateString()} {new Date(t.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {activityTotalPages > 1 && (
                        <div className="flex justify-between items-center px-6 py-3 border-t border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-white/5">
                            <button 
                                disabled={activityPage === 1} 
                                onClick={() => setActivityPage(p => p - 1)}
                                className="text-xs text-gray-500 disabled:opacity-50 hover:text-blue-500"
                            >
                                Prev
                            </button>
                            <span className="text-[10px] text-gray-400">Page {activityPage} of {activityTotalPages}</span>
                            <button 
                                disabled={activityPage === activityTotalPages} 
                                onClick={() => setActivityPage(p => p + 1)}
                                className="text-xs text-gray-500 disabled:opacity-50 hover:text-blue-500"
                            >
                                Next
                            </button>
                        </div>
                    )}
                </div>
            </GlassCard>
        </div>
    )
}

const StrategyView = ({ user, bots, onDeployBot, onRequireAuth, marketPrices, positions, onBotAction }: any) => {
    const [selectedBot, setSelectedBot] = useState<any | null>(null);

    return (
        <div className="w-full max-w-7xl mx-auto pb-20 animate-fade-in">
            <DeployBotModal isOpen={!!selectedBot} bot={selectedBot} onClose={() => setSelectedBot(null)} onDeploy={onDeployBot} />
            
            <div className="text-center mb-10">
                <h1 className="text-3xl font-black text-gray-900 dark:text-white mb-2">AI Trading Strategies</h1>
                <p className="text-gray-500">Deploy automated agents powered by Gemini models.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                {bots.map((bot: BotStrategy) => (
                    <GlassCard key={bot.id} className="flex flex-col h-full hover:border-blue-500/50 transition-all cursor-pointer group" onClick={() => user ? setSelectedBot(bot) : onRequireAuth()}>
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-3 rounded-xl bg-blue-500/10 text-blue-500 group-hover:scale-110 transition-transform"><Bot size={24}/></div>
                            <div className="flex gap-1 flex-wrap justify-end">{bot.tags.map(t => <span key={t} className="text-[10px] font-bold uppercase bg-gray-100 dark:bg-white/10 px-2 py-1 rounded text-gray-500">{t}</span>)}</div>
                        </div>
                        <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-2">{bot.name}</h3>
                        <p className="text-sm text-gray-500 mb-6 flex-1">{bot.description}</p>
                        <div className="flex justify-between items-end border-t border-gray-100 dark:border-white/5 pt-4">
                            <div>
                                <p className="text-[10px] uppercase text-gray-400 font-bold">Est. APY</p>
                                <p className="text-xl font-black text-emerald-500">{bot.apy}%</p>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase text-gray-400 font-bold text-right">Win Rate</p>
                                <p className="text-lg font-bold text-gray-900 dark:text-white">{bot.winRate}%</p>
                            </div>
                        </div>
                    </GlassCard>
                ))}
            </div>

            {user && user.activeBots.length > 0 && (
                <div className="animate-slide-up">
                    <h3 className="font-bold text-xl text-gray-900 dark:text-white mb-6 flex items-center gap-2"><Zap size={20} className="text-purple-500"/> Active Agents</h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {user.activeBots.map((bot: ActiveBot) => {
                            const botPositions = positions.filter((p: Position) => p.botId === bot.id);
                            const unrealizedPnl = botPositions.reduce((acc: number, p: Position) => {
                                const cp = marketPrices[p.pair] || p.entryPrice;
                                const pnl = p.side === 'LONG' 
                                    ? (cp - p.entryPrice) / p.entryPrice * p.size 
                                    : (p.entryPrice - cp) / p.entryPrice * p.size;
                                return acc + pnl;
                            }, 0);
                            const totalPnl = bot.realizedPnL + unrealizedPnl;

                            return (
                                <GlassCard key={bot.id} className="flex flex-col relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-3 opacity-10"><Bot size={100}/></div>
                                    <div className="flex justify-between items-start mb-4 relative z-10">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500"><Bot size={20}/></div>
                                            <div>
                                                <h4 className="font-bold text-gray-900 dark:text-white">{bot.name}</h4>
                                                <p className="text-xs text-gray-500 flex items-center gap-2">
                                                    {bot.risk} Mode
                                                    <span className="w-1 h-1 rounded-full bg-gray-400"></span>
                                                    {botPositions.length} Trades
                                                    {bot.status === 'PAUSED' && <span className="bg-yellow-500/20 text-yellow-500 px-1.5 py-0.5 rounded text-[10px] font-bold">PAUSED</span>}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] text-gray-500 uppercase font-bold">Total PnL</p>
                                            <p className={`font-black text-lg ${totalPnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                                {totalPnl >= 0 ? '+' : ''}${formatMoney(totalPnl)}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-3 mt-auto relative z-10">
                                        <Button 
                                            variant={bot.status === 'PAUSED' ? 'success' : 'secondary'} 
                                            className="flex-1 h-9 text-xs"
                                            onClick={(e: any) => { e.stopPropagation(); onBotAction(bot.id, bot.status === 'PAUSED' ? 'RESUME' : 'PAUSE'); }}
                                        >
                                            {bot.status === 'PAUSED' ? 'Resume Strategy' : 'Pause Strategy'}
                                        </Button>
                                        <Button 
                                            variant="danger" 
                                            className="flex-1 h-9 text-xs"
                                            onClick={(e: any) => { e.stopPropagation(); onBotAction(bot.id, 'STOP'); }}
                                        >
                                            Stop Strategy
                                        </Button>
                                    </div>
                                </GlassCard>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}

const LeverageChangeModal = ({ isOpen, onClose, onConfirm, pendingTrade, existingPosition, marketPrices }: any) => {
    if (!isOpen || !pendingTrade || !existingPosition) return null;

    const currentPrice = marketPrices[existingPosition.pair] || existingPosition.entryPrice;
    
    // Calculate New Average Entry
    const totalSize = existingPosition.size + pendingTrade.size;
    const newEntryPrice = ((existingPosition.size * existingPosition.entryPrice) + (pendingTrade.size * currentPrice)) / totalSize;
    
    // Calculate New Liquidation Price (Approximate for Isolated)
    const newLeverage = pendingTrade.leverage;
    const newLiqPrice = pendingTrade.side === 'LONG' 
        ? newEntryPrice * (1 - 1/newLeverage)
        : newEntryPrice * (1 + 1/newLeverage);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in" onClick={onClose}>
            <GlassCard className="w-full max-w-md" onClick={(e: any) => e.stopPropagation()}>
                <div className="flex items-center gap-3 mb-4 text-orange-500">
                    <AlertTriangle size={24} />
                    <h3 className="text-xl font-black text-gray-900 dark:text-white">Adjust Leverage?</h3>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
                    You are opening a position with <strong>{pendingTrade.leverage}x</strong> leverage, but your existing position is <strong>{existingPosition.leverage}x</strong>. 
                    Confirming will update your entire position to the new leverage.
                </p>

                <div className="grid grid-cols-2 gap-4 mb-6 bg-gray-50 dark:bg-white/5 p-4 rounded-xl border border-gray-200 dark:border-white/10">
                    <div>
                        <p className="text-[10px] uppercase font-bold text-gray-500 mb-1">Current Leverage</p>
                        <p className="text-lg font-black text-gray-900 dark:text-white">{existingPosition.leverage}x</p>
                    </div>
                    <div>
                        <p className="text-[10px] uppercase font-bold text-gray-500 mb-1">New Leverage</p>
                        <p className="text-lg font-black text-blue-500">{pendingTrade.leverage}x</p>
                    </div>
                    <div>
                        <p className="text-[10px] uppercase font-bold text-gray-500 mb-1">New Entry Price</p>
                        <p className="text-sm font-mono font-bold text-gray-900 dark:text-white">${formatPrice(newEntryPrice)}</p>
                    </div>
                    <div>
                        <p className="text-[10px] uppercase font-bold text-gray-500 mb-1">New Liq. Price</p>
                        <p className="text-sm font-mono font-bold text-orange-500">${formatPrice(newLiqPrice)}</p>
                    </div>
                </div>

                <div className="flex gap-3">
                    <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
                    <Button onClick={onConfirm} variant="primary" className="flex-1">Confirm Update</Button>
                </div>
            </GlassCard>
        </div>
    );
};

const OrderSuccessModal = ({ isOpen, details }: any) => {
    if (!isOpen || !details) return null;
    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md animate-fade-in pointer-events-auto cursor-wait">
            <div className="bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-white/10 p-8 rounded-3xl shadow-2xl flex flex-col items-center animate-bounce-in text-center transform scale-110">
                <div className="w-20 h-20 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/20">
                    <Check size={40} strokeWidth={4} />
                </div>
                <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-2 uppercase tracking-tight">Order Executed</h2>
                <div className="space-y-1">
                    <p className="text-gray-500 font-bold text-sm uppercase">{details.side} {details.pair}</p>
                    <p className="text-3xl font-black text-gray-900 dark:text-white">${formatMoney(details.size)}</p>
                    <p className="text-xs text-gray-400 font-mono">Entry: ${formatPrice(details.price)}</p>
                </div>
            </div>
        </div>
    );
};

const App = () => {
    const [theme, setTheme] = useState<'light' | 'dark'>('dark');
    const [user, setUser] = useState<UserProfile | null>(null);
    const [activeTab, setActiveTab] = useState<TabView>(TabView.TRADE); 
    const [traders, setTraders] = useState<Trader[]>([]);
    const [posts, setPosts] = useState<Post[]>([]);
    const [positions, setPositions] = useState<Position[]>([]);
    const [openOrders, setOpenOrders] = useState<OpenOrder[]>([]); 
    const [marketPrices, setMarketPrices] = useState<Record<string, number>>({});
    const [candles, setCandles] = useState<Record<string, Candle[]>>({});
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [activePair, setActivePair] = useState(PAIRS[0]);
    const [isLoginOpen, setLoginOpen] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [notifOpen, setNotifOpen] = useState(false);
    const [usersListModal, setUsersListModal] = useState<{ isOpen: boolean, title: string, userIds: string[] }>({ isOpen: false, title: '', userIds: [] });
    const [viewingProfile, setViewingProfile] = useState<any | null>(null);
    const [editingPosition, setEditingPosition] = useState<Position | null>(null);
    const [animation, setAnimation] = useState<'DEPOSIT' | 'WITHDRAW' | 'DEPLOY' | null>(null);
    const [toast, setToast] = useState<{ message: string, type: 'SUCCESS' | 'ERROR' | 'INFO' } | null>(null);
    const [strategyModal, setStrategyModal] = useState<{ isOpen: boolean, type: 'BOT'|'TRADER', data: any }>({ isOpen: false, type: 'BOT', data: null });
    
    // Leverage Change State
    const [leverageModalOpen, setLeverageModalOpen] = useState(false);
    const [pendingTrade, setPendingTrade] = useState<any | null>(null);

    // Order Success Modal State
    const [orderSuccess, setOrderSuccess] = useState<{ isOpen: boolean, details: any } | null>(null);

    // Global lock for trade actions to prevent double-execution
    const tradeLock = useRef(0);

    // Ref to track latest positions to avoid stale closures
    const positionsRef = useRef<Position[]>([]);
    useEffect(() => { 
        positionsRef.current = positions; 
        
        // Auto-sanitize duplicates in background
        const unique = new Map();
        let hasDuplicates = false;
        positions.forEach(p => {
            if (unique.has(p.id)) hasDuplicates = true;
            else unique.set(p.id, p);
        });
        
        if (hasDuplicates) {
            console.warn("Duplicate positions detected and removed");
            setPositions(Array.from(unique.values()));
        }
    }, [positions]);

    // Ref to track positions currently being processed
    const processingIds = useRef<Set<string>>(new Set());

    // Supabase auth state listener
    useEffect(() => {
        if (!isSupabaseConfigured()) return;
        
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' && session?.user) {
                const { profile } = await getProfile(session.user.id);
                if (profile && !user) {
                    handleLogin(profile.username);
                }
            } else if (event === 'SIGNED_OUT') {
                resetAccount();
            }
        });
        
        // Check for existing session
        supabase.auth.getSession().then(async ({ data: { session } }) => {
            if (session?.user) {
                const { profile } = await getProfile(session.user.id);
                if (profile && !user) {
                    handleLogin(profile.username);
                }
            }
        });
        
        return () => subscription.unsubscribe();
    }, []);

    useEffect(() => {
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(theme);
    }, [theme]);


    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't trigger if typing in an input
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            
            if (e.key === 'Escape') {
                setLoginOpen(false);
                setNotifOpen(false);
                setSidebarOpen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);


    // URL routing — sync tab with hash
    useEffect(() => {
        const hash = window.location.hash.slice(1);
        if (hash) {
            const tabMap: Record<string, string> = {
                'dashboard': TabView.DASHBOARD,
                'trade': TabView.TRADE,
                'strategy': TabView.STRATEGY,
                'social': TabView.SOCIAL,
                'leaderboard': TabView.LEADERBOARD,
                'profile': TabView.PROFILE,
            };
            // Direct tab match
            const basePath = hash.split('/')[0];
            if (tabMap[basePath]) setActiveTab(tabMap[basePath] as any);
            
            // Profile routing: #profile/username -> view that user's profile
            if (hash.startsWith('profile/')) {
                const handle = hash.split('/')[1];
                if (handle) {
                    // Try to find trader by handle
                    setTimeout(() => {
                        const storedTraders = getStoredTraders();
                        const trader = storedTraders.find((t: any) => 
                            t.handle?.replace('@', '').toLowerCase() === handle.toLowerCase() ||
                            t.username?.toLowerCase() === handle.toLowerCase()
                        );
                        if (trader) {
                            setViewingProfile(trader);
                            setActiveTab(TabView.PUBLIC_PROFILE as any);
                        }
                    }, 500);
                }
            }
            
            // Trade routing: #trade/SOL-USD -> switch to that pair
            if (hash.startsWith('trade/')) {
                const pairSlug = hash.split('/')[1];
                if (pairSlug) {
                    const pairId = pairSlug.replace('-', '/');
                    const pair = PAIRS.find(p => p.id === pairId);
                    if (pair) setActivePair(pair);
                }
            }
        }
    }, []);

    useEffect(() => {
        const tabToHash: Record<string, string> = {
            [TabView.DASHBOARD]: 'dashboard',
            [TabView.TRADE]: `trade/${activePair?.id?.replace('/', '-') || 'SOL-USD'}`,
            [TabView.STRATEGY]: 'strategy',
            [TabView.SOCIAL]: 'social',
            [TabView.LEADERBOARD]: 'leaderboard',
            [TabView.PROFILE]: `profile/${user?.handle?.replace('@', '') || ''}`,
            [TabView.PUBLIC_PROFILE]: `profile/${viewingProfile?.handle?.replace('@', '') || ''}`,
        };
        const hash = tabToHash[activeTab] || '';
        if (hash) window.history.replaceState(null, '', `#${hash}`);
    }, [activeTab, activePair, user, viewingProfile]);


    // Supabase real-time: load posts from DB + subscribe to new ones
    useEffect(() => {
        if (!isSupabaseConfigured()) return;
        
        // Load existing posts from Supabase
        const loadPosts = async () => {
            console.log('[VELO] Loading posts from Supabase...');
            console.log('[VELO] Supabase configured:', isSupabaseConfigured());
            try {
                const { data, error } = await supabase
                    .from('posts')
                    .select('*, profiles!author_id(username, handle, avatar_url)')
                    .order('created_at', { ascending: false })
                    .limit(50);
                    
                if (data && data.length > 0) {
                    const dbPosts = data.map((p: any) => ({
                        id: p.id,
                        authorId: p.author_id,
                        authorHandle: p.profiles?.handle || '@unknown',
                        authorAvatar: p.profiles?.avatar_url || '',
                        content: p.content,
                        image: p.image_url,
                        timestamp: p.created_at,
                        likes: 0,
                        reposts: 0,
                        likedBy: [],
                        repostedBy: [],
                        comments: [],
                        isTradeSignal: p.is_trade_signal,
                        tradeDetails: p.is_trade_signal ? { pair: p.trade_pair, side: p.trade_side, leverage: p.trade_leverage, entry: p.trade_entry } : undefined,
                    }));
                    setPosts(prev => {
                        // Merge DB posts with local, deduplicate by id
                        const existing = new Set(prev.map(p => p.id));
                        const newPosts = dbPosts.filter((p: any) => !existing.has(p.id));
                        return [...newPosts, ...prev];
                    });
                }
            } catch(e) { console.warn('Failed to load posts:', e); }
        };
        loadPosts();
        
        // Subscribe to new posts in real-time
        const channel = supabase
            .channel('public:posts')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, async (payload: any) => {
                const p = payload.new;
                // Fetch author profile
                const { data: profile } = await supabase.from('profiles').select('username, handle, avatar_url').eq('id', p.author_id).single();
                const newPost = {
                    id: p.id,
                    authorId: p.author_id,
                    authorHandle: profile?.handle || '@unknown',
                    authorAvatar: profile?.avatar_url || '',
                    content: p.content,
                    image: p.image_url,
                    timestamp: p.created_at,
                    likes: 0, reposts: 0, likedBy: [], repostedBy: [], comments: [],
                    isTradeSignal: p.is_trade_signal,
                };
                setPosts(prev => {
                    if (prev.some(existing => existing.id === p.id)) return prev;
                    return [newPost, ...prev];
                });
            })
            .subscribe();
            
        return () => { supabase.removeChannel(channel); };
    }, []);

    useEffect(() => {
        const storedUser = getStoredUser(); if (storedUser) setUser(storedUser);
        
        const storedPosts = getStoredPosts();
        setPosts(storedPosts.length > 0 ? storedPosts : INITIAL_POSTS);
        
        const storedPositions = getStoredPositions();
        // Deduplicate positions on load to fix any existing data corruption
        const uniquePositions = storedPositions.filter((pos, index, self) => 
            index === self.findIndex((t) => (
                t.id === pos.id
            ))
        );
        setPositions(uniquePositions);
        
        const storedTraders = getStoredTraders();
        setTraders(storedTraders.length > 0 ? storedTraders : INITIAL_TRADERS);

        const initialCandles: Record<string, Candle[]> = {};
        PAIRS.forEach(p => initialCandles[p.id] = generateCandles(100, p.basePrice));
        setCandles(initialCandles);
        const prices: Record<string, number> = {};
        PAIRS.forEach(p => prices[p.id] = p.basePrice);
        setMarketPrices(prices);
        
        // Fetch real prices from CoinGecko
        fetchRealPrices().then(({ prices: realPrices }) => {
            if (Object.keys(realPrices).length > 0) {
                setMarketPrices(prev => ({ ...prev, ...realPrices }));
                // Regenerate candles with real prices
                const updatedCandles: Record<string, Candle[]> = {};
                for (const [id, price] of Object.entries(realPrices)) {
                    updatedCandles[id] = generateCandles(100, price);
                }
                setCandles(prev => ({ ...prev, ...updatedCandles }));
            }
        });
    }, []);

    // --- TP/SL Simulation Effect ---
    useEffect(() => {
        if (openOrders.length === 0) return;

        const filledOrders: string[] = [];
        const closedPositions: string[] = [];

        openOrders.forEach(order => {
            const currentPrice = marketPrices[order.pair];
            if (!currentPrice) return;

            let filled = false;
            // Logic for TP/SL triggers
            if (order.type === 'TAKE_PROFIT') {
                if (order.side === 'SHORT' && currentPrice >= order.price) filled = true; // Closing a LONG (Sell)
                if (order.side === 'LONG' && currentPrice <= order.price) filled = true; // Closing a SHORT (Buy)
            } else if (order.type === 'STOP_LOSS') {
                if (order.side === 'SHORT' && currentPrice <= order.price) filled = true; // Closing a LONG (Sell)
                if (order.side === 'LONG' && currentPrice >= order.price) filled = true; // Closing a SHORT (Buy)
            }

            if (filled) {
                filledOrders.push(order.id);
                if (order.relatedPositionId) {
                    closedPositions.push(order.relatedPositionId);
                }
            }
        });

        if (filledOrders.length > 0) {
            // Batch updates to avoid race conditions
            let updatedOrders = openOrders.filter(o => !filledOrders.includes(o.id));
            let updatedPositions = positions;
            let pnlUpdate = 0;
            let historyUpdate: TradeHistoryItem[] = [];

            closedPositions.forEach(posId => {
                const pos = positions.find(p => p.id === posId);
                if (pos) {
                    const closePrice = marketPrices[pos.pair] || pos.entryPrice;
                    const pnl = (closePrice - pos.entryPrice) * (pos.side === 'LONG' ? 1 : -1) * (pos.size / pos.entryPrice);
                    pnlUpdate += pnl;
                    
                    // Add to history
                    const historyItem: TradeHistoryItem = {
                        id: `trade_${Date.now()}_${Math.random()}`,
                        pair: pos.pair,
                        side: pos.side,
                        entryPrice: pos.entryPrice,
                        exitPrice: closePrice,
                        size: pos.size,
                        pnl: pnl,
                        timestamp: Date.now(),
                        botId: pos.botId,
                        copyTraderId: pos.copyTraderId
                    };
                    historyUpdate.push(historyItem);
                    
                    // Remove position
                    updatedPositions = updatedPositions.filter(p => p.id !== posId);
                    
                    // Remove ALL orders related to this position (OCO-like behavior)
                    updatedOrders = updatedOrders.filter(o => o.relatedPositionId !== posId);
                    
                    playSound(pnl > 0 ? 'SUCCESS' : 'CLOSE');
                }
            });

            setOpenOrders(updatedOrders);
            setPositions(updatedPositions);
            savePositions(updatedPositions);
            
            if (user && (pnlUpdate !== 0 || historyUpdate.length > 0)) {
                 const updatedUser = { 
                     ...user, 
                     balance: user.balance + pnlUpdate + positions.filter(p => closedPositions.includes(p.id)).reduce((acc, p) => acc + (p.size/p.leverage), 0), // Return margin
                     realizedPnL: user.realizedPnL + pnlUpdate,
                     tradeHistory: [...historyUpdate, ...user.tradeHistory] 
                 };
                 setUser(updatedUser);
                 saveUser(updatedUser);
            }
        }

    }, [marketPrices, openOrders, positions, user]);

    const handleUpdatePosition = (id: string, tp: string, sl: string) => {
        setPositions(prevPositions => {
            const posIndex = prevPositions.findIndex(p => p.id === id);
            if (posIndex === -1) return prevPositions;

            const updatedPositions = [...prevPositions];
            const pos = { ...updatedPositions[posIndex] };
            
            const tpPrice = parseFloat(tp);
            const slPrice = parseFloat(sl);

            pos.takeProfit = tpPrice || undefined;
            pos.stopLoss = slPrice || undefined;
            updatedPositions[posIndex] = pos;
            
            // Manage Open Orders for TP/SL inside setOpenOrders to ensure consistency
            setOpenOrders(prevOrders => {
                // 1. Remove existing TP/SL orders for this position
                let currentOrders = prevOrders.filter(o => o.relatedPositionId !== id);

                // 2. Add new orders
                const newOrders: OpenOrder[] = [];
                
                // Determine side for the closing order
                const closeSide = pos.side === 'LONG' ? 'SHORT' : 'LONG';

                if (tpPrice) {
                    newOrders.push({
                        id: `ord_tp_${id}_${Date.now()}`,
                        pair: pos.pair,
                        side: closeSide,
                        type: 'TAKE_PROFIT',
                        price: tpPrice,
                        size: pos.size,
                        leverage: pos.leverage,
                        timestamp: Date.now(),
                        relatedPositionId: id
                    });
                }

                if (slPrice) {
                    newOrders.push({
                        id: `ord_sl_${id}_${Date.now()}`,
                        pair: pos.pair,
                        side: closeSide,
                        type: 'STOP_LOSS',
                        price: slPrice,
                        size: pos.size,
                        leverage: pos.leverage,
                        timestamp: Date.now(),
                        relatedPositionId: id
                    });
                }
                return [...currentOrders, ...newOrders];
            });

            return updatedPositions;
        });
        
        setEditingPosition(null);
        setToast({message:'TP/SL Updated', type:'SUCCESS'});
        playSound('SUCCESS');
    };

    useEffect(() => { if(user) saveUser(user); }, [user]);
    useEffect(() => { savePosts(posts); }, [posts]);
    useEffect(() => { savePositions(positions); }, [positions]);
    useEffect(() => { saveTraders(traders); }, [traders]);

    // Real price fetching every 15s
    useEffect(() => {
        const realPriceTimer = setInterval(() => {
            fetchRealPrices().then(({ prices: realPrices }) => {
                if (Object.keys(realPrices).length > 0) {
                    setMarketPrices(prev => ({ ...prev, ...realPrices }));
                }
            });
        }, 15000);
        return () => clearInterval(realPriceTimer);
    }, []);

    useEffect(() => {
        const interval = setInterval(() => {
            setMarketPrices(prev => {
                const next = { ...prev };
                PAIRS.forEach(p => next[p.id] = (next[p.id] || p.basePrice) + (Math.random() - 0.5) * (next[p.id] || p.basePrice) * 0.0003);
                return next;
            });
            if (user) {
                const { newPosition: botPos, closedPositionId: botClosedId } = simulateUserBotActivity(user, positions, marketPrices);
                if (botPos) {
                    setPositions(prev => [botPos, ...prev]);
                    setUser(prev => prev ? { ...prev, balance: prev.balance - (botPos.size / botPos.leverage) } : null);
                    
                    // Add TP/SL Orders for Bot
                    const newOrders: OpenOrder[] = [];
                    const closeSide = botPos.side === 'LONG' ? 'SHORT' : 'LONG';
                    if (botPos.takeProfit) {
                        newOrders.push({ id: `ord_tp_${botPos.id}`, pair: botPos.pair, side: closeSide, type: 'TAKE_PROFIT', price: botPos.takeProfit, size: botPos.size, leverage: botPos.leverage, timestamp: Date.now(), relatedPositionId: botPos.id, botId: botPos.botId });
                    }
                    if (botPos.stopLoss) {
                        newOrders.push({ id: `ord_sl_${botPos.id}`, pair: botPos.pair, side: closeSide, type: 'STOP_LOSS', price: botPos.stopLoss, size: botPos.size, leverage: botPos.leverage, timestamp: Date.now(), relatedPositionId: botPos.id, botId: botPos.botId });
                    }
                    if (newOrders.length > 0) setOpenOrders(prev => [...prev, ...newOrders]);
                }
                if (botClosedId) {
                    const p = positions.find(pos => pos.id === botClosedId);
                    if (p) {
                        const price = marketPrices[p.pair] || p.entryPrice;
                        const pnl = (price - p.entryPrice) * (p.side === 'LONG' ? 1 : -1) * (p.size/p.entryPrice);
                        setUser(prev => prev ? { ...prev, balance: prev.balance + (p.size/p.leverage) + pnl, realizedPnL: prev.realizedPnL + pnl, tradeHistory: [...prev.tradeHistory, { id: p.id, pair: p.pair, side: p.side, entryPrice: p.entryPrice, exitPrice: price, size: p.size, pnl, timestamp: Date.now(), botId: p.botId }] } : null);
                        setPositions(prev => prev.filter(pos => pos.id !== botClosedId));
                        setOpenOrders(prev => prev.filter(o => o.relatedPositionId !== botClosedId)); // Close related orders
                    }
                }
                const { newActions } = simulateTradersActivity(traders, marketPrices);
                newActions.forEach(action => {
                    if (user.copying.includes(action.traderId)) {
                        if (action.action === 'OPEN') {
                            const pairPrice = marketPrices[action.pairId];
                            if (pairPrice) {
                                const leverage = 5; 
                                const mirrorPos: Position = { id: `copy_${Date.now()}_${Math.random()}`, pair: action.pairId, side: action.position.side, entryPrice: pairPrice, size: 500, leverage: leverage, marginMode: 'ISOLATED', liquidationPrice: action.position.side === 'LONG' ? pairPrice * 0.8 : pairPrice * 1.2, timestamp: Date.now(), isCopyTrade: true, copyTraderId: action.traderId, takeProfit: action.position.takeProfit, stopLoss: action.position.stopLoss };
                                setPositions(prev => [mirrorPos, ...prev]);
                                setUser(prev => prev ? { ...prev, balance: prev.balance - (mirrorPos.size / mirrorPos.leverage) } : null);

                                // Add TP/SL Orders for Copy Trade
                                const newOrders: OpenOrder[] = [];
                                const closeSide = mirrorPos.side === 'LONG' ? 'SHORT' : 'LONG';
                                if (mirrorPos.takeProfit) {
                                    newOrders.push({ id: `ord_tp_${mirrorPos.id}`, pair: mirrorPos.pair, side: closeSide, type: 'TAKE_PROFIT', price: mirrorPos.takeProfit, size: mirrorPos.size, leverage: mirrorPos.leverage, timestamp: Date.now(), relatedPositionId: mirrorPos.id, copyTraderId: mirrorPos.copyTraderId });
                                }
                                if (mirrorPos.stopLoss) {
                                    newOrders.push({ id: `ord_sl_${mirrorPos.id}`, pair: mirrorPos.pair, side: closeSide, type: 'STOP_LOSS', price: mirrorPos.stopLoss, size: mirrorPos.size, leverage: mirrorPos.leverage, timestamp: Date.now(), relatedPositionId: mirrorPos.id, copyTraderId: mirrorPos.copyTraderId });
                                }
                                if (newOrders.length > 0) setOpenOrders(prev => [...prev, ...newOrders]);
                            }
                        } else if (action.action === 'CLOSE') {
                            const toClose = positions.filter(p => p.isCopyTrade && p.copyTraderId === action.traderId && p.pair === action.pairId);
                            toClose.forEach(p => {
                                const price = marketPrices[p.pair] || p.entryPrice;
                                const pnl = (price - p.entryPrice) * (p.side === 'LONG' ? 1 : -1) * (p.size/p.entryPrice);
                                setUser(prev => prev ? { ...prev, balance: prev.balance + (p.size/p.leverage) + pnl, realizedPnL: prev.realizedPnL + pnl, tradeHistory: [...prev.tradeHistory, { id: p.id, pair: p.pair, side: p.side, entryPrice: p.entryPrice, exitPrice: price, size: p.size, pnl, timestamp: Date.now(), copyTraderId: p.copyTraderId }] } : null);
                            });
                            setPositions(prev => prev.filter(p => !toClose.some(c => c.id === p.id)));
                            setOpenOrders(prev => prev.filter(o => !toClose.some(c => c.id === o.relatedPositionId))); // Close related orders
                        }
                    }
                });
            }
            // Simple order trigger check
            setOpenOrders(prev => {
                const remaining: OpenOrder[] = [];
                const executed: OpenOrder[] = [];
                prev.forEach(o => {
                    const price = marketPrices[o.pair];
                    let filled = false;
                    if(price) {
                        if((o.type === 'LIMIT' && ((o.side==='LONG' && price<=o.price) || (o.side==='SHORT' && price>=o.price))) || 
                           (o.type === 'STOP' && ((o.side==='LONG' && price>=o.price) || (o.side==='SHORT' && price<=o.price))) ||
                           (o.type === 'TAKE_PROFIT' && ((o.side==='SHORT' && price>=o.price) || (o.side==='LONG' && price<=o.price))) || // TP closes position (opposite side)
                           (o.type === 'STOP_LOSS' && ((o.side==='SHORT' && price<=o.price) || (o.side==='LONG' && price>=o.price)))) // SL closes position (opposite side)
                           filled = true;
                    }
                    if(filled) {
                        executed.push(o);
                    } else remaining.push(o);
                });
                
                if(executed.length > 0) {
                    // Execute trades for filled orders
                    executed.forEach(o => {
                         // Determine Margin Mode (default to ISOLATED if not found, though usually we'd look up the position)
                         // For simplicity, we assume ISOLATED for new orders or inherit for TP/SL
                         executeTrade(o.pair, o.side, o.size, o.leverage, o.price, 'ISOLATED');
                    });
                }
                
                return remaining;
            });
            const { newPosts, newNotifications, copierStatsUpdate } = simulateSocialActivity(traders, posts, user?.id);
            if (newPosts.length > 0) setPosts(prev => [...newPosts, ...prev]);
            if (newNotifications.length > 0) setNotifications(prev => [...prev, ...newNotifications]);
            if (copierStatsUpdate && (copierStatsUpdate.newCopiers > 0 || copierStatsUpdate.feesEarned > 0)) {
                setUser(prev => prev ? { ...prev, copierCount: (prev.copierCount || 0) + copierStatsUpdate.newCopiers, earnedFees: (prev.earnedFees || 0) + copierStatsUpdate.feesEarned } : null);
            }
        }, 500);
        return () => clearInterval(interval);
    }, [marketPrices, candles, traders, user, posts, positions, openOrders]);

    const handleLogin = (u: string) => { setUser(registerUser(u, '')); setLoginOpen(false); playSound('SUCCESS'); };
    const handleLogout = () => { if (isSupabaseConfigured()) supabaseSignOut(); resetAccount(); playSound('CLOSE'); };
    const handleDeposit = (a: number) => { setUser(prev => prev ? depositFunds(prev, a) : null); setAnimation('DEPOSIT'); playSound('SUCCESS'); setTimeout(()=>setAnimation(null), 2000); };
    const handleWithdraw = (a: number) => { setUser(prev => prev ? withdrawFunds(prev, a) : null); setAnimation('WITHDRAW'); playSound('SUCCESS'); setTimeout(()=>setAnimation(null), 2000); };
    const isProcessing = useRef(false);

    const executeTrade = (pairId: string, side: any, size: number, leverage: number, price: number, marginMode: MarginMode, tp?: number, sl?: number) => {
        const now = Date.now();
        if (now - tradeLock.current < 1000) return; // Debounce all trades by 1s
        tradeLock.current = now;

        // Use ref to get latest positions and avoid stale closure issues
        const currentPositions = positionsRef.current;
        const existingPosition = currentPositions.find(p => p.pair === pairId && !p.isBotTrade && !p.isCopyTrade);
        const uniqueId = uuidv4();

        // Calculate Buying Power (Balance + Cross Margin Unrealized PnL)
        const crossMarginPnl = currentPositions
            .filter((p: Position) => p.marginMode === 'CROSS' && !p.isBotTrade && !p.isCopyTrade)
            .reduce((acc: number, p: Position) => {
                const cp = marketPrices[p.pair] || p.entryPrice;
                const pnl = (cp - p.entryPrice) * (p.side === 'LONG' ? 1 : -1) * (p.size/p.entryPrice);
                return acc + pnl;
            }, 0);
        
        const buyingPower = user ? user.balance + crossMarginPnl : 0;

        if (existingPosition) {
            // Skip if size is 0 (leverage-only update)
            if (size === 0 && existingPosition.side === side) {
                // Just update leverage
                const newLiqPrice = side === 'LONG' 
                    ? existingPosition.entryPrice * (1 - (1/leverage) + 0.005)
                    : existingPosition.entryPrice * (1 + (1/leverage) - 0.005);
                setPositions(prev => prev.map(p => p.id === existingPosition.id ? { ...p, leverage, liquidationPrice: newLiqPrice } : p));
                setToast({message:'Leverage Updated', type:'SUCCESS'}); playSound('OPEN');
                return;
            }
            if (existingPosition.side === side) {
                // Merge
                const totalSize = existingPosition.size + size;
                const newEntryPrice = ((existingPosition.size * existingPosition.entryPrice) + (size * price)) / totalSize;
                const maintenanceMargin = 0.005;
                const newLiqPrice = side === 'LONG' 
                    ? newEntryPrice * (1 - (1/leverage) + maintenanceMargin)
                    : newEntryPrice * (1 + (1/leverage) - maintenanceMargin);

                // Calculate Margin Delta
                const oldMargin = existingPosition.size / existingPosition.leverage;
                const newMargin = totalSize / leverage;
                const marginDelta = newMargin - oldMargin;

                // Check if user has enough buying power for the margin difference
                if (marginDelta > 0 && buyingPower < marginDelta) {
                     setToast({message:'Insufficient buying power', type:'ERROR'}); playSound('ERROR');
                     return;
                }

                setPositions(prev => prev.map(p => {
                    if (p.id === existingPosition.id) {
                        return {
                            ...p,
                            size: totalSize,
                            entryPrice: newEntryPrice,
                            liquidationPrice: newLiqPrice,
                            leverage: leverage, // Update leverage if changed
                            marginMode: marginMode,
                            takeProfit: tp || p.takeProfit,
                            stopLoss: sl || p.stopLoss
                        };
                    }
                    return p;
                }));
                
                // Update Balance with Delta
                setUser(prev => prev ? {
                    ...prev, 
                    balance: prev.balance - marginDelta,
                    tradeHistory: [{ 
                        id: `trade_${uniqueId}`, 
                        pair: pairId, 
                        side, 
                        entryPrice: price, 
                        exitPrice: 0, 
                        size: size, 
                        pnl: 0, 
                        timestamp: Date.now(),
                        action: 'OPEN'
                    }, ...prev.tradeHistory]
                } : null);
                setToast({message:'Position Updated', type:'SUCCESS'}); playSound('OPEN');
                
                // Show Success Modal
                setOrderSuccess({ isOpen: true, details: { pair: pairId, side, size: size, price: price } });
                setTimeout(() => setOrderSuccess(null), 1500);

                // Update TP/SL Orders
                if (tp || sl) {
                    setOpenOrders(prev => {
                        const filtered = prev.filter(o => o.relatedPositionId !== existingPosition.id);
                        const newOrders: OpenOrder[] = [];
                        const closeSide = side === 'LONG' ? 'SHORT' : 'LONG';
                        if (tp) newOrders.push({ id: `ord_tp_${existingPosition.id}_${uniqueId}`, pair: pairId, side: closeSide, type: 'TAKE_PROFIT', price: tp, size: totalSize, leverage, timestamp: Date.now(), relatedPositionId: existingPosition.id });
                        if (sl) newOrders.push({ id: `ord_sl_${existingPosition.id}_${uniqueId}`, pair: pairId, side: closeSide, type: 'STOP_LOSS', price: sl, size: totalSize, leverage, timestamp: Date.now(), relatedPositionId: existingPosition.id });
                        return [...filtered, ...newOrders];
                    });
                }
            } else {
                // Netting / Closing
                const closeSize = Math.min(existingPosition.size, size);
                const pnl = (price - existingPosition.entryPrice) * (existingPosition.side === 'LONG' ? 1 : -1) * (closeSize / existingPosition.entryPrice);
                const marginReturned = closeSize / existingPosition.leverage;

                // Update Balance & History ONCE
                setUser(prev => prev ? {
                    ...prev,
                    balance: prev.balance + marginReturned + pnl - (size > existingPosition.size ? (size - existingPosition.size)/leverage : 0),
                    realizedPnL: prev.realizedPnL + pnl,
                    tradeHistory: [{ 
                        id: `trade_${uniqueId}`, 
                        pair: pairId, 
                        side: existingPosition.side, 
                        entryPrice: existingPosition.entryPrice, 
                        exitPrice: price, 
                        size: closeSize, 
                        pnl, 
                        timestamp: Date.now(),
                        action: 'CLOSE'
                    }, ...prev.tradeHistory]
                } : null);

                // Show Success Modal for Close/Reduce
                setOrderSuccess({ isOpen: true, details: { pair: pairId, side: existingPosition.side === 'LONG' ? 'SELL' : 'BUY', size: closeSize, price: price } });
                setTimeout(() => setOrderSuccess(null), 1500);

                if (size < existingPosition.size) {
                    // Partial Close
                    setPositions(prev => prev.map(p => {
                        if (p.id === existingPosition.id) {
                            return { ...p, size: p.size - size };
                        }
                        return p;
                    }));
                    setToast({message:'Position Reduced', type:'INFO'}); playSound('CLOSE');
                } else if (size === existingPosition.size) {
                    // Full Close
                    setPositions(prev => prev.filter(p => p.id !== existingPosition.id));
                    setOpenOrders(prev => prev.filter(o => o.relatedPositionId !== existingPosition.id));
                    setToast({message:'Position Closed', type:'INFO'}); playSound('CLOSE');
                } else {
                    // Flip
                    const remainingSize = size - existingPosition.size;
                    const newPos: Position = { 
                        id: `pos_${uniqueId}`, 
                        pair: pairId, 
                        side, 
                        entryPrice: price, 
                        size: remainingSize, 
                        leverage, 
                        marginMode, 
                        liquidationPrice: side === 'LONG' ? price * (1 - (1/leverage) + 0.005) : price * (1 + (1/leverage) - 0.005), 
                        takeProfit: tp, 
                        stopLoss: sl, 
                        timestamp: Date.now() 
                    };
                    
                    setPositions(prev => [newPos, ...prev.filter(p => p.id !== existingPosition.id)]);
                    setUser(prev => prev ? {
                        ...prev,
                        tradeHistory: [{ 
                            id: `trade_flip_${uniqueId}`, 
                            pair: pairId, 
                            side, 
                            entryPrice: price, 
                            exitPrice: 0, 
                            size: remainingSize, 
                            pnl: 0, 
                            timestamp: Date.now(),
                            action: 'OPEN'
                        }, ...prev.tradeHistory]
                    } : null);
                    setOpenOrders(prev => prev.filter(o => o.relatedPositionId !== existingPosition.id)); // Cancel old TP/SL
                    
                    setToast({message:'Position Flipped', type:'SUCCESS'}); playSound('OPEN');
                    
                    // Show Success Modal for Flip (New Position part)
                    setOrderSuccess({ isOpen: true, details: { pair: pairId, side, size: remainingSize, price: price } });
                    setTimeout(() => setOrderSuccess(null), 1500);
                    const newOrders: OpenOrder[] = [];
                    const closeSide = side === 'LONG' ? 'SHORT' : 'LONG';
                    if (tp) newOrders.push({ id: `ord_tp_${newPos.id}_${uniqueId}`, pair: pairId, side: closeSide, type: 'TAKE_PROFIT', price: tp, size: remainingSize, leverage, timestamp: Date.now(), relatedPositionId: newPos.id });
                    if (sl) newOrders.push({ id: `ord_sl_${newPos.id}_${uniqueId}`, pair: pairId, side: closeSide, type: 'STOP_LOSS', price: sl, size: remainingSize, leverage, timestamp: Date.now(), relatedPositionId: newPos.id });
                    if (newOrders.length > 0) setOpenOrders(prev => [...prev, ...newOrders]);
                }
            }
        } else {
            // New Position
            const marginRequired = size / leverage;
            if (buyingPower < marginRequired) {
                setToast({message:'Insufficient buying power', type:'ERROR'}); playSound('ERROR');
                return;
            }

            const maintenanceMargin = 0.005;
            const newLiqPrice = side === 'LONG' 
                ? price * (1 - (1/leverage) + maintenanceMargin)
                : price * (1 + (1/leverage) - maintenanceMargin);
                
            const newPos: Position = { id: `pos_${uniqueId}`, pair: pairId, side, entryPrice: price, size, leverage, marginMode, liquidationPrice: newLiqPrice, takeProfit: tp, stopLoss: sl, timestamp: Date.now() };
            
            // Strict deduplication using Set of existing IDs
            setPositions(prev => {
                const existingIds = new Set(prev.map(p => p.id));
                if (existingIds.has(newPos.id)) return prev;
                // Also check for duplicate pair/side/size to be extra safe against double-clicks
                if (prev.some(p => p.pair === newPos.pair && p.side === newPos.side && Math.abs(p.timestamp - newPos.timestamp) < 1000)) return prev;
                return [newPos, ...prev];
            });
            setUser(prev => prev ? {
                ...prev, 
                balance: prev.balance - marginRequired,
                tradeHistory: [{ 
                    id: `trade_${uniqueId}`, 
                    pair: pairId, 
                    side, 
                    entryPrice: price, 
                    exitPrice: 0, 
                    size: size, 
                    pnl: 0, 
                    timestamp: Date.now(),
                    action: 'OPEN'
                }, ...prev.tradeHistory]
            } : null);
            setToast({message:'Market Order Filled', type:'SUCCESS'}); playSound('OPEN');
            
            // Show Success Modal
            setOrderSuccess({ isOpen: true, details: { pair: pairId, side, size, price } });
            setTimeout(() => setOrderSuccess(null), 1500);

            const newOrders: OpenOrder[] = [];
            const closeSide = side === 'LONG' ? 'SHORT' : 'LONG';
            if (tp) newOrders.push({ id: `ord_tp_${newPos.id}_${uniqueId}`, pair: pairId, side: closeSide, type: 'TAKE_PROFIT', price: tp, size, leverage, timestamp: Date.now(), relatedPositionId: newPos.id });
            if (sl) newOrders.push({ id: `ord_sl_${newPos.id}_${uniqueId}`, pair: pairId, side: closeSide, type: 'STOP_LOSS', price: sl, size, leverage, timestamp: Date.now(), relatedPositionId: newPos.id });
            if (newOrders.length > 0) setOpenOrders(prev => [...prev, ...newOrders]);
        }
    };

    const handleOpenPosition = (pairId: string, side: any, size: number, leverage: number, type: OrderType, price: number, tp?: number, sl?: number, marginMode: MarginMode = 'ISOLATED') => {
        if(!user) return setLoginOpen(true);
        if(isProcessing.current) return; // Prevent double execution
        
        isProcessing.current = true;
        setTimeout(() => { isProcessing.current = false; }, 500); // Reset lock after delay

        const existingPosition = positions.find(p => p.pair === pairId && !p.isBotTrade && !p.isCopyTrade);

        if (type === 'MARKET') {
            const currentPrice = marketPrices[pairId];
            
            if (existingPosition && existingPosition.side === side && existingPosition.leverage !== leverage) {
                setPendingTrade({ pairId, side, size, leverage, type, price, tp, sl, marginMode });
                setLeverageModalOpen(true);
                return;
            }
            
            executeTrade(pairId, side, size, leverage, currentPrice, marginMode, tp, sl);

        } else {
            const uniqueSuffix = Math.random().toString(36).substr(2, 9);
            setOpenOrders(prev => [...prev, { id: `ord_${Date.now()}_${uniqueSuffix}`, pair: pairId, side, type, price, size, leverage, timestamp: Date.now() }]);
            setUser(prev => prev ? {...prev, balance: prev.balance - (size/leverage)} : null);
            setToast({message:`${type} Order Placed`, type:'INFO'}); playSound('CLICK');
        }
    };

    const confirmLeverageChange = () => {
        if (!pendingTrade || !user) return;
        
        const { pairId, side, size, leverage, marginMode, tp, sl } = pendingTrade;
        const currentPrice = marketPrices[pairId];
        
        // Use executeTrade which now handles margin delta checks
        executeTrade(pairId, side, size, leverage, currentPrice, marginMode, tp, sl);
        
        setLeverageModalOpen(false);
        setPendingTrade(null);
    };
    const handleClosePosition = (id: string) => {
        const now = Date.now();
        if (now - tradeLock.current < 500) return; // Debounce close actions
        tradeLock.current = now;

        if (processingIds.current.has(id)) return;
        
        // Synchronous check against ref to ensure position exists
        const p = positionsRef.current.find(x => x.id === id);
        if (!p || !user) return;

        processingIds.current.add(id);

        const price = marketPrices[p.pair] || p.entryPrice;
        const pnl = (price - p.entryPrice) * (p.side === 'LONG' ? 1 : -1) * (p.size/p.entryPrice);

        // Update User Balance & History
        setUser(prevUser => {
            if (!prevUser) return null;
            // Safety check: prevent duplicate history entries
            if (prevUser.tradeHistory.some(h => h.id === p.id && h.action === 'CLOSE')) return prevUser;

            return {
                ...prevUser, 
                balance: prevUser.balance + (p.size/p.leverage) + pnl, 
                realizedPnL: prevUser.realizedPnL + pnl, 
                tradeHistory: [{ 
                    id: p.id, 
                    pair: p.pair, 
                    side: p.side, 
                    entryPrice: p.entryPrice, 
                    exitPrice: price, 
                    size: p.size, 
                    pnl, 
                    timestamp: Date.now(), 
                    action: 'CLOSE' 
                }, ...prevUser.tradeHistory]
            };
        });

        // Remove Position
        setPositions(prevPositions => prevPositions.filter(x => x.id !== id));
        
        // UI Feedback
        setOrderSuccess({ isOpen: true, details: { pair: p.pair, side: p.side === 'LONG' ? 'SELL' : 'BUY', size: p.size, price: price } });
        setTimeout(() => setOrderSuccess(null), 1500);
        
        setToast({message:'Position Closed', type:'INFO'}); 
        playSound('CLOSE');
    };
    const handleCancelOrder = (id: string) => {
        setOpenOrders(prevOrders => {
            const order = prevOrders.find(o => o.id === id);
            if (!order) return prevOrders;

            if (order.botId || order.copyTraderId) {
                setToast({ message: 'Cannot cancel automated orders', type: 'ERROR' });
                playSound('ERROR');
                return prevOrders;
            }

            setUser(prevUser => prevUser ? {...prevUser, balance: prevUser.balance + (order.size/order.leverage)} : null);
            setToast({message:'Order Cancelled', type:'INFO'}); playSound('CLICK');
            return prevOrders.filter(o => o.id !== id);
        });
    };
    const handleBotAction = (botId: string, action: 'PAUSE' | 'RESUME' | 'STOP') => {
        if (!user) return;
        if (action === 'STOP') {
            setPositions(prevPositions => {
                const botPositions = prevPositions.filter(p => p.botId === botId);
                let realized = 0; let margin = 0;
                const newHist: any[] = [];
                botPositions.forEach(p => {
                    const price = marketPrices[p.pair] || p.entryPrice;
                    const pnl = (price - p.entryPrice) * (p.side === 'LONG' ? 1 : -1) * (p.size/p.entryPrice);
                    realized += pnl; margin += (p.size/p.leverage);
                    newHist.push({ id: p.id, pair: p.pair, side: p.side, entryPrice: p.entryPrice, exitPrice: price, size: p.size, pnl, timestamp: Date.now(), botId });
                });
                setUser(prevUser => prevUser ? { ...prevUser, balance: prevUser.balance + margin + realized, realizedPnL: prevUser.realizedPnL + realized, tradeHistory: [...prevUser.tradeHistory, ...newHist], activeBots: prevUser.activeBots.filter(b => b.id !== botId) } : null);
                setOpenOrders(prevOrders => prevOrders.filter(o => o.botId !== botId));
                return prevPositions.filter(p => p.botId !== botId);
            });
            setToast({message:'Agent Stopped & Positions Closed', type:'INFO'}); playSound('CLOSE');
        } else if (action === 'PAUSE') {
            setUser(prev => prev ? { ...prev, activeBots: prev.activeBots.map(b => b.id === botId ? { ...b, status: 'PAUSED' } : b) } : null);
            setToast({message:'Agent Paused', type:'INFO'});
        } else {
            setUser(prev => prev ? { ...prev, activeBots: prev.activeBots.map(b => b.id === botId ? { ...b, status: 'RUNNING' } : b) } : null);
            setToast({message:'Agent Resumed', type:'SUCCESS'});
        }
    };
    const handleDeployBot = (bot: any, pairs: any, risk: any) => { if(user) { setAnimation('DEPLOY'); playSound('SUCCESS'); setTimeout(() => { setUser(prev => prev ? {...prev, activeBots: [...prev.activeBots, { id: `b_${Date.now()}`, name: bot.name, pairs, risk, status: 'RUNNING', pnl: 0, realizedPnL: 0, startedAt: Date.now() }]} : null); setAnimation(null); setToast({message:'Agent Deployed', type:'SUCCESS'}); }, 2000); }};
    const handleFollow = async (id: string) => { 
        if(!user) return setLoginOpen(true);
        const isFollowing = user.following.includes(id);
        if (isFollowing) {
            setUser(prev => prev ? {...prev, following: prev.following.filter(f => f !== id)} : null);
        } else {
            setUser(prev => prev ? {...prev, following: [...prev.following, id]} : null);
        }
        playSound('CLICK');
        // Persist to Supabase
        if (isSupabaseConfigured()) {
            try {
                if (isFollowing) { await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', id); }
                else { await supabase.from('follows').insert({ follower_id: user.id, following_id: id }); }
            } catch(e) { console.warn('Follow sync failed:', e); }
        }
    };
    const handleCopyTrade = (id: string) => { 
        if(user) { 
            if(user.copying.includes(id)) { 
                // Stop Copying Logic
                setPositions(prevPositions => {
                    const copyPositions = prevPositions.filter(p => p.copyTraderId === id);
                    let realized = 0; let margin = 0;
                    const newHist: any[] = [];
                    copyPositions.forEach(p => {
                        const price = marketPrices[p.pair] || p.entryPrice;
                        const pnl = (price - p.entryPrice) * (p.side === 'LONG' ? 1 : -1) * (p.size/p.entryPrice);
                        realized += pnl; margin += (p.size/p.leverage);
                        newHist.push({ id: p.id, pair: p.pair, side: p.side, entryPrice: p.entryPrice, exitPrice: price, size: p.size, pnl, timestamp: Date.now(), copyTraderId: id });
                    });
                    
                    if (copyPositions.length > 0) {
                        setUser(prev => prev ? { ...prev, balance: prev.balance + margin + realized, realizedPnL: prev.realizedPnL + realized, tradeHistory: [...prev.tradeHistory, ...newHist], copying: prev.copying.filter(c => c !== id) } : null);
                        setOpenOrders(prevOrders => prevOrders.filter(o => o.copyTraderId !== id));
                    } else {
                         setUser(prev => prev ? { ...prev, copying: prev.copying.filter(c => c !== id) } : null);
                    }
                    return prevPositions.filter(p => p.copyTraderId !== id);
                });
                
                setToast({message:'Stopped Copying & Closed Positions', type:'INFO'}); 
            } else { 
                setUser(prev => prev ? {...prev, copying: [...prev.copying, id]} : null); 
                setToast({message:'Started Copying', type:'SUCCESS'}); 
            } 
            playSound('CLICK'); 
        } else setLoginOpen(true); 
    };
    const handleUpdateProfile = (updatedData: Partial<UserProfile>) => {
        if (!user) return;
        setUser(prev => prev ? { ...prev, ...updatedData } : null);
        setToast({ message: 'Profile Updated', type: 'SUCCESS' });
        playSound('SUCCESS');
    };
    const handleCreatePost = async (c: string) => { 
        if(!user) return setLoginOpen(true); 
        const newPost = { id: `p_${Date.now()}`, authorId: user.id, authorHandle: user.handle, authorAvatar: user.avatar, content: c, timestamp: new Date().toISOString(), likes:0, reposts:0, likedBy:[], repostedBy:[], comments:[] };
        setPosts(prev => [newPost, ...prev]); 
        setToast({message:'Post Shared', type:'SUCCESS'}); 
        playSound('SUCCESS');
        // Also save to Supabase if configured
        console.log('[VELO] Creating post, Supabase configured:', isSupabaseConfigured(), 'user.id:', user.id);
        if (isSupabaseConfigured()) {
            try { await supabaseCreatePost(user.id, c); } catch(e) { console.warn('Supabase post save failed:', e); }
        }
    };
    const handleLike = async (id: string) => {
        if (!user) return setLoginOpen(true);
        setPosts(prevPosts => prevPosts.map(p => {
            if (p.id === id) {
                const isLiked = p.likedBy.includes(user.id);
                const newLikedBy = isLiked ? p.likedBy.filter(uid => uid !== user.id) : [...p.likedBy, user.id];
                return { ...p, likedBy: newLikedBy, likes: newLikedBy.length };
            }
            return p;
        }));
        playSound('CLICK');
        // Persist to Supabase
        if (isSupabaseConfigured()) {
            try {
                const { data: existing } = await supabase.from('likes').select().eq('user_id', user.id).eq('post_id', id).maybeSingle();
                if (existing) { await supabase.from('likes').delete().eq('user_id', user.id).eq('post_id', id); }
                else { await supabase.from('likes').insert({ user_id: user.id, post_id: id }); }
            } catch(e) { console.warn('Like sync failed:', e); }
        }
    };
    const handleRepost = (id: string) => {
        if (!user) return setLoginOpen(true);
        setPosts(prevPosts => prevPosts.map(p => {
            if (p.id === id) {
                const isReposted = p.repostedBy.includes(user.id);
                const newRepostedBy = isReposted ? p.repostedBy.filter(uid => uid !== user.id) : [...p.repostedBy, user.id];
                return { ...p, repostedBy: newRepostedBy, reposts: newRepostedBy.length };
            }
            return p;
        }));
        playSound('CLICK');
    };
    const handleComment = async (pid: string, c: string) => {
        if (!user) return setLoginOpen(true);
        const newComment = { id: `c_${Date.now()}`, authorId: user.id, authorHandle: user.handle, authorAvatar: user.avatar, content: c, timestamp: new Date().toISOString() };
        setPosts(posts.map(p => p.id === pid ? {...p, comments: [...p.comments, newComment]} : p));
        // Persist to Supabase
        if (isSupabaseConfigured()) {
            try { await supabase.from('comments').insert({ post_id: pid, author_id: user.id, content: c }); }
            catch(e) { console.warn('Comment sync failed:', e); }
        }
    };
    const handleViewProfile = (profile: any) => { setViewingProfile(profile); setActiveTab(TabView.PUBLIC_PROFILE); };

    return (
        <div className={`min-h-screen font-sans text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-black transition-colors duration-300 ${theme}`}>
            {animation && <CoinAnimation type={animation}/>}
            {toast && <ToastNotification message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
            <OrderSuccessModal isOpen={orderSuccess?.isOpen} details={orderSuccess?.details} />
            <AuthModal 
                isOpen={isLoginOpen} 
                onClose={() => setLoginOpen(false)} 
                onAuth={async (authUser, profile) => {
                    // Supabase auth successful
                    if (authUser) {
                        const { profile: p } = await getProfile(authUser.id);
                        const username = p?.username || authUser.user_metadata?.username || 'Trader';
                        // Create user with Supabase UUID so social features sync
                        const supaUser = registerUser(username, authUser.email || '');
                        // Override the ID with Supabase UUID for cross-user sync
                        supaUser.id = authUser.id;
                        supaUser.handle = p?.handle || supaUser.handle;
                        supaUser.avatar = p?.avatar_url || supaUser.avatar;
                        supaUser.bio = p?.bio || supaUser.bio;
                        saveUser(supaUser);
                        setUser(supaUser);
                        setLoginOpen(false);
                        playSound('SUCCESS');
                        setToast({message: `Welcome ${username}!`, type: 'SUCCESS'});
                    }
                }}
                onFallbackLogin={handleLogin}
            />
            <EditPositionModal isOpen={!!editingPosition} position={editingPosition} onClose={() => setEditingPosition(null)} onSave={handleUpdatePosition}/>
            <LeverageChangeModal 
                isOpen={leverageModalOpen} 
                onClose={() => { setLeverageModalOpen(false); setPendingTrade(null); }} 
                onConfirm={confirmLeverageChange}
                pendingTrade={pendingTrade}
                existingPosition={pendingTrade ? positions.find(p => p.pair === pendingTrade.pairId && !p.isBotTrade && !p.isCopyTrade) : null}
                marketPrices={marketPrices}
            />
            <StrategyDetailsModal isOpen={strategyModal.isOpen} type={strategyModal.type} data={strategyModal.data} onClose={() => setStrategyModal(prev => ({ ...prev, isOpen: false }))} positions={positions} openOrders={openOrders} marketPrices={marketPrices} onBotAction={handleBotAction} onCopyAction={handleCopyTrade} onViewProfile={handleViewProfile}/>
            <UsersListModal isOpen={usersListModal.isOpen} onClose={() => setUsersListModal(prev => ({ ...prev, isOpen: false }))} title={usersListModal.title} userIds={usersListModal.userIds} traders={traders} onViewProfile={handleViewProfile}/>
            <MobileSidebar isOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} activeTab={activeTab} setActiveTab={setActiveTab} handleLogout={handleLogout} user={user} toggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')} onRequireAuth={() => setLoginOpen(true)}/>
            <Navbar activeTab={activeTab} setActiveTab={setActiveTab} toggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')} theme={appTheme || 'dark'} handleLogout={handleLogout} user={user} onRequireAuth={() => setLoginOpen(true)} unreadCount={notifications.length} setMobileMenuOpen={setSidebarOpen} notifications={notifications} onNotificationClick={()=>{}} isNotifOpen={notifOpen} setNotifOpen={setNotifOpen} totalEquity={user ? user.balance + positions.reduce((acc, p) => acc + (p.size/p.leverage) + ((marketPrices[p.pair] || p.entryPrice) - p.entryPrice) * (p.side === 'LONG' ? 1 : -1) * (p.size/p.entryPrice), 0) : 0}/>
            {/* Main content */}
            <main className={`w-full ${activeTab === TabView.TRADE ? '' : 'px-4 pt-6 pb-24 lg:pb-8'}`}>
                {activeTab === TabView.DASHBOARD && user && <Dashboard user={user} positions={positions} marketPrices={marketPrices} handleClosePosition={handleClosePosition} traders={traders} handleDeposit={handleDeposit} handleWithdraw={handleWithdraw} onEditPosition={setEditingPosition} onViewProfile={handleViewProfile} onOpenStrategyDetails={(p:any) => setStrategyModal({isOpen:true, ...p})} handleBotAction={handleBotAction} handleCopyTrade={handleCopyTrade}/>}
                {activeTab === TabView.TRADE && <TradeView activePair={activePair} setActivePair={setActivePair} marketPrices={marketPrices} candles={candles} user={user} positions={positions} openOrders={openOrders} onOpenPosition={handleOpenPosition} onClosePosition={handleClosePosition} handleCancelOrder={handleCancelOrder} onRequireAuth={() => setLoginOpen(true)} onEditPosition={setEditingPosition} appTheme={theme} onTimeframeChange={(tf: ChartTimeframe) => {
                    const intervals: Record<string, number> = { '1m': 60, '5m': 300, '15m': 900, '1H': 3600, '4H': 14400, '1D': 86400 };
                    const interval = intervals[tf] || 900;
                    const count = tf === '1D' ? 365 : tf === '4H' ? 180 : tf === '1H' ? 168 : 200;
                    const newCandles: Record<string, Candle[]> = {};
                    PAIRS.forEach(p => {
                        const currentPrice = marketPrices[p.id] || p.basePrice;
                        newCandles[p.id] = generateCandles(count, currentPrice, interval);
                    });
                    setCandles(newCandles);
                }}/>}
                {activeTab === TabView.SOCIAL && <SocialFeed traders={traders} posts={posts} user={user} handleFollow={handleFollow} handleCopyTrade={handleCopyTrade} onViewProfile={handleViewProfile} onPostCreate={handleCreatePost} onRequireAuth={() => setLoginOpen(true)} onLike={handleLike} onRepost={handleRepost} onComment={handleComment} showUsersModal={(t:string, ids:string[]) => setUsersListModal({isOpen:true, title:t, userIds:ids})} onDeletePost={(id:string) => setPosts(posts.filter(p => p.id !== id))}/>}
                {activeTab === TabView.LEADERBOARD && <LeaderboardView traders={traders} user={user} handleFollow={handleFollow} handleCopyTrade={handleCopyTrade} handleViewProfile={handleViewProfile}/>}
                {activeTab === TabView.STRATEGY && <StrategyView user={user} bots={AVAILABLE_BOTS} onDeployBot={handleDeployBot} onRequireAuth={() => setLoginOpen(true)} marketPrices={marketPrices} positions={positions} onBotAction={handleBotAction}/>}
                {activeTab === TabView.PROFILE && user && <ProfileView user={user} handleUpdateProfile={handleUpdateProfile} posts={posts} onPostCreate={handleCreatePost} positions={positions} onLike={handleLike} onRepost={handleRepost} onComment={handleComment} showUsersModal={(t:string, ids:string[]) => setUsersListModal({isOpen:true, title:t, userIds:ids})} onViewProfile={handleViewProfile} onDeletePost={(id:string) => setPosts(posts.filter(p => p.id !== id))}/>}
                {activeTab === TabView.PUBLIC_PROFILE && viewingProfile && <PublicProfileView trader={viewingProfile} user={user} posts={posts} onBack={() => setActiveTab(TabView.LEADERBOARD)} handleFollow={handleFollow} handleCopyTrade={handleCopyTrade} onRequireAuth={() => setLoginOpen(true)} onViewProfile={handleViewProfile} showUsersModal={(t:string, ids:string[]) => setUsersListModal({isOpen:true, title:t, userIds:ids})} positions={positions} onUpdateProfile={handleUpdateProfile} onLike={handleLike} onRepost={handleRepost} onComment={handleComment} onDeletePost={(id:string) => setPosts(posts.filter(p => p.id !== id))} onPostCreate={handleCreatePost}/>}
            </main>
            <MobileBottomNav activeTab={activeTab} setActiveTab={setActiveTab} setSidebarOpen={setSidebarOpen} />
        </div>
    )
}

export default App;
