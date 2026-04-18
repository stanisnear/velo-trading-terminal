import { createClient } from '@supabase/supabase-js';

// ═══════════════════════════════════════════════════════════════
// SUPABASE CONFIG
// ═══════════════════════════════════════════════════════════════
// To configure: 
// 1. Go to Supabase Dashboard → Settings → API
// 2. Copy "Project URL" and "anon public" key (starts with eyJ...)
// 3. Either set env vars or replace the values below
// ═══════════════════════════════════════════════════════════════

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://lhxserclykazheonpvjj.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoeHNlcmNseWthemhlb25wdmpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NDEzMjksImV4cCI6MjA5MjAxNzMyOX0.FwuLdcuM4w_Wf7Brn3Iorm0azLf-QfGl9HPF_w_wuwo'; // Replace with your anon key (eyJ...)

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ═══════════════════════════════════════════════════════════════
// AUTH HELPERS
// ═══════════════════════════════════════════════════════════════

export async function signUp(email: string, password: string, username: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username, handle: `@${username.replace(/\s+/g, '')}` },
    },
  });
  
  if (error) return { user: null, error: error.message };
  
  // Create profile
  if (data.user) {
    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id,
      username,
      handle: `@${username.replace(/\s+/g, '')}`,
      avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
      banner_url: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=1000&q=80',
    });
    if (profileError) console.warn('Profile creation error:', profileError);
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
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  return { profile: data, error };
}

export async function updateProfile(userId: string, updates: Record<string, any>) {
  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId);
  return { error };
}

export async function uploadAvatar(userId: string, file: File) {
  const ext = file.name.split('.').pop();
  const path = `${userId}/avatar.${ext}`;
  
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true });
  
  if (uploadError) return { url: null, error: uploadError.message };
  
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  
  // Update profile with new avatar URL
  await updateProfile(userId, { avatar_url: data.publicUrl });
  
  return { url: data.publicUrl, error: null };
}

export async function uploadBanner(userId: string, file: File) {
  const ext = file.name.split('.').pop();
  const path = `${userId}/banner.${ext}`;
  
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true });
  
  if (uploadError) return { url: null, error: uploadError.message };
  
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  await updateProfile(userId, { banner_url: data.publicUrl });
  
  return { url: data.publicUrl, error: null };
}

// ═══════════════════════════════════════════════════════════════
// DATA HELPERS (for when Supabase is properly configured)
// ═══════════════════════════════════════════════════════════════

export async function savePosition(userId: string, position: any) {
  const { error } = await supabase.from('positions').insert({
    id: position.id,
    user_id: userId,
    pair: position.pair,
    side: position.side,
    entry_price: position.entryPrice,
    size: position.size,
    leverage: position.leverage,
    margin_mode: position.marginMode,
    liquidation_price: position.liquidationPrice,
    take_profit: position.takeProfit,
    stop_loss: position.stopLoss,
    is_bot_trade: position.isBotTrade || false,
    is_copy_trade: position.isCopyTrade || false,
  });
  return { error };
}

export async function deletePosition(positionId: string) {
  const { error } = await supabase.from('positions').delete().eq('id', positionId);
  return { error };
}

export async function saveTradeHistory(userId: string, trade: any) {
  const { error } = await supabase.from('trade_history').insert({
    user_id: userId,
    pair: trade.pair,
    side: trade.side,
    entry_price: trade.entryPrice,
    exit_price: trade.exitPrice,
    size: trade.size,
    leverage: trade.leverage || 1,
    pnl: trade.pnl,
    reason: trade.reason || 'MANUAL',
  });
  return { error };
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
  }).select().single();
  return { post: data, error };
}

export async function toggleLike(userId: string, postId: string) {
  // Check if already liked
  const { data: existing } = await supabase
    .from('likes')
    .select()
    .eq('user_id', userId)
    .eq('post_id', postId)
    .single();
  
  if (existing) {
    await supabase.from('likes').delete().eq('user_id', userId).eq('post_id', postId);
    return { liked: false };
  } else {
    await supabase.from('likes').insert({ user_id: userId, post_id: postId });
    return { liked: true };
  }
}

export async function toggleFollow(followerId: string, followingId: string) {
  const { data: existing } = await supabase
    .from('follows')
    .select()
    .eq('follower_id', followerId)
    .eq('following_id', followingId)
    .single();
  
  if (existing) {
    await supabase.from('follows').delete().eq('follower_id', followerId).eq('following_id', followingId);
    return { following: false };
  } else {
    await supabase.from('follows').insert({ follower_id: followerId, following_id: followingId });
    return { following: true };
  }
}

// Check if Supabase is properly configured
export function isSupabaseConfigured(): boolean {
  return SUPABASE_ANON_KEY !== 'YOUR_ANON_KEY_HERE' && SUPABASE_ANON_KEY.startsWith('eyJ');
}
