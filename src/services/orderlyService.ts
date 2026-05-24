// ─────────────────────────────────────────────────────────────────────────────
// orderlyService.ts — Orderly Network integration (Base Sepolia testnet)
//
// BROKER ID: "woofi_dex" — always registered on Orderly testnet.
// Orderly ONE is mainnet-only; using it causes "brokerId is not exist".
//
// DEPENDENCIES: viem (already in package.json), browser Web Crypto for Ed25519.
//
// CRITICAL HISTORY: A previous build of this file shipped a hand-rolled
// keccak256 implementation ("keccak256Native") that produced WRONG hashes —
// e.g. keccak256("woofi_dex") returned 0x8c10ee83… instead of the canonical
// 0x083098c5…. That single bug poisoned everything downstream:
//   1. account_id sent in every `orderly-account-id` header was wrong
//   2. server returned "account id not exist" → getOrderlyBalance always 0
//   3. on-chain deposits used a phantom accountId, never crediting Orderly
//   4. faucet polling never observed the credit (it was looking under a
//      different accountId than where Orderly actually credited the 1000 USDC)
// We now use viem's keccak256 + encodeAbiParameters directly. They are
// battle-tested and produce correct hashes (verified against Orderly's
// register_account response).
// ─────────────────────────────────────────────────────────────────────────────

import { keccak256 as viemKeccak256, encodeAbiParameters } from 'viem';


// ─── Constants ───────────────────────────────────────────────────────────────

export const ORDERLY_BROKER_ID  = 'woofi_dex';   // valid on testnet
export const ORDERLY_CHAIN_ID   = 84532;          // Base Sepolia
export const ORDERLY_NETWORK_ID = 'testnet';

const ORDERLY_API = 'https://testnet-api-evm.orderly.org';

export const USDC_BASE_SEPOLIA     = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
// IMPORTANT: This MUST be Base Sepolia's vault. The previous value
// (0x0EaC556c0C2321BA25b9DC01e4e3c95aD5CDCd2f) is Arbitrum Sepolia's vault and
// has no contract deployed at that address on Base Sepolia, so every deposit
// call hit a no-op fallback (25k gas, zero events, funds never credited).
// Source: https://orderly.network/docs/build-on-omnichain/addresses (Base section).
export const ORDERLY_VAULT_ADDRESS = '0xdc7348975aE9334DbdcB944DDa9163Ba8406a0ec';

export const ORDERLY_VAULT_ABI = [
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'payable',
    inputs: [{ name: 'depositInput', type: 'tuple', components: [
      { name: 'accountId',   type: 'bytes32' },
      { name: 'brokerHash',  type: 'bytes32' },
      { name: 'tokenHash',   type: 'bytes32' },
      { name: 'tokenAmount', type: 'uint128' },
    ]}],
    outputs: [],
  },
  {
    name: 'getDepositFee',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'sender',       type: 'address' },
      { name: 'depositInput', type: 'tuple', components: [
        { name: 'accountId',   type: 'bytes32' },
        { name: 'brokerHash',  type: 'bytes32' },
        { name: 'tokenHash',   type: 'bytes32' },
        { name: 'tokenAmount', type: 'uint128' },
      ]},
    ],
    outputs: [{ type: 'uint256' }],
  },
] as const;

export const ETH_FAUCETS = [
  { id: 'alchemy',   name: 'Alchemy Faucet',      url: 'https://www.alchemy.com/faucets/base-sepolia', note: 'Requires Alchemy account' },
  { id: 'quicknode', name: 'QuickNode Faucet',     url: 'https://faucet.quicknode.com/base/sepolia',    note: 'Fast, no login' },
  { id: 'base',      name: 'Coinbase Base Faucet', url: 'https://faucet.base.org/',                    note: 'Official Base faucet' },
];

