/**
 * useVeloPerpsTrading
 * ───────────────────
 * React hook that drives all VeloPerps trading from the UI.
 *
 * Trading-account model
 *   The contract is owner-keyed. msg.sender becomes the Position.owner. There
 *   are two ways for the hook to sign trade txns:
 *
 *     1. MetaMask (default fallback). Every trade opens a wallet prompt. Slow
 *        UX but zero setup.
 *
 *     2. Burner wallet (Velo Trading Wallet). A deterministic session key
 *        derived from a one-time MetaMask signature (see veloBurnerWallet.ts).
 *        After a one-off "fund + approve" handshake, every trade signs locally
 *        with the burner private key — no popup, instant.
 *
 *   We auto-detect the burner from localStorage (keyed by main wallet address).
 *   When present, ALL reads and writes use the burner address. When absent,
 *   we fall back to MetaMask signing on the main wallet.
 *
 * Invariants
 *   • Positions array IS what the contract says. No optimistic insertion.
 *   • Polls every 5s. Refresh on demand via refresh().
 *   • Every successful trade returns a real tx hash linkable to BaseScan.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAccount, useChainId, usePublicClient, useWalletClient } from 'wagmi';
import {
  type Address,
  type Hex,
  createWalletClient,
  http,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import {
  fetchOpenPositions,
  fetchPoolBalance,
  openPosition as openPositionTx,
  closePosition as closePositionTx,
  addMargin as addMarginTx,
  reduceMargin as reduceMarginTx,
  partialClose as partialCloseTx,
  setTriggers as setTriggersTx,
  type VeloPosition,
  type VeloPairLabel,
  type OpenPositionArgs,
  baseScanTxUrl,
  VELO_PERPS_ADDRESS,
  VELO_PERPS_ABI,
  VELO_USDC_BASE,
  PAIR_INDEX,
} from './veloPerpsService';
import {
  fetchUsdcBalance,
  approveUsdcIfNeeded,
  mintMockUsdc,
} from './veloUsdcService';
import { fetchPriceUpdate, PYTH_FEED_IDS } from './pythService';
import { ensureBurnerGas } from './veloGasSponsor';
import {
  loadStoredBurner,
  type VeloBurnerWallet,
} from './veloBurnerWallet';

const POLL_INTERVAL_MS = 5_000;
const BASE_SEPOLIA_CHAIN_ID = 84532;
const BASE_SEPOLIA_RPC =
  import.meta.env.VITE_BASE_SEPOLIA_RPC_URL || 'https://base-sepolia-rpc.publicnode.com';

export interface UseVeloPerpsTradingState {
  isReady: boolean;
  isInitialLoading: boolean;
  isPending: boolean;
  lastError: string | null;
  usdcBalance: number;
  openPositions: VeloPosition[];
  poolBalance: number;
  /** Address that signs trade txns and owns positions. Burner if set, else MetaMask. */
  traderAddress: Address | undefined;
  /** True when a burner wallet is active for silent trade signing. */
  usingBurner: boolean;
  /** ETH balance of the trader address (in wei, as bigint). For gas-pre-flight checks. */
  traderEthBalance: bigint;
}

export interface UseVeloPerpsTradingActions {
  refresh: () => Promise<void>;
  mintTestUsdc: () => Promise<{ txHash: `0x${string}` }>;
  openPosition: (args: OpenPositionArgs) => Promise<{
    txHash: `0x${string}`;
    tradeId: bigint;
    entryPrice: number;
    explorerUrl: string;
  }>;
  closePosition: (tradeId: bigint, pair: VeloPairLabel) => Promise<{
    txHash: `0x${string}`;
    pnlUSDC: number;
    payoutUSDC: number;
    exitPrice: number;
    explorerUrl: string;
  }>;
  /** Re-read the burner wallet from localStorage (call after setup completes). */
  reloadBurner: () => void;
}

