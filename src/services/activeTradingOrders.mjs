import { V4_MAX_TP_PRICE_MOVE, validateProtectionPrices } from './tradeFormValidation.mjs';
export function activeTradingOrders(conditionalOrders, positions, contract) {
  const entries = conditionalOrders.map(order => ({
    id: `velo_ord_${order.orderId}`, pair: order.pair.replace('-', '/'), side: order.isLong ? 'LONG' : 'SHORT',
    type: order.triggerKind, price: order.triggerPrice, size: order.collateralUSDC * order.leverage,
    leverage: order.leverage, timestamp: order.createdAt * 1000, onChain: true, onChainContract: contract,
  }));
  const protection = positions.flatMap(position => ['takeProfit', 'stopLoss'].flatMap(field => {
    const price = position[field];
    if (!(price > 0)) return [];
    const positionSide = position.isLong ? 'LONG' : 'SHORT';
    const validationError = position.entryPrice > 0 ? validateProtectionPrices({ side: positionSide, referencePrice: position.entryPrice, referenceLabel: 'entry price', takeProfit: field === 'takeProfit' ? price : undefined, stopLoss: field === 'stopLoss' ? price : undefined, maxFavorableMove: position.v4 ? V4_MAX_TP_PRICE_MOVE : undefined }) : null;
    return [{ positionSide, validationError: validationError || undefined, id: `velo_trigger_${position.tradeId}_${field}`, pair: position.pair.replace('-', '/'),
      side: position.isLong ? 'SHORT' : 'LONG', type: field === 'takeProfit' ? 'TAKE_PROFIT' : 'STOP_LOSS', price,
      size: position.notionalUSDC, leverage: position.leverage, timestamp: position.openedAt * 1000,
      relatedPositionId: `velo_${position.tradeId}`, onChainTradeId: String(position.tradeId),
      onChain: true, onChainContract: contract }];
  }));
  return [...entries, ...protection];
}

export function protectionCancellation(order, contract) {
  if (!order?.onChain || order.onChainContract?.toLowerCase() !== contract.toLowerCase()
    || !/^[1-9]\d*$/.test(String(order.onChainTradeId))
    || order.relatedPositionId !== `velo_${order.onChainTradeId}`)
    throw new Error('Refresh this position before changing its protection.');
  if (!['TAKE_PROFIT', 'STOP_LOSS'].includes(order.type)) throw new Error('Not a position protection order.');
  return { tradeId: BigInt(order.onChainTradeId), leg: order.type };
}

// A temporarily disconnected wallet account must never become a simulated account.
export function requiresLiveEntry(connectedWallet, profileWallet) {
  return !!(connectedWallet || profileWallet);
}
