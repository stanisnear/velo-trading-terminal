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
createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId,
  metadata: {
    name: 'Velo Trading Terminal',
    description: 'SocialFi perpetual futures trading on Base Sepolia.',
    url: 'https://velo-trading-terminal.vercel.app',
    icons: ['https://velo-trading-terminal.vercel.app/favicon.ico'],
  },
  features: {
    analytics: true,
    email: true,
    socials: ['google', 'x', 'discord', 'github'],
    walletConnect: true,
    // Disable buy/onramp — testnet only, no real-money purchasing.
    onramp: false,
    // Disable smart accounts — we don't use ERC-4337, and it causes
    // AppKit to show TWO wallet entries (smart account + EOA), which is confusing.
    swaps: false,
  },
  // Disable Coinbase smart wallet injection — another source of double wallet
  enableCoinbase: false,
  // Register mUSDC so AppKit shows the correct token balance in the wallet modal.
  tokens: {
    [baseSepolia.id]: [
      {
        address: '0x5EFaF3F69b09bC2abF3439bDC0C93bf611026699' as `0x${string}`,
        image: 'https://velo-trading-terminal.vercel.app/favicon.ico',
      },
    ],
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