// ─── URL helpers ─────────────────────────────────────────────────────────────
//
// Honest accounting of what's verifiable from outside the app:
//
//   ✓ Real USDC deposits to the Orderly vault on Base Sepolia produce a
//     transaction hash you can look up at sepolia.basescan.org/tx/<hash>.
//   ✓ The Orderly vault contract on Base Sepolia has a public address page:
//     sepolia.basescan.org/address/0xdc7348975aE9334DbdcB944DDa9163Ba8406a0ec
//     — you can confirm it exists and see all deposits/withdrawals to it.
//   ✓ Your burner wallet address can be inspected at sepolia.basescan.org
//     to see its on-chain history.
//
// What's NOT verifiable from outside:
//
//   ✗ The Orderly testnet faucet is server-side. It credits your Orderly
//     account database directly without producing a Base Sepolia tx. There
//     is no on-chain proof of a faucet credit.
//   ✗ Orders are matched off-chain on Orderly's L2 rollup. Individual orders
//     don't have public URLs anywhere — only deposits/withdrawals settle
//     on Base Sepolia and are publicly verifiable.
//   ✗ WOOFi Pro testnet (testnet-dex-evm.woo.org) runs on Arbitrum Sepolia,
//     not Base Sepolia. It can't see Velo's deposits even though both are
//     "Orderly testnet" — different settlement chains.

/** BaseScan tx page — works for any real on-chain transaction. */
export const baseScanTxUrl = (txHash: string) =>
  `https://sepolia.basescan.org/tx/${txHash}`;

/** BaseScan address page — works for any wallet or contract. */
export const baseScanAddressUrl = (address: string) =>
  `https://sepolia.basescan.org/address/${address}`;

/** The Orderly vault contract on Base Sepolia — where real deposits land. */
export const orderlyVaultBaseScanUrl = () =>
  `https://sepolia.basescan.org/address/${ORDERLY_VAULT_ADDRESS}`;

/**
 * Returns null. Per-order URLs do not exist — orders are off-chain matching.
 * Kept as a function for backwards compatibility with old call sites that
 * are being phased out.
 */
export const orderlyOrderUrl = (_orderId: number): string | null => null;

/**
 * Returns null. There is no public Orderly portfolio page that works without
 * the user's own wallet connected — and the WOOFi Pro UI runs on a different
 * settlement chain (Arbitrum Sepolia) so it can't show our Base Sepolia data.
 * Kept as a function for backwards compatibility.
 */
export const orderlyPortfolioUrl = (): string | null => null;

// ─── Account ID derivation ───────────────────────────────────────────────────
// account_id = keccak256(abi.encode(address, keccak256(brokerId)))
// Verified to match Orderly's server-side derivation by registering a fresh
// account and comparing the local result to the server's `account_id` response.

const brokerHashHex = (): `0x${string}` =>
  viemKeccak256(new TextEncoder().encode(ORDERLY_BROKER_ID));

export function getAccountId(userAddress: string): `0x${string}` {
  const encoded = encodeAbiParameters(
    [{ type: 'address' }, { type: 'bytes32' }],
    [userAddress as `0x${string}`, brokerHashHex()],
  );
  return viemKeccak256(encoded);
}

// ─── Keypair types & storage ─────────────────────────────────────────────────

export interface OrderlyKeypair {
  publicKey:  string; // "ed25519:base58..."
  privateKey: string; // hex
}

const storageKey = (address: string) => `orderly_kp_${address.toLowerCase()}`;

export function getStoredKeypair(address: string): OrderlyKeypair | null {
  try {
    const raw = localStorage.getItem(storageKey(address));
    if (!raw) return null;
    const kp = JSON.parse(raw) as OrderlyKeypair;
    // Sanity-check the private key is in the expected hex format
    // (32 bytes = 64 hex chars). Legacy builds wrote it as Base58, which
    // breaks every signed API call. Auto-purge so the user re-binds.
    const ok = typeof kp?.privateKey === 'string'
            && kp.privateKey.length === 64
            && /^[0-9a-fA-F]+$/.test(kp.privateKey);
    if (!ok) {
      try { localStorage.removeItem(storageKey(address)); } catch {}
      return null;
    }
    return kp;
  } catch { return null; }
}

function storeKeypair(address: string, kp: OrderlyKeypair) {
  try { localStorage.setItem(storageKey(address), JSON.stringify(kp)); } catch {}
}

// ─── Base58 encoder ──────────────────────────────────────────────────────────

