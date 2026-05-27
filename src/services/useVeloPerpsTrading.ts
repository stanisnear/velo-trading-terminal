/**
 * useVeloPerpsTrading
 * ───────────────────
 * Hook that drives all VeloPerps trading from the UI. V3-primary.
 *
 * Exposes:
 *   - openPosition / closePosition / addMargin / reduceMargin / partialClose / setTriggers
 *   - depositCross / withdrawCross / cross balance ledger
 *   - placeConditionalOrder / cancelConditionalOrder / open orders list
 *
 * Trading-account model
 *   When a burner is set up (Velo Trading Wallet), all writes sign locally with
 *   the burner key — no MetaMask popups. Without a burner, writes prompt
 *   MetaMask. Reads use the burner address when present, else the main wallet.
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
  fetchConditionalOrders,
  fetchCrossFreeBalance,
  fetchCrossTotalBalance,
  openPosition as openPositionTx,
  closePosition as closePositionTx,
  addMargin as addMarginTx,
  reduceMargin as reduceMarginTx,
  partialClose as partialCloseTx,
  setTriggers as setTriggersTx,
  depositCross as depositCrossTx,
  withdrawCross as withdrawCrossTx,
  placeConditionalOrder as placeConditionalOrderTx,
  cancelConditionalOrder as cancelConditionalOrderTx,
  type VeloPosition,
  type VeloConditionalOrder,
  type VeloPairLabel,
  type OpenPositionArgs,
  type PlaceConditionalOrderArgs,
  baseScanTxUrl,
  VELO_PERPS_ADDRESS,
  VELO_PERPS_V3_ABI,
  VELO_USDC_BASE,
  PAIR_INDEX,
  IS_V3,
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
  /** Wallet mUSDC balance (sittiing in trader's address, not in the cross account). */
  usdcBalance: number;
  /** Free cross-margin balance — usable as collateral for new CROSS positions. */
  crossFreeBalance: number;
  /** Total cross-margin balance (free + locked into open cross positions). */
  crossTotalBalance: number;
  /** Locked cross-margin (sum of open CROSS positions' collateral). */
  crossLockedBalance: number;
  openPositions: VeloPosition[];
  conditionalOrders: VeloConditionalOrder[];
  poolBalance: number;
  traderAddress: Address | undefined;
  usingBurner: boolean;
  traderEthBalance: bigint;
  isV3: boolean;
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
  addMargin: (tradeId: bigint, amountUSDC: number) => Promise<{ txHash: `0x${string}`; explorerUrl: string }>;
  reduceMargin: (tradeId: bigint, amountUSDC: number, pair: VeloPairLabel) => Promise<{ txHash: `0x${string}`; explorerUrl: string }>;
  partialClose: (tradeId: bigint, fractionBps: number, pair: VeloPairLabel) => Promise<{ txHash: `0x${string}`; explorerUrl: string }>;
  setTriggers: (tradeId: bigint, takeProfit: number, stopLoss: number) => Promise<{ txHash: `0x${string}`; explorerUrl: string }>;
  depositCross: (amountUSDC: number) => Promise<{ txHash: `0x${string}`; explorerUrl: string }>;
  withdrawCross: (amountUSDC: number) => Promise<{ txHash: `0x${string}`; explorerUrl: string }>;
  placeConditionalOrder: (args: PlaceConditionalOrderArgs) => Promise<{ txHash: `0x${string}`; orderId: bigint; explorerUrl: string }>;
  cancelConditionalOrder: (orderId: bigint) => Promise<{ txHash: `0x${string}`; explorerUrl: string }>;
  reloadBurner: () => void;
}

