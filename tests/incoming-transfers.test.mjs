import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileIncomingTransfers } from '../src/services/incomingTransfers.mjs';

test('incoming recovery advances only after verified receipts and retries a failed chunk', async () => {
  const state = new Map(), recorded = [], ranges = [];
  const storage = { getItem: k => state.get(k), setItem: (k,v) => state.set(k,v) };
  const client = { chain: { id: 84532 }, getBlockNumber: async () => 4002n,
    getLogs: async args => { ranges.push(args); return [{ transactionHash: '0xabc', args: { value: 100n } }]; } };
  const args = { client, token: '0x01', address: '0x02', userId: 'fixture', storage };
  await assert.rejects(reconcileIncomingTransfers({ ...args, record: async () => { throw Error('backend offline'); } }));
  assert.equal(state.size, 0);
  await reconcileIncomingTransfers({ ...args, record: async hash => recorded.push(hash) });
  assert.equal([...state.values()][0], '4000');
  assert.equal(ranges[0].fromBlock, ranges[1].fromBlock);
  assert(ranges.every(r => r.toBlock-r.fromBlock < 2000n && r.toBlock <= 4000n));
  assert.equal(recorded.length, 3);
});

test('wrong chain and cancelled identity never record incoming activity', async () => {
  let records = 0;
  const args = { token: 'x', address: 'y', userId: 'z', record: async () => records++, storage: null };
  await assert.rejects(reconcileIncomingTransfers({ ...args, client: { chain: { id: 1 } } }), /Base Sepolia/);
  await reconcileIncomingTransfers({ ...args, client: { chain: { id: 84532 }, getBlockNumber: async () => 12n }, isActive: () => false });
  assert.equal(records, 0);
});
