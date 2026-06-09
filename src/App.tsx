import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { VeloOnboardingModal, useOnboardingGuard } from './components/VeloOnboardingModal';
import { 
  Wallet, Users, Bot, TrendingUp, Bell, Menu, X, ArrowRightLeft, 
  Copy, ThumbsUp, MessageCircle, Share2, Cpu, Zap, Settings, 
  LogOut, PlusCircle, BarChart2, Send, Trash2, Sun, Moon, 
  LayoutDashboard, UserCircle, Briefcase, ChevronRight, ChevronLeft, PlayCircle, PauseCircle,
  Clock, AlertTriangle, ExternalLink, Activity, Trophy, Search, Lock,
  Repeat, Image as ImageIcon, Heart, CreditCard, LogIn, ArrowDownCircle, ArrowUpCircle,
  Hash, Calculator, CheckCircle, Info, RefreshCw, MoreHorizontal, Sliders, ChevronDown, Flame, Timer, Check, Filter, Edit, Coins, Wallet as WalletIcon, Rocket, AlertCircle, Sparkles, MessageSquare, History, User, Volume2, Shield, ArrowUpRight, Star
} from 'lucide-react';

import { TradingViewChart } from './components/TradingViewChart';
import { PWAInstallBanner } from './components/PWAInstallBanner';
import { VeloAnimation, VeloAnimationKind } from './components/VeloAnimation';
import { v4 as uuidv4 } from 'uuid';
import { PortfolioChart } from './components/PortfolioChart';
import { OrderBook } from './components/OrderBook';
import { fetchPricesResilient, pythPriceStream, fetchPythKlines } from './services/pythPriceService';
import { orderEngine } from './services/orderEngine';
import { WalletConnectButton } from './components/WalletConnectButton';
import { useChainId, useAccount, usePublicClient, useSignMessage } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { OrderlyOnboardingModal } from './components/OrderlyOnboardingModal';
// VeloWelcomeModal merged into VeloOnboardingModal
import { VeloBridgeModal } from './components/VeloBridgeModal';
import { VeloDepositModal } from './components/VeloDepositModal';
import { VeloShareTradeModal, type ClosedTradeShareData } from './components/VeloShareTradeModal';
import { VeloUsernameModal } from './components/VeloUsernameModal';
import { VeloSendModal } from './components/VeloSendModal';
import { VeloWithdrawModal } from './components/VeloWithdrawModal';
import { VeloShareCard, type ShareCardData } from './components/VeloShareCard';
import { VeloManagePositionModal } from './components/VeloManagePositionModal';
import { VeloCrossAccountModal } from './components/VeloCrossAccountModal';
import { VeloAdminPanel } from './components/VeloAdminPanel';
import { useVeloPerpsTrading } from './services/useVeloPerpsTrading';
import { uiPairToVeloPair, VELO_PERPS_ADDRESS, VELO_PERPS_ABI } from './services/veloPerpsService';
import { SettingsModal } from './components/SettingsModal';
import { CreatePostModal } from './components/CreatePostModal';
import { DepositWithdrawModal } from './components/DepositWithdrawModal';
import { useOrderlyTrading } from './services/useOrderlyTrading';
import { orderlyPortfolioUrl, baseScanTxUrl, claimOrderlyFaucet } from './services/orderlyService';
import { loadStoredBurner, getOrCreateVeloBurner } from './services/veloBurnerWallet';
import {
  usePendingDeposits, usePendingDepositCount, updatePendingDeposit, reapStaleDeposits,
} from './services/pendingDeposits';
import {
  supabase,
  isConfigured as isSupabaseConfigured,
  signOut as supabaseSignOut,
  getProfile,
  fetchAllProfiles,
  dbProfileToUserProfile,
  updateProfile,
  fetchPosts,
  createPost as supabaseCreatePost,
  deletePost as supabaseDeletePost,
  toggleLike as supabaseLike,
  toggleRepost as supabaseRepost,
  addComment as supabaseComment,
  deleteComment as supabaseDeleteComment,
  deleteAccount as supabaseDeleteAccount,
  toggleFollow as supabaseFollow,
  fetchPositions,
  savePosition,
  updatePositionInDB,
  deletePosition as supabaseDeletePosition,
  deleteOrdersForPosition,
  fetchOpenOrders,
  saveOpenOrder,
  deleteOpenOrder,
  fetchTradeHistory,
  insertTradeHistory,
  fetchTransactions,
  recordTransaction,
  fetchNotifications,
  syncUserFinancials,
  subscribeSocialFeed,
  subscribeUserNotifications,
  subscribeLeaderboard,
  subscribeUserPositions,
  subscribeUserOrders,
  fetchPreferences,
  savePreferences,
  createNotification,
  markAllNotificationsRead,
  UserPreferences,
  DEFAULT_PREFERENCES,
  uploadAvatar,
  uploadBanner,
  onPersistenceError,
  touchUserActivity,
  ensureFreshSession,
  onSessionHealth,
  registerReauthProvider,
  cacheGet,
  cacheSet,
} from './services/supabaseStore';
import { trackPageView, setAnalyticsUser } from './services/analytics';


// Extracted page components
import { TradeView } from '@/components/ui/pages/TradeView';
import { Dashboard } from '@/components/ui/pages/Dashboard';
import { MarketsView } from '@/components/ui/pages/MarketsView';
import { OrderDetailsModal, DetailsPayload } from '@/components/ui/OrderDetailsModal';

import { Candle, Post, TabView, Trader, UserProfile, Position, PAIRS, ORDERLY_PAIRS, Notification, OrderType, TradeHistoryItem, Comment, MarginMode, Transaction, OpenOrder, ChartTimeframe, VERIFICATION_LABELS } from './utils/types';

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

// ── Velo session cache ────────────────────────────────────────────────────────
// Stores a minimal snapshot of the authenticated user in localStorage so the
// UI can render immediately on page load without waiting for Supabase round-trips.
// Supabase INITIAL_SESSION still runs in the background and overwrites with
// fresh data — this just eliminates the blank "Log In" flash on every tab open.
const VELO_SESSION_CACHE_KEY = 'velo_session_v1';

function readSessionCache(): any | null {
  try {
    const raw = localStorage.getItem(VELO_SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Invalidate if older than 24h — Supabase JWT also expires around then
    if (Date.now() - (parsed._cachedAt || 0) > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(VELO_SESSION_CACHE_KEY);
      return null;
    }
    return parsed;
  } catch { return null; }
}

function writeSessionCache(user: any): void {
  try {
    // Persist recent activity so it survives page refresh without waiting for
    // async DB fetches. Cap at 50 rows each to keep localStorage small (~20KB).
    // The DB fetch in restoreSession remains authoritative and merges on top.
    const tradeHistory = (user.tradeHistory || []).slice(0, 50);
    const transactionHistory = (user.transactionHistory || []).slice(0, 50);
    const pnlHistory = (user.pnlHistory || []).slice(0, 50);
    const snapshot = {
      id: user.id,
      username: user.username,
      handle: user.handle,
      avatar: user.avatar,
      banner: user.banner,
      balance: user.balance,
      pnlTotal: user.pnlTotal,
      realizedPnL: user.realizedPnL,
      veloRewards: user.veloRewards,
      walletAddress: user.walletAddress,
      veloWalletAddress: user.veloWalletAddress,
      joinedDate: user.joinedDate,
      bio: user.bio,
      following: user.following || [],
      followers: user.followers || [],
      copying: user.copying || [],
      copierCount: user.copierCount || 0,
      earnedFees: user.earnedFees || 0,
      tradeHistory,
      transactionHistory,
      pnlHistory,
      likes: [],
      reposts: [],
      _cachedAt: Date.now(),
    };
    localStorage.setItem(VELO_SESSION_CACHE_KEY, JSON.stringify(snapshot));
  } catch { /* storage full or unavailable */ }
}

function clearSessionCache(): void {
  try { localStorage.removeItem(VELO_SESSION_CACHE_KEY); } catch {}
}

// ── Notifications cache — separate from the user snapshot so it can be updated
// independently (e.g. when a real-time notification arrives while the user is
// still on the page). Survives page refresh exactly like tradeHistory does.
const VELO_NOTIF_CACHE_KEY = 'velo_notifications_v1';

function readNotifCache(): any[] {
  try {
    const raw = localStorage.getItem(VELO_NOTIF_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Same 24-hour TTL as the session cache
    if (Date.now() - (parsed._cachedAt || 0) > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(VELO_NOTIF_CACHE_KEY);
      return [];
    }
    return parsed.notifications || [];
  } catch { return []; }
}

function writeNotifCache(notifications: any[]): void {
  try {
    localStorage.setItem(VELO_NOTIF_CACHE_KEY, JSON.stringify({
      notifications: notifications.slice(0, 100),
      _cachedAt: Date.now(),
    }));
  } catch { /* storage full */ }
}

function clearNotifCache(): void {
  try { localStorage.removeItem(VELO_NOTIF_CACHE_KEY); } catch {}
}
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Logout sentinel — the critical piece that makes logout actually work.
//
// Why this exists, plainly: every prior build cleared localStorage,
// disconnected wagmi, and called supabase.auth.signOut() before navigating.
// All of that still wasn't enough. On the next page load:
//   1. wagmi auto-reconnects to MetaMask (the wallet's dapp permission
//      survives our cleanup — it lives in the extension, not in our
//      storage). The user's address is back within ~100ms of mount.
//   2. The silent socialLoginEffect uses that address as a deterministic
//      Supabase password (`signInWithPassword` at this file's ~line 4608)
//      and signs the user RIGHT back in.
//   3. UI snaps from "Signed out" overlay → freshly authed dashboard
//      faster than the user can react. They observe "logout is broken".
//
// The fix can't be at the source (we can't revoke MetaMask's permission
// programmatically from a dapp; no wallet exposes that API consistently).
// It has to be at the destination: a sentinel that blocks auto-restore
// until the user EXPLICITLY opts back in by clicking Connect Wallet.
//
// Mechanism:
//   - handleLogout navigates to `/?logout=1` (instead of `/`)
//   - This IIFE runs once at module-import time, BEFORE the App component
//     mounts and BEFORE Supabase's first getSession() call
//   - On `?logout=1`: nuke storage again (defense-in-depth), set a
//     window-level lock, strip the URL param so a refresh doesn't keep
//     re-triggering this code path
//   - restoreSession and socialLoginEffect each check the lock and bail
//   - The wagmiStatus='connecting' handler clears the lock (only fires
//     when the user explicitly opens AppKit and picks a wallet, never
//     during a silent auto-reconnect)
//
// After this build, the only way for the user to be signed in again is
// for them to click Connect Wallet. Auto-reconnect is harmless because
// it can't drive auth state on its own — the lock catches it.
// ─────────────────────────────────────────────────────────────────────────────
declare global {
  interface Window { __veloLogoutLock?: boolean; }
}
(function _handleLogoutSentinel() {
  if (typeof window === 'undefined') return;
  let params: URLSearchParams;
  try { params = new URLSearchParams(window.location.search); }
  catch { return; }
  if (params.get('logout') !== '1') return;

  // Lock FIRST so even if storage ops throw, downstream auth code sees it.
  try { window.__veloLogoutLock = true; } catch {}

  // Aggressive synchronous storage wipe — same allowlist as handleLogout.
  // Deterministic data (burner sub-account, Orderly keypair) and UI prefs
  // survive. Everything else (Supabase JWT, wagmi connector state,
  // WalletConnect sessions, AppKit metadata, sb-*, etc.) gets purged.
  try {
    const KEEP_EXACT  = new Set(['velo_theme', 'velo_fav_markets']);
    const KEEP_PREFIX = ['velo_burner_', 'orderly_kp_'];
    const toWipe: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (KEEP_EXACT.has(k)) continue;
      if (KEEP_PREFIX.some(p => k.startsWith(p))) continue;
      toWipe.push(k);
    }
    toWipe.forEach(k => { try { localStorage.removeItem(k); } catch {} });
  } catch {}
  try { sessionStorage.clear(); } catch {}

  // Strip the param. A manual refresh now reloads as a normal logged-out
  // page — IIFE doesn't re-fire, lock isn't set, the user can connect.
  try {
    window.history.replaceState({}, document.title, window.location.pathname);
  } catch {}
})();
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Inline helpers that earlier builds expected to be exported from
// services/supabaseStore.ts. Defined here so App.tsx works against ANY
// version of that file — old or new — and Vercel can't refuse to build
// just because a file copy was missed during a prior deploy. The logic is
// identical to what the supabaseStore helpers would have done; we just
// reach into `supabase` directly (which IS always exported).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Subscribe to INSERTs on the transactions table for a specific user.
 * Returns the channel so the caller can `supabase.removeChannel(ch)` on
 * cleanup. Requires `public.transactions` to be in the supabase_realtime
 * publication (added by SUPABASE_MIGRATION_BUILD81.sql).
 */
function subscribeUserTransactions(userId: string, onNew: (t: any) => void, onStatus?: (s: string, e?: Error) => void) {
  // Unique suffix so a re-subscribe after a reconnect always gets a fresh
  // channel (a static name makes Supabase hand back the existing, possibly
  // dead, channel and never re-subscribe).
  const uid = Math.random().toString(36).slice(2, 8);
  return supabase.channel(`velo-tx-${userId}-${uid}`)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'transactions',
      filter: `user_id=eq.${userId}`,
    }, (p: any) => onNew(p.new))
    .subscribe((status, err) => onStatus?.(status, err ?? undefined));
}

/**
 * Create a notification row owned by ANOTHER user via the SECURITY DEFINER
 * RPC (`create_notification_for_user`) from BUILD81. Throws on RPC failure
 * so the caller can surface the precise error as a toast.
 */
async function createNotificationForUser(
  targetUserId: string,
  type: string,
  message: string,
  relatedId?: string,
): Promise<void> {
  const { error } = await supabase.rpc('create_notification_for_user', {
    target_user_id: targetUserId,
    p_type: type,
    p_message: message,
    p_related_id: relatedId || null,
  });
  if (!error) return;
  // Best-effort fallback if the RPC isn't deployed: try a direct insert
  // (only works in environments with permissive RLS, which early-dev
  // projects sometimes still have).
  if ((error as any).code === '42883' || /function .* does not exist/i.test(error.message)) {
    const { error: insertErr } = await supabase
      .from('notifications')
      .insert({ user_id: targetUserId, type, message, related_id: relatedId || null });
    if (insertErr) throw new Error(`fallback notifications insert failed: ${insertErr.message}`);
    return;
  }
  throw new Error(error.message);
}

/**
 * Record a transaction row owned by ANOTHER user (e.g. the recipient of
 * a SEND). Same SECURITY DEFINER pattern, only RECEIVE is allowed
 * cross-user by the server-side validation in BUILD81.
 */
async function recordTransactionForUser(
  targetUserId: string,
  type: 'DEPOSIT' | 'WITHDRAW' | 'SEND' | 'RECEIVE',
  amount: number,
  onChainMeta?: { txHash?: string; counterparty?: string; onChain?: boolean },
): Promise<void> {
  const { error } = await supabase.rpc('record_transaction_for_user', {
    target_user_id: targetUserId,
    p_type: type,
    p_amount: amount,
    p_tx_hash: onChainMeta?.txHash || null,
    p_counterparty: onChainMeta?.counterparty || null,
    p_on_chain: onChainMeta?.onChain ?? true,
  });
  if (!error) return;
  if ((error as any).code === '42883' || /function .* does not exist/i.test(error.message)) {
    const { error: insertErr } = await supabase.from('transactions').insert({
      user_id: targetUserId, type, amount, status: 'COMPLETED',
      on_chain: onChainMeta?.onChain ?? true,
      tx_hash: onChainMeta?.txHash || null,
      counterparty: onChainMeta?.counterparty || null,
    });
    if (insertErr) throw new Error(`fallback transactions insert failed: ${insertErr.message}`);
    return;
  }
  throw new Error(error.message);
}
// ─────────────────────────────────────────────────────────────────────────────

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
    const closedTrades = tradeHistory.filter(t => t.action === 'CLOSE');
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


// Whether a user id looks like a Supabase auth UUID (vs a demo/bot id). Used
// only to decide whether a profile is worth fetching — NOT for the verified badge.
const isSupabaseUserId = (userId: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);

// Verified badge is admin-controlled: it appears ONLY for users the protocol
// owner assigned a verification reason to from the Admin panel (verified_reason
// column). This module map is kept in sync each render from `traders` + `user`
// (see the sync in the App component), so the module-level resolver below can be
// used at any call site without threading state through every component.
// (Previously this returned true for every Supabase UUID — which is every real
// account — so all accounts showed as verified. That was the bug.)
let VERIFIED_REASON_BY_ID: Record<string, string> = {};
const isVerifiedUser = (userId: string) => !!VERIFIED_REASON_BY_ID[userId];
// Verified badge component — only renders for admin-verified users.
const VerifiedBadge = ({ userId, size = 16 }: { userId: string, size?: number }) => {
    const reason = userId ? VERIFIED_REASON_BY_ID[userId] : null;
    if (!reason) return null;
    const label = VERIFICATION_LABELS[reason as keyof typeof VERIFICATION_LABELS] || 'Verified';
    return (
        <span title={label} aria-label={`Verified — ${label}`} className="inline-flex items-center justify-center rounded-full shrink-0"
            style={{ width: size + 2, height: size + 2, background: 'var(--holo-linear)', backgroundSize: '220% 100%', animation: 'holoSlide 9s linear infinite' }}>
            <Check size={size * 0.6} style={{ color: '#0B0B0E' }} strokeWidth={3}/>
        </span>
    );
};
const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const ToastNotification = ({ message, type, onClose }: { message: string, type: 'SUCCESS' | 'ERROR' | 'INFO', onClose: () => void }) => {
    useEffect(() => {
        playSound(type === 'SUCCESS' ? 'SUCCESS' : type === 'ERROR' ? 'ERROR' : 'CLICK');
        const timer = setTimeout(onClose, 4000);
        return () => clearTimeout(timer);
    }, []);

    const accentColor = type === 'SUCCESS' ? 'var(--pnl-up)' : type === 'ERROR' ? 'var(--pnl-down)' : 'var(--iris-violet)';
    const icons = {
        SUCCESS: <CheckCircle size={18} style={{ color: 'var(--pnl-up)' }} fill="currentColor" />,
        ERROR: <AlertCircle size={18} style={{ color: 'var(--pnl-down)' }} fill="currentColor" />,
        INFO: <Info size={18} style={{ color: 'var(--iris-violet)' }} fill="currentColor" />
    };

    return (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] w-auto pointer-events-none">
            <div className="animate-bounce-in pointer-events-auto" style={{
                background: 'var(--glass-bg-strong)',
                border: `1px solid ${accentColor}40`,
                borderRadius: 999,
                boxShadow: `var(--glass-shadow), 0 0 20px ${accentColor}20`,
                backdropFilter: 'blur(16px) saturate(1.3)',
                padding: '10px 20px',
                display: 'flex', alignItems: 'center', gap: 10,
            }}>
                <div style={{ flexShrink: 0 }}>{icons[type]}</div>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 500, color: 'var(--fg)', whiteSpace: 'nowrap' }}>{message}</span>
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
    ${onClick ? 'cursor-pointer hover:border-purple-500/30 hover:bg-white/70 dark:hover:bg-[#121212]/70' : ''}
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
    primary: "bg-iris-violet hover:brightness-110 text-white shadow-lg shadow-purple-500/20",
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
        {label && <label className={`block text-[10px] font-bold uppercase tracking-wider transition-colors ${error ? 'text-red-500' : 'text-gray-500 group-focus-within:text-purple-400'}`}>{label}</label>}
        {rightLabel && <span className="text-[10px] text-gray-400">{rightLabel}</span>}
    </div>
    <div className="relative">
        <input className={`w-full px-4 py-2 rounded-xl bg-gray-50 dark:bg-[#1A1A1A] border focus:border-purple-500 outline-none text-gray-900 dark:text-white placeholder-gray-500 transition-all font-mono font-medium text-sm ${error ? 'border-red-500' : 'border-gray-200 dark:border-white/5'} ${className}`} {...props} />
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
                                    <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-400 font-bold text-[10px] group-hover:bg-purple-500 group-hover:text-white transition-colors">{p.id.split('/')[0][0]}</div>
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

// DepositWithdrawModal imported from ./components/DepositWithdrawModal

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

    const inputStyle = (hasError: boolean): React.CSSProperties => ({
        width: '100%', padding: '11px 14px', borderRadius: 10,
        background: 'var(--chip-bg)', border: `1px solid ${hasError ? 'var(--pnl-down)' : 'var(--hairline-strong)'}`,
        fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--fg)', outline: 'none',
        transition: 'border-color 0.15s', boxSizing: 'border-box' as const,
    });

    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(7,7,10,0.8)', backdropFilter: 'blur(16px)' }} className="animate-fade-in">
            <div onClick={(e: any) => e.stopPropagation()} className="animate-bounce-in" style={{
                width: '100%', maxWidth: 360, position: 'relative', overflow: 'hidden',
                background: 'var(--glass-bg-strong)', border: '1px solid var(--hairline-strong)',
                borderRadius: 'var(--r-lg)', padding: 24, boxShadow: 'var(--glass-shadow)', backdropFilter: 'blur(32px)',
            }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--holo-linear)', backgroundSize: '220% 100%', animation: 'holoSlide 9s linear infinite' }} />
                <div style={{ marginBottom: 20 }}>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 20, fontWeight: 400, color: 'var(--fg)', letterSpacing: '-0.02em', marginBottom: 4 }}>
                        Edit Position: {position.pair}
                    </h3>
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-subtle)' }}>
                        Entry: ${formatPrice(position.entryPrice)} · Size: ${formatMoney(position.size)}
                    </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 16 }}>
                    <div>
                        <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)', display: 'block', marginBottom: 6 }}>Take Profit</label>
                        <input type="number" placeholder="Price" value={tp} onChange={(e: any) => setTp(e.target.value)}
                            style={inputStyle(position.side === 'LONG' && !!tp && parseFloat(tp) <= position.entryPrice || position.side === 'SHORT' && !!tp && parseFloat(tp) >= position.entryPrice)}
                            onFocus={e => (e.target.style.borderColor = 'var(--pnl-up)')}
                            onBlur={e => (e.target.style.borderColor = 'var(--hairline-strong)')} />
                        {projections?.tpPnl ? (
                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--pnl-up)', textAlign: 'right' as const, marginTop: 4 }}>
                                Est. Profit: +${formatMoney(projections.tpPnl)}
                            </p>
                        ) : null}
                    </div>

                    <div>
                        <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)', display: 'block', marginBottom: 6 }}>Stop Loss</label>
                        <input type="number" placeholder="Price" value={sl} onChange={(e: any) => setSl(e.target.value)}
                            style={inputStyle(position.side === 'LONG' && !!sl && parseFloat(sl) >= position.entryPrice || position.side === 'SHORT' && !!sl && parseFloat(sl) <= position.entryPrice)}
                            onFocus={e => (e.target.style.borderColor = 'var(--pnl-down)')}
                            onBlur={e => (e.target.style.borderColor = 'var(--hairline-strong)')} />
                        {projections?.slPnl ? (
                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--pnl-down)', textAlign: 'right' as const, marginTop: 4 }}>
                                Est. Loss: -${formatMoney(Math.abs(projections.slPnl))}
                            </p>
                        ) : null}
                    </div>
                </div>

                {error && (
                    <div style={{ padding: '10px 14px', background: 'oklch(0.66 0.22 25 / 0.10)', border: '1px solid oklch(0.66 0.22 25 / 0.25)', borderRadius: 10, marginBottom: 16 }}>
                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--pnl-down)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <AlertCircle size={13}/> {error}
                        </p>
                    </div>
                )}

                <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={onClose} style={{ flex: 1, padding: '11px', borderRadius: 10, background: 'var(--chip-bg)', border: '1px solid var(--hairline-strong)', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--fg-muted)', cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--chip-bg-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'var(--chip-bg)')}>Cancel</button>
                    <button onClick={handleSave} disabled={!!error} style={{ flex: 1, padding: '11px', borderRadius: 10, background: !!error ? 'var(--chip-bg)' : 'var(--fg)', border: 'none', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: !!error ? 'var(--fg-subtle)' : 'var(--bg-base)', cursor: !!error ? 'not-allowed' : 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase' as const, transition: 'opacity 0.15s', opacity: !!error ? 0.5 : 1 }}>Save Orders</button>
                </div>
            </div>
        </div>
    );
};

const EditProfileModal = ({ isOpen, onClose, user, onSave, onDeleteAccount }: any) => {
    const [formData, setFormData] = useState({ bio: '', avatar: '', banner: '', username: '' });
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const [bannerPreview, setBannerPreview] = useState<string | null>(null);
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [bannerFile, setBannerFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteInput, setDeleteInput] = useState('');
    useEffect(() => {
        if (user) {
            setFormData({ bio: user.bio || '', avatar: user.avatar || '', banner: user.banner || '', username: user.username || '' });
            setAvatarPreview(null); setBannerPreview(null);
            setAvatarFile(null); setBannerFile(null);
        }
    }, [user, isOpen]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'avatar' | 'banner') => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            if (type === 'avatar') { setAvatarPreview(ev.target?.result as string); setAvatarFile(file); }
            else { setBannerPreview(ev.target?.result as string); setBannerFile(file); }
        };
        reader.readAsDataURL(file);
    };

    const handleSave = async () => {
        setUploading(true);
        const updates: any = { bio: formData.bio, username: formData.username };
        if (avatarFile && user?.id && isSupabaseConfigured()) {
            const { url } = await uploadAvatar(user.id, avatarFile);
            if (url) updates.avatar = url;
        }
        if (bannerFile && user?.id && isSupabaseConfigured()) {
            const { url } = await uploadBanner(user.id, bannerFile);
            if (url) updates.banner = url;
        }
        setUploading(false);
        await onSave(updates);
        onClose();
    };

    if(!isOpen) return null;
    const S = {
        label: { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)' } as React.CSSProperties,
        mono:  { fontFamily: 'var(--font-mono)' } as React.CSSProperties,
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in" onClick={onClose}>
            <div onClick={(e: any) => e.stopPropagation()} className="animate-bounce-in" style={{
                width: '100%', maxWidth: 480, background: 'var(--glass-bg-strong)', border: '1px solid var(--hairline-strong)',
                borderRadius: 20, overflow: 'hidden', boxShadow: 'var(--glass-shadow)', backdropFilter: 'blur(32px)',
                maxHeight: '90vh', overflowY: 'auto',
            }}>
                {/* Holo accent */}
                <div style={{ height: 3, background: 'var(--holo-linear)', backgroundSize: '220% 100%', animation: 'holoSlide 9s linear infinite' }} />

                {/* Banner upload zone */}
                <div style={{ position: 'relative', height: 120, background: bannerPreview ? '#000' : (formData.banner ? '#000' : 'var(--chip-bg)'), overflow: 'hidden', cursor: 'pointer' }}
                    onClick={() => document.getElementById('velo-banner-upload')?.click()}>
                    {(bannerPreview || formData.banner) && (
                        <img src={bannerPreview || formData.banner} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }} alt="" />
                    )}
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'rgba(0,0,0,0.35)' }}>
                        <ImageIcon size={16} style={{ color: '#fff' }} />
                        <span style={{ ...S.label, color: '#fff', fontSize: 10 }}>Click to change banner</span>
                    </div>
                    <input id="velo-banner-upload" type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleFileChange(e, 'banner')} />
                </div>

                {/* Avatar upload zone */}
                <div style={{ padding: '0 24px', position: 'relative' }}>
                    <div style={{ position: 'relative', width: 80, height: 80, borderRadius: '50%', border: '4px solid var(--bg-base)', overflow: 'hidden', marginTop: -40, cursor: 'pointer', background: 'var(--chip-bg)', boxShadow: '0 8px 24px -8px rgba(0,0,0,0.5)' }}
                        onClick={() => document.getElementById('velo-avatar-upload')?.click()}>
                        <img src={avatarPreview || formData.avatar || user?.avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Edit size={14} style={{ color: '#fff' }} />
                        </div>
                        <input id="velo-avatar-upload" type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleFileChange(e, 'avatar')} />
                    </div>
                </div>

                {/* Form fields */}
                <div style={{ padding: '16px 24px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 18, color: 'var(--fg)', letterSpacing: '-0.02em' }}>Edit Profile</div>

                    {/* Wallet address display */}
                    {user?.walletAddress && (
                        <div style={{ padding: '10px 14px', background: 'var(--chip-bg)', borderRadius: 10, border: '1px solid var(--hairline)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ ...S.label, fontSize: 9 }}>Wallet</span>
                            <span style={{ ...S.mono, fontSize: 11, color: 'var(--fg-muted)' }}>
                                {user.walletAddress.slice(0, 8)}…{user.walletAddress.slice(-6)}
                            </span>
                        </div>
                    )}

                    {/* Username */}
                    <div>
                        <label style={S.label}>Username</label>
                        <input
                            value={formData.username}
                            onChange={(e: any) => setFormData({ ...formData, username: e.target.value })}
                            style={{ width: '100%', marginTop: 6, padding: '10px 14px', borderRadius: 10, background: 'var(--chip-bg)', border: '1px solid var(--hairline-strong)', fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg)', outline: 'none', boxSizing: 'border-box' }}
                        />
                    </div>

                    {/* Bio */}
                    <div>
                        <label style={S.label}>Bio</label>
                        <textarea
                            value={formData.bio}
                            onChange={(e: any) => setFormData({ ...formData, bio: e.target.value })}
                            rows={3}
                            placeholder="Tell people about yourself…"
                            style={{ width: '100%', marginTop: 6, padding: '10px 14px', borderRadius: 10, background: 'var(--chip-bg)', border: '1px solid var(--hairline-strong)', fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg)', outline: 'none', resize: 'none', boxSizing: 'border-box' }}
                        />
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                        <button onClick={onClose} style={{ flex: 1, padding: '11px', borderRadius: 10, background: 'var(--chip-bg)', border: '1px solid var(--hairline-strong)', ...S.mono, fontSize: 12, fontWeight: 700, color: 'var(--fg-muted)', cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Cancel</button>
                        <button onClick={handleSave} disabled={uploading} style={{ flex: 1, padding: '11px', borderRadius: 10, background: 'var(--iris-violet)', border: 'none', ...S.mono, fontSize: 12, fontWeight: 700, color: '#fff', cursor: uploading ? 'wait' : 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase' as const, opacity: uploading ? 0.7 : 1 }}>
                            {uploading ? 'Saving…' : 'Save Changes'}
                        </button>
                    </div>
                </div>
                {/* Danger Zone */}
                <div style={{ borderTop: '1px solid var(--hairline)', padding: '16px 24px 24px', marginTop: 0 }}>
                    {!showDeleteConfirm ? (
                        <button
                            onClick={() => setShowDeleteConfirm(true)}
                            style={{ width: '100%', padding: '9px 0', borderRadius: 10, background: 'oklch(0.66 0.22 25/0.08)', border: '1px solid oklch(0.66 0.22 25/0.25)', color: 'var(--pnl-down)', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', transition: 'background 0.15s' }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'oklch(0.66 0.22 25/0.15)'}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'oklch(0.66 0.22 25/0.08)'}
                        >Delete Account</button>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--pnl-down)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', textAlign: 'center' }}>This will permanently delete your account and all data</p>
                            <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-muted)', textAlign: 'center' }}>Type <strong style={{ color: 'var(--fg)' }}>DELETE</strong> to confirm</p>
                            <input
                                value={deleteInput}
                                onChange={e => setDeleteInput(e.target.value)}
                                placeholder="DELETE"
                                style={{ padding: '9px 12px', borderRadius: 8, background: 'var(--chip-bg)', border: '1px solid var(--hairline-strong)', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--fg)', outline: 'none', textAlign: 'center', letterSpacing: '0.1em' }}
                                autoFocus
                            />
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={() => { setShowDeleteConfirm(false); setDeleteInput(''); }} style={{ flex: 1, padding: '9px 0', borderRadius: 8, background: 'var(--chip-bg)', border: '1px solid var(--hairline)', color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                                <button
                                    onClick={() => { if (deleteInput === 'DELETE') { onClose(); onDeleteAccount(); } }}
                                    disabled={deleteInput !== 'DELETE'}
                                    style={{ flex: 1, padding: '9px 0', borderRadius: 8, background: deleteInput === 'DELETE' ? 'var(--pnl-down)' : 'oklch(0.66 0.22 25/0.15)', border: 'none', color: deleteInput === 'DELETE' ? '#fff' : 'var(--fg-subtle)', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, cursor: deleteInput === 'DELETE' ? 'pointer' : 'default', transition: 'all 0.15s', letterSpacing: '0.06em', textTransform: 'uppercase' }}
                                >Confirm Delete</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
// ── Delete Post Confirmation Modal ───────────────────────────────────────────
const DeletePostConfirmModal = ({ isOpen, onClose, onConfirm, itemType = 'post' }: { isOpen: boolean; onClose: () => void; onConfirm: () => void; itemType?: 'post' | 'comment' }) => {
    if (!isOpen) return null;
    const label = itemType === 'comment' ? 'comment' : 'post';
    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in" onClick={onClose}>
            <div onClick={(e: any) => e.stopPropagation()} className="animate-bounce-in" style={{
                width: '100%', maxWidth: 360, background: 'var(--glass-bg-strong)',
                border: '1px solid oklch(0.66 0.22 25 / 0.35)', borderRadius: 20,
                overflow: 'hidden', boxShadow: 'var(--glass-shadow)', backdropFilter: 'blur(32px)',
            }}>
                <div style={{ height: 3, background: 'oklch(0.66 0.22 25)', opacity: 0.7 }} />
                <div style={{ padding: '24px 24px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'oklch(0.66 0.22 25 / 0.12)', border: '1px solid oklch(0.66 0.22 25 / 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Trash2 size={18} style={{ color: 'var(--pnl-down)' }} />
                        </div>
                        <div>
                            <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 18, color: 'var(--fg)', letterSpacing: '-0.02em', lineHeight: 1.2 }}>Delete {label}?</div>
                            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--fg-muted)', marginTop: 4 }}>This action cannot be undone.</div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                        <button onClick={onClose} style={{ flex: 1, padding: '11px', borderRadius: 10, background: 'var(--chip-bg)', border: '1px solid var(--hairline-strong)', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--fg-muted)', cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Cancel</button>
                        <button onClick={() => { onConfirm(); onClose(); }} style={{ flex: 1, padding: '11px', borderRadius: 10, background: 'var(--pnl-down)', border: 'none', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Delete</button>
                    </div>
                </div>
            </div>
        </div>
    );
};


const UsersListModal = ({ isOpen, onClose, title, userIds, traders, onViewProfile }: any) => {
    const [fetchedUsers, setFetchedUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!isOpen || !userIds || userIds.length === 0) {
            setFetchedUsers([]);
            return;
        }
        // First try to resolve from in-memory traders list
        const fromTraders = traders.filter((t: any) => userIds.includes(t.id));
        if (fromTraders.length === userIds.length) {
            setFetchedUsers(fromTraders);
            return;
        }
        // Otherwise fetch from Supabase for any missing IDs
        setLoading(true);
        (async () => {
            try {
                const { data } = await supabase.from('profiles').select('id, username, handle, avatar_url').in('id', userIds);
                if (data && data.length > 0) {
                    setFetchedUsers(data.map((p: any) => ({
                        id: p.id,
                        username: p.username || 'Trader',
                        handle: p.handle || `@${p.username}`,
                        avatar: p.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.username}`,
                    })));
                } else {
                    setFetchedUsers(fromTraders);
                }
            } catch (_) {
                setFetchedUsers(fromTraders);
            } finally {
                setLoading(false);
            }
        })();
    }, [isOpen, userIds, traders]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in" onClick={onClose}>
            <GlassCard className="w-full max-w-md max-h-[60vh] flex flex-col" onClick={(e: any) => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4 border-b border-gray-200 dark:border-white/5 pb-2">
                    <h3 className="font-bold text-gray-900 dark:text-white">{title}</h3>
                    <button onClick={onClose}><X size={20}/></button>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2">
                    {loading ? (
                        <p className="text-gray-500 text-center py-4">Loading...</p>
                    ) : fetchedUsers.length === 0 ? (
                        <p className="text-gray-500 text-center py-4">No users found.</p>
                    ) : fetchedUsers.map((u: any) => (
                        <div key={u.id} className="flex items-center justify-between p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg cursor-pointer" onClick={() => { onViewProfile(u); onClose(); }}>
                            <div className="flex items-center gap-3">
                                <img src={u.avatar || u.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.username}`} className="w-8 h-8 rounded-full"/>
                                <div>
                                    <span className="font-bold text-gray-900 dark:text-white text-sm block">{u.username}</span>
                                    <span className="text-gray-500 text-xs">{u.handle}</span>
                                </div>
                            </div>
                            <ArrowRightLeft size={14} className="text-gray-400"/>
                        </div>
                    ))}
                </div>
            </GlassCard>
        </div>
    );
};
// ── Profile Avatar Popup (navbar click) ──────────────────────────────────────
const ProfileAvatarPopup = ({ user, onClose, onViewProfile, onCreatePost, onLogout, onOpenSettings, onNavigateDashboard, totalEquity, anchorRef }: any) => {
    const [pos, setPos] = React.useState<{ top: number; right: number } | null>(null);
    const [copied, setCopied] = React.useState(false);

    React.useEffect(() => {
        const update = () => {
            const rect = anchorRef.current?.getBoundingClientRect();
            if (rect) setPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
        };
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, [anchorRef]);

    if (!pos || !user) return null;

    const shortAddr = user.walletAddress
        ? `${user.walletAddress.slice(0, 8)}…${user.walletAddress.slice(-6)}`
        : null;

    const copyAddress = async () => {
        if (!user.walletAddress) return;
        await navigator.clipboard.writeText(user.walletAddress).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    const S = {
        mono:  { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1' } as React.CSSProperties,
        label: { fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)' } as React.CSSProperties,
    };

    return createPortal(
        <>
            {/* backdrop */}
            <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={onClose} />
            <div style={{
                position: 'fixed', top: pos.top, right: pos.right, zIndex: 9999,
                width: 260, background: 'var(--bg-base-2)', border: '1px solid var(--hairline-strong)',
                borderRadius: 16, boxShadow: '0 16px 40px rgba(0,0,0,0.4)', overflow: 'hidden',
            }}>
                {/* Holo accent */}
                <div style={{ height: 2, background: 'var(--holo-linear)', backgroundSize: '220% 100%', animation: 'holoSlide 9s linear infinite' }} />

                {/* User identity card */}
                <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--hairline)' }}>
                    <img src={user.avatar} style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid var(--hairline-strong)', objectFit: 'cover', flexShrink: 0 }} alt="" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 14, color: 'var(--fg)', letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.username}</div>
                        <div style={{ ...S.label, fontSize: 9, marginTop: 1 }}>{user.handle}</div>
                    </div>
                </div>

                {/* Equity display */}
                <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--hairline)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={S.label}>Total Equity</span>
                    <span style={{ ...S.mono, fontSize: 13, fontWeight: 700, color: 'var(--iris-violet)' }}>${(totalEquity || user.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>

                {/* Wallet address */}
                {shortAddr && (
                    <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--hairline)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ ...S.mono, fontSize: 11, color: 'var(--fg-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shortAddr}</span>
                            <button onClick={copyAddress} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--hairline)', background: copied ? 'oklch(0.78 0.18 150/0.1)' : 'var(--chip-bg)', cursor: 'pointer', ...S.mono, fontSize: 10, fontWeight: 700, color: copied ? 'var(--pnl-up)' : 'var(--fg-subtle)', transition: 'all 0.15s' }}>
                                {copied ? <Check size={11} /> : <Copy size={11} />}
                                {copied ? 'Copied!' : 'Copy'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Quick actions
                    NOTE: previously had an "Open Wallet" item that opened the
                    Reown AppKit modal. We removed it because the Reown modal
                    only knows about the connected MAIN wallet — it has no
                    concept of the derived burner, where 99% of the user's
                    mUSDC actually lives. Users would see $0 in Reown even
                    when their trading wallet held $1,000, then panic. The
                    Velo Wallet & Settings modal shows BOTH wallets with
                    correct balances and is the only correct destination. */}
                <div style={{ padding: '6px 8px' }}>
                    {[
                        { icon: <LayoutDashboard size={14} />, label: 'Dashboard', onClick: () => { onNavigateDashboard?.(); onClose(); } },
                        { icon: <PlusCircle size={14} />, label: 'Create a Post', onClick: () => { onCreatePost(); onClose(); } },
                        { icon: <UserCircle size={14} />, label: 'View Profile', onClick: () => { onViewProfile(); onClose(); } },
                        { icon: <Wallet size={14} />, label: 'Wallet & Settings', onClick: () => { onOpenSettings?.(); onClose(); } },
                    ].map((item, i) => (
                        <button key={i} onClick={item.onClick} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 10, border: 'none', background: 'transparent', cursor: 'pointer', ...S.mono, fontSize: 12, fontWeight: 700, color: 'var(--fg)', textAlign: 'left', letterSpacing: '0.04em', transition: 'background 0.1s' }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--chip-bg)'}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                            <span style={{ color: 'var(--fg-muted)' }}>{item.icon}</span>
                            {item.label}
                        </button>
                    ))}
                    {/* Logout */}
                    <button onClick={() => { onLogout(); onClose(); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 10, border: 'none', background: 'transparent', cursor: 'pointer', ...S.mono, fontSize: 12, fontWeight: 700, color: 'var(--pnl-down)', textAlign: 'left', letterSpacing: '0.04em', transition: 'background 0.1s' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'oklch(0.66 0.22 25/0.08)'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                        <LogOut size={14} /> Sign Out
                    </button>
                </div>
            </div>
        </>,
        document.body
    );
};

const Navbar = ({ activeTab, setActiveTab, toggleTheme, theme, handleLogout, user, onRequireAuth, unreadCount, setMobileMenuOpen, notifications, onNotificationClick, isNotifOpen, setNotifOpen, totalEquity, onCreatePost, onOpenSettings, isContractOwner, anyModalOpen, onSocialClick }: any) => {
    const navItems = [
        { id: TabView.DASHBOARD, icon: LayoutDashboard, label: 'Dashboard', requiresAuth: true },
        { id: TabView.TRADE, icon: TrendingUp, label: 'Trade', requiresAuth: false },
        { id: TabView.MARKETS, icon: BarChart2, label: 'Markets', requiresAuth: false },
        { id: TabView.SOCIAL, icon: Users, label: 'Social', requiresAuth: false },
        { id: TabView.LEADERBOARD, icon: Trophy, label: 'Leaderboard', requiresAuth: false },
        ...(isContractOwner ? [{ id: TabView.ADMIN, icon: Shield, label: 'Admin', requiresAuth: false }] : []),
    ].filter(item => !item.requiresAuth || user);
    const [avatarPopupOpen, setAvatarPopupOpen] = React.useState(false);
    const avatarBtnRef = React.useRef<HTMLButtonElement>(null);
    const S = {
        mono: { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1' },
        label: { fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.14em' },
    };
    return (
        <nav
            style={{
                position: 'fixed',
                top: 'var(--nav-top, 4px)',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 30,
                width: 'min(1600px, calc(100% - 24px))',
                padding: '0 14px',
                height: 60,
                display: 'grid',
                gridTemplateColumns: 'auto 1fr auto',
                alignItems: 'center',
                gap: 14,
                border: '1px solid var(--hairline)',
                borderRadius: 18,
                background: 'var(--glass-bg)',
                backdropFilter: 'blur(8px) saturate(1.1)',
                WebkitBackdropFilter: 'blur(8px) saturate(1.1)',
                boxShadow: 'var(--glass-shadow)',
            }}
            className="navbar-container navbar-mobile-flush"
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <button
                    className="lg:hidden"
                    style={{
                        width: 44,
                        height: 44,
                        borderRadius: 14,
                        border: '1px solid var(--hr)',
                        background: 'var(--chip)',
                        cursor: 'pointer',
                        color: 'var(--fg-2)',
                        display: 'grid',
                        placeItems: 'center',
                        touchAction: 'manipulation',
                        WebkitTapHighlightColor: 'transparent',
                    }}
                    onClick={() => setMobileMenuOpen(true)}
                >
                    <Menu size={20} />
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', minWidth: 0 }} onClick={() => user && setActiveTab(TabView.DASHBOARD)}>
                    <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 28, color: 'var(--fg)', letterSpacing: '-0.04em', lineHeight: 1 }}>Velo</span>
                </div>
            </div>

            <div className="hidden lg:flex" style={{ justifyContent: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 4, borderRadius: 14, background: 'var(--chip)', border: '1px solid var(--hr)', minWidth: 'fit-content' }}>
                {navItems.map((item: any) => {
                    const isActive = activeTab === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => item.id === TabView.SOCIAL && onSocialClick ? onSocialClick() : setActiveTab(item.id)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 7,
                                padding: '8px 14px',
                                borderRadius: 10,
                                border: 'none',
                                cursor: 'pointer',
                                background: isActive ? 'var(--bg)' : 'transparent',
                                color: isActive ? 'var(--fg)' : 'var(--fg-2)',
                                boxShadow: isActive ? '0 1px 0 var(--hr-2) inset, 0 -1px 0 rgba(0,0,0,0.18) inset' : 'none',
                                transition: 'all 0.12s',
                                ...S.label,
                            }}
                        >
                            <item.icon size={12} strokeWidth={isActive ? 2.4 : 2} />
                            {item.label}
                        </button>
                    )
                })}
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifySelf: 'end' }}>
                <div className="hidden lg:flex chip" style={{ minWidth: 76, justifyContent: 'center', gap: 6 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', color: 'var(--fg-2)' }}>TESTNET</span>
                </div>
                <div style={{ position: 'relative' }}>
                    <button onClick={() => setNotifOpen(!isNotifOpen)} className="navbar-icon-btn" style={{ display: 'grid', placeItems: 'center', width: 44, height: 44, borderRadius: 14, border: '1px solid var(--hr)', cursor: 'pointer', background: 'var(--chip)', color: 'var(--fg-2)', position: 'relative', transition: 'all 0.12s', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' } as any}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--chip-h)')} onMouseLeave={e => (e.currentTarget.style.background = 'var(--chip)')}>
                        <Bell size={18}/>
                        {unreadCount > 0 && <span style={{ position: 'absolute', top: 8, right: 8, width: 6, height: 6, background: 'var(--pnl-down)', borderRadius: '50%', border: '1.5px solid var(--bg)' }}/>}
                    </button>
                    {isNotifOpen && (
                        <>
                            <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setNotifOpen(false)}/>
                            <div style={{
                                position: 'fixed', right: 12, top: 76,
                                width: 'min(360px, calc(100vw - 24px))',
                                background: 'var(--bg)',
                                border: '1px solid var(--hr-2)',
                                borderRadius: 20,
                                boxShadow: '0 0 0 1px color-mix(in oklab, var(--velo-violet) 14%, transparent), 0 32px 72px -16px rgba(0,0,0,0.55), 0 8px 24px -8px rgba(0,0,0,0.3)',
                                zIndex: 9999,
                                overflow: 'hidden',
                                backdropFilter: 'blur(0px)',
                                WebkitBackdropFilter: 'blur(0px)',
                            }}>
                                {/* Header */}
                                <div style={{
                                    padding: '14px 18px 12px',
                                    borderBottom: '1px solid var(--hr)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    background: 'color-mix(in oklab, var(--velo-violet) 8%, var(--bg))',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 17, letterSpacing: '-0.03em', color: 'var(--fg)', lineHeight: 1 }}>Notifications</span>
                                        {unreadCount > 0 && (
                                            <span style={{
                                                fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
                                                letterSpacing: '0.06em', padding: '2px 6px',
                                                borderRadius: 999, background: 'var(--velo-violet)',
                                                color: '#fff', lineHeight: 1.4,
                                            }}>{unreadCount}</span>
                                        )}
                                    </div>
                                    {notifications.length > 0 && (
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--fg-3)' }}>
                                            {notifications.length} total
                                        </span>
                                    )}
                                </div>
                                {/* List */}
                                <div className="custom-scrollbar" style={{ maxHeight: 400, overflowY: 'auto' }}>
                                    {notifications.length === 0 ? (
                                        <div style={{ padding: '32px 18px', textAlign: 'center' }}>
                                            <Bell size={22} style={{ color: 'var(--fg-3)', margin: '0 auto 10px', display: 'block', opacity: 0.4 }}/>
                                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-3)', margin: 0 }}>No notifications yet</p>
                                        </div>
                                    ) : (
                                        [...notifications].sort((a: any, b: any) => b.timestamp - a.timestamp).map((n: any, i: number) => {
                                            const d = new Date(n.timestamp);
                                            const now = new Date();
                                            const isToday = d.toDateString() === now.toDateString();
                                            const isYesterday = d.toDateString() === new Date(now.getTime() - 86400000).toDateString();
                                            const dateLabel = isToday ? 'Today' : isYesterday ? 'Yesterday' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
                                            const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                                            const type: string = n.type || '';
                                            const iconColor =
                                                type === 'TAKE_PROFIT' ? 'var(--pnl-up)' :
                                                type === 'STOP_LOSS' || type === 'LIQUIDATION' ? 'var(--pnl-down)' :
                                                type === 'DEPOSIT' || type === 'RECEIVE' ? 'var(--pnl-up)' :
                                                type === 'WITHDRAW' || type === 'SEND' ? 'var(--amber)' :
                                                type === 'POSITION_CLOSED' ? 'var(--velo-blue-ice)' :
                                                type === 'LIKE' || type === 'FOLLOW' || type === 'REPOST' ? 'var(--velo-mauve)' :
                                                'var(--fg-3)';
                                            const dotChar =
                                                type === 'TAKE_PROFIT' ? '↑' :
                                                type === 'STOP_LOSS' ? '↓' :
                                                type === 'LIQUIDATION' ? '⚡' :
                                                type === 'DEPOSIT' ? '↙' :
                                                type === 'WITHDRAW' ? '↗' :
                                                type === 'POSITION_CLOSED' ? '✕' :
                                                type === 'LIKE' ? '♥' :
                                                type === 'FOLLOW' ? '+' :
                                                '·';
                                            return (
                                                <div
                                                    key={n.id}
                                                    onClick={() => { onNotificationClick(n); setNotifOpen(false); }}
                                                    style={{
                                                        padding: '11px 18px',
                                                        borderBottom: i < notifications.length - 1 ? '1px solid var(--hr)' : 'none',
                                                        cursor: 'pointer',
                                                        background: !n.read ? 'color-mix(in oklab, var(--velo-violet) 8%, transparent)' : 'transparent',
                                                        transition: 'background 0.12s',
                                                        display: 'flex',
                                                        gap: 11,
                                                        alignItems: 'flex-start',
                                                    }}
                                                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--chip-h)')}
                                                    onMouseLeave={e => (e.currentTarget.style.background = !n.read ? 'color-mix(in oklab, var(--velo-violet) 8%, transparent)' : 'transparent')}
                                                >
                                                    {/* Type indicator dot */}
                                                    <div style={{
                                                        width: 28, height: 28, borderRadius: 9, flexShrink: 0,
                                                        background: 'color-mix(in oklab, ' + iconColor + ' 14%, var(--chip))',
                                                        border: '1px solid color-mix(in oklab, ' + iconColor + ' 28%, transparent)',
                                                        display: 'grid', placeItems: 'center',
                                                        fontFamily: 'var(--font-mono)', fontSize: 12, color: iconColor,
                                                        marginTop: 1,
                                                    }}>{dotChar}</div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <p style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 400, color: 'var(--fg)', margin: '0 0 4px', lineHeight: 1.4, letterSpacing: '-0.01em' }}>{n.message}</p>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.02em' }}>{dateLabel}</span>
                                                            <span style={{ width: 2, height: 2, borderRadius: '50%', background: 'var(--fg-3)', opacity: 0.4, flexShrink: 0 }}/>
                                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.02em' }}>{timeStr}</span>
                                                        </div>
                                                    </div>
                                                    {!n.read && (
                                                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--velo-violet)', flexShrink: 0, marginTop: 6, boxShadow: '0 0 6px 1px color-mix(in oklab, var(--velo-violet) 60%, transparent)' }}/>
                                                    )}
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <button onClick={toggleTheme} style={{ display: 'grid', placeItems: 'center', width: 44, height: 44, borderRadius: 14, border: '1px solid var(--hr)', cursor: 'pointer', background: 'var(--chip)', color: 'var(--fg-2)', transition: 'all 0.12s', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' } as any}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--chip-h)')} onMouseLeave={e => (e.currentTarget.style.background = 'var(--chip)')}>
                    {theme === 'dark' ? <Sun size={16}/> : <Moon size={16}/>}
                </button>

                {user ? (
                    <div ref={avatarBtnRef as any} style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 2 }}>
                        {/* Desktop: pill with name + avatar */}
                        <button
                            onClick={() => setAvatarPopupOpen(prev => !prev)}
                            className="hidden lg:flex"
                            style={{ alignItems: 'center', gap: 10, padding: '5px 6px 5px 12px', borderRadius: 999, background: 'var(--chip)', border: `1px solid ${avatarPopupOpen ? 'var(--velo-violet)' : 'var(--hr)'}`, cursor: 'pointer', transition: 'border-color 0.15s' }}
                            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--velo-violet)')}
                            onMouseLeave={e => { if (!avatarPopupOpen) e.currentTarget.style.borderColor = 'var(--hr)'; }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                                <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 14, letterSpacing: '-0.03em', color: 'var(--fg)', lineHeight: 1 }}>{user.username}</span>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontFeatureSettings: '"tnum" 1', fontWeight: 700, color: 'var(--pnl-up)', lineHeight: 1 }}>${formatMoney(totalEquity > 0 ? totalEquity : user.balance)}</span>
                            </div>
                            <img src={user.avatar} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--hr-2)' }} />
                        </button>
                        {/* Mobile: square avatar button */}
                        <button
                            className="lg:hidden"
                            onClick={() => setAvatarPopupOpen(prev => !prev)}
                            style={{ width: 44, height: 44, borderRadius: 14, overflow: 'hidden', border: `1px solid ${avatarPopupOpen ? 'var(--velo-violet)' : 'var(--hr)'}`, flexShrink: 0, background: 'var(--chip)', padding: 0, cursor: 'pointer', transition: 'border-color 0.15s', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' } as any}>
                            <img src={user.avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                        </button>
                        {avatarPopupOpen && (
                            <ProfileAvatarPopup
                                user={user}
                                totalEquity={totalEquity}
                                anchorRef={avatarBtnRef}
                                onClose={() => setAvatarPopupOpen(false)}
                                onViewProfile={() => setActiveTab(TabView.PROFILE)}
                                onNavigateDashboard={() => setActiveTab(TabView.DASHBOARD)}
                                onCreatePost={() => { onCreatePost(); }}
                                onOpenSettings={onOpenSettings}
                                onLogout={handleLogout}
                            />
                        )}
                    </div>
                ) : (
                    <WalletConnectButton compact={true} onOpenAuthModal={onRequireAuth} onOpenSettings={onOpenSettings} />
                )}
            </div>
        </nav>
    );
}
const MobileSidebar = ({ isOpen, activeTab, setActiveTab, toggleTheme, theme, setSidebarOpen, handleLogout, user, onRequireAuth, unreadCount, totalEquity, buyingPower, isContractOwner, onSocialClick }: any) => {
    const navItems = [
        { id: TabView.DASHBOARD, icon: LayoutDashboard, label: 'Dashboard', requiresAuth: true },
        { id: TabView.TRADE,     icon: TrendingUp,      label: 'Trade',     requiresAuth: false },
        { id: TabView.MARKETS,   icon: BarChart2,        label: 'Markets',   requiresAuth: false },
        { id: TabView.SOCIAL,    icon: Users,            label: 'Social',    requiresAuth: false },
        { id: TabView.LEADERBOARD, icon: Trophy,         label: 'Leaderboard', requiresAuth: false },
        { id: TabView.PROFILE,   icon: UserCircle,       label: 'Profile',   requiresAuth: true },
        ...(isContractOwner ? [{ id: TabView.ADMIN, icon: Shield, label: 'Admin', requiresAuth: false }] : []),
    ].filter(item => !item.requiresAuth || user);

    const S = {
        mono:    { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1', fontVariantNumeric: 'tabular-nums' as const },
        display: { fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' },
        label:   { fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)' },
    };

    return (
        <>
            <div
                style={{ position: 'fixed', inset: 0, background: 'rgba(5,6,8,0.45)', backdropFilter: 'blur(4px)', zIndex: 60, transition: 'opacity 0.25s', opacity: isOpen ? 1 : 0, pointerEvents: isOpen ? 'auto' : 'none' }}
                onClick={() => setSidebarOpen(false)}
            />

            <div style={{
                position: 'fixed', inset: '0 auto 0 0', width: 292,
                background: 'var(--glass-2)', borderRight: '1px solid var(--hr)',
                zIndex: 70, display: 'flex', flexDirection: 'column',
                transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
                transition: 'transform 0.28s cubic-bezier(0.22,1,0.36,1)',
                boxShadow: '12px 0 40px rgba(0,0,0,0.25)',
                backdropFilter: 'blur(40px) saturate(1.6)',
                WebkitBackdropFilter: 'blur(40px) saturate(1.6)',
            }}>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', paddingTop: 'env(safe-area-inset-top, 0px)', height: 'calc(60px + env(safe-area-inset-top, 0px))', borderBottom: '1px solid var(--hr)', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ ...S.display, fontStyle: 'italic', fontSize: 24, color: 'var(--fg)', letterSpacing: '-0.04em' }}>Velo</span>
                    </div>
                    <button onClick={() => setSidebarOpen(false)} style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 12, border: '1px solid var(--hr)', background: 'var(--chip)', cursor: 'pointer', color: 'var(--fg-2)' }}>
                        <X size={15}/>
                    </button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '14px 12px 0' }}>
                    {navItems.map(item => {
                        const isActive = activeTab === item.id;
                        return (
                            <button key={item.id}
                                onClick={() => { if (item.id === TabView.SOCIAL && onSocialClick) { onSocialClick(); setSidebarOpen(false); } else { setActiveTab(item.id); setSidebarOpen(false); } }}
                                style={{
                                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '12px 14px', borderRadius: 14, border: '1px solid transparent', cursor: 'pointer',
                                    marginBottom: 2,
                                    background: isActive ? 'var(--prism-vivid)' : 'transparent',
                                    color: isActive ? 'var(--velo-bone)' : 'var(--fg-2)',
                                    fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
                                    letterSpacing: '0.12em', textTransform: 'uppercase' as const,
                                    transition: 'background 0.12s, color 0.12s, border-color 0.12s',
                                    backgroundSize: isActive ? '200% 100%' : undefined,
                                    animation: isActive ? 'prismSlide 14s linear infinite' : undefined,
                                    borderColor: isActive ? 'transparent' : 'var(--hr)',
                                }}
                                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--chip)'; }}
                                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                            >
                                <item.icon size={15} strokeWidth={isActive ? 2.5 : 2}/>
                                {item.label}
                            </button>
                        );
                    })}
                </div>
                <div style={{ padding: 14, borderTop: '1px solid var(--hr)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {user ? (
                        <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'var(--chip)', borderRadius: 16, border: '1px solid var(--hr)' }}>
                                <img src={user.avatar} style={{ width: 38, height: 38, borderRadius: '50%', border: '1px solid var(--hr-2)', flexShrink: 0, objectFit: 'cover' }} alt=""/>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ ...S.display, fontSize: 16, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{user.username}</div>
                                    <div style={{ ...S.label, fontSize: 9, marginTop: 2, color: 'var(--fg-2)' }}>{user.handle}</div>
                                </div>
                                <div style={{ padding: '2px 8px', borderRadius: 6, background: 'var(--chip)', border: '1px solid var(--hr)', fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--fg-2)' }}>TESTNET</div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                <div style={{ padding: '12px', background: 'var(--chip)', borderRadius: 14, border: '1px solid var(--hr)' }}>
                                    <div style={{ ...S.label, marginBottom: 4 }}>Total Equity</div>
                                    <div style={{ ...S.mono, fontSize: 13, fontWeight: 700, color: 'var(--fg)' }}>
                                        ${formatMoney(totalEquity > 0 ? totalEquity : user.balance)}
                                    </div>
                                </div>
                                <div style={{ padding: '12px', background: 'var(--chip)', borderRadius: 14, border: '1px solid var(--hr)' }}>
                                    <div style={{ ...S.label, marginBottom: 4 }}>Buying Power</div>
                                    <div style={{ ...S.mono, fontSize: 13, fontWeight: 700, color: 'var(--iris-violet)' }}>
                                        ${formatMoney(buyingPower ?? user.balance)}
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={toggleTheme} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flex: 1, padding: '11px 0', borderRadius: 14, border: '1px solid var(--hr)', background: 'var(--chip)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--fg-2)', letterSpacing: '0.1em', transition: 'background 0.1s' }}
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--chip-h)'}
                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--chip)'}>
                                    {theme === 'dark' ? <Sun size={13}/> : <Moon size={13}/>}
                                    {theme === 'dark' ? 'Light' : 'Dark'}
                                </button>
                                <button onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flex: 1, padding: '11px 0', borderRadius: 14, border: '1px solid color-mix(in oklab, var(--pnl-down) 30%, transparent)', background: 'color-mix(in oklab, var(--pnl-down) 12%, transparent)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--pnl-down)', letterSpacing: '0.1em', transition: 'background 0.1s' }}
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'oklch(0.66 0.22 25/0.16)'}
                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'color-mix(in oklab, var(--pnl-down) 12%, transparent)'}>
                                    <LogOut size={13}/> Logout
                                </button>
                            </div>
                        </>
                    ) : (
                        <button onClick={() => { onRequireAuth(); setSidebarOpen(false); }} style={{ width: '100%', padding: '12px', borderRadius: 14, border: 'none', background: 'var(--prism-vivid)', backgroundSize: '200% 100%', animation: 'prismSlide 14s linear infinite', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--velo-bone)', letterSpacing: '0.12em', textTransform: 'uppercase' as const }}>
                            Connect
                        </button>
                    )}
                </div>
            </div>
        </>
    );
};
const MobileBottomNav = ({ activeTab, setActiveTab, user, onSocialClick }: any) => {
    const items = [
        { id: TabView.DASHBOARD, icon: LayoutDashboard, label: 'Home', requiresAuth: true },
        { id: TabView.TRADE, icon: TrendingUp, label: 'Trade', requiresAuth: false },
        { id: TabView.MARKETS, icon: BarChart2, label: 'Mkts', requiresAuth: false },
        { id: TabView.SOCIAL, icon: MessageSquare, label: 'Social', requiresAuth: false },
        { id: TabView.LEADERBOARD, icon: Trophy, label: 'Lead', requiresAuth: false },
    ].filter(item => !item.requiresAuth || user);
    return (
        <div className="lg:hidden fixed left-2 right-2 z-[60]" style={{ bottom: 'max(10px, env(safe-area-inset-bottom, 10px))' }}>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`, gap: 4, padding: '6px 6px', borderRadius: 26, background: 'var(--glass-bg-strong)', border: '1px solid var(--hairline-strong)', boxShadow: 'var(--glass-shadow)', backdropFilter: 'blur(28px) saturate(1.3)', WebkitBackdropFilter: 'blur(28px) saturate(1.3)' }}>
                {items.map((item) => {
                    const isActive = activeTab === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => item.id === TabView.SOCIAL && onSocialClick ? onSocialClick() : setActiveTab(item.id)}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 5,
                                minHeight: 62,
                                padding: '8px 4px',
                                borderRadius: 20,
                                border: 'none',
                                cursor: 'pointer',
                                background: isActive ? 'var(--bg)' : 'transparent',
                                color: isActive ? 'var(--velo-violet)' : 'var(--fg-3)',
                                boxShadow: isActive ? '0 1px 0 var(--hr-2) inset, 0 -1px 0 rgba(0,0,0,0.18) inset' : 'none',
                                touchAction: 'manipulation',
                                WebkitTapHighlightColor: 'transparent',
                                userSelect: 'none',
                                WebkitUserSelect: 'none',
                                outline: 'none',
                                transition: 'background 0.15s, color 0.15s',
                            }}
                        >
                            <item.icon size={22} strokeWidth={isActive ? 2.4 : 1.8} />
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{item.label}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
const S_LB = {
    mono:    { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1', fontVariantNumeric: 'tabular-nums' as const },
    display: { fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' },
    label:   { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)' as const },
};
const podiumGolds = [
    // #1 — gold: use token-based glass with gold tint
    'var(--podium-gold-bg, var(--glass-bg-strong))',
    // #2 — silver: token-based glass with silver tint
    'var(--podium-silver-bg, var(--glass-bg-strong))',
    // #3 — bronze: token-based glass with bronze tint
    'var(--podium-bronze-bg, var(--glass-bg-strong))',
];
const podiumBorders = [
    'var(--podium-gold-border)',   // gold
    'var(--podium-silver-border)', // silver
    'var(--podium-bronze-border)', // bronze
];
const podiumAccents = [
    'var(--podium-gold-text)',   // gold text
    'var(--podium-silver-text)', // silver text
    'var(--podium-bronze-text)', // bronze text
];
const LeaderboardView = ({ traders, user, walletAddress, handleFollow, handleCopyTrade, handleViewProfile }: any) => {
    const [period, setPeriod] = React.useState<'24H' | '7D' | '30D' | 'ALL'>('ALL');
    const [isMobile, setIsMobile] = React.useState(window.innerWidth < 640);
    React.useEffect(() => {
        const handler = () => setIsMobile(window.innerWidth < 640);
        window.addEventListener('resize', handler);
        return () => window.removeEventListener('resize', handler);
    }, []);
    // Leaderboard rules (build 79+):
    //   1. Wallet-only — every trader on the leaderboard must have a wallet_address
    //      in their profile. Demo (email-only) users are excluded entirely so
    //      the rankings reflect verifiable on-chain PnL.
    //   2. The current user is included if AND ONLY IF they themselves have a
    //      wallet connected (wallet_address may not yet be set in the trader
    //      object for the current session, so we check `walletAddress` prop).
    //   3. Exclude placeholder accounts (default username "Trader").
    //   4. Require evidence of activity — non-zero PnL or a follower — to filter
    //      out stale test accounts.
    //   5. Sort by realized PnL desc.
    const sortedTraders = [...traders]
        .filter((t: any) => {
            if (!t || !t.id) return false;
            if (!t.username || t.username === 'Trader') return false;
            // Current user — always show if logged in
            if (user && t.id === user.id) return true;
            // Other traders — show if they have any activity (wallet address not required
            // since some users may not have it persisted yet)
            const hasActivity = (t.pnl ?? 0) !== 0 || (t.followers?.length ?? 0) > 0;
            return hasActivity;
        })
        .sort((a: any, b: any) => (b.pnl ?? 0) - (a.pnl ?? 0));
    const panel: React.CSSProperties = { background: 'var(--glass-bg)', border: '1px solid var(--hairline)', borderRadius: 16, backdropFilter: 'blur(8px) saturate(1.1)', WebkitBackdropFilter: 'blur(8px) saturate(1.1)', boxShadow: 'var(--glass-shadow)', overflow: 'hidden' };
    return (
        <div style={{ width: '100%', maxWidth: 1600, margin: '0 auto', paddingBottom: isMobile ? 'max(100px, calc(env(safe-area-inset-bottom, 0px) + 100px))' : 80 }} className="animate-fade-in lb-view">
            {/* Hero header */}
            <div style={{ textAlign: 'center', marginBottom: 40 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 14px', borderRadius: 999, background: 'var(--chip-bg)', border: '1px solid var(--hairline)', marginBottom: 16 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--pnl-up)', display: 'inline-block', boxShadow: '0 0 6px var(--pnl-up)' }} />
                    <span style={{ ...S_LB.label, fontSize: 11, color: 'var(--fg-subtle)' }}>{period} · ALL PAIRS</span>
                </div>
                <h1 className="lb-hero-title" style={{ fontFamily: 'var(--font-display)', fontSize: 72, fontWeight: 400, letterSpacing: '-0.02em', color: 'var(--fg)', lineHeight: 1, margin: '0 0 12px' }}>
                    Top <em style={{ fontStyle: 'italic' }}>Traders</em>
                </h1>
                <p style={{ ...S_LB.mono, fontSize: 14, color: 'var(--fg-muted)' }}>Copy the most profitable traders on Velo.</p>
                <div style={{ display: 'inline-flex', gap: 4, marginTop: 16, background: 'var(--chip-bg)', borderRadius: 10, padding: 4, border: '1px solid var(--hairline)' }}>
                    {(['24H','7D','30D','ALL'] as const).map((p) => (
                        <button key={p} onClick={() => setPeriod(p)} style={{ padding: '5px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', ...S_LB.mono, fontSize: 11, fontWeight: 700, background: period === p ? 'var(--bg-base-2)' : 'transparent', color: period === p ? 'var(--fg)' : 'var(--fg-subtle)', boxShadow: period === p ? '0 1px 4px rgba(0,0,0,0.3)' : 'none' }}>{p}</button>
                    ))}
                </div>
            </div>

            {/* Podium top 3 */}
            {isMobile ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                    {/* #1 full width */}
                    {[0, 1, 2].map((idx) => {
                        const trader = sortedTraders[idx];
                        if (!trader) return null;
                        const rank = idx + 1;
                        const isSelf = user && trader.id === user.id;
                        const accentColor = podiumAccents[idx];
                        const winRateDisplay = Number.isFinite(trader.winRate) ? `${parseFloat(trader.winRate.toFixed(1))}%` : '—';
                        return (
                            <div key={trader.id} onClick={() => handleViewProfile(trader)} style={{
                                background: isSelf ? 'color-mix(in oklab, var(--iris-violet) 18%, var(--bg-base-2))' : podiumGolds[idx],
                                border: isSelf ? '1px solid oklch(0.68 0.22 295 / 0.5)' : podiumBorders[idx],
                                borderRadius: 16,
                                backdropFilter: 'blur(8px) saturate(1.1)', WebkitBackdropFilter: 'blur(8px) saturate(1.1)',
                                padding: '14px 16px',
                                display: 'flex', alignItems: 'center', gap: 14,
                                position: 'relative', overflow: 'hidden', cursor: 'pointer',
                            }}>
                                <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontFamily: 'var(--font-display)', fontSize: 72, fontWeight: 400, color: accentColor, opacity: 0.1, lineHeight: 1, userSelect: 'none' as const, pointerEvents: 'none' }}>{rank}</span>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: accentColor, letterSpacing: '0.08em', width: 22, flexShrink: 0 }}>#{rank}</span>
                                <div style={{ position: 'relative', width: 44, height: 44, borderRadius: '50%', overflow: 'hidden', border: `2px solid ${accentColor}`, flexShrink: 0 }}>
                                    <img src={trader.avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                        <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', letterSpacing: '-0.02em', fontSize: 15, color: 'var(--fg)' }}>{trader.username}</span>
                                        {isSelf && <span style={{ padding: '1px 5px', borderRadius: 4, background: 'var(--iris-violet)', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: 7, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>You</span>}
                                    </div>
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--fg-subtle)' }}>{trader.handle}</span>
                                </div>
                                <div style={{ textAlign: 'right' as const, flexShrink: 0 }}>
                                    <p style={{ fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1', fontSize: 14, fontWeight: 700, color: trader.pnl >= 0 ? 'var(--pnl-up)' : 'var(--pnl-down)', marginBottom: 2 }}>{trader.pnl >= 0 ? '+' : '-'}${formatMoney(Math.abs(trader.pnl))}</p>
                                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-subtle)' }}>{winRateDisplay} WR</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
            <div className="lb-podium" style={{ display: 'grid', gap: 14, marginBottom: 18, alignItems: 'end' }}>
                {[1, 0, 2].map((idx) => {
                    const trader = sortedTraders[idx];
                    if (!trader) return <div key={idx} />;
                    const rank = idx + 1;
                    const isFirst = idx === 0;
                    const isSelf = user && trader.id === user.id;
                    const accentColor = podiumAccents[idx];
                    const winRateDisplay = Number.isFinite(trader.winRate) ? `${parseFloat(trader.winRate.toFixed(1))}%` : '—';
                    return (
                        <div key={trader.id} style={{
                            background: isSelf ? 'color-mix(in oklab, var(--iris-violet) 18%, var(--bg-base-2))' : podiumGolds[idx],
                            border: isSelf ? '1px solid oklch(0.68 0.22 295 / 0.5)' : podiumBorders[idx],
                            borderRadius: 16,
                            backdropFilter: 'blur(10px) saturate(1.2)',
                            WebkitBackdropFilter: 'blur(10px) saturate(1.2)',
                            boxShadow: isFirst
                                ? '0 0 0 1px oklch(0.70 0.15 75 / 0.12) inset, 0 1px 0 rgba(255,255,255,0.08) inset, 0 32px 64px -24px rgba(0,0,0,0.7), 0 0 40px -10px oklch(0.70 0.15 75 / 0.15)'
                                : '0 1px 0 rgba(255,255,255,0.05) inset, 0 24px 48px -20px rgba(0,0,0,0.6)',
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                            padding: isFirst ? '40px 28px 28px' : '28px 24px 24px',
                            position: 'relative', overflow: 'visible',
                        }}>
                            {/* Rank watermark */}
                            <span style={{ position: 'absolute', top: isFirst ? 14 : 10, left: 16, fontFamily: 'var(--font-display)', fontSize: isFirst ? 76 : 60, fontWeight: 400, color: accentColor, opacity: 0.18, lineHeight: 1, userSelect: 'none' as const }}>{rank}</span>
                            {/* Rank badge */}
                            <span style={{ position: 'absolute', top: 14, left: 16, fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: accentColor, letterSpacing: '0.08em', opacity: 0.9 }}>#{rank}</span>
                            {isSelf && (
                                <span style={{ position: 'absolute', top: 12, right: 12, padding: '3px 8px', borderRadius: 6, background: 'var(--iris-violet)', color: '#fff', ...S_LB.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>You</span>
                            )}
                            {/* Avatar */}
                            <div style={{ position: 'relative', width: isFirst ? 92 : 76, height: isFirst ? 92 : 76, borderRadius: '50%', overflow: 'hidden', border: `2px solid ${accentColor}`, boxShadow: `0 8px 24px -8px rgba(0,0,0,0.6), 0 0 0 4px ${accentColor}22`, marginBottom: 16, flexShrink: 0, zIndex: 1 }}>
                                <img src={trader.avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </div>
                            <p style={{ ...S_LB.display, fontSize: isFirst ? 22 : 18, color: 'var(--fg)', marginBottom: 2, textAlign: 'center' }}>{trader.username}</p>
                            <p style={{ ...S_LB.label, marginBottom: 20, color: accentColor, opacity: 0.7 }}>{trader.handle}</p>
                            {/* Stats row */}
                            <div style={{ display: 'flex', gap: 0, marginBottom: 20, width: '100%', background: 'var(--podium-stats-bg)', borderRadius: 10, border: '1px solid var(--podium-stats-border)', overflow: 'hidden' }}>
                                <div style={{ flex: 1, textAlign: 'center', padding: '10px 12px', borderRight: '1px solid var(--podium-stats-border)' }}>
                                    <p style={{ ...S_LB.label, fontSize: 9, marginBottom: 4 }}>PNL</p>
                                    <p style={{ ...S_LB.mono, fontSize: isFirst ? 18 : 15, fontWeight: 700, color: trader.pnl >= 0 ? 'var(--pnl-up)' : 'var(--pnl-down)', lineHeight: 1 }}>{trader.pnl >= 0 ? '+' : '-'}${formatMoney(Math.abs(trader.pnl))}</p>
                                </div>
                                <div style={{ flex: 1, textAlign: 'center', padding: '10px 12px' }}>
                                    <p style={{ ...S_LB.label, fontSize: 9, marginBottom: 4 }}>WIN RATE</p>
                                    <p style={{ ...S_LB.mono, fontSize: isFirst ? 18 : 15, fontWeight: 700, color: 'var(--fg)', lineHeight: 1 }}>{winRateDisplay}</p>
                                </div>
                            </div>
                            <button onClick={() => handleViewProfile(trader)}
                                style={{ width: '100%', padding: '11px', borderRadius: 11, background: 'var(--podium-btn-hover-bg)', border: `1px solid ${accentColor}44`, ...S_LB.mono, fontSize: 11, fontWeight: 700, color: accentColor, cursor: 'pointer', letterSpacing: '0.08em', textTransform: 'uppercase' as const, transition: 'all 0.15s' }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${accentColor}22`; (e.currentTarget as HTMLElement).style.borderColor = `${accentColor}88`; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--podium-btn-hover-bg)'; (e.currentTarget as HTMLElement).style.borderColor = `${accentColor}44`; }}>
                                View Profile
                            </button>
                        </div>
                    )
                })}
            </div>
            )} {/* end desktop podium ternary */}

            {/* Full table — desktop */}
            <div className="vp" style={panel}>
                {!isMobile && (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' as const, whiteSpace: 'nowrap' as const }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--hairline)' }}>
                                {['Rank','Trader','PnL (All Time)','Win Rate','Followers',''].map((h,i) => (
                                    <th key={h+i} style={{ padding: '11px 20px', textAlign: i === 5 ? 'right' as const : 'left' as const, ...S_LB.label }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {sortedTraders.map((trader: any, i: number) => {
                                const isSelf = user && trader.id === user.id;
                                return (
                                <tr key={trader.id} style={{ borderBottom: '1px solid var(--hairline)', transition: 'background 0.1s', cursor: 'pointer', background: isSelf ? 'color-mix(in oklab, var(--iris-violet, #7C5CFF) 10%, transparent)' : 'transparent' }}
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = isSelf ? 'color-mix(in oklab, var(--iris-violet, #7C5CFF) 16%, transparent)' : 'var(--chip-bg)'}
                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = isSelf ? 'color-mix(in oklab, var(--iris-violet, #7C5CFF) 10%, transparent)' : 'transparent'}>
                                    <td style={{ padding: '12px 20px', ...S_LB.mono, fontSize: 13, fontWeight: 700, color: 'var(--fg-subtle)' }}>#{i + 1}</td>
                                    <td style={{ padding: '12px 20px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <img src={trader.avatar} style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--hairline)' }} />
                                            <div>
                                                <p style={{ ...S_LB.display, fontSize: 14, color: 'var(--fg)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    {trader.username}
                                                    {isSelf && (
                                                        <span style={{ padding: '2px 6px', borderRadius: 4, background: 'var(--iris-violet, #7C5CFF)', color: '#fff', ...S_LB.mono, fontSize: 8, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>You</span>
                                                    )}
                                                </p>
                                                <p style={{ ...S_LB.label, fontSize: 9, marginTop: 1 }}>{trader.handle}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td style={{ padding: '12px 20px', ...S_LB.mono, fontSize: 13, fontWeight: 700, color: trader.pnl >= 0 ? 'var(--pnl-up)' : 'var(--pnl-down)' }}>{trader.pnl >= 0 ? '' : '-'}${formatMoney(Math.abs(trader.pnl))}</td>
                                    <td style={{ padding: '12px 20px', ...S_LB.mono, fontSize: 13, color: 'var(--fg)' }}>{Number.isFinite(trader.winRate) ? `${parseFloat(trader.winRate.toFixed(1))}%` : '—'}</td>
                                    <td style={{ padding: '12px 20px', ...S_LB.mono, fontSize: 13, color: 'var(--fg-muted)' }}>{trader.followers.length}</td>
                                    <td style={{ padding: '12px 20px', textAlign: 'right' as const }}>
                                        <button onClick={() => handleViewProfile(trader)}
                                            style={{ padding: '6px 14px', borderRadius: 9, background: 'var(--chip-bg)', border: '1px solid var(--hairline-strong)', ...S_LB.mono, fontSize: 11, color: 'var(--fg-muted)', cursor: 'pointer', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' as const, transition: 'all 0.1s' }}
                                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--holo-linear)'; (e.currentTarget as HTMLElement).style.backgroundSize = '220% 100%'; (e.currentTarget as HTMLElement).style.color = '#0B0B0E'; }}
                                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--chip-bg)'; (e.currentTarget as HTMLElement).style.color = 'var(--fg-muted)'; }}>
                                            View
                                        </button>
                                    </td>
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                )}

                {/* Mobile card list */}
                {isMobile && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {/* Header row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--hairline)' }}>
                        <span style={{ ...S_LB.label, fontSize: 9 }}>Rank · Trader</span>
                        <span style={{ ...S_LB.label, fontSize: 9 }}>PnL · Win Rate</span>
                    </div>
                    {sortedTraders.map((trader: any, i: number) => {
                        const isSelf = user && trader.id === user.id;
                        const rankColors = ['oklch(0.70 0.15 75)', 'oklch(0.80 0.05 240)', 'oklch(0.65 0.13 50)'];
                        const rankColor = i < 3 ? rankColors[i] : 'var(--fg-subtle)';
                        return (
                            <div key={trader.id}
                                onClick={() => handleViewProfile(trader)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 12,
                                    padding: '12px 16px',
                                    borderBottom: '1px solid var(--hairline)',
                                    cursor: 'pointer',
                                    background: isSelf ? 'color-mix(in oklab, var(--iris-violet) 10%, transparent)' : 'transparent',
                                    transition: 'background 0.1s',
                                }}
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = isSelf ? 'color-mix(in oklab, var(--iris-violet) 16%, transparent)' : 'var(--chip-bg)'}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = isSelf ? 'color-mix(in oklab, var(--iris-violet) 10%, transparent)' : 'transparent'}>
                                {/* Rank */}
                                <span style={{ ...S_LB.mono, fontSize: 12, fontWeight: 700, color: rankColor, width: 26, flexShrink: 0, textAlign: 'center' as const }}>#{i + 1}</span>
                                {/* Avatar */}
                                <div style={{ position: 'relative', flexShrink: 0 }}>
                                    <img src={trader.avatar} style={{ width: 40, height: 40, borderRadius: '50%', border: `1.5px solid ${i < 3 ? rankColor : 'var(--hairline)'}`, display: 'block' }} />
                                    {isSelf && <span style={{ position: 'absolute', bottom: -2, right: -2, width: 14, height: 14, borderRadius: '50%', background: 'var(--iris-violet)', border: '2px solid var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 7, color: '#fff', fontWeight: 900 }}>✓</span></span>}
                                </div>
                                {/* Name + handle */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                        <span style={{ ...S_LB.display, fontSize: 14, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{trader.username}</span>
                                        {isSelf && <span style={{ padding: '1px 5px', borderRadius: 4, background: 'var(--iris-violet)', color: '#fff', ...S_LB.mono, fontSize: 7, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, flexShrink: 0 }}>You</span>}
                                    </div>
                                    <span style={{ ...S_LB.label, fontSize: 9, color: 'var(--fg-subtle)' }}>{trader.handle} · {trader.followers.length} followers</span>
                                </div>
                                {/* Stats */}
                                <div style={{ textAlign: 'right' as const, flexShrink: 0 }}>
                                    <p style={{ ...S_LB.mono, fontSize: 13, fontWeight: 700, color: trader.pnl >= 0 ? 'var(--pnl-up)' : 'var(--pnl-down)', marginBottom: 2 }}>
                                        {trader.pnl >= 0 ? '+' : '-'}${formatMoney(Math.abs(trader.pnl))}
                                    </p>
                                    <p style={{ ...S_LB.mono, fontSize: 10, color: 'var(--fg-muted)' }}>
                                        {Number.isFinite(trader.winRate) ? `${parseFloat(trader.winRate.toFixed(1))}%` : '—'} WR
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>
                )}
            </div>
        </div>
    );
}
// Helper: render post content with clickable @mentions
// ── Available social token pairs (defines which $TICKERS are valid links) ───────
const SOCIAL_FEATURED_PAIRS = PAIRS.map(p => ({
    symbol: p.id.split('/')[0],
    pairId: p.id,
    name: p.name,
    logo: p.logo,
    binance: `${p.id.split('/')[0]}USDT`,
    geckoId: p.geckoId,
}));

// Top 4 shown in the tokens bar and related-tokens sidebar
const TOP_SOCIAL_PAIRS = SOCIAL_FEATURED_PAIRS.slice(0, 4); // SOL, BTC, ETH, WIF
const VALID_TICKER_SYMBOLS = SOCIAL_FEATURED_PAIRS.map(p => p.symbol);

// ── Link Preview Card ──────────────────────────────────────────────────────────
const LinkPreviewCard = ({ url }: { url: string }) => {
    const [meta, setMeta] = useState<{ title?: string; description?: string; image?: string; siteName?: string } | null>(null);
    const [loading, setLoading] = useState(true);
    const [errored, setErrored] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoading(true); setErrored(false); setMeta(null);
        // Same-origin serverless endpoint (no CORS, edge-cached) returns parsed OG meta.
        const endpoint = `/api/og?url=${encodeURIComponent(url)}`;
        fetch(endpoint)
            .then(r => r.json())
            .then(meta => {
                if (cancelled) return;
                if (meta && (meta.title || meta.description || meta.image)) setMeta(meta);
                else setErrored(true);
            })
            .catch(() => { if (!cancelled) setErrored(true); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [url]);

    if (errored || (!loading && !meta)) return null;

    const domain = (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } })();

    return (
        <a href={url} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{ display: 'block', marginTop: 10, borderRadius: 12, border: '1px solid var(--hairline)', overflow: 'hidden', textDecoration: 'none', background: 'var(--chip-bg)', transition: 'border-color 0.15s', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--hairline-strong)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--hairline)'}
        >
            {loading ? (
                <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--hairline)', borderTopColor: 'var(--iris-violet)', animation: 'spin 0.7s linear infinite' }}/>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-subtle)' }}>{domain}</span>
                </div>
            ) : meta ? (
                <div style={{ display: 'flex', gap: 0 }}>
                    {meta.image && (
                        <div style={{ width: 100, flexShrink: 0, background: 'var(--glass-bg-strong)', overflow: 'hidden' }}>
                            <img src={meta.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={e => { (e.currentTarget as HTMLElement).style.display = 'none'; }}/>
                        </div>
                    )}
                    <div style={{ padding: '10px 12px', flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{meta.siteName || domain}</span>
                        {meta.title && <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600, color: 'var(--fg)', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>{meta.title}</span>}
                        {meta.description && <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>{meta.description}</span>}
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--iris-violet)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url.length > 60 ? url.slice(0, 57) + '…' : url}</span>
                    </div>
                </div>
            ) : null}
        </a>
    );
};

// Extract first URL from post content for preview
const extractFirstUrl = (content: string): string | null => {
    const m = content.match(/https?:\/\/[^\s<>"']+/);
    return m ? m[0] : null;
};

const renderContentWithMentions = (content: string, onViewProfile: (p: any) => void, traders: any[], onTickerClick?: (ticker: string) => void, validTickers?: string[]) => {
    const parts = content.split(/(@[A-Za-z0-9_]+|\$[A-Z]{2,8}|https?:\/\/[^\s<>"']+)/g);
    return parts.map((part: string, i: number) => {
        if (part.match(/^@[A-Za-z0-9_]+$/)) {
            const handle = part.toLowerCase();
            const trader = traders.find((t: any) =>
                t.handle?.toLowerCase() === handle || ('@' + (t.username?.toLowerCase() || '')) === handle
            );
            return (
                <span key={i}
                    onClick={e => { e.stopPropagation(); if (trader) onViewProfile({ id: trader.id }); }}
                    style={{ color: 'var(--iris-violet)', cursor: trader ? 'pointer' : 'default', fontWeight: 600 }}>
                    {part}
                </span>
            );
        }
        if (part.match(/^\$[A-Z]{2,8}$/)) {
            const symbol = part.slice(1);
            // Only make it a special clickable ticker if it's a known available pair
            const isKnown = validTickers ? validTickers.includes(symbol) : true;
            if (isKnown) {
                return (
                    <span key={i}
                        onClick={e => { e.stopPropagation(); if (onTickerClick) onTickerClick(symbol); }}
                        style={{ color: 'var(--pnl-up)', cursor: 'pointer', fontWeight: 700, background: 'rgba(var(--pnl-up-rgb, 52,211,153), 0.1)', borderRadius: 4, padding: '0 3px' }}>
                        {part}
                    </span>
                );
            }
            // Unknown ticker — render as plain text
            return <span key={i} style={{ fontWeight: 600, color: 'var(--fg-muted)' }}>{part}</span>;
        }
        if (part.match(/^https?:\/\//)) {
            const displayUrl = part.length > 50 ? part.slice(0, 47) + '…' : part;
            return (
                <a key={i} href={part} target="_blank" rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    style={{ color: 'var(--iris-violet)', textDecoration: 'underline', textDecorationColor: 'oklch(0.68 0.22 295 / 0.4)', wordBreak: 'break-all' }}>
                    {displayUrl}
                </a>
            );
        }
        return <span key={i}>{part}</span>;
    });
};

const PostCard = ({ post, user, onLike, onRepost, onComment, handleCopyTrade, onViewProfile, showUsersModal, onDelete, onDeleteComment, traders = [], onTickerClick, defaultOpenComments, onSinglePost }: any) => {
    const hasLiked = post.likedBy.includes(user?.id);
    const hasReposted = post.repostedBy.includes(user?.id);
    // Author can delete their own post from any wall; wall owner can also delete posts on their wall
    const canDelete = user && onDelete && (user.id === post.authorId || user.id === post.targetProfileId);
    const [showComments, setShowComments] = useState(defaultOpenComments || false);
    const [commentText, setCommentText] = useState('');
    const [isSubmittingComment, setIsSubmittingComment] = useState(false);
    const [shareToast, setShareToast] = useState(false);
    const [commentMentionQuery, setCommentMentionQuery] = useState<string | null>(null);
    const [commentMentionTrigger, setCommentMentionTrigger] = useState<'@' | '$' | null>(null);
    const [commentMentionStart, setCommentMentionStart] = useState(0);
    const [commentMentionIdx, setCommentMentionIdx] = useState(0);
    const commentInputRef = useRef<HTMLInputElement>(null);

    const commentMentionResults: any[] = React.useMemo ? (() => {
        if (commentMentionQuery === null) return [];
        const q = commentMentionQuery.toLowerCase();
        if (commentMentionTrigger === '$') {
            if (!q) return []; // don't show anything until at least 1 char typed
            return SOCIAL_FEATURED_PAIRS.filter(p =>
                p.symbol.toLowerCase().startsWith(q) || p.name.toLowerCase().startsWith(q)
            ).slice(0, 4).map(p => ({ ...p, _type: 'ticker' }));
        }
        if (commentMentionTrigger === '@' && q.length > 0) {
            return traders.filter((t: any) => {
                if (t.id === user?.id) return false;
                return (t.handle || '').toLowerCase().includes(q) || (t.username || '').toLowerCase().includes(q);
            }).slice(0, 5);
        }
        return [];
    })() : [];

    const handleCommentTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        const cursor = e.target.selectionStart ?? val.length;
        setCommentText(val);
        const atMatch = val.slice(0, cursor).match(/@([A-Za-z0-9_]*)$/);
        const dollarMatch = val.slice(0, cursor).match(/\$([A-Za-z0-9]*)$/);
        if (atMatch) {
            setCommentMentionTrigger('@'); setCommentMentionQuery(atMatch[1]);
            setCommentMentionStart(cursor - atMatch[0].length); setCommentMentionIdx(0);
        } else if (dollarMatch) {
            setCommentMentionTrigger('$'); setCommentMentionQuery(dollarMatch[1]);
            setCommentMentionStart(cursor - dollarMatch[0].length); setCommentMentionIdx(0);
        } else {
            setCommentMentionQuery(null); setCommentMentionTrigger(null);
        }
    };

    const completeCommentMention = (item: any) => {
        const insertion = item._type === 'ticker' ? `$${item.symbol}` : (item.handle || ('@' + item.username));
        const cursor = commentInputRef.current?.selectionStart ?? commentMentionStart + (commentMentionQuery?.length ?? 0) + 1;
        const before = commentText.slice(0, commentMentionStart);
        const after = commentText.slice(cursor);
        setCommentText(before + insertion + ' ' + after);
        setCommentMentionQuery(null); setCommentMentionTrigger(null);
        setTimeout(() => {
            if (commentInputRef.current) {
                const pos = before.length + insertion.length + 1;
                commentInputRef.current.focus();
                commentInputRef.current.setSelectionRange(pos, pos);
            }
        }, 0);
    };

    // If defaultOpenComments flips (notification routing), open comments
    useEffect(() => { if (defaultOpenComments) setShowComments(true); }, [defaultOpenComments]);
    const S = {
        mono: { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1' },
        display: { fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' },
        label: { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)' as const },
    };

    // Context label: "posted on @x's wall" — clickable to navigate to that wall
    const contextTarget = post.targetProfileId && post.targetProfileId !== post.authorId
        ? traders.find((t: any) => t.id === post.targetProfileId)
        : null;
    const contextLabel = contextTarget
        ? { text: `posted on ${contextTarget.handle || ('@' + contextTarget.username)}'s wall`, type: 'wall', trader: contextTarget }
        : null;

    const handleShare = async () => {
        const postUrl = `${window.location.origin}/social/post/${post.id}`;
        const shareTitle = `Post by ${post.authorHandle} on Velo`;
        const shareText = post.content.slice(0, 200) + (post.content.length > 200 ? '…' : '');

        // Dynamically update OG meta tags so the link previews correctly when shared
        const setMeta = (prop: string, content: string) => {
            let el = document.querySelector(`meta[property="${prop}"]`) as HTMLMetaElement | null;
            if (!el) { el = document.createElement('meta'); el.setAttribute('property', prop); document.head.appendChild(el); }
            el.setAttribute('content', content);
        };
        setMeta('og:url', postUrl);
        setMeta('og:title', shareTitle);
        setMeta('og:description', shareText);
        if (post.authorAvatar) setMeta('og:image', post.authorAvatar);
        setMeta('og:type', 'article');

        if (navigator.share) {
            try { await navigator.share({ title: shareTitle, text: shareText, url: postUrl }); return; } catch (_) {}
        }
        // Fallback: copy post URL to clipboard
        try {
            await navigator.clipboard.writeText(postUrl);
            setShareToast(true);
            setTimeout(() => setShareToast(false), 2000);
        } catch (_) {}
    };

    const handleSubmitComment = async () => {
        if (!commentText.trim() || isSubmittingComment) return;
        setIsSubmittingComment(true);
        await onComment(post.id, commentText.trim());
        setCommentText('');
        setIsSubmittingComment(false);
    };

    return (
        <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--hairline)', borderRadius: 14, backdropFilter: 'blur(8px) saturate(1.1)', WebkitBackdropFilter: 'blur(8px) saturate(1.1)', overflow: 'hidden', transition: 'border-color 0.15s', position: 'relative' as const }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--hairline-strong)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--hairline)'}>
            {/* Share toast */}
            {shareToast && (
                <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, background: 'var(--fg)', color: 'var(--bg-base)', padding: '5px 12px', borderRadius: 20, fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, pointerEvents: 'none', animation: 'fadeIn 0.15s ease' }}>
                    Copied!
                </div>
            )}
            {/* Context label: "posted on @x's wall" or reposts */}
            {contextLabel ? (
                <button
                    onClick={() => contextLabel.trader && onViewProfile({ id: contextLabel.trader.id })}
                    style={{ padding: '7px 16px', ...S.label, fontSize: 10, background: 'var(--chip-bg)', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid var(--hairline)', color: 'var(--iris-violet)', border: 'none', borderRadius: 0, width: '100%', textAlign: 'left' as const, cursor: contextLabel.trader ? 'pointer' : 'default', transition: 'background 0.1s' }}
                    onMouseEnter={e => { if (contextLabel.trader) (e.currentTarget as HTMLElement).style.background = 'oklch(0.68 0.22 295 / 0.08)'; }}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--chip-bg)'}
                >
                    <ArrowUpRight size={10}/>
                    {contextLabel.text}
                </button>
            ) : post.repostedBy.length > 0 ? (
                <div style={{ padding: '7px 16px', ...S.label, fontSize: 10, background: 'var(--chip-bg)', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid var(--hairline)' }}>
                    <Repeat size={10}/> {post.repostedBy.length} reposts
                </div>
            ) : null}
            <div style={{ padding: 16, display: 'flex', gap: 12 }}>
                <div style={{ flexShrink: 0, cursor: 'pointer' }} onClick={() => onViewProfile({ id: post.authorId })}>
                    <img src={post.authorAvatar} style={{ width: 38, height: 38, borderRadius: '50%', border: '1px solid var(--hairline)' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ ...S.display, fontSize: 14, color: 'var(--fg)', cursor: 'pointer' }} onClick={() => onViewProfile({ id: post.authorId })}>{post.authorHandle}</span>
                            <VerifiedBadge userId={post.authorId} size={13}/>
                            <span style={{ ...S.label, fontSize: 10, cursor: onSinglePost ? 'pointer' : 'default', textDecoration: onSinglePost ? 'underline' : 'none' }} onClick={() => onSinglePost && onSinglePost(post.id)} title={onSinglePost ? 'View post' : undefined}>{(() => { const d = new Date(post.timestamp); const now = new Date(); const isToday = d.toDateString() === now.toDateString(); return isToday ? d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : d.toLocaleDateString([],{month:'short',day:'numeric'}) + ' · ' + d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}); })()}</span>
                        </div>
                        {canDelete && (
                            <button onClick={() => onDelete(post.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-subtle)', padding: 2, transition: 'color 0.1s' }}
                                title="Delete post"
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--pnl-down)'}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--fg-subtle)'}
                            ><Trash2 size={14}/></button>
                        )}
                    </div>
                    <p style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-muted)', lineHeight: 1.6, whiteSpace: 'pre-wrap' as const, marginBottom: post.isTradeSignal ? 12 : 0, cursor: onSinglePost ? 'pointer' : 'default' }}
                        onClick={() => onSinglePost && onSinglePost(post.id)}>
                        {renderContentWithMentions(post.content, onViewProfile, traders, onTickerClick, VALID_TICKER_SYMBOLS)}
                    </p>
                    {(() => { const u = extractFirstUrl(post.content); return u ? <LinkPreviewCard url={u} /> : null; })()}
                    {post.isTradeSignal && post.tradeDetails && (
                        <div style={{ background: 'oklch(0.68 0.22 295 / 0.06)', border: '1px solid oklch(0.68 0.22 295 / 0.2)', borderRadius: 12, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ ...S.mono, fontSize: 15, fontWeight: 700, color: 'var(--fg)' }}>{post.tradeDetails.pair}</span>
                                    <span style={{ padding: '2px 8px', borderRadius: 6, background: post.tradeDetails.side === 'LONG' ? 'oklch(0.78 0.18 150/0.15)' : 'oklch(0.66 0.22 25/0.15)', border: `1px solid ${post.tradeDetails.side === 'LONG' ? 'oklch(0.78 0.18 150/0.3)' : 'oklch(0.66 0.22 25/0.3)'}`, ...S.label, fontSize: 10, color: post.tradeDetails.side === 'LONG' ? 'var(--pnl-up)' : 'var(--pnl-down)' }}>{post.tradeDetails.side}</span>
                                    <span style={{ ...S.label }}>· {post.tradeDetails.leverage}× · Entry {post.tradeDetails.entry}</span>
                                </div>
                            </div>
                        </div>
                    )}
                    {/* Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                        {[
                            { icon: <MessageCircle size={15}/>, count: post.comments.length, onClick: () => setShowComments(s => !s), active: showComments, hoverColor: 'var(--iris-violet)' },
                            { icon: <Repeat size={15}/>, count: post.reposts, onClick: () => onRepost(post.id), active: hasReposted, hoverColor: 'var(--pnl-up)' },
                            { icon: <Heart size={15} fill={hasLiked ? 'currentColor' : 'none'}/>, count: post.likes, onClick: () => onLike(post.id), active: hasLiked, hoverColor: 'var(--iris-magenta)' },
                            { icon: <Share2 size={15}/>, count: null, onClick: handleShare, active: false, hoverColor: 'var(--iris-cyan)' },
                        ].map((action, i) => (
                            <button key={i} onClick={action.onClick}
                                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 8px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', ...S.mono, fontSize: 11, color: action.active ? action.hoverColor : 'var(--fg-subtle)', transition: 'all 0.1s' }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = action.hoverColor; (e.currentTarget as HTMLElement).style.background = 'var(--chip-bg)'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = action.active ? action.hoverColor : 'var(--fg-subtle)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                                {action.icon} {action.count !== null && action.count}
                            </button>
                        ))}
                    </div>
                    {/* Comments section */}
                    {showComments && (
                        <div style={{ marginTop: 12, borderTop: '1px solid var(--hairline)', paddingTop: 12 }}>
                            {/* Existing comments */}
                            {post.comments.length > 0 && (
                                <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {post.comments.map((c: any) => (
                                        <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                            <img
                                                src={c.authorAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${c.authorHandle}`}
                                                style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid var(--hairline)', flexShrink: 0, cursor: 'pointer' }}
                                                onClick={() => onViewProfile({ id: c.authorId })}
                                                title={`View ${c.authorHandle}'s profile`}
                                            />
                                            <div style={{ background: 'var(--chip-bg)', borderRadius: 10, padding: '6px 10px', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <span
                                                        style={{ ...S.display, fontSize: 12, color: 'var(--fg)', marginRight: 4, cursor: 'pointer' }}
                                                        onClick={() => onViewProfile({ id: c.authorId })}
                                                    >{c.authorHandle}</span>
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-subtle)', marginRight: 6, fontWeight: 700, letterSpacing: '0.06em' }}>{(() => { const d = new Date(c.timestamp); const now = new Date(); const isToday = d.toDateString() === now.toDateString(); return isToday ? d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : d.toLocaleDateString([],{month:'short',day:'numeric'}) + ' · ' + d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}); })()}</span>
                                                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-muted)' }}>{renderContentWithMentions(c.content, onViewProfile, traders, onTickerClick, VALID_TICKER_SYMBOLS)}</span>
                                                </div>
                                                {user && (user.id === c.authorId || user.id === post.authorId) && onDeleteComment && (
                                                    <button
                                                        onClick={() => onDeleteComment(post.id, c.id)}
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-subtle)', padding: '2px 4px', borderRadius: 4, flexShrink: 0, opacity: 0.6, transition: 'opacity 0.1s' }}
                                                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
                                                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '0.6'}
                                                        title="Delete comment"
                                                    ><Trash2 size={11}/></button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {/* Comment input */}
                            {user ? (
                                <div style={{ position: 'relative' }}>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                                        <img src={user.avatar} style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid var(--hairline)', flexShrink: 0 }} />
                                        <div style={{ flex: 1, display: 'flex', gap: 6, alignItems: 'center', background: 'var(--chip-bg)', borderRadius: 20, padding: '4px 4px 4px 12px', border: '1px solid var(--hairline)' }}>
                                            <input
                                                ref={commentInputRef}
                                                value={commentText}
                                                onChange={handleCommentTextChange}
                                                onKeyDown={e => {
                                                    if (commentMentionQuery !== null && commentMentionResults.length > 0) {
                                                        if (e.key === 'ArrowDown') { e.preventDefault(); setCommentMentionIdx(i => Math.min(i+1, commentMentionResults.length-1)); return; }
                                                        if (e.key === 'ArrowUp') { e.preventDefault(); setCommentMentionIdx(i => Math.max(i-1, 0)); return; }
                                                        if (e.key === 'Tab') { e.preventDefault(); completeCommentMention(commentMentionResults[commentMentionIdx]); return; }
                                                        if (e.key === 'Escape') { setCommentMentionQuery(null); setCommentMentionTrigger(null); return; }
                                                    }
                                                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmitComment(); }
                                                }}
                                                onBlur={() => setTimeout(() => { setCommentMentionQuery(null); setCommentMentionTrigger(null); }, 150)}
                                                placeholder="Write a comment... @mention or $TICKER"
                                                style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg)', minWidth: 0 }}
                                            />
                                            <button
                                                onClick={handleSubmitComment}
                                                disabled={!commentText.trim() || isSubmittingComment}
                                                style={{ padding: '5px 12px', borderRadius: 16, background: commentText.trim() ? 'var(--iris-violet)' : 'var(--chip-bg)', border: 'none', ...S.mono, fontSize: 11, fontWeight: 700, color: commentText.trim() ? '#fff' : 'var(--fg-subtle)', cursor: commentText.trim() ? 'pointer' : 'default', transition: 'all 0.1s', flexShrink: 0 }}>
                                                Post
                                            </button>
                                        </div>
                                    </div>
                                    <MentionDropdown results={commentMentionResults} anchorRef={commentInputRef} activeIndex={commentMentionIdx} onSelect={completeCommentMention} onHover={setCommentMentionIdx} />
                                </div>
                            ) : (
                                <p style={{ ...S.label, textAlign: 'center', padding: '8px 0' }}>Log in to comment</p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
// ── Top Tokens Bar ────────────────────────────────────────────────────────────

const TopTokensBar = ({ prices, changes, onTickerClick, onNavigateToMarkets }: { prices: Record<string,number>, changes: Record<string,number>, onTickerClick: (t: string) => void, onNavigateToMarkets?: () => void }) => {
    const [sparklines, setSparklines] = React.useState<Record<string, number[]>>({});

    React.useEffect(() => {
        TOP_SOCIAL_PAIRS.forEach(async (p) => {
            try {
                const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${p.binance}&interval=1h&limit=24`);
                if (!res.ok) return;
                const raw: any[] = await res.json();
                const closes = raw.map((c: any) => parseFloat(c[4]));
                setSparklines(prev => ({ ...prev, [p.symbol]: closes }));
            } catch (_) {}
        });
    }, []);

    const S = {
        mono: { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1' } as React.CSSProperties,
    };

    const drawSparkline = (data: number[], up: boolean) => {
        if (!data || data.length < 2) return null;
        const w = 100, h = 24;
        const min = Math.min(...data), max = Math.max(...data);
        const range = max - min || 1;
        const pts = data.map((v, i) => {
            const x = (i / (data.length - 1)) * w;
            const y = h - ((v - min) / range) * h;
            return `${x},${y}`;
        }).join(' ');
        const color = up ? 'var(--pnl-up)' : 'var(--pnl-down)';
        const fillPts = `0,${h} ${pts} ${w},${h}`;
        return (
            <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
                <defs>
                    <linearGradient id={`sg-${up ? 'u' : 'd'}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity="0.25" />
                        <stop offset="100%" stopColor={color} stopOpacity="0" />
                    </linearGradient>
                </defs>
                <polygon points={fillPts} fill={`url(#sg-${up ? 'u' : 'd'})`} />
                <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        );
    };

    return (
        <div style={{ marginBottom: 12 }}>
            <div style={{ background: 'var(--glass-bg)', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--hairline)', boxShadow: 'var(--glass-shadow)', backdropFilter: 'blur(8px) saturate(1.1)', WebkitBackdropFilter: 'blur(8px) saturate(1.1)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                    {TOP_SOCIAL_PAIRS.map((p, i) => {
                        const price = prices[p.pairId];
                        const chg = changes[p.pairId] ?? 0;
                        const up = chg >= 0;
                        const spark = sparklines[p.symbol] || [];
                        return (
                            <div key={p.symbol}
                                onClick={() => onTickerClick(p.symbol)}
                                style={{ background: 'transparent', borderLeft: i > 0 ? '1px solid var(--hairline)' : 'none', padding: '13px 15px', cursor: 'pointer', transition: 'background 0.15s', position: 'relative', overflow: 'hidden' }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'color-mix(in oklab, var(--fg) 5%, transparent)'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
                                    <img src={p.logo} style={{ width: 22, height: 22, borderRadius: '50%', border: '1px solid var(--hairline)', flexShrink: 0 }} />
                                    <div style={{ minWidth: 0 }}>
                                        <span style={{ ...S.mono, fontSize: 13, fontWeight: 700, color: 'var(--fg)', display: 'block', letterSpacing: '0.02em' }}>{p.symbol}</span>
                                        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 9, color: 'var(--fg-subtle)', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                                    </div>
                                    <span style={{ marginLeft: 'auto', ...S.mono, fontSize: 11, fontWeight: 700, color: up ? 'var(--pnl-up)' : 'var(--pnl-down)', background: up ? 'oklch(0.68 0.18 162 / 0.1)' : 'oklch(0.65 0.2 25 / 0.1)', borderRadius: 6, padding: '2px 6px', whiteSpace: 'nowrap' }}>
                                        {up ? '+' : ''}{chg.toFixed(2)}%
                                    </span>
                                </div>
                                <span style={{ ...S.mono, fontSize: 16, fontWeight: 700, color: 'var(--fg)', display: 'block', marginBottom: 8, letterSpacing: '-0.01em' }}>
                                    {price != null ? (price >= 1000 ? `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : price >= 1 ? `$${price.toFixed(2)}` : `$${price.toFixed(5)}`) : '—'}
                                </span>
                                {drawSparkline(spark, up)}
                            </div>
                        );
                    })}
                </div>
            </div>
            {onNavigateToMarkets && (
                <div style={{ textAlign: 'center', marginTop: 8 }}>
                    <button onClick={onNavigateToMarkets} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--iris-violet)', letterSpacing: '0.08em', textTransform: 'uppercase' as const, opacity: 0.8, transition: 'opacity 0.15s', padding: '4px 8px' }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                        onMouseLeave={e => (e.currentTarget.style.opacity = '0.8')}
                    >
                        View all markets →
                    </button>
                </div>
            )}
        </div>
    );
};

// ── Token Page (Stocktwits-style) ────────────────────────────────────────────
// ── Token metadata for enriched token pages ────────────────────────────────
const TOKEN_META: Record<string, { geckoId: string; website?: string; twitter?: string; whitepaper?: string; description?: string; longDescription?: string; supply?: string; marketCapRank?: number; category?: string; launchYear?: number }> = {
    BTC:  { geckoId: 'bitcoin',           website: 'https://bitcoin.org',     twitter: 'https://twitter.com/bitcoin',      whitepaper: 'https://bitcoin.org/bitcoin.pdf',
        description: 'The original peer-to-peer electronic cash system and decentralized store of value.',
        longDescription: 'Bitcoin is the world\'s first cryptocurrency, created in 2009 by the pseudonymous Satoshi Nakamoto. It operates on a decentralized blockchain, secured by a global network of miners using proof-of-work consensus. With a hard cap of 21 million coins, Bitcoin is designed to be deflationary — often called "digital gold." It is the most liquid, widely held, and institutionally adopted crypto asset, with ETFs, futures markets, and corporate treasury holdings worldwide.',
        supply: '21M max', category: 'Layer 1', launchYear: 2009 },
    ETH:  { geckoId: 'ethereum',          website: 'https://ethereum.org',    twitter: 'https://twitter.com/ethereum',     whitepaper: 'https://ethereum.org/en/whitepaper',
        description: 'A decentralized platform for smart contracts and the backbone of decentralized finance.',
        longDescription: 'Ethereum is the leading programmable blockchain, enabling developers to build decentralized applications (dApps), DeFi protocols, NFTs, and DAOs. Transitioned to proof-of-stake in 2022 ("The Merge"), drastically cutting energy consumption. Its native currency ETH is used to pay gas fees across the entire Ethereum ecosystem. Layer-2 networks like Arbitrum, Optimism, and Base extend its throughput. ETH is also deflationary post-EIP-1559, with fee burns reducing supply over time.',
        supply: 'No hard cap', category: 'Layer 1', launchYear: 2015 },
    SOL:  { geckoId: 'solana',            website: 'https://solana.com',      twitter: 'https://twitter.com/solana',       whitepaper: 'https://solana.com/solana-whitepaper.pdf',
        description: 'High-throughput Layer 1 with sub-second finality and ultra-low fees.',
        longDescription: 'Solana is a high-performance Layer 1 blockchain capable of processing up to 65,000 transactions per second using a novel consensus mechanism combining Proof of History (PoH) with Proof of Stake. It powers a booming ecosystem of DeFi, NFTs, consumer apps, and payment infrastructure. Known for low fees (often fractions of a cent) and fast finality, Solana has become the preferred chain for retail users and high-frequency trading bots alike.',
        supply: '~580M', category: 'Layer 1', launchYear: 2020 },
    DOGE: { geckoId: 'dogecoin',          website: 'https://dogecoin.com',    twitter: 'https://twitter.com/dogecoin',
        description: 'The original meme coin — now a widely accepted payment method with a massive community.',
        longDescription: 'Dogecoin was created in 2013 as a lighthearted parody of cryptocurrency culture, featuring the iconic Shiba Inu dog. Despite its meme origins, DOGE has grown into one of the top cryptocurrencies by market cap, used for tipping, microtransactions, and payments. Its community is one of the most active in crypto. Elon Musk\'s public endorsements have historically driven significant price action. Dogecoin uses a merged-mining approach with Litecoin and has no supply cap.',
        supply: '~144B', category: 'Meme Coin', launchYear: 2013 },
    WIF:  { geckoId: 'dogwifcoin',        website: 'https://dogwifcoin.org',  twitter: 'https://twitter.com/dogwifcoin',
        description: 'Solana\'s breakout meme token — a dog wearing a hat that captured the 2024 cycle.',
        longDescription: 'dogwifhat (WIF) is a Solana-native meme coin featuring a Shiba Inu wearing a knit hat. Launched in late 2023, it became one of the defining meme tokens of the 2024 bull cycle, reaching a multi-billion dollar market cap. Unlike earlier meme coins, WIF has no utility or roadmap — its value is entirely driven by community conviction, social virality, and speculative momentum on Solana\'s fast and cheap infrastructure.',
        supply: '998.9M', category: 'Meme Coin', launchYear: 2023 },
    JUP:  { geckoId: 'jupiter-exchange-solana', website: 'https://jup.ag',   twitter: 'https://twitter.com/JupiterExchange',
        description: 'The dominant swap aggregator on Solana, routing trades across every DEX for best execution.',
        longDescription: 'Jupiter is Solana\'s most used swap aggregator and DeFi hub. It routes transactions across all major Solana DEXs to find the best price with minimal slippage. Beyond swaps, Jupiter offers limit orders, perpetual futures (Jupiter Perps), and launchpad services for new tokens. Its governance token JUP gives holders voting rights over protocol upgrades and fee distribution. Jupiter processes billions in monthly volume and is considered infrastructure-critical for the Solana DeFi ecosystem.',
        supply: '10B', category: 'DeFi', launchYear: 2021 },
    AVAX: { geckoId: 'avalanche-2',       website: 'https://avax.network',    twitter: 'https://twitter.com/avalancheavax',
        description: 'Modular Layer 1 enabling custom blockchains (Subnets) with near-instant finality.',
        longDescription: 'Avalanche is a Layer 1 blockchain platform distinguished by its unique multi-chain architecture: the X-Chain for assets, C-Chain for EVM-compatible contracts, and P-Chain for staking. Its Subnet technology allows enterprises and developers to launch custom blockchains with their own validators and tokenomics. Avalanche achieves sub-second finality through the Avalanche consensus protocol, making it competitive for DeFi, gaming, and institutional applications.',
        supply: '720M max', category: 'Layer 1', launchYear: 2020 },
    LINK: { geckoId: 'chainlink',         website: 'https://chain.link',      twitter: 'https://twitter.com/chainlink',
        description: 'The leading decentralized oracle network, connecting blockchains to real-world data.',
        longDescription: 'Chainlink is the industry-standard oracle infrastructure that connects smart contracts to external data sources, APIs, and payment systems. It powers price feeds for virtually every major DeFi protocol, enables cross-chain interoperability via CCIP, and provides verifiable randomness (VRF) for NFTs and gaming. LINK is staked by node operators to provide cryptoeconomic security guarantees. Chainlink\'s data feeds secure hundreds of billions in DeFi TVL.',
        supply: '1B', category: 'Oracle', launchYear: 2017 },
    PEPE: { geckoId: 'pepe',              website: 'https://pepecoin.vip',    twitter: 'https://twitter.com/pepe_coin_',
        description: 'Ethereum-native frog meme coin that became the defining asset of the 2023 meme supercycle.',
        longDescription: 'PEPE is an ERC-20 meme token launched in April 2023, based on the famous Pepe the Frog internet character. With no utility or team allocation, it quickly became one of the most traded tokens in crypto history, reaching a market cap of billions within weeks. PEPE represents the purest form of speculative meme trading — a test of collective attention and narrative momentum. It trades 24/7 with extreme volatility and remains a bellwether for meme coin sentiment.',
        supply: '420.69T', category: 'Meme Coin', launchYear: 2023 },
    RNDR: { geckoId: 'render-token',      website: 'https://rendernetwork.com', twitter: 'https://twitter.com/rendertoken',
        description: 'Decentralized GPU rendering network connecting 3D artists with idle GPU capacity.',
        longDescription: 'Render Network is a distributed GPU computing platform that allows creators to render 3D graphics and visual effects by leveraging idle GPU resources from node operators. Artists pay RNDR tokens to render jobs; operators earn RNDR for providing compute. As AI and 3D content creation demand explodes, Render positions itself as decentralized compute infrastructure at the intersection of AI, media, and blockchain. The network has migrated to Solana for improved throughput.',
        supply: '536M', category: 'AI / DePIN', launchYear: 2020 },
    NEAR: { geckoId: 'near',              website: 'https://near.org',        twitter: 'https://twitter.com/nearprotocol',
        description: 'User-friendly Layer 1 with sharding, human-readable accounts, and AI integration.',
        longDescription: 'NEAR Protocol is a sharded, proof-of-stake Layer 1 blockchain designed for mainstream adoption. It features human-readable account names (e.g. alice.near), low fees, and Nightshade sharding for horizontal scalability. NEAR has pivoted toward AI-native blockchain infrastructure, with a focus on on-chain AI agents and data ownership. Its JavaScript SDK makes it accessible to millions of web developers. The ecosystem includes Aurora (EVM), Rainbow Bridge, and a growing DeFi landscape.',
        supply: '1B', category: 'Layer 1', launchYear: 2020 },
    TIA:  { geckoId: 'celestia',          website: 'https://celestia.org',    twitter: 'https://twitter.com/CelestiaOrg',
        description: 'Pioneering modular data availability layer that decouples consensus from execution.',
        longDescription: 'Celestia is the first modular blockchain network to separate data availability from consensus and execution. Rather than running smart contracts, Celestia specializes exclusively in ordering and publishing transaction data, allowing rollups and other chains to use it as a cheap data availability layer. This architecture enables any developer to launch a custom blockchain (rollup) that inherits Celestia\'s security without the constraints of monolithic chains. TIA is staked to secure the network and pay for data publishing.',
        supply: '1B', category: 'Modular', launchYear: 2023 },
    INJ:  { geckoId: 'injective-protocol', website: 'https://injective.com', twitter: 'https://twitter.com/Injective_',
        description: 'DeFi-first Layer 1 with on-chain orderbooks, cross-chain derivatives, and zero gas fees.',
        longDescription: 'Injective is a Layer 1 blockchain purpose-built for decentralized finance. It features a fully on-chain orderbook DEX, cross-chain trading via IBC and bridges, perpetual futures, binary options, and prediction markets. INJ holders govern the protocol and participate in a weekly token burn that reduces supply over time. Built with Cosmos SDK and using Tendermint consensus, Injective achieves fast finality and is EVM-compatible via its Ethereum bridge.',
        supply: '100M', category: 'DeFi', launchYear: 2021 },
    PYTH: { geckoId: 'pyth-network',      website: 'https://pyth.network',    twitter: 'https://twitter.com/PythNetwork',
        description: 'High-fidelity oracle network delivering real-time financial data from first-party sources.',
        longDescription: 'Pyth Network is a decentralized oracle solution that sources price data directly from first-party providers including trading firms, exchanges, and market makers — not from secondary aggregators. This provides faster and more accurate price feeds than traditional oracle models. Pyth operates on Solana and distributes data cross-chain via Wormhole. It publishes prices for equities, forex, commodities, and crypto with sub-second update speeds, making it the preferred oracle for high-frequency DeFi protocols.',
        supply: '10B', category: 'Oracle', launchYear: 2021 },
    BONK: { geckoId: 'bonk',              website: 'https://bonkcoin.com',    twitter: 'https://twitter.com/bonk_inu',
        description: 'Solana\'s community dog coin — airdropped to builders and traders to revive the ecosystem.',
        longDescription: 'BONK is a Solana-native meme coin launched in December 2022 as a community gift to Solana builders, NFT holders, and traders at the depths of the bear market following the FTX collapse. The airdrop strategy generated immediate viral adoption and helped reignite enthusiasm for the Solana ecosystem. BONK has since grown into a multi-billion dollar asset with real integrations across Solana dApps, DEXs, and wallets, and has become a cultural symbol of Solana\'s recovery.',
        supply: '93.7T', category: 'Meme Coin', launchYear: 2022 },
};

// ── Interactive token chart with price/mcap toggle ─────────────────────────
const TokenInteractiveChart = ({
    priceData, up, ticker, currentPrice, geckoId
}: {
    priceData: number[], up: boolean, ticker: string,
    currentPrice: number, geckoId?: string
}) => {
    const [mode, setMode] = React.useState<'PRICE' | 'MCAP'>('PRICE');
    const [hoveredIdx, setHoveredIdx] = React.useState<number | null>(null);
    const [timeframe, setTimeframe] = React.useState<'24H' | '7D' | '30D'>('24H');
    const [extPriceData, setExtPriceData] = React.useState<Record<string, number[]>>({});
    const [mcapDataMap, setMcapDataMap] = React.useState<Record<string, number[]>>({});
    const [mcapLoading, setMcapLoading] = React.useState(false);

    const binanceSym = ticker === 'BTC' ? 'BTCUSDT' : ticker === 'ETH' ? 'ETHUSDT' : ticker === 'SOL' ? 'SOLUSDT' : ticker === 'DOGE' ? 'DOGEUSDT' : `${ticker}USDT`;

    // Fetch 7D / 30D price data lazily from Binance
    React.useEffect(() => {
        const intervals: Record<string, string> = { '7D': '4h', '30D': '1d' };
        const limits: Record<string, number> = { '7D': 42, '30D': 30 };
        Object.entries(intervals).forEach(([tf, interval]) => {
            if (extPriceData[tf]) return;
            fetch(`https://api.binance.com/api/v3/klines?symbol=${binanceSym}&interval=${interval}&limit=${limits[tf]}`)
                .then(r => r.json())
                .then((d: any[]) => {
                    if (Array.isArray(d)) {
                        setExtPriceData(prev => ({ ...prev, [tf]: d.map((c: any) => parseFloat(c[4])) }));
                    }
                }).catch(() => {});
        });
    }, [ticker]);

    // Fetch market cap data from CoinGecko when MCAP mode is selected
    React.useEffect(() => {
        if (mode !== 'MCAP' || !geckoId) return;
        const tfDays: Record<string, string> = { '24H': '1', '7D': '7', '30D': '30' };
        const days = tfDays[timeframe];
        const cacheKey = timeframe;
        if (mcapDataMap[cacheKey]) return;
        setMcapLoading(true);
        fetch(`https://api.coingecko.com/api/v3/coins/${geckoId}/market_chart?vs_currency=usd&days=${days}`)
            .then(r => r.json())
            .then(d => {
                if (d?.market_caps) {
                    setMcapDataMap(prev => ({ ...prev, [cacheKey]: d.market_caps.map((c: any) => c[1]) }));
                }
            })
            .catch(() => {})
            .finally(() => setMcapLoading(false));
    }, [mode, timeframe, geckoId]);

    const priceDataForTf = timeframe === '24H' ? priceData : (extPriceData[timeframe] || []);
    const activeData = mode === 'PRICE' ? priceDataForTf : (mcapDataMap[timeframe] || []);
    const loading = activeData.length < 2 || (mode === 'MCAP' && mcapLoading && (mcapDataMap[timeframe] || []).length < 2);

    const w = 800, h = 280;
    const pad = { top: 20, right: 16, bottom: 36, left: 78 };

    const min = loading ? 0 : Math.min(...activeData);
    const max = loading ? 1 : Math.max(...activeData);
    const range = max - min || 1;
    const toX = (i: number) => pad.left + (i / Math.max(activeData.length - 1, 1)) * (w - pad.left - pad.right);
    const toY = (v: number) => pad.top + ((max - v) / range) * (h - pad.top - pad.bottom);

    // Purple for MCAP (matches dashboard equity chart), green/red for PRICE
    const color = mode === 'MCAP' ? 'var(--iris-violet)' : (up ? 'var(--pnl-up)' : 'var(--pnl-down)');
    const colorOklch = mode === 'MCAP' ? 'oklch(0.68 0.22 295)' : (up ? 'oklch(0.78 0.18 150)' : 'oklch(0.66 0.22 25)');

    const formatTick = (v: number) => {
        if (mode === 'MCAP') {
            if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
            if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
            if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
        }
        return v >= 1000 ? `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : v >= 1 ? `$${v.toFixed(2)}` : `$${v.toFixed(5)}`;
    };

    const ticks = !loading ? [0, 1, 2, 3].map(i => min + (range * (3 - i)) / 3) : [];
    const now = new Date();
    const xTickCount = 5;
    const xTickIdxs = Array.from({ length: xTickCount }, (_, i) => Math.round((i / (xTickCount - 1)) * Math.max(activeData.length - 1, 0)));
    const getXLabel = (i: number) => {
        if (timeframe === '24H') {
            const hoursAgo = activeData.length - 1 - i;
            const d = new Date(now.getTime() - hoursAgo * 3600 * 1000);
            return d.getHours().toString().padStart(2, '0') + ':00';
        }
        const daysAgo = Math.round((activeData.length - 1 - i) * (timeframe === '7D' ? 7 : 30) / activeData.length);
        const d = new Date(now.getTime() - daysAgo * 86400 * 1000);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const hoveredVal = hoveredIdx !== null && activeData[hoveredIdx] != null ? activeData[hoveredIdx] : null;
    const hoveredX = hoveredIdx !== null ? toX(hoveredIdx) : null;
    const hoveredY = hoveredVal != null ? toY(hoveredVal) : null;

    const firstVal = activeData[0];
    const lastVal = activeData[activeData.length - 1];
    const pctChange = firstVal && lastVal ? ((lastVal - firstVal) / firstVal) * 100 : null;

    const S = {
        mono: { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1' } as React.CSSProperties,
        label: { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em' } as React.CSSProperties,
    };

    return (
        <div style={{ width: '100%' }}>
            {/* Header: value + controls */}
            <div className="token-chart-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px 0', gap: 8, flexWrap: 'wrap' }}>
                {/* Left: value + change */}
                <div style={{ minWidth: 0, flex: '1 1 160px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ ...S.mono, fontSize: 20, fontWeight: 700, color: 'var(--fg)', lineHeight: 1 }}>
                            {hoveredVal != null ? formatTick(hoveredVal) : (!loading && lastVal ? formatTick(lastVal) : (mcapLoading ? 'Loading…' : '—'))}
                        </span>
                        {pctChange != null && hoveredIdx === null && (
                            <span style={{ ...S.mono, fontSize: 11, fontWeight: 700, color: pctChange >= 0 ? 'var(--pnl-up)' : 'var(--pnl-down)', background: pctChange >= 0 ? 'oklch(0.68 0.18 162 / 0.1)' : 'oklch(0.65 0.2 25 / 0.1)', borderRadius: 6, padding: '2px 7px', flexShrink: 0 }}>
                                {pctChange >= 0 ? '▲' : '▼'} {Math.abs(pctChange).toFixed(2)}%
                            </span>
                        )}
                        {hoveredIdx !== null && hoveredVal != null && (
                            <span style={{ ...S.label, fontSize: 9, color: 'var(--fg-subtle)' }}>{getXLabel(hoveredIdx)}</span>
                        )}
                    </div>
                    <div style={{ ...S.label, fontSize: 9, color: 'var(--fg-subtle)', marginTop: 3 }}>
                        {mode === 'PRICE' ? 'Price' : 'Market Cap'} · {timeframe} · {mode === 'MCAP' ? 'CoinGecko' : 'Binance'}
                    </div>
                </div>
                {/* Right: mode + timeframe — inline on mobile */}
                <div className="token-chart-controls" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', background: 'var(--chip-bg)', borderRadius: 8, padding: 3, border: '1px solid var(--hairline)', gap: 2 }}>
                        {(['PRICE', 'MCAP'] as const).map(m => (
                            <button key={m} onClick={() => setMode(m)} style={{
                                padding: '4px 10px', borderRadius: 6,
                                border: mode === m ? '1px solid var(--iris-violet)' : '1px solid transparent',
                                cursor: 'pointer', ...S.mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
                                background: mode === m ? 'var(--bg-base-2)' : 'transparent',
                                color: mode === m ? 'var(--fg)' : 'var(--fg-subtle)',
                                boxShadow: mode === m ? '0 1px 4px rgba(0,0,0,0.2)' : 'none',
                                transition: 'all 0.15s', whiteSpace: 'nowrap',
                            }}>
                                {m === 'PRICE' ? 'Price' : 'Mkt Cap'}
                            </button>
                        ))}
                    </div>
                    <div style={{ display: 'flex', gap: 2 }}>
                        {(['24H', '7D', '30D'] as const).map(tf => (
                            <button key={tf} onClick={() => setTimeframe(tf)} style={{
                                padding: '3px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                                ...S.label, fontSize: 9,
                                background: timeframe === tf ? 'var(--bg-base-2)' : 'transparent',
                                color: timeframe === tf ? 'var(--fg)' : 'var(--fg-subtle)',
                                boxShadow: timeframe === tf ? '0 1px 4px rgba(0,0,0,0.15)' : 'none',
                                transition: 'all 0.15s',
                            }}>
                                {tf}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* SVG Chart — responsive, no fixed height */}
            <div style={{ position: 'relative', userSelect: 'none', marginTop: 8 }}>
                {loading && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
                        <span style={{ ...S.label, fontSize: 9, color: 'var(--fg-subtle)' }}>
                            {mcapLoading ? 'Fetching market cap data…' : 'Loading chart…'}
                        </span>
                    </div>
                )}
                <svg
                    viewBox={`0 0 ${w} ${h}`}
                    className="token-chart-svg"
                    style={{ width: '100%', height: 'auto', minHeight: 200, maxHeight: 320, display: 'block', overflow: 'visible', opacity: loading ? 0.2 : 1, transition: 'opacity 0.3s' }}
                    preserveAspectRatio="xMidYMid meet"
                    onMouseLeave={() => setHoveredIdx(null)}
                    onMouseMove={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const svgX = ((e.clientX - rect.left) / rect.width) * w;
                        const frac = Math.max(0, Math.min(1, (svgX - pad.left) / (w - pad.left - pad.right)));
                        setHoveredIdx(Math.round(frac * (activeData.length - 1)));
                    }}
                    onTouchMove={(e) => {
                        e.preventDefault();
                        const touch = e.touches[0];
                        const rect = e.currentTarget.getBoundingClientRect();
                        const svgX = ((touch.clientX - rect.left) / rect.width) * w;
                        const frac = Math.max(0, Math.min(1, (svgX - pad.left) / (w - pad.left - pad.right)));
                        setHoveredIdx(Math.round(frac * (activeData.length - 1)));
                    }}
                    onTouchEnd={() => setHoveredIdx(null)}
                >
                    <defs>
                        <linearGradient id={`fill-${ticker}-${mode}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={colorOklch} stopOpacity="0.28"/>
                            <stop offset="65%" stopColor={colorOklch} stopOpacity="0.06"/>
                            <stop offset="100%" stopColor={colorOklch} stopOpacity="0"/>
                        </linearGradient>
                        <clipPath id={`clip-${ticker}-${mode}`}>
                            <rect x={pad.left} y={pad.top} width={w - pad.left - pad.right} height={h - pad.top - pad.bottom}/>
                        </clipPath>
                    </defs>

                    {/* Grid lines */}
                    {ticks.map((t, i) => (
                        <line key={i} x1={pad.left} x2={w - pad.right} y1={toY(t)} y2={toY(t)}
                            stroke="var(--hairline)" strokeWidth="0.5" strokeDasharray="4,6"/>
                    ))}

                    {/* Hover vertical line */}
                    {hoveredIdx !== null && hoveredX !== null && (
                        <line x1={hoveredX} x2={hoveredX} y1={pad.top} y2={h - pad.bottom}
                            stroke={color} strokeWidth="1" strokeDasharray="3,4" strokeOpacity="0.45"/>
                    )}

                    {/* Fill */}
                    {!loading && (
                        <path
                            d={`${activeData.map((v, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ')} L${toX(activeData.length-1).toFixed(1)},${(h-pad.bottom).toFixed(1)} L${pad.left},${(h-pad.bottom).toFixed(1)} Z`}
                            fill={`url(#fill-${ticker}-${mode})`}
                            clipPath={`url(#clip-${ticker}-${mode})`}
                        />
                    )}

                    {/* Line */}
                    {!loading && (
                        <polyline
                            points={activeData.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ')}
                            fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
                            clipPath={`url(#clip-${ticker}-${mode})`}
                        />
                    )}

                    {/* Hover dot */}
                    {hoveredIdx !== null && hoveredX !== null && hoveredY !== null && (
                        <>
                            <circle cx={hoveredX} cy={hoveredY} r={6} fill={color} fillOpacity={0.15}/>
                            <circle cx={hoveredX} cy={hoveredY} r={4} fill={color} stroke="var(--bg-base)" strokeWidth={2}/>
                        </>
                    )}

                    {/* Endpoint dot */}
                    {!loading && hoveredIdx === null && (
                        <circle cx={toX(activeData.length-1)} cy={toY(activeData[activeData.length-1])} r={4}
                            fill={color} stroke="var(--bg-base)" strokeWidth={2}/>
                    )}

                    {/* Y labels */}
                    {ticks.map((t, i) => (
                        <text key={i} x={pad.left - 8} y={toY(t) + 4} textAnchor="end"
                            style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--fg-subtle)' }}>
                            {formatTick(t)}
                        </text>
                    ))}

                    {/* X labels */}
                    {xTickIdxs.map(i => (
                        <text key={i} x={toX(i)} y={h - 8} textAnchor="middle"
                            style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--fg-subtle)' }}>
                            {getXLabel(i)}
                        </text>
                    ))}

                    {/* VELO watermark */}
                    <text x={w/2} y={h/2+10} textAnchor="middle"
                        style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 32,
                            fill: 'var(--fg)', opacity: 0.03, letterSpacing: '-0.02em', userSelect: 'none' }}>
                        VELO
                    </text>
                </svg>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4, padding: '4px 14px 12px' }}>
                <span style={{ ...S.label, fontSize: 9, color: 'var(--fg-subtle)' }}>{timeframe} · {mode === 'MCAP' ? 'CoinGecko' : 'Binance'}</span>
                {!loading && <span style={{ ...S.label, fontSize: 9, color: 'var(--fg-subtle)' }}>Low: {formatTick(min)} · High: {formatTick(max)}</span>}
            </div>
        </div>
    );
};

const TokenPage = ({ ticker, posts, traders, user, prices, changes, onClose, onLike, onRepost, onComment, onViewProfile, showUsersModal, onDeletePost, onDeleteComment, handleCopyTrade, onNavigateToTrade, watchlist, onToggleWatchlist, onSinglePost, onNavigateToTicker }: any) => {
    const [activeTab, setActiveTab] = useState<'posts' | 'news'>('posts');
    const [news, setNews] = useState<any[]>([]);
    const [newsLoading, setNewsLoading] = useState(true);
    const [sparkData, setSparkData] = useState<number[]>([]);
    const [tokenInfo, setTokenInfo] = useState<any>(null);
    const [descExpanded, setDescExpanded] = useState(false);

    const pairId = SOCIAL_FEATURED_PAIRS.find(p => p.symbol === ticker)?.pairId || `${ticker}/USD`;
    const price = prices[pairId];
    const chg = changes[pairId] ?? 0;
    const up = chg >= 0;
    const pairInfo = SOCIAL_FEATURED_PAIRS.find(p => p.symbol === ticker);
    const meta = TOKEN_META[ticker];
    const binanceSym = (pairInfo?.binance) || `${ticker}USDT`;

    const tickerPosts = React.useMemo(() => {
        return posts.filter((p: any) =>
            (p.content || '').toUpperCase().includes(`$${ticker.toUpperCase()}`)
        ).sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }, [posts, ticker]);

    // Fetch 24h hourly sparkline from Binance
    React.useEffect(() => {
        setSparkData([]);
        fetch(`https://api.binance.com/api/v3/klines?symbol=${binanceSym}&interval=1h&limit=24`)
            .then(r => r.json())
            .then((d: any[]) => { if (Array.isArray(d)) setSparkData(d.map((c: any) => parseFloat(c[4]))); })
            .catch(() => {});
    }, [ticker, binanceSym]);

    // Fetch token info from CoinGecko
    React.useEffect(() => {
        if (!meta?.geckoId) return;
        fetch(`https://api.coingecko.com/api/v3/coins/${meta.geckoId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false`)
            .then(r => r.json())
            .then(d => setTokenInfo(d))
            .catch(() => {});
    }, [ticker, meta?.geckoId]);

    // Fetch news
    React.useEffect(() => {
        setNewsLoading(true);
        const categories = ticker === 'BTC' ? 'BTC' : ticker === 'ETH' ? 'ETH' : ticker === 'SOL' ? 'SOL' : ticker;
        fetch(`https://min-api.cryptocompare.com/data/v2/news/?categories=${categories}&extraParams=Velo&sortOrder=latest`)
            .then(r => r.json())
            .then(d => { setNews((d.Data || []).slice(0, 8)); setNewsLoading(false); })
            .catch(() => { setNews([]); setNewsLoading(false); });
    }, [ticker]);

    const S = {
        mono: { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1' } as React.CSSProperties,
        display: { fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' } as React.CSSProperties,
        label: { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)' } as React.CSSProperties,
    };
    const panel: React.CSSProperties = { background: 'var(--glass-bg)', border: '1px solid var(--hairline)', borderRadius: 14, backdropFilter: 'blur(8px) saturate(1.1)', WebkitBackdropFilter: 'blur(8px) saturate(1.1)', boxShadow: 'var(--glass-shadow)', overflow: 'hidden' };

    const handleViewProfileWrapper = (partial: { id: string }) => {
        const trader = traders.find((t: any) => t.id === partial.id);
        if (trader) onViewProfile(trader); else if (user && user.id === partial.id) onViewProfile(user);
    };

    // Sentiment — derived from post keyword analysis
    const bullCount = tickerPosts.filter((p: any) => {
        const c = (p.content || '').toLowerCase();
        return c.includes('bull') || c.includes('moon') || c.includes('long') || c.includes('buy') || c.includes('up') || c.includes('pumping');
    }).length;
    const bearCount = tickerPosts.filter((p: any) => {
        const c = (p.content || '').toLowerCase();
        return c.includes('bear') || c.includes('short') || c.includes('sell') || c.includes('dump') || c.includes('down') || c.includes('crash');
    }).length;
    const sentimentTotal = bullCount + bearCount || 1;
    const bullPct = Math.round((bullCount / sentimentTotal) * 100);
    const bearPct = 100 - bullPct;
    // When there are no posts, show market-sentiment proxy from price change
    const bullPctDisplay = tickerPosts.length > 0 ? bullPct : (up ? Math.round(50 + Math.min(Math.abs(chg) * 3, 45)) : Math.round(50 - Math.min(Math.abs(chg) * 3, 45)));
    const bearPctDisplay = 100 - bullPctDisplay;

    const mcap = tokenInfo?.market_data?.market_cap?.usd;
    const volume24h = tokenInfo?.market_data?.total_volume?.usd;
    const circulatingSupply = tokenInfo?.market_data?.circulating_supply;
    const ath = tokenInfo?.market_data?.ath?.usd;
    const athDate = tokenInfo?.market_data?.ath_date?.usd;
    const priceChange7d = tokenInfo?.market_data?.price_change_percentage_7d;
    const priceChange30d = tokenInfo?.market_data?.price_change_percentage_30d;
    const rank = tokenInfo?.market_cap_rank;
    const fdv = tokenInfo?.market_data?.fully_diluted_valuation?.usd;

    const formatLarge = (n?: number) => {
        if (!n) return '—';
        if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
        if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
        if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
        return `$${n.toFixed(2)}`;
    };

    const description = meta?.longDescription || meta?.description || tokenInfo?.description?.en?.split('. ').slice(0, 3).join('. ') || '';
    const descShort = description.length > 220 ? description.slice(0, 220).trimEnd() + '…' : description;

    return (
        <div style={{ width: "100%", maxWidth: 1600, margin: "0 auto", paddingBottom: "max(80px, calc(env(safe-area-inset-bottom, 0px) + 80px))" }} className="animate-fade-in">
            {/* Back button */}
            <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 14, padding: 0 }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--fg)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--fg-muted)'}>
                ← BACK TO FEED
            </button>

            {/* Token header */}
            <div style={{ ...panel, padding: '14px 16px', marginBottom: 12 }}>
                <div className="token-header-inner" style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' as const }}>
                    <div className="token-header-left" style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                        {(pairInfo?.logo || tokenInfo?.image?.large) && (
                            <img src={pairInfo?.logo || tokenInfo?.image?.large} style={{ width: 44, height: 44, borderRadius: '50%', border: '2px solid var(--hairline)', flexShrink: 0 }} />
                        )}
                        <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                                <span style={{ ...S.display, fontSize: 22, color: 'var(--fg)' }}>${ticker}</span>
                                {(pairInfo?.name || tokenInfo?.name) && (
                                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--fg-subtle)' }}>{pairInfo?.name || tokenInfo?.name}</span>
                                )}
                                {rank && <span style={{ ...S.label, fontSize: 9, background: 'var(--chip-bg)', border: '1px solid var(--hairline)', borderRadius: 6, padding: '2px 7px', color: 'var(--iris-violet)' }}>#{rank}</span>}
                                {meta?.category && <span style={{ ...S.label, fontSize: 9, background: 'oklch(0.68 0.22 295 / 0.08)', border: '1px solid oklch(0.68 0.22 295 / 0.2)', borderRadius: 6, padding: '2px 8px', color: 'var(--iris-violet)' }}>{meta.category}</span>}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{ ...S.mono, fontSize: 20, fontWeight: 700, color: 'var(--fg)', lineHeight: 1 }}>
                                    {price != null ? (price >= 1000 ? `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : price >= 1 ? `$${price.toFixed(3)}` : `$${price.toFixed(6)}`) : '—'}
                                </span>
                                <span style={{ ...S.mono, fontSize: 12, fontWeight: 700, color: up ? 'var(--pnl-up)' : 'var(--pnl-down)', background: up ? 'oklch(0.68 0.18 162 / 0.1)' : 'oklch(0.65 0.2 25 / 0.1)', borderRadius: 6, padding: '2px 7px', flexShrink: 0 }}>
                                    {up ? '▲' : '▼'} {Math.abs(chg).toFixed(2)}% 24h
                                </span>
                                {priceChange7d != null && (
                                    <span className="hide-mobile" style={{ ...S.mono, fontSize: 11, fontWeight: 700, color: priceChange7d >= 0 ? 'var(--pnl-up)' : 'var(--pnl-down)', opacity: 0.8 }}>
                                        7d: {priceChange7d >= 0 ? '+' : ''}{priceChange7d.toFixed(2)}%
                                    </span>
                                )}
                                {priceChange30d != null && (
                                    <span className="hide-mobile" style={{ ...S.mono, fontSize: 11, fontWeight: 700, color: priceChange30d >= 0 ? 'var(--pnl-up)' : 'var(--pnl-down)', opacity: 0.8 }}>
                                        30d: {priceChange30d >= 0 ? '+' : ''}{priceChange30d.toFixed(2)}%
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right: Watchlist + Trade button */}
                    <div className="token-header-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        {onToggleWatchlist && (() => {
                            const pairId = `${ticker}/USD`;
                            const isFav = watchlist?.includes(pairId);
                            return (
                                <button
                                    onClick={() => onToggleWatchlist(pairId)}
                                    title={isFav ? 'Remove from watchlist' : 'Add to watchlist'}
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 10, border: `1px solid ${isFav ? 'oklch(0.80 0.16 60 / 0.5)' : 'var(--hairline-strong)'}`, background: isFav ? 'oklch(0.80 0.16 60 / 0.1)' : 'var(--chip-bg)', cursor: 'pointer', color: isFav ? 'oklch(0.80 0.16 60)' : 'var(--fg-subtle)', transition: 'all 0.15s' }}
                                    onMouseEnter={e => { if (!isFav) { (e.currentTarget as HTMLElement).style.borderColor = 'oklch(0.80 0.16 60 / 0.4)'; (e.currentTarget as HTMLElement).style.color = 'oklch(0.80 0.16 60)'; }}}
                                    onMouseLeave={e => { if (!isFav) { (e.currentTarget as HTMLElement).style.borderColor = 'var(--hairline-strong)'; (e.currentTarget as HTMLElement).style.color = 'var(--fg-subtle)'; }}}>
                                    <Star size={16} fill={isFav ? 'currentColor' : 'none'} strokeWidth={1.5}/>
                                </button>
                            );
                        })()}
                        {onNavigateToTrade && (
                            <button
                                className="token-trade-btn"
                                onClick={() => onNavigateToTrade(ticker)}
                                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'var(--holo-linear)', backgroundSize: '220% 100%', animation: 'holoSlide 9s linear infinite', color: '#0B0B0E', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', boxShadow: '0 2px 12px oklch(0.68 0.22 295 / 0.25)', transition: 'transform 0.1s, box-shadow 0.1s', whiteSpace: 'nowrap' }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.03)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px oklch(0.68 0.22 295 / 0.4)'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 12px oklch(0.68 0.22 295 / 0.25)'; }}>
                                <TrendingUp size={13} strokeWidth={2.5}/> Trade ${ticker}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="token-page-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Interactive chart */}
                    <div style={{ ...panel, padding: 0, overflow: 'hidden' }}>
                        <TokenInteractiveChart
                            priceData={sparkData}
                            up={up}
                            ticker={ticker}
                            currentPrice={price || 0}
                            geckoId={meta?.geckoId}
                        />
                    </div>

                    {/* Stats strip */}
                    {(mcap || ath || circulatingSupply) && (
                        <div style={{ ...panel, padding: '12px 16px' }}>
                            <div className="token-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 14 }}>
                                {mcap && (
                                    <div>
                                        <div style={{ ...S.label, fontSize: 9, marginBottom: 3 }}>Market Cap</div>
                                        <div style={{ ...S.mono, fontSize: 14, fontWeight: 700, color: 'var(--fg)' }}>{formatLarge(mcap)}</div>
                                    </div>
                                )}
                                {volume24h && (
                                    <div>
                                        <div style={{ ...S.label, fontSize: 9, marginBottom: 3 }}>24h Volume</div>
                                        <div style={{ ...S.mono, fontSize: 14, fontWeight: 700, color: 'var(--fg)' }}>{formatLarge(volume24h)}</div>
                                    </div>
                                )}
                                {circulatingSupply && (
                                    <div>
                                        <div style={{ ...S.label, fontSize: 9, marginBottom: 3 }}>Circulating</div>
                                        <div style={{ ...S.mono, fontSize: 14, fontWeight: 700, color: 'var(--fg)' }}>
                                            {circulatingSupply >= 1e12 ? `${(circulatingSupply / 1e12).toFixed(2)}T` : circulatingSupply >= 1e9 ? `${(circulatingSupply / 1e9).toFixed(2)}B` : circulatingSupply >= 1e6 ? `${(circulatingSupply / 1e6).toFixed(2)}M` : circulatingSupply.toFixed(0)}
                                        </div>
                                    </div>
                                )}
                                {ath && (
                                    <div>
                                        <div style={{ ...S.label, fontSize: 9, marginBottom: 3 }}>All-Time High</div>
                                        <div style={{ ...S.mono, fontSize: 14, fontWeight: 700, color: 'var(--fg)' }}>{ath >= 1000 ? `$${ath.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : `$${ath.toFixed(4)}`}</div>
                                        {athDate && <div style={{ ...S.label, fontSize: 8, marginTop: 2 }}>{new Date(athDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</div>}
                                    </div>
                                )}
                                {meta?.supply && (
                                    <div>
                                        <div style={{ ...S.label, fontSize: 9, marginBottom: 3 }}>Max Supply</div>
                                        <div style={{ ...S.mono, fontSize: 14, fontWeight: 700, color: 'var(--fg)' }}>{meta.supply}</div>
                                    </div>
                                )}
                                {fdv && (
                                    <div>
                                        <div style={{ ...S.label, fontSize: 9, marginBottom: 3 }}>FDV</div>
                                        <div style={{ ...S.mono, fontSize: 14, fontWeight: 700, color: 'var(--fg)' }}>{formatLarge(fdv)}</div>
                                    </div>
                                )}
                                {meta?.launchYear && (
                                    <div>
                                        <div style={{ ...S.label, fontSize: 9, marginBottom: 3 }}>Launched</div>
                                        <div style={{ ...S.mono, fontSize: 14, fontWeight: 700, color: 'var(--fg)' }}>{meta.launchYear}</div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* About section — rich description */}
                    {description && (
                        <div style={{ ...panel, padding: '16px 18px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--holo-linear)', backgroundSize: '220% 100%', display: 'inline-block' }}/>
                                <span style={{ ...S.display, fontSize: 15, color: 'var(--fg)' }}>About {pairInfo?.name || ticker}</span>
                                {meta?.category && (
                                    <span style={{ marginLeft: 'auto', ...S.label, fontSize: 9, color: 'var(--iris-violet)', background: 'oklch(0.68 0.22 295 / 0.08)', border: '1px solid oklch(0.68 0.22 295 / 0.2)', borderRadius: 6, padding: '2px 8px' }}>
                                        {meta.category}
                                    </span>
                                )}
                            </div>
                            <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13.5, color: 'var(--fg-muted)', lineHeight: 1.7, marginBottom: 10 }}>
                                {descExpanded ? description : descShort}
                            </p>
                            {description.length > 220 && (
                                <button onClick={() => setDescExpanded(e => !e)} style={{ background: 'none', border: 'none', cursor: 'pointer', ...S.label, fontSize: 10, color: 'var(--iris-violet)', padding: 0, marginBottom: 12 }}>
                                    {descExpanded ? 'Show less ↑' : 'Read more ↓'}
                                </button>
                            )}
                            {(meta?.website || meta?.twitter || meta?.whitepaper) && (
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {meta.website && (
                                        <a href={meta.website} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 8, border: '1px solid var(--hairline)', background: 'var(--chip-bg)', textDecoration: 'none', ...S.label, fontSize: 10, color: 'var(--fg)', transition: 'border-color 0.15s' }}
                                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--iris-violet)'}
                                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--hairline)'}>
                                            <ExternalLink size={11}/> Website
                                        </a>
                                    )}
                                    {meta.twitter && (
                                        <a href={meta.twitter} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 8, border: '1px solid var(--hairline)', background: 'var(--chip-bg)', textDecoration: 'none', ...S.label, fontSize: 10, color: 'var(--fg)', transition: 'border-color 0.15s' }}
                                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--iris-violet)'}
                                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--hairline)'}>
                                            𝕏 Twitter
                                        </a>
                                    )}
                                    {meta.whitepaper && (
                                        <a href={meta.whitepaper} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 8, border: '1px solid var(--hairline)', background: 'var(--chip-bg)', textDecoration: 'none', ...S.label, fontSize: 10, color: 'var(--fg)', transition: 'border-color 0.15s' }}
                                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--iris-violet)'}
                                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--hairline)'}>
                                            <ExternalLink size={11}/> Whitepaper
                                        </a>
                                    )}
                                    {meta?.geckoId && (
                                        <a href={`https://www.coingecko.com/en/coins/${meta.geckoId}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 8, border: '1px solid var(--hairline)', background: 'var(--chip-bg)', textDecoration: 'none', ...S.label, fontSize: 10, color: 'var(--fg)', transition: 'border-color 0.15s' }}
                                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--iris-violet)'}
                                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--hairline)'}>
                                            <ExternalLink size={11}/> CoinGecko
                                        </a>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Tabs */}
                    <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--hairline)' }}>
                        {(['posts', 'news'] as const).map(tab => (
                            <button key={tab} onClick={() => setActiveTab(tab)}
                                style={{ padding: '8px 20px', border: 'none', background: 'transparent', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer', color: activeTab === tab ? 'var(--fg)' : 'var(--fg-subtle)', borderBottom: activeTab === tab ? '2px solid var(--iris-violet)' : '2px solid transparent', textTransform: 'uppercase' as const, marginBottom: -1 }}>
                                {tab === 'posts' ? `Posts (${tickerPosts.length})` : 'News'}
                            </button>
                        ))}
                    </div>

                    {activeTab === 'posts' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {tickerPosts.length === 0 ? (
                                <div style={{ ...panel, padding: '40px 20px', textAlign: 'center' }}>
                                    <p style={{ ...S.display, fontSize: 20, color: 'var(--fg)', marginBottom: 6 }}>No posts yet.</p>
                                    <p style={{ ...S.label, fontSize: 10 }}>Be the first to mention ${ticker} in the feed.</p>
                                </div>
                            ) : tickerPosts.map((post: any) => (
                                <PostCard key={post.id} post={post} user={user} onLike={onLike} onRepost={onRepost} onComment={onComment} handleCopyTrade={handleCopyTrade} onViewProfile={handleViewProfileWrapper} showUsersModal={showUsersModal} onDelete={onDeletePost} onDeleteComment={onDeleteComment} traders={traders} onTickerClick={(t: string) => { if (onNavigateToTicker) onNavigateToTicker(t); }} onSinglePost={onSinglePost} />
                            ))}
                        </div>
                    )}

                    {activeTab === 'news' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {newsLoading ? (
                                <div style={{ ...panel, padding: 24, textAlign: 'center' }}>
                                    <p style={{ ...S.label, fontSize: 10 }}>Loading news…</p>
                                </div>
                            ) : news.length === 0 ? (
                                <div style={{ ...panel, padding: 24, textAlign: 'center' }}>
                                    <p style={{ ...S.label, fontSize: 10 }}>No news found.</p>
                                </div>
                            ) : news.map((article: any) => (
                                <a key={article.id} href={article.url} target="_blank" rel="noopener noreferrer"
                                    style={{ ...panel, padding: '14px 16px', display: 'flex', gap: 14, textDecoration: 'none', transition: 'border-color 0.15s' }}
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--iris-violet)'}
                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--hairline)'}>
                                    {article.imageurl && (
                                        <img src={article.imageurl} style={{ width: 72, height: 72, borderRadius: 8, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--hairline)' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                    )}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 600, color: 'var(--fg)', lineHeight: 1.4, marginBottom: 5 }}>{article.title}</p>
                                        <p style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>{article.body}</p>
                                        <div style={{ display: 'flex', gap: 10, marginTop: 7, alignItems: 'center' }}>
                                            <span style={{ ...S.label, fontSize: 9 }}>{article.source_info?.name || article.source}</span>
                                            <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--fg-subtle)', display: 'inline-block' }}/>
                                            <span style={{ ...S.label, fontSize: 9 }}>{new Date(article.published_on * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                    </div>
                                </a>
                            ))}
                        </div>
                    )}
                </div>

                {/* Right sidebar — related tokens + top posters */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="vp" style={panel}>
                        <div style={{ padding: '14px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--holo-linear)', backgroundSize: '220% 100%', display: 'inline-block' }}/>
                                <span style={{ ...S.display, fontSize: 15, color: 'var(--fg)' }}>Related tokens</span>
                            </div>
                            {TOP_SOCIAL_PAIRS.filter(p => p.symbol !== ticker).map(p => {
                                const pc = changes[p.pairId] ?? 0;
                                const pu = pc >= 0;
                                return (
                                    <div key={p.symbol} onClick={() => onClose(p.symbol)}
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--hairline)', cursor: 'pointer', gap: 8 }}
                                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.7'}
                                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                                            <img src={p.logo} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid var(--hairline)', flexShrink: 0 }}/>
                                            <span style={{ ...S.mono, fontSize: 13, fontWeight: 700, color: 'var(--fg)' }}>{p.symbol}</span>
                                        </div>
                                        <span style={{ ...S.mono, fontSize: 12, fontWeight: 700, color: pu ? 'var(--pnl-up)' : 'var(--pnl-down)', flexShrink: 0 }}>{pu ? '+' : ''}{pc.toFixed(2)}%</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    {/* Top posters for this ticker */}
                    <div className="vp" style={panel}>
                        <div style={{ padding: '14px 16px' }}>
                            <p style={{ ...S.label, marginBottom: 12 }}>Top posters · ${ticker}</p>
                            {(() => {
                                const counts: Record<string, { trader: any; count: number }> = {};
                                tickerPosts.forEach((p: any) => {
                                    if (!counts[p.authorId]) {
                                        const t = traders.find((tr: any) => tr.id === p.authorId);
                                        if (t) counts[p.authorId] = { trader: t, count: 0 };
                                    }
                                    if (counts[p.authorId]) counts[p.authorId].count++;
                                });
                                const sorted = Object.values(counts).sort((a: any, b: any) => b.count - a.count).slice(0, 5);
                                if (sorted.length === 0) return <p style={{ ...S.label, fontSize: 9, color: 'var(--fg-subtle)', textAlign: 'center', padding: '8px 0' }}>No posts yet</p>;
                                return sorted.map(({ trader, count }: any) => (
                                    <div key={trader.id} onClick={() => onViewProfile(trader)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--hairline)', cursor: 'pointer' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                            <img src={trader.avatar} style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid var(--hairline)' }}/>
                                            <div>
                                                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--fg)', display: 'block' }}>{trader.username}</span>
                                                <span style={{ ...S.label, fontSize: 9 }}>{trader.handle}</span>
                                            </div>
                                        </div>
                                        <span style={{ ...S.label, fontSize: 9, color: 'var(--iris-violet)' }}>{count} post{count !== 1 ? 's' : ''}</span>
                                    </div>
                                ));
                            })()}
                        </div>
                    </div>
                    {/* Quick trade CTA */}
                    {onNavigateToTrade && (
                        <div style={{ ...panel, padding: '14px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--holo-linear)', backgroundSize: '220% 100%', display: 'inline-block' }}/>
                                <span style={{ ...S.display, fontSize: 14, color: 'var(--fg)' }}>Trade now</span>
                            </div>
                            <p style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--fg-muted)', marginBottom: 12, lineHeight: 1.5 }}>Open a long or short position on ${ticker} with up to 50× leverage.</p>
                            <button
                                onClick={() => onNavigateToTrade(ticker)}
                                style={{ width: '100%', padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'var(--holo-linear)', backgroundSize: '220% 100%', animation: 'holoSlide 9s linear infinite', color: '#0B0B0E', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', transition: 'opacity 0.15s' }}
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.85'}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}>
                                Open ${ticker} Trade →
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─── Single Post View (like Twitter /status/:id) ────────────────────────────
const SinglePostView = ({ postId, posts, user, traders, onLike, onRepost, onComment, onDeletePost, onDeleteComment, onViewProfile, showUsersModal, handleCopyTrade, onBack, onTickerClick }: any) => {
    const post = posts.find((p: any) => p.id === postId);

    // Update page title and OG meta for this post
    useEffect(() => {
        if (!post) return;
        const prev = document.title;
        document.title = `${post.authorHandle} on Velo — "${post.content.slice(0, 60)}${post.content.length > 60 ? '…' : ''}"`;
        return () => { document.title = prev; };
    }, [post?.id]);

    const S = {
        mono: { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1' } as React.CSSProperties,
        display: { fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' } as React.CSSProperties,
        label: { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)' } as React.CSSProperties,
    };

    if (!post) return (
        <div style={{ maxWidth: 620, margin: '80px auto', textAlign: 'center', padding: '0 24px' }}>
            <div style={{ ...S.display, fontSize: 32, color: 'var(--fg)', marginBottom: 8 }}>Post not found.</div>
            <p style={{ ...S.mono, fontSize: 12, color: 'var(--fg-subtle)', marginBottom: 24 }}>This post may have been deleted or doesn't exist.</p>
            <button onClick={onBack} style={{ padding: '10px 24px', borderRadius: 24, border: '1px solid var(--hairline-strong)', background: 'transparent', color: 'var(--fg)', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>← Back to feed</button>
        </div>
    );

    const hasLiked = post.likedBy?.includes(user?.id);
    const hasReposted = post.repostedBy?.includes(user?.id);
    const canDelete = user && onDeletePost && (user.id === post.authorId);
    const postDate = new Date(post.timestamp);

    return (
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 0 80px' }}>
            {/* Back nav */}
            <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '12px 0 20px', background: 'none', border: 'none', color: 'var(--fg-subtle)', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer', textTransform: 'uppercase' as const, transition: 'color 0.15s' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--fg)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--fg-subtle)'}>
                <ChevronLeft size={14}/> Feed
            </button>

            {/* Main post card — full featured, no truncation */}
            <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--hairline-strong)', borderRadius: 20, backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)', overflow: 'hidden', position: 'relative' as const }}>
                {/* Holo accent bar */}
                <div style={{ height: 3, background: 'linear-gradient(90deg, var(--iris-violet), var(--iris-magenta), var(--iris-cyan), var(--iris-violet))', backgroundSize: '200% 100%', animation: 'holoSlide 4s linear infinite' }} />

                {/* Author header */}
                <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                        <div style={{ cursor: 'pointer', position: 'relative' as const }} onClick={() => onViewProfile({ id: post.authorId })}>
                            <img src={post.authorAvatar} style={{ width: 52, height: 52, borderRadius: '50%', border: '2px solid var(--hairline-strong)', display: 'block' }} />
                            {/* Online pulse dot */}
                            <div style={{ position: 'absolute', bottom: 1, right: 1, width: 12, height: 12, borderRadius: '50%', background: 'var(--pnl-up)', border: '2px solid var(--glass-bg)' }} />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                <span style={{ ...S.display, fontSize: 18, color: 'var(--fg)', cursor: 'pointer' }} onClick={() => onViewProfile({ id: post.authorId })}>{post.authorHandle}</span>
                                <VerifiedBadge userId={post.authorId} size={15}/>
                            </div>
                            <div style={{ ...S.label, fontSize: 10 }}>
                                {postDate.toLocaleDateString([], { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                                &nbsp;·&nbsp;
                                {postDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                        </div>
                    </div>
                    {canDelete && (
                        <button onClick={() => { onDeletePost(post.id); onBack(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-subtle)', padding: 4, borderRadius: 6, transition: 'color 0.1s' }}
                            title="Delete post"
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--pnl-down)'}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--fg-subtle)'}>
                            <Trash2 size={16}/>
                        </button>
                    )}
                </div>

                {/* Post content — full, no truncation */}
                <div style={{ padding: '18px 24px 0' }}>
                    <p style={{ fontFamily: 'var(--font-sans)', fontSize: 17, color: 'var(--fg)', lineHeight: 1.65, whiteSpace: 'pre-wrap' as const, letterSpacing: '-0.01em' }}>
                        {renderContentWithMentions(post.content, onViewProfile, traders, onTickerClick, VALID_TICKER_SYMBOLS)}
                    </p>
                    {(() => { const u = extractFirstUrl(post.content); return u ? <LinkPreviewCard url={u} /> : null; })()}
                </div>

                {/* Trade signal card */}
                {post.isTradeSignal && post.tradeDetails && (
                    <div style={{ margin: '16px 24px 0', background: 'oklch(0.68 0.22 295 / 0.06)', border: '1px solid oklch(0.68 0.22 295 / 0.2)', borderRadius: 14, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                <span style={{ ...S.mono, fontSize: 16, fontWeight: 700, color: 'var(--fg)' }}>{post.tradeDetails.pair}</span>
                                <span style={{ padding: '3px 9px', borderRadius: 7, background: post.tradeDetails.side === 'LONG' ? 'oklch(0.78 0.18 150/0.15)' : 'oklch(0.66 0.22 25/0.15)', border: `1px solid ${post.tradeDetails.side === 'LONG' ? 'oklch(0.78 0.18 150/0.3)' : 'oklch(0.66 0.22 25/0.3)'}`, ...S.label, fontSize: 10, color: post.tradeDetails.side === 'LONG' ? 'var(--pnl-up)' : 'var(--pnl-down)' }}>{post.tradeDetails.side}</span>
                            </div>
                            <div style={{ ...S.label, fontSize: 10 }}>{post.tradeDetails.leverage}× leverage · Entry @ {post.tradeDetails.entry}</div>
                        </div>
                    </div>
                )}

                {/* Stats bar */}
                <div style={{ padding: '16px 24px', display: 'flex', gap: 24, borderTop: '1px solid var(--hairline)', marginTop: 16 }}>
                    {[
                        { label: 'Comments', value: post.comments.length },
                        { label: 'Reposts', value: post.reposts },
                        { label: 'Likes', value: post.likes },
                    ].map(s => (
                        <div key={s.label}>
                            <span style={{ ...S.mono, fontSize: 16, fontWeight: 700, color: 'var(--fg)' }}>{s.value}</span>
                            <span style={{ ...S.label, fontSize: 10, marginLeft: 5 }}>{s.label}</span>
                        </div>
                    ))}
                </div>

                {/* Action buttons */}
                <div style={{ padding: '0 24px 20px', display: 'flex', gap: 6, borderTop: '1px solid var(--hairline)', paddingTop: 14 }}>
                    {[
                        { icon: <Heart size={16} fill={hasLiked ? 'currentColor' : 'none'}/>, label: hasLiked ? 'Liked' : 'Like', onClick: () => onLike(post.id), active: hasLiked, color: 'var(--iris-magenta)' },
                        { icon: <Repeat size={16}/>, label: hasReposted ? 'Reposted' : 'Repost', onClick: () => onRepost(post.id), active: hasReposted, color: 'var(--pnl-up)' },
                        { icon: <Share2 size={16}/>, label: 'Share', onClick: async () => {
                            const url = `${window.location.origin}/social/post/${post.id}`;
                            if (navigator.share) { try { await navigator.share({ title: `${post.authorHandle} on Velo`, text: post.content.slice(0, 200), url }); return; } catch (_) {} }
                            await navigator.clipboard.writeText(url).catch(() => {});
                        }, active: false, color: 'var(--iris-cyan)' },
                    ].map((a, i) => (
                        <button key={i} onClick={a.onClick} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 20, border: `1px solid ${a.active ? a.color : 'var(--hairline)'}`, background: a.active ? `oklch(from ${a.color} l c h / 0.1)` : 'transparent', cursor: 'pointer', ...S.mono, fontSize: 12, fontWeight: 600, color: a.active ? a.color : 'var(--fg-subtle)', transition: 'all 0.15s' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = a.color; (e.currentTarget as HTMLElement).style.color = a.color; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = a.active ? a.color : 'var(--hairline)'; (e.currentTarget as HTMLElement).style.color = a.active ? a.color : 'var(--fg-subtle)'; }}>
                            {a.icon} {a.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Comments section */}
            <div style={{ marginTop: 16 }}>
                <div style={{ ...S.label, fontSize: 11, marginBottom: 12, paddingLeft: 4 }}>
                    {post.comments.length} {post.comments.length === 1 ? 'Comment' : 'Comments'}
                </div>

                {/* Write comment */}
                {user && <SinglePostCommentBox post={post} user={user} onComment={onComment} traders={traders} />}

                {/* Existing comments */}
                {post.comments.length === 0 ? (
                    <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--hairline)', borderRadius: 16, padding: '40px 24px', textAlign: 'center' }}>
                        <MessageCircle size={28} style={{ color: 'var(--fg-subtle)', marginBottom: 8 }} />
                        <p style={{ ...S.display, fontSize: 18, color: 'var(--fg-subtle)' }}>No comments yet.</p>
                        <p style={{ ...S.mono, fontSize: 11, color: 'var(--fg-subtle)', marginTop: 4 }}>Be the first to comment.</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {post.comments.map((c: any) => {
                            const canDeleteComment = user && onDeleteComment && (user.id === c.authorId || user.id === post.authorId);
                            return (
                                <div key={c.id} style={{ background: 'var(--glass-bg)', border: '1px solid var(--hairline)', borderRadius: 16, padding: '14px 18px', display: 'flex', gap: 12 }}>
                                    <img src={c.authorAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${c.authorHandle}`}
                                        style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--hairline)', flexShrink: 0, cursor: 'pointer' }}
                                        onClick={() => onViewProfile({ id: c.authorId })} />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span style={{ ...S.display, fontSize: 14, color: 'var(--fg)', cursor: 'pointer' }} onClick={() => onViewProfile({ id: c.authorId })}>{c.authorHandle}</span>
                                                <span style={{ ...S.label, fontSize: 10 }}>{(() => { const d = new Date(c.timestamp); const now = new Date(); const isToday = d.toDateString() === now.toDateString(); return isToday ? d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : d.toLocaleDateString([],{month:'short',day:'numeric'}) + ' · ' + d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}); })()}</span>
                                            </div>
                                            {canDeleteComment && (
                                                <button onClick={() => onDeleteComment(post.id, c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-subtle)', padding: 2, transition: 'color 0.1s' }}
                                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--pnl-down)'}
                                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--fg-subtle)'}>
                                                    <Trash2 size={13}/>
                                                </button>
                                            )}
                                        </div>
                                        <p style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg)', lineHeight: 1.55 }}>
                                            {renderContentWithMentions(c.content, onViewProfile, traders, onTickerClick, VALID_TICKER_SYMBOLS)}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

// Comment box for single post view
const SinglePostCommentBox = ({ post, user, onComment, traders }: any) => {
    const [text, setText] = useState('');
    const [loading, setLoading] = useState(false);
    const submit = async () => {
        if (!text.trim() || loading) return;
        setLoading(true);
        await onComment(post.id, text.trim());
        setText('');
        setLoading(false);
    };
    return (
        <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--hairline)', borderRadius: 16, padding: '14px 18px', display: 'flex', gap: 12, marginBottom: 10 }}>
            <img src={user.avatar} style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--hairline)', flexShrink: 0 }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <textarea value={text} onChange={e => setText(e.target.value)}
                    placeholder="Add a comment…"
                    onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
                    style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg)', resize: 'none', height: 56, lineHeight: 1.5 }} />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={submit} disabled={!text.trim() || loading}
                        style={{ padding: '7px 18px', borderRadius: 20, background: text.trim() ? 'var(--iris-violet)' : 'var(--chip-bg)', border: 'none', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: text.trim() ? '#fff' : 'var(--fg-subtle)', cursor: text.trim() ? 'pointer' : 'default', letterSpacing: '0.05em', transition: 'all 0.15s', boxShadow: text.trim() ? '0 4px 14px oklch(0.68 0.22 295 / 0.3)' : 'none' }}>
                        {loading ? '…' : 'Reply'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const SocialFeed = ({ traders, posts, user, handleFollow, handleCopyTrade, onViewProfile, onPostCreate, onRequireAuth, onLike, onRepost, onComment, showUsersModal, onDeletePost, onDeleteComment, prices, changes, initialTicker, onTickerChange, onNavigateToTrade, onNavigateToMarkets, watchlist, onToggleWatchlist, focusPostId, openCommentsPostId, onSinglePost }: any) => {
    const [newPostContent, setNewPostContent] = useState('');
    const [filter, setFilter] = useState<'LATEST' | 'TRENDING' | 'FOLLOWING' | 'SIGNALS'>('LATEST');
    const [feedMentionQuery, setFeedMentionQuery] = useState<string | null>(null);
    const [feedMentionTrigger, setFeedMentionTrigger] = useState<'@' | '$' | null>(null);
    const [activeTicker, setActiveTicker] = useState<string | null>(initialTicker || null);
    const setActiveTickerWithURL = (t: string | null) => { setActiveTicker(t); if (onTickerChange) onTickerChange(t); };
    // Sync when parent navigates (back button, URL change)
    useEffect(() => {
        setActiveTicker(initialTicker || null);
    }, [initialTicker]);
    const [feedMentionStart, setFeedMentionStart] = useState(0);
    const [feedMentionIdx, setFeedMentionIdx] = useState(0);
    const feedTextareaRef = useRef<HTMLTextAreaElement>(null);
    // Track which post should auto-open comments
    const [forceOpenCommentsId, setForceOpenCommentsId] = useState<string | null>(openCommentsPostId || null);

    // When focusPostId changes, scroll to that post and optionally open its comments
    useEffect(() => {
        if (!focusPostId) return;
        // Set filter to LATEST so the post is visible
        setFilter('LATEST');
        setActiveTicker(null);
        if (openCommentsPostId) setForceOpenCommentsId(openCommentsPostId);
        // Wait for render then scroll
        const timer = setTimeout(() => {
            const el = document.getElementById(`post-${focusPostId}`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Briefly highlight the post
                el.style.transition = 'box-shadow 0.3s';
                el.style.boxShadow = '0 0 0 2px var(--iris-violet)';
                setTimeout(() => { el.style.boxShadow = ''; }, 2000);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [focusPostId, openCommentsPostId]);

    const feedMentionResults: any[] = React.useMemo(() => {
        if (feedMentionQuery === null) return [];
        const q = feedMentionQuery.toLowerCase();
        if (feedMentionTrigger === '$') {
            if (!q) return [];
            const tickers = SOCIAL_FEATURED_PAIRS.filter(p =>
                p.symbol.toLowerCase().startsWith(q) || p.name.toLowerCase().startsWith(q)
            ).slice(0, 4).map(p => ({ ...p, _type: 'ticker' }));
            return tickers;
        }
        if (feedMentionTrigger === '@' && q.length > 0) {
            return traders.filter((t: any) => {
                if (t.id === user?.id) return false;
                return (t.handle || '').toLowerCase().includes(q) || (t.username || '').toLowerCase().includes(q);
            }).slice(0, 6);
        }
        return [];
    }, [feedMentionQuery, feedMentionTrigger, traders, user]);

    const handleFeedTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        const cursor = e.target.selectionStart ?? val.length;
        setNewPostContent(val);
        const atMatch = val.slice(0, cursor).match(/@([A-Za-z0-9_]*)$/);
        const dollarMatch = val.slice(0, cursor).match(/\$([A-Za-z0-9]*)$/);
        if (atMatch) {
            setFeedMentionTrigger('@');
            setFeedMentionQuery(atMatch[1]);
            setFeedMentionStart(cursor - atMatch[0].length);
            setFeedMentionIdx(0);
        } else if (dollarMatch) {
            setFeedMentionTrigger('$');
            setFeedMentionQuery(dollarMatch[1]);
            setFeedMentionStart(cursor - dollarMatch[0].length);
            setFeedMentionIdx(0);
        } else {
            setFeedMentionQuery(null);
            setFeedMentionTrigger(null);
        }
    };
    const completeFeedMention = (item: any) => {
        const insertion = item._type === 'ticker' ? `$${item.symbol}` : (item.handle || ('@' + item.username));
        const cursor = feedTextareaRef.current?.selectionStart ?? feedMentionStart + (feedMentionQuery?.length ?? 0) + 1;
        const before = newPostContent.slice(0, feedMentionStart);
        const after = newPostContent.slice(cursor);
        const next = before + insertion + ' ' + after;
        setNewPostContent(next);
        setFeedMentionQuery(null);
        setFeedMentionTrigger(null);
        setTimeout(() => { if (feedTextareaRef.current) { const p = before.length + insertion.length + 1; feedTextareaRef.current.focus(); feedTextareaRef.current.setSelectionRange(p, p); } }, 0);
    };
    const filteredPosts = React.useMemo(() => {
        const base = [...posts];
        // Apply filter FIRST, then sort
        let scoped = base;
        if (filter === 'FOLLOWING') {
            if (!user) return [];
            const followSet = new Set([...(user.following || []), user.id]);
            scoped = base.filter((p: Post) => followSet.has(p.authorId));
        } else if (filter === 'SIGNALS') {
            scoped = base.filter((p: Post) => p.isTradeSignal);
        }
        if (filter === 'TRENDING') {
            return scoped.sort((a: Post, b: Post) => (b.likes + b.reposts * 2) - (a.likes + a.reposts * 2));
        }
        return scoped.sort((a: Post, b: Post) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }, [posts, filter, user]);
    const handleViewProfileWrapper = (partial: { id: string }) => {
        const trader = traders.find((t: any) => t.id === partial.id);
        if (trader) onViewProfile(trader); else if (user && user.id === partial.id) onViewProfile(user);
    };
    const S = {
        mono: { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1' } as React.CSSProperties,
        display: { fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' } as React.CSSProperties,
        label: { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)' } as React.CSSProperties,
    };
    const panel: React.CSSProperties = { background: 'var(--glass-bg)', border: '1px solid var(--hairline)', borderRadius: 14, backdropFilter: 'blur(8px) saturate(1.1)', WebkitBackdropFilter: 'blur(8px) saturate(1.1)', boxShadow: 'var(--glass-shadow)', overflow: 'hidden' };

    // Derive trending topics from real post content — count hashtag/ticker mentions
    const trendingTopics = React.useMemo(() => {
        const counts: Record<string, number> = {};
        posts.forEach((p: any) => {
            const matches = (p.content || '').match(/(\$[A-Z]{2,8}|#[A-Za-z]{3,20})/g) || [];
            matches.forEach((tag: string) => {
                const t = tag.toUpperCase();
                counts[t] = (counts[t] || 0) + 1;
            });
        });
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([tag, count]) => ({ tag, count: String(count) }));
    }, [posts]);

    // Real copy-trade signals: top traders who are verified and have real positions (from posts with isTradeSignal)
    const liveSignals = React.useMemo(() => {
        return posts
            .filter((p: any) => p.isTradeSignal && p.tradeDetails)
            .slice(0, 4)
            .map((p: any) => ({
                handle: p.authorHandle,
                side: p.tradeDetails.side,
                pair: p.tradeDetails.pair?.split('/')[0] || p.tradeDetails.pair,
                entry: p.tradeDetails.entry,
            }));
    }, [posts]);
    return (
        <div style={{ width: '100%', maxWidth: 1600, margin: '0 auto' }} className="animate-fade-in">
            {activeTicker ? (
                <TokenPage
                    ticker={activeTicker}
                    posts={posts}
                    traders={traders}
                    user={user}
                    prices={prices}
                    changes={changes}
                    onClose={(sym?: string) => { if (sym && typeof sym === 'string') setActiveTickerWithURL(sym); else setActiveTickerWithURL(null); }}
                    onLike={onLike}
                    onRepost={onRepost}
                    onComment={onComment}
                    onViewProfile={onViewProfile}
                    showUsersModal={showUsersModal}
                    onDeletePost={onDeletePost}
                    onDeleteComment={onDeleteComment}
                    handleCopyTrade={handleCopyTrade}
                    onNavigateToTrade={onNavigateToTrade}
                    watchlist={watchlist}
                    onToggleWatchlist={onToggleWatchlist}
                    onSinglePost={onSinglePost}
                    onNavigateToTicker={(sym: string) => setActiveTickerWithURL(sym)}
                />
            ) : (
            <div className="social-feed-grid">
            {/* Left sidebar — discovery panel */}
            <div className="social-feed-sidebar" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                {/* Trending */}
                <div className="vp" style={panel}>
                    <div style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--iris-violet)', display: 'inline-block', boxShadow: '0 0 8px var(--iris-violet)' }} />
                            <span style={{ ...S.display, fontSize: 16, color: 'var(--fg)' }}>Trending</span>
                        </div>
                        {trendingTopics.length === 0 ? (
                            <p style={{ ...S.label, fontSize: 9, color: 'var(--fg-subtle)', textAlign: 'center', padding: '8px 0' }}>No trending topics yet</p>
                        ) : trendingTopics.map((t, i) => (
                            <div key={t.tag} onClick={() => { const sym = t.tag.startsWith('$') ? t.tag.slice(1) : null; if (sym) setActiveTickerWithURL(sym); }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < trendingTopics.length - 1 ? '1px solid var(--hairline)' : 'none', cursor: t.tag.startsWith('$') ? 'pointer' : 'default', transition: 'opacity 0.12s' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, color: 'var(--fg-subtle)', minWidth: 16 }}>#{i+1}</span>
                                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--iris-violet)', fontWeight: 600 }}>{t.tag}</span>
                                </div>
                                <span style={{ ...S.label, fontSize: 9 }}>{t.count} {Number(t.count) === 1 ? 'post' : 'posts'}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Who to follow */}
                <div className="vp" style={panel}>
                    <div style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--iris-violet)', display: 'inline-block', boxShadow: '0 0 8px var(--iris-violet)' }} />
                            <span style={{ ...S.display, fontSize: 16, color: 'var(--fg)' }}>Who to follow</span>
                        </div>
                        {traders.filter((t: any) => t.id !== user?.id).slice(0, 4).map((t: any) => (
                            <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => onViewProfile(t)}>
                                    <img src={t.avatar} style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--hairline)' }} />
                                    <div>
                                        <p style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 13, color: 'var(--fg)', letterSpacing: '-0.01em', margin: 0 }}>{t.username}</p>
                                        <p style={{ ...S.label, fontSize: 9, margin: 0 }}>{t.handle}</p>
                                    </div>
                                </div>
                                <button onClick={() => handleFollow(t.id)}
                                    style={{ padding: '4px 11px', borderRadius: 20, border: '1px solid var(--hairline-strong)', background: user?.following?.includes(t.id) ? 'var(--chip-bg)' : 'oklch(0.55 0.24 295/0.12)', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: user?.following?.includes(t.id) ? 'var(--fg-muted)' : 'var(--iris-violet)', cursor: 'pointer', transition: 'all 0.1s' }}>
                                    {user?.following?.includes(t.id) ? 'Following' : 'Follow'}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Top Traders 24H */}
                <div className="vp" style={panel}>
                    <div style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--iris-violet)', display: 'inline-block', boxShadow: '0 0 8px var(--iris-violet)' }} />
                            <span style={{ ...S.label }}>Top Traders 24H</span>
                        </div>
                        {traders
                            .filter((t: any) => t.id !== user?.id)
                            .sort((a: any, b: any) => b.pnl - a.pnl)
                            .slice(0, 5)
                            .map((t: any, i: number) => (
                                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: i < 4 ? '1px solid var(--hairline)' : 'none', cursor: 'pointer' }}
                                    onClick={() => onViewProfile(t)}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, color: 'var(--fg-subtle)', minWidth: 14 }}>#{i+1}</span>
                                        <img src={t.avatar} style={{ width: 24, height: 24, borderRadius: '50%', border: '1px solid var(--hairline)' }} />
                                        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--fg-muted)' }}>{t.username}</span>
                                    </div>
                                    <span style={{ ...S.mono, fontSize: 12, fontWeight: 700, color: t.pnl >= 0 ? 'var(--pnl-up)' : 'var(--pnl-down)' }}>{t.pnl >= 0 ? '+' : ''}${Math.abs(t.pnl).toFixed(0)}</span>
                                </div>
                            ))}
                        {traders.filter((t: any) => t.id !== user?.id).length === 0 && (
                            <p style={{ ...S.label, fontSize: 9, color: 'var(--fg-subtle)', textAlign: 'center', padding: '8px 0' }}>No traders yet</p>
                        )}
                    </div>
                </div>

            </div>

            {/* Right — tokens strip + compose + feed */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Top Tokens Bar */}
                <TopTokensBar prices={prices || {}} changes={changes || {}} onTickerClick={setActiveTickerWithURL} onNavigateToMarkets={onNavigateToMarkets} />
                {/* Compose */}
                <div className="vp" style={panel}>
                    <div style={{ padding: 16, display: 'flex', gap: 12 }}>
                        <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--chip-bg)', overflow: 'hidden', flexShrink: 0, border: '1px solid var(--hairline)' }}>
                            {user ? <img src={user.avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <UserCircle size={38} style={{ color: 'var(--fg-subtle)' }} />}
                        </div>
                        <div style={{ flex: 1, position: 'relative' as const }}>
                            <textarea
                                ref={feedTextareaRef}
                                placeholder="What's happening in the markets? Use @handle or $BTC to tag someone"
                                value={newPostContent}
                                onChange={handleFeedTextChange}
                                onKeyDown={e => {
                                    if (feedMentionQuery !== null && feedMentionResults.length > 0) {
                                        if (e.key === 'ArrowDown') { e.preventDefault(); setFeedMentionIdx(i => Math.min(i+1, feedMentionResults.length-1)); return; }
                                        if (e.key === 'ArrowUp')   { e.preventDefault(); setFeedMentionIdx(i => Math.max(i-1, 0)); return; }
                                        if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); completeFeedMention(feedMentionResults[feedMentionIdx]); return; }
                                        if (e.key === 'Escape') { setFeedMentionQuery(null); setFeedMentionTrigger(null); return; }
                                    }
                                }}
                                onBlur={() => setTimeout(() => { setFeedMentionQuery(null); setFeedMentionTrigger(null); }, 150)}
                                style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', fontFamily: 'var(--font-sans)', fontSize: 15, color: 'var(--fg)', resize: 'none', height: 72, lineHeight: 1.6 }}
                            />
                            <MentionDropdown results={feedMentionResults} anchorRef={feedTextareaRef} activeIndex={feedMentionIdx} onSelect={completeFeedMention} onHover={setFeedMentionIdx} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--hairline)', paddingTop: 10 }}>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-subtle)', letterSpacing: '0.06em' }}>@handle · $TICKER to tag</span>
                                <button onClick={() => { onPostCreate(newPostContent); setNewPostContent(''); }} disabled={!newPostContent.trim()}
                                    style={{ padding: '7px 18px', borderRadius: 20, background: 'var(--fg)', border: 'none', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--bg-base)', cursor: 'pointer', letterSpacing: '0.05em', opacity: !newPostContent.trim() ? 0.4 : 1, transition: 'opacity 0.15s' }}>Post</button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Filter tabs */}
                <div className="vp" style={{ ...panel, padding: 0, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', gap: 0 }}>
                        {['LATEST','TRENDING','FOLLOWING','SIGNALS'].map(f => (
                            <button key={f} onClick={() => setFilter(f as any)}
                                style={{ flex: 1, padding: '11px 8px', border: 'none', background: filter === f ? 'oklch(0.55 0.24 295/0.10)' : 'transparent', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer', color: filter === f ? 'var(--iris-violet)' : 'var(--fg-subtle)', borderBottom: filter === f ? '2px solid var(--iris-violet)' : '2px solid transparent', transition: 'all 0.15s' }}>
                                {f}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Posts */}
                {filteredPosts.length === 0 ? (
                    <div style={{ ...panel, padding: '40px 20px', textAlign: 'center' }}>
                        <p style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 22, color: 'var(--fg)', letterSpacing: '-0.02em', marginBottom: 6 }}>
                            {filter === 'FOLLOWING' ? (user ? 'Follow a trader to see their posts.' : 'Log in to see posts from traders you follow.')
                                : filter === 'SIGNALS' ? 'No live trade signals yet.'
                                : filter === 'TRENDING' ? 'Nothing trending yet.'
                                : 'No posts yet. Be the first.'}
                        </p>
                        <p style={{ ...S.label, fontSize: 10 }}>
                            {filter === 'SIGNALS' ? 'Traders publishing signals will show up here.'
                                : filter === 'FOLLOWING' ? 'Follow traders from the sidebar.'
                                : 'Markets move. So should the feed.'}
                        </p>
                    </div>
                ) : filteredPosts.map((post: any) => (
                    <div key={post.id} id={`post-${post.id}`}>
                        <PostCard post={post} user={user} onLike={onLike} onRepost={onRepost} onComment={onComment} handleCopyTrade={handleCopyTrade} onViewProfile={handleViewProfileWrapper} showUsersModal={showUsersModal} onDelete={onDeletePost} onDeleteComment={onDeleteComment} traders={traders} onTickerClick={setActiveTickerWithURL} defaultOpenComments={forceOpenCommentsId === post.id} onSinglePost={onSinglePost} />
                    </div>
                ))}
            </div>

            </div>
            )}
        </div>
    );
}

// Reusable wall compose box
// Shared mention dropdown rendered via portal — escapes all overflow/backdrop-filter parents
const MentionDropdown = ({ results, anchorRef, activeIndex, onSelect, onHover }: any) => {
    const [pos, setPos] = React.useState<{ top: number; left: number; width: number } | null>(null);

    React.useEffect(() => {
        const update = () => {
            const rect = anchorRef.current?.getBoundingClientRect();
            if (rect) setPos({ top: rect.bottom + 6, left: rect.left, width: rect.width });
        };
        update();
        window.addEventListener('scroll', update, true);
        window.addEventListener('resize', update);
        return () => {
            window.removeEventListener('scroll', update, true);
            window.removeEventListener('resize', update);
        };
    }, [anchorRef, results.length]);

    if (!pos || results.length === 0) return null;

    // Inline style with a <style> block so CSS vars resolve correctly on the portal root
    const styleId = 'velo-mention-dropdown-style';
    if (!document.getElementById(styleId)) {
        const s = document.createElement('style');
        s.id = styleId;
        s.textContent = `
            .velo-mention-dropdown {
                position: fixed;
                z-index: 99999;
                min-width: 260px;
                background: var(--bg-base-2, #fff);
                border: 1px solid var(--hairline-strong, rgba(0,0,0,0.12));
                border-radius: 12px;
                box-shadow: 0 8px 30px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08);
                overflow: hidden;
                font-family: var(--font-sans, sans-serif);
            }
            .velo-mention-item {
                display: flex;
                align-items: center;
                gap: 10px;
                width: 100%;
                padding: 10px 14px;
                background: transparent;
                border: none;
                cursor: pointer;
                text-align: left;
                transition: background 0.1s;
                box-sizing: border-box;
            }
            .velo-mention-item:hover,
            .velo-mention-item.active {
                background: var(--chip-bg-hover, rgba(0,0,0,0.06));
            }
            .velo-mention-item img {
                width: 32px;
                height: 32px;
                border-radius: 50%;
                object-fit: cover;
                flex-shrink: 0;
                border: 1px solid var(--hairline, rgba(0,0,0,0.08));
            }
            .velo-mention-item .ticker-icon {
                width: 32px;
                height: 32px;
                border-radius: 50%;
                object-fit: cover;
                flex-shrink: 0;
                border: 1px solid var(--hairline, rgba(0,0,0,0.08));
            }
            .velo-mention-name {
                font-family: var(--font-display, Georgia);
                font-style: italic;
                font-size: 13px;
                font-weight: 600;
                color: var(--fg, #0a0a0e);
                letter-spacing: -0.01em;
                line-height: 1.2;
            }
            .velo-mention-handle {
                font-family: var(--font-mono, monospace);
                font-size: 10px;
                color: var(--fg-subtle, rgba(10,10,14,0.45));
                letter-spacing: 0.04em;
                margin-top: 2px;
            }
            .velo-mention-ticker-tag {
                font-family: var(--font-mono, monospace);
                font-size: 11px;
                font-weight: 700;
                color: var(--pnl-up, #34d399);
                letter-spacing: 0.04em;
            }
            .velo-mention-section-header {
                padding: 6px 14px 4px;
                font-family: var(--font-mono, monospace);
                font-size: 9px;
                font-weight: 700;
                letter-spacing: 0.12em;
                text-transform: uppercase;
                color: var(--fg-subtle, rgba(10,10,14,0.45));
                border-bottom: 1px solid var(--hairline, rgba(0,0,0,0.06));
            }
        `;
        document.head.appendChild(s);
    }

    return createPortal(
        <div
            className="velo-mention-dropdown"
            style={{ top: pos.top, left: pos.left }}
        >
            {results.map((item: any, i: number) => (
                item._sectionHeader ? (
                    <div key={`header-${i}`} className="velo-mention-section-header">{item._sectionHeader}</div>
                ) : item._type === 'ticker' ? (
                    <button
                        key={item.symbol}
                        className={`velo-mention-item${i === activeIndex ? ' active' : ''}`}
                        onMouseDown={e => { e.preventDefault(); onSelect(item); }}
                        onMouseEnter={() => onHover(i)}
                    >
                        <img src={item.logo} alt={item.symbol} className="ticker-icon" />
                        <div>
                            <div className="velo-mention-name">{item.name}</div>
                            <div className="velo-mention-ticker-tag">${item.symbol}</div>
                        </div>
                    </button>
                ) : (
                    <button
                        key={item.id}
                        className={`velo-mention-item${i === activeIndex ? ' active' : ''}`}
                        onMouseDown={e => { e.preventDefault(); onSelect(item); }}
                        onMouseEnter={() => onHover(i)}
                    >
                        <img src={item.avatar} alt={item.username} />
                        <div>
                            <div className="velo-mention-name">{item.username}</div>
                            <div className="velo-mention-handle">{item.handle || ('@' + item.username)}</div>
                        </div>
                    </button>
                )
            ))}
        </div>,
        document.body
    );
};

const WallCompose = ({ user, targetId, targetName, onPostCreate, placeholder, traders = [] }: any) => {
    const [text, setText] = React.useState('');
    const [posting, setPosting] = React.useState(false);
    const [mentionQuery, setMentionQuery] = React.useState<string | null>(null);
    const [mentionTrigger, setMentionTrigger] = React.useState<'@' | '$' | null>(null);
    const [mentionStart, setMentionStart] = React.useState(0);
    const [dropdownIndex, setDropdownIndex] = React.useState(0);
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);

    if (!user) return null;

    const mentionResults: any[] = React.useMemo ? (() => {
        if (mentionQuery === null) return [];
        const q = mentionQuery.toLowerCase();
        if (mentionTrigger === '$') {
            if (!q) return []; // don't show anything until at least 1 char typed
            return SOCIAL_FEATURED_PAIRS.filter(p =>
                p.symbol.toLowerCase().startsWith(q) || p.name.toLowerCase().startsWith(q)
            ).slice(0, 4).map(p => ({ ...p, _type: 'ticker' }));
        }
        if (mentionTrigger === '@' && q.length > 0) {
            return traders.filter((t: any) => {
                if (t.id === user.id) return false;
                return (t.handle || '').toLowerCase().includes(q) || (t.username || '').toLowerCase().includes(q);
            }).slice(0, 6);
        }
        return [];
    })() : [];

    const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        const cursor = e.target.selectionStart ?? val.length;
        setText(val);
        const atMatch = val.slice(0, cursor).match(/@([A-Za-z0-9_]*)$/);
        const dollarMatch = val.slice(0, cursor).match(/\$([A-Za-z0-9]*)$/);
        if (atMatch) {
            setMentionTrigger('@');
            setMentionQuery(atMatch[1]);
            setMentionStart(cursor - atMatch[0].length);
            setDropdownIndex(0);
        } else if (dollarMatch) {
            setMentionTrigger('$');
            setMentionQuery(dollarMatch[1]);
            setMentionStart(cursor - dollarMatch[0].length);
            setDropdownIndex(0);
        } else {
            setMentionQuery(null);
            setMentionTrigger(null);
        }
    };

    const completeMention = (item: any) => {
        const insertion = item._type === 'ticker' ? `$${item.symbol}` : (item.handle || ('@' + item.username));
        const cursor = textareaRef.current?.selectionStart ?? mentionStart + (mentionQuery?.length ?? 0) + 1;
        const before = text.slice(0, mentionStart);
        const after = text.slice(cursor);
        setText(before + insertion + ' ' + after);
        setMentionQuery(null);
        setMentionTrigger(null);
        setTimeout(() => {
            if (textareaRef.current) {
                const pos = before.length + insertion.length + 1;
                textareaRef.current.focus();
                textareaRef.current.setSelectionRange(pos, pos);
            }
        }, 0);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (mentionQuery !== null && mentionResults.length > 0) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setDropdownIndex(i => Math.min(i + 1, mentionResults.length - 1)); return; }
            if (e.key === 'ArrowUp')   { e.preventDefault(); setDropdownIndex(i => Math.max(i - 1, 0)); return; }
            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); completeMention(mentionResults[dropdownIndex]); return; }
            if (e.key === 'Escape')    { setMentionQuery(null); setMentionTrigger(null); return; }
        }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handlePost();
    };

    const handlePost = async () => {
        if (!text.trim() || posting) return;
        setPosting(true);
        await onPostCreate(text.trim(), undefined, targetId);
        setText('');
        setMentionQuery(null);
        setMentionTrigger(null);
        setPosting(false);
    };

    return (
        <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', border: '1px solid var(--hairline)', flexShrink: 0 }}>
                <img src={user.avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt=""/>
            </div>
            <div style={{ flex: 1 }}>
                <textarea
                    ref={textareaRef}
                    placeholder={placeholder || `Write something\u2026`}
                    value={text}
                    onChange={handleTextChange}
                    onKeyDown={handleKeyDown}
                    onBlur={() => setTimeout(() => { setMentionQuery(null); setMentionTrigger(null); }, 150)}
                    style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg)', resize: 'none', height: 56, lineHeight: 1.5 }}
                />
                <MentionDropdown results={mentionResults} anchorRef={textareaRef} activeIndex={dropdownIndex} onSelect={completeMention} onHover={setDropdownIndex} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--hairline)', paddingTop: 8 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-subtle)', letterSpacing: '0.06em' }}>Ctrl+Enter to post · @handle · $TICKER to tag</span>
                    <button
                        onClick={handlePost}
                        disabled={!text.trim() || posting}
                        style={{ padding: '6px 16px', borderRadius: 20, background: 'var(--fg)', border: 'none', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--bg-base)', cursor: text.trim() && !posting ? 'pointer' : 'default', letterSpacing: '0.05em', opacity: !text.trim() || posting ? 0.4 : 1, textTransform: 'uppercase' as const, transition: 'opacity 0.15s' }}>
                        {posting ? '…' : 'Post'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const ProfileHeader = ({ profile, isOwn, onEdit, onFollow, isFollowing, onCopy, isCopying, showUsersModal, onViewProfile, stats }: any) => {
    const S = {
        mono: { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1' } as React.CSSProperties,
        display: { fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' } as React.CSSProperties,
        label: { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)' } as React.CSSProperties,
    };
    const realizedPnl = stats?.realizedPnl ?? profile.pnl ?? profile.pnlTotal ?? 0;
    const winRate = stats?.winRate ?? profile.winRate ?? 0;
    const pillBtn: React.CSSProperties = {
        padding: '7px 16px', borderRadius: 20, border: 'none', cursor: 'pointer',
        fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
        letterSpacing: '0.06em', textTransform: 'uppercase', transition: 'all 0.15s',
    };
    return (
        <div className="vp" style={{ background: 'var(--glass-bg)', border: '1px solid var(--hairline)', borderRadius: 20, backdropFilter: 'blur(8px) saturate(1.1)', WebkitBackdropFilter: 'blur(8px) saturate(1.1)', overflow: 'hidden', marginBottom: 24 }}>
            {/* Banner */}
            <div className="velo-profile-banner" style={{ height: 160, width: '100%', position: 'relative', background: profile.banner ? '#000' : 'var(--holo-linear)', backgroundSize: '220% 100%', animation: profile.banner ? 'none' : 'holoSlide 14s linear infinite' }}>
                {profile.banner && <img src={profile.banner} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt=""/>}
                {/* Soft vignette for contrast with the avatar */}
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0) 60%, rgba(0,0,0,0.25) 100%)', pointerEvents: 'none' }}/>
            </div>
            <div className="velo-profile-inner" style={{ padding: '0 24px 24px', position: 'relative' }}>
                {/* Avatar + actions row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: -40, marginBottom: 16 }}>
                    <div className="velo-profile-avatar" style={{ width: 88, height: 88, borderRadius: '50%', border: '4px solid var(--bg-base)', overflow: 'hidden', background: 'var(--chip-bg)', boxShadow: '0 12px 30px -12px rgba(0,0,0,0.3)' }}>
                        <img src={profile.avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt=""/>
                    </div>
                    <div className="velo-profile-actions" style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                        {isOwn ? (
                            <button onClick={onEdit}
                                style={{ ...pillBtn, background: 'var(--chip-bg)', border: '1px solid var(--hairline-strong)', color: 'var(--fg)' }}
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--hairline)'}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--chip-bg)'}>
                                Edit Profile
                            </button>
                        ) : (
                            <>
                                <button onClick={onFollow}
                                    style={{ ...pillBtn, background: isFollowing ? 'var(--chip-bg)' : 'var(--fg)', border: isFollowing ? '1px solid var(--hairline-strong)' : 'none', color: isFollowing ? 'var(--fg)' : 'var(--bg-base)' }}>
                                    {isFollowing ? 'Following' : 'Follow'}
                                </button>
                            </>
                        )}
                    </div>
                </div>
                {/* Name + handle */}
                <div style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <h2 className="velo-profile-username" style={{ ...S.display, fontSize: 32, color: 'var(--fg)', margin: 0, lineHeight: 1.1 }}>{profile.username}</h2>
                        {profile.veloRewards > 10000 && <Sparkles size={18} style={{ color: 'var(--iris-amber)' }} fill="currentColor"/>}
                        <VerifiedBadge userId={profile.id} size={16}/>
                    </div>
                    <p style={{ ...S.mono, fontSize: 12, color: 'var(--fg-muted)', margin: 0, letterSpacing: '0.02em' }}>{profile.handle}</p>
                </div>
                {/* Bio */}
                {profile.bio && (
                    <p style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-muted)', lineHeight: 1.55, maxWidth: 620, margin: '0 0 18px' }}>{profile.bio}</p>
                )}
                {/* Stats row */}
                <div className="velo-profile-stats" style={{ display: 'flex', flexWrap: 'wrap', gap: 24, paddingTop: 14, borderTop: '1px solid var(--hairline)' }}>
                    <button onClick={() => showUsersModal("Followers", profile.followers, onViewProfile)}
                        style={{ display: 'flex', alignItems: 'baseline', gap: 6, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}>
                        <span style={{ ...S.mono, fontSize: 15, fontWeight: 700, color: 'var(--fg)' }}>{profile.followers.length}</span>
                        <span style={{ ...S.label }}>Followers</span>
                    </button>
                    <button onClick={() => showUsersModal("Following", profile.following, onViewProfile)}
                        style={{ display: 'flex', alignItems: 'baseline', gap: 6, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}>
                        <span style={{ ...S.mono, fontSize: 15, fontWeight: 700, color: 'var(--fg)' }}>{profile.following.length}</span>
                        <span style={{ ...S.label }}>Following</span>
                    </button>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ ...S.mono, fontSize: 15, fontWeight: 700, color: realizedPnl >= 0 ? 'var(--pnl-up)' : 'var(--pnl-down)' }}>
                            {realizedPnl >= 0 ? '+' : '-'}${formatMoney(Math.abs(realizedPnl))}
                        </span>
                        <span style={{ ...S.label }}>PnL</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ ...S.mono, fontSize: 15, fontWeight: 700, color: 'var(--fg)' }}>{winRate.toFixed(1)}%</span>
                        <span style={{ ...S.label }}>Win Rate</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
const ProfileView = ({ user, handleUpdateProfile, posts, traders = [], onPostCreate, positions, onLike, onRepost, onComment, showUsersModal, onViewProfile, onDeletePost, onDeleteComment, onDeleteAccount, onTickerClick }: any) => {
    const [isEditOpen, setEditOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'POSTS' | 'REPOSTS' | 'TRADES'>('POSTS');
    const stats = calculateStats(user.tradeHistory);
    // Show posts authored by OR posted on this user's wall
    const userPosts = posts.filter((p: Post) => p.authorId === user.id || p.targetProfileId === user.id);
    const userReposts = posts.filter((p: Post) => p.repostedBy.includes(user.id));
    const activePositions = positions.filter((p: Position) => !p.isCopyTrade);
    const S = {
        mono: { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1' } as React.CSSProperties,
        display: { fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' } as React.CSSProperties,
        label: { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)' } as React.CSSProperties,
    };
    const tabBtn = (t: string): React.CSSProperties => ({
        padding: '12px 24px', border: 'none', background: 'transparent',
        fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
        letterSpacing: '0.12em', cursor: 'pointer',
        color: activeTab === t ? 'var(--fg)' : 'var(--fg-subtle)',
        borderBottom: activeTab === t ? '2px solid var(--iris-violet)' : '2px solid transparent',
        marginBottom: -1, transition: 'all 0.15s',
    });
    const emptyMsg = (text: string) => (
        <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--hairline)', borderRadius: 14, padding: '36px 20px', textAlign: 'center' }}>
            <p style={{ ...S.display, fontSize: 20, color: 'var(--fg)', margin: 0 }}>{text}</p>
        </div>
    );
    return (
        <div className="animate-fade-in" style={{ maxWidth: 880, margin: '0 auto', paddingBottom: 80 }}>
            <EditProfileModal isOpen={isEditOpen} onClose={() => setEditOpen(false)} user={user} onSave={handleUpdateProfile} onDeleteAccount={onDeleteAccount}/>
            <ProfileHeader profile={user} isOwn={true} onEdit={() => setEditOpen(true)} showUsersModal={showUsersModal} onViewProfile={onViewProfile} stats={stats}/>
            <div className="velo-profile-tabs" style={{ display: 'flex', borderBottom: '1px solid var(--hairline)', marginBottom: 20, overflowX: 'auto' }}>
                {(['POSTS','REPOSTS','TRADES'] as const).map(t => (
                    <button key={t} onClick={() => setActiveTab(t)} style={tabBtn(t)}>{t}</button>
                ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {activeTab === 'POSTS' && (
                    <>
                        <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--hairline)', borderRadius: 14, padding: 14, backdropFilter: 'blur(8px) saturate(1.1)', WebkitBackdropFilter: 'blur(8px) saturate(1.1)' }}>
                            <WallCompose user={user} targetId={user.id} targetName="your wall" onPostCreate={onPostCreate} placeholder="Post on your wall\u2026 Use @handle to tag someone" traders={traders} />
                        </div>
                        {userPosts.length === 0 ? emptyMsg('No posts yet.') : userPosts.map((post: Post) => (
                            <PostCard key={post.id} post={post} user={user} onLike={onLike} onRepost={onRepost} onComment={onComment} handleCopyTrade={() => {}} onViewProfile={onViewProfile} showUsersModal={showUsersModal} onDelete={onDeletePost} onDeleteComment={onDeleteComment} traders={traders} onTickerClick={onTickerClick}/>
                        ))}
                    </>
                )}
                {activeTab === 'REPOSTS' && (userReposts.length === 0 ? emptyMsg('No reposts yet.') : userReposts.map((post: Post) => (
                    <PostCard key={post.id} post={post} user={user} onLike={onLike} onRepost={onRepost} onComment={onComment} handleCopyTrade={() => {}} onViewProfile={onViewProfile} showUsersModal={showUsersModal} onDelete={onDeletePost} onDeleteComment={onDeleteComment} traders={traders} onTickerClick={onTickerClick}/>
                )))}
                {activeTab === 'TRADES' && (activePositions.length === 0 ? emptyMsg('No active manual trades.') : activePositions.map((p: Position) => (
                    <div key={p.id} style={{ background: 'var(--glass-bg)', border: '1px solid var(--hairline)', borderRadius: 14, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', backdropFilter: 'blur(8px) saturate(1.1)', WebkitBackdropFilter: 'blur(8px) saturate(1.1)' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                <span style={{ ...S.mono, fontSize: 14, fontWeight: 700, color: 'var(--fg)' }}>{p.pair}</span>
                                <span style={{ padding: '2px 8px', borderRadius: 6, background: p.side === 'LONG' ? 'oklch(0.78 0.18 150/0.15)' : 'oklch(0.66 0.22 25/0.15)', border: `1px solid ${p.side === 'LONG' ? 'oklch(0.78 0.18 150/0.3)' : 'oklch(0.66 0.22 25/0.3)'}`, ...S.label, color: p.side === 'LONG' ? 'var(--pnl-up)' : 'var(--pnl-down)' }}>{p.side}</span>
                            </div>
                            <span style={{ ...S.label }}>Entry ${formatPrice(p.entryPrice)} · Size ${formatMoney(p.size)}</span>
                        </div>
                        <span style={{ padding: '4px 10px', borderRadius: 8, background: 'oklch(0.68 0.22 295/0.1)', border: '1px solid oklch(0.68 0.22 295/0.25)', ...S.mono, fontSize: 11, fontWeight: 700, color: 'var(--iris-violet)' }}>{p.leverage}×</span>
                    </div>
                )))}
            </div>
        </div>
    );
};
const PublicProfileView = ({ trader, user, posts, traders = [], onBack, handleFollow, handleCopyTrade, onRequireAuth, onViewProfile, showUsersModal, positions, onUpdateProfile, onLike, onRepost, onComment, onDeletePost, onDeleteComment, onDeleteAccount, onPostCreate, marketPrices, onTickerClick }: any) => {
    if (user && user.id === trader.id) {
        return <ProfileView user={user} handleUpdateProfile={onUpdateProfile} posts={posts} traders={traders} positions={positions} onLike={onLike} onRepost={onRepost} onComment={onComment} showUsersModal={showUsersModal} onViewProfile={onViewProfile} onDeletePost={onDeletePost} onDeleteComment={onDeleteComment} onDeleteAccount={onDeleteAccount} onPostCreate={onPostCreate} onTickerClick={onTickerClick}/>;
    }
    const [activeTab, setActiveTab] = useState<'POSTS' | 'REPOSTS' | 'TRADES'>('POSTS');
    const [newPostContent, setNewPostContent] = useState('');
    const [traderPositions, setTraderPositions] = useState<Position[]>([]);
    const [loadingPositions, setLoadingPositions] = useState(false);
    // Show posts authored by this trader OR posted on their wall
    const traderPosts = posts.filter((p: Post) => p.authorId === trader.id || p.targetProfileId === trader.id);
    const traderReposts = posts.filter((p: Post) => p.repostedBy.includes(trader.id));
    const isFollowing = user?.following.includes(trader.id);
    const isCopying = user?.copying.includes(trader.id);
    const S = {
        mono: { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1' } as React.CSSProperties,
        display: { fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' } as React.CSSProperties,
        label: { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)' } as React.CSSProperties,
    };
    // Fetch trader's real positions from Supabase when TRADES tab is opened
    useEffect(() => {
        if (activeTab !== 'TRADES' || !isSupabaseConfigured()) return;
        setLoadingPositions(true);
        fetchPositions(trader.id)
            .then(rows => setTraderPositions(rows.filter((p: Position) => !p.isCopyTrade)))
            .catch(() => {})
            .finally(() => setLoadingPositions(false));
    }, [activeTab, trader.id]);
    const unrealizedPnl = traderPositions.reduce((acc, p) => {
        const price = marketPrices?.[p.pair] || p.entryPrice;
        return acc + (price - p.entryPrice) * (p.side === 'LONG' ? 1 : -1) * (p.size / p.entryPrice);
    }, 0);
    const stats = { winRate: trader.winRate ?? 0, realizedPnl: (trader.pnl ?? 0) + unrealizedPnl };
    const tabBtn = (t: string): React.CSSProperties => ({
        padding: '12px 24px', border: 'none', background: 'transparent',
        fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
        letterSpacing: '0.12em', cursor: 'pointer',
        color: activeTab === t ? 'var(--fg)' : 'var(--fg-subtle)',
        borderBottom: activeTab === t ? '2px solid var(--iris-violet)' : '2px solid transparent',
        marginBottom: -1, transition: 'all 0.15s',
    });
    const emptyMsg = (text: string) => (
        <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--hairline)', borderRadius: 14, padding: '36px 20px', textAlign: 'center' }}>
            <p style={{ ...S.display, fontSize: 20, color: 'var(--fg)', margin: 0 }}>{text}</p>
        </div>
    );
    return (
        <div className="animate-fade-in" style={{ maxWidth: 880, margin: '0 auto', paddingBottom: 80 }}>
            <button onClick={onBack}
                style={{ marginBottom: 14, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-subtle)', transition: 'color 0.15s', padding: 0 }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--fg)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--fg-subtle)'}>
                <ChevronLeft size={14}/> Back
            </button>
            <ProfileHeader profile={trader} isOwn={false}
                onFollow={() => user ? handleFollow(trader.id) : onRequireAuth()}
                isFollowing={isFollowing}
                onCopy={() => user ? handleCopyTrade(trader.id) : onRequireAuth()}
                isCopying={isCopying}
                showUsersModal={showUsersModal} onViewProfile={onViewProfile} stats={stats}/>
            <div className="velo-profile-tabs" style={{ display: 'flex', borderBottom: '1px solid var(--hairline)', marginBottom: 20, overflowX: 'auto' }}>
                {(['POSTS','REPOSTS','TRADES'] as const).map(t => (
                    <button key={t} onClick={() => setActiveTab(t)} style={tabBtn(t)}>{t}</button>
                ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {activeTab === 'POSTS' && (
                    <>
                        {user && (
                            <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--hairline)', borderRadius: 14, padding: 14, backdropFilter: 'blur(8px) saturate(1.1)', WebkitBackdropFilter: 'blur(8px) saturate(1.1)' }}>
                                <WallCompose user={user} targetId={trader.id} targetName={trader.username} onPostCreate={onPostCreate} placeholder={`Write on ${trader.username}'s wall\u2026 Use @handle to tag someone`} traders={traders} />
                            </div>
                        )}
                        {traderPosts.length === 0 ? emptyMsg('No posts yet.') : traderPosts.map((post: Post) => (
                            <PostCard key={post.id} post={post} user={user} onLike={onLike} onRepost={onRepost} onComment={onComment} handleCopyTrade={handleCopyTrade} onViewProfile={onViewProfile} showUsersModal={showUsersModal} traders={traders} onDelete={onDeletePost} onDeleteComment={onDeleteComment} onTickerClick={onTickerClick}/>
                        ))}
                    </>
                )}
                {activeTab === 'REPOSTS' && (traderReposts.length === 0 ? emptyMsg('No reposts yet.') : traderReposts.map((post: Post) => (
                    <PostCard key={post.id} post={post} user={user} onLike={onLike} onRepost={onRepost} onComment={onComment} handleCopyTrade={handleCopyTrade} onViewProfile={onViewProfile} showUsersModal={showUsersModal} traders={traders} onDelete={onDeletePost} onDeleteComment={onDeleteComment} onTickerClick={onTickerClick}/>
                )))}
                {activeTab === 'TRADES' && (
                    loadingPositions ? emptyMsg('Loading trades…')
                    : traderPositions.length === 0 ? emptyMsg('No active trades.')
                    : (
                        <>
                            {unrealizedPnl !== 0 && (
                                <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--hairline)', borderRadius: 14, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backdropFilter: 'blur(8px) saturate(1.1)', WebkitBackdropFilter: 'blur(8px) saturate(1.1)' }}>
                                    <span style={{ ...S.label }}>Unrealized PnL</span>
                                    <span style={{ ...S.mono, fontSize: 16, fontWeight: 700, color: unrealizedPnl >= 0 ? 'var(--pnl-up)' : 'var(--pnl-down)' }}>
                                        {unrealizedPnl >= 0 ? '+' : '-'}${formatMoney(Math.abs(unrealizedPnl))}
                                    </span>
                                </div>
                            )}
                            {traderPositions.map((p: Position) => {
                                const curPrice = marketPrices?.[p.pair] || p.entryPrice;
                                const posUnreal = (curPrice - p.entryPrice) * (p.side === 'LONG' ? 1 : -1) * (p.size / p.entryPrice);
                                return (
                                    <div key={p.id} style={{ background: 'var(--glass-bg)', border: '1px solid var(--hairline)', borderRadius: 14, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', backdropFilter: 'blur(8px) saturate(1.1)', WebkitBackdropFilter: 'blur(8px) saturate(1.1)' }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                                <span style={{ ...S.mono, fontSize: 14, fontWeight: 700, color: 'var(--fg)' }}>{p.pair}</span>
                                                <span style={{ padding: '2px 8px', borderRadius: 6, background: p.side === 'LONG' ? 'oklch(0.78 0.18 150/0.15)' : 'oklch(0.66 0.22 25/0.15)', border: `1px solid ${p.side === 'LONG' ? 'oklch(0.78 0.18 150/0.3)' : 'oklch(0.66 0.22 25/0.3)'}`, ...S.label, color: p.side === 'LONG' ? 'var(--pnl-up)' : 'var(--pnl-down)' }}>{p.side}</span>
                                            </div>
                                            <span style={{ ...S.label }}>Entry ${formatPrice(p.entryPrice)} · Mark ${formatPrice(curPrice)} · Size ${formatMoney(p.size)}</span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                                            <span style={{ padding: '3px 8px', borderRadius: 8, background: 'oklch(0.68 0.22 295/0.1)', border: '1px solid oklch(0.68 0.22 295/0.25)', ...S.mono, fontSize: 11, fontWeight: 700, color: 'var(--iris-violet)' }}>{p.leverage}×</span>
                                            <span style={{ ...S.mono, fontSize: 12, fontWeight: 700, color: posUnreal >= 0 ? 'var(--pnl-up)' : 'var(--pnl-down)' }}>
                                                {posUnreal >= 0 ? '+' : '-'}${formatMoney(Math.abs(posUnreal))}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </>
                    )
                )}
            </div>
        </div>
    );
};
const LeverageChangeModal = ({ isOpen, onClose, onConfirm, pendingTrade, existingPosition, marketPrices }: any) => {
    if (!isOpen || !pendingTrade || !existingPosition) return null;

    const MMR = 0.005;
    const markPrice  = marketPrices[existingPosition.pair] || existingPosition.entryPrice;
    const newLev     = pendingTrade.leverage;
    const oldLev     = existingPosition.leverage;
    const isReducing = newLev < oldLev;
    const side       = pendingTrade.side as 'LONG' | 'SHORT';

    // ── Weighted average entry after merge ──────────────────────
    const addedSize    = pendingTrade.size;
    const totalSize    = existingPosition.size + addedSize;
    const newEntry     = addedSize > 0
        ? ((existingPosition.size * existingPosition.entryPrice) + (addedSize * markPrice)) / totalSize
        : existingPosition.entryPrice;

    // ── Liquidation prices (same formula as orderEngine) ────────
    const oldLiqRaw = side === 'LONG'
        ? existingPosition.entryPrice * (1 - (1 / oldLev) + MMR)
        : existingPosition.entryPrice * (1 + (1 / oldLev) - MMR);
    const newLiqRaw = side === 'LONG'
        ? newEntry * (1 - (1 / newLev) + MMR)
        : newEntry * (1 + (1 / newLev) - MMR);

    const fmtLiq = (v: number) => v <= 0 ? 'None' : '$' + formatPrice(v);

    // ── Buffer (distance mark→liq as % of mark) ─────────────────
    // Positive = safer, 0 = at liq, negative = already past liq
    const oldBuf = Math.max(0, Math.abs((markPrice - oldLiqRaw) / markPrice) * 100);
    const newBuf = newLiqRaw <= 0 ? 100 : Math.max(0, Math.abs((markPrice - newLiqRaw) / markPrice) * 100);
    const bufImproves = newBuf > oldBuf;

    const bufColor = (b: number) => b < 5 ? 'var(--pnl-down)' : b < 10 ? '#f97316' : 'var(--pnl-up)';
    const bufLabel = (b: number) => b >= 100 ? 'SAFE' : b < 2 ? 'EXTREME' : b < 5 ? 'HIGH' : b < 10 ? 'MED' : 'LOW';

    // ── Margin delta ─────────────────────────────────────────────
    const oldMargin   = existingPosition.size / oldLev;
    const newMargin   = totalSize / newLev;
    const marginDelta = newMargin - oldMargin; // + = more locked, - = freed

    // Shared style tokens
    const S = {
        label: { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                 textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)' } as React.CSSProperties,
        mono:  { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1' } as React.CSSProperties,
        disp:  { fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' } as React.CSSProperties,
    };

    const RiskBar = ({ value, max = 25 }: { value: number; max?: number }) => {
        const pct  = Math.min(100, (value / max) * 100);
        const clr  = bufColor(value);
        return (
            <div style={{ height: 4, borderRadius: 4, background: 'var(--hairline-strong)', overflow: 'hidden', marginTop: 5 }}>
                <div style={{ height: '100%', width: `${pct}%`, background: clr, borderRadius: 4, transition: 'width 0.4s cubic-bezier(0.4,0,0.2,1)' }} />
            </div>
        );
    };

    return (
        <div
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center',
                     justifyContent: 'center', padding: 16, background: 'rgba(7,7,10,0.82)',
                     backdropFilter: 'blur(18px)' }}
            className="animate-fade-in"
        >
            <div
                onClick={(e: any) => e.stopPropagation()}
                className="animate-bounce-in"
                style={{ width: '100%', maxWidth: 420, position: 'relative', overflow: 'hidden',
                         background: 'var(--glass-bg-strong)', border: '1px solid var(--hairline-strong)',
                         borderRadius: 'var(--r-lg)', padding: 24, boxShadow: 'var(--glass-shadow)',
                         backdropFilter: 'blur(32px)' }}
            >
                {/* Holo accent bar */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                              background: 'var(--holo-linear)', backgroundSize: '220% 100%',
                              animation: 'holoSlide 9s linear infinite' }} />

                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <AlertTriangle size={18} style={{ color: isReducing ? '#f97316' : 'var(--pnl-up)', flexShrink: 0 }} />
                    <h3 style={{ ...S.disp, fontSize: 22, color: 'var(--fg)', margin: 0 }}>
                        {isReducing ? 'Reduce Leverage' : 'Increase Leverage'}
                    </h3>
                    <span style={{ marginLeft: 'auto', padding: '2px 9px', borderRadius: 99,
                                   background: isReducing ? 'oklch(0.55 0.18 50/0.15)' : 'oklch(0.78 0.18 150/0.12)',
                                   border: `1px solid ${isReducing ? 'oklch(0.55 0.18 50/0.3)' : 'oklch(0.78 0.18 150/0.25)'}`,
                                   ...S.label, fontSize: 9,
                                   color: isReducing ? '#f97316' : 'var(--pnl-up)' }}>
                        {oldLev}x → {newLev}x
                    </span>
                </div>

                <p style={{ ...S.mono, fontSize: 12, color: 'var(--fg-muted)', marginBottom: 20, lineHeight: 1.55 }}>
                    {isReducing
                        ? `Reducing leverage locks more margin but moves your liquidation price further away, increasing your safety buffer.`
                        : `Increasing leverage frees up margin but brings your liquidation price closer — your buffer shrinks.`}
                    {addedSize > 0 && ` Your new order ($${formatMoney(addedSize)}) will be merged into the existing position.`}
                </p>

                {/* ── Buffer comparison ── */}
                <div style={{ background: 'var(--chip-bg)', border: '1px solid var(--hairline)',
                              borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
                    <p style={{ ...S.label, marginBottom: 12 }}>Liquidation Buffer</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 24px 1fr', alignItems: 'center', gap: 8 }}>
                        {/* Before */}
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                <span style={{ ...S.label, fontSize: 9, color: 'var(--fg-subtle)' }}>Before</span>
                                <span style={{ ...S.mono, fontSize: 13, fontWeight: 700, color: bufColor(oldBuf) }}>
                                    {oldBuf.toFixed(1)}%
                                </span>
                            </div>
                            <RiskBar value={oldBuf} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                                <span style={{ ...S.label, fontSize: 8, color: bufColor(oldBuf) }}>{bufLabel(oldBuf)}</span>
                                <span style={{ ...S.mono, fontSize: 9, color: 'var(--fg-subtle)' }}>{fmtLiq(oldLiqRaw)}</span>
                            </div>
                        </div>
                        {/* Arrow */}
                        <div style={{ textAlign: 'center' as const, color: bufImproves ? 'var(--pnl-up)' : '#f97316',
                                      fontSize: 14, fontWeight: 700 }}>
                            {bufImproves ? '→' : '→'}
                        </div>
                        {/* After */}
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                <span style={{ ...S.label, fontSize: 9, color: 'var(--fg-subtle)' }}>After</span>
                                <span style={{ ...S.mono, fontSize: 13, fontWeight: 700, color: bufColor(newBuf) }}>
                                    {newBuf >= 100 ? '∞' : newBuf.toFixed(1) + '%'}
                                </span>
                            </div>
                            <RiskBar value={newBuf} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                                <span style={{ ...S.label, fontSize: 8, color: bufColor(newBuf) }}>{bufLabel(newBuf)}</span>
                                <span style={{ ...S.mono, fontSize: 9, color: 'var(--fg-subtle)' }}>{fmtLiq(newLiqRaw)}</span>
                            </div>
                        </div>
                    </div>
                    {/* Change callout */}
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--hairline)',
                                  display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ ...S.mono, fontSize: 11, color: bufImproves ? 'var(--pnl-up)' : '#f97316', fontWeight: 700 }}>
                            {bufImproves ? '↑' : '↓'} {Math.abs(newBuf - oldBuf).toFixed(1)}pp
                        </span>
                        <span style={{ ...S.mono, fontSize: 11, color: 'var(--fg-muted)' }}>
                            {bufImproves
                                ? 'safer — liq. price moves further away'
                                : 'riskier — liq. price moves closer'}
                        </span>
                    </div>
                </div>

                {/* ── Position summary grid ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 20 }}>
                    {[
                        { label: 'Entry Price', val: `$${formatPrice(newEntry)}`, clr: 'var(--fg)' },
                        { label: 'Margin Δ',
                          val: `${marginDelta >= 0 ? '-' : '+'}$${formatMoney(Math.abs(marginDelta))}`,
                          clr: marginDelta >= 0 ? 'var(--pnl-down)' : 'var(--pnl-up)' },
                        { label: 'Total Margin', val: `$${formatMoney(newMargin)}`, clr: 'var(--fg)' },
                    ].map(({ label, val, clr }) => (
                        <div key={label} style={{ background: 'var(--chip-bg)', border: '1px solid var(--hairline)',
                                                   borderRadius: 10, padding: '10px 12px' }}>
                            <p style={{ ...S.label, marginBottom: 5 }}>{label}</p>
                            <p style={{ ...S.mono, fontSize: 13, fontWeight: 700, color: clr }}>{val}</p>
                        </div>
                    ))}
                </div>

                {/* ── Margin impact banner ── */}
                {Math.abs(marginDelta) > 0.01 && (
                    <div style={{ marginBottom: 18, padding: '10px 14px', borderRadius: 10,
                                  background: marginDelta > 0 ? 'oklch(0.55 0.18 50/0.10)' : 'oklch(0.78 0.18 150/0.08)',
                                  border: `1px solid ${marginDelta > 0 ? 'oklch(0.55 0.18 50/0.25)' : 'oklch(0.78 0.18 150/0.20)'}` }}>
                        <p style={{ ...S.mono, fontSize: 11, fontWeight: 700,
                                    color: marginDelta > 0 ? '#f97316' : 'var(--pnl-up)', margin: 0 }}>
                            {marginDelta > 0
                                ? `$${formatMoney(marginDelta)} will be locked as additional margin`
                                : `✓ $${formatMoney(Math.abs(marginDelta))} freed back to your balance`}
                        </p>
                    </div>
                )}

                {/* ── Actions ── */}
                <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={onClose}
                        style={{ flex: 1, padding: '11px', borderRadius: 10,
                                 background: 'var(--chip-bg)', border: '1px solid var(--hairline-strong)',
                                 ...S.mono, fontSize: 12, fontWeight: 700, color: 'var(--fg-muted)',
                                 cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase' as const,
                                 transition: 'background 0.12s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--chip-bg-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'var(--chip-bg)')}>
                        Cancel
                    </button>
                    <button onClick={onConfirm}
                        style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none',
                                 background: 'var(--iris-violet)',
                                 ...S.mono, fontSize: 12, fontWeight: 700, color: '#fff',
                                 cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase' as const,
                                 transition: 'opacity 0.12s' }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
                        Confirm {newLev}x
                    </button>
                </div>
            </div>
        </div>
    );
};

const ResetPasswordModal = ({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setError('');
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true);
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateErr) { setError(updateErr.message); return; }
    onSuccess();
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="glass-panel w-full max-w-sm rounded-3xl p-6 animate-bounce-in">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-black text-gray-900 dark:text-white">Set new password</h2>
            <p className="text-xs text-gray-500 mt-0.5">Choose a strong password for your account</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-white">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" className="shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <p className="text-xs text-red-500 font-medium">{error}</p>
          </div>
        )}

        <div className="space-y-3 mb-5">
          <div className="relative">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <input
              type={showPw ? 'text' : 'password'}
              placeholder="New password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full pl-10 pr-10 py-3 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white text-sm font-medium outline-none focus:border-blue-500 transition-colors"
            />
            <button onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showPw
                ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
            </button>
          </div>
          <div className="relative">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <input
              type={showPw ? 'text' : 'password'}
              placeholder="Confirm new password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              className="w-full pl-10 pr-4 py-3 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white text-sm font-medium outline-none focus:border-blue-500 transition-colors"
            />
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={loading}
          className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-sm transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Update Password'}
        </button>
      </div>
    </div>
  );
};

const App = () => {
    const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('velo_theme') as 'light' | 'dark') || 'dark');
    // Initialize from localStorage cache immediately — eliminates the "Log In" flash
    // on every page load while Supabase session restore runs in the background.
    // Supabase INITIAL_SESSION overwrites this with fresh data once it resolves.
    const [user, setUser] = useState<UserProfile | null>(() => readSessionCache());
    // Tracks whether the initial auth check is complete — prevents flash of "not logged in" on refresh
    // If we have a cached user, skip the loading screen — Supabase refreshes in background.
    // If no cache, show loading until session restore completes.
    const [authChecked, setAuthChecked] = useState(() => readSessionCache() !== null);
    // Bumped after intentional logout clears, to re-arm socialLoginEffect when wallet stays connected
    const [retryAuthTick, setRetryAuthTick] = useState(0);
    const [activeTab, setActiveTab] = useState<TabView>(TabView.TRADE); 

    // ── Analytics: virtual page_view on tab change (SPA navigation) ──────────
    useEffect(() => {
        try { trackPageView(`/${String(activeTab).toLowerCase()}`, `VELO · ${String(activeTab)}`); } catch (_) { /* no-op */ }
    }, [activeTab]);

    // ── Activity heartbeat: powers DAU / WAU / MAU in the admin dashboard ────
    // Fires when a user is present (mount + tab focus regained) and every 3 min
    // while the tab stays open. No-op when logged out or Supabase unconfigured.
    useEffect(() => {
        if (!user?.id) return;
        try { setAnalyticsUser(user.id); } catch (_) { /* no-op */ }
        touchUserActivity(true);
        const interval = setInterval(() => touchUserActivity(), 180_000);
        const onVisible = () => { if (document.visibilityState === 'visible') touchUserActivity(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
    }, [user?.id]);

    const [traders, setTraders] = useState<Trader[]>(() => cacheGet<Trader[]>('traders') || []);
    const [posts, setPosts] = useState<Post[]>(() => cacheGet<Post[]>('posts') || []);
    // Keep the module-level verified-badge map in sync with admin-assigned
    // verification on traders + the current user. Computed during render (before
    // children render) so <VerifiedBadge> resolves against fresh data. Only ids
    // with a non-null verifiedReason end up here, so the badge is admin-gated.
    VERIFIED_REASON_BY_ID = React.useMemo(() => {
        const m: Record<string, string> = {};
        for (const t of traders) if (t?.id && t.verifiedReason) m[t.id] = t.verifiedReason as string;
        if (user?.id && user.verifiedReason) m[user.id] = user.verifiedReason as string;
        return m;
    }, [traders, user]);
    const [positions, setPositions] = useState<Position[]>([]);
    const [openOrders, setOpenOrders] = useState<OpenOrder[]>([]); 
    const [marketPrices, setMarketPrices] = useState<Record<string, number>>({});
    const [marketChanges, setMarketChanges] = useState<Record<string, number>>({});
    const [candles, setCandles] = useState<Record<string, Candle[]>>({});
    const [notifications, setNotifications] = useState<Notification[]>(() => readNotifCache());
    // Notification-driven focus for the Trade view. tradeFocus.tab forces the
    // PositionsPanel tab; tradeFocus.highlightId briefly outlines a matching row.
    const [tradeFocus, setTradeFocus] = useState<{ tab?: 'POSITIONS' | 'OPEN ORDERS' | 'HISTORY'; highlightId?: string; key: number } | null>(null);
    // When a POSITION_CLOSED/TP/SL notification is clicked, auto-open that trade's details modal
    const [autoOpenHistoryId, setAutoOpenHistoryId] = useState<string | null>(null);
    // App-level order details modal — opened directly from notifications without switching tabs
    const [appOrderDetails, setAppOrderDetails] = useState<DetailsPayload | null>(null);
    // Notification-driven focus for the Social feed
    const [socialFocusPostId, setSocialFocusPostId] = useState<string | null>(null);
    const [socialOpenCommentsPostId, setSocialOpenCommentsPostId] = useState<string | null>(null);
    // Single post view — like Twitter's /status/:id
    const [singlePostId, setSinglePostId] = useState<string | null>(null);
    const [deletePostConfirm, setDeletePostConfirm] = useState<{ isOpen: boolean; postId: string | null; onConfirm: (() => void) | null; itemType: 'post' | 'comment' }>({ isOpen: false, postId: null, onConfirm: null, itemType: 'post' });
    const [createPostModalOpen, setCreatePostModalOpen] = useState(false);
    const [activePair, setActivePair] = useState(PAIRS[0]);
    // Clear social focus state when leaving the Social tab
    useEffect(() => {
        if (activeTab !== TabView.SOCIAL) {
            setSocialFocusPostId(null);
            setSocialOpenCommentsPostId(null);
            setSinglePostId(null);
        }
        if (activeTab !== TabView.TRADE) {
            setAutoOpenHistoryId(null);
        }
    }, [activeTab]);

    // Public posts fetch — runs on first Social tab entry regardless of auth state.
    // Without this, anonymous visitors (and brand-new accounts that haven't fully
    // hydrated yet) see an empty feed because the original fetchPosts is gated
    // behind the session-restore path.
    useEffect(() => {
        if (activeTab !== TabView.SOCIAL) return;
        if (posts.length > 0) return; // don't refetch if already loaded
        if (!isSupabaseConfigured()) return;
        fetchPosts(50).then((loaded) => {
            if (loaded.length > 0) setPosts(loaded);
        }).catch((e) => console.warn('[velo] public posts fetch failed', e));
    }, [activeTab, posts.length]);
    // Fetch real candles whenever the active pair changes (covers URL routing + pair selector)
    useEffect(() => {
        const tf = chartPrefs.chartTf || '15m';
        fetchPythKlines(activePair.id, tf).then(klineCandles => {
            if (klineCandles.length > 0) {
                setCandles(prev => ({ ...prev, [activePair.id]: klineCandles }));
            }
        });
    }, [activePair.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // Chart preferences — restored from Supabase on login
    const [chartPrefs, setChartPrefs] = useState<Pick<UserPreferences, 'chartTf' | 'chartStyle' | 'indicators' | 'overlays'>>({
        chartTf:    DEFAULT_PREFERENCES.chartTf,
        chartStyle: DEFAULT_PREFERENCES.chartStyle,
        indicators: DEFAULT_PREFERENCES.indicators,
        overlays:   DEFAULT_PREFERENCES.overlays,
    });
    const prefsSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [isLoginOpen, setLoginOpen] = useState(false);
    // Username for SUCCESS_RETURNING screen — set by silent login in socialLoginHandledRef effect
    const [loginReturningName, setLoginReturningName] = useState<string>('');
    const [isResetPasswordOpen, setResetPasswordOpen] = useState(false);
    const [isOrderlyOnboardingOpen, setOrderlyOnboardingOpen] = useState(false);
    const [onboardingDismissed, setOnboardingDismissed] = useState(false); // session flag — don't auto-reopen
    const [isVeloWelcomeOpen, setVeloWelcomeOpen] = useState(false);
    // True only for the window between a brand-new account being created this
    // session and the first-run faucet/welcome flow completing. Returning,
    // already-registered accounts keep this false so the faucet never reopens.
    const freshSignupRef = useRef(false);
    // Tracks whether the wallet connected via a genuine user action this session
    // (AppKit connect flow), as opposed to wagmi's silent auto-reconnect on page reload.
    // socialLoginEffect only runs the sign-in/onboard flow for genuine connects.
    const freshWalletConnectRef = useRef(false);
    const [isVeloBridgeOpen, setVeloBridgeOpen] = useState(false);
    const [isVeloDepositOpen, setVeloDepositOpen] = useState(false);
    const [isVeloUsernameOpen, setVeloUsernameOpen] = useState(false);
    const [isVeloSendOpen, setVeloSendOpen] = useState(false);
    const [isVeloWithdrawOpen, setVeloWithdrawOpen] = useState(false);
    const [managingPosition, setManagingPosition] = useState<Position | null>(null);
    const [managingPositionTab, setManagingPositionTab] = useState<'ADD' | 'REDUCE' | 'PARTIAL' | 'TRIGGERS'>('ADD');
    const [isCrossAccountOpen, setCrossAccountOpen] = useState(false);
    const [crossAccountTab, setCrossAccountTab] = useState<'DEPOSIT' | 'WITHDRAW'>('DEPOSIT');
    const [shareCardData, setShareCardData] = useState<ShareCardData | null>(null);
    const [shareTradeData, setShareTradeData] = useState<ClosedTradeShareData | null>(null);
    const [isSettingsOpen, setSettingsOpen] = useState(false);
    const [orderlyDWModal, setOrderlyDWModal] = useState<{ open: boolean; type: 'DEPOSIT' | 'WITHDRAW' }>({ open: false, type: 'DEPOSIT' });

    // Toast must be declared BEFORE useOrderlyTrading because we pass setToast
    // into that hook as a callback. Moving this any later → TDZ crash on init.
    const [toast, setToast] = useState<{ message: string, type: 'SUCCESS' | 'ERROR' | 'INFO' } | null>(null);

    // ── Orderly on-chain trading ─────────────────────────────────────────────
    const [burnerAddress, setBurnerAddress] = useState<`0x${string}` | null>(null);
    const { state: orderly, activateOrderly, placeOrderlyTrade, cancelOrderlyTrade, withdrawFromOrderly, refreshBalance: refreshOrderlyBalance } = useOrderlyTrading(
      (msg, type) => setToast({ message: msg, type }),
      burnerAddress,
    );
    const chainId = useChainId();
    const { address: walletAddress, isConnected: isWalletConnected, status: wagmiStatus } = useAccount();
    const { open: openAppKitModal } = useAppKit();
    const publicClient = usePublicClient();
    const { signMessageAsync } = useSignMessage();
    // Guard so the auto-recovery signature prompt fires at most once per session.
    const autoRecoverAttemptedRef = useRef(false);

    // ── Contract owner read ─────────────────────────────────────────────────
    // Used to gate the ADMIN tab + admin panel. One read on mount, no polling.
    const [contractOwner, setContractOwner] = useState<string | null>(null);
    useEffect(() => {
      if (!publicClient) return;
      publicClient.readContract({
        address: VELO_PERPS_ADDRESS,
        abi: VELO_PERPS_ABI,
        functionName: 'owner',
      }).then((o) => setContractOwner(o as string))
        .catch(() => setContractOwner(null));
    }, [publicClient]);
    const isContractOwner = !!walletAddress && !!contractOwner
      && walletAddress.toLowerCase() === contractOwner.toLowerCase();

    // ── Persistence-error surfacing (batch 7) ──────────────────────────────
    // supabaseStore reports any fire-and-forget insert failure (trade rows,
    // activity rows) through `onPersistenceError`. Without this listener those
    // failures only show in devtools — the user sees their CLOSE row appear
    // in Recent Activity, refreshes, and watches it vanish with no clue why.
    //
    // We throttle: one toast per kind per 60 seconds. The full error still
    // goes to console for grep in Vercel logs.
    useEffect(() => {
      const lastShown = new Map<string, number>();
      const unsubscribe = onPersistenceError((err) => {
        const now = Date.now();
        const lastTime = lastShown.get(err.kind) || 0;
        if (now - lastTime < 60_000) return; // throttle
        lastShown.set(err.kind, now);
        const label = err.kind === 'TRADE_HISTORY' ? 'Trade history not saved'
                    : err.kind === 'TRANSACTION'   ? 'Activity not saved'
                    : err.kind === 'POSITION'      ? 'Position not saved'
                    : 'Profile sync failed';
        const detail = err.hint || err.message;
        setToast({ message: `${label} — ${detail}`, type: 'ERROR' });
      });
      return unsubscribe;
    }, []);

    // ── Activity refetch on tab focus (batch 7) ────────────────────────────
    // Session restore fetches trade_history + transactions once at mount. If
    // that initial fetch is racy (RLS still settling) the user sees an empty
    // Recent Activity table even though rows ARE in the DB. This effect
    // re-pulls both whenever the tab becomes visible, making the back-to-Velo
    // experience self-healing.
    //
    // Cheap: two LIMIT'd SELECTs, only when the tab is actually being viewed.
    // Idempotent: setUser merges by replacing the arrays, never appends.
    //
    // This is also the long-term fix for "Recent activity disappears on
    // refresh" — even if the initial promise.all has weird timing, the next
    // tab focus heals it.

    // ── Velo Perps on-chain trading (Phase 1+) ──────────────────────────────
    // New on-chain trading layer. Runs alongside Orderly during the migration.
    // `useVeloPerpsTrading` polls VeloPerps every 5s — single source of truth
    // for any position cards rendered by VeloPerpsPanel.
    const veloPerpsTrading = useVeloPerpsTrading();

    // Restore burner address from localStorage on mount / wallet connect so
    // useOrderlyTrading immediately uses the Velo address instead of MetaMask.
    // Without this, every page reload clears burnerAddress → keypair lookup
    // uses the wrong address → balance shows $0.00 and user must re-activate.
    useEffect(() => {
      if (!walletAddress) return;
      const cached = loadStoredBurner(walletAddress);
      if (cached?.veloAddress) {
        setBurnerAddress(cached.veloAddress as `0x${string}`);
      }
    }, [walletAddress]);

    // When wagmi finishes its async reconnect after page load, walletAddress
    // becomes defined. If the user is already restored from Supabase but
    // walletAddress was missing (used DB fallback), patch it in now.
    useEffect(() => {
      if (walletAddress && user && !user.walletAddress) {
        setUser(prev => prev ? { ...prev, walletAddress } : null);
      }
    }, [walletAddress, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Trading (burner) wallet re-derivation gate ───────────────────────────
    // The burner private key lives only in this browser's localStorage. On a NEW
    // machine, a returning user (profile has velo_wallet_address) has no local
    // burner and MUST authorize a signature to deterministically re-derive the
    // exact same wallet/funds.
    //
    // Rather than silently auto-firing the signature (which wallets often block
    // when not triggered by a user gesture, and which leaves confused users
    // hunting for the manual button in Settings), we surface an explicit,
    // persistent modal. It stays until the user completes it — and re-appears if
    // they land on Trade without a wallet — so nobody is left stranded.
    const burnerRecoveredRef = useRef(false);
    const [needsRederive, setNeedsRederive] = useState(false);
    const [rederiving, setRederiving] = useState(false);
    const [rederiveError, setRederiveError] = useState<string | null>(null);
    useEffect(() => {
      const expected = user?.veloWalletAddress?.toLowerCase();
      if (!user || !walletAddress || !isWalletConnected || !expected) { setNeedsRederive(false); return; }
      if (burnerRecoveredRef.current) { setNeedsRederive(false); return; }
      // Already have a local burner that matches? Nothing to do.
      const local = loadStoredBurner(walletAddress)?.veloAddress?.toLowerCase();
      if (local && local === expected) { burnerRecoveredRef.current = true; setNeedsRederive(false); return; }
      // Missing (or mismatched) local burner → prompt the user to authorize.
      setNeedsRederive(true);
    }, [user, walletAddress, isWalletConnected, activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

    // User-initiated re-derivation. A click-triggered signature is far more
    // reliable than a programmatic one, and keeps the user in control.
    const handleRederive = useCallback(async () => {
      const expected = user?.veloWalletAddress?.toLowerCase();
      if (!walletAddress || !expected) return;
      setRederiving(true);
      setRederiveError(null);
      try {
        const recovered = await getOrCreateVeloBurner(walletAddress as `0x${string}`, signMessageAsync as any);
        if (recovered.veloAddress.toLowerCase() !== expected) {
          // Derived a different wallet than the one on record — don't trust it.
          try { localStorage.removeItem(`velo_burner_${walletAddress.toLowerCase()}`); } catch {}
          setRederiveError('That signature derived a different wallet. Make sure you are connected with the same wallet you originally signed up with, then try again.');
          return;
        }
        burnerRecoveredRef.current = true;
        setBurnerAddress(recovered.veloAddress as `0x${string}`);
        veloPerpsTrading.reloadBurner();
        setNeedsRederive(false);
        setToast({ message: 'Trading wallet restored', type: 'SUCCESS' });
      } catch (e: any) {
        if (/reject|denied|cancel/i.test(e?.message || '')) {
          setRederiveError('Signature declined. You need to authorize it to restore your trading wallet and trade.');
        } else {
          setRederiveError('Could not restore the wallet. Please try again.');
          console.warn('[velo] burner re-derivation failed:', e?.message);
        }
      } finally {
        setRederiving(false);
      }
    }, [user, walletAddress, signMessageAsync]); // eslint-disable-line react-hooks/exhaustive-deps

    // Activity refetch on tab focus — the body of the effect described in the
    // comment block higher up. Placed here because it needs `user` in scope.
    // IMPORTANT: `authChecked` is included in deps so this effect re-runs once
    // restoreSession finishes and the JWT is fully active. Without it, the
    // initial fire (from the cached user.id) can race against JWT activation
    // and silently return [] — and never retry since user.id doesn't change.
    useEffect(() => {
      if (!user?.id || !isSupabaseConfigured()) return;
      // Skip if auth hasn't been confirmed yet — JWT may not be active and
      // fetchTransactions/fetchTradeHistory would silently return [] due to RLS.
      // We'll re-run once authChecked flips true (after restoreSession).
      if (!authChecked) return;
      let isMounted = true;
      let retryTimer: ReturnType<typeof setTimeout> | null = null;

      const refetch = async (isRetry = false) => {
        try {
          const [history, txns] = await Promise.all([
            fetchTradeHistory(user.id),
            fetchTransactions(user.id),
          ]);
          if (!isMounted) return;

          setUser(prev => {
            if (!prev) return prev;
            const prevHistLen = prev.tradeHistory?.length || 0;
            const prevTxLen = prev.transactionHistory?.length || 0;

            // GUARD: if the DB returned nothing but we have cached/optimistic history,
            // the JWT may not have propagated through Supabase RLS yet.
            // Don't clobber — schedule a retry instead of wiping the UI.
            if (!isRetry && history.length === 0 && txns.length === 0 && (prevHistLen > 0 || prevTxLen > 0)) {
              if (isMounted) retryTimer = setTimeout(() => { void refetch(true); }, 2200);
              return prev;
            }

            // MERGE, don't clobber. Server rows take precedence by id; local
            // optimistic rows not yet confirmed by the server are kept until a
            // future refetch confirms them.
            const serverHistIds = new Set(history.map(h => h.id));
            const matchesServerHist = (local: TradeHistoryItem) => history.some(s =>
              s.pair === local.pair &&
              s.side === local.side &&
              (s.action || 'OPEN') === (local.action || 'OPEN') &&
              Math.abs(s.timestamp - local.timestamp) < 10_000
            );
            const localOnlyHist = prev.tradeHistory.filter(local =>
              !serverHistIds.has(local.id) && !matchesServerHist(local)
            );
            const mergedHist = [...localOnlyHist, ...history].sort((a, b) => b.timestamp - a.timestamp);

            const serverTxIds = new Set(txns.map(t => t.id));
            const matchesServerTx = (local: any) => txns.some(s =>
              s.type === local.type &&
              Math.abs(s.amount - local.amount) < 0.005 &&
              Math.abs(s.timestamp - local.timestamp) < 10_000
            );
            const localOnlyTx = (prev.transactionHistory || []).filter(local =>
              !serverTxIds.has(local.id) && !matchesServerTx(local)
            );
            const mergedTx = [...localOnlyTx, ...txns].sort((a, b) => b.timestamp - a.timestamp);

            return { ...prev, tradeHistory: mergedHist, transactionHistory: mergedTx };
          });
        } catch (e) {
          console.warn('[velo] activity refetch failed:', e);
          if (!isRetry && isMounted) retryTimer = setTimeout(() => { void refetch(true); }, 3000);
        }
      };

      const onVisible = () => { if (document.visibilityState === 'visible') void refetch(); };
      document.addEventListener('visibilitychange', onVisible);
      void refetch();
      return () => {
        isMounted = false;
        if (retryTimer) clearTimeout(retryTimer);
        document.removeEventListener('visibilitychange', onVisible);
      };
    }, [user?.id, authChecked]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Social login onboarding trigger ────────────────────────────────────
    // When AppKit finishes a social/email login, isWalletConnected flips true
    // but isLoginOpen is false (AppKit handled the login without the user
    // explicitly opening AuthModal). If there's no user yet, open AuthModal
    // so the splash → name → email onboarding flow runs automatically.
    //
    // IMPORTANT: gate on authChecked — on a refresh the wallet reconnects
    // immediately while Supabase session restore is still async. Without this
    // guard, a returning logged-in user would see the login modal pop up on
    // every refresh (user is null during the async restore window).
    const socialLoginHandledRef = useRef(false);

    // When wagmiStatus transitions through 'connecting' it means the user actively
    // opened AppKit and chose a wallet. Page-reload reconnects go straight from
    // 'reconnecting' → 'connected' and never hit 'connecting', so this reliably
    // distinguishes the two cases without any setTimeout hacks.
    useEffect(() => {
      if (wagmiStatus === 'connecting') {
        freshWalletConnectRef.current = true;
        // User explicitly opened AppKit and is picking a wallet — they want
        // to be signed in. Clear the post-logout lock so restoreSession and
        // the silent socialLoginEffect can proceed normally. Auto-reconnect
        // (which goes 'reconnecting' → 'connected', never touching this
        // branch) leaves the lock untouched.
        try { if (typeof window !== 'undefined') window.__veloLogoutLock = false; } catch {}
      }
      if (wagmiStatus === 'disconnected') {
        freshWalletConnectRef.current = false;
        socialLoginHandledRef.current = false;
      }
    }, [wagmiStatus]);
    // ── Social login / onboarding trigger ─────────────────────────────────
    // Fires ONLY when the user actively connected their wallet this session
    // (freshWalletConnectRef=true, set when wagmiStatus passes through 'connecting').
    // Page-reload auto-reconnects (wagmiStatus goes 'reconnecting'→'connected',
    // never touching 'connecting') are completely excluded — Supabase INITIAL_SESSION
    // handles those. This eliminates the race between restoreSession and this effect.
    useEffect(() => {
      // Logout sentinel — see the IIFE at the top of this file. If the lock
      // is set, this load came from a logout navigate; do NOT silently
      // re-sign-in just because wagmi auto-reconnected to MetaMask. The
      // lock is cleared when the user explicitly opens AppKit ('connecting'
      // wagmiStatus transition above).
      if (typeof window !== 'undefined' && window.__veloLogoutLock) return;
      if (!isWalletConnected || !walletAddress) {
        socialLoginHandledRef.current = false;
        return;
      }
      // KEY GUARD: page-reload reconnects must never trigger this flow.
      // Only a genuine user-initiated AppKit connect sets this flag.
      if (!freshWalletConnectRef.current) return;
      if (!authChecked) return;
      if (user) return;
      if (isLoginOpen) return;
      if (socialLoginHandledRef.current) return;
      if (freshSignupRef.current) return;
      socialLoginHandledRef.current = true;

      setTimeout(async () => {
        if (freshSignupRef.current) return;
        if (intentionalLogoutRef.current) return;
        const pseudoEmail = `${walletAddress.toLowerCase()}@wallet.velo`;
        const password = `velo_w3_${walletAddress.toLowerCase().slice(2, 20)}_xK9`;

        // Distinguish a genuine "no wallet account yet" from a transient
        // failure. Supabase returns "Invalid login credentials" (status 400)
        // ONLY when the email/password pair doesn't exist — that's the real
        // onboarding signal. Network blips, 5xx, rate-limits, and JWT-timing
        // races surface as other messages/statuses. Previously every error
        // (including transient ones) dropped a returning user onto the login
        // modal — the root cause of the "flaky sign-on": a momentary network
        // hiccup looked identical to "you have no account". We now retry the
        // transient cases a couple of times before giving up.
        const isNoAccountError = (err: any): boolean => {
          if (!err) return false;
          const msg = (err.message || '').toLowerCase();
          const status = err.status ?? err.code;
          return status === 400 && (msg.includes('invalid login credentials') || msg.includes('invalid credentials'));
        };

        const MAX_ATTEMPTS = 3;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          if (freshSignupRef.current || intentionalLogoutRef.current) return;
          try {
            const { data, error: signInErr } = await supabase.auth.signInWithPassword({ email: pseudoEmail, password });
            if (freshSignupRef.current) return;

            if (data?.user && !signInErr) {
              const { data: profile } = await supabase.from('profiles').select('*').eq('id', data.user.id).single();
              if (freshSignupRef.current) return;
              if (profile?.username) {
                intentionalLogoutRef.current = false;
                freshSignupRef.current = false;
                socialLoginHandledRef.current = true;
                sessionRestoredRef.current = true;
                silentLoginCallbackRef.current?.(data.user, profile);
                return;
              }
              // Authenticated but no profile row yet — treat as new account.
              break;
            }

            if (isNoAccountError(signInErr)) {
              // Genuine: this wallet has never signed up. Stop and onboard.
              break;
            }

            // Transient error — back off and retry (unless this was the last try).
            if (attempt < MAX_ATTEMPTS) {
              console.warn(`[velo] silent wallet sign-in transient error (attempt ${attempt}/${MAX_ATTEMPTS}):`, signInErr?.message);
              await new Promise(r => setTimeout(r, attempt * 600));
              continue;
            }
          } catch (e: any) {
            // Thrown (network) error — same transient handling.
            if (attempt < MAX_ATTEMPTS) {
              console.warn(`[velo] silent wallet sign-in threw (attempt ${attempt}/${MAX_ATTEMPTS}):`, e?.message);
              await new Promise(r => setTimeout(r, attempt * 600));
              continue;
            }
          }
          break;
        }

        // No existing account (or retries exhausted) — open onboarding.
        if (freshSignupRef.current || intentionalLogoutRef.current) return;
        socialLoginHandledRef.current = false;
        setLoginReturningName('');
        setLoginOpen(true);
      }, 400);
    }, [isWalletConnected, walletAddress, user, isLoginOpen, authChecked, retryAuthTick]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Velo Welcome onboarding (Phase 3) ─────────────────────────────────
    // Opens ONLY AFTER a brand-new account is created this session (the
    // AuthModal "Hello → handle → email" flow sets freshSignupRef). Returning
    // / already-registered accounts never see the first-run faucet flow again,
    // even if a contract address changed or local storage was cleared.
    useEffect(() => {
      if (!user) return;                                          // wait for account
      if (!isWalletConnected) return;                             // and a wallet
      if (isLoginOpen) return;                                    // auth still in progress
      if (!freshSignupRef.current) return;                        // returning/registered → never
      if (isVeloWelcomeOpen) return;                              // already open
      // For brand-new accounts don’t gate on isInitialLoading — they have no
      // balance yet so it may spin for seconds. Open the welcome modal immediately.
      if (veloPerpsTrading.openPositions.length > 0) return;      // safety: returning trader
      setVeloWelcomeOpen(true);
    }, [user, isWalletConnected, isLoginOpen, veloPerpsTrading.openPositions.length, isVeloWelcomeOpen, walletAddress]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── VeloPerps → local positions sync (Phase 3) ─────────────────────────
    // The contract is the source of truth for positions. We translate VeloPosition
    // (from useVeloPerpsTrading) → the existing Position shape used by Dashboard
    // and TradeView so the existing UI keeps working without rewriting every row
    // renderer. Keyed by tradeId so reads are idempotent.
    //
    // Pair label translation: VeloPerps uses "BTC-USD" / "ETH-USD", the UI uses
    // "BTC/USD" / "ETH/USD". Done inline here to keep the existing UI untouched.
    useEffect(() => {
      if (!user || !isWalletConnected) return;
      if (veloPerpsTrading.isInitialLoading) return;

      // Persisted open-tx hashes keyed by tradeId. The contract sync can't carry
      // the tx hash, so we stored it at open time; this lets the details modal
      // link to the exact opening transaction even after a reload.
      let openTxMap: Record<string, string> = {};
      try { openTxMap = JSON.parse(localStorage.getItem('velo_open_tx') || '{}'); } catch {}

      const onChainPositions: Position[] = veloPerpsTrading.openPositions.map((p) => {
        const uiPair = p.pair.replace('-', '/'); // BTC-USD → BTC/USD etc.
        const notional = p.collateralUSDC * p.leverage;
        // marginMode comes straight from the V3 contract's Position struct.
        // Falls back to 'ISOLATED' for V1/V2 positions which don't have the field.
        const mm: MarginMode = (p.marginMode === 'CROSS' || p.marginMode === 'ISOLATED')
          ? p.marginMode
          : 'ISOLATED';
        const tradeIdKey = p.tradeId.toString();
        // Overlay any pending TP/SL set at open time that the contract hasn't
        // surfaced yet (gap between setTriggers mining and the next 5s poll).
        // If the contract already returned a non-zero TP/SL, prefer that and
        // clear the pending entry — they agree, the optimistic state served
        // its purpose.
        const pending = pendingTriggers.current.get(tradeIdKey);
        if (pending && p.takeProfit && pending.takeProfit && Math.abs(p.takeProfit - pending.takeProfit) < 0.01) {
          pendingTriggers.current.delete(tradeIdKey);
        }
        const overlayTp = p.takeProfit || pending?.takeProfit;
        const overlaySl = p.stopLoss   || pending?.stopLoss;
        return {
          id: `velo_${tradeIdKey}`,
          pair: uiPair,
          side: p.isLong ? 'LONG' : 'SHORT',
          entryPrice: p.entryPrice,
          size: notional,
          leverage: p.leverage,
          marginMode: mm,
          liquidationPrice: p.isLong
            ? p.entryPrice * (1 - 0.9 / p.leverage)
            : p.entryPrice * (1 + 0.9 / p.leverage),
          timestamp: p.openedAt * 1000,
          onChain: true,
          // ── V2 fields required for manage modal routing ──────────────────────
          // Without onChainTradeId the manage modal can't be reached — the UI
          // falls back to the legacy EditPositionModal which only saves to Supabase.
          onChainTradeId: tradeIdKey,
          takeProfit: overlayTp,
          stopLoss: overlaySl,
          // Reuse the orderly fields for tx link surfacing (modal already reads them).
          orderlyOrderId: undefined,
          orderlyOrderUrl: (() => {
            const tx = p.openTxHash || openTxMap[tradeIdKey];
            return tx ? (tx.startsWith('http') ? tx : `https://sepolia.basescan.org/tx/${tx}`) : undefined;
          })(),
        };
      });

      setPositions((prev) => {
        // Keep any non-Velo positions (demo-mode legacy) intact, replace the Velo subset.
        const nonVelo = prev.filter((p) => !p.id.startsWith('velo_'));
        return [...nonVelo, ...onChainPositions];
      });
    }, [user, isWalletConnected, veloPerpsTrading.openPositions, veloPerpsTrading.isInitialLoading]);

    // ── Detect keeper-executed TP/SL closes ─────────────────────────────────
    // When the on-chain cron fires closeIfTriggered, the position disappears from
    // openPositions. We detect this and add a history entry + toast + notification.
    useEffect(() => {
      if (!user || !isWalletConnected) return;
      if (veloPerpsTrading.isInitialLoading) return;

      const currentIds = new Set(veloPerpsTrading.openPositions.map(p => p.tradeId.toString()));
      const prev = prevVeloPositionsRef.current;

      // Positions that were there before but are now gone → closed by keeper (TP/SL)
      const closedEntries = [...prev.entries()].filter(([id]) => !currentIds.has(id));

      if (closedEntries.length > 0) {
        let openTxMap: Record<string, string> = {};
        try { openTxMap = JSON.parse(localStorage.getItem('velo_open_tx') || '{}'); } catch {}

        closedEntries.forEach(([id, pos]) => {
          // Skip if another close path (manual close / TP-SL handler) already
          // recorded this tradeId — prevents the duplicate history row.
          if (closedVeloTradeIdsRef.current.has(id)) return;

          // Only fire for TP/SL closes — manual closes are handled elsewhere.
          // We can't be 100% sure which it was without the tx, so if TP/SL were
          // set, assume the keeper triggered it.
          if (!pos.takeProfit && !pos.stopLoss) return;

          const exitPrice = marketPrices[pos.pair] || pos.entryPrice;
          const isTpHit = pos.takeProfit && (
            (pos.side === 'LONG' && exitPrice >= pos.takeProfit) ||
            (pos.side === 'SHORT' && exitPrice <= pos.takeProfit)
          );
          const isSlHit = pos.stopLoss && (
            (pos.side === 'LONG' && exitPrice <= pos.stopLoss) ||
            (pos.side === 'SHORT' && exitPrice >= pos.stopLoss)
          );

          // Claim this tradeId now so a manual-close handler firing in the same
          // window doesn't also write a row.
          if (!markVeloTradeClosed(id)) return;

          const priceDiff = exitPrice - pos.entryPrice;
          const pnl = (pos.side === 'LONG' ? priceDiff : -priceDiff) * (pos.size / pos.entryPrice);
          const triggerType = isTpHit ? 'Take Profit' : isSlHit ? 'Stop Loss' : 'TP/SL';

          // We don't have the keeper's close tx on the client, but we do have the
          // position's OPEN tx — link to it so the row is verifiably on-chain.
          const openTx = pos.openTxHash || openTxMap[id];
          const explorerUrl = openTx
            ? (openTx.startsWith('http') ? openTx : `https://sepolia.basescan.org/tx/${openTx}`)
            : undefined;
          const liq = pos.side === 'LONG'
            ? pos.entryPrice * (1 - 0.9 / pos.leverage)
            : pos.entryPrice * (1 + 0.9 / pos.leverage);

          const historyItem: TradeHistoryItem = {
            id: `close_tp_velo_${id}_${Date.now()}`,
            pair: pos.pair,
            side: pos.side as any,
            entryPrice: pos.entryPrice,
            exitPrice,
            size: pos.size,
            pnl,
            timestamp: Date.now(),
            openedAt: pos.openedAt,
            action: 'CLOSE',
            leverage: pos.leverage,
            marginMode: pos.marginMode,
            liquidationPrice: liq,
            onChain: !!explorerUrl,
            orderlyOrderUrl: explorerUrl,
          } as any;

          setUser((prevUser: any) => {
            if (!prevUser) return null;
            const margin = pos.size / pos.leverage;
            return {
              ...prevUser,
              balance: prevUser.balance + pnl + margin,
              realizedPnL: prevUser.realizedPnL + pnl,
              tradeHistory: [historyItem, ...prevUser.tradeHistory],
            };
          });

          if (isSupabaseConfigured()) {
            insertTradeHistory(user.id, historyItem).catch(e => console.warn('[velo] TP/SL keeper history failed:', e));
          }

          const pnlStr = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;
          const msg = `${triggerType} hit: ${pos.side} ${pos.pair} closed @ $${exitPrice.toFixed(2)} (${pnlStr})`;
          setToast({ message: msg, type: pnl >= 0 ? 'SUCCESS' : 'ERROR' });

          if (isSupabaseConfigured()) {
            createNotification(user.id, isTpHit ? 'TAKE_PROFIT' : 'STOP_LOSS', msg, historyItem.id)
              .catch(e => console.warn('[velo] TP/SL notification failed:', e));
          }
        });
      }

      // Update the ref
      const nextMap = new Map<string, { pair: string; side: string; entryPrice: number; size: number; leverage: number; takeProfit?: number; stopLoss?: number; openedAt?: number; marginMode?: string; openTxHash?: string }>();
      let openTxMapForRef: Record<string, string> = {};
      try { openTxMapForRef = JSON.parse(localStorage.getItem('velo_open_tx') || '{}'); } catch {}
      veloPerpsTrading.openPositions.forEach(p => {
        const tid = p.tradeId.toString();
        nextMap.set(tid, {
          pair: p.pair.replace('-', '/'),
          side: p.isLong ? 'LONG' : 'SHORT',
          entryPrice: p.entryPrice,
          size: p.collateralUSDC * p.leverage,
          leverage: p.leverage,
          takeProfit: p.takeProfit,
          stopLoss: p.stopLoss,
          openedAt: p.openedAt ? p.openedAt * 1000 : undefined,
          marginMode: (p as any).marginMode,
          openTxHash: (p as any).openTxHash || openTxMapForRef[tid],
        });
      });
      prevVeloPositionsRef.current = nextMap;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [veloPerpsTrading.openPositions, veloPerpsTrading.isInitialLoading]);
    // Mirror on-chain conditional orders (LIMIT/STOP) into the UI's openOrders
    // array so they render in the Open Orders panel. Keyed by `velo_ord_<id>`
    // so non-on-chain (off-chain demo) orders aren't touched.
    useEffect(() => {
      if (!user || !isWalletConnected) return;
      if (veloPerpsTrading.isInitialLoading) return;
      const mapped: OpenOrder[] = veloPerpsTrading.conditionalOrders.map((o) => {
        const uiPair = o.pair.replace('-', '/');
        const orderType: OrderType = o.triggerKind === 'LIMIT' ? 'LIMIT' : 'STOP';
        return {
          id: `velo_ord_${o.orderId.toString()}`,
          pair: uiPair,
          side: o.isLong ? 'LONG' : 'SHORT',
          type: orderType,
          price: o.triggerPrice,
          size: o.collateralUSDC * o.leverage,
          leverage: o.leverage,
          timestamp: o.createdAt * 1000,
        } as OpenOrder;
      });
      setOpenOrders((prev) => {
        // Replace the on-chain subset, keep any non-on-chain orders intact.
        const nonVelo = prev.filter((o) => !o.id.startsWith('velo_ord_'));
        return [...nonVelo, ...mapped];
      });
    }, [user, isWalletConnected, veloPerpsTrading.conditionalOrders, veloPerpsTrading.isInitialLoading]);

    // ── Detect filled conditional orders (LIMIT/STOP) ───────────────────────
    // When a conditional order disappears from the on-chain list, the keeper
    // executed it. We immediately trigger a positions refresh, then on the
    // NEXT openPositions update we read the real on-chain entryPrice from the
    // newly-appeared position and record history/toast with the correct price.
    //
    // pendingFilledOrdersRef holds orders that vanished from conditionalOrders
    // but whose positions haven't been confirmed in the next positions poll yet.
    const pendingFilledOrdersRef = useRef<Map<string, { pair: string; side: string; type: string; price: number; size: number; leverage: number }>>(new Map());

    // Step 1 — detect vanished orders, park them as "pending", trigger refresh
    useEffect(() => {
      if (!user || !isWalletConnected) return;
      if (veloPerpsTrading.isInitialLoading) return;

      const currentIds = new Set(veloPerpsTrading.conditionalOrders.map(o => o.orderId.toString()));
      const prev = prevConditionalOrdersRef.current;

      const filledEntries = [...prev.entries()].filter(([id]) => !currentIds.has(id));

      if (filledEntries.length > 0) {
        // Park them — Step 2 will resolve them once positions refresh
        filledEntries.forEach(([id, order]) => {
          pendingFilledOrdersRef.current.set(id, order);
        });
        // Force an immediate positions refresh so we get the real entryPrice ASAP
        veloPerpsTrading.refresh().catch(() => {});
      }

      // Update the ref to current orders
      const nextMap = new Map<string, { pair: string; side: string; type: string; price: number; size: number; leverage: number }>();
      veloPerpsTrading.conditionalOrders.forEach(o => {
        nextMap.set(o.orderId.toString(), {
          pair: o.pair.replace('-', '/'),
          side: o.isLong ? 'LONG' : 'SHORT',
          type: o.triggerKind,
          price: o.triggerPrice,
          size: o.collateralUSDC * o.leverage,
          leverage: o.leverage,
        });
      });
      prevConditionalOrdersRef.current = nextMap;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [veloPerpsTrading.conditionalOrders, veloPerpsTrading.isInitialLoading]);

    // Step 2 — when positions update, resolve any pending filled orders using
    // the real on-chain entryPrice from the matched position
    useEffect(() => {
      if (!user || !isWalletConnected) return;
      if (pendingFilledOrdersRef.current.size === 0) return;

      let openTxMap: Record<string, string> = {};
      try { openTxMap = JSON.parse(localStorage.getItem('velo_open_tx') || '{}'); } catch {}

      // Build lookup of current positions by pair+side, picking most recently opened
      const positionsByKey = new Map<string, typeof veloPerpsTrading.openPositions[0]>();
      veloPerpsTrading.openPositions.forEach(p => {
        const key = `${p.pair.replace('-', '/')}:${p.isLong ? 'LONG' : 'SHORT'}`;
        const existing = positionsByKey.get(key);
        if (!existing || p.openedAt > existing.openedAt) {
          positionsByKey.set(key, p);
        }
      });

      const resolved: string[] = [];

      pendingFilledOrdersRef.current.forEach((order, id) => {
        const matchKey = `${order.pair}:${order.side}`;
        const matchedPos = positionsByKey.get(matchKey);

        // Only resolve once we have a real position with a valid entryPrice
        if (!matchedPos || matchedPos.entryPrice <= 0) return;

        resolved.push(id);

        const fillPrice = matchedPos.entryPrice;
        const tradeIdKey = matchedPos.tradeId.toString();
        const rawTxHash = matchedPos.openTxHash || openTxMap[tradeIdKey];
        const txHash = rawTxHash && !rawTxHash.startsWith('http') ? rawTxHash : undefined;
        const explorerUrl = rawTxHash
          ? (rawTxHash.startsWith('http') ? rawTxHash : `https://sepolia.basescan.org/tx/${rawTxHash}`)
          : undefined;

        const historyItem: TradeHistoryItem = {
          id: `filled_limit_${id}_${Date.now()}`,
          pair: order.pair,
          side: order.side as any,
          entryPrice: fillPrice,
          exitPrice: fillPrice,
          size: order.size,
          pnl: 0,
          timestamp: Date.now(),
          action: 'OPEN',
          leverage: order.leverage,
          onChain: true,
          txHash,
          orderlyOrderUrl: explorerUrl,
          openedAt: matchedPos.openedAt * 1000,
        } as any;

        setUser((prevUser: any) => {
          if (!prevUser) return null;
          return { ...prevUser, tradeHistory: [historyItem, ...prevUser.tradeHistory] };
        });

        if (isSupabaseConfigured()) {
          insertTradeHistory(user.id, historyItem).catch(e => console.warn('[velo] filled limit order history failed:', e));
        }

        const msg = `${order.type} order filled: ${order.side} ${order.pair} @ $${fillPrice.toFixed(2)}`;
        setToast({ message: msg, type: 'SUCCESS' });

        if (isSupabaseConfigured()) {
          createNotification(user.id, 'POSITION_CLOSED', msg, historyItem.id)
            .catch(e => console.warn('[velo] filled order notification failed:', e));
        }
      });

      // Remove resolved entries
      resolved.forEach(id => pendingFilledOrdersRef.current.delete(id));

    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [veloPerpsTrading.openPositions]);


    // Reset the dismiss flag on logout so a different account triggers onboarding again.
    useEffect(() => { if (!user) setOnboardingDismissed(false); }, [user]);

    const EXPECTED_CHAIN_ID = 84532; // Base Sepolia
    const [showWrongNetworkBanner, setShowWrongNetworkBanner] = useState(false);

    // Session wallet snapshot — set explicitly when user logs in via recordSessionWallet()
    const sessionWalletRef = useRef<{ address: string | undefined; chainId: number | undefined } | null>(null);
    const [walletSessionAlert, setWalletSessionAlert] = useState<{ type: 'account' | 'network' } | null>(null);

    // Call this right after a successful login to snapshot the wallet state
    const recordSessionWallet = () => {
        sessionWalletRef.current = { address: walletAddress, chainId };
    };

    // Show banner when logged-in user is on wrong network
    useEffect(() => {
        setShowWrongNetworkBanner(!!user && chainId !== EXPECTED_CHAIN_ID);
    }, [chainId, user]);

    // Listen directly to MetaMask provider events — fires immediately on switch
    useEffect(() => {
        if (!user || !sessionWalletRef.current) return;
        const eth = (window as any).ethereum;
        if (!eth) return;

        const handleAccountsChanged = (accounts: string[]) => {
            const newAddr = (accounts[0] || '').toLowerCase();
            const sessionAddr = (sessionWalletRef.current?.address || '').toLowerCase();
            if (sessionAddr && newAddr && newAddr !== sessionAddr) {
                // Auto-logout immediately when a different MetaMask account is
                // selected — the new account is not authenticated with Velo.
                handleLogout();
            }
        };

        const handleChainChanged = (newChainIdHex: string) => {
            const newChain = parseInt(newChainIdHex, 16);
            const sessionChain = sessionWalletRef.current?.chainId;
            if (sessionChain !== undefined && newChain !== sessionChain) {
                setWalletSessionAlert({ type: 'network' });
            }
        };

        eth.on('accountsChanged', handleAccountsChanged);
        eth.on('chainChanged', handleChainChanged);
        return () => {
            eth.removeListener('accountsChanged', handleAccountsChanged);
            eth.removeListener('chainChanged', handleChainChanged);
        };
    }, [user]);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [notifOpen, setNotifOpen] = useState(false);
    const [usersListModal, setUsersListModal] = useState<{ isOpen: boolean, title: string, userIds: string[] }>({ isOpen: false, title: '', userIds: [] });
    const [viewingProfile, setViewingProfile] = useState<any | null>(null);
    const [editingPosition, setEditingPosition] = useState<Position | null>(null);
    /** Routes the "edit position" intent to the right modal:
     *  - V2 on-chain position → manage modal (real on-chain TP/SL etc.)
     *  - Anything else        → legacy demo-only Edit modal (Supabase-stored)
     */
    const handleEditPosition = (p: Position | null, initialTab?: 'ADD' | 'REDUCE' | 'PARTIAL' | 'TRIGGERS') => {
      if (!p) { setEditingPosition(null); setManagingPosition(null); return; }
      if (p.onChain && p.onChainTradeId) { setManagingPositionTab(initialTab || 'ADD'); setManagingPosition(p); }
      else setEditingPosition(p);
    };
    const [activeSocialTicker, setActiveSocialTicker] = useState<string | null>(null);
    const [watchlist, setWatchlist] = useState<string[]>(() => {
        try { return JSON.parse(localStorage.getItem('velo_fav_markets') || '[]'); } catch { return []; }
    });

    // Unified animation overlay (used by every flow — login, register, logout,
    // deposit, withdraw, order-open, order-close). `animLabel`/`animSub` let
    // individual flows enrich the display with contextual copy (e.g. username
    // on login, pair+side on order open).
    const [anim, setAnim] = useState<{ kind: VeloAnimationKind; label?: string; sublabel?: string } | null>(null);
    const triggerAnim = (kind: VeloAnimationKind, label?: string, sublabel?: string) => {
        setAnim({ kind, label, sublabel });
    };

    // ────────────────────────────────────────────────────────────────────────
    // BACKGROUND DEPOSIT WATCHER
    //
    // Once a deposit tx is submitted, the user can close the modal — but the
    // funds still take 1–3 min to settle through LayerZero to Orderly L2.
    // We need to keep polling the Orderly balance so the credit gets detected
    // and reflected in the dashboard the second it lands. Without this, the
    // user sees $0.00 forever even though their tx succeeded.
    //
    // NOTE: this block lives here (after setToast is declared) so the closures
    // below don't hit a TDZ error trying to read setToast. Don't move it back
    // up next to setBurnerAddress — that breaks at module init time.
    // ────────────────────────────────────────────────────────────────────────
    const pendingDeposits        = usePendingDeposits(burnerAddress);
    const pendingDepositCount    = usePendingDepositCount(burnerAddress);
    const hasInFlightDeposits    = pendingDepositCount > 0;
    const [claimingFaucet, setClaimingFaucet] = useState(false);

    // Handler: claim 1000 USDC directly to the Orderly trading account.
    // This is the testnet shortcut — bypasses cross-chain settlement entirely.
    // Pre-conditions: user must have an activated Velo wallet (burnerAddress + keypair).
    const handleClaimTestnetUsdc = useCallback(async () => {
      if (!burnerAddress || !orderly.keypair) {
        // Phase 2: route legacy "claim faucet" call paths through the new on-chain
        // Velo Welcome modal so users hit the working faucet, not the broken Orderly one.
        setVeloWelcomeOpen(true);
        return;
      }
      if (claimingFaucet) return;
      setClaimingFaucet(true);
      try {
        const res = await fetch('/api/faucet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_address: burnerAddress,
            broker_id:    'woofi_dex',
            chain_id:     '84532',
            source:       'orderly', // ← force direct trading-account credit
          }),
        }).then(r => r.json()).catch(e => ({ success: false, message: e?.message }));

        if (!res?.success) {
          setToast({ message: `Faucet failed: ${res?.message || 'try again later'}`, type: 'ERROR' });
          setClaimingFaucet(false);
          return;
        }

        setToast({ message: 'Faucet accepted — checking trading account…', type: 'INFO' });

        const startBal = orderly.orderlyBalance;
        for (let i = 0; i < 20; i++) {
          await new Promise(ok => setTimeout(ok, 3000));
          const newBal = await refreshOrderlyBalance().catch(() => null);
          if (newBal != null && newBal > startBal) {
            setToast({ message: `+$${(newBal - startBal).toFixed(2)} USDC credited — ready to trade`, type: 'SUCCESS' });
            setClaimingFaucet(false);
            return;
          }
        }
        setToast({ message: 'Faucet accepted but credit not detected yet. Check back in a minute.', type: 'INFO' });
        setClaimingFaucet(false);
      } catch (e: any) {
        setToast({ message: `Faucet error: ${e?.message || 'unknown'}`, type: 'ERROR' });
        setClaimingFaucet(false);
      }
    }, [burnerAddress, orderly.keypair, orderly.orderlyBalance, claimingFaucet, refreshOrderlyBalance]);

    // Mark stale deposits as FAILED on app boot
    useEffect(() => { reapStaleDeposits(); }, []);

    // Keep localStorage session cache in sync with user state.
    // Written on every successful login/restore, cleared on logout.
    useEffect(() => {
      if (user) {
        writeSessionCache(user);
      } else {
        clearSessionCache();
        clearNotifCache();
      }
    }, [user]);

    // Keep notification cache in sync — persists across page refreshes.
    useEffect(() => {
      if (notifications.length > 0) {
        writeNotifCache(notifications);
      }
    }, [notifications]);

    // Poll Orderly balance frequently while any deposits are in flight
    useEffect(() => {
      if (!hasInFlightDeposits || !orderly.keypair) return;
      let cancelled = false;
      const tick = async () => {
        const newBal = await refreshOrderlyBalance().catch(() => null);
        if (cancelled || newBal == null) return;
        for (const d of pendingDeposits) {
          if (d.status !== 'CONFIRMED_AWAITING_CREDIT' && d.status !== 'PENDING_CONFIRM') continue;
          if (newBal >= d.balanceBefore + d.amount * 0.99) {
            updatePendingDeposit(d.id, { status: 'CREDITED' });
            setToast({ message: `Deposit credited — $${d.amount.toFixed(2)} USDC ready to trade`, type: 'SUCCESS' });
          }
        }
        reapStaleDeposits();
      };
      tick();
      const id = setInterval(tick, 8000);
      return () => { cancelled = true; clearInterval(id); };
    }, [hasInFlightDeposits, orderly.keypair, pendingDeposits, refreshOrderlyBalance]);

    
    // Leverage Change State
    const [leverageModalOpen, setLeverageModalOpen] = useState(false);
    const [pendingTrade, setPendingTrade] = useState<any | null>(null);

    // Onboarding guard — re-opens login modal if user is not authenticated on load
    useOnboardingGuard(user, setLoginOpen);

    // Global lock for trade actions to prevent double-execution
    const tradeLock = useRef(0);

    // Counts in-flight trade operations from THIS tab.
    // While > 0, the profileCh realtime handler will not overwrite local balance —
    // the trade already applied the correct delta optimistically.
    const pendingTradeOps = useRef(0);

    // Guard: prevent double-restore from INITIAL_SESSION + getSession() fallback firing simultaneously
    // Always start false so INITIAL_SESSION refreshes data from Supabase on every load.
    // The localStorage cache handles instant display; Supabase provides fresh data.
    const sessionRestoredRef = useRef(false);

    // Guard: user explicitly logged out — block all automatic session restores until next manual login
    const intentionalLogoutRef = useRef(false);
    // Callback to hydrate app state on silent login (wallet reconnect → existing account)
    const silentLoginCallbackRef = useRef<((authUser: any, profile: any) => void) | null>(null);

    // ── Silent re-auth provider for the session manager ─────────────────────
    // When the Supabase session dies (refresh token revoked / no session) the
    // session manager calls this to silently re-establish a session using the
    // wallet-derived deterministic credentials — the SAME identity, no prompt.
    // This is what makes blanked data reappear on its own instead of forcing a
    // manual logout/login. Respects the logout sentinel so it never re-signs-in
    // a user who just logged out.
    useEffect(() => {
        registerReauthProvider(async () => {
            if (typeof window !== 'undefined' && (window as any).__veloLogoutLock) return false;
            if (intentionalLogoutRef.current) return false;
            if (!walletAddress) return false;
            try {
                const pseudoEmail = `${walletAddress.toLowerCase()}@wallet.velo`;
                const password = `velo_w3_${walletAddress.toLowerCase().slice(2, 20)}_xK9`;
                const { data, error } = await supabase.auth.signInWithPassword({ email: pseudoEmail, password });
                return !!(data?.session && !error);
            } catch {
                return false;
            }
        });
        return () => registerReauthProvider(null);
    }, [walletAddress]);

    // Keep silentLoginCallbackRef current — restores session from silent wallet reconnect
    useEffect(() => {
      silentLoginCallbackRef.current = async (authUser: any, profile: any) => {
        if (!authUser) return;
        try {
          const restoredUser = profile ? dbProfileToUserProfile(profile) : {
            id: authUser.id,
            username: profile?.username || authUser.user_metadata?.username || authUser.email?.split('@')[0] || 'Trader',
            handle: profile?.handle || `@${(profile?.username || authUser.email?.split('@')[0] || 'trader').replace(/\s+/g, '')}`,
            bio: '', avatar: profile?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${authUser.id}`,
            banner: '', balance: 0, pnlTotal: 0, realizedPnL: 0,
            following: [], copying: [], followers: [], copierCount: 0,
            earnedFees: 0, veloRewards: 0,
            tradeHistory: [], transactionHistory: [], pnlHistory: [],
            joinedDate: new Date().toISOString(), likes: [], reposts: [],
          } as UserProfile;
          const [positions, orders, history, txns, notifs, loadedPosts] = await Promise.all([
            fetchPositions(authUser.id),
            fetchOpenOrders(authUser.id),
            fetchTradeHistory(authUser.id),
            fetchTransactions(authUser.id),
            fetchNotifications(authUser.id),
            fetchPosts(50),
          ]);
          const { data: follows } = await supabase.from('follows').select('following_id').eq('follower_id', authUser.id);
          restoredUser.following = (follows || []).map((f: any) => f.following_id);
          const { data: myFollowers } = await supabase.from('follows').select('follower_id').eq('following_id', authUser.id);
          restoredUser.followers = (myFollowers || []).map((f: any) => f.follower_id);
          restoredUser.tradeHistory = history;
          restoredUser.transactionHistory = txns;
          const closedTrades = history.filter((t: any) => t.action === 'CLOSE').sort((a: any, b: any) => a.timestamp - b.timestamp);
          const totalRealized = closedTrades.reduce((acc: number, t: any) => acc + t.pnl, 0);
          const startingBalance = (restoredUser.balance || 0) - totalRealized;
          let runningPnl = 0;
          restoredUser.pnlHistory = closedTrades.map((t: any) => {
            runningPnl += t.pnl;
            const d = new Date(t.timestamp);
            return { time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), value: startingBalance + runningPnl, timestamp: t.timestamp };
          });
          userLoadedFromDB.current = true;
          // walletAddress from wagmi may not be hydrated yet if this callback
          // fires during early reconnect. Fall back to the profile's stored
          // wallet_address so the UI always shows the correct address.
          if (walletAddress) restoredUser.walletAddress = walletAddress;
          else if (profile?.wallet_address) restoredUser.walletAddress = profile.wallet_address;
          setUser(restoredUser);
          recordSessionWallet();
          setPositions(positions);
          setOpenOrders(orders);
          setNotifications(notifs); // always replace — guard caused stale/empty notifications on refresh
          if (loadedPosts.length > 0) setPosts(loadedPosts);
          try { const prefs = await fetchPreferences(authUser.id); applyPreferences(prefs); } catch (_) {}
          playSound('SUCCESS');
        } catch (e) { console.warn('silentLogin hydrate error:', e); }
      };
    }); // no deps — always keep current

    // Ref to wagmi disconnect fn — populated by AuthModal, called on logout
    const walletDisconnectRef = useRef<(() => void) | null>(null);

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

    // Tracks DB UUIDs that were saved by THIS tab — so the realtime onInsert
    // subscriber can skip them (they're already in local state).
    const ownSavedPositionIds = useRef<Set<string>>(new Set());

    // Tracks DB UUIDs deleted by THIS tab — so the realtime onDelete
    // subscriber can skip them (balance already credited locally).
    const ownDeletedPositionIds = useRef<Set<string>>(new Set());

    // Tracks TP/SL that were requested at open time via setTriggers but haven't
    // yet been reflected in the contract's openPositions[] response. The sync
    // effect overlays these onto the local Position rows so the TP/SL column
    // appears immediately, not 5s later after the next poll. Cleared once the
    // contract response includes the value (or differs from what we expect).
    const pendingTriggers = useRef<Map<string, { takeProfit?: number; stopLoss?: number }>>(new Map());

    // Tracks the previous set of on-chain conditional orders so we can detect
    // when one disappears (i.e. was filled by the keeper) and add it to history.
    const prevConditionalOrdersRef = useRef<Map<string, { pair: string; side: string; type: string; price: number; size: number; leverage: number }>>(new Map());

    // Always-fresh snapshot of open positions so the order-fill detection effect
    // can read current positions without adding openPositions to its dep array
    // (which would cause the ref to be reset on every new position, breaking detection).
    const openPositionsRef = useRef(veloPerpsTrading.openPositions);
    useEffect(() => { openPositionsRef.current = veloPerpsTrading.openPositions; }, [veloPerpsTrading.openPositions]);

    // Tracks previous on-chain positions to detect keeper-executed TP/SL closes.
    const prevVeloPositionsRef = useRef<Map<string, { pair: string; side: string; entryPrice: number; size: number; leverage: number; takeProfit?: number; stopLoss?: number; openedAt?: number; marginMode?: string; openTxHash?: string }>>(new Map());

    // De-dupe guard: every on-chain close path (manual close, TP/SL auto-close,
    // and the keeper-detection fallback below) records the closed tradeId here.
    // A given on-chain position can therefore produce exactly ONE close-history
    // row no matter how many paths/poll-cycles observe the close. This is what
    // fixes "I set one stop loss and it filled twice" — the manual/TP-SL handler
    // wrote the full row and the fallback effect wrote a degraded duplicate.
    const closedVeloTradeIdsRef = useRef<Set<string>>(
      (() => { try { return new Set<string>(JSON.parse(localStorage.getItem('velo_closed_trades') || '[]')); } catch { return new Set<string>(); } })()
    );
    const markVeloTradeClosed = useCallback((tradeIdStr: string) => {
      if (!tradeIdStr) return false;
      if (closedVeloTradeIdsRef.current.has(tradeIdStr)) return false;
      closedVeloTradeIdsRef.current.add(tradeIdStr);
      try {
        // Keep only the most recent ~300 ids so localStorage doesn't grow forever.
        const arr = [...closedVeloTradeIdsRef.current].slice(-300);
        closedVeloTradeIdsRef.current = new Set(arr);
        localStorage.setItem('velo_closed_trades', JSON.stringify(arr));
      } catch {}
      return true;
    }, []);

    // Always-fresh market prices ref so realtime onDelete can compute PnL correctly
    // even though the useEffect capturing the subscription only runs once per user.id.
    const marketPricesRef = useRef<Record<string, number>>({});
    useEffect(() => { marketPricesRef.current = marketPrices; }, [marketPrices]);


    // ── Derived financial values ─────────────────────────────────────
    // Computed as a memo so they update reactively whenever positions,
    // marketPrices, or user.balance change — not just on user object change.
    // This prevents the navbar from showing stale free-balance instead of
    // total equity when positions are open across tabs.
    const totalLockedMargin = useMemo(() =>
        positions.reduce((acc, p) => acc + (p.size / p.leverage), 0),
    [positions]);

    const totalUnrealizedPnl = useMemo(() =>
        positions.reduce((acc, p) => {
            const mark = marketPrices[p.pair] || p.entryPrice;
            return acc + (mark - p.entryPrice) * (p.side === 'LONG' ? 1 : -1) * (p.size / p.entryPrice);
        }, 0),
    [positions, marketPrices]);

    // ── Equity & buying power ─────────────────────────────────────────────────
    //
    // Definitions (industry standard):
    //   • Total Equity   = total value of the trading account
    //                    = Free Balance + Locked Margin + Unrealized PnL
    //                    = your mUSDC + your trading PnL.
    //                      It does NOT change when you open a position — it only
    //                      moves on price action (PnL) or new deposits/withdrawals.
    //   • Buying Power   = how much you have available to open new positions
    //                    = Free Balance only.
    //                      Drops by exactly the margin amount when you open.
    //
    // Phase 3 — VeloPerps source semantics:
    //   veloPerpsTrading.usdcBalance is the FREE wallet balance (the contract
    //   pulls collateral OUT of the wallet on open, so wallet balance never
    //   includes locked margin). Same semantics as demo mode's user.balance,
    //   so we can use the single formula below for both wallet and email users.
    const totalEquity = useMemo(() => {
        if (!user) return 0;
        const isLive = !!walletAddress;
        const freeBalance = isLive ? veloPerpsTrading.usdcBalance : user.balance;
        return freeBalance + totalLockedMargin + totalUnrealizedPnl;
    }, [user?.balance, walletAddress, veloPerpsTrading.usdcBalance, totalLockedMargin, totalUnrealizedPnl]);

    // Cross-margin unrealized — only cross positions lend their gains as
    // additional buying power; isolated positions don't.
    const crossMarginPnl = useMemo(() =>
        positions
            .filter(p => p.marginMode === 'CROSS' && !p.isCopyTrade)
            .reduce((acc, p) => {
                const mark = marketPrices[p.pair] || p.entryPrice;
                return acc + (mark - p.entryPrice) * (p.side === 'LONG' ? 1 : -1) * (p.size / p.entryPrice);
            }, 0),
    [positions, marketPrices]);

    const buyingPower = useMemo(() => {
        if (!user) return 0;
        const isLive = !!walletAddress;
        const freeBalance = isLive ? veloPerpsTrading.usdcBalance : user.balance;
        return freeBalance + crossMarginPnl;
    }, [user?.balance, walletAddress, veloPerpsTrading.usdcBalance, crossMarginPnl]);

    // ── Environment mode split ────────────────────────────────────────────────
    // isLiveMode is determined ENTIRELY by registration/auth method:
    //   - Crypto wallet connected → isLiveMode=true → Orderly UI, Orderly pairs only,
    //     real on-chain trading, real deposit/withdraw, social/leaderboard enabled.
    //   - Email/Supabase only (no wallet) → isLiveMode=false → demo UI, all pairs,
    //     simulated $10k balance, full feature exploration, but no social/leaderboard.
    //
    // The Velo wallet (burner) and Orderly keypair may not yet be set up — that's
    // what onboarding is for — but the UI shell still reflects "live" the moment a
    // crypto wallet is connected, so the user sees the right environment immediately.
    const isLiveMode = !!walletAddress;

    // When switching to live mode for the first time, snap the active pair to
    // an Orderly-supported one if the current pair isn't available on-chain.
    useEffect(() => {
        if (!isLiveMode) return;
        const isCurrentPairLive = ORDERLY_PAIRS.some(p => p.id === activePair.id);
        if (!isCurrentPairLive) {
            // Default to ETH/USD as the first Orderly-supported pair that isn't BTC
            const defaultLivePair = ORDERLY_PAIRS.find(p => p.id === 'ETH/USD') || ORDERLY_PAIRS[0];
            setActivePair(defaultLivePair);
        }
    }, [isLiveMode]); // eslint-disable-line react-hooks/exhaustive-deps


    // ── Preferences helpers ──────────────────────────────────────────
    const applyPreferences = (prefs: UserPreferences | null) => {
        if (!prefs) return; // No saved prefs — keep current theme/localStorage values
        // Only override theme if the DB explicitly has a saved value
        if (prefs.theme) {
            setTheme(prefs.theme);
            localStorage.setItem('velo_theme', prefs.theme);
        }
        const pair = PAIRS.find((p: any) => p.id === prefs.activePair) || PAIRS[0];
        setActivePair(pair);
        setChartPrefs({
            chartTf:    prefs.chartTf    || DEFAULT_PREFERENCES.chartTf,
            chartStyle: prefs.chartStyle || DEFAULT_PREFERENCES.chartStyle,
            indicators: prefs.indicators || DEFAULT_PREFERENCES.indicators,
            overlays:   prefs.overlays   || DEFAULT_PREFERENCES.overlays,
        });
        if (prefs.watchlist && prefs.watchlist.length > 0) {
            setWatchlist(prefs.watchlist);
            localStorage.setItem('velo_fav_markets', JSON.stringify(prefs.watchlist));
        }
    };

    const updatePrefs = (patch: Partial<UserPreferences>, userId?: string) => {
        const uid = userId || user?.id;
        if (!uid) return;
        if (prefsSaveTimer.current) clearTimeout(prefsSaveTimer.current);
        prefsSaveTimer.current = setTimeout(() => {
            savePreferences(uid, patch);
        }, 1500);
    };

    const handleToggleWatchlist = (pairId: string) => {
        setWatchlist(prev => {
            const next = prev.includes(pairId) ? prev.filter(p => p !== pairId) : [...prev, pairId];
            localStorage.setItem('velo_fav_markets', JSON.stringify(next));
            if (user) updatePrefs({ watchlist: next });
            return next;
        });
    };

    // Handle URL pathname routing for profiles (re-trigger when traders load)
    useEffect(() => {
        const path = window.location.pathname.replace(/^\//, '');
        if (!path || !path.startsWith('profile/')) return;
        const handle = path.split('/')[1];
        if (!handle || traders.length === 0) return;
        
        // If already viewing correct profile, skip
        if (viewingProfile && (viewingProfile.handle?.replace('@', '').toLowerCase() === handle.toLowerCase() || viewingProfile.username?.toLowerCase() === handle.toLowerCase())) return;
        
        const trader = traders.find((t: any) => 
            t.handle?.replace('@', '').toLowerCase() === handle.toLowerCase() ||
            t.username?.toLowerCase() === handle.toLowerCase()
        );
        if (trader) {
            setViewingProfile(trader);
            setActiveTab(TabView.PUBLIC_PROFILE);
        }
    }, [traders]);

    // Supabase auth state listener
    useEffect(() => {
        if (!isSupabaseConfigured()) {
            setAuthChecked(true);
            return;
        }

        // Safety net: if auth check takes more than 4s (network stall, Supabase cold start),
        // unblock the loading screen so the user doesn't get stuck forever.
        const authTimeout = setTimeout(() => {
            setAuthChecked(true);
        }, 2500);
        
        // Detect redirect back from password-reset email
        const params = new URLSearchParams(window.location.search);
        if (params.get('reset_password') === 'true') {
            setResetPasswordOpen(true);
            // Clean URL without reload
            window.history.replaceState({}, '', window.location.pathname);
        }

        // Track whether we've already done the first restore so we don't double-load
        const restoreSession = async (session: any, isGetSessionFallback = false) => {
            // Logout sentinel — see the IIFE at the top of this file. If the
            // user just navigated in from a logout, never restore a session,
            // even if Supabase somehow still has one in storage or memory.
            // The lock is cleared by the wagmiStatus='connecting' handler
            // when the user explicitly opens AppKit and picks a wallet.
            if (typeof window !== 'undefined' && window.__veloLogoutLock) {
                if (isGetSessionFallback) {
                    setUser(null);
                    setAuthChecked(true);
                }
                return;
            }
            if (!session?.user) {
                // Supabase confirmed there's no valid session.
                // If we pre-loaded a cached user, clear it — the session expired.
                if (isGetSessionFallback) {
                    clearSessionCache();
                    setUser(null);
                    setAuthChecked(true);
                }
                return;
            }
            // Block restore if user explicitly logged out this session
            if (intentionalLogoutRef.current) { setAuthChecked(true); return; }
            // Prevent double-restore: INITIAL_SESSION fires first and sets sessionRestoredRef = true,
            // then getSession() fallback also resolves. Two cases:
            //   a) INITIAL_SESSION still in-flight (sessionRestoredRef=true, user still null, finally
            //      not yet called) — returning here is safe; INITIAL_SESSION will call setAuthChecked
            //      in its own finally block when it finishes. Opening AppKit here would be wrong.
            //   b) INITIAL_SESSION already finished — sessionRestoredRef=true, user is set,
            //      setAuthChecked already fired. Returning silently is correct.
            // Either way: if sessionRestoredRef is true, we must NOT call setAuthChecked prematurely.
            if (sessionRestoredRef.current) return;
            sessionRestoredRef.current = true;
            try {
                let profileData = await getProfile(session.user.id);
                // Retry once on failure (Supabase cold start / transient network blip)
                if (!profileData?.profile) {
                    await new Promise(r => setTimeout(r, 600));
                    profileData = await getProfile(session.user.id);
                }
                const profile = profileData?.profile;
                if (!profile) { setAuthChecked(true); return; }
                const restoredUser = dbProfileToUserProfile(profile);
                const [positions, orders, history, txns, notifs, loadedPosts] = await Promise.all([
                    fetchPositions(session.user.id),
                    fetchOpenOrders(session.user.id),
                    fetchTradeHistory(session.user.id),
                    fetchTransactions(session.user.id),
                    fetchNotifications(session.user.id),
                    fetchPosts(50),
                ]);
                // DB stores free balance directly — no margin subtraction needed.
                // Locked margins are implicitly tracked via the positions table.
                restoredUser.tradeHistory = history;
                restoredUser.transactionHistory = txns;

                // Build pnlHistory from closed trades so the portfolio chart isn't flat.
                // Correct formula: startingBalance + runningPnl — where startingBalance
                // is what the account had BEFORE any trades (= currentBalance - totalRealizedPnl).
                // Using currentBalance directly would double-count all past PnL.
                const closedTrades = history.filter((t: any) => t.action === 'CLOSE').sort((a: any, b: any) => a.timestamp - b.timestamp);
                const totalRealizedForHistory = closedTrades.reduce((acc: number, t: any) => acc + t.pnl, 0);
                const startingBalanceForHistory = (restoredUser.balance || 0) - totalRealizedForHistory;
                let runningPnl = 0;
                restoredUser.pnlHistory = closedTrades.map((t: any) => {
                    runningPnl += t.pnl;
                    const d = new Date(t.timestamp);
                    return { time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), value: startingBalanceForHistory + runningPnl, timestamp: t.timestamp };
                });

                // Balance is stored as the authoritative free balance in the DB.
                // The adjust_balance RPC handles deposits/withdrawals atomically.
                // Trade credits/debits are applied directly to balance on open/close.
                // No repair needed — trust the DB value as source of truth.
                const { data: follows } = await supabase
                    .from('follows').select('following_id').eq('follower_id', session.user.id);
                restoredUser.following = (follows || []).map((f: any) => f.following_id);
                // Also load who follows the current user
                const { data: myFollowers } = await supabase
                    .from('follows').select('follower_id').eq('following_id', session.user.id);
                restoredUser.followers = (myFollowers || []).map((f: any) => f.follower_id);
                userLoadedFromDB.current = true;
                // On page load wagmi reconnects asynchronously — walletAddress
                // may be undefined here. Use the DB-stored wallet address as
                // fallback so the UI shows the correct address immediately.
                if (walletAddress) restoredUser.walletAddress = walletAddress;
                else if (profile?.wallet_address) restoredUser.walletAddress = profile.wallet_address;
                setUser(restoredUser);
                recordSessionWallet();
                setPositions(positions);
                setOpenOrders(orders);
                setNotifications(notifs); // always replace — guard caused stale/empty notifications on refresh
                if (loadedPosts.length > 0) setPosts(loadedPosts);
                try {
                    const prefs = await fetchPreferences(session.user.id);
                    applyPreferences(prefs);
                } catch (_) { /* use defaults */ }
                // Restore to the page the user was on — don't force /trade
                // navigateFromPath is called separately on mount and handles the URL
            } catch(e) { console.warn('Session restore error:', e); }
            finally { setAuthChecked(true); }
        };

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'PASSWORD_RECOVERY') {
                setResetPasswordOpen(true);
            } else if (event === 'SIGNED_OUT') {
                intentionalLogoutRef.current = true;
                sessionRestoredRef.current = false;
                userLoadedFromDB.current = false;
                autoRecoverAttemptedRef.current = false;
                burnerRecoveredRef.current = false;
                freshWalletConnectRef.current = false;
                // Always wipe the cached session snapshot. SIGNED_OUT fires
                // from both our explicit handleLogout AND any Supabase-side
                // session expiry / cross-tab signOut. Either way the snapshot
                // is no longer valid and must not be allowed to hydrate user
                // state on the next page load.
                clearSessionCache();
                setUser(null);
                setPositions([]);
                setOpenOrders([]);
                // NOTE: do NOT wipe notifications here. SIGNED_OUT also fires on
                // transient session expiry, after which the app silently re-auths —
                // wiping made notifications vanish until a manual refresh. Explicit
                // logout and account deletion clear them in their own handlers.
                setChartPrefs({
                    chartTf:    DEFAULT_PREFERENCES.chartTf,
                    chartStyle: DEFAULT_PREFERENCES.chartStyle,
                    indicators: DEFAULT_PREFERENCES.indicators,
                    overlays:   DEFAULT_PREFERENCES.overlays,
                });
                setActiveTab(TabView.TRADE);
                setAuthChecked(true);
                // Logout is fully complete — clear the intentional-logout guard so
                // the next manual wallet connect flows through normally.
                // Use a longer delay (1200ms) to ensure wagmi's disconnect has fully
                // propagated (isWalletConnected → false) before we re-arm the
                // socialLogin effect, preventing an immediate re-login on logout.
                setTimeout(() => {
                    intentionalLogoutRef.current = false;
                    socialLoginHandledRef.current = false;
                    setRetryAuthTick(t => t + 1); // force socialLoginEffect to re-evaluate
                }, 1200);
            } else if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
                // Fired on page load when a stored session exists — restore without double-loading
                await restoreSession(session);
            } else if (event === 'SIGNED_IN' && !sessionRestoredRef.current) {
                // Handles GitHub OAuth redirect and any login path where onAuth wasn't called.
                // sessionRestoredRef guards against double-hydration if onAuth already ran first.
                await restoreSession(session);
            }
        });
        
        // Fallback: if INITIAL_SESSION didn't fire (older Supabase SDK), restore via getSession.
        // This is also the authoritative source — only this path marks authChecked on null session.
        supabase.auth.getSession().then(async ({ data: { session } }) => {
            await restoreSession(session, true);
        });
        
        return () => { subscription.unsubscribe(); clearTimeout(authTimeout); };
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


    // Tabs that require authentication
    const AUTH_REQUIRED_TABS = new Set([TabView.DASHBOARD, TabView.PROFILE]);
    const AUTH_REQUIRED_PATHS = new Set(['dashboard', 'profile']);

    // URL routing — parse pathname into tab/view state
    const navigateFromPath = useCallback((path: string) => {
        // Strip leading slash
        const p = path.replace(/^\//, '');
        if (!p) return;
        const tabMap: Record<string, string> = {
            'dashboard': TabView.DASHBOARD,
            'trade': TabView.TRADE,
            'markets': TabView.MARKETS,
            'social': TabView.SOCIAL,
            'leaderboard': TabView.LEADERBOARD,
            'profile': TabView.PROFILE,
        };
        const basePath = p.split('/')[0];
        // If this tab requires auth and user is not logged in after auth check completes,
        // silently redirect to /trade. Do NOT auto-open AppKit — the user may have just
        // had their session expire or be on a slow connection; they can click Log In themselves.
        if (AUTH_REQUIRED_PATHS.has(basePath) && !user && authChecked) {
            setActiveTab(TabView.TRADE);
            return;
        }
        // If auth not yet checked, silently navigate to the requested tab —
        // restoreSession will fire shortly and the user will be hydrated.
        if (AUTH_REQUIRED_PATHS.has(basePath) && !authChecked) {
            setActiveTab(tabMap[basePath] as any);
            return;
        }

        // Profile routing: /profile/username -> view that user's profile
        if (p.startsWith('profile/')) {
            const handle = p.split('/')[1];
            if (handle) {
                if (user && (user.handle?.replace('@', '').toLowerCase() === handle.toLowerCase() || user.username?.toLowerCase() === handle.toLowerCase())) {
                    setActiveTab(TabView.PROFILE);
                    return;
                }
                const allTraders = traders.length > 0 ? traders : [];
                const trader = allTraders.find((t: any) =>
                    t.handle?.replace('@', '').toLowerCase() === handle.toLowerCase() ||
                    t.username?.toLowerCase() === handle.toLowerCase()
                );
                if (trader) {
                    setViewingProfile(trader);
                    setActiveTab(TabView.PUBLIC_PROFILE as any);
                } else if (isSupabaseConfigured()) {
                    // Try Supabase lookup for handle
                    (async () => {
                        try {
                            const { data: p } = await supabase.from('profiles').select('*')
                                .or(`handle.eq.@${handle},username.ilike.${handle}`)
                                .single();
                            if (p) {
                                setViewingProfile(dbProfileToUserProfile(p));
                                setActiveTab(TabView.PUBLIC_PROFILE as any);
                            }
                        } catch (_) {}
                    })();
                }
                return;
            }
        }

        // Social token routing: /markets/ETH -> open social token page on the social tab
        // Single post routing: /social/post/:id -> open that post
        if (p === 'social') {
            // Going back to the global feed — clear any active ticker or post
            setActiveSocialTicker(null);
            setSinglePostId(null);
            setActiveTab(TabView.SOCIAL);
            return;
        }
        if (p.startsWith('social/')) {
            const parts = p.split('/');
            if (parts[1] === 'post' && parts[2]) {
                // Single post view
                setSinglePostId(parts[2]);
                setActiveSocialTicker(null);
                setActiveTab(TabView.SOCIAL);
                return;
            }
            // Legacy /social/TICKER redirect → /markets/TICKER
            const ticker = parts[1]?.toUpperCase();
            if (ticker) {
                setSinglePostId(null);
                setActiveSocialTicker(ticker);
            }
            setActiveTab(TabView.SOCIAL);
            return;
        }
        if (p.startsWith('markets/')) {
            const parts = p.split('/');
            const ticker = parts[1]?.toUpperCase();
            if (ticker) {
                // If it's a known social pair, open social token page
                const knownPair = SOCIAL_FEATURED_PAIRS.find(sp => sp.symbol === ticker);
                if (knownPair) {
                    setSinglePostId(null);
                    setActiveSocialTicker(ticker);
                    setActiveTab(TabView.SOCIAL);
                    return;
                }
            }
            setActiveTab(TabView.MARKETS);
            return;
        }

        // Trade routing: /trade/SOL-USD -> switch to that pair
        if (p.startsWith('trade/')) {
            const pairSlug = p.split('/')[1];
            if (pairSlug) {
                const pairId = pairSlug.replace('-', '/');
                const pair = PAIRS.find(pr => pr.id === pairId);
                if (pair) setActivePair(pair);
            }
            setActiveTab(TabView.TRADE);
            return;
        }

        // Direct tab match
        if (tabMap[basePath]) { setActiveTab(tabMap[basePath] as any); return; }

        // Unknown / non-existent route → send to the main page and clean the URL,
        // so a bad link never leaves the user on a broken/blank route.
        const fallbackTab = user ? TabView.DASHBOARD : TabView.TRADE;
        setActiveTab(fallbackTab as any);
        try { window.history.replaceState({}, '', user ? '/dashboard' : '/trade'); } catch (_) {}
    }, [traders, user, authChecked]);

    // Initial pathname parse on mount
    useEffect(() => {
        const path = window.location.pathname;
        if (path && path !== '/') navigateFromPath(path);
    }, []);

    // Re-validate current path once auth check completes (handles hard-refresh to /dashboard)
    useEffect(() => {
        if (!authChecked) return;
        const path = window.location.pathname;
        if (path && path !== '/') navigateFromPath(path);
    }, [authChecked]);

    // Listen for popstate (browser back/forward)
    useEffect(() => {
        const handlePopState = () => {
            const path = window.location.pathname;
            if (path) navigateFromPath(path);
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [navigateFromPath]);

    // Sync active tab -> URL pathname (clean browser URLs, no hash)
    const isInternalNavRef = useRef(false);
    useEffect(() => {
        const tabToPath: Record<string, string> = {
            [TabView.DASHBOARD]: '/dashboard',
            [TabView.TRADE]: `/trade/${activePair?.id?.replace('/', '-') || 'ETH-USD'}`,
            [TabView.MARKETS]: '/markets',
            [TabView.SOCIAL]: singlePostId ? `/social/post/${singlePostId}` : activeSocialTicker ? `/markets/${activeSocialTicker}` : '/social',
            [TabView.LEADERBOARD]: '/leaderboard',
            [TabView.PROFILE]: `/profile/${user?.handle?.replace('@', '') || ''}`,
            [TabView.PUBLIC_PROFILE]: `/profile/${viewingProfile?.handle?.replace('@', '') || ''}`,
        };
        const newPath = tabToPath[activeTab] || '';
        if (newPath && newPath !== window.location.pathname) {
            window.history.pushState(null, '', newPath);
        }
    }, [activeTab, activePair, user, viewingProfile, activeSocialTicker, singlePostId]);

    // Dynamic document title: show pair + price when on trade view
    useEffect(() => {
        if (activeTab === TabView.TRADE && activePair) {
            const price = marketPrices[activePair.id];
            const priceStr = price
                ? price < 10 ? price.toFixed(4) : price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : '';
            document.title = priceStr
                ? `${activePair.id} $${priceStr} | VELO`
                : `${activePair.id} | VELO`;
        } else if (activeTab === TabView.MARKETS) {
            document.title = 'Markets | VELO';
        } else if (activeTab === TabView.SOCIAL && activeSocialTicker) {
            document.title = `$${activeSocialTicker} | VELO Social`;
        } else {
            document.title = 'Velo — Provable. Social. On-chain.';
        }
    }, [activeTab, activePair, marketPrices, activeSocialTicker]);


    // ── Social feed realtime channel ─────────────────────────────────────────
    // Architecture:
    //   • A single Postgres-changes channel covers posts/likes/reposts/comments.
    //   • On CHANNEL_ERROR or TIMED_OUT we tear it down and rebuild (backoff).
    //   • On SUBSCRIBED we do a one-shot re-fetch so any events that fired
    //     during the reconnect window are not missed.
    //   • The channel ref is stored so the cleanup can always remove the right
    //     instance even after reconnects.
    useEffect(() => {
        if (!isSupabaseConfigured()) return;

        let mounted = true;
        let channelRef: any = null;
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
        let reconnectDelay = 3_000; // start at 3 s, cap at 30 s

        // ── One-shot post loader ───────────────────────────────────────────
        const loadPosts = async () => {
            try {
                const { data, error } = await supabase
                    .from('posts')
                    .select('*, profiles!author_id(username, handle, avatar_url)')
                    .order('created_at', { ascending: false })
                    .limit(50);
                if (error || !data) return;

                const postIds = data.map((p: any) => p.id);
                const [{ data: likesData }, { data: commentsData }, { data: repostsData }] = await Promise.all([
                    supabase.from('likes').select('post_id, user_id').in('post_id', postIds),
                    supabase.from('comments').select('id, post_id, author_id, content, created_at, profiles!author_id(handle, avatar_url)').in('post_id', postIds).order('created_at', { ascending: true }),
                    supabase.from('reposts').select('post_id, user_id').in('post_id', postIds),
                ]);

                const likesMap:   Record<string, string[]>  = {};
                const commentsMap: Record<string, any[]>    = {};
                const repostsMap:  Record<string, string[]> = {};

                (likesData   || []).forEach((l: any) => { (likesMap[l.post_id]   ||= []).push(l.user_id); });
                (repostsData || []).forEach((r: any) => { (repostsMap[r.post_id] ||= []).push(r.user_id); });
                (commentsData || []).forEach((c: any) => {
                    (commentsMap[c.post_id] ||= []).push({
                        id: c.id, authorId: c.author_id,
                        authorHandle: c.profiles?.handle   || '@unknown',
                        authorAvatar: c.profiles?.avatar_url || '',
                        content: c.content, timestamp: c.created_at,
                    });
                });

                const dbPosts = data.map((p: any) => ({
                    id: p.id,
                    authorId: p.author_id,
                    authorHandle: p.profiles?.handle     || '@unknown',
                    authorAvatar: p.profiles?.avatar_url || '',
                    content: p.content,
                    image: p.image_url,
                    timestamp: p.created_at,
                    likes:      (likesMap[p.id]   || []).length,
                    reposts:    (repostsMap[p.id] || []).length,
                    likedBy:     likesMap[p.id]   || [],
                    repostedBy:  repostsMap[p.id] || [],
                    comments:    commentsMap[p.id] || [],
                    isTradeSignal: p.is_trade_signal,
                    targetProfileId: p.target_profile_id || undefined,
                    tradeDetails: p.is_trade_signal
                        ? { pair: p.trade_pair, side: p.trade_side, leverage: p.trade_leverage, entry: p.trade_entry }
                        : undefined,
                }));

                if (!mounted) return;
                setPosts(prev => {
                    // Merge: DB is authoritative for like/comment counts; keep
                    // optimistic local posts (temp-id) that haven't been confirmed yet.
                    const dbById = Object.fromEntries(dbPosts.map((p: any) => [p.id, p]));
                    const merged = prev.map(p => dbById[p.id] ? { ...dbById[p.id] } : p);
                    const mergedIds = new Set(merged.map(p => p.id));
                    dbPosts.forEach((p: any) => { if (!mergedIds.has(p.id)) merged.unshift(p); });
                    // Sort newest-first (DB timestamp wins over local optimistic order)
                    merged.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                    return merged;
                });
            } catch (e) { console.warn('[social] loadPosts failed:', e); }
        };

        // ── Channel builder with auto-reconnect ───────────────────────────
        const buildChannel = () => {
            if (!mounted) return;

            channelRef = supabase
                .channel(`velo-social-${Math.random().toString(36).slice(2, 8)}`)

                // ── posts ─────────────────────────────────────────────────
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, async (payload: any) => {
                    const p = payload.new;
                    const { data: profile } = await supabase.from('profiles').select('username, handle, avatar_url').eq('id', p.author_id).single();
                    const newPost = {
                        id: p.id, authorId: p.author_id,
                        authorHandle: profile?.handle     || '@unknown',
                        authorAvatar: profile?.avatar_url || '',
                        content: p.content, image: p.image_url, timestamp: p.created_at,
                        likes: 0, reposts: 0, likedBy: [], repostedBy: [], comments: [],
                        isTradeSignal: p.is_trade_signal,
                        targetProfileId: p.target_profile_id || undefined,
                        tradeDetails: p.is_trade_signal
                            ? { pair: p.trade_pair, side: p.trade_side, leverage: p.trade_leverage, entry: p.trade_entry }
                            : undefined,
                    };
                    if (!mounted) return;
                    setPosts(prev => {
                        if (prev.some(ex => ex.id === p.id)) return prev;
                        return [newPost, ...prev];
                    });
                })
                .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'posts' }, (payload: any) => {
                    if (!mounted) return;
                    const del = payload.old;
                    setPosts(prev => prev.filter(p => p.id !== del.id));
                })

                // ── likes ─────────────────────────────────────────────────
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'likes' }, (payload: any) => {
                    if (!mounted) return;
                    const like = payload.new;
                    setPosts(prev => prev.map(p => {
                        if (p.id !== like.post_id || p.likedBy.includes(like.user_id)) return p;
                        const newLikedBy = [...p.likedBy, like.user_id];
                        return { ...p, likedBy: newLikedBy, likes: newLikedBy.length };
                    }));
                })
                .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'likes' }, (payload: any) => {
                    if (!mounted) return;
                    const like = payload.old;
                    setPosts(prev => prev.map(p => {
                        if (p.id !== like.post_id) return p;
                        const newLikedBy = p.likedBy.filter((uid: string) => uid !== like.user_id);
                        return { ...p, likedBy: newLikedBy, likes: newLikedBy.length };
                    }));
                })

                // ── reposts ───────────────────────────────────────────────
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reposts' }, (payload: any) => {
                    if (!mounted) return;
                    const rp = payload.new;
                    setPosts(prev => prev.map(p => {
                        if (p.id !== rp.post_id || p.repostedBy.includes(rp.user_id)) return p;
                        const newRepostedBy = [...p.repostedBy, rp.user_id];
                        return { ...p, repostedBy: newRepostedBy, reposts: newRepostedBy.length };
                    }));
                })
                .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'reposts' }, (payload: any) => {
                    if (!mounted) return;
                    const rp = payload.old;
                    setPosts(prev => prev.map(p => {
                        if (p.id !== rp.post_id) return p;
                        const newRepostedBy = p.repostedBy.filter((uid: string) => uid !== rp.user_id);
                        return { ...p, repostedBy: newRepostedBy, reposts: newRepostedBy.length };
                    }));
                })

                // ── comments ──────────────────────────────────────────────
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments' }, async (payload: any) => {
                    const c = payload.new;
                    let authorHandle = '@unknown';
                    let authorAvatar = '';
                    try {
                        const { data: profile } = await supabase.from('profiles').select('handle, avatar_url').eq('id', c.author_id).single();
                        if (profile) { authorHandle = profile.handle || '@unknown'; authorAvatar = profile.avatar_url || ''; }
                    } catch {}
                    const newComment: Comment = { id: c.id, authorId: c.author_id, authorHandle, authorAvatar, content: c.content, timestamp: c.created_at };
                    if (!mounted) return;
                    setPosts(prev => prev.map(p => {
                        if (p.id !== c.post_id) return p;
                        if (p.comments.some((ex: any) => ex.id === c.id)) return p;
                        // Replace temp comment (c_xxx) from the same author with same content
                        const tempIdx = p.comments.findIndex((ex: any) =>
                            ex.id.startsWith('c_') && ex.authorId === c.author_id && ex.content === c.content
                        );
                        if (tempIdx !== -1) {
                            const updated = [...p.comments];
                            updated[tempIdx] = newComment;
                            return { ...p, comments: updated };
                        }
                        return { ...p, comments: [...p.comments, newComment] };
                    }));
                })
                .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'comments' }, (payload: any) => {
                    if (!mounted) return;
                    const del = payload.old;
                    setPosts(prev => prev.map(p =>
                        p.id === del.post_id
                            ? { ...p, comments: p.comments.filter((c: any) => c.id !== del.id) }
                            : p
                    ));
                })

                // ── channel health ────────────────────────────────────────
                .subscribe((status: string, err?: Error) => {
                    if (!mounted) return;
                    if (status === 'SUBSCRIBED') {
                        // Reset backoff and re-fetch to fill any gap during reconnect
                        reconnectDelay = 3_000;
                        loadPosts();
                    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                        console.warn(`[social] channel ${status}${err ? ': ' + err.message : ''} — reconnecting in ${reconnectDelay / 1000}s`);
                        try { supabase.removeChannel(channelRef); } catch {}
                        channelRef = null;
                        if (reconnectTimer) clearTimeout(reconnectTimer);
                        reconnectTimer = setTimeout(() => {
                            reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
                            buildChannel();
                        }, reconnectDelay);
                    }
                });
        };

        loadPosts();
        buildChannel();

        return () => {
            mounted = false;
            if (reconnectTimer) clearTimeout(reconnectTimer);
            if (channelRef) { try { supabase.removeChannel(channelRef); } catch {} }
        };
    }, []);

    // Helper: retry wrapper for transient empty/failed Supabase reads
    const withRetry = useCallback(async <T,>(fn: () => Promise<T>, isEmpty: (r: T) => boolean, tries = 3): Promise<T> => {
        let last = await fn().catch(() => null as unknown as T);
        for (let i = 1; i < tries && (last == null || isEmpty(last)); i++) {
            await new Promise(r => setTimeout(r, 1500 * i));
            last = await fn().catch(() => last);
        }
        return last;
    }, []);

    // Shared social data loader — fetches traders + posts. Called on mount and
    // again after auth completes if data is still empty (fixes the race where
    // the initial fetch fires before the JWT is active).
    const loadSocialData = useCallback(async () => {
        if (!isSupabaseConfigured()) return;
        // Keep the JWT fresh first — an expired token makes every RLS read
        // resolve as the anon role and return [], which is exactly the
        // "data wiped out, refresh doesn't help" symptom. Refreshing here
        // means the retries below run with a valid authenticated token.
        await ensureFreshSession();
        withRetry(() => fetchAllProfiles(100), (r: any) => !r?.data || r.data.length === 0).then(async (result: any) => {
            const profiles = result?.data;
            if (profiles && profiles.length > 0) {
                const { data: allFollows } = await supabase.from('follows').select('follower_id, following_id');
                const followsData = allFollows || [];
                const profileIds = profiles.map((p: any) => p.id);
                const { data: allTradeHistory } = await supabase
                    .from('trade_history')
                    .select('user_id, pnl, action')
                    .in('user_id', profileIds);
                const tradeHistoryMap: Record<string, { pnl: number; action: string }[]> = {};
                (allTradeHistory || []).forEach((t: any) => {
                    if (!tradeHistoryMap[t.user_id]) tradeHistoryMap[t.user_id] = [];
                    tradeHistoryMap[t.user_id].push(t);
                });
                const realTraders: Trader[] = profiles.map((p: any): Trader => {
                    const followerIds = followsData.filter((f: any) => f.following_id === p.id).map((f: any) => f.follower_id);
                    const followingIds = followsData.filter((f: any) => f.follower_id === p.id).map((f: any) => f.following_id);
                    const trades = tradeHistoryMap[p.id] || [];
                    const closedTrades = trades.filter((t: any) => t.action === 'CLOSE');
                    const wins = closedTrades.filter((t: any) => t.pnl > 0).length;
                    const computedWinRate = closedTrades.length > 0
                        ? (wins / closedTrades.length) * 100
                        : (p.win_rate || 0);
                    return {
                        id: p.id,
                        handle:   p.handle     || `@${p.username}`,
                        username: p.username   || 'Trader',
                        bio:      p.bio        || '',
                        avatar:   p.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.username}`,
                        banner:   p.banner_url || '',
                        pnl:      p.pnl_total  || 0,
                        followers:       followerIds,
                        following:       followingIds,
                        veloRewards:     p.velo_rewards || 0,
                        winRate:         computedWinRate,
                        activePositions: [],
                        isPrivate:       false,
                        joinedDate:      p.created_at || new Date().toISOString(),
                        walletAddress:   p.wallet_address || null,
                        authMethod:      p.auth_method    || null,
                        verifiedReason:  p.verified_reason || null,
                    };
                });
                setTraders(realTraders);
                cacheSet('traders', realTraders);
            }
        }).catch((e: any) => console.warn('Failed to load profiles:', e));

        withRetry(() => fetchPosts(50), (p: any) => !p || p.length === 0).then((freshPosts: any) => {
            if (freshPosts && freshPosts.length > 0) {
                // Always overwrite — loadSocialData is called on heal/refocus so
                // it must replace stale state, not just append to it.
                setPosts(freshPosts);
                cacheSet('posts', freshPosts);
            }
        }).catch((e: any) => console.warn('Failed to load posts:', e));
    }, [withRetry]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Initial data load: prices, candles, and social ──
    useEffect(() => {
        // Prices: Pyth primary (the oracle the contract settles on), with a
        // Binance/CoinGecko fallback so the UI is never priceless if Hermes is
        // unreachable. 24h change % comes from the fallback source.
        fetchPricesResilient().then(({ prices: livePrices, changes: liveChanges }) => {
            const merged: Record<string, number> = {};
            PAIRS.forEach(p => { merged[p.id] = livePrices[p.id] || p.basePrice; });
            setMarketPrices(merged);
            setMarketChanges(liveChanges || {});
        });
        fetchPythKlines(PAIRS[0].id, '15m').then(klineCandles => {
            if (klineCandles.length > 0) {
                setCandles(prev => ({ ...prev, [PAIRS[0].id]: klineCandles }));
            }
        });
        if (isSupabaseConfigured()) {
            loadSocialData();
        }
    }, [loadSocialData]); // eslint-disable-line react-hooks/exhaustive-deps

    // After auth resolves AND whenever navigating to Social/Leaderboard:
    // re-fetch if data is missing. Covers two races:
    //   (a) mount-time fetch fired before JWT was active → empty result, never retried
    //   (b) user navigates to social/leaderboard after token refresh or page focus
    useEffect(() => {
        if (!authChecked) return;
        if (traders.length === 0 || posts.length === 0) {
            loadSocialData();
        }
    }, [authChecked, activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

    // Auto-heal social/leaderboard data without a manual page refresh.
    // Symptom this addresses: feed + leaderboard occasionally go blank "after a
    // while" and only return on refresh — a transient client-side drop (tab
    // backgrounded long enough for Chrome to throttle/freeze it, a Realtime
    // socket reconnect, or a token refresh) leaving stale/empty state on screen.
    // Re-fetching on tab refocus and on a slow interval makes it self-recover.
    // Both loaders inside loadSocialData are length>0-guarded, so a transient
    // empty read can never clobber good data — this only ever repopulates.
    useEffect(() => {
        if (!authChecked || !isSupabaseConfigured()) return;
        const heal = async () => {
            if (document.visibilityState !== 'visible') return;
            // Ensure a live session before re-reading. ensureFreshSession will
            // refresh an expiring token, and — if the session is dead and the
            // wallet is connected — silently re-auth via wallet creds. Without
            // this the heal just re-reads with a dead token and stays empty.
            await ensureFreshSession();
            loadSocialData();
        };
        // Heal immediately on setup (and whenever the wallet address resolves —
        // on a page reload wagmi reconnects asynchronously, so the first run may
        // happen before walletAddress is available for re-auth).
        heal();
        document.addEventListener('visibilitychange', heal);
        const id = setInterval(heal, 60000);
        // When the session manager recovers the token (e.g. after a refocus
        // refresh or silent re-auth), immediately repopulate rather than waiting
        // for the next heal tick — so data "reappears" the moment auth is healthy.
        const unsubHealth = onSessionHealth((h) => { if (h === 'fresh') loadSocialData(); });
        return () => {
            document.removeEventListener('visibilitychange', heal);
            clearInterval(id);
            unsubHealth();
        };
    }, [authChecked, loadSocialData, walletAddress]);

    // Notifications had no retry path, so a session-restore fetch that raced the
    // Supabase JWT (RLS returns [] for the anon role) left the bell empty until a
    // full re-login. This mirrors the trade-history recovery effect: it runs once
    // auth is confirmed, retries once, merges (never clobbers) and re-checks on
    // tab focus — so notifications populate without logging out and back in.
    useEffect(() => {
        if (!user?.id || !isSupabaseConfigured() || !authChecked) return;
        let mounted = true;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;

        const load = async (isRetry = false) => {
            try {
                const notifs = await fetchNotifications(user.id);
                if (!mounted) return;
                if (notifs.length > 0) {
                    setNotifications(prev => {
                        const serverIds = new Set(notifs.map((n: any) => n.id));
                        const localOnly = (prev || []).filter((n: any) => !serverIds.has(n.id));
                        return [...notifs, ...localOnly];
                    });
                } else if (!isRetry) {
                    // Empty could be a genuine zero or a JWT-race — retry once.
                    retryTimer = setTimeout(() => { void load(true); }, 2200);
                }
            } catch (e) {
                if (!isRetry && mounted) retryTimer = setTimeout(() => { void load(true); }, 3000);
            }
        };

        const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
        document.addEventListener('visibilitychange', onVisible);
        void load();
        return () => {
            mounted = false;
            if (retryTimer) clearTimeout(retryTimer);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [user?.id, authChecked]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!user || positions.length === 0) return;

        const liquidated: Position[] = [];
        positions.forEach(pos => {
            if (!pos.liquidationPrice) return;
            const mark = marketPrices[pos.pair];
            if (!mark) return;
            const isLiquidated = pos.side === 'LONG'
                ? mark <= pos.liquidationPrice
                : mark >= pos.liquidationPrice;
            if (isLiquidated) liquidated.push(pos);
        });

        if (liquidated.length === 0) return;

        // Process each liquidated position
        liquidated.forEach(pos => {
            const marginLost = pos.size / pos.leverage;
            const liqHistory: TradeHistoryItem = {
                id: `liq_${pos.id}_${Date.now()}`,
                pair: pos.pair,
                side: pos.side,
                entryPrice: pos.entryPrice,
                exitPrice: pos.liquidationPrice || marketPrices[pos.pair] || pos.entryPrice,
                size: pos.size,
                pnl: -marginLost,
                timestamp: Date.now(),
                openedAt: pos.timestamp,
                leverage: pos.leverage,
                marginMode: pos.marginMode,
                liquidationPrice: pos.liquidationPrice,
                action: 'CLOSE',
            };
            setUser(prevUser => {
                if (!prevUser) return null;
                if (prevUser.tradeHistory.some(h => h.id === liqHistory.id)) return prevUser;
                const newPnlEntry = {
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    value: Math.max(0, prevUser.balance - marginLost),
                    timestamp: Date.now(),
                };
                return {
                    ...prevUser,
                    balance: Math.max(0, prevUser.balance - marginLost),
                    realizedPnL: prevUser.realizedPnL - marginLost,
                    tradeHistory: [liqHistory, ...prevUser.tradeHistory],
                    pnlHistory: [...(prevUser.pnlHistory || []), newPnlEntry],
                };
            });
            if (isSupabaseConfigured()) {
                ownDeletedPositionIds.current.add(pos.id);
                setTimeout(() => ownDeletedPositionIds.current.delete(pos.id), 15000);
                supabaseDeletePosition(pos.id).catch(() => {});
                deleteOrdersForPosition(pos.id).catch(() => {});
                insertTradeHistory(user.id, liqHistory).catch(e => console.warn("[velo] insertTradeHistory failed:", e));
                createNotification(user.id, 'LIQUIDATION',
                    `Liquidated: ${pos.pair} ${pos.side} — -$${formatMoney(marginLost)}`, pos.id)
                    .catch(() => {});
            }
            setToast({ message: `Liquidated: ${pos.pair} ${pos.side} — -$${formatMoney(marginLost)}`, type: 'ERROR' });
            playSound('ERROR');
        });

        if (liquidated.length > 0) {
            setPositions(prev => prev.filter(p => !liquidated.some(l => l.id === p.id)));
            setOpenOrders(prev => prev.filter(o => !liquidated.some(l => l.id === o.relatedPositionId)));
        }
    }, [marketPrices]); // eslint-disable-line react-hooks/exhaustive-deps

    // --- TP/SL Simulation Effect ---
    useEffect(() => {
        if (openOrders.length === 0) return;

        const filledOrders: string[] = [];
        const closedPositions: string[] = [];

        openOrders.forEach(order => {
            const currentPrice = marketPrices[order.pair];
            if (!currentPrice) return;

            let filled = false;
            // Logic for TP/SL triggers.
            // TP/SL orders have side = closeSide (opposite of the position).
            // A LONG position's TP order has side='SHORT' → fires when price rises above target.
            // A SHORT position's TP order has side='LONG'  → fires when price drops below target.
            if (order.type === 'TAKE_PROFIT') {
                if (order.side === 'SHORT' && currentPrice >= order.price) filled = true; // TP on a LONG position
                if (order.side === 'LONG'  && currentPrice <= order.price) filled = true; // TP on a SHORT position
            } else if (order.type === 'STOP_LOSS') {
                if (order.side === 'SHORT' && currentPrice <= order.price) filled = true; // SL on a LONG position
                if (order.side === 'LONG'  && currentPrice >= order.price) filled = true; // SL on a SHORT position
            }

            if (filled) {
                filledOrders.push(order.id);
                if (order.relatedPositionId) {
                    closedPositions.push(order.relatedPositionId);
                }
            }
        });

        if (filledOrders.length > 0) {
            // ── On-chain positions: delegate to the contract close path ──────
            // For positions backed by VeloPerps on-chain (id = "velo_<tradeId>"),
            // the simulation layer must NOT wipe them from local state — that would
            // clear the position before the on-chain close lands. Instead, fire the
            // same on-chain close path the "Close 100%" button uses.
            closedPositions.forEach(posId => {
                if (posId.startsWith('velo_')) {
                    setOpenOrders(prev => prev.filter(o => !filledOrders.includes(o.id) && o.relatedPositionId !== posId));
                    const pos = positions.find(p => p.id === posId);
                    if (pos) {
                        const tradeIdStr = posId.slice('velo_'.length);
                        const tradeId = BigInt(tradeIdStr);
                        const veloPair = uiPairToVeloPair(pos.pair);
                        if (veloPair) {
                            // Claim this tradeId so the keeper-detection fallback
                            // effect won't write a duplicate close-history row.
                            markVeloTradeClosed(tradeIdStr);
                            veloPerpsTrading.closePosition(tradeId, veloPair).then((result: any) => {
                                const enrichedClose: TradeHistoryItem = {
                                    id: `close_tp_${posId}_${Date.now()}`,
                                    pair: pos.pair, side: pos.side,
                                    entryPrice: pos.entryPrice,
                                    exitPrice: result.exitPrice || marketPrices[pos.pair] || pos.entryPrice,
                                    size: pos.size, pnl: result.pnlUSDC,
                                    timestamp: Date.now(), openedAt: pos.timestamp,
                                    leverage: pos.leverage, marginMode: pos.marginMode,
                                    liquidationPrice: pos.liquidationPrice,
                                    action: 'CLOSE', onChain: true,
                                } as any;
                                setUser((prevUser: any) => {
                                    if (!prevUser) return null;
                                    const margin = pos.size / pos.leverage;
                                    return { ...prevUser, balance: prevUser.balance + result.pnlUSDC + margin, realizedPnL: prevUser.realizedPnL + result.pnlUSDC, tradeHistory: [enrichedClose, ...prevUser.tradeHistory] };
                                });
                                if (isSupabaseConfigured() && user) insertTradeHistory(user.id, enrichedClose).catch((e: any) => console.warn('[velo] TP/SL history failed:', e));
                            }).catch((e: any) => console.warn('[velo] TP/SL on-chain close failed:', e?.shortMessage || e?.message));
                        }
                    }
                }
            });

            // ── Simulation-only positions: close in local state ───────────────
            const simClosedPositions = closedPositions.filter(id => !id.startsWith('velo_'));
            if (simClosedPositions.length === 0) return;

            let updatedOrders = openOrders.filter(o => !filledOrders.includes(o.id));
            let updatedPositions = positions;
            let pnlUpdate = 0;
            let historyUpdate: TradeHistoryItem[] = [];

            simClosedPositions.forEach(posId => {
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
                        openedAt: pos.timestamp,
                        leverage: pos.leverage,
                        marginMode: pos.marginMode,
                        liquidationPrice: pos.liquidationPrice,
                        copyTraderId: pos.copyTraderId,
                        action: 'CLOSE',
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
            // Persist closed positions to Supabase
            if (isSupabaseConfigured()) {
                // Register own deletes so realtime onDelete skips them.
                simClosedPositions.forEach(posId => {
                    ownDeletedPositionIds.current.add(posId);
                    setTimeout(() => ownDeletedPositionIds.current.delete(posId), 15000);
                });
                simClosedPositions.forEach(posId => supabaseDeletePosition(posId).catch(() => {}));
                simClosedPositions.forEach(posId => deleteOrdersForPosition(posId).catch(() => {}));
            }
            
            if (user && (pnlUpdate !== 0 || historyUpdate.length > 0)) {
                 const returnedMargin = simClosedPositions.reduce((acc, posId) => {
                     const p = positions.find(x => x.id === posId);
                     return p ? acc + (p.size / p.leverage) : acc;
                 }, 0);
                 // Use functional updater to always operate on the LATEST state, never stale closure.
                 // Guard against double-credit: if any closed position's CLOSE history already exists,
                 // skip the balance mutation (React 18 Strict Mode can run effects twice in dev).
                 setUser(prevUser => {
                     if (!prevUser) return null;
                     const alreadyApplied = historyUpdate.every(h =>
                         prevUser.tradeHistory.some(existing => existing.id === h.id)
                     );
                     if (alreadyApplied && historyUpdate.length > 0) return prevUser;
                     return {
                         ...prevUser,
                         balance: prevUser.balance + pnlUpdate + returnedMargin,
                         realizedPnL: prevUser.realizedPnL + pnlUpdate,
                         tradeHistory: [...historyUpdate, ...prevUser.tradeHistory],
                     };
                 });
                 const updatedUser = { ...user }; // kept only for the Supabase block below
                 if (isSupabaseConfigured()) {
                     historyUpdate.forEach(h => {
                         insertTradeHistory(user.id, h).catch(e => console.error('[velo] insertTradeHistory error:', e));
                         // Notify: TP or SL hit
                         const filledOrder = openOrders.find(o => o.relatedPositionId === h.id || filledOrders.some(fid => {
                             const ord = openOrders.find(x => x.id === fid);
                             return ord?.relatedPositionId && h.pair === ord.pair;
                         }));
                         const isTp = h.pnl > 0;
                         const notifMsg = isTp
                             ? `Take Profit hit on ${h.pair} ${h.side} — +$${Math.abs(h.pnl).toFixed(2)}`
                             : `Stop Loss hit on ${h.pair} ${h.side} — -$${Math.abs(h.pnl).toFixed(2)}`;
                         createNotification(user.id, isTp ? 'TAKE_PROFIT' : 'STOP_LOSS', notifMsg, h.id)
                             .catch(e => console.warn('TP/SL notification failed:', e));
                         // Also show local toast
                         setToast({ message: notifMsg, type: isTp ? 'SUCCESS' : 'ERROR' });
                     });
                 }
            }
        }

    }, [marketPrices, openOrders, positions, user]);

    const handleUpdatePosition = (id: string, tp: string, sl: string) => {
        const tpPrice = parseFloat(tp) || undefined;
        const slPrice = parseFloat(sl) || undefined;

        setPositions(prevPositions => {
            const posIndex = prevPositions.findIndex(p => p.id === id);
            if (posIndex === -1) return prevPositions;
            const updatedPositions = [...prevPositions];
            const pos = { ...updatedPositions[posIndex], takeProfit: tpPrice, stopLoss: slPrice };
            updatedPositions[posIndex] = pos;

            // Persist TP/SL to Supabase
            if (isSupabaseConfigured() && user) {
                updatePositionInDB(id, { take_profit: tpPrice || null, stop_loss: slPrice || null }).catch(() => {});
            }

            // Sync open orders for TP/SL
            setOpenOrders(prevOrders => {
                let currentOrders = prevOrders.filter(o => o.relatedPositionId !== id);
                const closeSide = pos.side === 'LONG' ? 'SHORT' : 'LONG';
                const newOrds: OpenOrder[] = [];
                if (tpPrice) newOrds.push({ id: `ord_tp_${id}_${Date.now()}`, pair: pos.pair, side: closeSide, type: 'TAKE_PROFIT', price: tpPrice, size: pos.size, leverage: pos.leverage, timestamp: Date.now(), relatedPositionId: id });
                if (slPrice) newOrds.push({ id: `ord_sl_${id}_${Date.now()}`, pair: pos.pair, side: closeSide, type: 'STOP_LOSS',   price: slPrice, size: pos.size, leverage: pos.leverage, timestamp: Date.now(), relatedPositionId: id });
                // Persist new orders
                if (isSupabaseConfigured() && user) {
                    deleteOrdersForPosition(id).then(() => newOrds.forEach(o => saveOpenOrder(user.id, o))).catch(() => {});
                }
                return [...currentOrders, ...newOrds];
            });
            return updatedPositions;
        });

        setEditingPosition(null);
        setToast({message:'TP/SL Updated', type:'SUCCESS'});
        playSound('SUCCESS');
    };

    // Track if user financials have been loaded from DB (not just the initial 10k default)
    const userLoadedFromDB = useRef(false);

    // Count of in-flight deposit/withdraw RPC calls from THIS tab.
    // While > 0 the profileCh realtime handler will not clobber the local optimistic balance —
    // the RPC (adjust_balance) is the authoritative writer and syncUserFinancials will
    // push the final correct value shortly after, at which point profileCh fires again with
    // balanceDiff > 0.01 and a subsequent sync from OTHER tabs would be applied correctly.
    const pendingTransactions = useRef(0);

    useEffect(() => { if(user && isSupabaseConfigured() && userLoadedFromDB.current) {
        const closed = user.tradeHistory.filter(t => t.action === 'CLOSE');
        const wins = closed.filter(t => t.pnl > 0).length;
        const winRate = closed.length > 0 ? (wins / closed.length) * 100 : 0;

        // CRITICAL: Never write balance to DB while a deposit/withdraw is in-flight.
        // The recordTransaction RPC (adjust_balance) is the sole authoritative balance writer.
        // Writing here too causes Tab B to receive two profileCh events and double-credit the delta.
        if (pendingTransactions.current > 0) {
            supabase.from("profiles")
                .update({ realized_pnl: user.realizedPnL, pnl_total: user.realizedPnL, win_rate: winRate })
                .eq("id", user.id)
                .then(() => {});
        } else {
            syncUserFinancials(user.id, user.balance, user.realizedPnL, winRate).catch(() => {});
        }
        setTraders(prev => prev.map((t: any) =>
            t.id === user.id ? { ...t, pnl: user.realizedPnL, winRate } : t
        ));
    }}, [user?.balance, user?.realizedPnL, user?.tradeHistory]);

    // Real-time prices via Pyth Hermes SSE stream — same oracle the VeloPerps
    // contract settles trades on, so mark price tracks fills (no Binance gap).
    useEffect(() => {
        pythPriceStream.connect();
        const unsub = pythPriceStream.subscribe(prices => {
            setMarketPrices(prev => ({ ...prev, ...prices }));
        });
        // Fallback REST poll every 30s (covers SSE drops). Resilient: Pyth first,
        // Binance/CoinGecko fill so prices keep updating even if Hermes is down.
        const restTimer = setInterval(() => {
            fetchPricesResilient().then(({ prices: realPrices }) => {
                if (Object.keys(realPrices).length > 0) {
                    setMarketPrices(prev => ({ ...prev, ...realPrices }));
                }
            });
        }, 30000);
        return () => { unsub(); pythPriceStream.disconnect(); clearInterval(restTimer); };
    }, []);

    // Real-time social feed is handled by the unified social-sync channel above

    // Real-time per-user channels (notifications, transactions, follows)
    // Each channel uses a unique name + auto-reconnects on CHANNEL_ERROR / TIMED_OUT.
    useEffect(() => {
        if (!user || !isSupabaseConfigured()) return;
        let mounted = true;

        // ── helpers ───────────────────────────────────────────────────────
        const makeReconnector = (build: () => any) => {
            let chRef: any = null;
            let timer: ReturnType<typeof setTimeout> | null = null;
            let delay = 3_000;
            const launch = () => {
                if (!mounted) return;
                chRef = build();
            };
            const onStatus = (status: string, err?: Error) => {
                if (!mounted) return;
                if (status === 'SUBSCRIBED') { delay = 3_000; return; }
                if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                    console.warn(`[velo:rt] ${status}${err ? ': ' + err.message : ''} — retry in ${delay / 1000}s`);
                    try { supabase.removeChannel(chRef); } catch {}
                    chRef = null;
                    if (timer) clearTimeout(timer);
                    timer = setTimeout(() => { delay = Math.min(delay * 2, 30_000); launch(); }, delay);
                }
            };
            return { launch, onStatus, remove: () => { if (chRef) { try { supabase.removeChannel(chRef); } catch {} } if (timer) clearTimeout(timer); } };
        };

        // ── notifications ─────────────────────────────────────────────────
        const notifR = makeReconnector(() =>
            subscribeUserNotifications(user.id, (rawNotif: any) => {
                if (!mounted) return;
                const notif: Notification = {
                    id: rawNotif.id, type: rawNotif.type, message: rawNotif.message,
                    timestamp: new Date(rawNotif.created_at).getTime(),
                    read: false, relatedId: rawNotif.related_id,
                };
                setNotifications(prev => prev.some(n => n.id === notif.id) ? prev : [notif, ...prev]);
                setToast({ message: rawNotif.message, type: 'INFO' });
                playSound('CLICK');
            }, notifR.onStatus)
        );
        notifR.launch();

        // ── transactions ──────────────────────────────────────────────────
        const txR = makeReconnector(() =>
            subscribeUserTransactions(user.id, (rawTx: any) => {
                if (!mounted) return;
                const incoming: any = {
                    id: rawTx.id, type: rawTx.type,
                    amount: Number(rawTx.amount) || 0,
                    timestamp: new Date(rawTx.created_at).getTime(),
                    status: rawTx.status,
                    onChain: rawTx.on_chain || false,
                    txHash: rawTx.tx_hash || undefined,
                    withdrawNonce: rawTx.withdraw_nonce != null ? Number(rawTx.withdraw_nonce) : undefined,
                    counterparty: rawTx.counterparty || undefined,
                };
                setUser(prev => {
                    if (!prev) return prev;
                    const history = prev.transactionHistory ?? [];
                    if (history.some((t: any) => t.id === incoming.id)) return prev;
                    return { ...prev, transactionHistory: [incoming, ...history] };
                });
            }, txR.onStatus)
        );
        txR.launch();

        // ── follows ───────────────────────────────────────────────────────
        const uid2 = Math.random().toString(36).slice(2, 8);
        const followCh = supabase.channel(`velo-follows-${user.id}-${uid2}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'follows', filter: `following_id=eq.${user.id}` }, (payload: any) => {
                if (!mounted) return;
                const followerId = payload.new?.follower_id;
                if (followerId) {
                    setUser(prev => prev ? {
                        ...prev,
                        followers: prev.followers.includes(followerId) ? prev.followers : [...prev.followers, followerId],
                    } : null);
                }
            })
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'follows', filter: `following_id=eq.${user.id}` }, (payload: any) => {
                if (!mounted) return;
                const followerId = payload.old?.follower_id;
                if (followerId) {
                    setUser(prev => prev ? { ...prev, followers: prev.followers.filter(id => id !== followerId) } : null);
                }
            })
            .subscribe();

        return () => {
            mounted = false;
            notifR.remove();
            txR.remove();
            try { supabase.removeChannel(followCh); } catch {}
        };
    }, [user?.id]);

    // Real-time positions + orders sync across tabs.
    // When another tab opens/closes/edits a position (or cancels an order) the
    // Supabase Realtime event fires here and we merge the change into local state.
    //
    // KEY REQUIREMENT: tables must have REPLICA IDENTITY FULL (set in SUPABASE_SCHEMA.sql)
    // so that DELETE events carry the full old row — not just the PK.
    useEffect(() => {
        if (!user || !isSupabaseConfigured()) return;

        const rowToPosition = (r: any): Position => ({
            id:               r.id,
            pair:             r.pair,
            side:             r.side,
            entryPrice:       r.entry_price,
            size:             r.size,
            leverage:         r.leverage,
            marginMode:       r.margin_mode || 'ISOLATED',
            liquidationPrice: r.liquidation_price,
            takeProfit:       r.take_profit  || undefined,
            stopLoss:         r.stop_loss    || undefined,
            timestamp:        r.created_at ? new Date(r.created_at).getTime() : Date.now(),
            isCopyTrade:      r.is_copy_trade  || false,
            copyTraderId:     r.copy_trader_id || undefined,
        });

        const rowToOrder = (r: any): OpenOrder => ({
            id:                 r.id,
            pair:               r.pair,
            side:               r.side,
            type:               r.type,
            price:              r.price,
            size:               r.size,
            leverage:           r.leverage,
            timestamp:          r.created_at ? new Date(r.created_at).getTime() : Date.now(),
            relatedPositionId:  r.related_position_id || undefined,
            copyTraderId:       r.copy_trader_id || undefined,
        });

        const posCh = subscribeUserPositions(user.id, {
            onInsert: (row) => {
                const incoming = rowToPosition(row);
                // Skip positions that THIS tab just saved — executeTrade already
                // inserted them into local state with the temp id and then patched
                // the id to the real DB UUID. If we let this event through, we get
                // a duplicate position which causes double balance credits on close.
                if (ownSavedPositionIds.current.has(incoming.id)) return;
                // Position opened by ANOTHER tab — add to local positions only if
                // it's not already present. Balance will be synced via the profileCh
                // subscription when syncUserFinancials writes the new free balance to DB.
                // We do NOT deduct margin here — the profileCh sync already delivers
                // the correct post-trade free balance from the DB, avoiding double-deduction.
                setPositions(prev => {
                    if (prev.some(p => p.id === incoming.id)) return prev;
                    return [incoming, ...prev];
                });
            },
            onUpdate: (row) => {
                const incoming = rowToPosition(row);
                setPositions(prev =>
                    prev.map(p => p.id === incoming.id ? { ...p, ...incoming } : p)
                );
            },
            onDelete: (row) => {
                // row.id is reliable even without REPLICA IDENTITY FULL (PK is always sent).
                // For balance/PnL credit we use the position we already hold in local state —
                // that data is always fresh because we track it in positionsRef.
                const posId = row.id;
                if (!posId) return; // safety guard

                // If THIS tab deleted this position, balance was already credited locally.
                // Bail out early to prevent double-credit.
                if (ownDeletedPositionIds.current.has(posId)) {
                    // Still clean up local state (position was already removed by the
                    // originating action, but belt-and-suspenders doesn't hurt).
                    setPositions(prev => prev.filter(p => p.id !== posId));
                    setOpenOrders(prev => prev.filter(o => o.relatedPositionId !== posId));
                    return;
                }

                setPositions(prev => {
                    const closing = prev.find(p => p.id === posId);
                    if (!closing) {
                        // Already removed by this tab's own handleClosePosition — nothing to do.
                        return prev;
                    }
                    // Another tab closed this position. Credit balance + realizedPnL here.
                    // Use marketPricesRef (always-fresh) instead of the stale marketPrices
                    // closure captured when this subscription was set up.
                    const closePrice = marketPricesRef.current[closing.pair] || closing.entryPrice;
                    const pnl = (closePrice - closing.entryPrice)
                        * (closing.side === 'LONG' ? 1 : -1)
                        * (closing.size / closing.entryPrice);
                    const marginReturned = closing.size / closing.leverage;
                    const closeHistory: TradeHistoryItem = {
                        id: `rt_close_${posId}`,
                        pair: closing.pair,
                        side: closing.side,
                        entryPrice: closing.entryPrice,
                        exitPrice: closePrice,
                        size: closing.size,
                        pnl,
                        timestamp: Date.now(),
                        openedAt: closing.timestamp,
                        leverage: closing.leverage,
                        marginMode: closing.marginMode,
                        liquidationPrice: closing.liquidationPrice,
                        copyTraderId: closing.copyTraderId,
                        action: 'CLOSE',
                    };
                    setUser(prevUser => {
                        if (!prevUser) return null;
                        // Guard against double-credit (e.g. this tab also ran handleClosePosition)
                        if (prevUser.tradeHistory.some(h => h.id === closeHistory.id)) return prevUser;
                        return {
                            ...prevUser,
                            balance: prevUser.balance + marginReturned + pnl,
                            realizedPnL: prevUser.realizedPnL + pnl,
                            tradeHistory: [closeHistory, ...prevUser.tradeHistory],
                        };
                    });
                    return prev.filter(p => p.id !== posId);
                });

                // Clean up linked open orders in local state
                setOpenOrders(prev => prev.filter(o => o.relatedPositionId !== posId));
            },
        });

        const ordCh = subscribeUserOrders(user.id, {
            onInsert: (row) => {
                const incoming = rowToOrder(row);
                setOpenOrders(prev => {
                    if (prev.some(o => o.id === incoming.id)) return prev;
                    return [incoming, ...prev];
                });
            },
            onDelete: (row) => {
                const ordId = row.id;
                if (!ordId) return;
                setOpenOrders(prev => prev.filter(o => o.id !== ordId));
            },
        });

        // ── Profile balance sync across tabs ──────────────────────────
        // When another tab executes a trade, syncUserFinancials() writes the
        // updated balance + realized_pnl back to the profiles table.
        // We subscribe here so every other open tab picks up the authoritative
        // DB balance immediately, keeping buying-power accurate everywhere.
        //
        // We deliberately do NOT sync while a trade is in-flight from this tab
        // (balance is being mutated optimistically). The 2-second debounce on
        // syncUserFinancials means the DB write arrives after local state settles,
        // so there is no race in practice.
        const profileCh = supabase
            .channel(`velo-profile-balance-${user.id}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'profiles',
                filter: `id=eq.${user.id}`,
            }, (payload: any) => {
                const updated = payload.new;
                if (!updated) return;
                // Only sync balance from another tab — if this tab just wrote
                // it (syncUserFinancials was called here), skip to avoid
                // clobbering an in-flight optimistic update.
                // We detect "own write" by checking if the value matches what
                // we already have in local state (within $0.01 rounding).
                setUser(prevUser => {
                    if (!prevUser) return null;
                    // If THIS tab has a deposit/withdraw RPC in-flight, skip — the
                    // optimistic local balance is already correct and the DB write
                    // (adjust_balance RPC) is the authoritative update. Applying the
                    // intermediate DB value here would either double-credit or be a no-op
                    // depending on timing, causing the "20k on second tab" bug.
                    if (pendingTransactions.current > 0) return prevUser;
                    // If THIS tab just executed a trade (open/close), skip — the
                    // syncUserFinancials that fired from the balance useEffect is our
                    // own write bouncing back. Applying it again would double the delta.
                    if (pendingTradeOps.current > 0) return prevUser;
                    const incomingBalance = updated.balance ?? prevUser.balance;
                    const incomingRealizedPnL = updated.realized_pnl ?? prevUser.realizedPnL;
                    const balanceDiff = Math.abs(incomingBalance - prevUser.balance);
                    if (balanceDiff < 0.01) return prevUser; // Same value — no-op
                    return {
                        ...prevUser,
                        balance: Math.max(0, incomingBalance),
                        realizedPnL: incomingRealizedPnL,
                    };
                });
            })
            .subscribe();

        return () => {
            supabase.removeChannel(posCh);
            supabase.removeChannel(ordCh);
            supabase.removeChannel(profileCh);
        };
    }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
    // Note: marketPrices intentionally excluded — we want a stable subscription.
    // The onDelete handler captures marketPrices via closure at call time, which
    // is fine because prices update every second and the close price is always current.

    // Real-time leaderboard: update traders whenever any profile changes.
    // Uses auto-reconnect so the leaderboard stays live after a WS drop.
    useEffect(() => {
        if (!isSupabaseConfigured()) return;
        let mounted = true;
        let lbRef: any = null;
        let timer: ReturnType<typeof setTimeout> | null = null;
        let delay = 3_000;

        const onProfileUpdate = (updated: any) => {
            if (!mounted) return;
            setTraders(prev => {
                const exists = prev.some((t: any) => t.id === updated.id);
                if (!exists) {
                    // New profile inserted — add to traders list
                    const newTrader: any = {
                        id: updated.id,
                        handle:   updated.handle   || `@${updated.username}`,
                        username: updated.username || 'Trader',
                        bio:      updated.bio      || '',
                        avatar:   updated.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${updated.username}`,
                        banner:   updated.banner_url || '',
                        pnl:      updated.pnl_total || 0,
                        winRate:  updated.win_rate  || 0,
                        followers: [], following: [],
                        veloRewards: updated.velo_rewards || 0,
                        activePositions: [], isPrivate: false,
                        joinedDate: updated.created_at || new Date().toISOString(),
                        walletAddress: updated.wallet_address || null,
                        authMethod:    updated.auth_method    || null,
                        verifiedReason: updated.verified_reason || null,
                    };
                    return [...prev, newTrader];
                }
                return prev.map((t: any) =>
                    t.id === updated.id ? {
                        ...t,
                        pnl:      updated.pnl_total  ?? t.pnl,
                        winRate:  updated.win_rate   ?? t.winRate,
                        username: updated.username   ?? t.username,
                        handle:   updated.handle     ?? t.handle,
                        avatar:   updated.avatar_url ?? t.avatar,
                        banner:   updated.banner_url ?? t.banner,
                        bio:      updated.bio        ?? t.bio,
                        verifiedReason: updated.verified_reason ?? t.verifiedReason,
                    } : t
                );
            });
            setViewingProfile((prev: any) => {
                if (!prev || prev.id !== updated.id) return prev;
                return { ...prev, pnl: updated.pnl_total ?? prev.pnl, winRate: updated.win_rate ?? prev.winRate };
            });
        };

        const buildLb = () => {
            if (!mounted) return;
            lbRef = subscribeLeaderboard(onProfileUpdate, (status, err) => {
                if (!mounted) return;
                if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                    try { supabase.removeChannel(lbRef); } catch {}
                    lbRef = null;
                    if (timer) clearTimeout(timer);
                    timer = setTimeout(() => { delay = Math.min(delay * 2, 30_000); buildLb(); }, delay);
                } else if (status === 'SUBSCRIBED') { delay = 3_000; }
            });
        };
        buildLb();

        return () => {
            mounted = false;
            if (timer) clearTimeout(timer);
            if (lbRef) { try { supabase.removeChannel(lbRef); } catch {} }
        };
    }, []);

    // Smart auth entry point — used by all "Log In" buttons in the UI.
    // If the wallet is already connected, silently sign in with wallet credentials
    // instead of reopening AppKit (which just shows the already-connected wallet info).
    // Only open AppKit if there is no wallet connected at all.
    const handleRequireAuth = async () => {
        if (user) return;
        if (isWalletConnected && walletAddress) {
            // Manual click — clear all guards so this always succeeds.
            intentionalLogoutRef.current = false;
            socialLoginHandledRef.current = false;
            socialLoginHandledRef.current = true; // lock against concurrent calls
            try {
                const pseudoEmail = `${walletAddress.toLowerCase()}@wallet.velo`;
                const password = `velo_w3_${walletAddress.toLowerCase().slice(2, 20)}_xK9`;
                const { data, error: signInErr } = await supabase.auth.signInWithPassword({ email: pseudoEmail, password });
                if (data?.user && !signInErr) {
                    const { data: profile } = await supabase.from('profiles').select('*').eq('id', data.user.id).single();
                    if (profile?.username) {
                        intentionalLogoutRef.current = false;
                        sessionRestoredRef.current = true;
                        silentLoginCallbackRef.current?.(data.user, profile);
                        return;
                    }
                }
                socialLoginHandledRef.current = false;
                setLoginReturningName('');
                setLoginOpen(true);
            } catch {
                socialLoginHandledRef.current = false;
                setLoginOpen(true);
            }
        } else {
            openAppKitModal();
        }
    };
    const handleLogout = async () => {
        const name = user?.username;
        triggerAnim('LOGOUT', name ? `See you, ${name}` : undefined);

        // Schedule the hard navigation FIRST, before any awaits below. Some
        // wagmi versions hang on disconnect; some Supabase setups have flaky
        // signOut endpoints; either would prevent a setTimeout at the bottom
        // of this function from ever being scheduled. The user MUST end up
        // on a clean state regardless. Going to /?logout=1 (not just /) so
        // the module-level IIFE at the top of this file fires and sets the
        // window-level lock that blocks every auto-restore path.
        setTimeout(() => {
            try { window.location.replace('/?logout=1'); }
            catch { window.location.href = '/?logout=1'; }
        }, 1200);

        // Block any in-flight session restore / socialLogin effect from
        // immediately re-hydrating us into the account we're leaving.
        intentionalLogoutRef.current = true;

        // ── Step 1: nuke client-side state synchronously. ────────────────────
        // We do this before awaiting wagmi/supabase so that the UI flips to
        // logged-out instantly even if either of those takes seconds to
        // complete (or fails on the network).
        clearSessionCache();
        // Comprehensive localStorage purge — allowlist approach. Anything not
        // in this set gets wiped, including wagmi.*, wc@*, appkit*, sb-*,
        // walletconnect-* and every other session-shaped key the connectors
        // and Supabase scatter across storage. The user explicitly asked for
        // logout to clear ALL cache; we honor that, while preserving the
        // bare-minimum that survives logout in every comparable product:
        //   - velo_burner_*   — deterministic sub-account; nuking it forces
        //                       a fresh personal_sign on every re-login,
        //                       which neither Hyperliquid nor Lyra do.
        //   - velo_theme      — UI pref, not session.
        //   - velo_fav_markets — UI pref, not session.
        //   - orderly_kp_*    — Orderly trading keypair (same logic as burner).
        try {
            const KEEP_EXACT  = new Set(['velo_theme', 'velo_fav_markets']);
            const KEEP_PREFIX = ['velo_burner_', 'orderly_kp_'];
            const toWipe: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (!k) continue;
                if (KEEP_EXACT.has(k)) continue;
                if (KEEP_PREFIX.some(p => k.startsWith(p))) continue;
                toWipe.push(k);
            }
            for (const k of toWipe) {
                try { localStorage.removeItem(k); } catch {}
            }
        } catch {}
        // sessionStorage is ephemeral by design but some connectors stash
        // intermediate auth state there during OAuth/WalletConnect round-trips.
        // Clear it wholesale — nothing in there is meant to outlive a session.
        try { sessionStorage.clear(); } catch {}

        // Wagmi disconnect — wagmi v2's disconnect returns a Promise that
        // settles when the connector has finished tearing down. Earlier
        // versions of this handler fire-and-forgot it; that left a tiny
        // window where `useAccount().isConnected` was still true after
        // setUser(null), and the socialLoginEffect re-armed by retryAuthTick
        // could observe a live wallet and silently sign the user back in.
        // Awaiting closes that window for good.
        try {
            const result = walletDisconnectRef.current?.() as unknown as Promise<unknown> | void;
            if (result && typeof (result as any).then === 'function') {
                await (result as Promise<unknown>);
            }
        } catch (e) {
            console.warn('[velo] wagmi disconnect threw (continuing logout):', e);
        }

        // Supabase signOut. Wrapped so a network hiccup doesn't strand us in
        // a half-logged-out state — the hard navigation at the end is the
        // last-resort guarantee that any stuck state gets wiped.
        if (isSupabaseConfigured()) {
            try { await supabaseSignOut(); } catch (e) {
                console.warn('[velo] signOut error (continuing logout):', e);
            }
        }

        // ── Step 2: clear all session-bound React state. ────────────────────
        userLoadedFromDB.current = false;
        sessionRestoredRef.current = false;
        autoRecoverAttemptedRef.current = false;
        burnerRecoveredRef.current = false;
        freshWalletConnectRef.current = false;
        socialLoginHandledRef.current = false;
        setLoginReturningName('');
        setUser(null);
        setPositions([]);
        setOpenOrders([]);
        setNotifications([]);
        clearNotifCache();
        setChartPrefs({
            chartTf:    DEFAULT_PREFERENCES.chartTf,
            chartStyle: DEFAULT_PREFERENCES.chartStyle,
            indicators: DEFAULT_PREFERENCES.indicators,
            overlays:   DEFAULT_PREFERENCES.overlays,
        });
        setAppOrderDetails(null);
        setNotifOpen(false);
        setActiveTab(TabView.TRADE);
        playSound('CLOSE');

        // Note: the hard-navigate timer was scheduled at the TOP of this
        // function (line ~6485). It fires regardless of how the cleanup
        // above goes — that's the entire point. Don't add another timer
        // here; it'd just double-fire after a no-op.
    };
    const handleDeposit = async (a: number) => {
        if (!user || a <= 0) return;
        const prevBalance = user.balance;

        // Optimistic local update so the UI responds instantly
        setUser(prev => prev ? {
            ...prev,
            balance: prev.balance + a,
            transactionHistory: [
                { id: `txn_${Date.now()}`, type: 'DEPOSIT', amount: a, timestamp: Date.now(), status: 'COMPLETED' },
                ...prev.transactionHistory,
            ],
        } : null);
        triggerAnim('DEPOSIT', `+ $${a.toLocaleString()}`, 'Funds added to account');
        playSound('SUCCESS');

        if (!isSupabaseConfigured()) return;

        // recordTransaction inserts the row AND adjusts the balance via RPC.
        // If either fails, reconcile local state from DB so we never show a
        // balance that doesn't match what Supabase says.
        try {
            pendingTransactions.current += 1;
            await recordTransaction(user.id, 'DEPOSIT', a);
            // Refresh transaction history from DB to replace optimistic entry with real UUID
            try {
                const freshTxns = await fetchTransactions(user.id);
                setUser(prev => prev ? { ...prev, transactionHistory: freshTxns } : null);
            } catch (_) { /* keep optimistic */ }
        } catch (e) {
            console.error('[velo] deposit sync failed, rolling back:', e);
            setUser(prev => prev ? { ...prev, balance: prevBalance } : null);
            setToast({ message: 'Deposit failed. Please try again.', type: 'ERROR' });
            playSound('ERROR');
        } finally {
            // Decrement after a short delay so the profileCh handler that fires
            // in response to the RPC write is also suppressed (Supabase realtime
            // can deliver the event within ms of the RPC completing).
            setTimeout(() => { pendingTransactions.current = Math.max(0, pendingTransactions.current - 1); }, 5000);
        }
    };

    const handleWithdraw = async (a: number) => {
        if (!user || a <= 0 || user.balance < a) {
            if (user && user.balance < a) {
                setToast({ message: 'Insufficient free balance', type: 'ERROR' });
                playSound('ERROR');
            }
            return;
        }
        const prevBalance = user.balance;

        setUser(prev => prev ? {
            ...prev,
            balance: prev.balance - a,
            transactionHistory: [
                { id: `txn_${Date.now()}`, type: 'WITHDRAW', amount: a, timestamp: Date.now(), status: 'COMPLETED' },
                ...prev.transactionHistory,
            ],
        } : null);
        triggerAnim('WITHDRAW', `- $${a.toLocaleString()}`, 'Processing your withdrawal');
        playSound('SUCCESS');

        if (!isSupabaseConfigured()) return;

        try {
            pendingTransactions.current += 1;
            await recordTransaction(user.id, 'WITHDRAW', a);
            // Refresh transaction history from DB to replace optimistic entry with real UUID
            try {
                const freshTxns = await fetchTransactions(user.id);
                setUser(prev => prev ? { ...prev, transactionHistory: freshTxns } : null);
            } catch (_) { /* keep optimistic */ }
        } catch (e) {
            console.error('[velo] withdraw sync failed, rolling back:', e);
            setUser(prev => prev ? { ...prev, balance: prevBalance } : null);
            setToast({ message: 'Withdrawal failed. Please try again.', type: 'ERROR' });
            playSound('ERROR');
        } finally {
            setTimeout(() => { pendingTransactions.current = Math.max(0, pendingTransactions.current - 1); }, 5000);
        }
    };
    const isProcessing = useRef(false);

    // ── Dedicated lever-only update — no tradeLock, no size, no modal ──────────
    // Called directly from the leverage dropdown when a position already exists.
    // Calculates the margin delta, updates balance + position, persists to DB.
    const executeLeverageUpdate = (
        pairId: string, side: string, newLeverage: number,
        _price: number, _marginMode: MarginMode, existingPos: Position
    ) => {
        if (!user) return;
        const mm = 0.005;
        const oldMargin   = existingPos.size / existingPos.leverage;
        const newMarginNeeded = existingPos.size / newLeverage;
        const marginDelta = newMarginNeeded - oldMargin; // + = locked, - = freed

        // Block if user can't afford the extra margin
        if (marginDelta > 0 && user.balance < marginDelta) {
            setToast({ message: `Need $${marginDelta.toFixed(2)} more free balance to reduce leverage`, type: 'ERROR' });
            playSound('ERROR');
            return;
        }

        const newLiqPrice = side === 'LONG'
            ? existingPos.entryPrice * (1 - (1 / newLeverage) + mm)
            : existingPos.entryPrice * (1 + (1 / newLeverage) - mm);

        // Optimistic local updates
        setPositions(prev => prev.map(p =>
            p.id === existingPos.id ? { ...p, leverage: newLeverage, liquidationPrice: newLiqPrice } : p
        ));
        // Adjust free balance by the margin delta
        pendingTradeOps.current += 1;
        setTimeout(() => { pendingTradeOps.current = Math.max(0, pendingTradeOps.current - 1); }, 8000);
        setUser(prev => prev ? { ...prev, balance: Math.max(0, prev.balance - marginDelta) } : null);

        // Persist
        if (isSupabaseConfigured()) {
            updatePositionInDB(existingPos.id, {
                leverage: newLeverage,
                liquidation_price: newLiqPrice,
            }).catch(() => {});
        }

        const msg = marginDelta > 0
            ? `Leverage → ${newLeverage}x · $${formatMoney(marginDelta)} margin locked`
            : `Leverage → ${newLeverage}x · $${formatMoney(Math.abs(marginDelta))} freed`;
        setToast({ message: msg, type: 'SUCCESS' });
        playSound('OPEN');
    };

    const executeTrade = (pairId: string, side: any, size: number, leverage: number, price: number, marginMode: MarginMode, tp?: number, sl?: number) => {
        const now = Date.now();
        if (now - tradeLock.current < 1000) return;
        tradeLock.current = now;

        // Block profileCh from overwriting our optimistic balance update.
        // syncUserFinancials fires shortly after setUser() and the profileCh
        // realtime event would bounce back and double-apply the delta.
        pendingTradeOps.current += 1;
        setTimeout(() => { pendingTradeOps.current = Math.max(0, pendingTradeOps.current - 1); }, 8000);

        const currentPositions = positionsRef.current;
        const existingPosition = currentPositions.find(p => p.pair === pairId && !p.isCopyTrade);
        const uniqueId = uuidv4();

        // Use the memo-derived buyingPower (computed from latest user.balance + cross-margin PnL)
        // so this function always sees fresh values even inside a stale closure.
        const maintenanceMargin = 0.005;

        if (existingPosition) {
            if (size === 0 && existingPosition.side === side) {
                // Leverage-only update — must correctly adjust margin locked/freed.
                // marginDelta > 0: leverage reduced (more margin needed → deduct from balance)
                // marginDelta < 0: leverage increased (less margin needed → return to balance)
                const oldMargin = existingPosition.size / existingPosition.leverage;
                const newMarginNeeded = existingPosition.size / leverage;
                const marginDelta = newMarginNeeded - oldMargin;
                if (marginDelta > 0 && buyingPower < marginDelta) {
                    setToast({ message: 'Insufficient balance to reduce leverage — need $' + marginDelta.toFixed(2) + ' more margin', type: 'ERROR' });
                    playSound('ERROR');
                    return;
                }
                const newLiqPrice = side === 'LONG'
                    ? existingPosition.entryPrice * (1 - (1/leverage) + maintenanceMargin)
                    : existingPosition.entryPrice * (1 + (1/leverage) - maintenanceMargin);
                const updated = { ...existingPosition, leverage, liquidationPrice: newLiqPrice };
                setPositions(prev => prev.map(p => p.id === existingPosition.id ? updated : p));
                setUser(prev => prev ? { ...prev, balance: orderly.isReady ? prev.balance : prev.balance - marginDelta } : null);
                if (isSupabaseConfigured() && user) updatePositionInDB(existingPosition.id, { leverage, liquidation_price: newLiqPrice }).catch(() => {});
                const msg = marginDelta > 0
                    ? 'Leverage reduced to ' + leverage + 'x — $' + marginDelta.toFixed(2) + ' margin locked'
                    : 'Leverage increased to ' + leverage + 'x — $' + Math.abs(marginDelta).toFixed(2) + ' margin freed';
                setToast({ message: msg, type: 'SUCCESS' }); playSound('OPEN');
                return;
            }
            if (existingPosition.side === side) {
                // Merge into existing position
                const totalSize = existingPosition.size + size;
                const newEntryPrice = ((existingPosition.size * existingPosition.entryPrice) + (size * price)) / totalSize;
                const newLiqPrice = side === 'LONG'
                    ? newEntryPrice * (1 - (1/leverage) + maintenanceMargin)
                    : newEntryPrice * (1 + (1/leverage) - maintenanceMargin);
                const oldMargin = existingPosition.size / existingPosition.leverage;
                const newMargin = totalSize / leverage;
                const marginDelta = newMargin - oldMargin;
                if (marginDelta > 0 && buyingPower < marginDelta) {
                    setToast({message:'Insufficient buying power', type:'ERROR'}); playSound('ERROR'); return;
                }
                const updatedPos: Position = {
                    ...existingPosition, size: totalSize, entryPrice: newEntryPrice,
                    liquidationPrice: newLiqPrice, leverage, marginMode,
                    takeProfit: tp || existingPosition.takeProfit,
                    stopLoss: sl || existingPosition.stopLoss,
                };
                setPositions(prev => prev.map(p => p.id === existingPosition.id ? updatedPos : p));
                const addOpenHistory: TradeHistoryItem = { id: `trade_${uniqueId}`, pair: pairId, side, entryPrice: price, exitPrice: 0, size, pnl: 0, timestamp: Date.now(), action: 'OPEN', leverage, marginMode, positionId: existingPosition.id };
                setUser(prev => prev ? {
                    ...prev,
                    // When Orderly holds real funds, don't touch local sim balance — it would go negative.
                    balance: orderly.isReady ? prev.balance : prev.balance - marginDelta,
                    tradeHistory: [addOpenHistory, ...prev.tradeHistory]
                } : null);
                // Persist
                if (isSupabaseConfigured() && user) {
                    updatePositionInDB(existingPosition.id, {
                        size: totalSize, entry_price: newEntryPrice, liquidation_price: newLiqPrice,
                        leverage, margin_mode: marginMode,
                        take_profit: tp || existingPosition.takeProfit || null,
                        stop_loss: sl || existingPosition.stopLoss || null,
                    }).catch(() => {});
                    // Persist the OPEN event so it appears in Recent Activity and the
                    // History tab after page reload / on other devices.
                    insertTradeHistory(user.id, addOpenHistory).catch(e => console.warn("[velo] insertTradeHistory (add) failed:", e));
                }
                setToast({message:'Position Updated', type:'SUCCESS'}); playSound('OPEN');
                triggerAnim('ORDER_OPEN', `${pairId} · ${side}`, `$${formatMoney(size)} @ $${formatPrice(price)}`);
                // Update TP/SL orders
                if (tp || sl) {
                    setOpenOrders(prev => {
                        const filtered = prev.filter(o => o.relatedPositionId !== existingPosition.id);
                        const closeSide = side === 'LONG' ? 'SHORT' : 'LONG';
                        const newOrds: OpenOrder[] = [];
                        if (tp) newOrds.push({ id: `ord_tp_${existingPosition.id}_${uniqueId}`, pair: pairId, side: closeSide, type: 'TAKE_PROFIT', price: tp, size: totalSize, leverage, timestamp: Date.now(), relatedPositionId: existingPosition.id });
                        if (sl) newOrds.push({ id: `ord_sl_${existingPosition.id}_${uniqueId}`, pair: pairId, side: closeSide, type: 'STOP_LOSS', price: sl, size: totalSize, leverage, timestamp: Date.now(), relatedPositionId: existingPosition.id });
                        if (isSupabaseConfigured() && user) {
                            deleteOrdersForPosition(existingPosition.id).then(() => newOrds.forEach(o => saveOpenOrder(user.id, o))).catch(() => {});
                        }
                        return [...filtered, ...newOrds];
                    });
                }
            } else {
                // Netting / Close / Flip
                const closeSize = Math.min(existingPosition.size, size);
                const pnl = (price - existingPosition.entryPrice) * (existingPosition.side === 'LONG' ? 1 : -1) * (closeSize / existingPosition.entryPrice);
                const marginReturned = closeSize / existingPosition.leverage;
                const closeHistory: TradeHistoryItem = { id: `trade_${uniqueId}`, pair: pairId, side: existingPosition.side, entryPrice: existingPosition.entryPrice, exitPrice: price, size: closeSize, pnl, timestamp: Date.now(), action: 'CLOSE' };

                setUser(prev => prev ? {
                    ...prev,
                    balance: prev.balance + marginReturned + pnl - (size > existingPosition.size ? (size - existingPosition.size)/leverage : 0),
                    realizedPnL: prev.realizedPnL + pnl,
                    tradeHistory: [closeHistory, ...prev.tradeHistory]
                } : null);
                if (isSupabaseConfigured() && user) insertTradeHistory(user.id, closeHistory).catch(e => console.warn("[velo] insertTradeHistory failed:", e));

                triggerAnim('ORDER_CLOSE', `${pairId}`, `${existingPosition.side === 'LONG' ? 'SELL' : 'BUY'} · $${formatMoney(closeSize)} @ $${formatPrice(price)}`);

                if (size < existingPosition.size) {
                    // Partial close
                    const updatedPos = { ...existingPosition, size: existingPosition.size - size };
                    setPositions(prev => prev.map(p => p.id === existingPosition.id ? updatedPos : p));
                    if (isSupabaseConfigured() && user) updatePositionInDB(existingPosition.id, { size: updatedPos.size }).catch(() => {});
                    setToast({message:'Position Reduced', type:'INFO'}); playSound('CLOSE');
                } else if (size === existingPosition.size) {
                    // Full close
                    setPositions(prev => prev.filter(p => p.id !== existingPosition.id));
                    setOpenOrders(prev => prev.filter(o => o.relatedPositionId !== existingPosition.id));
                    if (isSupabaseConfigured() && user) {
                        ownDeletedPositionIds.current.add(existingPosition.id);
                        setTimeout(() => ownDeletedPositionIds.current.delete(existingPosition.id), 15000);
                        supabaseDeletePosition(existingPosition.id).catch(() => {});
                        deleteOrdersForPosition(existingPosition.id).catch(() => {});
                    }
                    setToast({message:'Position Closed', type:'INFO'}); playSound('CLOSE');
                } else {
                    // Flip: close old, open new
                    const remainingSize = size - existingPosition.size;
                    const newPos: Position = {
                        id: `pos_${uniqueId}`, pair: pairId, side, entryPrice: price,
                        size: remainingSize, leverage, marginMode,
                        liquidationPrice: side === 'LONG' ? price * (1 - (1/leverage) + maintenanceMargin) : price * (1 + (1/leverage) - maintenanceMargin),
                        takeProfit: tp, stopLoss: sl, timestamp: Date.now(),
                    };
                    setPositions(prev => [newPos, ...prev.filter(p => p.id !== existingPosition.id)]);
                    setOpenOrders(prev => prev.filter(o => o.relatedPositionId !== existingPosition.id));
                    const flipHistory: TradeHistoryItem = { id: `trade_flip_${uniqueId}`, pair: pairId, side, entryPrice: price, exitPrice: 0, size: remainingSize, pnl: 0, timestamp: Date.now(), action: 'OPEN', leverage, marginMode, positionId: newPos.id };
                    setUser(prev => prev ? { ...prev, tradeHistory: [flipHistory, ...prev.tradeHistory] } : null);
                    if (isSupabaseConfigured() && user) {
                        // Register old position delete + new position insert to avoid realtime double-credit/duplicate
                        ownDeletedPositionIds.current.add(existingPosition.id);
                        setTimeout(() => ownDeletedPositionIds.current.delete(existingPosition.id), 15000);
                        supabaseDeletePosition(existingPosition.id).catch(() => {});
                        deleteOrdersForPosition(existingPosition.id).catch(() => {});
                        const capturedFlipUser = user;
                        savePosition(capturedFlipUser.id, newPos).then(dbId => {
                            if (!dbId) return;
                            ownSavedPositionIds.current.add(dbId);
                            setTimeout(() => ownSavedPositionIds.current.delete(dbId), 15000);
                            setPositions(prev => prev.map(p => p.id === newPos.id ? { ...p, id: dbId } : p));
                            setUser(prev => prev ? {
                                ...prev,
                                tradeHistory: prev.tradeHistory.map(t =>
                                    t.positionId === newPos.id ? { ...t, positionId: dbId } : t
                                )
                            } : null);
                        }).catch(() => {});
                        // Persist the flip OPEN event so it appears in Recent Activity / History.
                        insertTradeHistory(user.id, flipHistory).catch(e => console.warn("[velo] insertTradeHistory (flip) failed:", e));
                    }
                    setToast({message:'Position Flipped', type:'SUCCESS'}); playSound('OPEN');
                    triggerAnim('ORDER_OPEN', `${pairId} · ${side}`, `$${formatMoney(remainingSize)} @ $${formatPrice(price)}`);
                    const closeSide = side === 'LONG' ? 'SHORT' : 'LONG';
                    const newOrds: OpenOrder[] = [];
                    if (tp) newOrds.push({ id: `ord_tp_${newPos.id}_${uniqueId}`, pair: pairId, side: closeSide, type: 'TAKE_PROFIT', price: tp, size: remainingSize, leverage, timestamp: Date.now(), relatedPositionId: newPos.id });
                    if (sl) newOrds.push({ id: `ord_sl_${newPos.id}_${uniqueId}`, pair: pairId, side: closeSide, type: 'STOP_LOSS', price: sl, size: remainingSize, leverage, timestamp: Date.now(), relatedPositionId: newPos.id });
                    if (newOrds.length > 0) {
                        setOpenOrders(prev => [...prev, ...newOrds]);
                        if (isSupabaseConfigured() && user) newOrds.forEach(o => saveOpenOrder(user.id, o).catch(() => {}));
                    }
                }
            }
        } else {
            // Brand new position
            const marginRequired = size / leverage;
            if (buyingPower < marginRequired) {
                setToast({message:'Insufficient buying power', type:'ERROR'}); playSound('ERROR'); return;
            }
            const newLiqPrice = side === 'LONG'
                ? price * (1 - (1/leverage) + maintenanceMargin)
                : price * (1 + (1/leverage) - maintenanceMargin);
            const newPos: Position = {
                id: `pos_${uniqueId}`, pair: pairId, side, entryPrice: price,
                size, leverage, marginMode, liquidationPrice: newLiqPrice,
                takeProfit: tp, stopLoss: sl, timestamp: Date.now(),
            };
            setPositions(prev => {
                const existingIds = new Set(prev.map(p => p.id));
                if (existingIds.has(newPos.id)) return prev;
                if (prev.some(p => p.pair === newPos.pair && p.side === newPos.side && Math.abs(p.timestamp - newPos.timestamp) < 1000)) return prev;
                return [newPos, ...prev];
            });
            const openHistory: TradeHistoryItem = { id: `trade_${uniqueId}`, pair: pairId, side, entryPrice: price, exitPrice: 0, size, pnl: 0, timestamp: Date.now(), action: 'OPEN', leverage, marginMode, positionId: newPos.id };
            setUser(prev => prev ? {
                ...prev,
                // Only deduct from local sim balance if Orderly is NOT managing real funds.
                // When Orderly is live, margin is held on-chain — touching user.balance here
                // would corrupt the display (drive it negative).
                balance: orderly.isReady ? prev.balance : prev.balance - marginRequired,
                tradeHistory: [openHistory, ...prev.tradeHistory]
            } : null);
            // Persist to Supabase — capture the real DB UUID and update local state with it
            if (isSupabaseConfigured() && user) {
                const capturedUser = user;
                savePosition(capturedUser.id, newPos).then(dbId => {
                    if (!dbId) { console.error('[velo] savePosition returned null — position not saved'); return; }
                    // Register this DB UUID as ours so the realtime onInsert subscriber
                    // skips it — otherwise it would insert a duplicate position into
                    // local state (since the temp id was already replaced by the time
                    // the realtime event arrives, the old dedup guard would miss it).
                    ownSavedPositionIds.current.add(dbId);
                    setTimeout(() => ownSavedPositionIds.current.delete(dbId), 15000);
                    // Replace the local pos_xxx id with the real Supabase UUID
                    setPositions(prev => prev.map(p => p.id === newPos.id ? { ...p, id: dbId } : p));
                    // Also update the positionId in the matching OPEN history entry
                    setUser(prev => prev ? {
                        ...prev,
                        tradeHistory: prev.tradeHistory.map(t =>
                            t.positionId === newPos.id ? { ...t, positionId: dbId } : t
                        )
                    } : null);
                    // Save TP/SL orders referencing the real DB position id
                    const closeSide2 = side === 'LONG' ? 'SHORT' : 'LONG';
                    const dbOrds: OpenOrder[] = [];
                    if (tp) dbOrds.push({ id: `ord_tp_${dbId}`, pair: pairId, side: closeSide2, type: 'TAKE_PROFIT', price: tp, size, leverage, timestamp: Date.now(), relatedPositionId: dbId });
                    if (sl) dbOrds.push({ id: `ord_sl_${dbId}`, pair: pairId, side: closeSide2, type: 'STOP_LOSS', price: sl, size, leverage, timestamp: Date.now(), relatedPositionId: dbId });
                    if (dbOrds.length > 0) {
                        setOpenOrders(prev => {
                            // Replace temp orders with DB-id-linked orders
                            const filtered = prev.filter(o => o.relatedPositionId !== newPos.id);
                            return [...filtered, ...dbOrds];
                        });
                        dbOrds.forEach(o => saveOpenOrder(capturedUser.id, o).catch(e => console.error('[velo] saveOpenOrder error:', e)));
                    }
                }).catch(e => console.error('[velo] savePosition threw:', e));
                // Persist the OPEN event so it appears in Recent Activity / History.
                insertTradeHistory(capturedUser.id, openHistory).catch(e => console.warn("[velo] insertTradeHistory (new) failed:", e));
            }
            setToast({message:'Market Order Filled', type:'SUCCESS'}); playSound('OPEN');
            triggerAnim('ORDER_OPEN', `${pairId} · ${side}`, `$${formatMoney(size)} @ $${formatPrice(price)}`);
            // Add local temp orders immediately for UI (will be replaced with DB-id versions above)
            const closeSide = side === 'LONG' ? 'SHORT' : 'LONG';
            const newOrds: OpenOrder[] = [];
            if (tp) newOrds.push({ id: `ord_tp_${newPos.id}_${uniqueId}`, pair: pairId, side: closeSide, type: 'TAKE_PROFIT', price: tp, size, leverage, timestamp: Date.now(), relatedPositionId: newPos.id });
            if (sl) newOrds.push({ id: `ord_sl_${newPos.id}_${uniqueId}`, pair: pairId, side: closeSide, type: 'STOP_LOSS', price: sl, size, leverage, timestamp: Date.now(), relatedPositionId: newPos.id });
            if (newOrds.length > 0) {
                setOpenOrders(prev => [...prev, ...newOrds]);
            }
        }
    };

    const handleOpenPosition = (pairId: string, side: any, size: number, leverage: number, type: OrderType, price: number, tp?: number, sl?: number, marginMode: MarginMode = 'ISOLATED') => {
        if(!user) return openAppKitModal();

        const existingPosition = positions.find(p => p.pair === pairId && !p.isCopyTrade);

        if (type === 'MARKET') {
            const currentPrice = marketPrices[pairId];

            // ── Pure leverage-only change (size=0, same side) ──────────────────
            // Demo / non-live only. On VeloPerps the contract has no setLeverage
            // — leverage is fixed at openPosition time. A local-only update would
            // diverge from on-chain state on the next 5s poll. If the user wants
            // a different leverage they should open a new position at it.
            if (!isLiveMode && size === 0 && existingPosition && existingPosition.side === side) {
                if (existingPosition.leverage === leverage) return; // already at this lever — no-op
                executeLeverageUpdate(pairId, side, leverage, currentPrice, marginMode, existingPosition);
                return;
            }

            // ── New order with mismatched leverage → show confirmation modal ──
            // Only on demo / non-live mode. VeloPerps tracks each open as its
            // own tradeId, so "open at 20x while a 10x exists" just opens a
            // second position — there's nothing to confirm. The legacy modal
            // existed for Orderly's netting model where changing leverage
            // re-priced and reallocated the single net position.
            if (!isLiveMode && existingPosition && existingPosition.side === side && existingPosition.leverage !== leverage) {
                setPendingTrade({ pairId, side, size, leverage, type, price, tp, sl, marginMode });
                setLeverageModalOpen(true);
                return;
            }

            if(isProcessing.current) return;
            isProcessing.current = true;
            // Note: we do NOT release the lock on a fixed timer here. The
            // Orderly placeOrderlyTrade round-trip takes 2-5 seconds and the
            // old 500ms timer was releasing the lock mid-flight, letting a
            // second click fire a second order while the first was still
            // pending — this was the root cause of the "two positions per
            // trade" bug. The lock is released in every terminal branch
            // below (success, failure, simulation, validation reject).
            const releaseLock = () => { isProcessing.current = false; };

            // ── On-chain route via VeloPerps (Phase 3) ────────────────────
            // In live mode (wallet user), trades go through the VeloPerps contract.
            // No simulation fallback — that would create phantom positions that
            // vanish on next poll and corrupt the equity display.
            if (isLiveMode) {
              // Resolve UI pair (e.g. "BTC/USD") to Velo pair label ("BTC-USD")
              const veloPair = uiPairToVeloPair(pairId);
              if (!veloPair) {
                setToast({ message: `${pairId} is not yet listed on Velo Perps. Available: BTC, ETH, SOL, AVAX, LINK, DOGE.`, type: 'INFO' });
                releaseLock();
                return;
              }
              if (size <= 0) { releaseLock(); return; }

              // The TradeView form sends `size` as the notional (collateral × leverage).
              // VeloPerps wants collateral. Derive it.
              const collateral = size / leverage;
              if (collateral < 1) {
                setToast({ message: 'Minimum collateral is $1. Increase position size.', type: 'ERROR' });
                releaseLock();
                return;
              }
              // Balance gating: for both ISOLATED and CROSS, collateral comes
              // from the wallet mUSDC. The service auto-deposits to the cross
              // ledger if needed — the user never has to do it manually.
              if (veloPerpsTrading.usdcBalance <= 0) {
                setToast({ message: 'No mUSDC in your wallet. Claim from the faucet first.', type: 'ERROR' });
                setVeloWelcomeOpen(true);
                releaseLock();
                return;
              }
              if (collateral > veloPerpsTrading.usdcBalance) {
                setToast({ message: 'Insufficient mUSDC for this collateral. Reduce size or claim more.', type: 'ERROR' });
                releaseLock();
                return;
              }

              // ── Isolated margin: every market open is its own position ──────
              // VeloPerps stores each open under a new tradeId. Opening another
              // SOL position must NOT fold collateral into an existing one — in
              // isolated mode they are independent positions with their own
              // entry, leverage, and liquidation price. (Stacking via addMargin
              // is exposed separately through the Manage Position modal.)

              veloPerpsTrading.openPosition({
                pair: veloPair,
                isLong: side === 'LONG',
                collateralUSDC: collateral,
                leverage,
                marginMode,
              }).then((result) => {
                // The 5s poll inside useVeloPerpsTrading will pick up the new position
                // and our sync effect will mirror it into local state. We don't call
                // executeTrade here — that would create a duplicate local-only row
                // that the sync would never reconcile with the on-chain position.

                // Write the OPEN row to trade history so Recent Activity reflects it.
                // (Position list is sourced from the contract via the sync effect;
                // trade history is a separate append-only log of actions taken.)
                const openHistory: TradeHistoryItem = {
                    id: `open_velo_${result.tradeId.toString()}`,
                    pair: pairId,
                    side,
                    entryPrice: result.entryPrice,
                    exitPrice: 0,
                    size,
                    pnl: 0,
                    timestamp: Date.now(),
                    openedAt: Date.now(),
                    leverage,
                    marginMode,
                    liquidationPrice: side === 'LONG'
                      ? result.entryPrice * (1 - 0.9 / leverage)
                      : result.entryPrice * (1 + 0.9 / leverage),
                    action: 'OPEN',
                    onChain: true,
                    orderlyOrderId: undefined,
                    orderlyOrderUrl: result.explorerUrl,
                } as any;
                setUser(prev => prev ? {
                    ...prev,
                    tradeHistory: [openHistory, ...prev.tradeHistory],
                } : prev);
                if (isSupabaseConfigured() && user) {
                    insertTradeHistory(user.id, openHistory).catch(e => console.warn("[velo] insertTradeHistory failed:", e));
                }

                setToast({
                  message: `${side} ${pairId.replace('/USD', '')} @ ${leverage}× opened`,
                  type: 'SUCCESS',
                });
                triggerAnim('ORDER_OPEN', `${pairId} · ${side}`, `${leverage}× · $${formatMoney(size)} @ $${formatPrice(result.entryPrice)}`);
                playSound('CLICK');
                releaseLock();

                // Persist the open tx hash keyed by tradeId so the position details
                // modal can link to the exact opening transaction even after reload.
                // (The contract position sync doesn't carry the tx hash.)
                try {
                  const m = JSON.parse(localStorage.getItem('velo_open_tx') || '{}');
                  m[result.tradeId.toString()] = (result as any).txHash || (result as any).explorerUrl;
                  localStorage.setItem('velo_open_tx', JSON.stringify(m));
                } catch {}

                // ── Attach TP/SL on-chain via setTriggers ─────────────────────
                // The order form lets the user set TP/SL at open time. The contract's
                // openPosition() doesn't accept triggers as args, so we set them in a
                // follow-up tx. While the tx is in flight we paint TP/SL onto the
                // local position via the pendingTriggers ref (the sync effect overlays
                // it) — otherwise the user opens with TP=85 and sees `- / -` until the
                // next 5s poll picks up the actual value, by which time they think it
                // didn't work and close the position.
                // Validate TP/SL against the ACTUAL fill entry (result.entryPrice),
                // not the price shown when the user clicked. A market order fills at
                // the live oracle price, so a TP/SL chosen pre-fill can land on the
                // wrong side of the real entry — the contract's setTriggers then
                // reverts InvalidTrigger (TP must be above entry for a long, etc.)
                // and the trigger silently never persists, so the keeper has nothing
                // to act on. We catch that here, skip the invalid side, and tell the
                // user exactly what happened instead of painting a TP that isn't real.
                const fillEntry = (result as any).entryPrice ?? currentPrice;
                const wantTp = typeof tp === 'number' && tp > 0;
                const wantSl = typeof sl === 'number' && sl > 0;
                const tpValid = wantTp && (side === 'LONG' ? (tp as number) > fillEntry : (tp as number) < fillEntry);
                const slValid = wantSl && (side === 'LONG' ? (sl as number) < fillEntry : (sl as number) > fillEntry);
                const skippedTrig: string[] = [];
                if (wantTp && !tpValid) skippedTrig.push(`TP $${formatPrice(tp as number)} (${side === 'LONG' ? 'must be above' : 'must be below'} entry)`);
                if (wantSl && !slValid) skippedTrig.push(`SL $${formatPrice(sl as number)} (${side === 'LONG' ? 'must be below' : 'must be above'} entry)`);
                if (skippedTrig.length) {
                  setToast({ message: `Filled at $${formatPrice(fillEntry)}. Not set: ${skippedTrig.join(' · ')}. Adjust from the position panel.`, type: 'INFO' });
                }
                const hasTp = tpValid;
                const hasSl = slValid;
                if (hasTp || hasSl) {
                  const tradeIdKey = result.tradeId.toString();
                  const newPosId = `velo_${tradeIdKey}`;
                  // 1. Optimistic overlay onto the position (right-side panel,
                  //    Manage modal, position row TP/SL column).
                  pendingTriggers.current.set(tradeIdKey, {
                    takeProfit: hasTp ? tp : undefined,
                    stopLoss:   hasSl ? sl : undefined,
                  });
                  // Force a re-render so the overlay paints immediately even
                  // before the next poll. Using setPositions with the same
                  // shape would no-op; instead, nudge state through a tiny
                  // mutation that React will pick up.
                  setPositions((prev: any[]) => prev.map((p: any) =>
                    p.id === newPosId
                      ? { ...p, takeProfit: hasTp ? tp : p.takeProfit, stopLoss: hasSl ? sl : p.stopLoss }
                      : p
                  ));
                  // 2. Optimistic synthetic TP/SL rows in Open Orders so the
                  //    user can see and cancel them. These are local-only —
                  //    the contract stores TP/SL on the position struct, not
                  //    as separate orders — so the sync effect (which only
                  //    filters keys starting with `velo_ord_`) leaves them alone.
                  setOpenOrders((prevOrders: any[]) => {
                    const filtered = prevOrders.filter((o: any) => o.relatedPositionId !== newPosId);
                    const closeSide = side === 'LONG' ? 'SHORT' : 'LONG';
                    const newOrds: any[] = [];
                    if (hasTp) newOrds.push({
                      id: `ord_tp_${newPosId}_${Date.now()}`,
                      pair: pairId, side: closeSide, type: 'TAKE_PROFIT',
                      price: tp, size, leverage,
                      timestamp: Date.now(), relatedPositionId: newPosId,
                    });
                    if (hasSl) newOrds.push({
                      id: `ord_sl_${newPosId}_${Date.now()}`,
                      pair: pairId, side: closeSide, type: 'STOP_LOSS',
                      price: sl, size, leverage,
                      timestamp: Date.now(), relatedPositionId: newPosId,
                    });
                    return [...filtered, ...newOrds];
                  });
                  // 3. Fire the on-chain setTriggers tx. Pass 0 for the unset
                  //    side so the contract leaves it cleared. On success,
                  //    refresh immediately (instead of waiting for the 5s
                  //    poll) so the contract-confirmed TP/SL replaces the
                  //    optimistic overlay ASAP.
                  veloPerpsTrading.setTriggers(
                    result.tradeId,
                    hasTp ? tp : 0,
                    hasSl ? sl : 0,
                  ).then(async () => {
                    setToast({
                      message: `Triggers set on-chain · ${hasTp ? `TP $${formatPrice(tp!)}` : ''}${hasTp && hasSl ? ' · ' : ''}${hasSl ? `SL $${formatPrice(sl!)}` : ''}`,
                      type: 'SUCCESS',
                    });
                    // Force a refresh so the contract-confirmed values flow in
                    // and replace the optimistic overlay. The sync effect's
                    // pending-vs-contract check then clears the ref entry.
                    try { await veloPerpsTrading.refresh(); } catch {}
                  }).catch((e: any) => {
                    const msg = e?.shortMessage || e?.message || 'setTriggers failed';
                    console.error('[velo] setTriggers failed:', e);
                    setToast({ message: `Triggers failed: ${msg}`, type: 'ERROR' });
                    // Roll back: clear the pending overlay AND the synthetic
                    // openOrders rows so the user sees the truth (no TP/SL set).
                    pendingTriggers.current.delete(tradeIdKey);
                    setPositions((prev: any[]) => prev.map((p: any) =>
                      p.id === newPosId ? { ...p, takeProfit: undefined, stopLoss: undefined } : p
                    ));
                    setOpenOrders((prevOrders: any[]) =>
                      prevOrders.filter((o: any) => o.relatedPositionId !== newPosId)
                    );
                  });
                }
              }).catch((e) => {
                const msg = e?.shortMessage || e?.message || 'Order failed';
                setToast({ message: `Order failed: ${msg}`, type: 'ERROR' });
                releaseLock();
              });
              return;
            }

            // ── Demo mode (no wallet) — pure simulation ───────────────────────────
            releaseLock();
            executeTrade(pairId, side, size, leverage, currentPrice, marginMode, tp, sl);
        } else {
            // ── LIMIT / STOP conditional order ──────────────────────────────
            // On-chain (wallet user, V3): submit placeConditionalOrder so the
            // keeper can execute it on-chain when price crosses the trigger.
            // Off-chain (demo / non-V3): persist locally so the simulator can
            // fire it when the local price stream crosses the trigger.

            if (isWalletConnected && veloPerpsTrading.isReady && veloPerpsTrading.isV3) {
              const veloPair = uiPairToVeloPair(pairId);
              if (!veloPair) {
                setToast({ message: `${pairId} is not yet listed on Velo Perps.`, type: 'INFO' });
                return;
              }
              const collateral = size / leverage;
              if (collateral < 1) {
                setToast({ message: 'Minimum collateral is $1.', type: 'ERROR' });
                return;
              }
              // Both ISOLATED and CROSS pull from wallet mUSDC — the service
              // auto-deposits to the cross ledger when needed.
              if (collateral > veloPerpsTrading.usdcBalance) {
                setToast({ message: 'Insufficient mUSDC for this collateral.', type: 'ERROR' });
                return;
              }
              const triggerKind = type === 'LIMIT' ? 'LIMIT' : 'STOP';
              veloPerpsTrading.placeConditionalOrder({
                pair: veloPair,
                isLong: side === 'LONG',
                leverage,
                marginMode,
                triggerKind,
                triggerPrice: price,
                collateralUSDC: collateral,
                reduceOnly: false,
              }).then((r) => {
                // Optimistic local echo: the sync effect mirrors veloPerpsTrading.conditionalOrders
                // into openOrders, but that runs on the next refresh tick. Insert the order
                // locally now so the Open Orders tab updates the instant the tx mines.
                // The sync effect uses the same `velo_ord_<id>` key, so it will dedupe.
                const optimistic: OpenOrder = {
                  id: `velo_ord_${r.orderId.toString()}`,
                  pair: pairId,
                  side,
                  type,
                  price,
                  size,
                  leverage,
                  timestamp: Date.now(),
                  onChain: true,
                  orderlyOrderUrl: r.explorerUrl,
                } as OpenOrder;
                setOpenOrders((prev) => {
                  if (prev.some((o) => o.id === optimistic.id)) return prev;
                  return [...prev, optimistic];
                });
                setToast({ message: `${type} order placed on-chain (#${r.orderId.toString()})`, type: 'SUCCESS' });
                playSound('CLICK');
              }).catch((e) => {
                const msg = e?.shortMessage || e?.message || 'Order placement failed';
                setToast({ message: `Order failed: ${msg}`, type: 'ERROR' });
              });
              return;
            }

            // ── Off-chain order persistence (demo / non-V3) ─────────────────
            // Margin is NOT deducted until the order fills.
            const uniqueSuffix = uuidv4();
            const newOrder: OpenOrder = { id: `ord_${Date.now()}_${uniqueSuffix}`, pair: pairId, side, type, price, size, leverage, timestamp: Date.now() };
            setOpenOrders(prev => [...prev, newOrder]);
            if (isSupabaseConfigured()) saveOpenOrder(user.id, newOrder).catch(() => {});
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
        if (now - tradeLock.current < 500) return;
        tradeLock.current = now;
        if (processingIds.current.has(id)) return;
        const p = positionsRef.current.find(x => x.id === id);
        if (!p || !user) return;

        // Close = instant 100% market close. The Manage modal (partial close,
        // add margin, TP/SL edit) is still reachable via the Edit/Manage
        // button which calls handleEditPosition. Stan's preference: one click
        // on the dashboard or on the position row closes the full position
        // immediately at market — no extra confirmation step.
        //
        // (The V2 on-chain branch below already calls
        // veloPerpsTrading.closePosition which is a 100% market close on the
        // contract; the partial-close UX lives in the Manage modal's PARTIAL
        // tab, reached separately via the Edit button.)

        processingIds.current.add(id);

        // Block profileCh from overwriting our optimistic balance update
        pendingTradeOps.current += 1;
        setTimeout(() => { pendingTradeOps.current = Math.max(0, pendingTradeOps.current - 1); }, 8000);

        const price = marketPrices[p.pair] || p.entryPrice;
        // PnL = price movement in the direction of the trade, scaled by position size in base units
        const pnl = (price - p.entryPrice) * (p.side === 'LONG' ? 1 : -1) * (p.size / p.entryPrice);
        // Margin that was locked when opening this position
        const marginReturned = p.size / p.leverage;
        const isOnChainClose = (p as any).onChain && p.id.startsWith('velo_');

        // ── Live (on-chain) close via VeloPerps (Phase 3) ─────────────────────
        // The position id format is `velo_<tradeId>` — extract the tradeId and
        // call closePosition. The 5s polling loop + sync effect will remove the
        // position from local state once the close is mined. We optimistically
        // remove it here for snappier UX; restore on failure.
        if (isOnChainClose) {
            const tradeIdStr = p.id.slice('velo_'.length);
            const tradeId = BigInt(tradeIdStr);
            const veloPair = uiPairToVeloPair(p.pair);
            if (!veloPair) {
                setToast({ message: `Unable to close: ${p.pair} not recognised on Velo Perps.`, type: 'ERROR' });
                processingIds.current.delete(id);
                return;
            }

            // Optimistic local removal — sync effect will reconcile from contract.
            setPositions(prev => prev.filter(x => x.id !== id));
            setOpenOrders(prev => prev.filter(o => o.relatedPositionId !== id));
            // Claim this tradeId so the keeper-detection fallback effect won't
            // also write a (duplicate) close-history row for the same close.
            markVeloTradeClosed(tradeIdStr);

            veloPerpsTrading.closePosition(tradeId, veloPair).then((result) => {
                const enrichedClose: TradeHistoryItem = {
                    id: `close_${id}`,
                    pair: p.pair,
                    side: p.side,
                    entryPrice: p.entryPrice,
                    exitPrice: result.exitPrice,
                    size: p.size,
                    pnl: result.pnlUSDC,
                    timestamp: Date.now(),
                    openedAt: p.timestamp,
                    leverage: p.leverage,
                    marginMode: p.marginMode,
                    liquidationPrice: p.liquidationPrice,
                    action: 'CLOSE',
                    copyTraderId: p.copyTraderId,
                    onChain: true,
                    orderlyOrderId:  undefined,
                    orderlyOrderUrl: result.explorerUrl,
                } as any;
                if (isSupabaseConfigured() && user) {
                    insertTradeHistory(user.id, enrichedClose).catch(e => console.warn("[velo] insertTradeHistory failed:", e));
                    ownDeletedPositionIds.current.add(id);
                    setTimeout(() => ownDeletedPositionIds.current.delete(id), 15000);
                    supabaseDeletePosition(id).catch(() => {});
                    deleteOrdersForPosition(id).catch(() => {});
                }
                setUser(prev => {
                    if (!prev) return prev;
                    if (prev.tradeHistory.some(h => h.id === enrichedClose.id)) return prev;
                    const newPnlEntry = {
                        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        value: veloPerpsTrading.usdcBalance + result.pnlUSDC,
                        timestamp: Date.now(),
                    };
                    return {
                        ...prev,
                        realizedPnL:  prev.realizedPnL + result.pnlUSDC,
                        tradeHistory: [enrichedClose, ...prev.tradeHistory],
                        pnlHistory:   [...(prev.pnlHistory || []), newPnlEntry],
                    };
                });
                triggerAnim('ORDER_CLOSE', `${p.pair}`, `${p.side === 'LONG' ? 'SELL' : 'BUY'} · $${formatMoney(p.size)} · PnL $${result.pnlUSDC >= 0 ? '+' : ''}${result.pnlUSDC.toFixed(2)}`);
                setToast({ message: `Position closed · PnL ${result.pnlUSDC >= 0 ? '+' : ''}$${result.pnlUSDC.toFixed(2)}`, type: 'SUCCESS' });
                playSound('CLOSE');
                processingIds.current.delete(id);

                // Removed auto-popup share-to-feed prompt. Users complained about
                // too many modals after a close. Share to social via the explicit
                // share button on history rows.

                // NOTE: deliberately NOT auto-opening the share-card PNG modal here.
                // Users found too many modals popping up after a close. The share card
                // is now only opened by the explicit Share button on the position row
                // (for open positions) and on the history row (for closed ones).
            }).catch((e) => {
                const msg = e?.shortMessage || e?.message || 'Close failed';
                setToast({ message: `Close failed: ${msg}`, type: 'ERROR' });
                // Restore the position locally — contract still has it. The sync
                // effect will re-hydrate from the next poll anyway.
                setPositions(prev => prev.some(x => x.id === id) ? prev : [p, ...prev]);
                processingIds.current.delete(id);
            });
            return;
        }

        // ── Demo close (no Orderly position) ──────────────────────────────────
        const closeHistory: TradeHistoryItem = {
            id: `close_${id}`, pair: p.pair, side: p.side, entryPrice: p.entryPrice,
            exitPrice: price, size: p.size, pnl, timestamp: Date.now(),
            openedAt: p.timestamp, leverage: p.leverage, marginMode: p.marginMode,
            liquidationPrice: p.liquidationPrice, action: 'CLOSE', copyTraderId: p.copyTraderId,
        };
        setUser(prevUser => {
            if (!prevUser) return null;
            if (prevUser.tradeHistory.some(h => h.id === `close_${id}`)) return prevUser;
            const newBalance = prevUser.balance + marginReturned + pnl;
            const newPnlEntry = {
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                value: newBalance,
                timestamp: Date.now(),
            };
            return {
                ...prevUser,
                balance: Math.max(0, newBalance),
                realizedPnL: prevUser.realizedPnL + pnl,
                tradeHistory: [closeHistory, ...prevUser.tradeHistory],
                pnlHistory: [...(prevUser.pnlHistory || []), newPnlEntry],
            };
        });
        setPositions(prevPositions => prevPositions.filter(x => x.id !== id));
        setOpenOrders(prev => prev.filter(o => o.relatedPositionId !== id));

        if (isSupabaseConfigured()) {
            ownDeletedPositionIds.current.add(id);
            setTimeout(() => ownDeletedPositionIds.current.delete(id), 15000);
            supabaseDeletePosition(id).catch(() => {});
            deleteOrdersForPosition(id).catch(() => {});
            insertTradeHistory(user.id, closeHistory).catch(e => console.warn("[velo] insertTradeHistory failed:", e));
        }

        triggerAnim('ORDER_CLOSE', `${p.pair}`, `${p.side === 'LONG' ? 'SELL' : 'BUY'} · $${formatMoney(p.size)} · PnL $${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}`);
        setToast({message:'Position Closed', type:'INFO'});
        playSound('CLOSE');
        // Release processing lock after a short delay to prevent rapid double-close
        setTimeout(() => processingIds.current.delete(id), 1000);
        // Notify self on close with PnL summary
        if (isSupabaseConfigured() && user) {
            const pnlSign = pnl >= 0 ? '+' : '';
            createNotification(user.id, 'POSITION_CLOSED',
                `Position closed: ${p.pair} ${p.side} — ${pnlSign}$${pnl.toFixed(2)}`, id)
                .catch(() => {});
        }
    };
    const handleCancelOrder = (id: string) => {
        // On-chain conditional order? Route to V3 cancelConditionalOrder.
        if (id.startsWith('velo_ord_')) {
            const orderId = BigInt(id.slice('velo_ord_'.length));
            // Optimistically remove from UI; the 5s poll will reconcile.
            setOpenOrders(prev => prev.filter(o => o.id !== id));
            veloPerpsTrading.cancelConditionalOrder(orderId).then(() => {
                setToast({ message: 'Order cancelled on-chain', type: 'SUCCESS' });
                playSound('CLICK');
            }).catch((e) => {
                const msg = e?.shortMessage || e?.message || 'Cancel failed';
                setToast({ message: `Cancel failed: ${msg}`, type: 'ERROR' });
                // Force a refresh so the order reappears on failure.
                veloPerpsTrading.refresh().catch(() => {});
            });
            return;
        }

        setOpenOrders(prevOrders => {
            const order = prevOrders.find(o => o.id === id);
            if (!order) return prevOrders;
            if (order.copyTraderId) {
                setToast({ message: 'Cannot cancel copy trade orders', type: 'ERROR' });
                playSound('ERROR');
                return prevOrders;
            }

            const isTpSl = order.type === 'TAKE_PROFIT' || order.type === 'STOP_LOSS';

            // TP/SL orders don't lock margin — only regular limit/stop orders do
            if (!isTpSl) {
                setUser(prevUser => prevUser ? {...prevUser, balance: prevUser.balance + (order.size/order.leverage)} : null);
            }

            // If cancelling a TP/SL order, clear the corresponding field on the linked position
            if (isTpSl && order.relatedPositionId) {
                setPositions(prevPositions => prevPositions.map(p => {
                    if (p.id !== order.relatedPositionId) return p;
                    const patch: Partial<Position> = {};
                    if (order.type === 'TAKE_PROFIT') patch.takeProfit = undefined;
                    if (order.type === 'STOP_LOSS')   patch.stopLoss   = undefined;
                    const updated = { ...p, ...patch };
                    // Persist the cleared field to DB
                    if (isSupabaseConfigured()) {
                        updatePositionInDB(p.id, {
                            take_profit: order.type === 'TAKE_PROFIT' ? null : (p.takeProfit || null),
                            stop_loss:   order.type === 'STOP_LOSS'   ? null : (p.stopLoss   || null),
                        }).catch(() => {});
                    }
                    return updated;
                }));
            }

            if (isSupabaseConfigured()) deleteOpenOrder(id).catch(() => {});
            setToast({message:'Order Cancelled', type:'INFO'}); playSound('CLICK');
            return prevOrders.filter(o => o.id !== id);
        });
    };
    const handleFollow = async (id: string) => { 
        if(!user) return openAppKitModal();
        if(!walletAddress) { setToast({ message: 'Connect a crypto wallet to follow traders', type: 'INFO' }); return; }
        const isFollowing = user.following.includes(id);
        // Optimistic update: update current user's following list
        setUser(prev => prev ? {
            ...prev,
            following: isFollowing
                ? prev.following.filter(f => f !== id)
                : [...prev.following, id]
        } : null);
        // Optimistic update: update the target trader's followers list in traders state
        setTraders((prev: any[]) => prev.map((t: any) => {
            if (t.id !== id) return t;
            const currentFollowers: string[] = t.followers || [];
            const newFollowers = isFollowing
                ? currentFollowers.filter((f: string) => f !== user.id)
                : [...currentFollowers, user.id];
            return { ...t, followers: newFollowers };
        }));
        // Also update viewingProfile if it's the same trader
        setViewingProfile((prev: any) => {
            if (!prev || prev.id !== id) return prev;
            const currentFollowers: string[] = prev.followers || [];
            const newFollowers = isFollowing
                ? currentFollowers.filter((f: string) => f !== user.id)
                : [...currentFollowers, user.id];
            return { ...prev, followers: newFollowers };
        });
        playSound('CLICK');
        if (isSupabaseConfigured()) {
            try { 
                await supabaseFollow(user.id, id);
                // Notify the followed user (only on follow, not unfollow)
                if (!isFollowing) {
                    createNotification(id, 'FOLLOW', `${user.handle} started following you`, user.id)
                        .catch(e => console.warn('Follow notification failed:', e));
                }
                // Sync follower_count on the followed profile and following_count on current user
                const delta = isFollowing ? -1 : 1;
                const { data: targetProfile } = await supabase.from('profiles').select('follower_count').eq('id', id).single();
                if (targetProfile) {
                    supabase.from('profiles')
                        .update({ follower_count: Math.max(0, (targetProfile.follower_count || 0) + delta) })
                        .eq('id', id).then(() => {});
                }
                const { data: selfProfile } = await supabase.from('profiles').select('following_count').eq('id', user.id).single();
                if (selfProfile) {
                    supabase.from('profiles')
                        .update({ following_count: Math.max(0, (selfProfile.following_count || 0) + delta) })
                        .eq('id', user.id).then(() => {});
                }
            } catch(e) { console.warn('Follow sync failed:', e); }
        }
    };
    const handleCopyTrade = async (id: string) => { 
        if (!user) return openAppKitModal();
        if (!walletAddress) { setToast({ message: 'Connect a crypto wallet to copy traders', type: 'INFO' }); return; }
        if (user.copying.includes(id)) { 
            // Stop Copying: close all copy positions
            setPositions(prevPositions => {
                const copyPositions = prevPositions.filter(p => p.copyTraderId === id);
                let realized = 0; let margin = 0;
                const newHist: TradeHistoryItem[] = [];
                copyPositions.forEach(p => {
                    const price = marketPrices[p.pair] || p.entryPrice;
                    const pnl = (price - p.entryPrice) * (p.side === 'LONG' ? 1 : -1) * (p.size/p.entryPrice);
                    realized += pnl; margin += (p.size/p.leverage);
                    const h: TradeHistoryItem = { id: p.id, pair: p.pair, side: p.side, entryPrice: p.entryPrice, exitPrice: price, size: p.size, pnl, timestamp: Date.now(), action: 'CLOSE', copyTraderId: id };
                    newHist.push(h);
                    if (isSupabaseConfigured()) {
                        supabaseDeletePosition(p.id).catch(() => {});
                        insertTradeHistory(user.id, h).catch(e => console.warn("[velo] insertTradeHistory failed:", e));
                    }
                });
                const newCopying = user.copying.filter(c => c !== id);
                setUser(prev => prev ? { ...prev, balance: prev.balance + margin + realized, realizedPnL: prev.realizedPnL + realized, tradeHistory: [...prev.tradeHistory, ...newHist], copying: newCopying } : null);
                if (isSupabaseConfigured()) updateProfile(user.id, { copying: newCopying }).catch(() => {});
                setOpenOrders(prevOrders => prevOrders.filter(o => o.copyTraderId !== id));
                return prevPositions.filter(p => p.copyTraderId !== id);
            });
            setToast({message:'Stopped Copying & Closed Positions', type:'INFO'}); 
        } else { 
            const newCopying = [...user.copying, id];
            setUser(prev => prev ? {...prev, copying: newCopying} : null);
            if (isSupabaseConfigured()) updateProfile(user.id, { copying: newCopying }).catch(() => {});
            // Mirror the trader's current open positions immediately
            if (isSupabaseConfigured()) {
                fetchPositions(id).then(async traderPos => {
                    const openPos = traderPos.filter((p: Position) => !p.isCopyTrade);
                    if (openPos.length === 0) return;
                    const mirrored: Position[] = openPos.map((p: Position) => ({
                        ...p,
                        id: `copy_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
                        isCopyTrade: true,
                        copyTraderId: id,
                        timestamp: Date.now(),
                    }));
                    setPositions(prev => [...prev, ...mirrored]);
                    for (const mp of mirrored) {
                        await savePosition(user.id, mp).catch(() => {});
                    }
                    setToast({ message: `Copying ${openPos.length} active position${openPos.length > 1 ? 's' : ''}`, type: 'SUCCESS' });
                }).catch(() => {});
            }
            setToast({message:'Started Copying', type:'SUCCESS'}); 
        } 
        playSound('CLICK'); 
    };
    const handleUpdateProfile = async (updatedData: Partial<UserProfile>): Promise<{ ok: boolean; error?: string }> => {
        if (!user) return { ok: false, error: 'Not signed in' };

        // If username is being changed, enforce case-insensitive uniqueness
        // against the DB *before* touching local state, matching the signUp rule.
        if (updatedData.username && updatedData.username.trim() !== user.username) {
            const candidate = updatedData.username.trim();
            if (isSupabaseConfigured()) {
                const { data: clash } = await supabase.from('profiles')
                    .select('id').ilike('username', candidate).neq('id', user.id).maybeSingle();
                if (clash) {
                    setToast({ message: `Username "${candidate}" is already taken`, type: 'ERROR' });
                    playSound('ERROR');
                    return { ok: false, error: 'Username taken' };
                }
            }
            // Derive matching handle automatically so @name stays consistent
            updatedData.handle = `@${candidate.replace(/\s+/g, '')}`;
            updatedData.username = candidate;
        }

        setUser(prev => prev ? { ...prev, ...updatedData } : null);
        setToast({ message: 'Profile Updated', type: 'SUCCESS' });
        playSound('SUCCESS');

        if (isSupabaseConfigured()) {
            // Map to DB column names
            const dbUpdates: Record<string, any> = {};
            if (updatedData.bio      !== undefined) dbUpdates.bio        = updatedData.bio;
            if (updatedData.avatar   !== undefined) dbUpdates.avatar_url = updatedData.avatar;
            if (updatedData.banner   !== undefined) dbUpdates.banner_url = updatedData.banner;
            if (updatedData.username !== undefined) dbUpdates.username   = updatedData.username;
            if (updatedData.handle   !== undefined) dbUpdates.handle     = updatedData.handle;
            if (Object.keys(dbUpdates).length > 0) {
                try { await updateProfile(user.id, dbUpdates); } catch (_) {}
            }
        }
        return { ok: true };
    };
    const handleCreatePost = async (c: string, tradeSignal?: any, targetProfileId?: string): Promise<string | null> => { 
        if(!user) { openAppKitModal(); return null; }
        if(!walletAddress) { setToast({ message: 'Connect a crypto wallet to post', type: 'INFO' }); return null; }
        if (!c.trim()) return null;
        const tempId = `p_${Date.now()}`;
        // Optimistic local update with temp id
        const tempPost: Post = { id: tempId, authorId: user.id, authorHandle: user.handle, authorAvatar: user.avatar, content: c, timestamp: new Date().toISOString(), likes:0, reposts:0, likedBy:[], repostedBy:[], comments:[], isTradeSignal: !!tradeSignal, tradeDetails: tradeSignal, targetProfileId };
        setPosts(prev => [tempPost, ...prev]); 
        setToast({message:'Post Shared', type:'SUCCESS'}); 
        playSound('SUCCESS');
        // Persist to Supabase and replace temp post with real DB post (with real UUID)
        if (isSupabaseConfigured()) {
            const { data, error } = await supabaseCreatePost(user.id, c, undefined, tradeSignal, targetProfileId);
            if (error) {
                console.error('[velo] createPost error:', error);
            } else if (data) {
                // Swap temp post for real DB post (so delete works with real UUID)
                setPosts(prev => prev.map(p => p.id === tempId ? { ...p, id: data.id } : p));
                // Notify profile owner if posting on their wall (not your own)
                if (targetProfileId && targetProfileId !== user.id) {
                    createNotification(targetProfileId, 'WALL_POST', `${user.handle} posted on your profile`, data.id)
                        .catch(() => {});
                }
                // Detect and notify @mentions
                const mentionMatches = c.match(/@([A-Za-z0-9_]+)/g) || [];
                for (const mention of mentionMatches) {
                    const handle = mention.toLowerCase();
                    const mentionedTrader = traders.find((t: any) =>
                        t.handle?.toLowerCase() === handle || `@${t.username?.toLowerCase()}` === handle
                    );
                    if (mentionedTrader && mentionedTrader.id !== user.id && mentionedTrader.id !== targetProfileId) {
                        createNotification(mentionedTrader.id, 'MENTION', `${user.handle} mentioned you: "${c.slice(0, 80)}${c.length > 80 ? '…' : ''}"`, data.id)
                            .catch(() => {});
                    }
                    return data.id as string;
                }
            }
        }
        return null;
    };
    // Wraps any delete-post action with a confirmation modal
    const handleDeletePostWithConfirm = (id: string, onConfirmedDelete: (id: string) => Promise<void>) => {
        setDeletePostConfirm({
            isOpen: true,
            postId: id,
            onConfirm: () => onConfirmedDelete(id),
            itemType: 'post',
        });
    };

    // Creates a post then navigates directly to the new post's URL
    const handleCreatePostFromModal = async (content: string) => {
        const postId = await handleCreatePost(content);
        setToast({ message: 'Post published!', type: 'SUCCESS' });
        setActiveSocialTicker(null);
        if (postId) {
            setSinglePostId(postId);
        }
        setActiveTab(TabView.SOCIAL);
    };

    const handleLike = async (id: string) => {
        if (!user) return openAppKitModal();
        if (!walletAddress) { setToast({ message: 'Connect a crypto wallet to like posts', type: 'INFO' }); return; }
        // Read post data BEFORE setPosts to avoid stale closure issues
        const targetPost = posts.find(p => p.id === id);
        const postAuthorId = targetPost?.authorId || null;
        const wasLiked = targetPost ? targetPost.likedBy.includes(user.id) : false;
        // Optimistic update
        setPosts(prevPosts => prevPosts.map(p => {
            if (p.id === id) {
                const newLikedBy = wasLiked ? p.likedBy.filter(uid => uid !== user.id) : [...p.likedBy, user.id];
                return { ...p, likedBy: newLikedBy, likes: newLikedBy.length };
            }
            return p;
        }));
        playSound('CLICK');
        if (isSupabaseConfigured()) {
            supabaseLike(user.id, id).catch(e => console.warn('Like sync failed:', e));
            // Notify post author (only on like, not unlike, and not your own post)
            if (!wasLiked && postAuthorId && postAuthorId !== user.id) {
                createNotification(postAuthorId, 'LIKE', `${user.handle} liked your post`, id)
                    .catch(e => console.warn('Like notification failed:', e));
            }
        }
    };
    const handleRepost = async (id: string) => {
        if (!user) return openAppKitModal();
        if (!walletAddress) { setToast({ message: 'Connect a crypto wallet to repost', type: 'INFO' }); return; }
        // Read post data BEFORE setPosts
        const targetPost = posts.find(p => p.id === id);
        const postAuthorId = targetPost?.authorId || null;
        const wasReposted = targetPost ? targetPost.repostedBy.includes(user.id) : false;
        setPosts(prevPosts => prevPosts.map(p => {
            if (p.id === id) {
                const newRepostedBy = wasReposted ? p.repostedBy.filter(uid => uid !== user.id) : [...p.repostedBy, user.id];
                return { ...p, repostedBy: newRepostedBy, reposts: newRepostedBy.length };
            }
            return p;
        }));
        playSound('CLICK');
        if (isSupabaseConfigured()) {
            supabaseRepost(user.id, id).catch(e => console.warn('Repost sync failed:', e));
            // Notify post author on repost (not un-repost, not your own post)
            if (!wasReposted && postAuthorId && postAuthorId !== user.id) {
                createNotification(postAuthorId, 'REPOST', `${user.handle} reposted your post`, id)
                    .catch(e => console.warn('Repost notification failed:', e));
            }
        }
    };
    const handleComment = async (pid: string, c: string) => {
        if (!user) return openAppKitModal();
        if (!walletAddress) { setToast({ message: 'Connect a crypto wallet to comment', type: 'INFO' }); return; }
        if (!c.trim()) return;
        const tempId = `c_${Date.now()}`;
        const tempComment: Comment = { id: tempId, authorId: user.id, authorHandle: user.handle, authorAvatar: user.avatar, content: c, timestamp: new Date().toISOString() };
        const targetPost = posts.find(p => p.id === pid);
        const postAuthorId = targetPost?.authorId;
        // Optimistic add
        setPosts(prev => prev.map(p => p.id === pid ? {...p, comments: [...p.comments, tempComment]} : p));
        if (isSupabaseConfigured()) {
            const { data: newComment } = await supabaseComment(pid, user.id, c).catch(() => ({ data: null })) as any;
            if (newComment?.id) {
                // Replace temp comment with real DB comment (fixes disappear-on-refresh)
                setPosts(prev => prev.map(p => p.id === pid
                    ? { ...p, comments: p.comments.map(cm => cm.id === tempId ? { ...cm, id: newComment.id, timestamp: newComment.created_at || cm.timestamp } : cm) }
                    : p
                ));
            }
            // Notify post author (not your own post)
            if (postAuthorId && postAuthorId !== user.id) {
                createNotification(postAuthorId, 'COMMENT', `${user.handle} commented: "${c.slice(0, 60)}${c.length > 60 ? '…' : ''}"`, pid)
                    .catch(e => console.warn('Comment notification failed:', e));
            }
            // Detect @mentions and notify each mentioned user
            const mentionMatches = c.match(/@([A-Za-z0-9_]+)/g) || [];
            for (const mention of mentionMatches) {
                const handle = mention.toLowerCase();
                const mentionedTrader = traders.find((t: any) =>
                    t.handle?.toLowerCase() === handle || `@${t.username?.toLowerCase()}` === handle
                );
                if (mentionedTrader && mentionedTrader.id !== user.id && mentionedTrader.id !== postAuthorId) {
                    createNotification(mentionedTrader.id, 'MENTION', `${user.handle} mentioned you in a comment: "${c.slice(0, 60)}${c.length > 60 ? '…' : ''}"`, pid)
                        .catch(() => {});
                }
            }
        }
    };
    const doDeleteComment = async (postId: string, commentId: string) => {
        if (!user) return;
        setPosts(prev => prev.map(p =>
            p.id === postId
                ? { ...p, comments: p.comments.filter((c: any) => c.id !== commentId) }
                : p
        ));
        if (isSupabaseConfigured()) {
            const { error } = await supabaseDeleteComment(commentId, user.id);
            if (error) {
                console.error('[velo] deleteComment error:', error);
                setToast({ message: 'Failed to delete comment', type: 'ERROR' });
            }
        }
    };
    const handleDeleteComment = (postId: string, commentId: string) => {
        if (!user) return;
        setDeletePostConfirm({
            isOpen: true,
            postId: commentId,
            onConfirm: () => doDeleteComment(postId, commentId),
            itemType: 'comment',
        });
    };

    const handleDeleteAccount = async () => {
        if (!user) return;
        const uid = user.id;
        setUser(null);
        setPositions([]);
        setOpenOrders([]);
        setNotifications([]);
        clearNotifCache();
        setPosts(prev => prev.filter(p => p.authorId !== uid));
        setTraders(prev => prev.filter((t) => t.id !== uid));
        setActiveTab(TabView.TRADE);
        if (isSupabaseConfigured()) {
            supabaseDeleteAccount(uid).catch(e => console.error('[velo] deleteAccount error:', e));
        }
        setToast({ message: 'Account deleted. Goodbye!', type: 'INFO' });
    };

    const handleViewProfile = (profile: any) => { 
        // Resolve partial profiles (PostCard only passes { id })
        if (profile && profile.id && !profile.handle) {
            // Check if it's the current user
            if (user && user.id === profile.id) {
                setActiveTab(TabView.PROFILE);
                return;
            }
            // Find full trader profile
            const fullTrader = traders.find((t: Trader) => t.id === profile.id);
            if (fullTrader) {
                setViewingProfile(fullTrader);
                setActiveTab(TabView.PUBLIC_PROFILE);
                return;
            }
            // Try Supabase lookup for real accounts not in local traders
            if (isSupabaseConfigured() && isSupabaseUserId(profile.id)) {
                getProfile(profile.id).then(({ profile: p }) => {
                    if (p) {
                        const syntheticTrader: Trader = {
                            id: profile.id,
                            handle: p.handle || '@unknown',
                            username: p.username || 'Unknown',
                            bio: p.bio || '',
                            avatar: p.avatar_url || '',
                            banner: p.banner_url || '',
                            pnl: 0,
                            followers: [],
                            following: [],
                            veloRewards: 0,
                            winRate: 0,
                            activePositions: [],
                            isPrivate: false,
                            joinedDate: new Date().toISOString(),
                            verifiedReason: p.verified_reason || null,
                        };
                        // Seed the badge map for this fetched profile so the
                        // verified badge resolves on their profile page even
                        // though they're not in the local traders list.
                        if (p.verified_reason) VERIFIED_REASON_BY_ID[profile.id] = p.verified_reason;
                        setViewingProfile(syntheticTrader);
                        setActiveTab(TabView.PUBLIC_PROFILE);
                    }
                });
                return;
            }
        }
        // Full profile object already provided
        if (user && profile && user.id === profile.id) {
            setActiveTab(TabView.PROFILE);
            return;
        }
        setViewingProfile(profile); 
        setActiveTab(TabView.PUBLIC_PROFILE); 
    };


    // True whenever any overlay/modal is open — used to push navbar behind the backdrop
    const anyModalOpen =
        isLoginOpen || isResetPasswordOpen || isOrderlyOnboardingOpen ||
        isVeloWelcomeOpen || isVeloBridgeOpen || isVeloDepositOpen ||
        isVeloUsernameOpen || isVeloSendOpen || isVeloWithdrawOpen ||
        isCrossAccountOpen || isSettingsOpen || orderlyDWModal.open ||
        usersListModal.isOpen || sidebarOpen || leverageModalOpen;

    // Sync body class so CSS can push navbar behind modal backdrops
    // This also covers TradeView's internal PairSelector (z:60) and other unlisted modals
    React.useEffect(() => {
        if (anyModalOpen) {
            document.body.classList.add('modal-open');
        } else {
            document.body.classList.remove('modal-open');
        }
        return () => { document.body.classList.remove('modal-open'); };
    }, [anyModalOpen]);

    return (
        <>
        {/* Wallet session alert — shown when user switches MetaMask account or network mid-session */}
        {walletSessionAlert && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(20px)' }}>
                <div style={{ width: '100%', maxWidth: 380, background: 'var(--glass-bg-strong)', border: '1px solid var(--hairline-strong)', borderRadius: 20, overflow: 'hidden', boxShadow: 'var(--glass-shadow)', backdropFilter: 'blur(32px)' }}>
                    <div style={{ height: 3, background: 'oklch(0.74 0.18 30)', }} />
                    <div style={{ padding: '28px 28px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'oklch(0.74 0.18 30/0.12)', border: '1px solid oklch(0.74 0.18 30/0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <AlertTriangle size={24} style={{ color: 'oklch(0.74 0.18 30)' }} />
                        </div>
                        <div>
                            <p style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 20, color: 'var(--fg)', marginBottom: 8, letterSpacing: '-0.02em' }}>
                                {walletSessionAlert.type === 'account' ? 'Account Changed' : 'Network Changed'}
                            </p>
                            <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.6 }}>
                                {walletSessionAlert.type === 'account'
                                    ? 'You switched to a different wallet account in MetaMask. Please switch back to the account you used to sign in, or log out and reconnect with the new account.'
                                    : 'You switched to a different network in MetaMask. Please switch back to the network you were using, or log out and reconnect on the new network.'}
                            </p>
                        </div>
                        <div style={{ width: '100%', marginTop: 4 }}>
                            <button
                                onClick={() => { setWalletSessionAlert(null); handleLogout(); }}
                                style={{ width: '100%', padding: '13px', borderRadius: 10, background: 'oklch(0.74 0.18 30)', border: 'none', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: '#0B0B0E', cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}
                            >
                                Sign Out
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}
        {/* Wrong network banner — shown when logged-in user switches to wrong chain */}
        {showWrongNetworkBanner && (
            <div style={{
                position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10000,
                background: 'oklch(0.74 0.18 30)',
                color: '#0B0B0E',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                padding: '10px 20px',
                fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
                letterSpacing: '0.04em',
            }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0 }}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                Wrong network — switch to Base Sepolia in MetaMask to continue trading
                <button
                    onClick={() => setShowWrongNetworkBanner(false)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0B0B0E', opacity: 0.6, padding: '0 0 0 8px', lineHeight: 1, display: 'flex', alignItems: 'center' }}
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
            </div>
        )}
        {/* Auth loading — minimal brand-aligned splash.
            Just a small animated ring with a tiny mono tick. No wordmark tower. */}
        {!authChecked && (
            <div style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                background: 'var(--bg-base)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
                gap: 14,
            }}>
                <style>{`
                    @keyframes veloLoadSpin  { to { transform: rotate(360deg); } }
                    @keyframes veloLoadFade  { from { opacity: 0; } to { opacity: 0.7; } }
                    @keyframes veloLoadDots  { 0%,80%,100% { opacity: 0.2; } 40% { opacity: 1; } }
                `}</style>
                <div style={{
                    width: 28, height: 28, position: 'relative',
                    animation: 'veloLoadFade 0.4s ease both',
                }}>
                    <svg viewBox="0 0 28 28" width="28" height="28" style={{ animation: 'veloLoadSpin 1.1s linear infinite' }}>
                        <defs>
                            <linearGradient id="veloLoadG" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%"   stopColor="oklch(0.68 0.22 295)" />
                                <stop offset="50%"  stopColor="oklch(0.80 0.14 205)" />
                                <stop offset="100%" stopColor="oklch(0.68 0.22 295)" stopOpacity="0" />
                            </linearGradient>
                        </defs>
                        <circle cx="14" cy="14" r="11" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1.5" />
                        <circle cx="14" cy="14" r="11" fill="none" stroke="url(#veloLoadG)" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="40 40" />
                    </svg>
                </div>
                <div style={{
                    fontFamily: 'var(--font-mono), ui-monospace, monospace',
                    fontSize: 9, letterSpacing: '0.3em', textTransform: 'uppercase',
                    color: 'var(--fg-subtle)',
                    animation: 'veloLoadFade 0.4s 0.15s ease both',
                }}>
                    VELO<span style={{ display: 'inline-block', margin: '0 6px', width: 2, height: 2, borderRadius: '50%', background: 'currentColor', verticalAlign: 'middle' }} />Loading
                </div>
            </div>
        )}
        <div className={`min-h-screen font-sans transition-colors duration-300 ${theme} mode-${theme === 'dark' ? 'dark' : 'light'}`} style={{ background: 'var(--app-bg, var(--bg-base))', color: 'var(--fg)', position: 'relative' }}>
            {/* Subtle ambient background — consistent across all pages */}
            <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, background: 'var(--ambient)', opacity: 0.35 }} />
            <VeloAnimation kind={anim?.kind ?? null} label={anim?.label} sublabel={anim?.sublabel} onDone={() => setAnim(null)} />
            {toast && <ToastNotification message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

            {/* Trading-wallet re-derivation gate — shown when a returning user is
                on a device without their local burner. Persistent until done. */}
            {needsRederive && (
              <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', padding: 16 }}>
                <div style={{ width: 'min(420px, 100%)', background: 'var(--glass-2)', border: '1px solid var(--hr-2)', borderRadius: 20, boxShadow: 'var(--glass-shadow)', backdropFilter: 'blur(40px) saturate(1.8)', WebkitBackdropFilter: 'blur(40px) saturate(1.8)', padding: 24, position: 'relative' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 22, color: 'var(--fg)', marginBottom: 8 }}>Restore your trading wallet</div>
                  <p style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.5, margin: '0 0 18px' }}>
                    You're signed in on a new device. Authorize one signature to restore your Velo trading wallet — it re-derives the <strong>same address and funds</strong>. This is required before you can trade. It costs nothing and isn't a transaction.
                  </p>
                  {rederiveError && (
                    <div style={{ fontSize: 12, color: 'var(--pnl-down)', background: 'color-mix(in oklab, var(--pnl-down) 12%, transparent)', border: '1px solid color-mix(in oklab, var(--pnl-down) 30%, transparent)', borderRadius: 10, padding: '10px 12px', marginBottom: 14, lineHeight: 1.45 }}>
                      {rederiveError}
                    </div>
                  )}
                  <button
                    onClick={handleRederive}
                    disabled={rederiving}
                    style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', cursor: rederiving ? 'wait' : 'pointer', background: 'var(--velo-violet, oklch(0.55 0.24 295))', color: '#fff', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const, fontSize: 12, opacity: rederiving ? 0.7 : 1, transition: 'opacity 0.15s' }}>
                    {rederiving ? 'Waiting for signature…' : 'Authorize & restore wallet'}
                  </button>
                  <button
                    onClick={() => setNeedsRederive(false)}
                    disabled={rederiving}
                    style={{ width: '100%', padding: '10px 0 0', marginTop: 10, border: 'none', background: 'transparent', color: 'var(--fg-subtle)', cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase' as const, fontSize: 10 }}>
                    Not now
                  </button>
                </div>
              </div>
            )}
            {/* Wire silentLoginCallbackRef to onAuth for silent wallet reconnect logins */}
            {/* We set this inline via a side-effect-safe ref assignment in the effect above */}
            <VeloOnboardingModal
              isOpen={isLoginOpen}
              required={!user && !loginReturningName}
              returningName={loginReturningName}
              disconnectRef={walletDisconnectRef}
              onClose={() => {
                freshSignupRef.current = false;
                setVeloWelcomeOpen(false);
                setLoginReturningName('');
                setLoginOpen(false);
              }}
              onAuth={async (authUser, passedProfile, isNewAccount) => {
                    if (!authUser) return;
                    intentionalLogoutRef.current = false;
                    freshSignupRef.current = !!isNewAccount;
                    socialLoginHandledRef.current = true; // prevent socialLoginEffect re-firing for both new and returning users
                    sessionRestoredRef.current = true; // prevent SIGNED_IN handler from double-hydrating
                    setLoginReturningName('');
                    setLoginOpen(false);
                    setActiveTab(TabView.DASHBOARD);
                    try {
                        let p = passedProfile;
                        if (!p) {
                            const profilePromise = getProfile(authUser.id);
                            const timeout = new Promise<{ profile: null }>(res => setTimeout(() => res({ profile: null }), 5000));
                            const result = await Promise.race([profilePromise, timeout]) as any;
                            p = result?.profile ?? null;
                        }
                        const username = p?.username || authUser.user_metadata?.username || authUser.email?.split('@')[0] || 'Trader';
                        const restoredUser = p ? dbProfileToUserProfile(p) : {
                            id: authUser.id, username,
                            handle: p?.handle || `@${username.replace(/\s+/g, '')}`,
                            bio: '', avatar: p?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${authUser.id}`,
                            banner: '', balance: 0, pnlTotal: 0, realizedPnL: 0,
                            following: [], copying: [], followers: [], copierCount: 0,
                            earnedFees: 0, veloRewards: 0,
                            tradeHistory: [], transactionHistory: [], pnlHistory: [],
                            joinedDate: new Date().toISOString(), likes: [], reposts: [],
                        } as UserProfile;
                        const [positions, orders, history, txns, notifs, loadedPosts] = await Promise.all([
                            fetchPositions(authUser.id),
                            fetchOpenOrders(authUser.id),
                            fetchTradeHistory(authUser.id),
                            fetchTransactions(authUser.id),
                            fetchNotifications(authUser.id),
                            fetchPosts(50),
                        ]);
                        const { data: follows } = await supabase.from('follows').select('following_id').eq('follower_id', authUser.id);
                        restoredUser.following = (follows || []).map((f: any) => f.following_id);
                        const { data: myFollowers } = await supabase.from('follows').select('follower_id').eq('following_id', authUser.id);
                        restoredUser.followers = (myFollowers || []).map((f: any) => f.follower_id);
                        restoredUser.tradeHistory = history;
                        restoredUser.transactionHistory = txns;
                        const closedTrades = history.filter((t: any) => t.action === 'CLOSE').sort((a: any, b: any) => a.timestamp - b.timestamp);
                        const totalRealized = closedTrades.reduce((acc: number, t: any) => acc + t.pnl, 0);
                        const startingBalance = (restoredUser.balance || 0) - totalRealized;
                        let runningPnl = 0;
                        restoredUser.pnlHistory = closedTrades.map((t: any) => {
                            runningPnl += t.pnl;
                            const d = new Date(t.timestamp);
                            return { time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), value: startingBalance + runningPnl, timestamp: t.timestamp };
                        });
                        userLoadedFromDB.current = true;
                        if (walletAddress) restoredUser.walletAddress = walletAddress;
                        else if (passedProfile?.wallet_address) restoredUser.walletAddress = passedProfile.wallet_address;
                        setUser(restoredUser);
                        recordSessionWallet();
                        setPositions(positions);
                        setOpenOrders(orders);
                        setNotifications(notifs); // always replace — guard caused stale/empty notifications on refresh
                        if (loadedPosts.length > 0) setPosts(loadedPosts);
                        try {
                            const prefs = await fetchPreferences(authUser.id);
                            applyPreferences(prefs);
                        } catch (_) { /* use defaults */ }
                        playSound('SUCCESS');
                    } catch (e) {
                        console.warn('onAuth error:', e);
                        const username = authUser.user_metadata?.username || authUser.email?.split('@')[0] || 'Trader';
                        setUser({
                            id: authUser.id, username, handle: `@${username.replace(/\s+/g, '')}`,
                            bio: '', avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
                            banner: '', balance: 0, pnlTotal: 0, realizedPnL: 0,
                            following: [], copying: [], followers: [], copierCount: 0,
                            earnedFees: 0, veloRewards: 0,
                            tradeHistory: [], transactionHistory: [], pnlHistory: [],
                            joinedDate: new Date().toISOString(), likes: [], reposts: [],
                        });
                    }
                }}
              onUsernameClaimed={(handle) => {
                setToast({ message: `@${handle} registered on-chain`, type: 'SUCCESS' });
              }}
              onBurnerReady={async ({ burnerAddress, amount, txHash }) => {
                setBurnerAddress(burnerAddress as `0x\${string}`);
                veloPerpsTrading.reloadBurner();
                setToast({ message: 'Trading wallet ready — no more popups', type: 'SUCCESS' });
                if (user && isSupabaseConfigured()) {
                  supabase.from('profiles')
                    .update({ velo_wallet_address: burnerAddress.toLowerCase() })
                    .eq('id', user.id)
                    .then(({ error }) => {
                      if (error && !['42703', 'PGRST204'].includes((error as any).code)) {
                        console.warn('[velo] failed to persist velo_wallet_address:', error.message);
                      }
                    });
                }
                if (user && isSupabaseConfigured() && amount > 0) {
                  const faucetRef = txHash ? `faucet:${txHash}` : `faucet:welcome:${user.id}`;
                  try {
                    await recordTransaction(user.id, 'DEPOSIT', amount, { onChain: !!txHash, txHash: faucetRef });
                    await createNotification(user.id, 'DEPOSIT', `Welcome bonus: $${amount.toFixed(2)} mUSDC credited to your trading wallet`, txHash);
                    const txns = await fetchTransactions(user.id);
                    setUser(prev => prev ? { ...prev, transactionHistory: txns } : null);
                  } catch (e) {
                    console.warn('[velo] failed to record faucet deposit:', e);
                  }
                }
              }}
            />
            {/* ── Reset Password Modal ── */}
            {isResetPasswordOpen && <ResetPasswordModal onClose={() => setResetPasswordOpen(false)} onSuccess={() => { setResetPasswordOpen(false); setToast({ message: 'Password updated! Please sign in.', type: 'SUCCESS' }); setLoginOpen(true); }} />}
            {/* ── Velo Bridge Modal (cross-chain mUSDC via LayerZero V2) ──
                NOTE (batch 7): no longer wired to any UI button. Cross-chain
                deposits/withdraws now live inside the unified Funds modal
                (VeloDepositModal) as a network picker. This mount is kept
                so any future programmatic trigger still works, but in the
                current UX the user never sees it. Safe to remove if it
                becomes a maintenance burden — also remove `isVeloBridgeOpen`
                state and the `VeloBridgeModal` import at top of file. */}
            <VeloBridgeModal
              isOpen={isVeloBridgeOpen}
              onClose={() => setVeloBridgeOpen(false)}
            />
            {/* ── Velo Deposit Modal (main wallet → trading wallet, same chain) ── */}
            <VeloDepositModal
              isOpen={isVeloDepositOpen}
              onClose={() => setVeloDepositOpen(false)}
              onSuccess={async (txHash, amount) => {
                setToast({ message: `Deposited $${amount.toFixed(2)} to trading wallet`, type: 'SUCCESS' });
                if (user?.id && isSupabaseConfigured()) {
                  try {
                    await recordTransaction(user.id, 'DEPOSIT', amount, { txHash, onChain: true });
                    await createNotification(user.id, 'DEPOSIT', `Deposited $${amount.toFixed(2)} mUSDC to trading wallet`, txHash);
                    const txns = await fetchTransactions(user.id);
                    setUser(prev => prev ? { ...prev, transactionHistory: txns } : null);
                  } catch (e) { console.warn('[velo] deposit tx record failed', e); }
                }
                // Force the trading-wallet balance to refresh now instead of
                // waiting for the next 5s poll — the dashboard's TOTAL EQUITY
                // visibly jumps the moment the user sees the SUCCESS toast.
                try { await veloPerpsTrading.refresh(); } catch {}
              }}
            />
            {/* ── Velo Share Trade Modal (post-close share-to-feed prompt) ── */}
            <VeloShareTradeModal
              isOpen={!!shareTradeData}
              trade={shareTradeData}
              onClose={() => setShareTradeData(null)}
              onShare={(content, tradeSignal) => {
                handleCreatePost(content, tradeSignal).catch(() => {});
              }}
            />
            {/* ── Velo Username Modal (on-chain handle claim) ── */}
            <VeloUsernameModal
              isOpen={isVeloUsernameOpen}
              onClose={() => setVeloUsernameOpen(false)}
              lockedHandle={user?.handle?.replace(/^@/, '').toLowerCase()}
              onClaimed={(handle) => {
                setToast({ message: `Claimed @${handle} on-chain`, type: 'SUCCESS' });
              }}
            />
            {/* ── Velo Send Modal (peer-to-peer mUSDC) ── */}
            <VeloSendModal
              isOpen={isVeloSendOpen}
              onClose={() => setVeloSendOpen(false)}
              walletAddress={user?.walletAddress as `0x${string}` | undefined}
              onSuccess={async ({ txHash, recipientAddress, recipientHandle, amount }) => {
                // Local toast for the sender
                const toLabel = recipientHandle ? `@${recipientHandle}` : `${recipientAddress.slice(0, 6)}…${recipientAddress.slice(-4)}`;
                setToast({ message: `Sent $${amount.toFixed(2)} mUSDC to ${toLabel}`, type: 'SUCCESS' });
                // Optimistically prepend the send to recent activity immediately
                const optimisticTx = {
                  id: `send-${Date.now()}`,
                  type: 'SEND',
                  amount,
                  status: 'COMPLETED',
                  timestamp: Date.now(),
                  on_chain: true,
                  tx_hash: txHash,
                  counterparty: toLabel,
                  created_at: new Date().toISOString(),
                };
                setUser(prev => prev ? { ...prev, transactionHistory: [optimisticTx, ...(prev.transactionHistory ?? [])] } : null);

                if (user?.id && isSupabaseConfigured()) {
                  // ── Sender side: notification + activity row ──────────────
                  try {
                    await createNotification(user.id, 'TRANSFER_SENT', `You sent $${amount.toFixed(2)} mUSDC to ${toLabel}`, txHash);
                    await recordTransaction(user.id, 'SEND', amount, { txHash, onChain: true, counterparty: toLabel });
                    const txns = await fetchTransactions(user.id);
                    setUser(prev => prev ? { ...prev, transactionHistory: txns } : null);
                  } catch (e: any) {
                    console.warn('[velo] sender notif/tx failed', e);
                    setToast({ message: `Couldn't save your activity row: ${e?.message || 'unknown error'}`, type: 'ERROR' });
                  }

                  // ── Receiver side: resolve their profile, then notify ─────
                  // Earlier builds used a single .or() across handle, username,
                  // wallet_address and velo_wallet_address. PostgREST's filter
                  // string format silently dropped matches when the @-prefixed
                  // handle or the long hex address tripped its parser, so the
                  // receiver never got their TRANSFER_RECEIVED row. We now run
                  // sequential queries: cheapest+most-specific first (trading
                  // wallet, which is what the on-chain transfer actually went
                  // to), then main wallet, then handle, then username. Stop on
                  // first hit. Verbose-log each attempt so the sender's console
                  // shows exactly why a Velo recipient didn't get notified.
                  const addrLower = recipientAddress.toLowerCase();
                  let recipientProfile: { id: string; handle?: string; username?: string } | null = null;
                  const tryLookup = async (col: string, val: string) => {
                    if (recipientProfile) return;
                    if (!val) return;
                    try {
                      const { data, error } = await supabase
                        .from('profiles')
                        .select('id, handle, username')
                        .ilike(col, val)
                        .limit(1)
                        .maybeSingle();
                      if (error) {
                        console.warn(`[velo] recipient lookup by ${col}=${val} failed:`, error.message);
                        return;
                      }
                      if (data?.id && data.id !== user.id) recipientProfile = data;
                    } catch (e: any) {
                      console.warn(`[velo] recipient lookup by ${col}=${val} threw:`, e?.message);
                    }
                  };
                  await tryLookup('velo_wallet_address', addrLower);
                  await tryLookup('wallet_address',      addrLower);
                  if (recipientHandle) {
                    await tryLookup('handle',   recipientHandle);
                    await tryLookup('handle',   `@${recipientHandle}`);
                    await tryLookup('username', recipientHandle);
                  }

                  if (recipientProfile) {
                    const fromLabel = user.handle
                      ? (user.handle.startsWith('@') ? user.handle : `@${user.handle}`)
                      : (user.username ? `@${user.username}` : 'a Velo user');
                    try {
                      await createNotificationForUser(
                        recipientProfile.id,
                        'TRANSFER_RECEIVED',
                        `${fromLabel} sent you $${amount.toFixed(2)} mUSDC`,
                        txHash,
                      );
                    } catch (e: any) {
                      console.warn('[velo] receiver notification failed', e);
                      setToast({ message: `Recipient lookup ok but notification insert failed: ${e?.message || 'unknown'}`, type: 'ERROR' });
                    }
                    try {
                      await recordTransactionForUser(
                        recipientProfile.id,
                        'RECEIVE',
                        amount,
                        { txHash, onChain: true, counterparty: fromLabel },
                      );
                    } catch (e: any) {
                      console.warn('[velo] receiver activity row failed', e);
                      setToast({ message: `Recipient activity row insert failed: ${e?.message || 'unknown'}`, type: 'ERROR' });
                    }
                  } else {
                    // Send still succeeded on-chain; we just couldn't find a
                    // Velo profile for the recipient (they may not be signed
                    // up). Log it so debugging is one click away, but don't
                    // alarm the sender — the transfer itself worked.
                    console.info(
                      '[velo] no Velo profile found for recipient',
                      { addr: addrLower, handle: recipientHandle || '(none)' },
                    );
                  }
                }
                // Refresh the burner balance so the dashboard's TOTAL EQUITY
                // drops by `amount` immediately rather than after the next poll.
                try { await veloPerpsTrading.refresh(); } catch {}
              }}
            />
            {/* ── Velo Withdraw Modal (trading wallet → main or custom 0x) ── */}
            <VeloWithdrawModal
              isOpen={isVeloWithdrawOpen}
              onClose={() => setVeloWithdrawOpen(false)}
              onSuccess={async (hash, amount) => {
                setToast({ message: `Withdrew $${amount.toFixed(2)} mUSDC`, type: 'SUCCESS' });
                // Record the withdrawal in Recent Activity. on-chain meta keeps
                // it from double-applying to the legacy Supabase balance.
                if (user?.id && isSupabaseConfigured()) {
                  try {
                    await recordTransaction(user.id, 'WITHDRAW', amount, { txHash: hash, onChain: true });
                    await createNotification(user.id, 'WITHDRAW', `Withdrew $${amount.toFixed(2)} mUSDC to wallet`, hash);
                    const txns = await fetchTransactions(user.id);
                    setUser(prev => prev ? { ...prev, transactionHistory: txns } : null);
                  } catch (e) { console.warn('[velo] withdraw tx record failed', e); }
                }
                // Refresh the burner balance so TOTAL EQUITY visibly drops by
                // the withdrawn amount immediately.
                try { await veloPerpsTrading.refresh(); } catch {}
              }}
            />
            {/* ── Velo Share Card (PNG export) ── */}
            {shareCardData && (
              <VeloShareCard
                isOpen={!!shareCardData}
                onClose={() => setShareCardData(null)}
                data={shareCardData}
              />
            )}
            {/* ── Velo Manage Position Modal (V2: add/reduce margin, partial close, TP/SL) ── */}
            <VeloManagePositionModal
              isOpen={!!managingPosition}
              onClose={() => { setManagingPosition(null); setManagingPositionTab('ADD'); }}
              position={managingPosition}
              currentPrice={managingPosition ? (marketPrices[managingPosition.pair] || managingPosition.entryPrice) : 0}
              userBalance={veloPerpsTrading.usdcBalance ?? user?.balance ?? 0}
              initialTab={managingPositionTab}
              actions={{
                addMargin: async (tradeId, amt) => {
                  const r = await veloPerpsTrading.addMargin(tradeId, amt);
                  setToast({ message: `Added $${amt.toFixed(2)} margin`, type: 'SUCCESS' });
                  return r;
                },
                reduceMargin: async (tradeId, amt, pair) => {
                  const veloPair = (pair.replace('/', '-')) as any;
                  const r = await veloPerpsTrading.reduceMargin(tradeId, amt, veloPair);
                  setToast({ message: `Withdrew $${amt.toFixed(2)} margin`, type: 'SUCCESS' });
                  return r;
                },
                partialClose: async (tradeId, fracBps, pair) => {
                  const pos = managingPosition; // capture before async/modal close
                  const veloPair = (pair.replace('/', '-')) as any;
                  const r = await veloPerpsTrading.partialClose(tradeId, fracBps, veloPair);
                  setToast({ message: `Closed ${(fracBps / 100).toFixed(0)}% of position`, type: 'SUCCESS' });

                  // Record the (partial) close so it shows in History + recent activity.
                  // The contract settles realized PnL on-chain, but partialClose() only
                  // returns a tx hash (unlike closePosition, which returns exitPrice/pnl),
                  // so we derive the closed-portion PnL from the live mark price — the same
                  // linear-perp formula the position row uses for its live PnL. The 5s
                  // contract poll reconciles exact balances afterward. This was the gap:
                  // partial closes (and 100% closes done through this modal) never wrote a
                  // trade_history row, so they were missing from History and the dashboard.
                  try {
                    if (pos && user && isSupabaseConfigured()) {
                      const fraction = Math.min(1, Math.max(0, fracBps / 10000));
                      const exitPrice = marketPrices[pos.pair] || pos.entryPrice;
                      const closedSize = pos.size * fraction;
                      const dir = pos.side === 'LONG' ? 1 : -1;
                      const pnl = pos.entryPrice > 0
                        ? closedSize * ((exitPrice - pos.entryPrice) / pos.entryPrice) * dir
                        : 0;
                      const partialHistory: TradeHistoryItem = {
                        id: `pclose_${pos.id}_${Date.now()}`,
                        pair: pos.pair, side: pos.side,
                        entryPrice: pos.entryPrice, exitPrice,
                        size: closedSize, pnl, timestamp: Date.now(),
                        openedAt: pos.timestamp, leverage: pos.leverage,
                        marginMode: pos.marginMode, liquidationPrice: pos.liquidationPrice,
                        action: 'CLOSE', copyTraderId: pos.copyTraderId,
                        onChain: true, orderlyOrderUrl: r.explorerUrl,
                      } as any;
                      insertTradeHistory(user.id, partialHistory).catch((e: any) => console.warn('[velo] partial-close history failed:', e));
                      setUser(prev => {
                        if (!prev || prev.tradeHistory.some(h => h.id === partialHistory.id)) return prev;
                        return {
                          ...prev,
                          realizedPnL: prev.realizedPnL + pnl,
                          tradeHistory: [partialHistory, ...prev.tradeHistory],
                          pnlHistory: [...(prev.pnlHistory || []), {
                            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                            value: veloPerpsTrading.usdcBalance + pnl,
                            timestamp: Date.now(),
                          }],
                        };
                      });
                      // Reflect the reduced (or fully closed) position immediately;
                      // the next contract poll reconciles exact size/margin.
                      setPositions(prev => fraction >= 0.999
                        ? prev.filter(x => x.id !== pos.id)
                        : prev.map(x => x.id === pos.id ? { ...x, size: x.size * (1 - fraction) } : x));
                    }
                  } catch (e) { console.warn('[velo] partial-close bookkeeping failed:', e); }
                  return r;
                },
                setTriggers: async (tradeId, tp, sl) => {
                  const r = await veloPerpsTrading.setTriggers(tradeId, tp, sl);
                  setToast({ message: `Triggers updated on-chain`, type: 'SUCCESS' });
                  // Sync local position tp/sl so chart lines update immediately
                  if (managingPosition) {
                    const pos = managingPosition;
                    setPositions((prev: any[]) => prev.map((p: any) =>
                      p.id === pos.id ? { ...p, takeProfit: tp || undefined, stopLoss: sl || undefined } : p
                    ));
                    // Sync openOrders: replace any existing TP/SL orders for this position
                    const id = pos.id;
                    setOpenOrders((prevOrders: any[]) => {
                      const filtered = prevOrders.filter((o: any) => o.relatedPositionId !== id);
                      const closeSide = pos.side === 'LONG' ? 'SHORT' : 'LONG';
                      const newOrds: any[] = [];
                      if (tp) newOrds.push({ id: `ord_tp_${id}_${Date.now()}`, pair: pos.pair, side: closeSide, type: 'TAKE_PROFIT', price: tp, size: pos.size, leverage: pos.leverage, timestamp: Date.now(), relatedPositionId: id });
                      if (sl) newOrds.push({ id: `ord_sl_${id}_${Date.now()}`, pair: pos.pair, side: closeSide, type: 'STOP_LOSS', price: sl, size: pos.size, leverage: pos.leverage, timestamp: Date.now(), relatedPositionId: id });
                      return [...filtered, ...newOrds];
                    });
                  }
                  return r;
                },
              }}
            />
            {/* ── V3 Cross-Margin Account modal ── */}
            <VeloCrossAccountModal
              isOpen={isCrossAccountOpen}
              onClose={() => setCrossAccountOpen(false)}
              walletBalance={veloPerpsTrading.usdcBalance}
              crossFree={veloPerpsTrading.crossFreeBalance}
              crossTotal={veloPerpsTrading.crossTotalBalance}
              crossLocked={veloPerpsTrading.crossLockedBalance}
              deposit={veloPerpsTrading.depositCross}
              withdraw={veloPerpsTrading.withdrawCross}
              initialTab={crossAccountTab}
            />
            {/* ── Orderly Onboarding Modal (Phase 3 removes this entirely) ── */}
            <OrderlyOnboardingModal
              isOpen={isOrderlyOnboardingOpen}
              onClose={() => { setOrderlyOnboardingOpen(false); setOnboardingDismissed(true); }}
              onReady={(kp, burner, bal) => {
                setBurnerAddress(burner.veloAddress);
                activateOrderly(kp, bal);
                setOrderlyOnboardingOpen(false);
                setOnboardingDismissed(true);
                setToast({ message: `Velo Wallet active — $${bal.toFixed(2)} USDC ready`, type: 'SUCCESS' });
                // Persist velo_wallet_address to the profile so it's visible
                // for audit / recovery (the keypair stays in localStorage).
                if (user && isSupabaseConfigured()) {
                  supabase.from('profiles')
                    .update({ velo_wallet_address: burner.veloAddress.toLowerCase() })
                    .eq('id', user.id)
                    .then(({ error }) => {
                      if (error && !['42703', 'PGRST204'].includes((error as any).code)) {
                        console.warn('[velo] failed to persist velo_wallet_address:', error.message);
                      }
                    });
                }
                // Record the faucet credit as a DEPOSIT transaction so the dashboard
                // shows it with a verifiable on-chain reference. The faucet is server-side,
                // so we record the burner address as the proof — the dashboard renders
                // a link to the Orderly portfolio for that address.
                if (user && isSupabaseConfigured() && bal > 0) {
                  const faucetRef = `faucet:${burner.veloAddress}`;
                  recordTransaction(user.id, 'DEPOSIT', bal, { onChain: true, txHash: faucetRef })
                    .then(() => fetchTransactions(user.id))
                    .then(txns => setUser(prev => prev ? { ...prev, transactionHistory: txns } : null))
                    .catch(err => console.warn('[velo] failed to record faucet deposit:', err));
                }
              }}
            />
            {/* ── Wallet & Settings Modal ── */}
            <SettingsModal
              isOpen={isSettingsOpen}
              onClose={() => setSettingsOpen(false)}
              // onOpenBridge intentionally not passed (batch 7) — cross-chain
              // is now a network picker inside the Deposit/Withdraw modal,
              // not a separate top-level concept.
              onOpenUsername={() => { setSettingsOpen(false); setVeloUsernameOpen(true); }}
              onOpenSend={() => { setSettingsOpen(false); setVeloSendOpen(true); }}
              profile={user ? { id: user.id, email: user.email || '', username: user.username } : null}
              onEmailSaved={(email: string) => setUser(prev => prev ? { ...prev, email } : null)}
              onBurnerRecovered={(veloAddress) => {
                // The user re-derived their trading wallet on this device. Hydrate
                // the trading layer immediately (no refresh): setBurnerAddress updates
                // App-level UI, and reloadBurner() forces useVeloPerpsTrading to re-read
                // the freshly-written localStorage burner so balance/positions/trading
                // all come alive right away.
                setBurnerAddress(veloAddress);
                veloPerpsTrading.reloadBurner();
                if (user && isSupabaseConfigured()) {
                  supabase.from('profiles')
                    .update({ velo_wallet_address: veloAddress.toLowerCase() })
                    .eq('id', user.id)
                    .then(({ error }) => {
                      if (error) console.warn('[velo] failed to persist recovered velo_wallet_address:', error.message);
                    });
                }
                setToast({ message: 'Trading wallet recovered', type: 'SUCCESS' });
              }}
              onLogout={handleLogout}
            />
            {/* ── Orderly Deposit / Withdraw Modal (post-onboarding) ── */}
            <DepositWithdrawModal
              isOpen={orderlyDWModal.open}
              mode={orderlyDWModal.type}
              onClose={() => setOrderlyDWModal(prev => ({ ...prev, open: false }))}
              keypair={orderly.keypair}
              orderlyBalance={orderly.orderlyBalance}
              onWithdraw={async (amount, sign) => withdrawFromOrderly(amount, sign)}
              onDepositComplete={async (txHash: string, amount: number) => {
                if (user && isSupabaseConfigured()) {
                  await recordTransaction(user.id, 'DEPOSIT', amount, { onChain: true, txHash });
                  try { const txns = await fetchTransactions(user.id); setUser(prev => prev ? { ...prev, transactionHistory: txns } : null); } catch (_) {}
                }
                await refreshOrderlyBalance();
              }}
              onWithdrawComplete={async (amount: number, withdrawNonce: number) => {
                if (user && isSupabaseConfigured()) {
                  await recordTransaction(user.id, 'WITHDRAW', amount, { onChain: true, withdrawNonce });
                  try { const txns = await fetchTransactions(user.id); setUser(prev => prev ? { ...prev, transactionHistory: txns } : null); } catch (_) {}
                }
                await refreshOrderlyBalance();
              }}
            />
            <EditPositionModal isOpen={!!editingPosition} position={editingPosition} onClose={() => setEditingPosition(null)} onSave={handleUpdatePosition}/>
            <LeverageChangeModal 
                isOpen={leverageModalOpen} 
                onClose={() => { setLeverageModalOpen(false); setPendingTrade(null); }} 
                onConfirm={confirmLeverageChange}
                pendingTrade={pendingTrade}
                existingPosition={pendingTrade ? positions.find(p => p.pair === pendingTrade.pairId && !p.isCopyTrade) : null}
                marketPrices={marketPrices}
            />
            <UsersListModal isOpen={usersListModal.isOpen} onClose={() => setUsersListModal(prev => ({ ...prev, isOpen: false }))} title={usersListModal.title} userIds={usersListModal.userIds} traders={traders} onViewProfile={handleViewProfile}/>
            <MobileSidebar isOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} activeTab={activeTab} setActiveTab={setActiveTab} handleLogout={handleLogout} user={user} toggleTheme={() => { const next = theme === 'dark' ? 'light' : 'dark'; setTheme(next); localStorage.setItem('velo_theme', next); updatePrefs({ theme: next }); }} theme={theme} onRequireAuth={handleRequireAuth} totalEquity={totalEquity} buyingPower={buyingPower} isContractOwner={isContractOwner} onSocialClick={() => { setActiveSocialTicker(null); setSinglePostId(null); setActiveTab(TabView.SOCIAL); }}/>
            <Navbar activeTab={activeTab} setActiveTab={setActiveTab} toggleTheme={() => { const next = theme === 'dark' ? 'light' : 'dark'; setTheme(next); localStorage.setItem('velo_theme', next); updatePrefs({ theme: next }); }} theme={theme} handleLogout={handleLogout} user={user} onRequireAuth={handleRequireAuth} unreadCount={notifications.filter(n => !n.read).length} setMobileMenuOpen={setSidebarOpen} notifications={notifications} onCreatePost={() => { if (user) setCreatePostModalOpen(true); else handleRequireAuth(); }} onOpenSettings={() => setSettingsOpen(true)} isContractOwner={isContractOwner} anyModalOpen={anyModalOpen} onSocialClick={() => { setActiveSocialTicker(null); setSinglePostId(null); setActiveTab(TabView.SOCIAL); }} onNotificationClick={(n: any) => {
                    // Mark this notification (and all others) as read
                    setNotifications(prev => prev.map(x => ({ ...x, read: true })));
                    if (isSupabaseConfigured() && user) markAllNotificationsRead(user.id).catch(() => {});

                    // Route based on notification type so the click actually lands somewhere useful
                    const t = n?.type;
                    const rid = n?.relatedId;
                    const focusKey = Date.now(); // key forces child useEffect to re-run even on repeat clicks

                    if (t === 'POSITION_CLOSED' || t === 'TAKE_PROFIT' || t === 'STOP_LOSS' || t === 'LIQUIDATION') {
                        // Try to open the OrderDetailsModal directly without switching tabs
                        const historyItem = user?.tradeHistory?.find((h: TradeHistoryItem) => h.id === rid);
                        if (historyItem) {
                            setAppOrderDetails({ kind: 'HISTORY', item: historyItem });
                        } else if (isSupabaseConfigured() && user && rid) {
                            // Trade history might not be in local state yet — fetch from Supabase
                            (async () => {
                                try {
                                    const { data } = await supabase
                                        .from('trade_history')
                                        .select('*')
                                        .eq('id', rid)
                                        .single();
                                    if (data) {
                                        const item: TradeHistoryItem = {
                                            id: data.id,
                                            pair: data.pair,
                                            side: data.side,
                                            action: data.action,
                                            size: data.size,
                                            price: data.price,
                                            pnl: data.pnl,
                                            fee: data.fee,
                                            timestamp: data.timestamp,
                                            leverage: data.leverage,
                                            entryPrice: data.entry_price,
                                            exitPrice: data.exit_price,
                                            margin: data.margin,
                                        };
                                        setAppOrderDetails({ kind: 'HISTORY', item });
                                    } else {
                                        // Still not found — fall back to trade tab
                                        setTradeFocus({ tab: 'HISTORY', highlightId: rid, key: focusKey });
                                        setAutoOpenHistoryId(rid || null);
                                        setActiveTab(TabView.TRADE);
                                    }
                                } catch (_) {
                                    setTradeFocus({ tab: 'HISTORY', highlightId: rid, key: focusKey });
                                    setAutoOpenHistoryId(rid || null);
                                    setActiveTab(TabView.TRADE);
                                }
                            })();
                        } else {
                            // Fallback: navigate to Trade view history
                            setTradeFocus({ tab: 'HISTORY', highlightId: rid, key: focusKey });
                            setAutoOpenHistoryId(rid || null);
                            setActiveTab(TabView.TRADE);
                        }
                    } else if (t === 'TRADE' || t === 'ALERT') {
                        // Generic trade alert — jump to Positions
                        setTradeFocus({ tab: 'POSITIONS', highlightId: rid, key: focusKey });
                        setActiveTab(TabView.TRADE);
                    } else if (t === 'COMMENT' || t === 'MENTION') {
                        // Open the specific post with comments expanded
                        if (rid) { setSocialFocusPostId(rid); setSocialOpenCommentsPostId(rid); }
                        setActiveTab(TabView.SOCIAL);
                    } else if (t === 'LIKE' || t === 'REPOST') {
                        // Scroll to the specific post
                        if (rid) { setSocialFocusPostId(rid); setSocialOpenCommentsPostId(null); }
                        setActiveTab(TabView.SOCIAL);
                    } else if (t === 'FOLLOW') {
                        // Someone followed the user — show the follower's profile if we can resolve it,
                        // otherwise fall back to the user's own profile (where followers are visible).
                        if (rid) {
                            const trader = traders.find((x: Trader) => x.id === rid);
                            if (trader) { handleViewProfile(trader); return; }
                        }
                        setActiveTab(TabView.PROFILE);
                    } else if (t === 'DEPOSIT' || t === 'WITHDRAW' || t === 'EARN') {
                        // Account / balance events — Dashboard is the right home
                        setActiveTab(TabView.DASHBOARD);
                    } else if (t === 'TRANSFER_SENT' || t === 'TRANSFER_RECEIVED') {
                        // Peer-to-peer mUSDC transfer — open the matching
                        // transaction row in OrderDetailsModal. `rid` is the
                        // tx_hash we passed to createNotification. We match by
                        // txHash first (authoritative); if local state hasn't
                        // hydrated the row yet (realtime race), fetch it.
                        const findInHistory = () => (user?.transactionHistory ?? []).find((tx: any) =>
                            tx.txHash === rid || tx.tx_hash === rid || tx.id === rid,
                        );
                        const local = findInHistory();
                        if (local) {
                            setAppOrderDetails({ kind: 'TRANSACTION', item: local } as any);
                            setActiveTab(TabView.DASHBOARD);
                        } else if (isSupabaseConfigured() && user && rid) {
                            (async () => {
                                try {
                                    const { data } = await supabase
                                        .from('transactions')
                                        .select('*')
                                        .eq('user_id', user.id)
                                        .eq('tx_hash', rid)
                                        .maybeSingle();
                                    if (data) {
                                        const item: any = {
                                            id: data.id,
                                            type: data.type,
                                            amount: Number(data.amount) || 0,
                                            timestamp: new Date(data.created_at).getTime(),
                                            status: data.status,
                                            onChain: data.on_chain || false,
                                            txHash: data.tx_hash || undefined,
                                            counterparty: data.counterparty || undefined,
                                        };
                                        // Also splice it into local history so
                                        // subsequent clicks resolve locally.
                                        setUser(prev => prev ? {
                                            ...prev,
                                            transactionHistory: prev.transactionHistory?.some((x: any) => x.id === item.id)
                                                ? prev.transactionHistory
                                                : [item, ...(prev.transactionHistory ?? [])],
                                        } : null);
                                        setAppOrderDetails({ kind: 'TRANSACTION', item } as any);
                                    }
                                } catch (_) { /* swallow — toast already told them what happened */ }
                                setActiveTab(TabView.DASHBOARD);
                            })();
                        } else {
                            setActiveTab(TabView.DASHBOARD);
                        }
                    } else {
                        // SUCCESS / ERROR / INFO and anything unknown — no route, the toast already said it.
                    }
                }} isNotifOpen={notifOpen} setNotifOpen={(open: boolean) => {
                    setNotifOpen(open);
                    if (open && user && isSupabaseConfigured()) {
                        // Always pull the latest notifications from Supabase when the
                        // panel opens, so existing/older rows show — not just realtime ones.
                        fetchNotifications(user.id).then(fresh => {
                            if (fresh.length > 0) {
                                setNotifications(prev => {
                                    const ids = new Set(fresh.map((n: any) => n.id));
                                    const localOnly = (prev || []).filter((n: any) => !ids.has(n.id));
                                    return [...fresh, ...localOnly];
                                });
                            }
                        }).catch(() => {});
                        // Mark all read shortly after (clears the unread highlight).
                        setTimeout(() => {
                            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
                            markAllNotificationsRead(user.id).catch(() => {});
                        }, 800);
                    }
                }} totalEquity={totalEquity}/>
            {/* Main content — top offset for fixed navbar (64px mobile / 60px+4px desktop) */}
            <main className={`w-full velo-main ${activeTab === TabView.TRADE ? 'trade-view' : 'pb-24 lg:pb-8'}`} style={{ position: 'relative', zIndex: 1, paddingLeft: activeTab === TabView.TRADE ? 0 : 'clamp(16px, 3vw, 48px)', paddingRight: activeTab === TabView.TRADE ? 0 : 'clamp(16px, 3vw, 48px)' }}>
                {activeTab === TabView.DASHBOARD && user && <Dashboard user={user} positions={positions} marketPrices={marketPrices} handleClosePosition={handleClosePosition} traders={traders} handleDeposit={handleDeposit} handleWithdraw={handleWithdraw} onEditPosition={handleEditPosition} onViewProfile={handleViewProfile} handleCopyTrade={handleCopyTrade} totalEquity={totalEquity} totalLockedMargin={totalLockedMargin} totalUnrealizedPnl={totalUnrealizedPnl} buyingPower={buyingPower} theme={theme} tradingWalletAddress={burnerAddress}
                  pendingDeposits={pendingDeposits}
                  onResumeOnboarding={() => {
                    if (veloPerpsTrading.usingBurner) setVeloDepositOpen(true);
                    else setVeloWelcomeOpen(true);
                  }}
                  onClaimTestnetUsdc={handleClaimTestnetUsdc}
                  claimingFaucet={claimingFaucet}
                  onOpenOrderlyOnboarding={() => {
                    if (veloPerpsTrading.usingBurner) setVeloDepositOpen(true);
                    else setVeloWelcomeOpen(true);
                  }}
                  onOpenDeposit={() => {
                    // Post-setup: open the proper deposit modal (main → burner).
                    // Pre-setup: kick the user through the one-time signature first.
                    if (veloPerpsTrading.usingBurner) setVeloDepositOpen(true);
                    else setVeloWelcomeOpen(true);
                  }}
                  onOpenSend={() => setVeloSendOpen(true)}
                  // onOpenBridge intentionally not passed — the standalone
                  // "Bridge" button was confusing (users don't think in terms
                  // of bridges, they think in terms of "deposit from Optimism").
                  // Cross-chain is now a network picker inside the unified
                  // Funds modal (VeloDepositModal). See that file's header
                  // comment for the design rationale.
                  onOpenWithdraw={() => {
                    // If burner exists, open the real withdraw modal.
                    // Otherwise direct them to onboarding.
                    if (veloPerpsTrading.usingBurner) setVeloWithdrawOpen(true);
                    else setToast({ message: 'Complete onboarding first to get a trading wallet.', type: 'INFO' });
                  }}
                />}
                {activeTab === TabView.TRADE && <>


                  <TradeView activePair={activePair} setActivePair={(pair: any) => { setActivePair(pair); updatePrefs({ activePair: pair.id }); fetchPythKlines(pair.id, '15m').then(klineCandles => { if (klineCandles.length > 0) setCandles(prev => ({ ...prev, [pair.id]: klineCandles })); }); }} marketPrices={marketPrices} marketChanges={marketChanges} candles={candles} user={user} positions={positions} openOrders={openOrders} onOpenPosition={handleOpenPosition} onClosePosition={handleClosePosition} handleCancelOrder={handleCancelOrder} onRequireAuth={handleRequireAuth} onEditPosition={handleEditPosition} onOpenCrossAccount={(tab?: 'DEPOSIT' | 'WITHDRAW') => { setCrossAccountTab(tab || 'DEPOSIT'); setCrossAccountOpen(true); }} crossFreeBalance={veloPerpsTrading.crossFreeBalance} crossTotalBalance={veloPerpsTrading.crossTotalBalance} onSharePosition={(p: any) => {
                    const cp = marketPrices[p.pair] || p.entryPrice;
                    const pnl = (cp - p.entryPrice) * (p.side === 'LONG' ? 1 : -1) * (p.size / p.entryPrice);
                    const collateral = p.size / p.leverage;
                    setShareCardData({
                      pair: p.pair,
                      side: p.side as 'LONG' | 'SHORT',
                      leverage: p.leverage,
                      entryPrice: p.entryPrice,
                      markPrice: cp,
                      size: p.size,
                      collateral,
                      pnl,
                      pnlPct: (pnl / collateral) * 100,
                      traderHandle: user?.handle,
                      status: 'OPEN',
                    });
                  }} onShareHistory={(t: any) => {
                    // History rows show closed trades. Open the share card with
                    // close-state data so the user can post their realised PnL.
                    const collateral = t.size && t.leverage ? t.size / t.leverage : (t.collateralUSDC || 0);
                    const pnlPct = collateral > 0 ? (t.pnl / collateral) * 100 : 0;
                    setShareCardData({
                      pair: t.pair,
                      side: t.side as 'LONG' | 'SHORT',
                      leverage: t.leverage,
                      entryPrice: t.entryPrice,
                      closePrice: t.exitPrice || t.price,
                      size: t.size,
                      collateral,
                      pnl: t.pnl,
                      pnlPct,
                      traderHandle: user?.handle,
                      status: t.pnl < -collateral * 0.9 ? 'LIQUIDATED' : 'CLOSED',
                    });
                  }} appTheme={theme} onTimeframeChange={(tf: ChartTimeframe) => {
                    // Fetch real OHLCV candles for the active pair at the new timeframe.
                    fetchPythKlines(activePair.id, tf).then(klineCandles => {
                        if (klineCandles.length > 0) {
                            setCandles(prev => ({ ...prev, [activePair.id]: klineCandles }));
                        }
                    });
                    updatePrefs({ chartTf: tf });
                }}
                savedChartPrefs={chartPrefs}
                onChartPrefsChange={(patch: Partial<UserPreferences>) => {
                    setChartPrefs((prev: any) => ({ ...prev, ...patch }));
                    updatePrefs(patch);
                }}
                tradeFocus={tradeFocus} autoOpenHistoryId={autoOpenHistoryId} orderlyBalance={veloPerpsTrading.usdcBalance} orderlyIsReady={veloPerpsTrading.isReady}
                isLiveMode={isLiveMode}
                orderlyPositions={[]}
                />
                </> }
                {activeTab === TabView.MARKETS && <MarketsView marketPrices={marketPrices} marketChanges={marketChanges} watchlist={watchlist} onToggleWatchlist={handleToggleWatchlist} onNavigateToTrade={(pair: any) => { setActivePair(pair); updatePrefs({ activePair: pair.id }); setActiveTab(TabView.TRADE); fetchPythKlines(pair.id, '15m').then(klineCandles => { if (klineCandles.length > 0) setCandles(prev => ({ ...prev, [pair.id]: klineCandles })); }); }} onNavigateToSocial={(ticker: string) => { setActiveSocialTicker(ticker); setActiveTab(TabView.SOCIAL); }}/>}
                {activeTab === TabView.SOCIAL && (singlePostId ? (
                    <SinglePostView postId={singlePostId} posts={posts} user={user} traders={traders} onLike={handleLike} onRepost={handleRepost} onComment={handleComment} onDeletePost={(id:string) => { handleDeletePostWithConfirm(id, async (pid) => { setPosts(prev => prev.filter(p => p.id !== pid)); if (isSupabaseConfigured()) await supabaseDeletePost(pid).catch(e => console.error('[velo] deletePost error:', e)); setSinglePostId(null); }); }} onDeleteComment={handleDeleteComment} onViewProfile={handleViewProfile} showUsersModal={(t:string, ids:string[]) => setUsersListModal({isOpen:true, title:t, userIds:ids})} handleCopyTrade={handleCopyTrade} onBack={() => { setSinglePostId(null); }} onTickerClick={(ticker: string) => { setSinglePostId(null); setActiveSocialTicker(ticker); }}/>
                ) : (
                    <SocialFeed traders={traders} posts={posts} user={user} handleFollow={handleFollow} handleCopyTrade={handleCopyTrade} onViewProfile={handleViewProfile} onPostCreate={handleCreatePost} onRequireAuth={handleRequireAuth} onLike={handleLike} onRepost={handleRepost} onComment={handleComment} showUsersModal={(t:string, ids:string[]) => setUsersListModal({isOpen:true, title:t, userIds:ids})} prices={marketPrices} changes={marketChanges} initialTicker={activeSocialTicker} onTickerChange={(t: string | null) => setActiveSocialTicker(t)} watchlist={watchlist} onToggleWatchlist={handleToggleWatchlist} onNavigateToTrade={(ticker: string) => { const pair = PAIRS.find(p => p.id.startsWith(ticker + '/')); if (pair) { setActivePair(pair); updatePrefs({ activePair: pair.id }); fetchPythKlines(pair.id, '15m').then(klineCandles => { if (klineCandles.length > 0) setCandles(prev => ({ ...prev, [pair.id]: klineCandles })); }); } setActiveTab(TabView.TRADE); }} onNavigateToMarkets={() => setActiveTab(TabView.MARKETS)} onDeletePost={(id:string) => { handleDeletePostWithConfirm(id, async (pid) => { setPosts(prev => prev.filter(p => p.id !== pid)); if (isSupabaseConfigured()) await supabaseDeletePost(pid).catch(e => console.error('[velo] deletePost error:', e)); }); }} onDeleteComment={handleDeleteComment} focusPostId={socialFocusPostId} openCommentsPostId={socialOpenCommentsPostId} onSinglePost={(id: string) => { setSinglePostId(id); }}/>
                ))}
                {activeTab === TabView.LEADERBOARD && <LeaderboardView traders={traders} user={user} walletAddress={walletAddress} handleFollow={handleFollow} handleCopyTrade={handleCopyTrade} handleViewProfile={handleViewProfile}/>}
                {activeTab === TabView.PROFILE && user && <ProfileView user={user} handleUpdateProfile={handleUpdateProfile} posts={posts} traders={traders} onPostCreate={handleCreatePost} positions={positions} onLike={handleLike} onRepost={handleRepost} onComment={handleComment} showUsersModal={(t:string, ids:string[]) => setUsersListModal({isOpen:true, title:t, userIds:ids})} onViewProfile={handleViewProfile} onDeletePost={(id:string) => { handleDeletePostWithConfirm(id, async (pid) => { setPosts(prev => prev.filter(p => p.id !== pid)); if (isSupabaseConfigured()) await supabaseDeletePost(pid).catch(e => console.error('[velo] deletePost error:', e)); }); }} onDeleteComment={handleDeleteComment} onDeleteAccount={handleDeleteAccount} onTickerClick={(ticker: string) => { setActiveSocialTicker(ticker); setActiveTab(TabView.SOCIAL); }}/>}
                {activeTab === TabView.PUBLIC_PROFILE && viewingProfile && <PublicProfileView trader={viewingProfile} user={user} posts={posts} traders={traders} onBack={() => setActiveTab(TabView.LEADERBOARD)} handleFollow={handleFollow} handleCopyTrade={handleCopyTrade} onRequireAuth={handleRequireAuth} onViewProfile={handleViewProfile} showUsersModal={(t:string, ids:string[]) => setUsersListModal({isOpen:true, title:t, userIds:ids})} positions={positions} onUpdateProfile={handleUpdateProfile} onLike={handleLike} onRepost={handleRepost} onComment={handleComment} onDeletePost={(id:string) => { handleDeletePostWithConfirm(id, async (pid) => { setPosts(prev => prev.filter(p => p.id !== pid)); if (isSupabaseConfigured()) await supabaseDeletePost(pid).catch(e => console.error('[velo] deletePost error:', e)); }); }} onDeleteComment={handleDeleteComment} onDeleteAccount={handleDeleteAccount} onPostCreate={handleCreatePost} marketPrices={marketPrices} onTickerClick={(ticker: string) => { setActiveSocialTicker(ticker); setActiveTab(TabView.SOCIAL); }}/>}
                {activeTab === TabView.ADMIN && <VeloAdminPanel />}
            </main>
            <MobileBottomNav activeTab={activeTab} setActiveTab={setActiveTab} user={user} onSocialClick={() => { setActiveSocialTicker(null); setSinglePostId(null); setActiveTab(TabView.SOCIAL); }} />
            {/* App-level order details modal — opened from notifications without tab switch */}
            {appOrderDetails && (
                <OrderDetailsModal
                    payload={appOrderDetails}
                    onClose={() => setAppOrderDetails(null)}
                    marketPrices={marketPrices}
                    onClosePosition={() => {}}
                    onEditPosition={() => {}}
                    handleCancelOrder={() => {}}
                />
            )}
            {/* Delete Post Confirmation Modal */}
            <DeletePostConfirmModal
                isOpen={deletePostConfirm.isOpen}
                onClose={() => setDeletePostConfirm({ isOpen: false, postId: null, onConfirm: null, itemType: 'post' })}
                onConfirm={() => { if (deletePostConfirm.onConfirm) deletePostConfirm.onConfirm(); }}
                itemType={deletePostConfirm.itemType}
            />
            {/* Create Post Modal (from navbar) */}
            <CreatePostModal
                isOpen={createPostModalOpen}
                onClose={() => setCreatePostModalOpen(false)}
                user={user}
                onSubmit={handleCreatePostFromModal}
                traders={traders}
            />
        </div>
        <PWAInstallBanner />
        </>
    )
}

export default App;
