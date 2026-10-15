import { supabase } from './supabaseStore';

type SignMessage = (args: { message: string }) => Promise<`0x${string}`>;
const pending = new Map<string, Promise<any>>();

export function signInWithWallet(address: string, signMessage: SignMessage) {
  const wallet = address.toLowerCase();
  const previous = pending.get(wallet);
  if (previous) return previous;
  const operation = (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user.app_metadata?.velo_wallet_verified === wallet && session.expires_at && session.expires_at * 1000 > Date.now() + 60_000) {
      return { data: { user: session.user, session }, error: null };
    }
    const post = async (body: object) => {
      const response = await fetch('/api/wallet-auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(20_000),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || 'Wallet sign-in unavailable');
      return value;
    };
    const challenge = await post({ action: 'challenge', address: wallet });
    if (typeof challenge.message !== 'string' || !challenge.message.startsWith('app.velotrading.live wants you to sign in with your Ethereum account:\n')) throw new Error('Unexpected sign-in message');
    const signature = await signMessage({ message: challenge.message });
    const verified = await post({ action: 'verify', address: wallet, id: challenge.id, signature });
    const result = await supabase.auth.verifyOtp({ type: 'email', token_hash: verified.token_hash });
    if (result.error) throw result.error;
    if (result.data.user?.app_metadata?.velo_wallet_verified !== wallet) {
      await supabase.auth.signOut({ scope: 'local' });
      throw new Error('Wallet session mismatch');
    }
    return result;
  })();
  pending.set(wallet, operation);
  operation.finally(() => pending.delete(wallet)).catch(() => {});
  return operation;
}
