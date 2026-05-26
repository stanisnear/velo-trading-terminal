/**
 * web3Config — wagmi + RainbowKit setup for Velo.
 *
 * Four chains: Base Sepolia (the home chain — where VeloPerps lives) plus
 * Arbitrum / Optimism / Ethereum Sepolia (bridge destinations for mUSDC).
 *
 * RPC URLs come from Vercel env vars with PublicNode fallbacks. PublicNode is
 * reliable, free, no signup — we use it as the default because the canonical
 * RPCs (sepolia.base.org etc.) are notably flaky.
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
    'WalletConnect will not work. Add it to your Vercel environment variables ' +
    'and trigger a manual redeploy.'
  );
}

export const wagmiConfig = getDefaultConfig({
  appName: 'Velo Trading Terminal',
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
