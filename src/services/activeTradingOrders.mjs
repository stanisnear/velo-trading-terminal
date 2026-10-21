export function activeTradingOrders(conditionalOrders, positions, contract) {
  const entries = conditionalOrders.map(order => ({
    id: `velo_ord_${order.orderId}`, pair: order.pair.replace('-', '/'), side: order.isLong ? 'LONG' : 'SHORT',
    type: order.triggerKind, price: order.triggerPrice, size: order.collateralUSDC * order.leverage,
    leverage: order.leverage, timestamp: order.createdAt * 1000, onChain: true, onChainContract: contract,
  }));
  const protection = positions.flatMap(position => ['takeProfit', 'stopLoss'].flatMap(field => {
    const price = position[field];
    if (!(price > 0)) return [];
    return [{ id: `velo_trigger_${position.tradeId}_${field}`, pair: position.pair.replace('-', '/'),
      side: position.isLong ? 'SHORT' : 'LONG', type: field === 'takeProfit' ? 'TAKE_PROFIT' : 'STOP_LOSS', price,
      size: position.notionalUSDC, leverage: position.leverage, timestamp: position.openedAt * 1000,
      relatedPositionId: `velo_${position.tradeId}`, onChainTradeId: String(position.tradeId),
      onChain: true, onChainContract: contract }];
  }));
  return [...entries, ...protection];
}

export function protectionAfterCancellation(order, position, contract) {
  if (!order.onChain || !position?.onChain || !position.onChainTradeId
    || order.onChainContract?.toLowerCase() !== contract.toLowerCase()
    || position.onChainContract?.toLowerCase() !== contract.toLowerCase()
    || order.relatedPositionId !== position.id) throw new Error('Refresh this position before changing its protection.');
  if (!['TAKE_PROFIT', 'STOP_LOSS'].includes(order.type)) throw new Error('Not a position protection order.');
  return { tradeId: BigInt(position.onChainTradeId), takeProfit: order.type === 'TAKE_PROFIT' ? 0 : position.takeProfit || 0,
    stopLoss: order.type === 'STOP_LOSS' ? 0 : position.stopLoss || 0 };
}
