/**
 * web3Config — Reown AppKit + wagmi setup for Velo.
 *
 * Migrated from RainbowKit → Reown AppKit (the official successor).
 * AppKit gives us:
 *   - WalletConnect QR modal that actually works on Vite
 *   - Social/email logins (Google, X, Discord, etc.) with zero extra code
 *   - Same wagmi hooks throughout the app — nothing else changes
 *
 * wagmi hooks (useAccount, useDisconnect, useChainId, etc.) are unchanged.
 * The WagmiProvider now uses wagmiAdapter.wagmiConfig instead of the old
 * getDefaultConfig result.
 */
import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { baseSepolia, arbitrumSepolia, optimismSepolia, sepolia } from '@reown/appkit/networks';
import { http } from 'wagmi';

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? '';
if (!projectId) {
  console.error('[Velo] VITE_WALLETCONNECT_PROJECT_ID is not set.');
}

// PublicNode fallbacks
const BASE_RPC = import.meta.env.VITE_BASE_SEPOLIA_RPC_URL  || 'https://base-sepolia-rpc.publicnode.com';
const ARB_RPC  = import.meta.env.VITE_ARB_SEPOLIA_RPC_URL   || 'https://arbitrum-sepolia-rpc.publicnode.com';
const OP_RPC   = import.meta.env.VITE_OP_SEPOLIA_RPC_URL    || 'https://optimism-sepolia-rpc.publicnode.com';
const ETH_RPC  = import.meta.env.VITE_ETH_SEPOLIA_RPC_URL   || 'https://ethereum-sepolia-rpc.publicnode.com';

export const networks = [baseSepolia, arbitrumSepolia, optimismSepolia, sepolia] as const;

export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  transports: {
    [baseSepolia.id]:     http(BASE_RPC),
    [arbitrumSepolia.id]: http(ARB_RPC),
    [optimismSepolia.id]: http(OP_RPC),
    [sepolia.id]:         http(ETH_RPC),
  },
  ssr: false,
});

// createAppKit is called once at module level — outside any React component.
// The modal it creates is a web component (<appkit-modal>) that mounts itself
// into the DOM automatically. No provider wrapper needed beyond WagmiProvider.
//
// ──────────────────────────────────────────────────────────────────────────────
// Why this config looks the way it does (read before changing anything):
//
// 1. defaultAccountTypes.eip155 = 'eoa'
//    Reown defaults social/email logins to ERC-4337 smart accounts. That makes
//    AppKit show TWO entries in the wallet list (Smart Account + EOA). We don't
//    use ERC-4337 — Velo's gas sponsorship is server-side via veloGasSponsor,
//    and the burner is a plain EOA. Forcing eoa removes the second entry and
//    eliminates a major source of user confusion.
//    (Earlier fix attempts used `swaps: false` + `enableCoinbase: false` —
//    those don't disable smart accounts. See:
//    https://github.com/reown-com/appkit/issues/4057 and
//    https://docs.reown.com/appkit/react/core/options#defaultaccounttypes)
//
// 2. tokens is shaped Record<CaipNetworkId, Token>
//    Earlier attempts used `tokens: { [baseSepolia.id]: [{...}] }` which is
//    silently ignored by AppKit (wrong key type, wrong value shape — Tokens
//    expects a single Token object, not an array, and the key is the CAIP
//    string 'eip155:84532', not the numeric chain id). With the wrong shape,
//    AppKit can't render the mUSDC balance and the wallet modal shows $0.
//    The correct CAIP key for Base Sepolia is 'eip155:84532'.
//
// 3. enableCoinbase = false
//    Coinbase Smart Wallet is yet another way to inject a non-EOA address.
//    We don't support it; turning it off keeps the wallet flow consistent.
// ──────────────────────────────────────────────────────────────────────────────
createAppKit({
  adapters: [wagmiAdapter],
  networks: networks as any,
  projectId,
  metadata: {
    name: 'Velo Trading Terminal',
    description: 'SocialFi perpetual futures trading on Base Sepolia.',
    url: 'https://velo-trading-terminal.vercel.app',
    icons: ['https://velo-trading-terminal.vercel.app/favicon.ico'],
  },
  // Force EOA-only accounts (no ERC-4337 smart account layer).
  defaultAccountTypes: { eip155: 'eoa' },
  features: {
    analytics: true,
    email: true,
    socials: ['google', 'x', 'discord', 'github'],
    // Disable buy/onramp — testnet only, no real-money purchasing.
    onramp: false,
    // Disable swaps — not relevant on a testnet trading terminal, and the
    // swap UI inside the Reown modal clutters the funds flow.
    swaps: false,
  },
  // Don't inject the Coinbase Smart Wallet connector at all.
  enableCoinbase: false,
  // Show mUSDC in the AppKit wallet modal so users see their trading-currency
  // balance for the connected (main) address. NOTE: this only reflects the
  // MAIN wallet — the burner balance lives in Velo's own dashboard. The
  // AppKit modal has no concept of the derived trading wallet.
  tokens: {
    'eip155:84532': {
      address: '0x5EFaF3F69b09bC2abF3439bDC0C93bf611026699',
      image: 'https://velo-trading-terminal.vercel.app/favicon.ico',
    },
  },
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': 'oklch(0.68 0.22 295)',
    '--w3m-border-radius-master': '2px',
  },
});

// Convenience re-export — the wagmiConfig is on the adapter, not a standalone object.
export const wagmiConfig = wagmiAdapter.wagmiConfig;

/** The chain Velo trades on. */
export const HOME_CHAIN_ID = baseSepolia.id; // 84532
