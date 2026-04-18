import { Position, OpenOrder, MarginMode, TradeHistoryItem } from '../utils/types';

const MAINTENANCE_MARGIN = 0.005;

export interface PlaceOrderParams {
  pair: string;
  side: 'LONG' | 'SHORT';
  size: number;
  leverage: number;
  type: 'MARKET' | 'LIMIT' | 'STOP';
  price?: number;
  marginMode: MarginMode;
  takeProfit?: number;
  stopLoss?: number;
  userId: string;
  currentPrice: number;
  currentBalance: number;
  existingPositions: Position[];
}

export interface OrderResult {
  success: boolean;
  error?: string;
  position?: Position;
  openOrder?: OpenOrder;
  balanceChange: number;
}

export interface CloseResult {
  success: boolean;
  error?: string;
  pnl: number;
  marginReturned: number;
  tradeHistoryItem: TradeHistoryItem;
}

export interface FillEvent {
  type: 'TP' | 'SL' | 'LIMIT' | 'STOP' | 'LIQUIDATION';
  positionId?: string;
  orderId?: string;
  fillPrice: number;
  pnl?: number;
  marginReturned?: number;
}

export function calculateLiquidationPrice(
  side: 'LONG' | 'SHORT',
  entryPrice: number,
  leverage: number
): number {
  if (side === 'LONG') {
    return entryPrice * (1 - (1 / leverage) + MAINTENANCE_MARGIN);
  } else {
    return entryPrice * (1 + (1 / leverage) - MAINTENANCE_MARGIN);
  }
}

export function calculateUnrealizedPnL(position: Position, currentPrice: number): number {
  const priceDiff = currentPrice - position.entryPrice;
  const direction = position.side === 'LONG' ? 1 : -1;
  const contracts = position.size / position.entryPrice;
  return priceDiff * direction * contracts;
}

export function calculateBuyingPower(
  balance: number,
  positions: Position[],
  marginMode: MarginMode,
  marketPrices: Record<string, number>
): number {
  if (marginMode === 'CROSS') {
    const crossPnl = positions
      .filter(p => p.marginMode === 'CROSS' && !p.isBotTrade && !p.isCopyTrade)
      .reduce((acc, p) => {
        const price = marketPrices[p.pair] || p.entryPrice;
        return acc + calculateUnrealizedPnL(p, price);
      }, 0);
    return Math.max(0, balance + crossPnl);
  }
  return Math.max(0, balance);
}

