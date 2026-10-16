import test from 'node:test';
import assert from 'node:assert/strict';
import { readPendingTransfer, savePendingTransfer, clearPendingTransfer } from '../src/services/transferOutbox.mjs';

test('pending transfers survive reopen and remain scoped to their sender', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const sender = '0x'+'12'.repeat(20), other = '0x'+'34'.repeat(20);
  const transfer = { txHash: '0x'+'56'.repeat(32), recipientAddress: other, amount: 1 };
  savePendingTransfer(storage, sender, transfer);
  assert.deepEqual(readPendingTransfer(storage, sender), transfer);
  assert.equal(readPendingTransfer(storage, other), null);
  clearPendingTransfer(storage, sender, '0x'+'78'.repeat(32));
  assert.deepEqual(readPendingTransfer(storage, sender), transfer);
  clearPendingTransfer(storage, sender, transfer.txHash);
  assert.equal(readPendingTransfer(storage, sender), null);
});

test('invalid stored transfer metadata is not restored', () => {
  for (const value of ['broken', '{}', '{"txHash":"0x1234"}']) {
    assert.equal(readPendingTransfer({ getItem: () => value }, '0x1234'), null);
  }
});
