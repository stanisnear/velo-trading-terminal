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

export async function signOut() { await supabase.auth.signOut(); }
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
  // Include wallet_address + auth_method so the leaderboard can filter
  // demo accounts at the data layer (build 79+). Use a star select with a
  // fallback if the columns aren't yet present (older DB schemas).
  let { data, error } = await supabase
    .from('profiles')
    .select('id, username, handle, avatar_url, banner_url, bio, pnl_total, realized_pnl, win_rate, velo_rewards, copier_count, earned_fees, follower_count, following_count, copying, wallet_address, auth_method, created_at')
    .order('pnl_total', { ascending: false })
    .limit(limit);
  // If the DB hasn't been migrated yet, fall back to the legacy column set.
  if (error && (error as any).code === '42703') {
    const retry = await supabase
      .from('profiles')
      .select('id, username, handle, avatar_url, banner_url, bio, pnl_total, realized_pnl, win_rate, velo_rewards, copier_count, earned_fees, follower_count, following_count, copying, created_at')
      .order('pnl_total', { ascending: false })
      .limit(limit);
    data = retry.data;
    error = retry.error;
    if (!retry.error) console.warn('[supabase] profiles missing wallet_address column — run SUPABASE_MIGRATION_BUILD79.sql for leaderboard filtering.');
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

  // 42703 = undefined_column — fall back to legacy columns if migration hasn't run
  if (error && (error as any).code === '42703') {
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
  if (error && (error as any).code === '42703') {
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
  const { data } = await supabase
    .from('trade_history').select('*')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(limit);
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
  //   2. If undefined_column (schema not migrated) — retry with enriched only
  //   3. If still undefined_column — retry with base legacy only
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

  if (error && (error as any).code === '42703') {
    // Missing on-chain columns — retry with enriched only
    const r2 = await supabase.from('trade_history').insert(enrichedPayload);
    error = r2.error;
    if (!r2.error) {
      console.warn('[supabase] trade_history missing on-chain columns — run migration to persist Orderly order info.');
    } else if ((r2.error as any).code === '42703') {
      // Missing enriched columns too — last-ditch legacy insert
      const r3 = await supabase.from('trade_history').insert(basePayload);
      error = r3.error;
      if (!r3.error) {
        console.warn('[supabase] trade_history missing enriched columns — run schema migration.');
      }
    }
  }
  if (error) console.error('[supabase] insertTradeHistory error:', error.message);
}

// ══════════════════════════════════════════════════════════════════
// TRANSACTIONS
// ══════════════════════════════════════════════════════════════════

export async function fetchTransactions(userId: string): Promise<Transaction[]> {
  const { data } = await supabase
    .from('transactions').select('*')
    .eq('user_id', userId).order('created_at', { ascending: false });
  return (data || []).map((r: any): Transaction => ({
    id: r.id, type: r.type, amount: r.amount,
    timestamp: new Date(r.created_at).getTime(), status: r.status,
    onChain:       r.on_chain || false,
    txHash:        r.tx_hash || undefined,
    withdrawNonce: r.withdraw_nonce != null ? Number(r.withdraw_nonce) : undefined,
  }));
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
  if (txErr && (txErr as any).code === '42703') {
    // Column doesn't exist (counterparty or others) — retry with base payload.
    const retry = await supabase.from('transactions').insert(basePayload);
    txErr = retry.error;
    if (!retry.error) console.warn('[supabase] transactions missing on-chain columns — run migration.');
  }
  if (txErr) {
    console.error('[supabase] recordTransaction insert error:', txErr.message);
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
  const { data } = await supabase
    .from('notifications').select('*')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(50);
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
  if (error) console.error('[supabase] syncUserFinancials error:', error.message);
}

// ══════════════════════════════════════════════════════════════════
// REAL-TIME SUBSCRIPTIONS
// ══════════════════════════════════════════════════════════════════

export function subscribeSocialFeed(callbacks: {
  onNewPost?:     (post: any)    => void;
  onLike?:        (like: any)    => void;
  onUnlike?:      (like: any)    => void;
  onComment?:     (comment: any) => void;
  onNewRepost?:   (repost: any)  => void;
}): RealtimeChannel {
  return supabase.channel('velo-social-feed')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' },    p => callbacks.onNewPost?.(p.new))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'likes' },   p => callbacks.onLike?.(p.new))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'likes' },   p => callbacks.onUnlike?.(p.old))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments'}, p => callbacks.onComment?.(p.new))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reposts' }, p => callbacks.onNewRepost?.(p.new))
    .subscribe();
}

export function subscribeUserNotifications(userId: string, onNew: (n: any) => void): RealtimeChannel {
  return supabase.channel(`velo-notif-${userId}`)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'notifications',
      filter: `user_id=eq.${userId}`,
    }, p => onNew(p.new))
    .subscribe();
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
export function subscribeLeaderboard(onUpdate: (profile: any) => void): RealtimeChannel {
  return supabase.channel('velo-leaderboard')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, p => onUpdate(p.new))
    .subscribe();
}
