/**
 * veloBurnerSetup v2 — the new flow: faucet mints directly to the burner.
 *
 * The user signs ONE thing: the derivation message in MetaMask (gas-free).
 * Then:
 *   1. Sponsor sends ETH to the burner so it can pay its own gas.
 *   2. Burner calls mint() on VeloMockUSDC — silent, signs locally.
 *   3. mUSDC lands in the burner directly.
 *
 * No main-wallet ETH transfer, no main-wallet mUSDC transfer. The whole flow
 * is one MetaMask signature + two background transactions.
 *
 * Fallback path: if the sponsor is offline AND the main wallet has ETH, we
 * transfer ETH from main → burner instead. The burner then mints. The user
 * sees one extra MetaMask popup but still ends up at the same state.
 */
import {
  type Address,
  type PublicClient,
  type WalletClient,
  createWalletClient,
  parseEther,
  parseTransaction,
  encodeFunctionData,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import {
  buildBurnerFromSignature,
  storeBurner,
  loadStoredBurner,
  type VeloBurnerWallet,
  VELO_DERIVATION_MESSAGE,
} from './veloBurnerWallet';
import { mintMockUsdc, VELO_USDC_ABI } from './veloUsdcService';
import { VELO_USDC_BASE } from './veloPerpsService';
import { baseSepoliaTransport, pendingTransaction, recoverPendingTransaction } from './baseTransport.mjs';
import { waitForSuccessfulReceipt } from './tradeReceipts';
import { ensureBurnerGas } from './veloGasSponsor';

const BASE_SEPOLIA_RPC =
  import.meta.env.VITE_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';

export interface BurnerSetupArgs {
  walletClient: WalletClient;
  publicClient: PublicClient;
  ownerAddress: Address;
  onStep?: (step: BurnerSetupStep) => void;
  onWalletReady?: (burner: VeloBurnerWallet) => Promise<void>;
}

export type BurnerSetupStep =
  | 'SIGNING'              // MetaMask sig for derivation
  | 'SPONSOR_REQUEST'      // hitting /api/sponsor-eth for the burner
  | 'FUNDING_ETH_FALLBACK' // sponsor offline → main wallet sends ETH to burner
  | 'CLAIMING_FAUCET'      // burner mints mUSDC directly to itself
  | 'DONE';

export interface BurnerSetupResult {
  burner: VeloBurnerWallet;
  faucetTxHash: `0x${string}`;
  ethFundSource: 'sponsor' | 'main_wallet' | 'skipped';
}

const MIN_BURNER_ETH_REQUIRED = 0.003; // matches MIN_TOPUP_THRESHOLD_ETH

export async function setupBurnerWallet(args: BurnerSetupArgs): Promise<BurnerSetupResult> {
  const { walletClient, publicClient, ownerAddress, onStep, onWalletReady } = args;
  const account = walletClient.account;
  if (!account) throw new Error('Wallet not connected');

  // ── Step 1: derivation (gas-free signature) ────────────────────────────
  let burner = loadStoredBurner(ownerAddress);
  if (!burner) {
    onStep?.('SIGNING');
    const signature = await walletClient.signMessage({
      account, message: VELO_DERIVATION_MESSAGE,
    });
    burner = buildBurnerFromSignature(ownerAddress, signature);
    storeBurner(burner);
  }
  // Save the profile link before funding. A faucet outage must not hide the
  // trading wallet from recipient search or incoming-transfer reconciliation.
  await onWalletReady?.(burner);
  const pending = pendingTransaction(burner.veloAddress);
  if (pending) {
    const recovered = await recoverPendingTransaction(publicClient, burner.veloAddress, pending.hash);
    const receipt = recovered || await waitForSuccessfulReceipt(publicClient, pending.hash);
    const tx = parseTransaction(pending.raw);
    if (receipt.status === 'success' && tx.to?.toLowerCase() === VELO_USDC_BASE.toLowerCase()
      && tx.data?.startsWith(encodeFunctionData({ abi: VELO_USDC_ABI, functionName: 'mint' }))) {
      onStep?.('DONE');
      return { burner, faucetTxHash: pending.hash, ethFundSource: 'skipped' };
    }
  }

  // ── Step 2: ensure burner has gas ──────────────────────────────────────
  let ethFundSource: 'sponsor' | 'main_wallet' | 'skipped' = 'skipped';
  const burnerEthBalance = await publicClient.getBalance({ address: burner.veloAddress });

  if (burnerEthBalance < parseEther(MIN_BURNER_ETH_REQUIRED.toString())) {
    onStep?.('SPONSOR_REQUEST');
    const funding = await ensureBurnerGas(publicClient, burner.veloAddress);
    if (!funding.ok) throw new Error(funding.reason || 'Gas funding is unavailable. Your wallet is saved; retry the faucet.');
    ethFundSource = funding.txHash ? 'sponsor' : 'skipped';
  }

  // ── Step 3: burner mints faucet ────────────────────────────────────────
  onStep?.('CLAIMING_FAUCET');
  const burnerWalletClient = createWalletClient({
    account: privateKeyToAccount(burner.privateKey),
    chain: baseSepolia,
    transport: baseSepoliaTransport(BASE_SEPOLIA_RPC),
  });
  const faucetTxHash = await mintMockUsdc(burnerWalletClient as any, VELO_USDC_BASE);
  await waitForSuccessfulReceipt(publicClient, faucetTxHash);

  onStep?.('DONE');
  return { burner, faucetTxHash, ethFundSource };
}

export function hasBurnerWallet(ownerAddress: Address): boolean {
  return loadStoredBurner(ownerAddress) !== null;
}

/**
 * Build a viem WalletClient signed by the burner private key.
 * Use this wherever you need to send a tx from the burner without
 * triggering a MetaMask popup (username claim, trades, etc.).
 */
export function createBurnerWalletClient(privateKey: `0x${string}`) {
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({
    account,
    chain: baseSepolia,
    transport: baseSepoliaTransport(BASE_SEPOLIA_RPC),
  });
}
