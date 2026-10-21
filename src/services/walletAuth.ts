import { supabase } from './supabaseStore';

type SignMessage = (args: { message: string }) => Promise<`0x${string}`>;
const pending = new Map<string, Promise<any>>();
let loginGeneration = 0;
export function cancelWalletSignIn() { loginGeneration++; pending.clear(); }
export function walletSignInError(error: any): string {
  const message = error?.shortMessage || error?.message || '';
  if (/failed to fetch|networkerror|fetch failed|load failed|timed? ?out/i.test(message) || error?.name === 'TimeoutError') {
    return 'Sign-in connection interrupted. Check your connection, then select Sign in to retry. Your account is unchanged.';
  }
  return message || 'Unable to sign in. Please try again.';
}

export function signInWithWallet(address: string, signMessage: SignMessage, options: { force?: boolean } = {}) {
  const wallet = address.toLowerCase();
  const previous = pending.get(wallet);
  if (previous) return previous;
  const generation = loginGeneration;
  const assertActive = () => { if (generation !== loginGeneration) throw new Error('Sign-in cancelled. Click Log In to try again.'); };
  const operation = (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    assertActive();
    if (!options.force && session?.user.app_metadata?.velo_wallet_verified === wallet && session.expires_at && session.expires_at * 1000 > Date.now() + 60_000) {
      return { data: { user: session.user, session }, error: null };
    }
    const post = async (body: { action: string; [key: string]: unknown }) => {
      // A challenge is safe to replace; a signed proof is single-use and must not be replayed.
      const attempts = body.action === 'challenge' ? 2 : 1;
      for (let attempt = 0; attempt < attempts; attempt++) {
        assertActive();
        let response: Response;
        try {
          response = await fetch('/api/wallet-auth', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(20_000),
          });
        } catch (error) {
          if (attempt + 1 < attempts) continue;
          throw new Error(walletSignInError(error));
        }
        if (response.status >= 500 && attempt + 1 < attempts) continue;
        const value = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(value.error || 'Sign-in service is temporarily unavailable. Please retry.');
        return value;
      }
    };
    const challenge = await post({ action: 'challenge', address: wallet });
    if (typeof challenge.message !== 'string' || !challenge.message.startsWith('app.velotrading.live wants you to sign in with your Ethereum account:\n')) throw new Error('Unexpected sign-in message');
    assertActive();
    const signature = await signMessage({ message: challenge.message });
    assertActive();
    const verified = await post({ action: 'verify', address: wallet, id: challenge.id, signature });
    assertActive();
    const result = await supabase.auth.verifyOtp({ type: 'email', token_hash: verified.token_hash });
    if (result.error) throw result.error;
    if (generation !== loginGeneration) { await supabase.auth.signOut({ scope: 'local' }); assertActive(); }
    if (result.data.user?.app_metadata?.velo_wallet_verified !== wallet) {
      await supabase.auth.signOut({ scope: 'local' });
      throw new Error('Wallet session mismatch');
    }
    return result;
  })();
  pending.set(wallet, operation);
  operation.finally(() => { if (pending.get(wallet) === operation) pending.delete(wallet); }).catch(() => {});
  return operation;
}
