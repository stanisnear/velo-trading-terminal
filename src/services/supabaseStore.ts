/**
 * supabaseStore.ts
 * ─────────────────────────────────────────────────────────────────
 * Single source of truth for ALL persistent data.
 * Zero localStorage. Zero mocks. Everything goes to Supabase.
 */

import { createClient, RealtimeChannel } from '@supabase/supabase-js';
import {
  Post, Comment, UserProfile, Position, OpenOrder,
  TradeHistoryItem, Transaction, Notification,
} from '../utils/types';

// ── Config ────────────────────────────────────────────────────────
const SUPABASE_URL     = import.meta.env.VITE_SUPABASE_URL     || 'https://btgfoekgvyvdflzjfehz.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0Z2ZvZWtndnl2ZGZsempmZWh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2NzU5NDIsImV4cCI6MjA5MjI1MTk0Mn0.8Z0Vce5RkSk2IS4tD4PAkCJ5XRtGeTMKHFx77we2_pU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'velo-auth-token',
  },
});

export const isConfigured = () =>
  SUPABASE_ANON_KEY !== 'YOUR_ANON_KEY_HERE' && SUPABASE_ANON_KEY.startsWith('eyJ');

// ── Persistence error broadcaster ─────────────────────────────────────────────
// Trade history and transaction inserts run fire-and-forget so trade UX isn't
// blocked by network latency. The downside is that when those inserts fail
// (RLS misconfigured, schema not migrated, network blip), the rows show up in
// the local UI but vanish on next refresh — and the only sign anything went
// wrong was a console.warn buried in devtools.
//
// This event bus surfaces every insert failure so App.tsx can show ONE
// non-spammy toast per failure category. The actual error is also still
// logged via console.error so it's grep-able in Vercel logs / Sentry.
type PersistenceErrorKind = 'TRADE_HISTORY' | 'TRANSACTION' | 'POSITION' | 'PROFILE_SYNC';
export interface PersistenceError {
  kind: PersistenceErrorKind;
  message: string;
  code?: string;
  hint?: string;
}
type PersistenceErrorListener = (err: PersistenceError) => void;
const _persistenceListeners = new Set<PersistenceErrorListener>();
export function onPersistenceError(fn: PersistenceErrorListener) {
  _persistenceListeners.add(fn);
  return () => { _persistenceListeners.delete(fn); };
}
function reportPersistenceError(err: PersistenceError) {
  console.error(`[velo:persist:${err.kind}]`, err.message, err.code ? `(code=${err.code})` : '', err.hint ? `→ ${err.hint}` : '');
  _persistenceListeners.forEach(fn => { try { fn(err); } catch { /* ignore listener errors */ } });
}
function hintFromCode(code: string | undefined): string | undefined {
  switch (code) {
    case '42501':   return 'Row-Level Security blocked the insert — apply SUPABASE_MIGRATION_RLS_ACTIVITY.sql.';
    case '42703':   return 'Column does not exist — run the latest Supabase migration.';
    case 'PGRST204':return 'PostgREST schema cache is stale or the column is missing — re-run the migration and reload the schema cache.';
    case '23503':   return 'Foreign key violation — the user_id may not match auth.uid().';
    case '23505':   return 'Duplicate row — this insert may already exist.';
    case '23514':   return 'A CHECK constraint rejected the row — run the latest Supabase migration.';
    case 'PGRST301':return 'No matching row visible to this auth user — check RLS SELECT policy.';
    default:        return undefined;
  }
}

function isMissingColumnError(error: { code?: string; message?: string; details?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === '42703' || error.code === 'PGRST204') return true;
  const details = `${error.message || ''} ${error.details || ''}`.toLowerCase();
  return details.includes('schema cache') && details.includes('column');
}

// ══════════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════════

export async function signUp(email: string, password: string, username: string) {
  const handle = `@${username.replace(/\s+/g, '')}`;

  // ── Username uniqueness check (case-insensitive) ─────────────────
  const { data: existing, error: checkErr } = await supabase
    .from('profiles')
    .select('id')
    .ilike('username', username.trim())
    .maybeSingle();
  if (checkErr && checkErr.code !== 'PGRST116') {
    console.warn('[signUp] username check error:', checkErr.message);
  }
  if (existing) {
    return { user: null, error: `Username "${username}" is already taken. Please choose a different one.` };
  }

  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { username, handle } },
  });
  if (error) return { user: null, error: error.message };
  // Profile is auto-created by the DB trigger on auth.users INSERT.
  // We upsert here as a safety net in case the trigger is slow or the user
  // signed up before the trigger existed.
  if (data.user) {
    const { error: profileErr } = await supabase.from('profiles').upsert({
      id: data.user.id, username, handle,
      avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
      banner_url: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=1000&q=80',
      balance: 0,
      auth_method: 'EMAIL',
    }, { onConflict: 'id' });
    if (profileErr) console.error('[supabase] profile upsert on signup:', profileErr.message);
  }
  return { user: data.user, error: null };
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { user: null, error: error.message };
  return { user: data.user, error: null };
}

/**
 * Sign out and clear all session-related localStorage caches. This is the
 * authoritative logout path — components should call this rather than
 * `supabase.auth.signOut()` directly so the in-memory session cache and any
 * other transient client state are cleared atomically.
 *
 * Note: we intentionally do NOT clear the burner-wallet entry
 * (`velo_burner_<owner>`). The burner is a deterministic sub-account derived
 * from the owner's signature — surviving logout is the desired behaviour so
 * the user doesn't have to re-sign on every re-login. To rotate it, use
 * `rederiveVeloBurner()` from the Settings panel.
 */
export async function signOut() {
  // Clear the UI snapshot first so any in-flight reads see no session.
  try { localStorage.removeItem('velo_session_v1'); } catch {}
  // Best-effort: drop any Supabase realtime channels so we don't leak
  // subscriptions across login boundaries.
  try {
    const channels = supabase.getChannels?.() || [];
    for (const ch of channels) {
      try { await supabase.removeChannel(ch); } catch {}
    }
  } catch {}
  await supabase.auth.signOut();
}
export async function getCurrentSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

// ══════════════════════════════════════════════════════════════════
// PROFILES
// ══════════════════════════════════════════════════════════════════

export async function getProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles').select('*').eq('id', userId).single();
  return { profile: data, error };
}

export async function updateProfile(userId: string, updates: Record<string, any>) {
  const { error } = await supabase.from('profiles').update(updates).eq('id', userId);
  return { error };
}

