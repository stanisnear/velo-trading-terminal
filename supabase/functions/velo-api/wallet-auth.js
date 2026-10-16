import { createClient } from '@supabase/supabase-js';
import { createPublicClient, http, isAddress, getAddress } from 'viem';
import { baseSepolia } from 'viem/chains';
import { runtimeEnv } from './env.js';

const DOMAIN = 'app.velotrading.live';
const TTL = 300_000;
export function loginMessage(address, nonce, now) {
  return `${DOMAIN} wants you to sign in with your Ethereum account:\n${getAddress(address)}\n\nSign in to VELO testnet. This does not authorize a transaction.\n\nURI: https://${DOMAIN}\nVersion: 1\nChain ID: 84532\nNonce: ${nonce}\nIssued At: ${new Date(now).toISOString()}\nExpiration Time: ${new Date(now + TTL).toISOString()}`;
}

// Dependencies are injectable for signature, replay, expiry, and failure tests.
export function createWalletAuth(getEnv = runtimeEnv, deps = {}) {
  return async (req, res) => {
    const { action, address, id, signature } = req.body || {};
    if (!isAddress(address || '') || !['challenge', 'verify'].includes(action)) {
      return res.status(400).json({ error: 'Invalid sign-in request' });
    }
    const wallet = address.toLowerCase();
    const admin = deps.admin || createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const rpc = async (op, data) => {
      const { data: result, error } = await admin.rpc('velo_wallet_auth', { op, data });
      if (error) throw new Error('Authentication store unavailable');
      return result;
    };
    const now = deps.now?.() ?? Date.now();
    if (action === 'challenge') {
      const nonce = crypto.randomUUID().replaceAll('-', '');
      const message = loginMessage(wallet, nonce, now);
      const ip = req.headers['x-velo-client-ip'];
      if (!ip && !deps.allowMissingIp) return res.status(400).json({ error: 'Missing client context' });
      const ipHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip || 'test'))), b => b.toString(16).padStart(2, '0')).join('');
      const result = await rpc('challenge', { address: wallet, message, ip_hash: ipHash });
      if (!result?.id) return res.status(429).json({ error: 'Too many sign-in attempts. Try again in five minutes.' });
      return res.status(200).json({ id: result.id, message });
    }
    if (!/^[0-9a-f-]{36}$/i.test(id || '') || !/^0x[0-9a-f]{128,8192}$/i.test(signature || '')) {
      return res.status(400).json({ error: 'Invalid signature request' });
    }
    // Atomically consume before expensive verification. Even concurrent requests
    // cannot reuse a challenge; a bad signature requires a fresh challenge.
    const challenge = await rpc('consume', { id, address: wallet });
    if (!challenge?.message) return res.status(401).json({ error: 'Sign-in challenge expired or already used' });
    const client = deps.client || createPublicClient({ chain: baseSepolia, transport: http(getEnv('BASE_SEPOLIA_RPC_URL') || 'https://sepolia.base.org', { timeout: 10_000, retryCount: 0 }) });
    let verified = false;
    try { verified = await client.verifyMessage({ address: getAddress(wallet), message: challenge.message, signature }); }
    catch { return res.status(503).json({ error: 'Wallet verification unavailable. Please try again.' }); }
    if (!verified) return res.status(401).json({ error: 'Wallet signature did not match' });
    // Canonical email preserves existing Supabase IDs and all social data.
    // generateLink does not send an email. Only the verified wallet receives OTP.
    const { data: link, error } = await admin.auth.admin.generateLink({
      type: 'magiclink', email: `${wallet}@wallet.velo`,
      options: { data: { username: `wallet_${wallet.slice(2)}`, wallet_address: wallet } },
    });
    if (error || !link?.properties?.hashed_token || !link.user?.id) throw new Error('Unable to create wallet session');
    await rpc('secure_user', { id: link.user.id, address: wallet });
    return res.status(200).json({ token_hash: link.properties.hashed_token });
  };
}
export default createWalletAuth();
