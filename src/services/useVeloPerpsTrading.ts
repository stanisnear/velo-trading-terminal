import type { ConfirmedClose } from './tradeReceipts';
import { requireSafeTestnetAction } from './testnetReleaseGate';
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
} from 'viem';
import { baseSepoliaTransport, transactionError, pendingTransaction, recoverPendingTransaction, checkLegacyTransaction } from './baseTransport.mjs';
import { waitForSuccessfulReceipt } from './tradeReceipts';
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
  IS_V4,
} from './veloPerpsService';
import {
  fetchUsdcBalance,
  approveUsdcIfNeeded,
  mintMockUsdc,
} from './veloUsdcService';
import { fetchPriceUpdate, PYTH_FEED_IDS } from './pythService';
import { requireBurnerGas as ensureBurnerGas } from './veloGasSponsor';
import { readTradingPreflight } from './tradePreflight.mjs';
import { isEnabledTradingMarket } from '../../shared/markets.mjs';
import {
  loadStoredBurner,
  type VeloBurnerWallet,
} from './veloBurnerWallet';

const POLL_INTERVAL_MS = 5_000;
const BASE_SEPOLIA_CHAIN_ID = 84532;
const BASE_SEPOLIA_RPC =
  import.meta.env.VITE_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';

export interface UseVeloPerpsTradingState {
  isReady: boolean;
  isInitialLoading: boolean;
  isPending: boolean;
  lastError: string | null;
  readError: string | null;
  pendingTxHash: Hex | null;
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
  legacyPositions: VeloPosition[];
  legacyOrders: VeloConditionalOrder[];
  legacyFreeBalance: number;
  legacyReadError: string | null;
}

export interface UseVeloPerpsTradingActions {
  resetLegacyTracking: () => Promise<void>;
  refresh: () => Promise<void>;
  mintTestUsdc: () => Promise<{ txHash: `0x${string}` }>;
  openPosition: (args: OpenPositionArgs) => Promise<{
    id: string;
    txHash: `0x${string}`;
    tradeId: bigint;
    entryPrice: number;
    notionalUSDC: number;
    explorerUrl: string;
  }>;
  closePosition: (tradeId: bigint, pair: VeloPairLabel) => Promise<ConfirmedClose & { explorerUrl: string }>;
  addMargin: (tradeId: bigint, amountUSDC: number) => Promise<{ txHash: `0x${string}`; explorerUrl: string }>;
  reduceMargin: (tradeId: bigint, amountUSDC: number, pair: VeloPairLabel) => Promise<{ txHash: `0x${string}`; explorerUrl: string }>;
  partialClose: (tradeId: bigint, fractionBps: number, pair: VeloPairLabel) => Promise<ConfirmedClose & { explorerUrl: string }>;
  setTriggers: (tradeId: bigint, takeProfit: number, stopLoss: number) => Promise<{ txHash: `0x${string}`; explorerUrl: string }>;
  depositCross: (amountUSDC: number) => Promise<{ txHash: `0x${string}`; explorerUrl: string }>;
  withdrawCross: (amountUSDC: number) => Promise<{ txHash: `0x${string}`; explorerUrl: string }>;
  placeConditionalOrder: (args: PlaceConditionalOrderArgs) => Promise<{ txHash: `0x${string}`; orderId: bigint; explorerUrl: string }>;
  cancelConditionalOrder: (orderId: bigint) => Promise<{ txHash: `0x${string}`; explorerUrl: string }>;
  reloadBurner: () => void;
  legacyExit: (action: 'close' | 'cancel' | 'withdraw', id?: bigint, pair?: VeloPairLabel) => Promise<{ txHash: Hex; close?: ConfirmedClose }>;
}

