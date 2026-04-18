import { createClient } from '@supabase/supabase-js';
import { Post, Comment } from '../utils/types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://lhxserclykazheonpvjj.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoeHNlcmNseWthemhlb25wdmpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NDEzMjksImV4cCI6MjA5MjAxNzMyOX0.FwuLdcuM4w_Wf7Brn3Iorm0azLf-QfGl9HPF_w_wuwo';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ═══════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════

export async function signUp(email: string, password: string, username: string) {
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { username, handle: `@${username.replace(/\s+/g, '')}` } },
  });
  if (error) return { user: null, error: error.message };
  if (data.user) {
    await supabase.from('profiles').insert({
      id: data.user.id,
      username,
      handle: `@${username.replace(/\s+/g, '')}`,
      avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
      banner_url: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=1000&q=80',
    });
  }
  return { user: data.user, error: null };
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { user: null, error: error.message };
  return { user: data.user, error: null };
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles').select('*').eq('id', userId).single();
  return { profile: data, error };
}

export async function updateProfile(userId: string, updates: Record<string, any>) {
  const { error } = await supabase.from('profiles').update(updates).eq('id', userId);
  return { error };
}

export async function uploadAvatar(userId: string, file: File) {
  const ext = file.name.split('.').pop();
  const path = `${userId}/avatar.${ext}`;
  const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
  if (uploadError) return { url: null, error: uploadError.message };
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  await updateProfile(userId, { avatar_url: data.publicUrl });
  return { url: data.publicUrl, error: null };
}

export async function uploadBanner(userId: string, file: File) {
  const ext = file.name.split('.').pop();
  const path = `${userId}/banner.${ext}`;
  const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
  if (uploadError) return { url: null, error: uploadError.message };
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  await updateProfile(userId, { banner_url: data.publicUrl });
  return { url: data.publicUrl, error: null };
}

// ═══════════════════════════════════════════════════════════════
// SOCIAL — POSTS
// ═══════════════════════════════════════════════════════════════

