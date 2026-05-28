import { v4 as uuidv4 } from 'uuid';
import { Position, OpenOrder, OrderType, MarginMode, TradeHistoryItem } from '../utils/types';

// ═══════════════════════════════════════════════════════════════
// ORDER ENGINE — Standalone trade execution service
// ═══════════════════════════════════════════════════════════════

const MAINTENANCE_MARGIN = 0.005; // 0.5% MMR

export interface PlaceOrderParams {
  pair: string;
  side: 'LONG' | 'SHORT';
  size: number;
  leverage: number;
  type: OrderType;
  price?: number;
  marginMode: MarginMode;
  takeProfit?: number;
  stopLoss?: number;
  userId: string;
  currentBalance: number;
  existingPositions: Position[];
  marketPrices: Record<string, number>;
}

export interface OrderResult {
  success: boolean;
  error?: string;
  newPosition?: Position;
  updatedPosition?: Position;
  closedPositionId?: string;
  flippedPosition?: Position;
  newOrders: OpenOrder[];
  cancelledOrderIds: string[];
  balanceDelta: number;
  realizedPnl: number;
  tradeHistory: TradeHistoryItem[];
  type: 'NEW' | 'MERGE' | 'PARTIAL_CLOSE' | 'FULL_CLOSE' | 'FLIP' | 'LEVERAGE_UPDATE' | 'QUEUED';
}

export interface FillEvent {
  orderId: string;
  type: 'LIMIT_FILL' | 'STOP_FILL' | 'TP_FILL' | 'SL_FILL' | 'LIQUIDATION';
  positionId?: string;
  pair: string;
  side: 'LONG' | 'SHORT';
  size: number;
  price: number;
  pnl: number;
}

export interface CloseResult {
  success: boolean;
  error?: string;
  pnl: number;
  marginReturned: number;
  remainingPosition?: Position;
  tradeHistory: TradeHistoryItem;
}

export class OrderEngine {
  
  // ─── Liquidation Price ───────────────────────────────────────
  calculateLiquidationPrice(
    side: 'LONG' | 'SHORT', 
    entryPrice: number, 
    leverage: number, 
    _marginMode: MarginMode
  ): number {
    if (side === 'LONG') {
      return entryPrice * (1 - (1 / leverage) + MAINTENANCE_MARGIN);
    }
    return entryPrice * (1 + (1 / leverage) - MAINTENANCE_MARGIN);
  }

  // ─── Unrealized PnL ─────────────────────────────────────────
  calculateUnrealizedPnL(position: Position, currentPrice: number): number {
    if (!position || !currentPrice || currentPrice <= 0) return 0;
    const direction = position.side === 'LONG' ? 1 : -1;
    return (currentPrice - position.entryPrice) * direction * (position.size / position.entryPrice);
  }

  // ─── Buying Power ───────────────────────────────────────────
  calculateBuyingPower(
    balance: number,
    positions: Position[],
    marketPrices: Record<string, number>
  ): number {
    if (!positions || !Array.isArray(positions)) return Math.max(0, balance);

    const crossPnl = positions
      .filter(p => p?.marginMode === 'CROSS' && !p.isCopyTrade)
      .reduce((acc, p) => {
        const cp = marketPrices?.[p.pair] || p.entryPrice;
        return acc + this.calculateUnrealizedPnL(p, cp);
      }, 0);

    return Math.max(0, balance + crossPnl);
  }

  // ─── Place Order ────────────────────────────────────────────
  placeOrder(params: PlaceOrderParams): OrderResult {
    const {
      pair, side, size, leverage, type, price,
      marginMode, takeProfit, stopLoss, userId,
      currentBalance, existingPositions, marketPrices
    } = params;

    const uniqueId = uuidv4();
    const currentPrice = price || marketPrices[pair] || 0;
    
    if (currentPrice <= 0) {
      return this._errorResult('Price not available');
    }

    const buyingPower = this.calculateBuyingPower(currentBalance, existingPositions, marketPrices);

    // ── Limit / Stop → Queue ──
    if (type === 'LIMIT' || type === 'STOP') {
      if (!price || price <= 0) {
        return this._errorResult('Price required for limit/stop orders');
      }
      const queuedOrder: OpenOrder = {
        id: `ord_${uniqueId}`,
        pair,
        side,
        type,
        price,
        size,
        leverage,
        timestamp: Date.now(),
      };
      return {
        success: true,
        newOrders: [queuedOrder],
        cancelledOrderIds: [],
        balanceDelta: 0,
        realizedPnl: 0,
        tradeHistory: [],
        type: 'QUEUED',
      };
    }

    // ── Market Order ──
    const safePositions = Array.isArray(existingPositions) ? existingPositions : [];
    const existingPosition = safePositions.find(
      p => p.pair === pair && !p.isCopyTrade
    );

    if (existingPosition) {
      return this._handleExistingPosition(
        existingPosition, params, currentPrice, buyingPower, uniqueId
      );
    }

    // ── New Position ──
    return this._openNewPosition(params, currentPrice, buyingPower, uniqueId);
  }