export function useVeloPerpsTrading(marks: Record<string, number> = {}): UseVeloPerpsTradingState & UseVeloPerpsTradingActions {
  const marksRef = useRef(marks);
  marksRef.current = marks;
  const { address: mainAddress, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: BASE_SEPOLIA_CHAIN_ID });
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
        transport: baseSepoliaTransport(BASE_SEPOLIA_RPC),
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
  const [readError, setReadError] = useState<string | null>(null);
  const writeLock = useRef(false);
  const pendingTxRef = useRef<Hex | null>(null);
  const [pendingTxHash, setPendingTxHash] = useState<Hex | null>(null);
  const rememberPending = (hash: Hex | null) => {
    pendingTxRef.current = hash; setPendingTxHash(hash);
    if (traderAddress) try {
      const key = `velo_pending_tx_84532_${traderAddress.toLowerCase()}`;
      if (hash) localStorage.setItem(key, hash); else localStorage.removeItem(key);
    } catch { /* memory guard still works */ }
  };
  useEffect(() => {
    let hash: Hex | null = null;
    try { const stored = traderAddress && localStorage.getItem(`velo_pending_tx_84532_${traderAddress.toLowerCase()}`); if (stored && /^0x[0-9a-f]{64}$/i.test(stored)) hash = stored as Hex; } catch {}
    hash = pendingTransaction(traderAddress)?.hash || hash;
    pendingTxRef.current = hash; setPendingTxHash(hash);
  }, [traderAddress]);
  const beginWrite = () => {
    if (isInitialLoading) throw new Error('Account data is still loading. Please wait before submitting.');
    const journal = pendingTransaction(traderAddress);
    if (journal) rememberPending(journal.hash);
    if (pendingTxRef.current) throw new Error('A submitted transaction is still awaiting confirmation. Check the transaction link before sending another.');
    if (writeLock.current) throw new Error('Another wallet transaction is in progress. Wait for its confirmation.');
    writeLock.current = true;
    setPending(true);
  };
  const [lastError, setLastError] = useState<string | null>(null);
  const [usdcBalance, setUsdcBalance] = useState(0);
  const [openPositions, setOpenPositions] = useState<VeloPosition[]>([]);
  const [conditionalOrders, setConditionalOrders] = useState<VeloConditionalOrder[]>([]);
  const [poolBalance, setPoolBalance] = useState(0);
  const [crossFreeBalance, setCrossFreeBalance] = useState(0);
  const [crossTotalBalance, setCrossTotalBalance] = useState(0);
  const [crossLockedBalance, setCrossLockedBalance] = useState(0);
  const [traderEthBalance, setTraderEthBalance] = useState<bigint>(0n);
  const [legacyPositions, setLegacyPositions] = useState<VeloPosition[]>([]);
  const [legacyOrders, setLegacyOrders] = useState<VeloConditionalOrder[]>([]);
  const [legacyFreeBalance, setLegacyFreeBalance] = useState(0);
  const [legacyReadError, setLegacyReadError] = useState<string | null>(null);
  const legacyReading = useRef(false);

  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  const identityRef = useRef(traderAddress);
  identityRef.current = traderAddress;
  const refreshInFlight = useRef<{ identity: Address; promise: Promise<void> } | null>(null);

  useEffect(() => {
    setInitialLoading(true);
    setOpenPositions([]);
    setConditionalOrders([]);
    setUsdcBalance(0);
    setCrossFreeBalance(0);
    setCrossTotalBalance(0);
    setCrossLockedBalance(0);
    setTraderEthBalance(0n);
    setLegacyPositions([]); setLegacyOrders([]); setLegacyFreeBalance(0); setLegacyReadError(null);
  }, [traderAddress]);

  const refresh = useCallback(async () => {
    if (!isReady || !traderAddress || !publicClient) return;
    if (refreshInFlight.current?.identity === traderAddress) return refreshInFlight.current.promise;
    const identity = traderAddress;
    const run = (async () => {
      try {
        const [positions, orders, balance, pool, cross, ethBal] = await Promise.all([
          fetchOpenPositions(publicClient, identity, 'active', marksRef.current), fetchConditionalOrders(publicClient, identity),
          fetchUsdcBalance(publicClient, VELO_USDC_BASE, identity), fetchPoolBalance(publicClient),
          fetchCrossTotalBalance(publicClient, identity), publicClient.getBalance({ address: identity }),
        ]);
        if (!mountedRef.current || identityRef.current !== identity) return;
        setOpenPositions(positions); setConditionalOrders(orders); setUsdcBalance(balance);
        setPoolBalance(pool); setCrossFreeBalance(cross.free); setCrossTotalBalance(cross.total);
        setCrossLockedBalance(cross.locked); setTraderEthBalance(ethBal); setReadError(null);
      } catch {
        if (mountedRef.current && identityRef.current === identity)
          setReadError('Account data could not refresh. Last confirmed values are shown; retry before trading.');
      } finally {
        if (mountedRef.current && identityRef.current === identity) setInitialLoading(false);
        if (refreshInFlight.current?.identity === identity) refreshInFlight.current = null;
      }
    })();
    refreshInFlight.current = { identity, promise: run };
    return run;
  }, [isReady, traderAddress, publicClient]);

  const refreshLegacy = useCallback(async () => {
    if (!IS_V4 || !isReady || !traderAddress || !publicClient || legacyReading.current) return;
    const identity = traderAddress;
    legacyReading.current = true;
    try {
      const [positions, orders, cross] = await Promise.all([
        fetchOpenPositions(publicClient, identity, 'legacy'),
        fetchConditionalOrders(publicClient, identity, 'legacy'),
        fetchCrossTotalBalance(publicClient, identity, 'legacy'),
      ]);
      if (!mountedRef.current || identityRef.current !== identity) return;
      setLegacyPositions(positions); setLegacyOrders(orders); setLegacyFreeBalance(cross.free); setLegacyReadError(null);
    } catch {
      if (mountedRef.current && identityRef.current === identity) setLegacyReadError('Legacy account could not refresh. Retry before exiting.');
    } finally { legacyReading.current = false; }
  }, [isReady, traderAddress, publicClient]);

  useEffect(() => {
    void refreshLegacy();
    const timer = setInterval(refreshLegacy, 15000);
    return () => clearInterval(timer);
  }, [refreshLegacy]);

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

  useEffect(() => {
    if (!pendingTxHash || !publicClient) return;
    let active = true, reading = false;
    const check = async () => {
      if (reading) return; reading = true;
      try {
        const receipt = await recoverPendingTransaction(publicClient, traderAddress, pendingTxHash);
        if (!active || !receipt) return;
        rememberPending(null);
        if (receipt.status === 'reverted') setLastError('The pending transaction reverted on-chain. You can retry.');
        if (receipt.status === 'replaced') setLastError('Another transaction used this nonce. Account data has been refreshed; check the action before retrying.');
        void refresh();
      } catch { /* Not mined or temporarily unreachable: keep the submission guard. */ }
      finally { reading = false; }
    };
    void check(); const timer = setInterval(check, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [pendingTxHash, traderAddress, publicClient, refresh]);

  const resetLegacyTracking = async () => {
    const identity = traderAddress, hash = pendingTxRef.current;
    if (!identity || !hash || writeLock.current) return;
    await checkLegacyTransaction(identity, hash);
    if (identityRef.current !== identity || pendingTxRef.current !== hash) return;
    rememberPending(null);
    await refresh();
  };

  // ── Writes ─────────────────────────────────────────────────────────────────

  const mintTestUsdc = useCallback(async () => {
    if (!tradingClient || !publicClient || !traderAddress) throw new Error('Wallet not connected');
    beginWrite();
    setLastError(null);
    try {
      const gas = await ensureBurnerGas(publicClient, traderAddress);
      if (!gas.ok) throw new Error(gas.reason || 'Unable to fund gas. Try again.');
      const txHash = await mintMockUsdc(tradingClient as any, VELO_USDC_BASE);
      rememberPending(txHash);
      await waitForSuccessfulReceipt(publicClient, txHash);
      rememberPending(null);
      void refresh();
      return { txHash };
    } catch (e: any) {
        e = transactionError(e);
        if (e?.txHash) rememberPending(e.txHash);
      const msg = e?.shortMessage || e?.message || 'Mint failed';
      setLastError(msg);
      throw e;
    } finally {
      writeLock.current = false; setPending(false);
    }
  }, [tradingClient, publicClient, traderAddress, refresh]);

  const openPosition = useCallback(
    async (args: OpenPositionArgs) => {
      requireSafeTestnetAction('open', args.marginMode);
      if (!isEnabledTradingMarket(args.pair)) throw new Error('This market is not available for new orders.');
      if (!tradingClient || !publicClient || !traderAddress) {
        throw new Error('Trading wallet not ready');
      }
      beginWrite();
      setLastError(null);
      try {
        const pairIndex = PAIR_INDEX[args.pair];
        const { feedId, tradable, gasBalance } = await readTradingPreflight(publicClient, VELO_PERPS_ADDRESS, VELO_PERPS_V3_ABI, pairIndex, traderAddress);
        if (!feedId || feedId === '0x0000000000000000000000000000000000000000000000000000000000000000') {
          throw new Error(`${args.pair} isn't listed on the contract yet. The protocol owner needs to register it.`);
        }
        if (!tradable) {
          throw new Error(`${args.pair} is registered but paused. Contact the protocol owner.`);
        }

        await ensureBurnerGas(publicClient, traderAddress, { checkedBalance: gasBalance });

        const result = await openPositionTx(tradingClient as any, publicClient, args);
        void refresh();
        return { ...result, explorerUrl: baseScanTxUrl(result.txHash) };
      } catch (e: any) {
        e = transactionError(e);
        if (e?.txHash) rememberPending(e.txHash);
        const msg = e?.shortMessage || e?.message || 'Open failed';
        setLastError(msg);
        throw e;
      } finally {
        writeLock.current = false; setPending(false);
      }
    },
    [tradingClient, publicClient, traderAddress, refresh],
  );

  const closePosition = useCallback(
    async (tradeId: bigint, pair: VeloPairLabel) => {
      if (!tradingClient || !publicClient) throw new Error('Trading wallet not ready');
      beginWrite();
      setLastError(null);
      try {
        if (traderAddress) await ensureBurnerGas(publicClient, traderAddress);
        const result = await closePositionTx(tradingClient as any, publicClient, tradeId, pair);
        void refresh();
        return { ...result, explorerUrl: baseScanTxUrl(result.txHash) };
      } catch (e: any) {
        e = transactionError(e);
        if (e?.txHash) rememberPending(e.txHash);
        const msg = e?.shortMessage || e?.message || 'Close failed';
        setLastError(msg);
        throw e;
      } finally {
        writeLock.current = false; setPending(false);
      }
    },
    [tradingClient, publicClient, refresh, traderAddress],
  );

  const addMargin = useCallback(
    async (tradeId: bigint, amountUSDC: number) => {
      requireSafeTestnetAction('margin');
      if (!tradingClient || !publicClient || !traderAddress) throw new Error('Trading wallet not ready');
      beginWrite(); setLastError(null);
      try {
        await ensureBurnerGas(publicClient, traderAddress);
        await approveUsdcIfNeeded(tradingClient as any, publicClient, VELO_USDC_BASE, VELO_PERPS_ADDRESS, traderAddress, amountUSDC);
        const result = await addMarginTx(tradingClient as any, publicClient, tradeId, amountUSDC);
        void refresh();
        return { ...result, explorerUrl: baseScanTxUrl(result.txHash) };
      } catch (e: any) {
        e = transactionError(e);
        if (e?.txHash) rememberPending(e.txHash);
        const msg = e?.shortMessage || e?.message || 'Add margin failed';
        setLastError(msg); throw e;
      } finally { writeLock.current = false; setPending(false); }
    },
    [tradingClient, publicClient, traderAddress, refresh],
  );

  const reduceMargin = useCallback(
    async (tradeId: bigint, amountUSDC: number, pair: VeloPairLabel) => {
      requireSafeTestnetAction('margin');
      if (!tradingClient || !publicClient) throw new Error('Trading wallet not ready');
      beginWrite(); setLastError(null);
      try {
        if (traderAddress) await ensureBurnerGas(publicClient, traderAddress);
        const feedId = (PYTH_FEED_IDS as any)[pair];
        const { updateData } = await fetchPriceUpdate([feedId]);
        const feeWei = await publicClient.readContract({ address: '0xA2aa501b19aff244D90cc15a4Cf739D2725B5729' as `0x${string}`, abi: [{ type: 'function', name: 'getUpdateFee', stateMutability: 'view', inputs: [{ name: 'updateData', type: 'bytes[]' }], outputs: [{ name: 'feeAmount', type: 'uint256' }] }] as const, functionName: 'getUpdateFee', args: [updateData] }) as bigint;
        const result = await reduceMarginTx(tradingClient as any, publicClient, tradeId, amountUSDC, updateData, feeWei);
        void refresh();
        return { ...result, explorerUrl: baseScanTxUrl(result.txHash) };
      } catch (e: any) {
        e = transactionError(e);
        if (e?.txHash) rememberPending(e.txHash);
        const msg = e?.shortMessage || e?.message || 'Reduce margin failed';
        setLastError(msg); throw e;
      } finally { writeLock.current = false; setPending(false); }
    },
    [tradingClient, publicClient, refresh, traderAddress],
  );

  const partialClose = useCallback(
    async (tradeId: bigint, fractionBps: number, pair: VeloPairLabel) => {
      if (!tradingClient || !publicClient) throw new Error('Trading wallet not ready');
      beginWrite(); setLastError(null);
      try {
        if (traderAddress) await ensureBurnerGas(publicClient, traderAddress);
        const feedId = (PYTH_FEED_IDS as any)[pair];
        const { updateData } = await fetchPriceUpdate([feedId]);
        const feeWei = await publicClient.readContract({ address: '0xA2aa501b19aff244D90cc15a4Cf739D2725B5729' as `0x${string}`, abi: [{ type: 'function', name: 'getUpdateFee', stateMutability: 'view', inputs: [{ name: 'updateData', type: 'bytes[]' }], outputs: [{ name: 'feeAmount', type: 'uint256' }] }] as const, functionName: 'getUpdateFee', args: [updateData] }) as bigint;
        const result = await partialCloseTx(tradingClient as any, publicClient, tradeId, fractionBps, updateData, feeWei);
        void refresh();
        return { ...result, explorerUrl: baseScanTxUrl(result.txHash) };
      } catch (e: any) {
        e = transactionError(e);
        if (e?.txHash) rememberPending(e.txHash);
        const msg = e?.shortMessage || e?.message || 'Partial close failed';
        setLastError(msg); throw e;
      } finally { writeLock.current = false; setPending(false); }
    },
    [tradingClient, publicClient, refresh, traderAddress],
  );

  const setTriggers = useCallback(
    async (tradeId: bigint, takeProfit: number, stopLoss: number) => {
      if (!tradingClient || !publicClient) throw new Error('Trading wallet not ready');
      beginWrite(); setLastError(null);
      try {
        if (traderAddress) await ensureBurnerGas(publicClient, traderAddress);
        const result = await setTriggersTx(tradingClient as any, publicClient, tradeId, takeProfit, stopLoss);
        void refresh();
        return { ...result, explorerUrl: baseScanTxUrl(result.txHash) };
      } catch (e: any) {
        e = transactionError(e);
        if (e?.txHash) rememberPending(e.txHash);
        const msg = e?.shortMessage || e?.message || 'Set triggers failed';
        setLastError(msg); throw e;
      } finally { writeLock.current = false; setPending(false); }
    },
    [tradingClient, publicClient, refresh, traderAddress],
  );

  // ── V3 cross-account writes ───────────────────────────────────────────────

  const depositCross = useCallback(
    async (amountUSDC: number) => {
      requireSafeTestnetAction('crossDeposit');
      if (!tradingClient || !publicClient || !traderAddress) throw new Error('Trading wallet not ready');
      beginWrite(); setLastError(null);
      try {
        await ensureBurnerGas(publicClient, traderAddress);
        const result = await depositCrossTx(tradingClient as any, publicClient, amountUSDC);
        void refresh();
        return { ...result, explorerUrl: baseScanTxUrl(result.txHash) };
      } catch (e: any) {
        e = transactionError(e);
        if (e?.txHash) rememberPending(e.txHash);
        const msg = e?.shortMessage || e?.message || 'Deposit failed';
        setLastError(msg); throw e;
      } finally { writeLock.current = false; setPending(false); }
    },
    [tradingClient, publicClient, traderAddress, refresh],
  );

  const withdrawCross = useCallback(
    async (amountUSDC: number) => {
      if (!tradingClient || !publicClient || !traderAddress) throw new Error('Trading wallet not ready');
      beginWrite(); setLastError(null);
      try {
        await ensureBurnerGas(publicClient, traderAddress);
        const result = await withdrawCrossTx(tradingClient as any, publicClient, amountUSDC);
        void refresh();
        return { ...result, explorerUrl: baseScanTxUrl(result.txHash) };
      } catch (e: any) {
        e = transactionError(e);
        if (e?.txHash) rememberPending(e.txHash);
        const msg = e?.shortMessage || e?.message || 'Withdraw failed';
        setLastError(msg); throw e;
      } finally { writeLock.current = false; setPending(false); }
    },
    [tradingClient, publicClient, traderAddress, refresh],
  );

  // ── V3 conditional orders ──────────────────────────────────────────────────

  const placeConditionalOrder = useCallback(
    async (args: PlaceConditionalOrderArgs) => {
      requireSafeTestnetAction('order', args.marginMode, args.reduceOnly);
      if (!isEnabledTradingMarket(args.pair)) throw new Error('This market is not available for new orders.');
      if (!tradingClient || !publicClient || !traderAddress) throw new Error('Trading wallet not ready');
      beginWrite(); setLastError(null);
      try {
        await ensureBurnerGas(publicClient, traderAddress);
        const result = await placeConditionalOrderTx(tradingClient as any, publicClient, args);
        void refresh();
        return { ...result, explorerUrl: baseScanTxUrl(result.txHash) };
      } catch (e: any) {
        e = transactionError(e);
        if (e?.txHash) rememberPending(e.txHash);
        const msg = e?.shortMessage || e?.message || 'Order placement failed';
        setLastError(msg); throw e;
      } finally { writeLock.current = false; setPending(false); }
    },
    [tradingClient, publicClient, traderAddress, refresh],
  );

  const cancelConditionalOrder = useCallback(
    async (orderId: bigint) => {
      if (!tradingClient || !publicClient || !traderAddress) throw new Error('Trading wallet not ready');
      beginWrite(); setLastError(null);
      try {
        await ensureBurnerGas(publicClient, traderAddress);
        const result = await cancelConditionalOrderTx(tradingClient as any, publicClient, orderId);
        void refresh();
        return { ...result, explorerUrl: baseScanTxUrl(result.txHash) };
      } catch (e: any) {
        e = transactionError(e);
        if (e?.txHash) rememberPending(e.txHash);
        const msg = e?.shortMessage || e?.message || 'Cancel failed';
        setLastError(msg); throw e;
      } finally { writeLock.current = false; setPending(false); }
    },
    [tradingClient, publicClient, traderAddress, refresh],
  );

  const legacyExit: UseVeloPerpsTradingActions['legacyExit'] = async (action, id, pair) => {
    if (!IS_V4 || !isReady || !tradingClient || !publicClient || !traderAddress) throw new Error('Trading wallet not ready');
    beginWrite(); setLastError(null);
    try {
      await ensureBurnerGas(publicClient, traderAddress);
      let result: { txHash: Hex; close?: ConfirmedClose };
      if (action === 'close' && id !== undefined && pair) {
        const close = await closePositionTx(tradingClient as any, publicClient, id, pair, 'legacy');
        result = { txHash: close.txHash, close };
      } else if (action === 'cancel' && id !== undefined) {
        result = await cancelConditionalOrderTx(tradingClient as any, publicClient, id, 'legacy');
      } else if (action === 'withdraw') {
        const cross = await fetchCrossTotalBalance(publicClient, traderAddress, 'legacy');
        if (cross.free <= 0) throw new Error('No free legacy collateral to withdraw');
        result = await withdrawCrossTx(tradingClient as any, publicClient, cross.free, 'legacy');
      } else throw new Error('Invalid legacy exit action');
      await refreshLegacy(); void refresh();
      return result;
    } catch (error: any) {
      const e = transactionError(error);
      if (e?.txHash) rememberPending(e.txHash);
      setLastError(e?.shortMessage || e?.message || 'Legacy exit failed');
      throw e;
    } finally { writeLock.current = false; setPending(false); }
  };

  return {
    isReady,
    isInitialLoading,
    isPending,
    lastError,
    readError,
    pendingTxHash,
    resetLegacyTracking,
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
    legacyPositions, legacyOrders, legacyFreeBalance, legacyReadError, legacyExit,
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