export async function fetchAllProfiles(limit = 50) {
  // Include wallet_address + auth_method + verified_reason so the leaderboard
  // can filter demo accounts and the UI can render the verified badge. Use
  // a column-explicit select with two fallbacks if the latest columns aren't
  // yet present (older DB schemas).
  let { data, error } = await supabase
    .from('profiles')
    .select('id, username, handle, avatar_url, banner_url, bio, pnl_total, realized_pnl, win_rate, velo_rewards, copier_count, earned_fees, follower_count, following_count, copying, wallet_address, auth_method, verified_reason, created_at')
    .order('pnl_total', { ascending: false })
    .limit(limit);
  // If verified_reason is missing (pre-build-80), retry without it.
  if (isMissingColumnError(error as any)) {
    const r2 = await supabase
      .from('profiles')
      .select('id, username, handle, avatar_url, banner_url, bio, pnl_total, realized_pnl, win_rate, velo_rewards, copier_count, earned_fees, follower_count, following_count, copying, wallet_address, auth_method, created_at')
      .order('pnl_total', { ascending: false })
      .limit(limit);
    data = r2.data as any;
    error = r2.error;
    if (!r2.error) console.warn('[supabase] profiles missing verified_reason column — run SUPABASE_MIGRATION_BUILD80.sql.');
    // If wallet_address / auth_method are ALSO missing (pre-build-79), retry once more.
    if (isMissingColumnError(r2.error as any)) {
      const r3 = await supabase
        .from('profiles')
        .select('id, username, handle, avatar_url, banner_url, bio, pnl_total, realized_pnl, win_rate, velo_rewards, copier_count, earned_fees, follower_count, following_count, copying, created_at')
        .order('pnl_total', { ascending: false })
        .limit(limit);
      data = r3.data as any;
      error = r3.error;
      if (!r3.error) console.warn('[supabase] profiles missing wallet-address/auth-method columns in schema cache — run SUPABASE_MIGRATION_BUILD79.sql and reload PostgREST schema.');
    }
  }
  // If the direct table read returned empty (likely RLS blocking authenticated
  // role due to policy drift), fall back to the security-definer RPC which
  // bypasses RLS entirely. This is the guaranteed fallback path.
  if ((!data || data.length === 0) && !error) {
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_public_profiles', { lim: limit });
      if (!rpcError && rpcData && rpcData.length > 0) {
        console.warn('[supabase] fetchAllProfiles: direct table read returned empty, RPC fallback succeeded — run SUPABASE_MIGRATION_SOCIAL_FIX.sql to fix RLS.');
        return { data: rpcData, error: null };
      }
    } catch (_) {
      // RPC doesn't exist yet — migration not run. Return empty, withRetry will handle it.
    }
  }
  return { data, error };
}

