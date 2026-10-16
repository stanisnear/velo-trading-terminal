import { parseAbiItem } from 'viem';

const transfer = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
// Catch up recent activity independently of the sender's browser. The backend
// verifies each receipt and inserts idempotently; a failed chunk never advances.
export async function reconcileIncomingTransfers({ client, token, address, userId, record, storage = globalThis.localStorage, isActive = () => true }) {
  if (client.chain?.id !== 84532) throw new Error('Transfer reconciliation requires Base Sepolia.');
  const head = await client.getBlockNumber() - 2n;
  const key = `velo_transfer_cursor_84532_${userId}_${address.toLowerCase()}`;
  let saved;
  try { saved = storage?.getItem(key); } catch {}
  const oldest = head > 20000n ? head - 20000n : 0n;
  let from = saved && /^\d+$/.test(saved) ? BigInt(saved) : oldest;
  if (from < oldest || from > head) from = oldest;
  let inserted = 0;
  while (from <= head && isActive()) {
    const to = from + 1999n > head ? head : from + 1999n;
    const logs = await client.getLogs({ address: token, event: transfer, args: { to: address }, fromBlock: from, toBlock: to, strict: true });
    const hashes = [...new Set(logs.filter(log => !log.removed && log.args.value > 0n).map(log => log.transactionHash))];
    for (const hash of hashes) {
      if (!isActive()) return inserted;
      await record(hash);
      inserted++;
    }
    if (!isActive()) return inserted;
    // Overlap the last block on the next scan; receipt writes are idempotent.
    try { storage?.setItem(key, to.toString()); } catch {}
    from = to + 1n;
  }
  return inserted;
}