export function useVeloPerpsTrading(): UseVeloPerpsTradingState & UseVeloPerpsTradingActions {
  const { address: mainAddress, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: metaMaskWalletClient } = useWalletClient();

  const [burnerNonce, setBurnerNonce] = useState(0);
  const reloadBurner = useCallback(() => setBurnerNonce((n) => n + 1), []);

  const burner: VeloBurnerWallet | null = useMemo(() => {
    if (!mainAddress) return null;
    return loadStoredBurner(mainAddress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainAddress, burnerNonce]);

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

  const traderAddress: Address | undefined = burner?.veloAddress ?? mainAddress;
  const usingBurner = !!burner;

  const onCorrectChain = chainId === BASE_SEPOLIA_CHAIN_ID;
  const isReady = isConnected && onCorrectChain && !!publicClient && !!traderAddress;

  const [isInitialLoading, setInitialLoading] = useState(true);
  const [isPending, setPending] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [usdcBalance, setUsdcBalance] = useState(0);
  const [openPositions, setOpenPositions] = useState<VeloPosition[]>([]);
  const [conditionalOrders, setConditionalOrders] = useState<VeloConditionalOrder[]>([]);
  const [poolBalance, setPoolBalance] = useState(0);
  const [crossFreeBalance, setCrossFreeBalance] = useState(0);
  const [crossTotalBalance, setCrossTotalBalance] = useState(0);
  const [crossLockedBalance, setCrossLockedBalance] = useState(0);
  const [traderEthBalance, setTraderEthBalance] = useState<bigint>(0n);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  useEffect(() => {
    setInitialLoading(true);
    setOpenPositions([]);
    setConditionalOrders([]);
    setUsdcBalance(0);
    setCrossFreeBalance(0);
    setCrossTotalBalance(0);
    setCrossLockedBalance(0);
    setTraderEthBalance(0n);
  }, [traderAddress]);

  const refresh = useCallback(async () => {
    if (!isReady || !traderAddress || !publicClient) return;
    try {
      const [positions, orders, balance, pool, cross, ethBal] = await Promise.all([
        fetchOpenPositions(publicClient, traderAddress),
        fetchConditionalOrders(publicClient, traderAddress),
        fetchUsdcBalance(publicClient, VELO_USDC_BASE, traderAddress),
        fetchPoolBalance(publicClient),
        fetchCrossTotalBalance(publicClient, traderAddress),
        publicClient.getBalance({ address: traderAddress }).catch(() => 0n),
      ]);
      if (!mountedRef.current) return;
      setOpenPositions(positions);
      setConditionalOrders(orders);
      setUsdcBalance(balance);
      setPoolBalance(pool);
      setCrossFreeBalance(cross.free);
      setCrossTotalBalance(cross.total);
      setCrossLockedBalance(cross.locked);
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
      setConditionalOrders([]);
      setUsdcBalance(0);
      setTraderEthBalance(0n);
      return;
    }
    setInitialLoading(true);
    refresh();
    const handle = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(handle);
  }, [isReady, refresh]);

  // ── Writes ─────────────────────────────────────────────────────────────────

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

  const openPosition = useCallback(
    async (args: OpenPositionArgs) => {
      if (!tradingClient || !publicClient || !traderAddress) {
        throw new Error('Trading wallet not ready');
      }
      setPending(true);
      setLastError(null);
      try {
        const pairIndex = PAIR_INDEX[args.pair];
        const [feedId, tradable] = await Promise.all([
          publicClient.readContract({
            address: VELO_PERPS_ADDRESS, abi: VELO_PERPS_V3_ABI,
            functionName: 'pairFeedId', args: [pairIndex],
          }),
          publicClient.readContract({
            address: VELO_PERPS_ADDRESS, abi: VELO_PERPS_V3_ABI,
            functionName: 'pairTradable', args: [pairIndex],
          }),
        ]);
        if (!feedId || feedId === '0x0000000000000000000000000000000000000000000000000000000000000000') {
          throw new Error(`${args.pair} isn't listed on the contract yet. The protocol owner needs to register it.`);
        }
        if (!tradable) {
          throw new Error(`${args.pair} is registered but paused. Contact the protocol owner.`);
        }

        await ensureBurnerGas(publicClient, traderAddress);

        // For ISOLATED, the contract pulls collateral on open — approve up-front.
        // For CROSS, the collateral comes from the cross-account ledger, no
        // approve is needed at open time (the deposit already moved the mUSDC in).
        if ((args.marginMode || 'ISOLATED') === 'ISOLATED') {
          await approveUsdcIfNeeded(
            tradingClient as any,
            publicClient,
            VELO_USDC_BASE,
            VELO_PERPS_ADDRESS,
            traderAddress,
            args.collateralUSDC,
          );
        } else {
          // Sanity check: cross requires sufficient free cross balance.
          const free = await fetchCrossFreeBalance(publicClient, traderAddress);
          if (free < args.collateralUSDC) {
            throw new Error(`Not enough free cross balance ($${free.toFixed(2)} < $${args.collateralUSDC.toFixed(2)}). Deposit to cross account first.`);
          }
        }
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
        setLastError(msg); throw e;
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
        setLastError(msg); throw e;
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
        setLastError(msg); throw e;
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
        setLastError(msg); throw e;
      } finally { setPending(false); }
    },
    [tradingClient, publicClient, refresh, traderAddress],
  );

  // ── V3 cross-account writes ───────────────────────────────────────────────

  const depositCross = useCallback(
    async (amountUSDC: number) => {
      if (!tradingClient || !publicClient || !traderAddress) throw new Error('Trading wallet not ready');
      setPending(true); setLastError(null);
      try {
        await ensureBurnerGas(publicClient, traderAddress);
        const result = await depositCrossTx(tradingClient as any, publicClient, amountUSDC);
        await refresh();
        return { ...result, explorerUrl: baseScanTxUrl(result.txHash) };
      } catch (e: any) {
        const msg = e?.shortMessage || e?.message || 'Deposit failed';
        setLastError(msg); throw e;
      } finally { setPending(false); }
    },
    [tradingClient, publicClient, traderAddress, refresh],
  );

  const withdrawCross = useCallback(
    async (amountUSDC: number) => {
      if (!tradingClient || !publicClient || !traderAddress) throw new Error('Trading wallet not ready');
      setPending(true); setLastError(null);
      try {
        await ensureBurnerGas(publicClient, traderAddress);
        const result = await withdrawCrossTx(tradingClient as any, publicClient, amountUSDC);
        await refresh();
        return { ...result, explorerUrl: baseScanTxUrl(result.txHash) };
      } catch (e: any) {
        const msg = e?.shortMessage || e?.message || 'Withdraw failed';
        setLastError(msg); throw e;
      } finally { setPending(false); }
    },
    [tradingClient, publicClient, traderAddress, refresh],
  );

  // ── V3 conditional orders ──────────────────────────────────────────────────

  const placeConditionalOrder = useCallback(
    async (args: PlaceConditionalOrderArgs) => {
      if (!tradingClient || !publicClient || !traderAddress) throw new Error('Trading wallet not ready');
      setPending(true); setLastError(null);
      try {
        await ensureBurnerGas(publicClient, traderAddress);
        const result = await placeConditionalOrderTx(tradingClient as any, publicClient, args);
        await refresh();
        return { ...result, explorerUrl: baseScanTxUrl(result.txHash) };
      } catch (e: any) {
        const msg = e?.shortMessage || e?.message || 'Order placement failed';
        setLastError(msg); throw e;
      } finally { setPending(false); }
    },
    [tradingClient, publicClient, traderAddress, refresh],
  );

  const cancelConditionalOrder = useCallback(
    async (orderId: bigint) => {
      if (!tradingClient || !publicClient || !traderAddress) throw new Error('Trading wallet not ready');
      setPending(true); setLastError(null);
      try {
        await ensureBurnerGas(publicClient, traderAddress);
        const result = await cancelConditionalOrderTx(tradingClient as any, publicClient, orderId);
        await refresh();
        return { ...result, explorerUrl: baseScanTxUrl(result.txHash) };
      } catch (e: any) {
        const msg = e?.shortMessage || e?.message || 'Cancel failed';
        setLastError(msg); throw e;
      } finally { setPending(false); }
    },
    [tradingClient, publicClient, traderAddress, refresh],
  );

  return {
    isReady,
    isInitialLoading,
    isPending,
    lastError,
    usdcBalance,
    crossFreeBalance,
    crossTotalBalance,
    crossLockedBalance,
    openPositions,
    conditionalOrders,
    poolBalance,
    traderAddress,
    usingBurner,
    traderEthBalance,
    isV3: IS_V3,
    refresh,
    mintTestUsdc,
    openPosition,
    closePosition,
    addMargin,
    reduceMargin,
    partialClose,
    setTriggers,
    depositCross,
    withdrawCross,
    placeConditionalOrder,
    cancelConditionalOrder,
    reloadBurner,
  };
}