/** Map a DB profile row → UserProfile shape used in the app */
export function dbProfileToUserProfile(row: any): UserProfile {
  return {
    id:                  row.id,
    username:            row.username || 'Trader',
    handle:              row.handle   || `@${row.username}`,
    bio:                 row.bio      || '',
    avatar:              row.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${row.username}`,
    banner:              row.banner_url || '',
    balance:             row.balance   ?? 0,
    pnlTotal:            row.pnl_total ?? 0,
    realizedPnL:         row.realized_pnl ?? 0,
    following:           row.following ?? [],
    copying:             row.copying   ?? [],
    followers:           [],                        // derived from follows table
    copierCount:         row.copier_count ?? 0,
    earnedFees:          row.earned_fees  ?? 0,
    veloRewards:         row.velo_rewards ?? 50,
    tradeHistory:        [],                        // loaded separately
    transactionHistory:  [],                        // loaded separately
    pnlHistory:          [],
    joinedDate:          row.created_at  || new Date().toISOString(),
    likes:               [],
    reposts:             [],
    email:               row.email || '',
    walletAddress:       row.wallet_address || undefined,
    veloWalletAddress:   row.velo_wallet_address || undefined,
    verifiedReason:      row.verified_reason || null,
  };
}

export async function uploadAvatar(userId: string, file: File) {
  const ext  = file.name.split('.').pop();
  const path = `${userId}/avatar.${ext}`;
  const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
  if (uploadError) return { url: null, error: uploadError.message };
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  await updateProfile(userId, { avatar_url: data.publicUrl });
  return { url: data.publicUrl, error: null };
}

export async function uploadBanner(userId: string, file: File) {
  const ext  = file.name.split('.').pop();
  const path = `${userId}/banner.${ext}`;
  const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
  if (uploadError) return { url: null, error: uploadError.message };
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  await updateProfile(userId, { banner_url: data.publicUrl });
  return { url: data.publicUrl, error: null };
}

// ══════════════════════════════════════════════════════════════════
// FOLLOWS
// ══════════════════════════════════════════════════════════════════

export async function getFollowing(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from('follows').select('following_id').eq('follower_id', userId);
  return (data || []).map((r: any) => r.following_id);
}

export async function toggleFollow(followerId: string, followingId: string) {
  const { data: existing } = await supabase
    .from('follows').select('id').eq('follower_id', followerId).eq('following_id', followingId).maybeSingle();
  if (existing) {
    await supabase.from('follows').delete().eq('follower_id', followerId).eq('following_id', followingId);
    // Decrement counts (best-effort — RPC may not be deployed yet)
    try { await supabase.rpc('decrement_follow_counts', { follower: followerId, following: followingId }); } catch (_) {}
    return { following: false };
  }
  await supabase.from('follows').insert({ follower_id: followerId, following_id: followingId });
  // Increment counts (best-effort — RPC may not be deployed yet)
  try { await supabase.rpc('increment_follow_counts', { follower: followerId, following: followingId }); } catch (_) {}
  return { following: true };
}

// ══════════════════════════════════════════════════════════════════
// POSTS
// ══════════════════════════════════════════════════════════════════

async function _enrichPosts(posts: any[]): Promise<Post[]> {
  if (!posts || posts.length === 0) return [];
  const postIds = posts.map((p: any) => p.id);

  const [{ data: likesRaw }, { data: commentsRaw }, { data: repostsRaw }] = await Promise.all([
    supabase.from('likes').select('post_id, user_id').in('post_id', postIds),
    supabase.from('comments')
      .select('id, post_id, author_id, content, created_at, profiles!author_id(username, handle, avatar_url)')
      .in('post_id', postIds).order('created_at', { ascending: true }),
    supabase.from('reposts').select('post_id, user_id').in('post_id', postIds),
  ]);

  const likesMap:    Record<string, string[]>  = {};
  const commentsMap: Record<string, Comment[]> = {};
  const repostsMap:  Record<string, string[]>  = {};

  (likesRaw || []).forEach((l: any) => {
    if (!likesMap[l.post_id]) likesMap[l.post_id] = [];
    likesMap[l.post_id].push(l.user_id);
  });
  (commentsRaw || []).forEach((c: any) => {
    if (!commentsMap[c.post_id]) commentsMap[c.post_id] = [];
    commentsMap[c.post_id].push({
      id: c.id, authorId: c.author_id,
      authorHandle: c.profiles?.handle || '@unknown',
      authorAvatar: c.profiles?.avatar_url || '',
      content: c.content, timestamp: c.created_at,
    });
  });
  (repostsRaw || []).forEach((r: any) => {
    if (!repostsMap[r.post_id]) repostsMap[r.post_id] = [];
    repostsMap[r.post_id].push(r.user_id);
  });

  return posts.map((p: any): Post => ({
    id:            p.id,
    authorId:      p.author_id,
    authorHandle:  p.profiles?.handle     || '@unknown',
    authorAvatar:  p.profiles?.avatar_url || '',
    content:       p.content,
    image:         p.image_url,
    timestamp:     p.created_at,
    likes:         (likesMap[p.id]    || []).length,
    likedBy:       likesMap[p.id]    || [],
    reposts:       (repostsMap[p.id] || []).length,
    repostedBy:    repostsMap[p.id]  || [],
    comments:      commentsMap[p.id] || [],
    isTradeSignal:   p.is_trade_signal || false,
    targetProfileId: p.target_profile_id || undefined,
    tradeDetails:    p.is_trade_signal
      ? { pair: p.trade_pair, side: p.trade_side, leverage: p.trade_leverage, entry: p.trade_entry }
      : undefined,
  }));
}

export async function fetchPosts(limit = 50): Promise<Post[]> {
  const { data, error } = await supabase
    .from('posts')
    .select('*, profiles!author_id(username, handle, avatar_url)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return _enrichPosts(data);
}

export async function createPost(
  authorId: string,
  content: string,
  imageUrl?: string,
  tradeSignal?: { pair: string; side: string; leverage: number; entry: number },
  targetProfileId?: string,
) {
  const { data, error } = await supabase.from('posts').insert({
    author_id: authorId, content, image_url: imageUrl || null,
    is_trade_signal: !!tradeSignal,
    trade_pair:     tradeSignal?.pair     || null,
    trade_side:     tradeSignal?.side     || null,
    trade_leverage: tradeSignal?.leverage || null,
    trade_entry:    tradeSignal?.entry    || null,
    target_profile_id: targetProfileId || null,
  }).select().single();
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function deletePost(postId: string) {
  const { error } = await supabase.from('posts').delete().eq('id', postId);
  return { error: error?.message || null };
}

export async function toggleLike(userId: string, postId: string) {
  const { data: existing } = await supabase
    .from('likes').select('id').eq('user_id', userId).eq('post_id', postId).maybeSingle();
  if (existing) {
    await supabase.from('likes').delete().eq('user_id', userId).eq('post_id', postId);
    return { liked: false };
  }
  await supabase.from('likes').insert({ user_id: userId, post_id: postId });
  return { liked: true };
}

export async function toggleRepost(userId: string, postId: string) {
  const { data: existing } = await supabase
    .from('reposts').select('id').eq('user_id', userId).eq('post_id', postId).maybeSingle();
  if (existing) {
    await supabase.from('reposts').delete().eq('user_id', userId).eq('post_id', postId);
    return { reposted: false };
  }
  await supabase.from('reposts').insert({ user_id: userId, post_id: postId });
  return { reposted: true };
}

export async function addComment(postId: string, authorId: string, content: string) {
  const { data, error } = await supabase
    .from('comments')
    .insert({ post_id: postId, author_id: authorId, content })
    .select('id, post_id, author_id, content, created_at')
    .single();
  return { data, error: error?.message || null };
}

export async function deleteComment(commentId: string, authorId: string) {
  // RLS: only the comment author can delete their own comment
  const { error } = await supabase
    .from('comments')
    .delete()
    .eq('id', commentId)
    .eq('author_id', authorId);
  return { error: error?.message || null };
}

/**
 * Permanently delete the current user's account and ALL associated data.
 *
 * Primary path: a SECURITY DEFINER RPC (`delete_own_auth_user`) deletes the
 * auth.users row. Every dependent table has ON DELETE CASCADE pointing at
 * public.profiles(id), and profiles(id) references auth.users(id) with
 * cascade — so a single delete on auth.users wipes EVERYTHING atomically.
 *
 * Fallback path (only used if the RPC isn't deployed yet): delete the
 * profile row directly (still cascades to every dependent table), then
 * sign the user out. Username is freed the moment auth.users is gone.
 */
export async function deleteAccount(userId: string): Promise<{ error: string | null }> {
  // Primary: single-shot auth-row delete, everything cascades.
  const { error: authErr } = await supabase.rpc('delete_own_auth_user');
  if (authErr) {
    console.warn('[deleteAccount] RPC failed, falling back to profile delete:', authErr.message);
    // Fallback: delete the profile row. Cascades to every FK-dependent table.
    // NOTE: this leaves auth.users orphaned — username will NOT be freed until
    // the RPC is deployed. Deploy the RPC from SUPABASE_SCHEMA.sql to fix.
    const { error: profileErr } = await supabase.from('profiles').delete().eq('id', userId);
    if (profileErr) {
      await supabase.auth.signOut();
      return { error: profileErr.message };
    }
  }

  await supabase.auth.signOut();
  return { error: null };
}

// ══════════════════════════════════════════════════════════════════
// POSITIONS (persisted per user)
// ══════════════════════════════════════════════════════════════════

export async function fetchPositions(userId: string): Promise<Position[]> {
  const { data } = await supabase
    .from('positions').select('*').eq('user_id', userId);
  return (data || []).map((r: any): Position => ({
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
    timestamp:        new Date(r.created_at).getTime(),
    isCopyTrade:      r.is_copy_trade || false,
    copyTraderId:     r.copy_trader_id || undefined,
    // On-chain metadata — may be null on rows written before the migration
    onChain:          r.on_chain || false,
    orderlyOrderId:   r.orderly_order_id != null ? Number(r.orderly_order_id) : undefined,
    orderlyOrderUrl:  r.orderly_order_url || undefined,
  }));
}

/** Save a new position. Lets Postgres generate the UUID and returns it.
 *  If pos.id is already a real DB UUID (from a previous save) it upserts in-place. */
export async function savePosition(userId: string, pos: Position): Promise<string | null> {
  const isDbUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pos.id);
  const baseRow: Record<string, any> = {
    user_id:           userId,
    pair:              pos.pair,
    side:              pos.side,
    entry_price:       pos.entryPrice,
    size:              pos.size,
    leverage:          pos.leverage,
    margin_mode:       pos.marginMode || 'ISOLATED',
    liquidation_price: pos.liquidationPrice,
    take_profit:       pos.takeProfit  || null,
    stop_loss:         pos.stopLoss    || null,
    is_copy_trade:     pos.isCopyTrade || false,
    copy_trader_id:    pos.copyTraderId || null,
  };
  const enrichedRow: Record<string, any> = {
    ...baseRow,
    on_chain:          pos.onChain || false,
    orderly_order_id:  pos.orderlyOrderId  || null,
    orderly_order_url: pos.orderlyOrderUrl || null,
  };
  if (isDbUuid) { baseRow.id = pos.id; enrichedRow.id = pos.id; }

  let { data, error } = await supabase
    .from('positions')
    .upsert(enrichedRow, { onConflict: isDbUuid ? 'id' : undefined })
    .select('id')
    .single();

  // Missing-column/schema-cache errors mean the DB is older than the frontend
  // or PostgREST hasn't noticed a fresh migration yet. Retry with the legacy payload.
  if (isMissingColumnError(error as any)) {
    const retry = await supabase
      .from('positions')
      .upsert(baseRow, { onConflict: isDbUuid ? 'id' : undefined })
      .select('id')
      .single();
    data  = retry.data;
    error = retry.error;
  }

  if (error) {
    console.error('[supabase] savePosition error:', error.message, error.details);
    return null;
  }
  return data?.id ?? null;
}

export async function updatePositionInDB(posId: string, updates: Record<string, any>) {
  await supabase.from('positions').update(updates).eq('id', posId);
}

export async function deletePosition(posId: string) {
  await supabase.from('positions').delete().eq('id', posId);
}

// ══════════════════════════════════════════════════════════════════
// OPEN ORDERS
// ══════════════════════════════════════════════════════════════════

export async function fetchOpenOrders(userId: string): Promise<OpenOrder[]> {
  const { data } = await supabase
    .from('open_orders').select('*').eq('user_id', userId);
  return (data || []).map((r: any): OpenOrder => ({
    id:                r.id,
    pair:              r.pair,
    side:              r.side,
    type:              r.order_type,
    price:             r.price,
    size:              r.size,
    leverage:          r.leverage,
    timestamp:         new Date(r.created_at).getTime(),
    relatedPositionId: r.related_position_id || undefined,
    copyTraderId:      r.copy_trader_id       || undefined,
    onChain:           r.on_chain || false,
    orderlyOrderId:    r.orderly_order_id != null ? Number(r.orderly_order_id) : undefined,
    orderlyOrderUrl:   r.orderly_order_url || undefined,
  }));
}

export async function saveOpenOrder(userId: string, order: OpenOrder): Promise<string | null> {
  const isDbUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(order.id);
  const baseRow: Record<string, any> = {
    user_id:             userId,
    pair:                order.pair,
    side:                order.side,
    order_type:          order.type,
    price:               order.price,
    size:                order.size,
    leverage:            order.leverage,
    related_position_id: order.relatedPositionId || null,
    copy_trader_id:      order.copyTraderId       || null,
  };
  const enrichedRow: Record<string, any> = {
    ...baseRow,
    on_chain:          order.onChain || false,
    orderly_order_id:  order.orderlyOrderId || null,
    orderly_order_url: order.orderlyOrderUrl || null,
  };
  if (isDbUuid) { baseRow.id = order.id; enrichedRow.id = order.id; }

  let { data, error } = await supabase
    .from('open_orders')
    .upsert(enrichedRow, { onConflict: isDbUuid ? 'id' : undefined })
    .select('id')
    .single();
  if (isMissingColumnError(error as any)) {
    const retry = await supabase
      .from('open_orders')
      .upsert(baseRow, { onConflict: isDbUuid ? 'id' : undefined })
      .select('id')
      .single();
    data  = retry.data;
    error = retry.error;
  }
  if (error) { console.error('[supabase] saveOpenOrder error:', error.message); return null; }
  return data?.id ?? null;
}

export async function deleteOpenOrder(orderId: string) {
  await supabase.from('open_orders').delete().eq('id', orderId);
}

export async function deleteOrdersForPosition(positionId: string) {
  await supabase.from('open_orders').delete().eq('related_position_id', positionId);
}

// ══════════════════════════════════════════════════════════════════
// TRADE HISTORY
// ══════════════════════════════════════════════════════════════════

export async function fetchTradeHistory(userId: string, limit = 100): Promise<TradeHistoryItem[]> {
  const { data, error } = await supabase
    .from('trade_history').select('*')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(limit);
  if (error) {
    console.error('[supabase] fetchTradeHistory error:', error.message, error.code);
    // Retry once after a short delay — covers JWT-not-yet-active on page load
    await new Promise(r => setTimeout(r, 800));
    const retry = await supabase
      .from('trade_history').select('*')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(limit);
    if (retry.error) {
      console.error('[supabase] fetchTradeHistory retry failed:', retry.error.message);
      return [];
    }
    return (retry.data || []).map((r: any): TradeHistoryItem => ({
      id:               r.id,
      pair:             r.pair,
      side:             r.side,
      entryPrice:       r.entry_price,
      exitPrice:        r.exit_price,
      size:             r.size,
      pnl:              r.pnl,
      timestamp:        new Date(r.created_at).getTime(),
      action:           r.action,
      copyTraderId:     r.copy_trader_id || undefined,
      leverage:         r.leverage != null ? Number(r.leverage) : undefined,
      marginMode:       r.margin_mode || undefined,
      liquidationPrice: r.liquidation_price != null ? Number(r.liquidation_price) : undefined,
      openedAt:         r.opened_at ? new Date(r.opened_at).getTime() : undefined,
      onChain:          r.on_chain || false,
      orderlyOrderId:   r.orderly_order_id != null ? Number(r.orderly_order_id) : undefined,
      orderlyOrderUrl:  r.orderly_order_url || undefined,
      txHash:           r.tx_hash || undefined,
    }));
  }
  return (data || []).map((r: any): TradeHistoryItem => ({
    id:               r.id,
    pair:             r.pair,
    side:             r.side,
    entryPrice:       r.entry_price,
    exitPrice:        r.exit_price,
    size:             r.size,
    pnl:              r.pnl,
    timestamp:        new Date(r.created_at).getTime(),
    action:           r.action,
    copyTraderId:     r.copy_trader_id || undefined,
    // Enriched fields — may be null on rows written before the schema migration
    leverage:         r.leverage != null ? Number(r.leverage) : undefined,
    marginMode:       r.margin_mode || undefined,
    liquidationPrice: r.liquidation_price != null ? Number(r.liquidation_price) : undefined,
    openedAt:         r.opened_at ? new Date(r.opened_at).getTime() : undefined,
    // On-chain metadata — nullable for same reason
    onChain:          r.on_chain || false,
    orderlyOrderId:   r.orderly_order_id != null ? Number(r.orderly_order_id) : undefined,
    orderlyOrderUrl:  r.orderly_order_url || undefined,
    txHash:           r.tx_hash || undefined,
  }));
}

export async function insertTradeHistory(userId: string, trade: TradeHistoryItem) {
  // Three-tier fallback:
  //   1. Try with enriched + on-chain columns
  //   2. If the on-chain columns are missing OR PostgREST still has a stale
  //      schema cache — retry with enriched only
  //   3. If the enriched columns are also missing — retry with base legacy only
  // This way users never lose history even on stale databases.
  const basePayload: Record<string, any> = {
    user_id:        userId,
    pair:           trade.pair,
    side:           trade.side,
    entry_price:    trade.entryPrice,
    exit_price:     trade.exitPrice || null,
    size:           trade.size,
    pnl:            trade.pnl,
    action:         trade.action || 'OPEN',
    copy_trader_id: trade.copyTraderId || null,
  };
  const enrichedPayload = {
    ...basePayload,
    leverage:          trade.leverage != null ? trade.leverage : null,
    margin_mode:       trade.marginMode || null,
    liquidation_price: trade.liquidationPrice != null ? trade.liquidationPrice : null,
    opened_at:         trade.openedAt ? new Date(trade.openedAt).toISOString() : null,
  };
  const onChainPayload = {
    ...enrichedPayload,
    on_chain:          trade.onChain || false,
    orderly_order_id:  trade.orderlyOrderId || null,
    orderly_order_url: trade.orderlyOrderUrl || null,
    tx_hash:           trade.txHash || null,
  };

  let { error } = await supabase.from('trade_history').insert(onChainPayload);

  if (isMissingColumnError(error as any)) {
    // Missing on-chain columns — retry with enriched only
    const r2 = await supabase.from('trade_history').insert(enrichedPayload);
    error = r2.error;
    if (!r2.error) {
      console.warn('[supabase] trade_history missing on-chain columns in schema/cache — run the latest migration to persist explorer metadata.');
    } else if (isMissingColumnError(r2.error as any)) {
      // Missing enriched columns too — last-ditch legacy insert
      const r3 = await supabase.from('trade_history').insert(basePayload);
      error = r3.error;
      if (!r3.error) {
        console.warn('[supabase] trade_history missing enriched columns — run schema migration.');
      }
    }
  }
  if (error) {
    console.error('[supabase] insertTradeHistory error:', error.message);
    reportPersistenceError({
      kind: 'TRADE_HISTORY',
      message: `Trade not saved: ${error.message}`,
      code: (error as any).code,
      hint: hintFromCode((error as any).code),
    });
  }
}

// ══════════════════════════════════════════════════════════════════
// TRANSACTIONS
// ══════════════════════════════════════════════════════════════════

export async function fetchTransactions(userId: string): Promise<Transaction[]> {
  const mapRow = (r: any): Transaction => ({
    id: r.id, type: r.type, amount: r.amount,
    timestamp: new Date(r.created_at).getTime(), status: r.status,
    onChain:       r.on_chain || false,
    txHash:        r.tx_hash || undefined,
    withdrawNonce: r.withdraw_nonce != null ? Number(r.withdraw_nonce) : undefined,
    counterparty:  r.counterparty || undefined,
  });
  const { data, error } = await supabase
    .from('transactions').select('*')
    .eq('user_id', userId).order('created_at', { ascending: false });
  if (error) {
    console.error('[supabase] fetchTransactions error:', error.message, error.code);
    // Retry once after a short delay — covers JWT-not-yet-active on page load
    await new Promise(r => setTimeout(r, 800));
    const retry = await supabase
      .from('transactions').select('*')
      .eq('user_id', userId).order('created_at', { ascending: false });
    if (retry.error) {
      console.error('[supabase] fetchTransactions retry failed:', retry.error.message);
      return [];
    }
    return (retry.data || []).map(mapRow);
  }
  return (data || []).map(mapRow);
}

export async function recordTransaction(
  userId: string,
  type: 'DEPOSIT' | 'WITHDRAW' | 'SEND' | 'RECEIVE',
  amount: number,
  onChainMeta?: {
    txHash?: string;
    withdrawNonce?: number;
    onChain?: boolean;
    /** For SEND/RECEIVE: the counterparty's address or @handle, displayed in the activity row. */
    counterparty?: string;
  },
): Promise<void> {
  // Idempotency: if this is a faucet credit (txHash starts with `faucet:`)
  // and we've already recorded one for this user with the SAME txHash, skip.
  // The Orderly faucet only credits once per address — re-running onboarding
  // (or any retry path) should never produce a second $1000 row.
  if (onChainMeta?.txHash?.startsWith('faucet:')) {
    const { data: existing } = await supabase
      .from('transactions')
      .select('id')
      .eq('user_id', userId)
      .eq('tx_hash', onChainMeta.txHash)
      .limit(1);
    if (existing && existing.length > 0) {
      console.info('[supabase] faucet credit already recorded — skipping duplicate insert');
      return;
    }
  }
  // Build the insert payload. If on-chain metadata is provided we try to insert
  // it; if the columns haven't been migrated yet we fall back silently.
  const basePayload: Record<string, any> = {
    user_id: userId, type, amount,
    status: type === 'WITHDRAW' && onChainMeta?.onChain ? 'PENDING' : 'COMPLETED',
  };
  const fullPayload: Record<string, any> = {
    ...basePayload,
    on_chain:       onChainMeta?.onChain || false,
    tx_hash:        onChainMeta?.txHash || null,
    withdraw_nonce: onChainMeta?.withdrawNonce ?? null,
    counterparty:   onChainMeta?.counterparty ?? null,
  };

  let { error: txErr } = await supabase.from('transactions').insert(fullPayload);
  if (isMissingColumnError(txErr as any)) {
    // Column doesn't exist (counterparty or others) — retry with base payload.
    const retry = await supabase.from('transactions').insert(basePayload);
    txErr = retry.error;
    if (!retry.error) console.warn('[supabase] transactions missing enriched columns in schema/cache — run the latest migration.');
  }
  if (txErr) {
    console.error('[supabase] recordTransaction insert error:', txErr.message);
    reportPersistenceError({
      kind: 'TRANSACTION',
      message: `Activity row not saved: ${txErr.message}`,
      code: (txErr as any).code,
      hint: hintFromCode((txErr as any).code),
    });
    throw new Error(txErr.message);
  }

  // ── Balance write gate ────────────────────────────────────────────────────
  // For ON-CHAIN (wallet user) transactions, the real money lives in Orderly,
  // not in Supabase. Writing to user.balance here would double-count: the
  // dashboard already adds Orderly's balance to equity, so adding the same
  // amount to Supabase too produces a $2k equity from a $1k deposit.
  // We only adjust the Supabase balance for DEMO transactions (no on-chain meta).
  if (onChainMeta?.onChain) {
    return;
  }

  // SEND/RECEIVE are always on-chain (no demo equivalent), so skip the
  // legacy balance adjustment entirely. They're recorded only for the
  // activity feed.
  if (type === 'SEND' || type === 'RECEIVE') {
    return;
  }

  // Update balance via RPC (atomic). If the RPC isn't deployed yet, do a
  // read-modify-write as a best-effort fallback. Caller reconciles from DB
  // on any thrown error.
  const delta = type === 'DEPOSIT' ? amount : -amount;
  const { error: rpcErr } = await supabase.rpc('adjust_balance', { uid: userId, delta });
  if (!rpcErr) return;

  console.warn('[supabase] adjust_balance RPC failed, using fallback:', rpcErr.message);
  // Use a conditional update (optimistic-concurrency style) to prevent
  // double-application: only update if the current balance matches what we
  // read. Retry once on conflict.
  const { data, error: readErr } = await supabase.from('profiles').select('balance').eq('id', userId).single();
  if (readErr || !data) throw new Error(readErr?.message || 'balance read failed');
  const currentBalance = data.balance || 0;
  const newBalance = Math.max(0, currentBalance + delta);
  // Conditional update: only apply if balance hasn't changed since we read it
  const { error: updErr, count } = await supabase
    .from('profiles')
    .update({ balance: newBalance })
    .eq('id', userId)
    .eq('balance', currentBalance);  // optimistic lock
  if (updErr) throw new Error(updErr.message);
  if (count === 0) {
    // Another concurrent write beat us — re-read and retry once
    const { data: retryData, error: retryReadErr } = await supabase.from('profiles').select('balance').eq('id', userId).single();
    if (retryReadErr || !retryData) throw new Error(retryReadErr?.message || 'balance retry read failed');
    const retryBalance = Math.max(0, (retryData.balance || 0) + delta);
    const { error: retryUpdErr } = await supabase.from('profiles').update({ balance: retryBalance }).eq('id', userId);
    if (retryUpdErr) throw new Error(retryUpdErr.message);
  }
}

// ══════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════

export async function fetchNotifications(userId: string): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications').select('*')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(50);
  if (error) {
    console.warn('[velo] fetchNotifications ERROR:', error.code, error.message, '— user_id queried:', userId);
  } else {
    console.info('[velo] fetchNotifications:', (data || []).length, 'rows for user_id', userId);
  }
  return (data || []).map((r: any): Notification => ({
    id: r.id, type: r.type, message: r.message,
    timestamp: new Date(r.created_at).getTime(),
    read: r.read, relatedId: r.related_id || undefined,
  }));
}

export async function markAllNotificationsRead(userId: string) {
  await supabase.from('notifications').update({ read: true }).eq('user_id', userId);
}

export async function createNotification(userId: string, type: string, message: string, relatedId?: string) {
  await supabase.from('notifications').insert({ user_id: userId, type, message, related_id: relatedId || null });
}

/**
 * Create a notification for ANOTHER user (e.g. the recipient of a transfer).
 * RLS on the notifications table only allows a user to insert rows where
 * user_id = auth.uid(), so cross-user inserts go through a SECURITY DEFINER
 * RPC that bypasses the policy after server-side validation. If the RPC
 * isn't deployed yet, we silently fall back to the direct insert (works in
 * environments with permissive RLS during early dev).
 */
export async function createNotificationForUser(
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
  // Best-effort fallback for environments where the RPC isn't deployed yet.
  if ((error as any).code === '42883' || /function .* does not exist/i.test(error.message)) {
    const { error: insertErr } = await supabase
      .from('notifications')
      .insert({ user_id: targetUserId, type, message, related_id: relatedId || null });
    if (insertErr) throw new Error(`fallback notifications insert failed: ${insertErr.message}`);
    return;
  }
  // Throw so the caller (App.tsx VeloSendModal onSuccess) can surface a toast
  // — silently logging here meant the sender never saw why the receiver got
  // nothing.
  throw new Error(error.message);
}

/**
 * Record a transaction row for ANOTHER user (e.g. the receiver of a SEND).
 * Same RLS-bypass pattern as createNotificationForUser. SEND/RECEIVE rows
 * never adjust profile.balance (on-chain transfers don't touch Supabase
 * balance), so this is purely an activity-feed insert.
 */
export async function recordTransactionForUser(
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

// ══════════════════════════════════════════════════════════════════
// PROFILE BALANCE / PNL SYNC
// ══════════════════════════════════════════════════════════════════

/** Persist user's balance, PnL and win rate back to Supabase profile */
export async function syncUserFinancials(userId: string, balance: number, realizedPnL: number, winRate?: number) {
  const update: Record<string, any> = {
    balance:      Math.max(0, balance),
    realized_pnl: realizedPnL,
    pnl_total:    realizedPnL,
  };
  if (winRate !== undefined) update.win_rate = winRate;
  const { error } = await supabase.from('profiles').update(update).eq('id', userId);
  if (error) {
    console.error('[supabase] syncUserFinancials error:', error.message);
    reportPersistenceError({
      kind: 'PROFILE_SYNC',
      message: `Profile sync failed: ${error.message}`,
      code: (error as any).code,
      hint: hintFromCode((error as any).code),
    });
  }
}

// ══════════════════════════════════════════════════════════════════
// REAL-TIME SUBSCRIPTIONS
// ══════════════════════════════════════════════════════════════════

export function subscribeSocialFeed(callbacks: {
  onNewPost?:       (post: any)    => void;
  onDeletePost?:    (post: any)    => void;
  onLike?:          (like: any)    => void;
  onUnlike?:        (like: any)    => void;
  onComment?:       (comment: any) => void;
  onDeleteComment?: (comment: any) => void;
  onNewRepost?:     (repost: any)  => void;
  onDeleteRepost?:  (repost: any)  => void;
  onStatusChange?:  (status: string, err?: Error) => void;
}): RealtimeChannel {
  // Use a unique suffix so each call gets a fresh channel. A static name means
  // Supabase returns the existing (possibly dead) channel object on the second
  // call and never re-subscribes — this is the #1 cause of the "feed stops
  // updating after a while" bug.
  const uid = Math.random().toString(36).slice(2, 8);
  return supabase
    .channel(`velo-social-${uid}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' },    p => callbacks.onNewPost?.(p.new))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'posts' },    p => callbacks.onDeletePost?.(p.old))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'likes' },    p => callbacks.onLike?.(p.new))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'likes' },    p => callbacks.onUnlike?.(p.old))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments' }, p => callbacks.onComment?.(p.new))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'comments' }, p => callbacks.onDeleteComment?.(p.old))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reposts' },  p => callbacks.onNewRepost?.(p.new))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'reposts' },  p => callbacks.onDeleteRepost?.(p.old))
    .subscribe((status, err) => callbacks.onStatusChange?.(status, err ?? undefined));
}

