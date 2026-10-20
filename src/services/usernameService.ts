import { builderAttribution } from './baseBuilderAttribution.mjs';
/**
 * usernameService — wrapper for VeloRegistry.
 *
 * The registry is a fully on-chain username → address mapping. The frontend
 * uses this to resolve "@stan" → 0xabc... before submitting a standard ERC-20
 * transfer. No off-chain identity service, no custodial layer.
 *
 * Rules enforced by the contract:
 *   • 3..16 chars, lowercase a-z / 0-9 / underscore. First char a-z.
 *   • One username per address. One address per username (first claim wins).
 *   • 30-day cooldown between changes.
 */
import { type Address, type PublicClient, type WalletClient, zeroAddress } from 'viem';
import { waitForSuccessfulReceipt } from './tradeReceipts';
import { pendingTransaction, recoverPendingTransaction } from './baseTransport.mjs';

export const VELO_REGISTRY_ADDRESS = (import.meta.env.VITE_VELO_REGISTRY_ADDRESS ||
  '0x7e510d615a8afDfaa324F790F3E54e520756ECe2') as Address;

export const VELO_REGISTRY_ABI = [
  {
    type: 'function', name: 'resolve', stateMutability: 'view',
    inputs: [{ name: 'u', type: 'string' }],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function', name: 'usernameOf', stateMutability: 'view',
    inputs: [{ name: 'who', type: 'address' }],
    outputs: [{ type: 'string' }],
  },
  {
    type: 'function', name: 'setUsername', stateMutability: 'nonpayable',
    inputs: [{ name: 'u', type: 'string' }],
    outputs: [],
  },
  {
    type: 'function', name: 'nextChangeAllowed', stateMutability: 'view',
    inputs: [{ name: 'who', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'event', name: 'UsernameClaimed',
    inputs: [
      { indexed: true,  name: 'who',         type: 'address' },
      { indexed: true,  name: 'username',    type: 'bytes32' },
      { indexed: false, name: 'usernameStr', type: 'string'  },
    ],
  },
] as const;

// ── Validation (mirrors VeloRegistry._packAndValidate so we fail fast in UI) ──

const USERNAME_RE = /^[a-z][a-z0-9_]{2,15}$/;

/** Returns null if valid, or a user-facing error message if not. */
export function validateUsername(u: string): string | null {
  if (u.length < 3 || u.length > 16) return 'Username must be 3–16 characters';
  if (!USERNAME_RE.test(u)) {
    if (!/^[a-z]/.test(u)) return 'Username must start with a letter (a–z)';
    return 'Only lowercase letters, digits, and underscores allowed';
  }
  return null;
}

// ── Reads ─────────────────────────────────────────────────────────────────────

/** Resolve username → wallet address. Returns null if unclaimed or invalid. */
export async function resolveUsername(
  publicClient: PublicClient,
  username: string,
): Promise<Address | null> {
  const normalized = username.startsWith('@') ? username.slice(1) : username;
  if (validateUsername(normalized) !== null) return null;
  try {
    const addr = await publicClient.readContract({
      address: VELO_REGISTRY_ADDRESS,
      abi: VELO_REGISTRY_ABI,
      functionName: 'resolve',
      args: [normalized],
    });
    return addr === zeroAddress ? null : (addr as Address);
  } catch {
    return null;
  }
}

/** Reverse-lookup: get the username for a wallet address, or "" if none. */
export async function fetchUsernameForAddress(
  publicClient: PublicClient,
  address: Address,
): Promise<string> {
  try {
    return await publicClient.readContract({
      address: VELO_REGISTRY_ADDRESS,
      abi: VELO_REGISTRY_ABI,
      functionName: 'usernameOf',
      args: [address],
    });
  } catch {
    return '';
  }
}

/**
 * Read the unix timestamp (seconds) when this address can change their handle next.
 * Returns 0 if never set (i.e. they've never claimed) — the contract storage default.
 */
export async function fetchNextChangeAllowed(
  publicClient: PublicClient,
  address: Address,
): Promise<number> {
  try {
    const v = await publicClient.readContract({
      address: VELO_REGISTRY_ADDRESS,
      abi: VELO_REGISTRY_ABI,
      functionName: 'nextChangeAllowed',
      args: [address],
    }) as bigint;
    return Number(v);
  } catch {
    return 0;
  }
}

// ── Writes ────────────────────────────────────────────────────────────────────

/** Claim a username on-chain. Returns tx hash. Reverts if taken / invalid / on cooldown. */
export async function claimUsername(
  walletClient: WalletClient,
  username: string,
): Promise<`0x${string}`> {
  const account = walletClient.account;
  if (!account) throw new Error('Wallet not connected');
  const normalized = username.startsWith('@') ? username.slice(1) : username;
  const err = validateUsername(normalized);
  if (err) throw new Error(err);

  return walletClient.writeContract({ ...builderAttribution(walletClient.chain?.id),
    address: VELO_REGISTRY_ADDRESS,
    abi: VELO_REGISTRY_ABI,
    functionName: 'setUsername',
    args: [normalized],
    account,
    chain: walletClient.chain,
  });
}

/** Idempotent onboarding: only a confirmed mapping counts as registration. */
export async function ensureUsernameRegistered(publicClient: PublicClient, walletClient: WalletClient, username: string) {
  const account = walletClient.account;
  if (!account) throw new Error('Trading wallet not connected');
  const normalized = username.replace(/^@/, '').toLowerCase();
  const error = validateUsername(normalized);
  if (error) throw new Error(error);
  const pending = pendingTransaction(account.address);
  if (pending) {
    const recovered = await recoverPendingTransaction(publicClient, account.address, pending.hash);
    if (!recovered) await waitForSuccessfulReceipt(publicClient, pending.hash);
  }
  const read = () => publicClient.readContract({ address: VELO_REGISTRY_ADDRESS, abi: VELO_REGISTRY_ABI,
    functionName: 'usernameOf', args: [account.address] });
  // Do not turn an RPC failure into an unclaimed name or silently rename a wallet.
  const existing = await read();
  if (existing === normalized) return null;
  if (existing) throw new Error(`This trading wallet is registered as @${existing}. Use that handle to continue.`);
  const owner = await publicClient.readContract({ address: VELO_REGISTRY_ADDRESS, abi: VELO_REGISTRY_ABI,
    functionName: 'resolve', args: [normalized] });
  if (owner !== zeroAddress && owner.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error(`@${normalized} is already registered on-chain. Choose another handle.`);
  }
  const hash = await claimUsername(walletClient, normalized);
  await waitForSuccessfulReceipt(publicClient, hash);
  if (await read() !== normalized) throw new Error('Username registration could not be confirmed. Retry account setup.');
  return hash;
}
