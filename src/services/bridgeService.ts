/**
 * bridgeService — cross-chain VeloMockUSDC transfer via LayerZero V2 OFT.
 *
 * The four VeloMockUSDC deployments are wired as LayerZero V2 peers
 * (Base ↔ Arb ↔ OP ↔ Eth Sepolia). Calling `send()` on any of them burns
 * locally and triggers a mint on the destination chain. LayerZero's executor
 * delivers the message; typical end-to-end time is ~1–3 minutes on testnet.
 *
 * Fees:
 *   • Source-chain gas (paid by signer in source chain's native token)
 *   • LayerZero messaging fee (paid in source chain native token, sent as msg.value)
 *
 * We use `quoteSend` to get a fresh fee quote before each call.
 */
import {
  type Address,
  type PublicClient,
  type WalletClient,
  parseUnits,
  padHex,
} from 'viem';

// ── Chain registry ────────────────────────────────────────────────────────────

/** LayerZero V2 Endpoint IDs (verified at docs.layerzero.network/v2/deployments) */
export const LZ_EID = {
  ethereum_sepolia: 40161,
  arbitrum_sepolia: 40231,
  optimism_sepolia: 40232,
  base_sepolia:     40245,
} as const;

export type BridgeChain = keyof typeof LZ_EID;

/** Wagmi numeric chain IDs (eip-155). */
export const CHAIN_ID: Record<BridgeChain, number> = {
  base_sepolia:     84532,
  arbitrum_sepolia: 421614,
  optimism_sepolia: 11155420,
  ethereum_sepolia: 11155111,
};

/** VeloMockUSDC OFT addresses per chain. From env or the verified deploys. */
export const VELO_USDC_ADDRESS: Record<BridgeChain, Address> = {
  base_sepolia: (import.meta.env.VITE_VELO_USDC_BASE ||
    '0x5EFaF3F69b09bC2abF3439bDC0C93bf611026699') as Address,
  arbitrum_sepolia: (import.meta.env.VITE_VELO_USDC_ARB ||
    '0xEC76fD9182ba15ff193FDBc122013FCa18900290') as Address,
  optimism_sepolia: (import.meta.env.VITE_VELO_USDC_OP ||
    '0xEC76fD9182ba15ff193FDBc122013FCa18900290') as Address,
  ethereum_sepolia: (import.meta.env.VITE_VELO_USDC_ETH ||
    '0x96d0CF69896FE6b5B031D21967f027d95Eb42e9A') as Address,
};

/** Display labels for chain pickers. */
export const CHAIN_LABEL: Record<BridgeChain, string> = {
  base_sepolia:     'Base Sepolia',
  arbitrum_sepolia: 'Arbitrum Sepolia',
  optimism_sepolia: 'Optimism Sepolia',
  ethereum_sepolia: 'Ethereum Sepolia',
};

// ── LayerZero V2 OFT ABI subset ──────────────────────────────────────────────
// We use only `send` and `quoteSend`. Full OFT also exposes setPeer / peers etc.
// but those are admin-only / not needed in the UI.

const USDC_DECIMALS = 6;

const SEND_PARAM_TUPLE = {
  type: 'tuple',
  components: [
    { name: 'dstEid',       type: 'uint32'  },
    { name: 'to',           type: 'bytes32' },
    { name: 'amountLD',     type: 'uint256' },  // local-decimals amount
    { name: 'minAmountLD',  type: 'uint256' },
    { name: 'extraOptions', type: 'bytes'   },
    { name: 'composeMsg',   type: 'bytes'   },
    { name: 'oftCmd',       type: 'bytes'   },
  ],
} as const;

const MESSAGING_FEE_TUPLE = {
  type: 'tuple',
  components: [
    { name: 'nativeFee', type: 'uint256' },
    { name: 'lzTokenFee', type: 'uint256' },
  ],
} as const;