export function subscribeUserNotifications(userId: string, onNew: (n: any) => void, onStatus?: (s: string, e?: Error) => void): RealtimeChannel {
  const uid = Math.random().toString(36).slice(2, 8);
  return supabase.channel(`velo-notif-${userId}-${uid}`)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'notifications',
      filter: `user_id=eq.${userId}`,
    }, p => onNew(p.new))
    .subscribe((status, err) => onStatus?.(status, err ?? undefined));
}

/**
 * Realtime: fires on any INSERT into `transactions` where user_id matches.
 * Used by the receiver side of a peer-to-peer SEND so their Recent Activity
 * updates instantly without a manual refresh. The sender's optimistic insert
 * is already handled locally in handleSend.
 */
export function subscribeUserTransactions(userId: string, onNew: (t: any) => void, onStatus?: (s: string, e?: Error) => void): RealtimeChannel {
  const uid = Math.random().toString(36).slice(2, 8);
  return supabase.channel(`velo-tx-${userId}-${uid}`)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'transactions',
      filter: `user_id=eq.${userId}`,
    }, p => onNew(p.new))
    .subscribe((status, err) => onStatus?.(status, err ?? undefined));
}

export function subscribeUserPositions(userId: string, callbacks: {
  onInsert?: (pos: any) => void;
  onUpdate?: (pos: any) => void;
  onDelete?: (pos: any) => void;
}): RealtimeChannel {
  return supabase.channel(`velo-positions-${userId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'positions', filter: `user_id=eq.${userId}` }, p => callbacks.onInsert?.(p.new))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'positions', filter: `user_id=eq.${userId}` }, p => callbacks.onUpdate?.(p.new))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'positions', filter: `user_id=eq.${userId}` }, p => callbacks.onDelete?.(p.old))
    .subscribe();
}

export function subscribeUserOrders(userId: string, callbacks: {
  onInsert?: (order: any) => void;
  onDelete?: (order: any) => void;
}): RealtimeChannel {
  return supabase.channel(`velo-orders-${userId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'open_orders', filter: `user_id=eq.${userId}` }, p => callbacks.onInsert?.(p.new))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'open_orders', filter: `user_id=eq.${userId}` }, p => callbacks.onDelete?.(p.old))
    .subscribe();
}

