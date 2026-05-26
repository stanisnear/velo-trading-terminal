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
    // Social + email logins — toggle on/off from Reown dashboard without code changes.
    // When enabled on the dashboard these show automatically. Setting them here
    // explicitly so behaviour is predictable regardless of dashboard state.
    email: true,
    socials: ['google', 'x', 'discord', 'github'],
    // Keep the standard wallet list (MetaMask, WalletConnect QR, Coinbase, etc.)
    walletConnect: true,
    // Disable buy/onramp — this is testnet, no real-money purchasing.
    onramp: false,
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