export function placeOrder(params: PlaceOrderParams): OrderResult {
  const {
    pair, side, size, leverage, type, price, marginMode,
    takeProfit, stopLoss, currentPrice, currentBalance, existingPositions
  } = params;

  const fillPrice = type === 'MARKET' ? currentPrice : (price || currentPrice);
  const marginRequired = size / leverage;

  // Cross margin buying power includes unrealised PnL of all cross positions
  const crossPnl = existingPositions
    .filter(p => p.marginMode === 'CROSS' && !p.isBotTrade && !p.isCopyTrade)
    .reduce((acc, p) => acc + calculateUnrealizedPnL(p, currentPrice), 0);
  const buyingPower = marginMode === 'CROSS'
    ? Math.max(0, currentBalance + crossPnl)
    : currentBalance;

  // Check for existing position on same pair
  const existing = existingPositions.find(p => p.pair === pair && !p.isBotTrade && !p.isCopyTrade);

  if (existing) {
    if (existing.side === side) {
      // Adding to position — check margin for the delta
      const additionalMargin = size / leverage;
      if (buyingPower < additionalMargin) {
        return { success: false, error: 'Insufficient buying power to add to position', balanceChange: 0 };
      }
      // Return the merged position via balanceChange; actual merge happens in App state
      return { success: true, balanceChange: -additionalMargin };
    } else {
      // Opposite side — this is a close (full or partial) or flip
      // Return 0 balanceChange; close logic in closePosition
      return { success: true, balanceChange: 0 };
    }
  }

  // New position
  if (buyingPower < marginRequired) {
    return { success: false, error: `Insufficient balance. Required: $${marginRequired.toFixed(2)}, Available: $${buyingPower.toFixed(2)}`, balanceChange: 0 };
  }

  if (type === 'MARKET') {
    const liqPrice = calculateLiquidationPrice(side, fillPrice, leverage);
    const newPosition: Position = {
      id: `pos_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      pair,
      side,
      entryPrice: fillPrice,
      size,
      leverage,
      marginMode,
      liquidationPrice: Math.max(0, liqPrice),
      takeProfit,
      stopLoss,
      timestamp: Date.now(),
    };
    return { success: true, position: newPosition, balanceChange: -marginRequired };
  }

  // LIMIT or STOP — queue as open order
  const openOrder: OpenOrder = {
    id: `ord_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    pair,
    side,
    type: type as 'LIMIT' | 'STOP',
    price: price || currentPrice,
    size,
    leverage,
    timestamp: Date.now(),
  };

  return { success: true, openOrder, balanceChange: -marginRequired };
}

export function closePosition(
  position: Position,
  exitPrice: number,
  sizeToClose?: number
): CloseResult {
  const closeSize = sizeToClose || position.size;
  const fraction = closeSize / position.size;
  const pnl = calculateUnrealizedPnL(
    { ...position, size: closeSize },
    exitPrice
  );
  const marginReturned = (position.size / position.leverage) * fraction;

  const tradeHistoryItem: TradeHistoryItem = {
    id: `th_${Date.now()}`,
    pair: position.pair,
    side: position.side,
    entryPrice: position.entryPrice,
    exitPrice,
    size: closeSize,
    pnl,
    timestamp: Date.now(),
    botId: position.botId,
    copyTraderId: position.copyTraderId,
  };

  return { success: true, pnl, marginReturned, tradeHistoryItem };
}

export function processPriceTick(
  pair: string,
  currentPrice: number,
  positions: Position[],
  openOrders: OpenOrder[]
): FillEvent[] {
  const events: FillEvent[] = [];

  // Check liquidations
  positions
    .filter(p => p.pair === pair)
    .forEach(p => {
      const isLiquidated =
        p.side === 'LONG'
          ? currentPrice <= p.liquidationPrice
          : currentPrice >= p.liquidationPrice;

      if (isLiquidated) {
        events.push({
          type: 'LIQUIDATION',
          positionId: p.id,
          fillPrice: p.liquidationPrice,
          pnl: -(p.size / p.leverage),
          marginReturned: 0,
        });
      }
    });

  // Check TP/SL on positions
  positions
    .filter(p => p.pair === pair)
    .forEach(p => {
      if (p.takeProfit) {
        const tpHit =
          p.side === 'LONG'
            ? currentPrice >= p.takeProfit
            : currentPrice <= p.takeProfit;
        if (tpHit) {
          const result = closePosition(p, p.takeProfit);
          events.push({ type: 'TP', positionId: p.id, fillPrice: p.takeProfit, pnl: result.pnl, marginReturned: result.marginReturned });
        }
      }
      if (p.stopLoss) {
        const slHit =
          p.side === 'LONG'
            ? currentPrice <= p.stopLoss
            : currentPrice >= p.stopLoss;
        if (slHit) {
          const result = closePosition(p, p.stopLoss);
          events.push({ type: 'SL', positionId: p.id, fillPrice: p.stopLoss, pnl: result.pnl, marginReturned: result.marginReturned });
        }
      }
    });

  // Check pending limit/stop orders
  openOrders
    .filter(o => o.pair === pair)
    .forEach(o => {
      let filled = false;
      if (o.type === 'LIMIT') {
        filled = o.side === 'LONG' ? currentPrice <= o.price : currentPrice >= o.price;
      } else if (o.type === 'STOP') {
        filled = o.side === 'LONG' ? currentPrice >= o.price : currentPrice <= o.price;
      }
      if (filled) {
        events.push({ type: o.type as 'LIMIT' | 'STOP', orderId: o.id, fillPrice: o.price });
      }
    });

  return events;
}