function encodeBase58(bytes: Uint8Array): string {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let num = BigInt('0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(''));
  let result = '';
  while (num > 0n) {
    result = ALPHABET[Number(num % 58n)] + result;
    num = num / 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    result = '1' + result;
  }
  return result;
}

// ─── Ed25519 key generation via Web Crypto API ───────────────────────────────
// Uses browser-native crypto.subtle — no @noble/* packages needed.
// privateKey is returned as 64-char hex (this is what signOrderlyRequest expects).
// publicKey is "ed25519:<base58>" (Orderly's wire format).
export async function generateOrderlyKeypair(): Promise<OrderlyKeypair> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'Ed25519' } as EcKeyGenParams,
    true,
    ['sign', 'verify'],
  );
  const pkcs8     = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
  // PKCS#8 for Ed25519: fixed 16-byte header, last 32 bytes = raw seed
  const privBytes = new Uint8Array(pkcs8).slice(-32);
  const rawPub    = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  const pubBytes  = new Uint8Array(rawPub);

  const privHex   = Array.from(privBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const pubBase58 = encodeBase58(pubBytes);
  return { publicKey: `ed25519:${pubBase58}`, privateKey: privHex };
}

// ─── EIP-712 off-chain domain ────────────────────────────────────────────────

const OFF_CHAIN_DOMAIN = {
  name:              'Orderly',
  version:           '1',
  chainId:           ORDERLY_CHAIN_ID,
  verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC' as `0x${string}`,
} as const;

// ─── Registration helpers ─────────────────────────────────────────────────────

async function getRegistrationNonce(): Promise<string> {
  const res  = await fetch(`${ORDERLY_API}/v1/registration_nonce`);
  const json = await res.json();
  if (!json?.data?.registration_nonce) throw new Error('Failed to get registration nonce');
  return json.data.registration_nonce;
}

async function registerAccount(address: string, signature: string, message: any): Promise<void> {
  // Canonical Orderly EVM register_account body shape (verified against
  // the docs and a live testnet registration).
  const res  = await fetch(`${ORDERLY_API}/v1/register_account`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      message: { ...message, chainType: 'EVM' },
      signature,
      userAddress: address,
    }),
  });
  const json = await res.json();
  // "account already exists" = already registered — treat as success, proceed to Sig 2
  if (!json.success) {
    const msg = (json.message || JSON.stringify(json)).toLowerCase();
    if (msg.includes('already exist') || msg.includes('already registered')) return;
    throw new Error(json.message || JSON.stringify(json));
  }
}

async function addOrderlyKey(address: string, signature: string, message: object): Promise<void> {
  const res  = await fetch(`${ORDERLY_API}/v1/orderly_key`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ message, signature, userAddress: address }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.message || JSON.stringify(json));
}

async function isAccountRegistered(address: string): Promise<boolean> {
  try {
    const res  = await fetch(`${ORDERLY_API}/v1/get_account?address=${address}&broker_id=${ORDERLY_BROKER_ID}`);
    const json = await res.json();
    return !!(json?.success && json?.data?.account_id);
  } catch { return false; }
}

// ─── Main: registerOrderlyKey ─────────────────────────────────────────────────

