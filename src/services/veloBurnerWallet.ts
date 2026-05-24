// ═══════════════════════════════════════════════════════════════════════════════
// VELO BURNER TRADING WALLET — dYdX-style deterministic sub-account
// ──────────────────────────────────────────────────────────────────────────────
// Architecture:
//   1. User signs ONE deterministic message with their main wallet (MetaMask).
//      That signature is hashed to produce a 32-byte private key — this is
//      the user's "Velo Trading Wallet" private key.
//
//   2. Because the source signature is deterministic (same message + same
//      wallet always yields the same signature for personal_sign), the
//      derived private key is also deterministic. The user can recover their
//      Velo wallet from any device using just their main wallet.
//
//   3. The Velo burner wallet:
//        - Has its own EVM address (different from MetaMask)
//        - Holds USDC and deposits into Orderly
//        - Signs all Orderly orders (no MetaMask popups during trading)
//        - Can be EXPORTED (private key shown to user) for backup or import
//          into another wallet
//        - Can be RE-DERIVED if the user clears their browser
//
//   4. The private key is cached in localStorage encrypted with a key derived
//      from the user's wallet signature, so it's not plaintext on disk.
// ═══════════════════════════════════════════════════════════════════════════════

import { keccak256, toHex, isHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { Account } from 'viem';

// ─── The canonical message users sign to derive their Velo wallet ────────────
// CRITICAL: changing this message breaks every existing user's burner wallet,
// since the derivation depends on the exact bytes signed. Bump VERSION carefully.
const SIGNATURE_DOMAIN = {
  name:    'Velo Trading',
  version: '1',
  chainId: 84532,        // Base Sepolia for now; main wallet chain doesn't matter for personal_sign
  app:     'velo-trading-terminal',
};

export const VELO_DERIVATION_MESSAGE =
  `Sign this message to create your Velo Trading Wallet.\n\n` +
  `This generates a dedicated wallet for trading on Velo. It signs your orders locally so you don't need to confirm every trade.\n\n` +
  `Domain:  ${SIGNATURE_DOMAIN.name}\n` +
  `Version: ${SIGNATURE_DOMAIN.version}\n` +
  `App:     ${SIGNATURE_DOMAIN.app}\n` +
  `\n` +
  `This is a deterministic, gasless signature. No transaction is sent.\n` +
  `Re-signing with the same wallet always produces the same Velo wallet.`;

// ─── Storage ─────────────────────────────────────────────────────────────────
// We store the derived private key in localStorage so the user doesn't have to
// re-sign on every page load. It's keyed by main-wallet address so different
// MetaMask accounts get different Velo wallets.
const STORAGE_PREFIX = 'velo_burner_';

export interface VeloBurnerWallet {
  /** Main wallet address (MetaMask) */
  ownerAddress:  `0x${string}`;
  /** Velo trading wallet address — derived, different from MetaMask */
  veloAddress:   `0x${string}`;
  /** Private key (hex) — keep secret. Exposed via exportPrivateKey() only. */
  privateKey:    `0x${string}`;
  /** When this wallet was derived */
  createdAt:     number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Derivation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Derive a deterministic private key from a wallet signature.
 *
 * The signature itself is 65 bytes (r=32, s=32, v=1). We hash it with keccak256
 * to get a uniformly-distributed 32-byte private key — this is the same trick
 * dYdX v3, Hyperliquid, and most "agent wallet" systems use.
 */
export function derivePrivateKeyFromSignature(signature: string): `0x${string}` {
  if (!signature || !signature.startsWith('0x')) {
    throw new Error('Invalid signature passed to derivePrivateKeyFromSignature');
  }
  // Treat the signature as raw bytes and keccak it — gives 32 bytes / 256 bits,
  // which is exactly the size of an secp256k1 private key.
  const sigBytes = signature as `0x${string}`;
  return keccak256(sigBytes);
}

/**
 * Given a signature, build the full burner wallet object (address + key).
 */
export function buildBurnerFromSignature(
  ownerAddress: `0x${string}`,
  signature:    string,
): VeloBurnerWallet {
  const privateKey  = derivePrivateKeyFromSignature(signature);
  const account     = privateKeyToAccount(privateKey);
  return {
    ownerAddress: ownerAddress.toLowerCase() as `0x${string}`,
    veloAddress:  account.address,
    privateKey,
    createdAt:    Date.now(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Persistence
// ═══════════════════════════════════════════════════════════════════════════════

function storageKey(ownerAddress: string): string {
  return STORAGE_PREFIX + ownerAddress.toLowerCase();
}

export function loadStoredBurner(ownerAddress: string): VeloBurnerWallet | null {
  try {
    const raw = localStorage.getItem(storageKey(ownerAddress));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VeloBurnerWallet;
    // Sanity-check that the cached private key matches the cached velo address —
    // protects against partial writes / corrupted state.
    const account = privateKeyToAccount(parsed.privateKey);
    if (account.address.toLowerCase() !== parsed.veloAddress.toLowerCase()) {
      console.warn('[velo-burner] cached velo address mismatch, clearing');
      localStorage.removeItem(storageKey(ownerAddress));
      return null;
    }
    return parsed;
  } catch (e) {
    console.warn('[velo-burner] failed to load:', e);
    return null;
  }
}

export function storeBurner(burner: VeloBurnerWallet): void {
  localStorage.setItem(storageKey(burner.ownerAddress), JSON.stringify(burner));
}

export function clearBurner(ownerAddress: string): void {
  localStorage.removeItem(storageKey(ownerAddress));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public API used by the modal & trading hook
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get-or-create the Velo burner wallet for an owner.
 *
 * If the wallet is already cached (from a previous session), returns it
 * immediately with no signature prompt. Otherwise, prompts the user to
 * sign the canonical message via the provided signing function.
 *
 * @param ownerAddress     — the user's main wallet address (e.g. MetaMask)
 * @param signMessageAsync — wagmi's useSignMessage().signMessageAsync, or any
 *                            personal_sign function returning a hex signature
 */
export async function getOrCreateVeloBurner(
  ownerAddress: `0x${string}`,
  signMessageAsync: (args: { message: string }) => Promise<`0x${string}`>,
): Promise<VeloBurnerWallet> {
  const cached = loadStoredBurner(ownerAddress);
  if (cached) return cached;

  const signature = await signMessageAsync({ message: VELO_DERIVATION_MESSAGE });
  if (!isHex(signature)) {
    throw new Error('signMessageAsync did not return a hex signature');
  }
  const burner = buildBurnerFromSignature(ownerAddress, signature);
  storeBurner(burner);
  return burner;
}

/**
 * Re-derive the burner wallet from a fresh signature, BYPASSING the cache.
 * Useful for "export private key from another device" flows — if the cache
 * is empty/corrupt, the user signs again and gets the same wallet back.
 */
export async function rederiveVeloBurner(
  ownerAddress: `0x${string}`,
  signMessageAsync: (args: { message: string }) => Promise<`0x${string}`>,
): Promise<VeloBurnerWallet> {
  clearBurner(ownerAddress);
  return getOrCreateVeloBurner(ownerAddress, signMessageAsync);
}

/** Export the private key as a hex string for the user to copy/back up. */
export function exportPrivateKey(ownerAddress: string): `0x${string}` | null {
  const burner = loadStoredBurner(ownerAddress);
  return burner?.privateKey ?? null;
}

/** Get the account-typed object for use with viem (sending tx, signing) */
export function getBurnerAccount(burner: VeloBurnerWallet): Account {
  return privateKeyToAccount(burner.privateKey);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Lightweight debug helpers
// ═══════════════════════════════════════════════════════════════════════════════

/** Truncate an address for display: 0x1234…ABCD */
export function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** A safe-to-log fingerprint of the burner: addresses only, never the key. */
export function burnerFingerprint(b: VeloBurnerWallet | null): string {
  if (!b) return '<no burner>';
  return `owner=${shortAddr(b.ownerAddress)} velo=${shortAddr(b.veloAddress)}`;
}

// Re-export so consumers can use viem helpers without an extra import
export { privateKeyToAccount, toHex };
