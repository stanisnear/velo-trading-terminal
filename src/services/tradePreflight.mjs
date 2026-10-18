// Independent reads run together; funding is only attempted after registry checks.
export async function readTradingPreflight(client, address, abi, pairIndex, trader) {
  const [feedId, tradable, gasBalance] = await Promise.all([
    client.readContract({ address, abi, functionName: 'pairFeedId', args: [pairIndex] }),
    client.readContract({ address, abi, functionName: 'pairTradable', args: [pairIndex] }),
    client.getBalance({ address: trader }),
  ]);
  return { feedId, tradable, gasBalance };
}