// ══════════════════════════════════════════════════════════════════
// USER PREFERENCES
// ══════════════════════════════════════════════════════════════════

export interface UserPreferences {
  theme:       'light' | 'dark';
  activePair:  string;
  chartTf:     string;
  chartStyle:  string;
  indicators:  string[];
  overlays:    { entry: boolean; tp: boolean; sl: boolean; liq: boolean; openPos: boolean; funding: boolean };
  watchlist:   string[];
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme:      'dark',
  activePair: 'ETH/USD',
  chartTf:    '15m',
  chartStyle: '1',
  indicators: [],
  overlays:   { entry: true, tp: true, sl: true, liq: true, openPos: true, funding: false },
  watchlist:  [],
};

export async function fetchPreferences(userId: string): Promise<UserPreferences | null> {
  const { data } = await supabase
    .from('user_preferences').select('*').eq('user_id', userId).single();
  if (!data) return null;
  return {
    theme:      (data.theme as 'light' | 'dark') || DEFAULT_PREFERENCES.theme,
    activePair: data.active_pair || DEFAULT_PREFERENCES.activePair,
    chartTf:    data.chart_tf    || DEFAULT_PREFERENCES.chartTf,
    chartStyle: data.chart_style || DEFAULT_PREFERENCES.chartStyle,
    indicators: data.indicators  || DEFAULT_PREFERENCES.indicators,
    overlays:   data.overlays    || DEFAULT_PREFERENCES.overlays,
    watchlist:  data.watchlist   || DEFAULT_PREFERENCES.watchlist,
  };
}

