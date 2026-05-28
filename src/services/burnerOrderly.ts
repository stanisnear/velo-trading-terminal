// ═══════════════════════════════════════════════════════════════════════════════
// BURNER-WALLET INTEGRATION FOR ORDERLY
// ──────────────────────────────────────────────────────────────────────────────
// Wraps the Orderly registration / deposit / withdraw flows so they sign with
// the user's Velo burner wallet (no MetaMask popups during normal trading).
//
// This is the "dYdX agent wallet" pattern: MetaMask signs ONCE to derive the
// burner; then the burner does everything else autonomously, including:
//   - EIP-712 signatures for Orderly registration / key binding / withdraw
//   - On-chain transactions (USDC approve, vault deposit, etc.)
//
// Public API:
//   - registerOrderlyKeyWithBurner(burner)     →  registers burner.veloAddress
//   - depositFromBurner(burner, amountUSDC)    →  burner sends approve + deposit txs
//   - signOrderlyTypedDataWithBurner(burner, typedData) → returns sig hex
// ═══════════════════════════════════════════════════════════════════════════════

import { createWalletClient, createPublicClient, http, parseUnits, formatUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import {
  ORDERLY_BROKER_ID,
  ORDERLY_CHAIN_ID,
  ORDERLY_VAULT_ADDRESS,
  ORDERLY_VAULT_ABI,
  USDC_BASE_SEPOLIA,
  getStoredKeypair,
  getAccountId,
  buildDepositData,
  generateOrderlyKeypair,
  type OrderlyKeypair,
} from './orderlyService';
import type { VeloBurnerWallet } from './veloBurnerWallet';

// ─── Constants missing from orderlyService exports ────────────────────────────
const ORDERLY_TESTNET_BASE = 'https://testnet-api-evm.orderly.org';
const ORDERLY_VERIFIER     = '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC'; // Orderly EIP-712 verifier (matches orderlyService.ts)

// ─── Ed25519 keypair generation ────────────────────────────────────────────────
// Reuses the canonical Web Crypto implementation from orderlyService.ts.
// Earlier builds had a local @noble/curves-based reimplementation here that
// (a) wasn't even installed in package.json, so dynamic import would fail at
// runtime, and (b) stored privateKey as Base58 — which signOrderlyRequest
// then parsed as hex pairs, producing garbage signatures and silent auth
// failures (every getOrderlyBalance returned 0). Both problems are gone now.

function storeKeypair(address: string, kp: OrderlyKeypair) {
  try { localStorage.setItem(`orderly_kp_${address.toLowerCase()}`, JSON.stringify(kp)); } catch {}
}

// ─── ABIs ────────────────────────────────────────────────────────────────────
const ERC20_ABI = [
  { name: 'approve',   type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { name: 'balanceOf', type: 'function', stateMutability: 'view',       inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'allowance', type: 'function', stateMutability: 'view',       inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const;

// ─── Public RPC client (free, no key needed for testnet) ─────────────────────
const BASE_SEPOLIA_RPC = 'https://sepolia.base.org';
const publicClient = createPublicClient({ chain: baseSepolia, transport: http(BASE_SEPOLIA_RPC) });

// ─── EIP-712 domains/types (same as in orderlyService, copied to keep this file self-contained) ─
const OFF_CHAIN_DOMAIN = {
  name:              'Orderly',
  version:           '1',
  chainId:           ORDERLY_CHAIN_ID,
  verifyingContract: ORDERLY_VERIFIER as `0x${string}`,
} as const;

const REGISTRATION_TYPES = {
  Registration: [
    { name: 'brokerId',          type: 'string'  },
    { name: 'chainId',           type: 'uint256' },
    { name: 'timestamp',         type: 'uint64'  },
    { name: 'registrationNonce', type: 'uint256' },
  ],
} as const;

const ADD_KEY_TYPES = {
  AddOrderlyKey: [
    { name: 'brokerId',   type: 'string'  },
    { name: 'chainId',    type: 'uint256' },
    { name: 'orderlyKey', type: 'string'  },
    { name: 'scope',      type: 'string'  },
    { name: 'timestamp',  type: 'uint64'  },
    { name: 'expiration', type: 'uint64'  },
  ],
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/** Use the canonical accountId derivation from orderlyService (verified against
 *  Orderly's server-side derivation by registering a fresh account and
 *  comparing local result to the server's `account_id` response). */
const accountIdFor = (addr: string) => getAccountId(addr);

async function fetchRegistrationNonce(): Promise<string> {
  const res = await fetch(`${ORDERLY_TESTNET_BASE}/v1/registration_nonce`);
  const d = await res.json();
  if (!d?.success) throw new Error('failed to fetch registration_nonce');
  return d.data.registration_nonce;
}

async function checkAccountExists(addr: string): Promise<boolean> {
  try {
    const r = await fetch(`${ORDERLY_TESTNET_BASE}/v1/get_account?address=${addr}&broker_id=${ORDERLY_BROKER_ID}`);
    const d = await r.json();
    return !!(d?.success && d?.data?.account_id);
  } catch { return false; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public: register burner with Orderly + bind ed25519 trading key
// ═══════════════════════════════════════════════════════════════════════════════

export interface BurnerRegistrationResult {
  success:   boolean;
  keypair?:  OrderlyKeypair;
  accountId?: string;
  error?:    string;
}

/**
 * Register the burner wallet on Orderly + bind a trading key.
 * Both EIP-712 signatures are made LOCALLY by the burner — zero MetaMask popups.
 */
export async function registerOrderlyKeyWithBurner(
  burner: VeloBurnerWallet,
): Promise<BurnerRegistrationResult> {
  try {
    const account = privateKeyToAccount(burner.privateKey);

    // ── Step 1: register account if not yet registered ──────────────
    const exists = await checkAccountExists(burner.veloAddress);
    if (!exists) {
      const regNonce = await fetchRegistrationNonce();
      const ts       = Date.now();

      const regSig = await account.signTypedData({
        domain: OFF_CHAIN_DOMAIN,
        types:  REGISTRATION_TYPES,
        primaryType: 'Registration',
        message: {
          brokerId:          ORDERLY_BROKER_ID,
          chainId:           BigInt(ORDERLY_CHAIN_ID),
          timestamp:         BigInt(ts),
          registrationNonce: BigInt(regNonce),
        },
      });

      const regRes = await fetch(`${ORDERLY_TESTNET_BASE}/v1/register_account`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            brokerId:          ORDERLY_BROKER_ID,
            chainId:           ORDERLY_CHAIN_ID,
            timestamp:         ts,
            registrationNonce: regNonce,
            chainType:         'EVM',
          },
          signature:   regSig,
          userAddress: burner.veloAddress,
        }),
      });
      const regJson = await regRes.json();
      if (!regJson?.success) {
        const already = regJson?.code === -1001 || /already.*registered/i.test(regJson?.message || '');
        if (!already) {
          return { success: false, error: regJson?.message || `register_account failed (${regRes.status})` };
        }
      }
    }

    // ── Step 2: bind trading key ────────────────────────────────────
    // Check cached keypair is in the expected HEX format (64 hex chars = 32 bytes).
    // Earlier builds of this file stored the privateKey as Base58 by mistake,
    // which made every signed API request fail silently → balance always 0.
    // If we detect a legacy/invalid keypair, drop it and bind a fresh one.
    const cachedKp = getStoredKeypair(burner.veloAddress);
    const isHex64 = (s: string) => typeof s === 'string' && s.length === 64 && /^[0-9a-fA-F]+$/.test(s);
    if (cachedKp && isHex64(cachedKp.privateKey)) {
      // already bound on a previous session, in the correct format
      return { success: true, keypair: cachedKp, accountId: accountIdFor(burner.veloAddress) };
    }
    if (cachedKp && !isHex64(cachedKp.privateKey)) {
      // Legacy bad-format keypair — clear it so we bind a fresh one below.
      try { localStorage.removeItem(`orderly_kp_${burner.veloAddress.toLowerCase()}`); } catch {}
    }

    const kp    = await generateOrderlyKeypair();
    const ts2   = Date.now();
    const expMs = ts2 + 365 * 24 * 60 * 60 * 1000;

    const keySig = await account.signTypedData({
      domain: OFF_CHAIN_DOMAIN,
      types:  ADD_KEY_TYPES,
      primaryType: 'AddOrderlyKey',
      message: {
        brokerId:   ORDERLY_BROKER_ID,
        chainId:    BigInt(ORDERLY_CHAIN_ID),
        orderlyKey: kp.publicKey,
        scope:      'read,trading',
        timestamp:  BigInt(ts2),
        expiration: BigInt(expMs),
      },
    });

    const keyRes = await fetch(`${ORDERLY_TESTNET_BASE}/v1/orderly_key`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          brokerId:   ORDERLY_BROKER_ID,
          chainId:    ORDERLY_CHAIN_ID,
          orderlyKey: kp.publicKey,
          scope:      'read,trading',
          timestamp:  ts2,
          expiration: expMs,
        },
        signature:   keySig,
        userAddress: burner.veloAddress,
      }),
    });
    const keyJson = await keyRes.json();
    if (!keyJson?.success) {
      return { success: false, error: keyJson?.message || `orderly_key failed (${keyRes.status})` };
    }

    storeKeypair(burner.veloAddress, kp);
    return { success: true, keypair: kp, accountId: accountIdFor(burner.veloAddress) };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Registration failed' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public: deposit USDC from burner wallet → Orderly vault
// ═══════════════════════════════════════════════════════════════════════════════

export interface BurnerDepositResult {
  success:    boolean;
  approveTx?: `0x${string}`;
  depositTx?: `0x${string}`;
  error?:     string;
}

/**
 * Deposit USDC from the burner wallet into the Orderly vault.
 * Both txs (approve + deposit) are signed and broadcast LOCALLY — no MetaMask popups.
 *
 * @param amountWei  — amount in 6-decimal USDC units. Pass the burner's full
 *                     USDC balance for "deposit everything".
 */
export async function depositFromBurner(
  burner: VeloBurnerWallet,
  amountWei: bigint,
  onProgress?: (status: string) => void,
): Promise<BurnerDepositResult> {
  try {
    const account = privateKeyToAccount(burner.privateKey);
    const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http(BASE_SEPOLIA_RPC) });

    // Sanity check: does the burner have enough ETH for gas?
    const ethBal = await publicClient.getBalance({ address: burner.veloAddress });
    if (ethBal < parseUnits('0.0001', 18)) {
      return {
        success: false,
        error: `Velo wallet (${burner.veloAddress}) needs ETH for gas. Send a small amount of Base Sepolia ETH from your main wallet first.`,
      };
    }

    // ── Step 1: approve (skip if already enough) ──────────────────
    onProgress?.('Checking USDC allowance…');
    const allowance = await publicClient.readContract({
      address:      USDC_BASE_SEPOLIA as `0x${string}`,
      abi:          ERC20_ABI,
      functionName: 'allowance',
      args:         [burner.veloAddress, ORDERLY_VAULT_ADDRESS as `0x${string}`],
    }) as bigint;

    let approveTx: `0x${string}` | undefined;
    if (allowance < amountWei) {
      onProgress?.('Approving USDC…');
      approveTx = await walletClient.writeContract({
        address:      USDC_BASE_SEPOLIA as `0x${string}`,
        abi:          ERC20_ABI,
        functionName: 'approve',
        args:         [ORDERLY_VAULT_ADDRESS as `0x${string}`, amountWei],
      });
      onProgress?.('Waiting for approval confirmation…');
      await publicClient.waitForTransactionReceipt({ hash: approveTx });
    }

    // ── Step 2: determine deposit fee ────────────────────────────
    // getDepositFee() is unreliable on testnet (returns 0x on Base Sepolia vault).
    // Strategy: try calling it first; if it reverts/returns empty, fall back to
    // simulating the deposit with value=0 to see if it reverts on fee, then use
    // a safe hardcoded estimate (0.0005 ETH covers LayerZero fees with margin).
    onProgress?.('Calculating deposit fee…');
    const depositData = buildDepositData(burner.veloAddress, amountWei);

    let depositFee = 0n;
    try {
      const feeResult = await publicClient.readContract({
        address:      ORDERLY_VAULT_ADDRESS as `0x${string}`,
        abi:          ORDERLY_VAULT_ABI,
        functionName: 'getDepositFee',
        args:         [burner.veloAddress, depositData],
      }) as bigint;
      // Only trust the result if it's a plausible fee (> 0 and < 0.01 ETH)
      if (feeResult > 0n && feeResult < parseUnits('0.01', 18)) {
        depositFee = feeResult;
      }
    } catch {
      // getDepositFee not available or reverted — use safe estimate below
    }

    // If fee came back as 0 or the call failed, use a safe estimate.
    // Orderly testnet LayerZero fee is typically 0 on Base Sepolia (same-chain vault).
    // We try with 0 first, then with 0.0005 ETH if that fails.
    if (depositFee === 0n) {
      try {
        await publicClient.simulateContract({
          address:      ORDERLY_VAULT_ADDRESS as `0x${string}`,
          abi:          ORDERLY_VAULT_ABI,
          functionName: 'deposit',
          args:         [depositData],
          account:      account.address,
          value:        0n,
        });
        depositFee = 0n; // simulation passed with 0 fee
      } catch {
        depositFee = parseUnits('0.0005', 18); // fallback estimate
      }
    }

    if (ethBal < depositFee + parseUnits('0.0001', 18)) {
      return {
        success: false,
        approveTx,
        error: `Velo wallet needs at least ${formatUnits(depositFee + parseUnits('0.0001', 18), 18)} ETH for the deposit fee + gas. Current balance: ${formatUnits(ethBal, 18)} ETH.`,
      };
    }

    // ── Step 3: deposit ───────────────────────────────────────────
    onProgress?.('Submitting deposit…');
    let depositTx: `0x${string}`;
    try {
      depositTx = await walletClient.writeContract({
        address:      ORDERLY_VAULT_ADDRESS as `0x${string}`,
        abi:          ORDERLY_VAULT_ABI,
        functionName: 'deposit',
        args:         [depositData],
        value:        depositFee,
      });
    } catch (firstErr: any) {
      // If it failed and we used fee=0, retry with a small fee in case the contract needs it
      if (depositFee === 0n) {
        depositFee = parseUnits('0.0005', 18);
        if (ethBal < depositFee + parseUnits('0.0001', 18)) {
          return { success: false, approveTx, error: firstErr?.shortMessage || firstErr?.message || 'Deposit failed' };
        }
        depositTx = await walletClient.writeContract({
          address:      ORDERLY_VAULT_ADDRESS as `0x${string}`,
          abi:          ORDERLY_VAULT_ABI,
          functionName: 'deposit',
          args:         [depositData],
          value:        depositFee,
        });
      } else {
        throw firstErr;
      }
    }
    onProgress?.('Waiting for deposit confirmation…');
    await publicClient.waitForTransactionReceipt({ hash: depositTx });

    return { success: true, approveTx, depositTx };
  } catch (e: any) {
    return { success: false, error: e?.shortMessage || e?.message || 'Deposit failed' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public: read burner balances
// ═══════════════════════════════════════════════════════════════════════════════

export async function getBurnerBalances(burner: VeloBurnerWallet): Promise<{ eth: bigint; usdc: bigint }> {
  try {
    const [eth, usdc] = await Promise.all([
      publicClient.getBalance({ address: burner.veloAddress }),
      publicClient.readContract({
        address:      USDC_BASE_SEPOLIA as `0x${string}`,
        abi:          ERC20_ABI,
        functionName: 'balanceOf',
        args:         [burner.veloAddress],
      }) as Promise<bigint>,
    ]);
    return { eth, usdc };
  } catch {
    return { eth: 0n, usdc: 0n };
  }
}