export function useVeloPerpsTrading(): UseVeloPerpsTradingState & UseVeloPerpsTradingActions {
  const { address: mainAddress, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: metaMaskWalletClient } = useWalletClient();

  // ── Burner wallet resolution ────────────────────────────────────────────────
  // Re-read on demand (after setup) so we don't have to bounce a remount.
  const [burnerNonce, setBurnerNonce] = useState(0);
  const reloadBurner = useCallback(() => setBurnerNonce((n) => n + 1), []);

  const burner: VeloBurnerWallet | null = useMemo(() => {
    if (!mainAddress) return null;
    return loadStoredBurner(mainAddress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainAddress, burnerNonce]);

  // The wallet client used to SIGN trade txns. When a burner exists, we build
  // a viem wallet client backed by its private key — signs locally, no popup.
  // When not, we use the wagmi MetaMask wallet client — popup for every trade.
  const tradingClient = useMemo(() => {
    if (burner) {
      const account = privateKeyToAccount(burner.privateKey as Hex);
      return createWalletClient({
        account,
        chain: baseSepolia,
        transport: http(BASE_SEPOLIA_RPC),
      });
    }
    return metaMaskWalletClient ?? null;
  }, [burner, metaMaskWalletClient]);

  // Address whose positions / balances we read and whose key signs trades.
  const traderAddress: Address | undefined = burner?.veloAddress ?? mainAddress;
  const usingBurner = !!burner;

  const onCorrectChain = chainId === BASE_SEPOLIA_CHAIN_ID;
  const isReady = isConnected && onCorrectChain && !!publicClient && !!traderAddress;

  // ── Pollable state ─────────────────────────────────────────────────────────
  const [isInitialLoading, setInitialLoading] = useState(true);
  const [isPending, setPending] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [usdcBalance, setUsdcBalance] = useState(0);
  const [openPositions, setOpenPositions] = useState<VeloPosition[]>([]);
  const [poolBalance, setPoolBalance] = useState(0);
  const [traderEthBalance, setTraderEthBalance] = useState<bigint>(0n);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Reset state when the trader address changes (e.g. burner just set up).
  useEffect(() => {
    setInitialLoading(true);
    setOpenPositions([]);
    setUsdcBalance(0);
    setTraderEthBalance(0n);
  }, [traderAddress]);

  // ── Read loop ──────────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    if (!isReady || !traderAddress || !publicClient) return;
    try {
      const [positions, balance, pool, ethBal] = await Promise.all([
        fetchOpenPositions(publicClient, traderAddress),
        fetchUsdcBalance(publicClient, VELO_USDC_BASE, traderAddress),
        fetchPoolBalance(publicClient),
        publicClient.getBalance({ address: traderAddress }).catch(() => 0n),
      ]);
      if (!mountedRef.current) return;
      setOpenPositions(positions);
      setUsdcBalance(balance);
      setPoolBalance(pool);
      setTraderEthBalance(ethBal);
    } catch (e) {
      console.warn('[useVeloPerpsTrading] poll failed', e);
    } finally {
      if (mountedRef.current) setInitialLoading(false);
    }
  }, [isReady, traderAddress, publicClient]);

  useEffect(() => {
    if (!isReady) {
      setInitialLoading(false);
      setOpenPositions([]);
      setUsdcBalance(0);
      setTraderEthBalance(0n);
      return;
    }
    setInitialLoading(true);
    refresh();
    const handle = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(handle);
  }, [isReady, refresh]);

  // ── Write actions ──────────────────────────────────────────────────────────
  // mintTestUsdc — always uses the MAIN wallet (MetaMask). The faucet drops
  // mUSDC to msg.sender, which we want to be the main wallet so the user can
  // then bridge a portion to the burner. The Welcome modal handles the flow.
  const mintTestUsdc = useCallback(async () => {
    if (!metaMaskWalletClient || !publicClient) throw new Error('Wallet not connected');
    setPending(true);
    setLastError(null);
    try {
      const txHash = await mintMockUsdc(metaMaskWalletClient, VELO_USDC_BASE);
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      await refresh();
      return { txHash };
    } catch (e: any) {
      const msg = e?.shortMessage || e?.message || 'Mint failed';
      setLastError(msg);
      throw e;
    } finally {
      setPending(false);
    }
  }, [metaMaskWalletClient, publicClient, refresh]);

  // openPosition — signs from the trading client (burner if active, else MetaMask).
  // Auto-approves USDC if allowance is insufficient.
  const openPosition = useCallback(
    async (args: OpenPositionArgs) => {
      if (!tradingClient || !publicClient || !traderAddress) {
        throw new Error('Trading wallet not ready');
      }
      setPending(true);
      setLastError(null);
      try {
        // Pre-flight: verify the pair is registered AND tradable on-chain.
        // Without this, contracts that haven't had RegisterPairs run will
        // revert with the cryptic 0x33d7e2a4 (PairNotRegistered) selector.
        const pairIndex = PAIR_INDEX[args.pair];
        const [feedId, tradable] = await Promise.all([
          publicClient.readContract({
            address: VELO_PERPS_ADDRESS,
            abi: VELO_PERPS_ABI,
            functionName: 'pairFeedId',
            args: [pairIndex],
          }),
          publicClient.readContract({
            address: VELO_PERPS_ADDRESS,
            abi: VELO_PERPS_ABI,
            functionName: 'pairTradable',
            args: [pairIndex],
          }),
        ]);
        if (!feedId || feedId === '0x0000000000000000000000000000000000000000000000000000000000000000') {
          throw new Error(`${args.pair} isn't listed on the contract yet. The protocol owner needs to register it.`);
        }
        if (!tradable) {
          throw new Error(`${args.pair} is registered but paused. Contact the protocol owner.`);
        }

        // Pre-flight gas top-up: if the trading wallet is running low, call
        // the sponsor server. Handled by veloGasSponsor.ensureBurnerGas to keep
        // all gas-using paths consistent.
        await ensureBurnerGas(publicClient, traderAddress);

        await approveUsdcIfNeeded(
          tradingClient as any,
          publicClient,
          VELO_USDC_BASE,
          VELO_PERPS_ADDRESS,
          traderAddress,
          args.collateralUSDC,
        );
        const result = await openPositionTx(tradingClient as any, publicClient, args);
        await refresh();
        return { ...result, explorerUrl: baseScanTxUrl(result.txHash) };
      } catch (e: any) {
        const msg = e?.shortMessage || e?.message || 'Open failed';
        setLastError(msg);
        throw e;
      } finally {
        setPending(false);
      }
    },
    [tradingClient, publicClient, traderAddress, refresh],
  );

  const closePosition = useCallback(
    async (tradeId: bigint, pair: VeloPairLabel) => {
      if (!tradingClient || !publicClient) throw new Error('Trading wallet not ready');
      setPending(true);
      setLastError(null);
      try {
        if (traderAddress) await ensureBurnerGas(publicClient, traderAddress);
        const result = await closePositionTx(tradingClient as any, publicClient, tradeId, pair);
        await refresh();
        return { ...result, explorerUrl: baseScanTxUrl(result.txHash) };
      } catch (e: any) {
        const msg = e?.shortMessage || e?.message || 'Close failed';
        setLastError(msg);
        throw e;
      } finally {
        setPending(false);
      }
    },
    [tradingClient, publicClient, refresh, traderAddress],
  );

  // ── V2-only actions ──────────────────────────────────────────────────────
  // These revert on V1. Callers gate on IS_V2 from veloPerpsService.

  const addMargin = useCallback(
    async (tradeId: bigint, amountUSDC: number) => {
      if (!tradingClient || !publicClient || !traderAddress) throw new Error('Trading wallet not ready');
      setPending(true); setLastError(null);
      try {
        await ensureBurnerGas(publicClient, traderAddress);
        await approveUsdcIfNeeded(tradingClient as any, publicClient, VELO_USDC_BASE, VELO_PERPS_ADDRESS, traderAddress, amountUSDC);
        const result = await addMarginTx(tradingClient as any, publicClient, tradeId, amountUSDC);
        await refresh();
        return { ...result, explorerUrl: baseScanTxUrl(result.txHash) };
      } catch (e: any) {
        const msg = e?.shortMessage || e?.message || 'Add margin failed';
        setLastError(msg);
        throw e;
      } finally { setPending(false); }
    },
    [tradingClient, publicClient, traderAddress, refresh],
  );

  const reduceMargin = useCallback(
    async (tradeId: bigint, amountUSDC: number, pair: VeloPairLabel) => {
      if (!tradingClient || !publicClient) throw new Error('Trading wallet not ready');
      setPending(true); setLastError(null);
      try {
        if (traderAddress) await ensureBurnerGas(publicClient, traderAddress);
        const feedId = (PYTH_FEED_IDS as any)[pair];
        const { updateData, feeWei } = await fetchPriceUpdate([feedId]);
        const result = await reduceMarginTx(tradingClient as any, publicClient, tradeId, amountUSDC, updateData, feeWei);
        await refresh();
        return { ...result, explorerUrl: baseScanTxUrl(result.txHash) };
      } catch (e: any) {
        const msg = e?.shortMessage || e?.message || 'Reduce margin failed';
        setLastError(msg);
        throw e;
      } finally { setPending(false); }
    },
    [tradingClient, publicClient, refresh, traderAddress],
  );

  const partialClose = useCallback(
    async (tradeId: bigint, fractionBps: number, pair: VeloPairLabel) => {
      if (!tradingClient || !publicClient) throw new Error('Trading wallet not ready');
      setPending(true); setLastError(null);
      try {
        if (traderAddress) await ensureBurnerGas(publicClient, traderAddress);
        const feedId = (PYTH_FEED_IDS as any)[pair];
        const { updateData, feeWei } = await fetchPriceUpdate([feedId]);
        const result = await partialCloseTx(tradingClient as any, publicClient, tradeId, fractionBps, updateData, feeWei);
        await refresh();
        return { ...result, explorerUrl: baseScanTxUrl(result.txHash) };
      } catch (e: any) {
        const msg = e?.shortMessage || e?.message || 'Partial close failed';
        setLastError(msg);
        throw e;
      } finally { setPending(false); }
    },
    [tradingClient, publicClient, refresh, traderAddress],
  );

  const setTriggers = useCallback(
    async (tradeId: bigint, takeProfit: number, stopLoss: number) => {
      if (!tradingClient || !publicClient) throw new Error('Trading wallet not ready');
      setPending(true); setLastError(null);
      try {
        if (traderAddress) await ensureBurnerGas(publicClient, traderAddress);
        const result = await setTriggersTx(tradingClient as any, publicClient, tradeId, takeProfit, stopLoss);
        await refresh();
        return { ...result, explorerUrl: baseScanTxUrl(result.txHash) };
      } catch (e: any) {
        const msg = e?.shortMessage || e?.message || 'Set triggers failed';
        setLastError(msg);
        throw e;
      } finally { setPending(false); }
    },
    [tradingClient, publicClient, refresh, traderAddress],
  );

  return {
    isReady,
    isInitialLoading,
    isPending,
    lastError,
    usdcBalance,
    openPositions,
    poolBalance,
    traderAddress,
    usingBurner,
    traderEthBalance,
    refresh,
    mintTestUsdc,
    openPosition,
    closePosition,
    addMargin,
    reduceMargin,
    partialClose,
    setTriggers,
    reloadBurner,
  };
}