export async function fetchPosts(limit = 50): Promise<{ posts: Post[]; error: any }> {
  const { data, error } = await supabase
    .from('posts')
    .select(`*, author:profiles(id, username, handle, avatar_url)`)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return { posts: [], error };

  const posts: Post[] = (data || []).map((p: any) => ({
    id: p.id,
    authorId: p.author_id,
    authorHandle: p.author?.handle || '@unknown',
    authorAvatar: p.author?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.author_id}`,
    content: p.content,
    image: p.image_url,
    timestamp: p.created_at,
    likes: p.likes_count || 0,
    reposts: p.reposts_count || 0,
    likedBy: [],
    repostedBy: [],
    comments: [],
    isTradeSignal: p.is_trade_signal || false,
    tradeDetails: p.is_trade_signal ? {
      pair: p.trade_pair,
      side: p.trade_side,
      leverage: p.trade_leverage,
      entry: p.trade_entry,
    } : undefined,
  }));

  return { posts, error: null };
}

export async function createPost(authorId: string, content: string, imageUrl?: string, tradeSignal?: any) {
  const { data, error } = await supabase.from('posts').insert({
    author_id: authorId,
    content,
    image_url: imageUrl,
    is_trade_signal: !!tradeSignal,
    trade_pair: tradeSignal?.pair,
    trade_side: tradeSignal?.side,
    trade_leverage: tradeSignal?.leverage,
    trade_entry: tradeSignal?.entry,
  }).select(`*, author:profiles(id, username, handle, avatar_url)`).single();

  if (error) return { post: null, error };

  const post: Post = {
    id: data.id,
    authorId: data.author_id,
    authorHandle: data.author?.handle || '@unknown',
    authorAvatar: data.author?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${authorId}`,
    content: data.content,
    image: data.image_url,
    timestamp: data.created_at,
    likes: 0,
    reposts: 0,
    likedBy: [],
    repostedBy: [],
    comments: [],
    isTradeSignal: data.is_trade_signal,
    tradeDetails: data.is_trade_signal ? {
      pair: data.trade_pair,
      side: data.trade_side,
      leverage: data.trade_leverage,
      entry: data.trade_entry,
    } : undefined,
  };

  return { post, error: null };
}

export async function deletePost(postId: string) {
  const { error } = await supabase.from('posts').delete().eq('id', postId);
  return { error };
}

// ═══════════════════════════════════════════════════════════════
// SOCIAL — LIKES
// ═══════════════════════════════════════════════════════════════

export async function toggleLike(userId: string, postId: string): Promise<{ liked: boolean; error: any }> {
  const { data: existing } = await supabase
    .from('likes').select('user_id').eq('user_id', userId).eq('post_id', postId).single();

  if (existing) {
    await supabase.from('likes').delete().eq('user_id', userId).eq('post_id', postId);
    // Decrement counter
    await supabase.rpc('decrement_likes', { post_id: postId });
    return { liked: false, error: null };
  } else {
    await supabase.from('likes').insert({ user_id: userId, post_id: postId });
    // Increment counter
    await supabase.rpc('increment_likes', { post_id: postId });
    return { liked: true, error: null };
  }
}

export async function getUserLikes(userId: string): Promise<string[]> {
  const { data } = await supabase.from('likes').select('post_id').eq('user_id', userId);
  return (data || []).map((l: any) => l.post_id);
}

// ═══════════════════════════════════════════════════════════════
// SOCIAL — REPOSTS
// ═══════════════════════════════════════════════════════════════

export async function toggleRepost(userId: string, postId: string): Promise<{ reposted: boolean; error: any }> {
  const { data: existing } = await supabase
    .from('reposts').select('user_id').eq('user_id', userId).eq('post_id', postId).single();

  if (existing) {
    await supabase.from('reposts').delete().eq('user_id', userId).eq('post_id', postId);
    await supabase.from('posts').update({ reposts_count: supabase.rpc('decrement_reposts', { post_id: postId }) }).eq('id', postId);
    return { reposted: false, error: null };
  } else {
    await supabase.from('reposts').insert({ user_id: userId, post_id: postId });
    await supabase.from('posts').update({ reposts_count: supabase.rpc('increment_reposts', { post_id: postId }) }).eq('id', postId);
    return { reposted: true, error: null };
  }
}

export async function getUserReposts(userId: string): Promise<string[]> {
  const { data } = await supabase.from('reposts').select('post_id').eq('user_id', userId);
  return (data || []).map((r: any) => r.post_id);
}

// ═══════════════════════════════════════════════════════════════
// SOCIAL — COMMENTS
// ═══════════════════════════════════════════════════════════════

export async function fetchComments(postId: string): Promise<{ comments: Comment[]; error: any }> {
  const { data, error } = await supabase
    .from('comments')
    .select(`*, author:profiles(id, username, handle, avatar_url)`)
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  if (error) return { comments: [], error };

  const comments: Comment[] = (data || []).map((c: any) => ({
    id: c.id,
    authorId: c.author_id,
    authorHandle: c.author?.handle || '@unknown',
    authorAvatar: c.author?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${c.author_id}`,
    content: c.content,
    timestamp: c.created_at,
  }));

  return { comments, error: null };
}

export async function addComment(postId: string, authorId: string, content: string): Promise<{ comment: Comment | null; error: any }> {
  const { data, error } = await supabase
    .from('comments')
    .insert({ post_id: postId, author_id: authorId, content })
    .select(`*, author:profiles(id, username, handle, avatar_url)`)
    .single();

  if (error) return { comment: null, error };

  // Increment comment count on post
  await supabase.from('posts')
    .update({ comments_count: (data.comments_count || 0) + 1 })
    .eq('id', postId);

  return {
    comment: {
      id: data.id,
      authorId: data.author_id,
      authorHandle: data.author?.handle || '@unknown',
      authorAvatar: data.author?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${authorId}`,
      content: data.content,
      timestamp: data.created_at,
    },
    error: null,
  };
}

// ═══════════════════════════════════════════════════════════════
// SOCIAL — FOLLOWS
// ═══════════════════════════════════════════════════════════════

export async function toggleFollow(followerId: string, followingId: string): Promise<{ following: boolean; error: any }> {
  const { data: existing } = await supabase
    .from('follows').select('follower_id').eq('follower_id', followerId).eq('following_id', followingId).single();

  if (existing) {
    await supabase.from('follows').delete().eq('follower_id', followerId).eq('following_id', followingId);
    await supabase.from('profiles').update({ follower_count: supabase.rpc('decrement_followers', { profile_id: followingId }) }).eq('id', followingId);
    await supabase.from('profiles').update({ following_count: supabase.rpc('decrement_following', { profile_id: followerId }) }).eq('id', followerId);
    return { following: false, error: null };
  } else {
    await supabase.from('follows').insert({ follower_id: followerId, following_id: followingId });
    await supabase.from('profiles').update({ follower_count: supabase.rpc('increment_followers', { profile_id: followingId }) }).eq('id', followingId);
    await supabase.from('profiles').update({ following_count: supabase.rpc('increment_following', { profile_id: followerId }) }).eq('id', followerId);
    return { following: true, error: null };
  }
}

export async function getFollowing(userId: string): Promise<string[]> {
  const { data } = await supabase.from('follows').select('following_id').eq('follower_id', userId);
  return (data || []).map((f: any) => f.following_id);
}

export async function fetchProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, follower_count, following_count')
    .eq('id', userId)
    .single();
  return { profile: data, error };
}

// ═══════════════════════════════════════════════════════════════
// REAL-TIME SUBSCRIPTIONS
// ═══════════════════════════════════════════════════════════════

export function subscribeToFeed(onNewPost: (post: Post) => void) {
  return supabase
    .channel('public:posts')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, async (payload) => {
      // Fetch the full post with author profile
      const { data } = await supabase
        .from('posts')
        .select(`*, author:profiles(id, username, handle, avatar_url)`)
        .eq('id', payload.new.id)
        .single();

      if (data) {
        onNewPost({
          id: data.id,
          authorId: data.author_id,
          authorHandle: data.author?.handle || '@unknown',
          authorAvatar: data.author?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.author_id}`,
          content: data.content,
          image: data.image_url,
          timestamp: data.created_at,
          likes: 0,
          reposts: 0,
          likedBy: [],
          repostedBy: [],
          comments: [],
          isTradeSignal: data.is_trade_signal,
          tradeDetails: data.is_trade_signal ? {
            pair: data.trade_pair,
            side: data.trade_side,
            leverage: data.trade_leverage,
            entry: data.trade_entry,
          } : undefined,
        });
      }
    })
    .subscribe();
}

export function subscribeToPostLikes(postId: string, onUpdate: (count: number) => void) {
  return supabase
    .channel(`post-likes:${postId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'likes', filter: `post_id=eq.${postId}` }, async () => {
      const { count } = await supabase.from('likes').select('*', { count: 'exact', head: true }).eq('post_id', postId);
      onUpdate(count || 0);
    })
    .subscribe();
}

// ═══════════════════════════════════════════════════════════════
// TRADING DATA
// ═══════════════════════════════════════════════════════════════

export async function savePosition(userId: string, position: any) {
  const { error } = await supabase.from('positions').insert({
    id: position.id, user_id: userId, pair: position.pair, side: position.side,
    entry_price: position.entryPrice, size: position.size, leverage: position.leverage,
    margin_mode: position.marginMode, liquidation_price: position.liquidationPrice,
    take_profit: position.takeProfit, stop_loss: position.stopLoss,
    is_bot_trade: position.isBotTrade || false, is_copy_trade: position.isCopyTrade || false,
  });
  return { error };
}

export async function deletePosition(positionId: string) {
  const { error } = await supabase.from('positions').delete().eq('id', positionId);
  return { error };
}

export async function saveTradeHistory(userId: string, trade: any) {
  const { error } = await supabase.from('trade_history').insert({
    user_id: userId, pair: trade.pair, side: trade.side,
    entry_price: trade.entryPrice, exit_price: trade.exitPrice,
    size: trade.size, leverage: trade.leverage || 1, pnl: trade.pnl, reason: trade.reason || 'MANUAL',
  });
  return { error };
}

export function isSupabaseConfigured(): boolean {
  return SUPABASE_ANON_KEY !== 'YOUR_ANON_KEY_HERE' && SUPABASE_ANON_KEY.startsWith('eyJ');
}