export async function registerOrderlyKey(
  address:            string,
  signTypedDataAsync: (args: any) => Promise<string>,
): Promise<{ success: boolean; keypair?: OrderlyKeypair; error?: string }> {
  try {
    const alreadyRegistered = await isAccountRegistered(address);
    const timestamp         = Date.now();
    const keypair           = await generateOrderlyKeypair();

    if (!alreadyRegistered) {
      const nonce      = await getRegistrationNonce();
      const regMessage = {
        brokerId:          ORDERLY_BROKER_ID,
        chainId:           ORDERLY_CHAIN_ID,
        timestamp,
        registrationNonce: nonce,
      };
      const regSig = await signTypedDataAsync({
        domain:      OFF_CHAIN_DOMAIN,
        types: {
          Registration: [
            { name: 'brokerId',          type: 'string'  },
            { name: 'chainId',           type: 'uint256' },
            { name: 'timestamp',         type: 'uint64'  },
            { name: 'registrationNonce', type: 'uint256' },
          ],
        },
        primaryType: 'Registration',
        message:     regMessage,
      });
      await registerAccount(address, regSig, regMessage);
    }

    const expiration = timestamp + 365 * 24 * 60 * 60 * 1000;
    const keyMessage = {
      brokerId:   ORDERLY_BROKER_ID,
      chainId:    ORDERLY_CHAIN_ID,
      orderlyKey: keypair.publicKey,
      scope:      'trading',
      timestamp,
      expiration,
    };
    const keySig = await signTypedDataAsync({
      domain:      OFF_CHAIN_DOMAIN,
      types: {
        AddOrderlyKey: [
          { name: 'brokerId',   type: 'string'  },
          { name: 'chainId',    type: 'uint256' },
          { name: 'orderlyKey', type: 'string'  },
          { name: 'scope',      type: 'string'  },
          { name: 'timestamp',  type: 'uint64'  },
          { name: 'expiration', type: 'uint64'  },
        ],
      },
      primaryType: 'AddOrderlyKey',
      message:     keyMessage,
    });
    await addOrderlyKey(address, keySig, keyMessage);
    storeKeypair(address, keypair);
    return { success: true, keypair };
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
}

// ─── Orderly trading-account balance (USDC on the Orderly ledger) ────────────
// This is the AUTHORITATIVE balance — the faucet credits *this*, not the wallet.
export async function getOrderlyBalance(address: string, keypair: OrderlyKeypair): Promise<number> {
  try {
    const accountId = getAccountId(address);
    const timestamp = Date.now();
    const path      = '/v1/client/holding';
    const sig       = await signOrderlyRequest(keypair, 'GET', path, timestamp);
    const res  = await fetch(`${ORDERLY_API}${path}`, {
      headers: orderlyHeaders(accountId, keypair.publicKey, sig, timestamp),
    });
    const json = await res.json();
    if (!json?.success) {
      // Don't swallow auth errors silently — they look identical to "no funds".
      console.warn('[Orderly] getOrderlyBalance failed:', json?.code, json?.message);
      return 0;
    }
    const usdc = json?.data?.holding?.find((h: any) => h.token === 'USDC');
    return usdc ? parseFloat(usdc.holding) : 0;
  } catch (e) {
    console.warn('[Orderly] getOrderlyBalance threw:', e);
    return 0;
  }
}

// ─── Faucet ───────────────────────────────────────────────────────────────────
// IMPORTANT: Orderly's faucet API ALWAYS returns {success:true}, even for
// completely unregistered or fake addresses. It cannot be trusted on its own.
// The only reliable test is to poll getOrderlyBalance() afterward — the
// faucet credits the Orderly trading account, NOT your wallet.
//
// Pre-condition: the account must already be REGISTERED on Orderly under
// `broker_id`. If you call faucet before registration, it silently no-ops.
export async function claimOrderlyFaucet(address: string): Promise<{ success: boolean; message: string }> {
  try {
    const res  = await fetch('/api/faucet', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        user_address: address,
        broker_id:    ORDERLY_BROKER_ID,
        chain_id:     String(ORDERLY_CHAIN_ID),
      }),
    });
    const data = await res.json();
    return {
      success: data.success === true,
      message: data.message || (data.success ? 'Faucet request accepted — funds land in your Orderly trading account in ~10–30s.' : JSON.stringify(data)),
    };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

// ─── Deposit helpers ──────────────────────────────────────────────────────────

export function buildDepositData(address: string, amount: bigint) {
  const accountId  = getAccountId(address);
  const brokerHash = viemKeccak256(new TextEncoder().encode(ORDERLY_BROKER_ID)) as `0x${string}`;
  const tokenHash  = viemKeccak256(new TextEncoder().encode('USDC')) as `0x${string}`;
  return { accountId, brokerHash, tokenHash, tokenAmount: amount } as const;
}

// ─── Orderly signed request helper ───────────────────────────────────────────
// Signs a request with the ed25519 private key stored as hex using Web Crypto.