export async function savePreferences(userId: string, prefs: Partial<UserPreferences>): Promise<void> {
  const row: Record<string, any> = { user_id: userId, updated_at: new Date().toISOString() };
  if (prefs.theme       !== undefined) row.theme        = prefs.theme;
  if (prefs.activePair  !== undefined) row.active_pair  = prefs.activePair;
  if (prefs.chartTf     !== undefined) row.chart_tf     = prefs.chartTf;
  if (prefs.chartStyle  !== undefined) row.chart_style  = prefs.chartStyle;
  if (prefs.indicators  !== undefined) row.indicators   = prefs.indicators;
  if (prefs.overlays    !== undefined) row.overlays     = prefs.overlays;
  if (prefs.watchlist   !== undefined) row.watchlist    = prefs.watchlist;
  await supabase.from('user_preferences').upsert(row, { onConflict: 'user_id' });
}

// ══════════════════════════════════════════════════════════════════
// LEADERBOARD REAL-TIME
// ══════════════════════════════════════════════════════════════════

/** Subscribe to profile updates so leaderboard PnL/win_rate stay live */
export function subscribeLeaderboard(onUpdate: (profile: any) => void, onStatus?: (s: string, e?: Error) => void): RealtimeChannel {
  const uid = Math.random().toString(36).slice(2, 8);
  return supabase.channel(`velo-leaderboard-${uid}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, p => onUpdate(p.new))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'profiles' }, p => onUpdate(p.new))
    .subscribe((status, err) => onStatus?.(status, err ?? undefined));
}

// ══════════════════════════════════════════════════════════════════
// ADMIN — VERIFICATION CONTROL (build 80+)
// ══════════════════════════════════════════════════════════════════
// All admin writes go through SECURITY DEFINER RPCs in Postgres. The
// frontend just calls them; the RPCs re-check membership in velo_admins
// before touching profiles.

/** Returns true if the calling user is in the velo_admins allowlist. */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_velo_admin');
  if (error) {
    // RPC may not exist on pre-build-80 DBs — treat as "not admin"
    // so the UI degrades gracefully instead of erroring.
    if ((error as any).code === 'PGRST202') return false;   // function not found
    if ((error as any).code === '42883')    return false;   // undefined_function
    console.warn('[supabase] is_velo_admin RPC failed:', error.message);
    return false;
  }
  return data === true;
}

/**
 * Set or clear a user's verification reason. Only admins may call.
 * Pass null to un-verify a user.
 * Reasons must match VERIFICATION_REASONS in src/utils/types.ts.
 */
export async function setUserVerification(
  targetUserId: string,
  reason: string | null,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_set_verification', {
    target_user_id: targetUserId,
    new_reason: reason,
  });
  if (error) {
    console.error('[supabase] admin_set_verification failed:', error.message);
    return { error: error.message };
  }
  return { error: null };
}

/**
 * Activity heartbeat (build 91+). Marks the signed-in user as active "now" so
 * the admin dashboard can compute DAU / WAU / MAU and a daily-active chart.
 *
 * Primary path: the security-definer RPC `touch_activity()`, which stamps
 * profiles.last_active_at = now() AND upserts a row into user_activity_daily
 * for today (giving us historical DAU). If the RPC isn't deployed yet
 * (pre-migration), we fall back to a direct profiles update so current
 * DAU/WAU/MAU still works even before the table exists.
 *
 * Safe to call frequently — it's a cheap upsert keyed on (user_id, day).
 */
let _lastHeartbeat = 0;
export async function touchUserActivity(force = false): Promise<void> {
  if (!isConfigured()) return;
  const now = Date.now();
  // Throttle to at most once every 60s unless forced.
  if (!force && now - _lastHeartbeat < 60_000) return;
  _lastHeartbeat = now;

  try {
    const { error } = await supabase.rpc('touch_activity');
    if (!error) return;
    const code = (error as any).code;
    // RPC absent (pre-migration) → fall back to a direct column update.
    if (code === 'PGRST202' || code === '42883') {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase
        .from('profiles')
        .update({ last_active_at: new Date().toISOString() })
        .eq('id', user.id);
      return;
    }
    // Any other error is non-fatal; activity tracking is best-effort.
    console.warn('[supabase] touch_activity failed:', error.message);
  } catch (e: any) {
    console.warn('[supabase] touch_activity threw:', e?.message);
  }
}

// Shared single-flight guard for token refreshes (used by the session manager
// below). A double refresh can rotate the refresh-token family and kill the
// session, so all refresh paths funnel through this.
let _refreshInFlight: Promise<boolean> | null = null;

// Silent re-auth provider. The app registers a function that re-signs-in using
// the wallet-derived deterministic credentials (same identity, no prompt). The
// session manager calls it when a refresh is rejected (dead refresh token) or
// when there's no session but the wallet is still connected. Returns true on a
// successful fresh sign-in.
let _reauthProvider: (() => Promise<boolean>) | null = null;
export function registerReauthProvider(fn: (() => Promise<boolean>) | null): void {
  _reauthProvider = fn;
}

// ════════════════════════════════════════════════════════════════════════════
//  SESSION MANAGER (build 92)
//
//  Industry-standard session resilience so app data never silently blanks.
//
//  The failure mode it eliminates: the Supabase access token (JWT) lives ~1h.
//  Once it expires, every RLS-protected read resolves as the `anon` role and
//  returns [] — blanking feeds, leaderboards, positions, notifications, etc.
//  A plain refresh re-reads with the same stale token, so it stays empty.
//
//  Strategy (token-level, so it covers EVERY read in the app at once):
//    1. Proactive scheduled refresh — re-arm a timer to refresh ~90s before
//       each token's real expiry (read from session.expires_at). The token is
//       therefore never allowed to expire while the app is open.
//    2. Recovery triggers — refresh immediately on tab refocus and on the
//       browser coming back online (covers a backgrounded tab whose refresh
//       timer the browser throttled/froze past expiry).
//    3. Single-flight — concurrent refreshes are de-duped (a double refresh can
//       rotate the refresh-token family and kill the session).
//    4. Health signalling — broadcasts 'fresh' / 'refreshing' / 'expired' so the
//       UI can show a quiet "reconnecting…" state and auto-recover instead of
//       showing silent empties.
// ════════════════════════════════════════════════════════════════════════════

export type SessionHealth = 'fresh' | 'refreshing' | 'expired' | 'signed-out';
type HealthListener = (h: SessionHealth) => void;

let _health: SessionHealth = 'fresh';
const _healthListeners = new Set<HealthListener>();
let _refreshTimer: ReturnType<typeof setTimeout> | null = null;
let _managerInit = false;

function setHealth(h: SessionHealth) {
  if (h === _health) return;
  _health = h;
  _healthListeners.forEach((fn) => { try { fn(h); } catch { /* ignore */ } });
}

export function getSessionHealth(): SessionHealth { return _health; }

export function onSessionHealth(fn: HealthListener): () => void {
  _healthListeners.add(fn);
  return () => { _healthListeners.delete(fn); };
}

/** Force a token refresh now (single-flight). Returns true if a fresh session
 *  exists afterward. Safe to call from anywhere. */
export async function refreshSessionNow(): Promise<boolean> {
  if (!isConfigured()) return false;
  if (_refreshInFlight) return _refreshInFlight;
  setHealth('refreshing');
  _refreshInFlight = (async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error || !data?.session) {
        // Refresh rejected → the refresh-token family is dead. The ONLY real
        // recovery is a fresh sign-in. Because Velo derives its Supabase
        // credentials deterministically from the connected wallet, we can do
        // that silently (same identity, no prompt) — this is exactly what a
        // manual logout/login does. Try it before declaring the session dead.
        const recovered = _reauthProvider ? await _reauthProvider() : false;
        if (recovered) {
          setHealth('fresh');
          const { data: { session: s2 } } = await supabase.auth.getSession();
          if (s2) scheduleProactiveRefresh(s2);
          return true;
        }
        const { data: { session } } = await supabase.auth.getSession();
        setHealth(session ? 'expired' : 'signed-out');
        return false;
      }
      setHealth('fresh');
      scheduleProactiveRefresh(data.session);
      return true;
    } catch (e: any) {
      console.warn('[session] refresh threw:', e?.message);
      setHealth('expired');
      return false;
    } finally {
      _refreshInFlight = null;
    }
  })();
  return _refreshInFlight;
}

/** Refresh only if the token is expired or within the safety window. */
export async function ensureFreshSession(): Promise<boolean> {
  if (!isConfigured()) return false;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      // No session at all, but the wallet may still be connected (e.g. the
      // session was dropped). Attempt a silent wallet re-auth.
      return _reauthProvider ? _reauthProvider() : false;
    }
    const expiresAtMs = (session.expires_at ?? 0) * 1000;
    if (expiresAtMs && expiresAtMs - Date.now() > 120_000) {
      return true; // comfortably valid
    }
    return refreshSessionNow();
  } catch (e: any) {
    console.warn('[session] ensureFreshSession threw:', e?.message);
    return false;
  }
}

/** (Re)arm the proactive refresh timer to fire ~90s before this token expires. */
function scheduleProactiveRefresh(session: { expires_at?: number } | null) {
  if (_refreshTimer) { clearTimeout(_refreshTimer); _refreshTimer = null; }
  if (!session?.expires_at) return;
  const expiresAtMs = session.expires_at * 1000;
  // Fire 90s early; clamp to [5s, 30min] so a bogus far-future expiry can't
  // park the timer for hours and a near-expiry token refreshes promptly.
  const lead = 90_000;
  const delay = Math.max(5_000, Math.min(expiresAtMs - Date.now() - lead, 30 * 60_000));
  _refreshTimer = setTimeout(() => {
    // Only spend a refresh when the tab is actually in use; a hidden tab will
    // refresh on refocus instead (keeps cross-tab rotation churn down).
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      scheduleProactiveRefresh(session); // re-check shortly without refreshing
      return;
    }
    refreshSessionNow();
  }, delay);
}

/** Initialise the manager once at app boot. Idempotent. */
export function initSessionManager(): void {
  if (_managerInit || !isConfigured() || typeof window === 'undefined') return;
  _managerInit = true;

  // Re-arm the schedule whenever the session changes.
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      if (_refreshTimer) { clearTimeout(_refreshTimer); _refreshTimer = null; }
      setHealth('signed-out');
      return;
    }
    if (session) {
      setHealth('fresh');
      scheduleProactiveRefresh(session as any);
    }
  });

  // Recovery triggers: refocus + back-online. Both are the classic moments a
  // backgrounded tab wakes with an expired token.
  const onVisible = () => { if (document.visibilityState === 'visible') ensureFreshSession(); };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', () => { ensureFreshSession(); });
  window.addEventListener('focus', onVisible);

  // Arm immediately from the current session.
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) scheduleProactiveRefresh(session);
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  LAST-KNOWN-GOOD CACHE (build 92)
//
//  Stale-while-revalidate for PUBLIC, global datasets (traders/leaderboard and
//  the public feed). The UI hydrates from cache on mount so it's never empty,
//  then loadSocialData() revalidates in the background and replaces the cache
//  with fresh data. Only cache public/global data here — never per-user private
//  data (notifications, positions) which must not leak across accounts on a
//  shared machine.
// ════════════════════════════════════════════════════════════════════════════
const CACHE_PREFIX = 'velo_cache_v1_';

export function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object' && 'v' in parsed) ? (parsed.v as T) : null;
  } catch {
    return null;
  }
}

export function cacheSet(key: string, value: any): void {
  try {
    // Skip empties so a transient empty read never overwrites good cache.
    if (Array.isArray(value) && value.length === 0) return;
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ v: value, t: Date.now() }));
  } catch {
    /* storage full / disabled — non-fatal */
  }
}