  // ─── Cancel Order ───────────────────────────────────────────
  cancelOrder(orderId: string, openOrders: OpenOrder[]): { remaining: OpenOrder[]; cancelled: boolean } {
    const idx = openOrders.findIndex(o => o.id === orderId);
    if (idx === -1) return { remaining: openOrders, cancelled: false };
    return { remaining: openOrders.filter(o => o.id !== orderId), cancelled: true };
  }

  // ─── Process Price Tick ─────────────────────────────────────
  processPriceTick(
    pair: string, 
    currentPrice: number, 
    openOrders: OpenOrder[], 
    positions: Position[]
  ): FillEvent[] {
    const events: FillEvent[] = [];
    if (!currentPrice || currentPrice <= 0) return events;

    // Check limit/stop order fills
    for (const order of openOrders) {
      if (order.pair !== pair) continue;
      
      let filled = false;
      let fillType: FillEvent['type'] = 'LIMIT_FILL';

      if (order.type === 'LIMIT') {
        if (order.side === 'LONG' && currentPrice <= order.price) filled = true;
        if (order.side === 'SHORT' && currentPrice >= order.price) filled = true;
        fillType = 'LIMIT_FILL';
      } else if (order.type === 'STOP') {
        if (order.side === 'LONG' && currentPrice >= order.price) filled = true;
        if (order.side === 'SHORT' && currentPrice <= order.price) filled = true;
        fillType = 'STOP_FILL';
      } else if (order.type === 'TAKE_PROFIT') {
        if (order.side === 'SHORT' && currentPrice >= order.price) filled = true;
        if (order.side === 'LONG' && currentPrice <= order.price) filled = true;
        fillType = 'TP_FILL';
      } else if (order.type === 'STOP_LOSS') {
        if (order.side === 'SHORT' && currentPrice <= order.price) filled = true;
        if (order.side === 'LONG' && currentPrice >= order.price) filled = true;
        fillType = 'SL_FILL';
      }

      if (filled) {
        // Calculate PnL for TP/SL fills
        let pnl = 0;
        if (order.relatedPositionId) {
          const pos = positions.find(p => p.id === order.relatedPositionId);
          if (pos) {
            pnl = this.calculateUnrealizedPnL(pos, currentPrice);
          }
        }

        events.push({
          orderId: order.id,
          type: fillType,
          positionId: order.relatedPositionId,
          pair: order.pair,
          side: order.side,
          size: order.size,
          price: currentPrice,
          pnl,
        });
      }
    }

    // Check liquidations
    for (const pos of positions) {
      if (pos.pair !== pair) continue;
      
      let liquidated = false;
      if (pos.side === 'LONG' && currentPrice <= pos.liquidationPrice) liquidated = true;
      if (pos.side === 'SHORT' && currentPrice >= pos.liquidationPrice) liquidated = true;

      if (liquidated) {
        const pnl = -(pos.size / pos.leverage); // Total margin loss
        events.push({
          orderId: `liq_${pos.id}`,
          type: 'LIQUIDATION',
          positionId: pos.id,
          pair: pos.pair,
          side: pos.side,
          size: pos.size,
          price: currentPrice,
          pnl,
        });
      }
    }

    return events;
  }

  // ─── Close Position ─────────────────────────────────────────
  closePosition(
    position: Position, 
    exitPrice: number, 
    sizeToClose?: number
  ): CloseResult {
    if (!position) return { success: false, error: 'Position not found', pnl: 0, marginReturned: 0, tradeHistory: {} as TradeHistoryItem };

    const closeSize = sizeToClose ? Math.min(sizeToClose, position.size) : position.size;
    const pnl = (exitPrice - position.entryPrice) * (position.side === 'LONG' ? 1 : -1) * (closeSize / position.entryPrice);
    const marginReturned = closeSize / position.leverage;

    const historyItem: TradeHistoryItem = {
      id: `trade_close_${uuidv4()}`,
      pair: position.pair,
      side: position.side,
      entryPrice: position.entryPrice,
      exitPrice,
      size: closeSize,
      pnl,
      timestamp: Date.now(),
      action: 'CLOSE',
      copyTraderId: position.copyTraderId,
    };

    const isPartial = closeSize < position.size;
    const remainingPosition = isPartial
      ? { ...position, size: position.size - closeSize }
      : undefined;

    return {
      success: true,
      pnl,
      marginReturned,
      remainingPosition,
      tradeHistory: historyItem,
    };
  }