async function signOrderlyRequest(
  keypair:   OrderlyKeypair,
  method:    string,
  path:      string,
  timestamp: number,
  body?:     string,
): Promise<string> {
  const msg       = `${timestamp}${method}${path}${body ?? ''}`;
  const msgBytes  = new TextEncoder().encode(msg);
  // Defensive: this signer assumes the private key is 64 hex chars (32 bytes).
  // A previous bug stored it as Base58, which silently produced NaN bytes →
  // garbage signature → every API call returned 0. Fail loudly instead.
  if (!/^[0-9a-fA-F]{64}$/.test(keypair.privateKey)) {
    throw new Error('Orderly keypair has invalid private key format (expected 64 hex chars)');
  }
  const privBytes = Uint8Array.from(keypair.privateKey.match(/.{2}/g)!.map(b => parseInt(b, 16)));

  // Wrap raw 32-byte seed into PKCS#8 format for Ed25519
  const pkcs8 = new Uint8Array([
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06,
    0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
    ...privBytes,
  ]);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8,
    { name: 'Ed25519' } as EcKeyImportParams,
    false,
    ['sign'],
  );
  const sigBuf = await crypto.subtle.sign({ name: 'Ed25519' } as AlgorithmIdentifier, cryptoKey, msgBytes);
  // Orderly requires base64url (url-safe, no padding) — NOT standard base64.
  return btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function orderlyHeaders(accountId: string, publicKey: string, sig: string, timestamp: number) {
  return {
    'Content-Type':       'application/json',
    'orderly-account-id': accountId,
    'orderly-key':        publicKey,
    'orderly-signature':  sig,
    'orderly-timestamp':  String(timestamp),
    'orderly-broker-id':  ORDERLY_BROKER_ID,
  };
}

// ─── Position type ────────────────────────────────────────────────────────────

export interface OrderlyPosition {
  symbol:                string;
  positionQty:           number;
  costPosition:          number;
  lastSumUnitaryFunding: number;
  pendingLongQty:        number;
  pendingShortQty:       number;
  settlePrice:           number;
  averageOpenPrice:      number;
  unsettledPnl:          number;
  markPrice:             number;
  estLiqPrice:           number | null;
  imrwithOrders:         number;
  mmrwithOrders:         number;
  pnl24H:                number;
  fee24H:                number;
  settledPnl:            number;
}

// ─── Get positions ────────────────────────────────────────────────────────────

export async function getOrderlyPositions(address: string, keypair: OrderlyKeypair): Promise<OrderlyPosition[]> {
  try {
    const accountId = getAccountId(address);
    const timestamp = Date.now();
    const path      = '/v1/positions';
    const sig       = await signOrderlyRequest(keypair, 'GET', path, timestamp);
    const res       = await fetch(`${ORDERLY_API}${path}`, {
      headers: orderlyHeaders(accountId, keypair.publicKey, sig, timestamp),
    });
    const json = await res.json();
    return json?.data?.rows ?? [];
  } catch { return []; }
}

// ─── Order request builder ────────────────────────────────────────────────────

// Exported so orderlyOrderbookStream.ts can map Velo pairs → Orderly symbols.
// Only pairs that actually exist on Orderly testnet perpetuals are included here.
// DEMO-only pairs (WIF, JUP, BONK, PEPE, RNDR, TIA, PYTH) are intentionally
// excluded — they don't exist as Orderly perps, so orders on them must stay simulated.
export const ORDERLY_SYMBOL_MAP: Record<string, string> = {
  'BTC/USD':   'PERP_BTC_USDC',
  'ETH/USD':   'PERP_ETH_USDC',
  'SOL/USD':   'PERP_SOL_USDC',
  'AVAX/USD':  'PERP_AVAX_USDC',
  'LINK/USD':  'PERP_LINK_USDC',
  'DOGE/USD':  'PERP_DOGE_USDC',
  'NEAR/USD':  'PERP_NEAR_USDC',
  'INJ/USD':   'PERP_INJ_USDC',
};

const PAIR_MAP = ORDERLY_SYMBOL_MAP;

