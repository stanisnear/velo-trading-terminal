/**
 * useOrderlyTrading — STUB (Phase 3 migration).
 *
 * Velo no longer uses Orderly Network. The real on-chain trading lives in
 * useVeloPerpsTrading. This stub keeps the import + call signature stable so
 * App.tsx doesn't need a sweeping rename pass — every `orderly.*` read returns
 * a safe inert default, and every action is a no-op that resolves cleanly.
 *
 * A future cleanup pass should rip this file out entirely along with all
 * `orderly.*` references in App.tsx, but the surface area is large enough that
 * a stub is the safer move right now.
 */

export interface OrderlyKeypair {
  publicKey: string;
  secretKey: Uint8Array;
}

export interface OrderlyPosition {
  symbol: string;
  position_qty: number;
  average_open_price: number;
  mark_price: number;
  est_liq_price: number;
  unrealized_pnl: number;
  cost_position: number;
}

export interface OrderlyTradeReceipt {
  success: boolean;
  orderlyOrderId?: number;
  orderlyOrderUrl?: string;
  executedPrice?: number;
  executedQty?: number;
  error?: string;
}

export interface OrderlyState {
  isReady: boolean;
  keypair: OrderlyKeypair | null;
  orderlyBalance: number;
  orderlyPositions: OrderlyPosition[];
  isOnChain: boolean;
  lastOrderId: number | null;
  lastTxMsg: string;
}

const INERT: OrderlyState = {
  isReady: false,
  keypair: null,
  orderlyBalance: 0,
  orderlyPositions: [],
  isOnChain: false,
  lastOrderId: null,
  lastTxMsg: '',
};

const INERT_RECEIPT: OrderlyTradeReceipt = {
  success: false,
  error: 'Orderly is no longer connected — trades route through VeloPerps.',
};

export function useOrderlyTrading(
  _onToast: (msg: string, type: 'SUCCESS' | 'ERROR' | 'INFO') => void,
  _burnerAddress?: `0x${string}` | null,
) {
  return {
    state: INERT,
    activateOrderly: (_kp: OrderlyKeypair, _bal: number) => { /* no-op */ },
    placeOrderlyTrade: async (
      _pair: string,
      _side: 'LONG' | 'SHORT',
      _size: number,
      _price: number,
    ): Promise<OrderlyTradeReceipt> => INERT_RECEIPT,
    cancelOrderlyTrade: async (_orderId: number): Promise<boolean> => false,
    withdrawFromOrderly: async (_amount: number, _sign: any): Promise<{ success: boolean; error?: string }> =>
      ({ success: false, error: 'Orderly no longer connected.' }),
    refreshBalance: async (): Promise<number | null> => null,
  };
}
