/**
 * useOrderlyTrading
 * ─────────────────
 * Bridges Velo's UI trade actions with Orderly Network's real testnet perps.
 * When a wallet is connected and the user has an active Orderly key + balance,
 * trade calls go to Orderly. Otherwise they fall back to the local simulation engine.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAccount } from 'wagmi';
import {
  getStoredKeypair,
  getOrderlyBalance,
  placeOrderlyOrder,
  getOrderlyPositions,
  cancelOrderlyOrder,
  buildOrderlyRequest,
  requestOrderlyWithdraw,
  preloadOrderlySymbolInfo,
  OrderlyKeypair,
  OrderlyPosition,
  baseScanTxUrl,
  orderlyPortfolioUrl,
  orderlyOrderUrl,
} from '../services/orderlyService';

export interface OrderlyTradeReceipt {
  success: boolean;
  orderlyOrderId?: number;
  orderlyOrderUrl?: string;
  executedPrice?: number;
  executedQty?: number;
  error?: string;
}

export interface OrderlyState {
  isReady: boolean;          // key registered + balance > 0
  keypair: OrderlyKeypair | null;
  orderlyBalance: number;    // USDC margin balance on Orderly
  orderlyPositions: OrderlyPosition[];
  isOnChain: boolean;        // true when wallet + key active
  lastOrderId: number | null;
  lastTxMsg: string;
}

const DEFAULT: OrderlyState = {
  isReady: false,
  keypair: null,
  orderlyBalance: 0,
  orderlyPositions: [],
  isOnChain: false,
  lastOrderId: null,
  lastTxMsg: '',
};

export function useOrderlyTrading(
  onToast: (msg: string, type: 'SUCCESS' | 'ERROR' | 'INFO') => void,
  burnerAddress?: `0x${string}` | null,
) {
  const { address: metaMaskAddress, isConnected } = useAccount();
  // If a burner address is provided (dYdX-style), use it for all Orderly calls.
  // This ensures balances/orders query against the trading wallet, not MetaMask.
  const address = (burnerAddress || metaMaskAddress) as `0x${string}` | undefined;
  const [state, setState] = useState<OrderlyState>(DEFAULT);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── Activate when wallet connects ─────────────────────────────────────────
    // isReady = keypair available + address connected. Balance is checked at
    // trade-place time, not here — using balance > 0 as the readiness gate
    // caused trades to silently fall back to simulation while a deposit was
    // mid-flight, which created phantom positions that vanished on next poll.
    useEffect(() => {
      if (!isConnected || !address) {
        setState(DEFAULT);
        return;
      }
      const kp = getStoredKeypair(address);
      if (!kp) { setState({ ...DEFAULT, isOnChain: true }); return; }

      // Kick off symbol-info fetch in the background so step sizes are
      // populated by the time the user places their first order.
      preloadOrderlySymbolInfo();

      // Load current Orderly balance — but mark ready as soon as we have a keypair.
      setState(prev => ({ ...prev, keypair: kp, isOnChain: true, isReady: true }));
      getOrderlyBalance(address, kp).then(bal => {
        setState(prev => ({
          ...prev,
          keypair: kp,
          orderlyBalance: bal,
          isOnChain: true,
          isReady: true,
        }));
      }).catch(() => {});
    }, [address, isConnected]);

  // ── Poll positions every 8 seconds when ready ─────────────────────────────
  useEffect(() => {
    if (!state.isReady || !state.keypair || !address) return;
    const kp = state.keypair;

    const refresh = async () => {
      const [positions, balance] = await Promise.all([
        getOrderlyPositions(address, kp),
        getOrderlyBalance(address, kp),
      ]);
      setState(prev => ({ ...prev, orderlyBalance: balance, orderlyPositions: positions }));
    };
    refresh();
    pollRef.current = setInterval(refresh, 8000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [state.isReady, address]);

  // ── Called after onboarding completes ─────────────────────────────────────
  // isReady = keypair available, NOT balance > 0. Caller is responsible for
  // checking balance before placing orders.
  const activateOrderly = useCallback((kp: OrderlyKeypair, balance: number) => {
    preloadOrderlySymbolInfo();
    setState(prev => ({ ...prev, keypair: kp, orderlyBalance: balance, isReady: true, isOnChain: true }));
  }, []);

  // ── Manual refresh of balance (used after deposits/withdraws) ─────────────
  const refreshBalance = useCallback(async (): Promise<number> => {
    if (!state.keypair || !address) return 0;
    const bal = await getOrderlyBalance(address, state.keypair);
    setState(prev => ({ ...prev, orderlyBalance: bal, isReady: !!prev.keypair }));
    return bal;
  }, [state.keypair, address]);

  // ── Place a real Orderly order ─────────────────────────────────────────────
  // Returns a receipt so callers can record orderlyOrderId + BaseScan URL into
  // Supabase trade history. The second return (boolean) preserves the old
  // behaviour of "handled on-chain or not" for existing callers.
  const placeOrderlyTrade = useCallback(async (
    veloPair: string,
    side: 'LONG' | 'SHORT',
    sizeUSD: number,
    currentPrice: number,
  ): Promise<OrderlyTradeReceipt> => {
    if (!state.isReady || !state.keypair || !address) {
      return { success: false, error: 'Orderly not ready' };
    }

    const req = buildOrderlyRequest(veloPair, side, sizeUSD, currentPrice, 'MARKET');
    if (!req) return { success: false, error: 'Pair not supported' };

    const result = await placeOrderlyOrder(address, state.keypair, req);

    if (result.success) {
      const orderId = result.orderId ?? null;
      // No per-order public URL on Orderly — use the portfolio root. The user
      // can log in there with their wallet to see this order in their own list.
      const url = orderlyPortfolioUrl();
      const msg = `✅ On-chain order #${orderId} — ${side} ${veloPair}`;
      onToast(msg, 'SUCCESS');
      setState(prev => ({ ...prev, lastOrderId: orderId, lastTxMsg: msg }));

      // Refresh balance after fill
      setTimeout(async () => {
        if (!state.keypair || !address) return;
        const bal = await getOrderlyBalance(address, state.keypair);
        setState(prev => ({ ...prev, orderlyBalance: bal }));
      }, 4000);

      return {
        success:         true,
        orderlyOrderId:  result.orderId,
        orderlyOrderUrl: url,
        executedPrice:   result.avgPrice,
        executedQty:     result.executedQty,
      };
    } else {
      onToast(`Orderly error: ${result.error}`, 'ERROR');
      return { success: false, error: result.error };
    }
  }, [state.isReady, state.keypair, address, onToast]);

  // ── Cancel an Orderly order ────────────────────────────────────────────────
  const cancelOrderlyTrade = useCallback(async (orderId: number, symbol: string): Promise<void> => {
    if (!state.keypair || !address) return;
    const ok = await cancelOrderlyOrder(address, state.keypair, orderId, symbol);
    onToast(ok ? `Order #${orderId} cancelled` : `Failed to cancel order #${orderId}`, ok ? 'INFO' : 'ERROR');
  }, [state.keypair, address, onToast]);

  // ── Request a withdraw from Orderly vault ──────────────────────────────────
  // Takes the user's signTypedDataAsync from wagmi. Returns success + nonce.
  const withdrawFromOrderly = useCallback(async (
    amountUSDC: number,
    signTypedDataAsync: (p: any) => Promise<`0x${string}`>,
  ): Promise<{ success: boolean; withdrawNonce?: number; error?: string }> => {
    if (!state.keypair || !address) return { success: false, error: 'Not authenticated' };
    if (amountUSDC <= 0)             return { success: false, error: 'Invalid amount' };
    if (amountUSDC > state.orderlyBalance) return { success: false, error: `Max withdrawable: $${state.orderlyBalance.toFixed(2)}` };

    const res = await requestOrderlyWithdraw(address, state.keypair, amountUSDC, signTypedDataAsync);
    if (res.success) {
      onToast(`Withdraw of ${amountUSDC} USDC queued — settles on-chain in 2–5 min`, 'SUCCESS');
      // Kick off a refresh shortly after
      setTimeout(() => { refreshBalance().catch(() => {}); }, 3000);
    } else {
      onToast(`Withdraw failed: ${res.error}`, 'ERROR');
    }
    return res;
  }, [state.keypair, address, state.orderlyBalance, onToast, refreshBalance]);

  return {
    state,
    activateOrderly,
    refreshBalance,
    placeOrderlyTrade,
    cancelOrderlyTrade,
    withdrawFromOrderly,
  };
}
