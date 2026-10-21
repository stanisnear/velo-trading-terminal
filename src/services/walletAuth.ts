import { supabase } from './supabaseStore';

type SignMessage = (args: { message: string; account?: `0x${string}` }) => Promise<`0x${string}`>;
const pending = new Map<string, Promise<any>>();
const signatureRequests = new Map<string, Promise<`0x${string}`>>();
const controllers = new Set<AbortController>();
export type WalletSignInPhase = 'session' | 'challenge' | 'signature' | 'verification' | 'profile';
let loginGeneration = 0;
let sessionCommit: Promise<void> = Promise.resolve();
export function cancelWalletSignIn() {
  loginGeneration++; pending.clear();
  controllers.forEach(controller => controller.abort(new Error('Sign-in cancelled. Select Sign in to try again.')));
}
export function walletSignInError(error: any): string {
  const message = error?.shortMessage || error?.message || '';
  if (error?.code === 'WALLET_SIGNATURE_TIMEOUT') return message;
  if (error?.code === -32002 || /already pending|request.*already open/i.test(message)) return 'A request is already open in your wallet. Approve or reject it there, then retry sign-in.';
  if (error?.code === 4001 || /user rejected|user denied/i.test(message)) return 'Signature declined. Select Sign in when you are ready.';
  if (/failed to fetch|networkerror|fetch failed|load failed|timed? ?out/i.test(message) || error?.name === 'TimeoutError') {
    return 'Sign-in connection interrupted. Check your connection, then select Sign in to retry. Your account is unchanged.';
  }
  return message || 'Unable to sign in. Please try again.';
}

async function stage<T>(promise: Promise<T>, signal: AbortSignal, timeout: number, message: string, code = 'SIGN_IN_TIMEOUT'): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  let fail: () => void;
  const interrupted = new Promise<never>((_, reject) => {
    fail = () => reject(signal.reason || new Error('Sign-in cancelled.'));
    timer = setTimeout(() => reject(Object.assign(new Error(message), { code })), timeout);
    signal.addEventListener('abort', fail, { once: true });
    if (signal.aborted) fail();
  });
  try { return await Promise.race([promise, interrupted]); }
  finally { clearTimeout(timer!); signal.removeEventListener('abort', fail!); }
}

export function signInWithWallet(address: string, signMessage: SignMessage, options: {
  force?: boolean; onPhase?: (phase: WalletSignInPhase) => void; signatureTimeoutMs?: number;
} = {}) {
  const wallet = address.toLowerCase();
  const previous = pending.get(wallet);
  if (previous) return previous;
  const generation = loginGeneration;
  const controller = new AbortController(); controllers.add(controller);
  const assertActive = () => { if (generation !== loginGeneration || controller.signal.aborted) throw new Error('Sign-in cancelled. Click Log In to try again.'); };
  const operation = (async () => {
    options.onPhase?.('session');
    const { data: { session } } = await stage(supabase.auth.getSession(), controller.signal, 10_000, 'Session recovery is taking too long. Select Sign in to retry.');
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
            body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
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
    options.onPhase?.('challenge');
    const challenge = await post({ action: 'challenge', address: wallet });
    if (typeof challenge.message !== 'string' || !challenge.message.startsWith('app.velotrading.live wants you to sign in with your Ethereum account:\n')) throw new Error('Unexpected sign-in message');
    assertActive();
    if (signatureRequests.has(wallet)) throw new Error('A signature request is already open in your wallet. Approve or reject it there, then retry.');
    options.onPhase?.('signature');
    const request = Promise.resolve().then(() => signMessage({ message: challenge.message, account: wallet as `0x${string}` }));
    signatureRequests.set(wallet, request);
    request.finally(() => { if (signatureRequests.get(wallet) === request) signatureRequests.delete(wallet); }).catch(() => {});
    const signature = await stage(request, controller.signal, options.signatureTimeoutMs ?? 60_000,
      'No wallet response received. Open your wallet and approve or reject the pending request, then select Sign in to retry.', 'WALLET_SIGNATURE_TIMEOUT');
    assertActive();
    options.onPhase?.('verification');
    const verified = await post({ action: 'verify', address: wallet, id: challenge.id, signature });
    assertActive();
    // Serialize session writes so a cancelled, late OTP response cannot sign out a newer login.
    const commit = sessionCommit.then(async () => {
      assertActive();
      const result = await supabase.auth.verifyOtp({ type: 'email', token_hash: verified.token_hash });
      if (generation !== loginGeneration || controller.signal.aborted) {
        if (result.data.session) await supabase.auth.signOut({ scope: 'local' });
        assertActive();
      }
      return result;
    });
    sessionCommit = commit.then(() => {}, () => {});
    const result = await stage(commit, controller.signal, 20_000, 'Session confirmation is taking too long. Select Sign in to retry.');
    if (result.error) throw result.error;
    assertActive();
    if (result.data.user?.app_metadata?.velo_wallet_verified !== wallet) {
      await supabase.auth.signOut({ scope: 'local' });
      throw new Error('Wallet session mismatch');
    }
    return result;
  })();
  pending.set(wallet, operation);
  operation.finally(() => { controllers.delete(controller); controller.abort(); if (pending.get(wallet) === operation) pending.delete(wallet); }).catch(() => {});
  return operation;
}
