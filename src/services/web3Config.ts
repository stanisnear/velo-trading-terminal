/**
 * web3Config — wagmi + RainbowKit setup for Velo.
 *
 * Four chains: Base Sepolia (the home chain — where VeloPerps lives) plus
 * Arbitrum / Optimism / Ethereum Sepolia (bridge destinations for mUSDC).
 *
 * RPC URLs come from Vercel env vars with PublicNode fallbacks. PublicNode is
 * reliable, free, no signup — we use it as the default because the canonical
 * RPCs (sepolia.base.org etc.) are notably flaky.
 *
 * NOTE: The projectId comes from Reown Cloud (cloud.reown.com) — WalletConnect
 * rebranded to Reown in Sept 2024. The project MUST be created as product type
 * "AppKit" (not WalletConnect Modal) and the domain velo-trading-terminal.vercel.app
 * must be on the allowlist. RainbowKit uses the Reown/WalletConnect relay
 * under the hood — same projectId, same env var, just a new dashboard.
 */
import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { http } from 'wagmi';
import {
  baseSepolia,
  arbitrumSepolia,
  optimismSepolia,
  sepolia,
} from 'wagmi/chains';

// PublicNode defaults — work without signup, reliable enough for testnet UX.
const BASE_RPC = import.meta.env.VITE_BASE_SEPOLIA_RPC_URL
  || 'https://base-sepolia-rpc.publicnode.com';
const ARB_RPC  = import.meta.env.VITE_ARB_SEPOLIA_RPC_URL
  || 'https://arbitrum-sepolia-rpc.publicnode.com';
const OP_RPC   = import.meta.env.VITE_OP_SEPOLIA_RPC_URL
  || 'https://optimism-sepolia-rpc.publicnode.com';
const ETH_RPC  = import.meta.env.VITE_ETH_SEPOLIA_RPC_URL
  || 'https://ethereum-sepolia-rpc.publicnode.com';

const _wcProjectId: string = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? '';
if (!_wcProjectId) {
  console.error(
    '[Velo] VITE_WALLETCONNECT_PROJECT_ID is not set. ' +
    'WalletConnect/Reown will not work. ' +
    'Add it to Vercel env vars and trigger a manual redeploy.'
  );
}

export const wagmiConfig = getDefaultConfig({
  appName: 'Velo Trading Terminal',
  appDescription: 'SocialFi perpetual futures trading on Base Sepolia.',
  appUrl: 'https://velo-trading-terminal.vercel.app',
  appIcon: 'https://velo-trading-terminal.vercel.app/favicon.ico',
  projectId: _wcProjectId,
  // Base Sepolia is FIRST so RainbowKit defaults to it when a wallet first connects.
  chains: [baseSepolia, arbitrumSepolia, optimismSepolia, sepolia],
  transports: {
    [baseSepolia.id]:     http(BASE_RPC),
    [arbitrumSepolia.id]: http(ARB_RPC),
    [optimismSepolia.id]: http(OP_RPC),
    [sepolia.id]:         http(ETH_RPC),
  },
  ssr: false,
});

/** Convenience constant for App.tsx — the chain we expect users to trade on. */
export const HOME_CHAIN_ID = baseSepolia.id; // 84532
