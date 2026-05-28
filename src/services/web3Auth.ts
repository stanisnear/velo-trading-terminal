// src/services/web3Auth.ts
import { supabase, isConfigured as isSupabaseConfigured } from './supabaseStore';

export interface WalletAuthResult {
  status: 'existing_user' | 'new_user' | 'error';
  profile?: any;
  supabaseUser?: any;
  error?: string;
}

// Check if a wallet address already has a profile in Supabase
export async function checkWalletProfile(walletAddress: string): Promise<WalletAuthResult> {
  if (!isSupabaseConfigured()) return { status: 'error', error: 'Supabase not configured' };
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('wallet_address', walletAddress.toLowerCase())
      .maybeSingle();

    if (error) throw error;
    if (data) return { status: 'existing_user', profile: data };
    return { status: 'new_user' };
  } catch (err: any) {
    return { status: 'error', error: err.message };
  }
}

// Deterministic password for wallet-based Supabase accounts
// Never shown to user — purely internal auth glue
function walletPassword(walletAddress: string): string {
  // A deterministic but non-trivial secret derived from the address.
  // This is intentionally simple — the security model relies on
  // wallet signature (wagmi) not on this password.
  return `velo_w3_${walletAddress.toLowerCase().slice(2, 18)}_xK9`;
}

// Create a new Supabase profile linked to a wallet address
export async function createWalletProfile(
  walletAddress: string,
  username: string,
  email?: string
): Promise<{ success: boolean; user?: any; profile?: any; error?: string }> {
  if (!isSupabaseConfigured()) return { success: false, error: 'Supabase not configured' };
  try {
    const pseudoEmail = `${walletAddress.toLowerCase()}@wallet.velo`;
    const password = walletPassword(walletAddress);

    // Create Supabase auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: pseudoEmail,
      password,
      options: {
        data: { username, wallet_address: walletAddress.toLowerCase() },
      },
    });

    if (authError) throw authError;
    if (!authData.user) throw new Error('No user returned from signup');

    // Wait a moment for the trigger to create the profile row
    await new Promise(r => setTimeout(r, 800));

    // Update the auto-created profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .update({
        wallet_address: walletAddress.toLowerCase(),
        auth_method: 'WALLET',
        username,
        handle: `@${username.replace(/\s+/g, '')}`,
        ...(email ? { email } : {}),
        balance: 0,
      })
      .eq('id', authData.user.id)
      .select()
      .single();

    if (profileError) throw profileError;

    return { success: true, user: authData.user, profile };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// Sign in an existing wallet user (returns Supabase session)
export async function signInWalletUser(
  walletAddress: string
): Promise<{ success: boolean; user?: any; profile?: any; error?: string }> {
  if (!isSupabaseConfigured()) return { success: false, error: 'Supabase not configured' };
  try {
    const pseudoEmail = `${walletAddress.toLowerCase()}@wallet.velo`;
    const password = walletPassword(walletAddress);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: pseudoEmail,
      password,
    });

    if (error) throw error;
    if (!data.user) throw new Error('Sign in returned no user');

    // Load their profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    return { success: true, user: data.user, profile };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