export interface OrderlyOrderRequest {
  symbol:          string;
  order_type:      'MARKET' | 'LIMIT' | 'POST_ONLY';
  side:            'BUY' | 'SELL';
  order_quantity:  number;
  order_price?:    number;
  broker_id:       string;
}

export function buildOrderlyRequest(
  veloPair:     string,
  side:         'LONG' | 'SHORT',
  sizeUSD:      number,
  currentPrice: number,
  type:         'MARKET' | 'LIMIT' = 'MARKET',
): OrderlyOrderRequest | null {
  const symbol = PAIR_MAP[veloPair];
  if (!symbol) return null;
  const rawQty = sizeUSD / currentPrice;
  // Round qty DOWN to the symbol's base_tick step. Orderly rejects orders
  // whose quantity is not an exact multiple of base_tick with the error
  // "Order quantity does not match the step size." Using toFixed() alone
  // is NOT enough because e.g. 12.345 rounded to 6 decimals is still
  // 12.345000 which violates a 0.01 step.
  const step = getStepSize(symbol);
  const qty  = roundDownToStep(rawQty, step);
  if (qty <= 0) return null;
  return {
    symbol,
    order_type:     type,
    side:           side === 'LONG' ? 'BUY' : 'SELL',
    order_quantity: qty,
    broker_id:      ORDERLY_BROKER_ID,
  };
}

// ─── Symbol info cache (step sizes) ──────────────────────────────────────────
// Orderly's matching engine rejects orders whose `order_quantity` isn't an
// exact multiple of the symbol's `base_tick` (a.k.a. step size). We fetch
// /v1/public/info on first need and cache the result for the session, with
// hardcoded fallbacks for the eight pairs Velo currently supports — so the
// first order placed never has to wait for a network round-trip.

interface SymbolInfo { base_tick: number; quote_tick: number; min_notional?: number }

// Hardcoded fallback step sizes, verified against Orderly testnet
// /v1/public/info on 2026-04-27. These are used until the live fetch
// resolves (and as a safety net if the fetch fails).
const FALLBACK_STEP: Record<string, number> = {
  PERP_BTC_USDC:  0.0001,
  PERP_ETH_USDC:  0.001,
  PERP_SOL_USDC:  0.01,
  PERP_AVAX_USDC: 0.01,
  PERP_LINK_USDC: 0.01,
  PERP_DOGE_USDC: 1,
  PERP_NEAR_USDC: 0.1,
  PERP_INJ_USDC:  0.01,
};

const SYMBOL_INFO_CACHE: Record<string, SymbolInfo> = {};

// Kick off a background fetch of all symbols. Safe to call multiple times.
let infoFetchPromise: Promise<void> | null = null;
export function preloadOrderlySymbolInfo(): Promise<void> {
  if (infoFetchPromise) return infoFetchPromise;
  infoFetchPromise = (async () => {
    try {
      const res = await fetch(`${ORDERLY_API}/v1/public/info`);
      const json = await res.json();
      const rows = json?.data?.rows || [];
      for (const r of rows) {
        if (!r?.symbol) continue;
        SYMBOL_INFO_CACHE[r.symbol] = {
          base_tick:    Number(r.base_tick)    || FALLBACK_STEP[r.symbol] || 0.0001,
          quote_tick:   Number(r.quote_tick)   || 0.01,
          min_notional: Number(r.min_notional) || undefined,
        };
      }
    } catch (err) {
      console.warn('[orderly] preload symbol info failed, using fallbacks:', err);
    }
  })();
  return infoFetchPromise;
}

export function getStepSize(symbol: string): number {
  const cached = SYMBOL_INFO_CACHE[symbol]?.base_tick;
  if (cached && cached > 0) return cached;
  return FALLBACK_STEP[symbol] || 0.0001;
}

export function getMinNotional(symbol: string): number | undefined {
  return SYMBOL_INFO_CACHE[symbol]?.min_notional;
}

/**
 * Round a quantity DOWN to the nearest multiple of `step`.
 * Uses integer arithmetic on the scaled value to avoid floating-point drift
 * (e.g. 0.1 + 0.2 = 0.30000000000000004 would otherwise produce a value just
 * over the step and Orderly would reject).
 */
