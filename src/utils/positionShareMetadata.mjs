const txHash = value => typeof value === 'string' && /^0x[0-9a-f]{64}$/i.test(value) ? value : undefined;
export function positionShareMetadata(position, history = []) {
  const id = String(position.onChainTradeId ?? position.positionId ?? position.id ?? '').replace(/^velo_/, '');
  const opened = history.find(row => row.action === 'OPEN' && String(row.positionId || '').replace(/^velo_/, '') === id);
  const closed = position.action === 'CLOSE' || position.action === 'LIQUIDATION';
  const urlHash = typeof position.orderlyOrderUrl === 'string' ? position.orderlyOrderUrl.match(/^https:\/\/sepolia\.basescan\.org\/tx\/(0x[0-9a-f]{64})$/i)?.[1] : undefined;
  return {
    openTxHash: txHash(position.openTxHash) || txHash(urlHash) || txHash(opened?.txHash),
    openedAt: position.openedAt || (closed ? opened?.timestamp : position.timestamp),
    ...(closed && position.timestamp ? {closedAt:position.timestamp} : {}),
  };
}