export const OFT_ABI = [
  {
    type: 'function', name: 'quoteSend', stateMutability: 'view',
    inputs: [
      SEND_PARAM_TUPLE,
      { name: 'payInLzToken', type: 'bool' },
    ],
    outputs: [MESSAGING_FEE_TUPLE],
  },
  {
    type: 'function', name: 'send', stateMutability: 'payable',
    inputs: [
      SEND_PARAM_TUPLE,
      MESSAGING_FEE_TUPLE,
      { name: 'refundAddress', type: 'address' },
    ],
    outputs: [
      {
        type: 'tuple', name: 'msgReceipt',
        components: [
          { name: 'guid',  type: 'bytes32' },
          { name: 'nonce', type: 'uint64'  },
          {
            type: 'tuple', name: 'fee',
            components: [
              { name: 'nativeFee',  type: 'uint256' },
              { name: 'lzTokenFee', type: 'uint256' },
            ],
          },
        ],
      },
      {
        type: 'tuple', name: 'oftReceipt',
        components: [
          { name: 'amountSentLD',     type: 'uint256' },
          { name: 'amountReceivedLD', type: 'uint256' },
        ],
      },
    ],
  },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert an EVM address to LayerZero's bytes32 peer format (left-padded). */
function addressToBytes32(addr: Address): `0x${string}` {
  return padHex(addr, { size: 32, dir: 'left' });
}

/**
 * Build the standard "send to recipient" options blob.
 *
 * LayerZero V2 options are encoded as a packed bytes string. The simplest
 * pattern — a single LzReceive executor option with a gas allowance — is what
 * standard OFT transfers use. We hardcode the proven gas value used in the
 * LayerZero V2 OFT quickstart.
 *
 * Format: 0x0003 (option type) || 0x01 (worker id) || 0x0011 (option length 17) ||
 *         0x01 (lzReceive sub-option) || gas (uint128, 16 bytes)
 */
function defaultExecutorOptions(gas: bigint = 80_000n): `0x${string}` {
  // 0x00030100110100000000000000000000000000000000<gas-uint128-hex>
  // Worker id 1, lzReceive option id 1, 17-byte payload (1 option type + 16 byte gas).
  const gasHex = gas.toString(16).padStart(32, '0');
  return `0x00030100110100000000000000000000000000000000${gasHex}` as `0x${string}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface BridgeQuote {
  nativeFee: bigint;     // ETH to send as msg.value
  amountReceivedLD: bigint; // amount the recipient will receive (LD = local decimals)
}

/** Quote the cost (in source-chain native token wei) of bridging an amount. */
export async function quoteBridge(
  publicClient: PublicClient,
  source: BridgeChain,
  dest: BridgeChain,
  recipient: Address,
  amountUSDC: number,
): Promise<BridgeQuote> {
  if (source === dest) throw new Error('Source and destination must differ');

  const amountLD = parseUnits(amountUSDC.toString(), USDC_DECIMALS);
  const sendParam = {
    dstEid:       LZ_EID[dest],
    to:           addressToBytes32(recipient),
    amountLD,
    minAmountLD:  amountLD,                  // no slippage tolerance on testnet
    extraOptions: defaultExecutorOptions(),
    composeMsg:   '0x' as `0x${string}`,
    oftCmd:       '0x' as `0x${string}`,
  };

  const fee = await publicClient.readContract({
    address: VELO_USDC_ADDRESS[source],
    abi: OFT_ABI,
    functionName: 'quoteSend',
    args: [sendParam, false],
  });

  return { nativeFee: fee.nativeFee, amountReceivedLD: amountLD };
}

/**
 * Submit a cross-chain mUSDC transfer.
 *
 * Returns the source-chain tx hash. The destination chain will receive the
 * mint after LayerZero executor processes the message (typically 1–3 min).
 * Frontend can poll the destination balance to know when funds arrive.
 */
export async function executeBridge(
  walletClient: WalletClient,
  publicClient: PublicClient,
  source: BridgeChain,
  dest: BridgeChain,
  recipient: Address,
  amountUSDC: number,
): Promise<{ txHash: `0x${string}`; nativeFee: bigint }> {
  const account = walletClient.account;
  if (!account) throw new Error('Wallet not connected');
  if (source === dest) throw new Error('Source and destination must differ');

  const quote = await quoteBridge(publicClient, source, dest, recipient, amountUSDC);

  const amountLD = parseUnits(amountUSDC.toString(), USDC_DECIMALS);
  const sendParam = {
    dstEid:       LZ_EID[dest],
    to:           addressToBytes32(recipient),
    amountLD,
    minAmountLD:  amountLD,
    extraOptions: defaultExecutorOptions(),
    composeMsg:   '0x' as `0x${string}`,
    oftCmd:       '0x' as `0x${string}`,
  };
  const fee = { nativeFee: quote.nativeFee, lzTokenFee: 0n };

  const txHash = await walletClient.writeContract({
    address: VELO_USDC_ADDRESS[source],
    abi: OFT_ABI,
    functionName: 'send',
    args: [sendParam, fee, account.address],
    value: quote.nativeFee,
    account,
    chain: walletClient.chain,
  });
  return { txHash, nativeFee: quote.nativeFee };
}
