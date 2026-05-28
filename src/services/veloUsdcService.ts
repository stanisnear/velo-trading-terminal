/**
 * veloUsdcService — wrapper for VeloMockUSDC (ERC-20 + OFT + faucet).
 *
 * Functions here are pure (take a publicClient / walletClient) and chain-aware.
 * VeloPerps lives on Base Sepolia, but VeloMockUSDC is deployed on all four
 * Sepolias — bridge transfers use the LayerZero OFT inherited methods.
 */
import {
  type Address,
  type PublicClient,
  type WalletClient,
  parseUnits,
  formatUnits,
  maxUint256,
} from 'viem';

const USDC_DECIMALS = 6;

/** ERC-20 + VeloMockUSDC faucet ABI subset. The OFT bits are in bridgeService. */
export const VELO_USDC_ABI = [
  // ERC-20 standard
  { type: 'function', name: 'name',          stateMutability: 'view', inputs: [], outputs: [{ type: 'string'  }] },
  { type: 'function', name: 'symbol',        stateMutability: 'view', inputs: [], outputs: [{ type: 'string'  }] },
  { type: 'function', name: 'decimals',      stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8'   }] },
  { type: 'function', name: 'totalSupply',   stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'balanceOf',     stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }] },
  {
    type: 'function', name: 'allowance', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function', name: 'approve', stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function', name: 'transfer', stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'bool' }],
  },

  // Velo-specific
  {
    type: 'function', name: 'mint', stateMutability: 'nonpayable',
    inputs: [], outputs: [],
  },
  { type: 'function', name: 'FAUCET_AMOUNT',      stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'FAUCET_COOLDOWN',    stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'FAUCET_MAX_BALANCE', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    type: 'function', name: 'lastFaucetClaim', stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;

// ── Reads ─────────────────────────────────────────────────────────────────────

/** Balance in display units (1 = $1). Returns 0 on RPC failure. */
export async function fetchUsdcBalance(
  publicClient: PublicClient,
  usdcAddress: Address,
  owner: Address,
): Promise<number> {
  try {
    const raw = await publicClient.readContract({
      address: usdcAddress,
      abi: VELO_USDC_ABI,
      functionName: 'balanceOf',
      args: [owner],
    });
    return Number(formatUnits(raw, USDC_DECIMALS));
  } catch {
    return 0;
  }
}

/** Allowance in display units. */
export async function fetchUsdcAllowance(
  publicClient: PublicClient,
  usdcAddress: Address,
  owner: Address,
  spender: Address,
): Promise<number> {
  try {
    const raw = await publicClient.readContract({
      address: usdcAddress,
      abi: VELO_USDC_ABI,
      functionName: 'allowance',
      args: [owner, spender],
    });
    return Number(formatUnits(raw, USDC_DECIMALS));
  } catch {
    return 0;
  }
}

/** Returns the timestamp (unix seconds) of the user's next allowed faucet claim, or 0 if available now. */
export async function fetchFaucetCooldown(
  publicClient: PublicClient,
  usdcAddress: Address,
  user: Address,
): Promise<{ availableAt: number; cooldownSeconds: number }> {
  try {
    const [last, cooldown] = await Promise.all([
      publicClient.readContract({ address: usdcAddress, abi: VELO_USDC_ABI, functionName: 'lastFaucetClaim', args: [user] }),
      publicClient.readContract({ address: usdcAddress, abi: VELO_USDC_ABI, functionName: 'FAUCET_COOLDOWN' }),
    ]);
    const cooldownSeconds = Number(cooldown);
    if (last === 0n) return { availableAt: 0, cooldownSeconds };
    return { availableAt: Number(last) + cooldownSeconds, cooldownSeconds };
  } catch {
    return { availableAt: 0, cooldownSeconds: 6 * 3600 };
  }
}

// ── Writes ────────────────────────────────────────────────────────────────────

/**
 * Approve VELO_PERPS_ADDRESS to spend the user's mUSDC if current allowance is
 * less than `requiredUSDC`. Uses max-uint256 approval — standard pattern, saves
 * gas on every subsequent trade.
 *
 * Returns null if no approval was needed, or the tx hash if one was sent.
 */
export async function approveUsdcIfNeeded(
  walletClient: WalletClient,
  publicClient: PublicClient,
  usdcAddress: Address,
  spender: Address,
  owner: Address,
  requiredUSDC: number,
): Promise<`0x${string}` | null> {
  const account = walletClient.account;
  if (!account) throw new Error('Wallet not connected');

  const required = parseUnits(requiredUSDC.toString(), USDC_DECIMALS);
  const current = await publicClient.readContract({
    address: usdcAddress,
    abi: VELO_USDC_ABI,
    functionName: 'allowance',
    args: [owner, spender],
  });
  if (current >= required) return null;

  const txHash = await walletClient.writeContract({
    address: usdcAddress,
    abi: VELO_USDC_ABI,
    functionName: 'approve',
    args: [spender, maxUint256],
    account,
    chain: walletClient.chain,
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return txHash;
}

/** Call the faucet. Reverts if user is in cooldown or already at the balance cap. */
export async function mintMockUsdc(
  walletClient: WalletClient,
  usdcAddress: Address,
): Promise<`0x${string}`> {
  const account = walletClient.account;
  if (!account) throw new Error('Wallet not connected');
  return walletClient.writeContract({
    address: usdcAddress,
    abi: VELO_USDC_ABI,
    functionName: 'mint',
    args: [],
    account,
    chain: walletClient.chain,
  });
}

/** Standard ERC-20 transfer. Used by the "Send to @username" flow. */
export async function transferUsdc(
  walletClient: WalletClient,
  usdcAddress: Address,
  to: Address,
  amountUSDC: number,
): Promise<`0x${string}`> {
  const account = walletClient.account;
  if (!account) throw new Error('Wallet not connected');
  return walletClient.writeContract({
    address: usdcAddress,
    abi: VELO_USDC_ABI,
    functionName: 'transfer',
    args: [to, parseUnits(amountUSDC.toString(), USDC_DECIMALS)],
    account,
    chain: walletClient.chain,
  });
}