  // ─── Private: Handle Existing Position ──────────────────────
  private _handleExistingPosition(
    existing: Position,
    params: PlaceOrderParams,
    currentPrice: number,
    buyingPower: number,
    uniqueId: string
  ): OrderResult {
    const { side, size, leverage, marginMode, takeProfit, stopLoss, pair } = params;

    // ── Leverage-only update ──
    if (size === 0 && existing.side === side) {
      const currentMargin = existing.size / existing.leverage;
      const newMargin = existing.size / leverage;
      const extraMarginNeeded = newMargin - currentMargin; // positive when deleveraging

      // Deleveraging requires locking additional margin from the free balance.
      // If the user doesn't have enough free balance, reject with the exact shortfall.
      if (extraMarginNeeded > 0 && buyingPower < extraMarginNeeded) {
        const shortfall = extraMarginNeeded - buyingPower;
        return this._errorResult(
          `Insufficient free balance to reduce leverage. Need $${shortfall.toFixed(2)} more free balance.`
        );
      }

      const newLiqPrice = this.calculateLiquidationPrice(side, existing.entryPrice, leverage, marginMode);
      return {
        success: true,
        updatedPosition: { ...existing, leverage, liquidationPrice: newLiqPrice },
        newOrders: [],
        cancelledOrderIds: [],
        balanceDelta: extraMarginNeeded > 0 ? -extraMarginNeeded : 0, // lock extra margin; leveraging up frees margin but we keep balance unchanged for safety
        realizedPnl: 0,
        tradeHistory: [],
        type: 'LEVERAGE_UPDATE',
      };
    }

    // ── Same side → Merge ──
    if (existing.side === side) {
      const totalSize = existing.size + size;
      const newEntryPrice = ((existing.size * existing.entryPrice) + (size * currentPrice)) / totalSize;
      const newLiqPrice = this.calculateLiquidationPrice(side, newEntryPrice, leverage, marginMode);

      const oldMargin = existing.size / existing.leverage;
      const newMargin = totalSize / leverage;
      const marginDelta = newMargin - oldMargin;

      if (marginDelta > 0 && buyingPower < marginDelta) {
        return this._errorResult('Insufficient buying power');
      }

      const updatedPosition: Position = {
        ...existing,
        size: totalSize,
        entryPrice: newEntryPrice,
        liquidationPrice: newLiqPrice,
        leverage,
        marginMode,
        takeProfit: takeProfit || existing.takeProfit,
        stopLoss: stopLoss || existing.stopLoss,
      };

      const tpSlOrders = this._createTpSlOrders(existing.id, pair, side, totalSize, leverage, takeProfit, stopLoss, uniqueId);

      return {
        success: true,
        updatedPosition,
        newOrders: tpSlOrders,
        cancelledOrderIds: tpSlOrders.length > 0 ? [`__clear_position_${existing.id}`] : [],
        balanceDelta: -marginDelta,
        realizedPnl: 0,
        tradeHistory: [{
          id: `trade_${uniqueId}`,
          pair,
          side,
          entryPrice: currentPrice,
          exitPrice: 0,
          size,
          pnl: 0,
          timestamp: Date.now(),
          action: 'OPEN',
          positionId: existing.id,
        }],
        type: 'MERGE',
      };
    }

    // ── Opposite side → Close/Flip ──
    const closeSize = Math.min(existing.size, size);
    const pnl = (currentPrice - existing.entryPrice) * (existing.side === 'LONG' ? 1 : -1) * (closeSize / existing.entryPrice);
    const marginReturned = closeSize / existing.leverage;

    const closeHistory: TradeHistoryItem = {
      id: `trade_${uniqueId}`,
      pair,
      side: existing.side,
      entryPrice: existing.entryPrice,
      exitPrice: currentPrice,
      size: closeSize,
      pnl,
      timestamp: Date.now(),
      action: 'CLOSE',
    };

    if (size < existing.size) {
      // Partial close
      return {
        success: true,
        updatedPosition: { ...existing, size: existing.size - size },
        newOrders: [],
        cancelledOrderIds: [],
        balanceDelta: marginReturned + pnl,
        realizedPnl: pnl,
        tradeHistory: [closeHistory],
        type: 'PARTIAL_CLOSE',
      };
    }

    if (size === existing.size) {
      // Full close
      return {
        success: true,
        closedPositionId: existing.id,
        newOrders: [],
        cancelledOrderIds: [`__clear_position_${existing.id}`],
        balanceDelta: marginReturned + pnl,
        realizedPnl: pnl,
        tradeHistory: [closeHistory],
        type: 'FULL_CLOSE',
      };
    }

    // Flip
    const remainingSize = size - existing.size;
    const newMarginRequired = remainingSize / leverage;
    const netBalance = marginReturned + pnl;
    
    if (buyingPower + netBalance < newMarginRequired) {
      return this._errorResult('Insufficient buying power for position flip');
    }

    const newLiqPrice = this.calculateLiquidationPrice(side, currentPrice, leverage, marginMode);
    const flippedPosition: Position = {
      id: `pos_${uniqueId}`,
      pair,
      side,
      entryPrice: currentPrice,
      size: remainingSize,
      leverage,
      marginMode,
      liquidationPrice: newLiqPrice,
      takeProfit,
      stopLoss,
      timestamp: Date.now(),
    };

    const flipHistory: TradeHistoryItem = {
      id: `trade_flip_${uniqueId}`,
      pair,
      side,
      entryPrice: currentPrice,
      exitPrice: 0,
      size: remainingSize,
      pnl: 0,
      timestamp: Date.now(),
      action: 'OPEN',
      positionId: flippedPosition.id,
    };

    const tpSlOrders = this._createTpSlOrders(flippedPosition.id, pair, side, remainingSize, leverage, takeProfit, stopLoss, uniqueId);

    return {
      success: true,
      closedPositionId: existing.id,
      flippedPosition,
      newOrders: tpSlOrders,
      cancelledOrderIds: [`__clear_position_${existing.id}`],
      balanceDelta: netBalance - newMarginRequired,
      realizedPnl: pnl,
      tradeHistory: [closeHistory, flipHistory],
      type: 'FLIP',
    };
  }