function roundDownToStep(qty: number, step: number): number {
  if (step <= 0) return qty;
  const decimals = Math.max(0, Math.ceil(-Math.log10(step)));
  const scale = Math.pow(10, decimals);
  const stepInt = Math.round(step * scale);
  const qtyInt  = Math.floor((qty * scale) / stepInt) * stepInt;
  return qtyInt / scale;
}

// ─── Place order ──────────────────────────────────────────────────────────────

export async function placeOrderlyOrder(
  address: string,
  keypair: OrderlyKeypair,
  req:     OrderlyOrderRequest,
): Promise<{ success: boolean; orderId?: number; avgPrice?: number; executedQty?: number; error?: string }> {
  try {
    const accountId = getAccountId(address);
    const timestamp = Date.now();
    const path      = '/v1/order';
    const body      = JSON.stringify(req);
    const sig       = await signOrderlyRequest(keypair, 'POST', path, timestamp, body);
    const res       = await fetch(`${ORDERLY_API}${path}`, {
      method:  'POST',
      headers: orderlyHeaders(accountId, keypair.publicKey, sig, timestamp),
      body,
    });
    const json = await res.json();
    if (!json.success) return { success: false, error: json.message || JSON.stringify(json) };
    const d = json.data;
    return {
      success:     true,
      orderId:     d?.order_id,
      avgPrice:    d?.average_executed_price,
      executedQty: d?.executed_quantity,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── Cancel order ─────────────────────────────────────────────────────────────

export async function cancelOrderlyOrder(
  address: string,
  keypair: OrderlyKeypair,
  orderId: number,
  symbol:  string,
): Promise<boolean> {
  try {
    const accountId = getAccountId(address);
    const timestamp = Date.now();
    const path      = `/v1/order/${orderId}?symbol=${symbol}`;
    const sig       = await signOrderlyRequest(keypair, 'DELETE', path, timestamp);
    const res       = await fetch(`${ORDERLY_API}${path}`, {
      method:  'DELETE',
      headers: orderlyHeaders(accountId, keypair.publicKey, sig, timestamp),
    });
    const json = await res.json();
    return json.success === true;
  } catch { return false; }
}

// ─── Withdraw from Orderly vault ──────────────────────────────────────────────

export async function requestOrderlyWithdraw(
  address:            string,
  keypair:            OrderlyKeypair,
  amountUSDC:         number,
  signTypedDataAsync: (args: any) => Promise<string>,
): Promise<{ success: boolean; withdrawNonce?: number; error?: string }> {
  try {
    const timestamp = Date.now();
    const nonce     = timestamp;

    const message = {
      brokerId:      ORDERLY_BROKER_ID,
      chainId:       ORDERLY_CHAIN_ID,
      receiver:      address,
      token:         'USDC',
      amount:        amountUSDC,
      withdrawNonce: nonce,
      timestamp,
    };

    const eipSig = await signTypedDataAsync({
      domain:      OFF_CHAIN_DOMAIN,
      types: {
        Withdraw: [
          { name: 'brokerId',      type: 'string'  },
          { name: 'chainId',       type: 'uint256' },
          { name: 'receiver',      type: 'address' },
          { name: 'token',         type: 'string'  },
          { name: 'amount',        type: 'uint256' },
          { name: 'withdrawNonce', type: 'uint64'  },
          { name: 'timestamp',     type: 'uint64'  },
        ],
      },
      primaryType: 'Withdraw',
      message,
    });

    const accountId = getAccountId(address);
    const path      = '/v1/withdraw_request';
    const body      = JSON.stringify({ ...message, signature: eipSig, userAddress: address });
    const reqSig    = await signOrderlyRequest(keypair, 'POST', path, timestamp, body);
    const res       = await fetch(`${ORDERLY_API}${path}`, {
      method:  'POST',
      headers: orderlyHeaders(accountId, keypair.publicKey, reqSig, timestamp),
      body,
    });
    const json = await res.json();
    if (!json.success) return { success: false, error: json.message || JSON.stringify(json) };
    return { success: true, withdrawNonce: nonce };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