  // ─── Private: Open New Position ─────────────────────────────
  private _openNewPosition(
    params: PlaceOrderParams,
    currentPrice: number,
    buyingPower: number,
    uniqueId: string
  ): OrderResult {
    const { pair, side, size, leverage, marginMode, takeProfit, stopLoss } = params;
    const marginRequired = size / leverage;

    if (buyingPower < marginRequired) {
      return this._errorResult('Insufficient buying power');
    }

    const liqPrice = this.calculateLiquidationPrice(side, currentPrice, leverage, marginMode);
    const newPos: Position = {
      id: `pos_${uniqueId}`,
      pair,
      side,
      entryPrice: currentPrice,
      size,
      leverage,
      marginMode,
      liquidationPrice: liqPrice,
      takeProfit,
      stopLoss,
      timestamp: Date.now(),
    };

    const tpSlOrders = this._createTpSlOrders(newPos.id, pair, side, size, leverage, takeProfit, stopLoss, uniqueId);

    return {
      success: true,
      newPosition: newPos,
      newOrders: tpSlOrders,
      cancelledOrderIds: [],
      balanceDelta: -marginRequired,
      realizedPnl: 0,
      tradeHistory: [{
        id: `trade_${uniqueId}`,
        pair,
        side,
        entryPrice: currentPrice,
        exitPrice: 0,
        size,
        pnl: 0,
        timestamp: Date.now(),
        action: 'OPEN',
        positionId: newPos.id,
      }],
      type: 'NEW',
    };
  }

  // ─── Private: Create TP/SL Orders ──────────────────────────
  private _createTpSlOrders(
    positionId: string,
    pair: string,
    side: 'LONG' | 'SHORT',
    size: number,
    leverage: number,
    tp?: number,
    sl?: number,
    uniqueId?: string
  ): OpenOrder[] {
    const orders: OpenOrder[] = [];
    const closeSide = side === 'LONG' ? 'SHORT' : 'LONG';
    const uid = uniqueId || uuidv4();

    if (tp && tp > 0) {
      orders.push({
        id: `ord_tp_${positionId}_${uid}`,
        pair,
        side: closeSide,
        type: 'TAKE_PROFIT',
        price: tp,
        size,
        leverage,
        timestamp: Date.now(),
        relatedPositionId: positionId,
      });
    }

    if (sl && sl > 0) {
      orders.push({
        id: `ord_sl_${positionId}_${uid}`,
        pair,
        side: closeSide,
        type: 'STOP_LOSS',
        price: sl,
        size,
        leverage,
        timestamp: Date.now(),
        relatedPositionId: positionId,
      });
    }

    return orders;
  }

  // ─── Private: Error Result ──────────────────────────────────
  private _errorResult(error: string): OrderResult {
    return {
      success: false,
      error,
      newOrders: [],
      cancelledOrderIds: [],
      balanceDelta: 0,
      realizedPnl: 0,
      tradeHistory: [],
      type: 'NEW',
    };
  }
}

// Singleton export
export const orderEngine = new OrderEngine();
