import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicClient, createWalletClient, keccak256 } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { baseSepoliaTransport, resilientRequest, submittedTransactionHash, transactionError, pendingTransaction, clearPendingTransaction, recoverPendingTransaction, checkLegacyTransaction } from '../src/services/baseTransport.mjs';

test('legacy reset requires both nodes to have no known hash and no queued nonce', async () => {
  const address = '0x' + '78'.repeat(20), hash = '0x' + '56'.repeat(32);
  const empty = async ({ method }) => method === 'eth_getTransactionCount' ? '0x2' : null;
  await checkLegacyTransaction(address, hash, [empty, empty]);
  await assert.rejects(checkLegacyTransaction(address, hash, [empty, async () => { throw networkError(); }]));
  await assert.rejects(checkLegacyTransaction(address, hash, [empty, async ({ method, params }) => method === 'eth_getTransactionCount' ? (params[1] === 'pending' ? '0x3' : '0x2') : null]), /queued/);
  await assert.rejects(checkLegacyTransaction(address, hash, [empty, async () => ({ hash })]), /known/);
});

const networkError = () => Object.assign(new Error('HTTP request failed.'), { name: 'HttpRequestError' });
test('RPC outage falls back once for reads, with the identical request', async () => {
  const calls = []; const request = { method: 'eth_call', params: [{ to: '0x01', data: '0x02' }, '0x1234'] };
  const rpc = resilientRequest(async a => { calls.push(a); throw networkError(); }, async a => { calls.push(a); return '0xff'; });
  assert.equal(await rpc(request), '0xff'); assert.deepEqual(calls, [request, request]);
});
test('contract reverts and wallet rejection never fail over', async () => {
  let backups = 0;
  for (const method of ['eth_call', 'eth_sendTransaction']) {
    const original = Object.assign(new Error('execution reverted'), { code: 3 });
    await assert.rejects(resilientRequest(async () => { throw original; }, async () => backups++)({ method }), e => e === original);
  }
  assert.equal(backups, 0);
});
test('lost responses from both providers preserve the exact signed hash', async () => {
  let broadcasts = 0, backups = 0; const raw = '0x1234';
  const rpc = resilientRequest(async () => { broadcasts++; throw networkError(); }, async () => { backups++; throw networkError(); });
  await assert.rejects(rpc({ method: 'eth_sendRawTransaction', params: [raw] }), error => {
    const wrapped = new Error('Contract call failed', { cause: new Error('Send failed', { cause: error }) });
    assert.equal(submittedTransactionHash(wrapped), keccak256(raw));
    const safe = transactionError(wrapped);
    assert.equal(safe.txHash, keccak256(raw)); assert.match(safe.message, /Do not submit/);
    return true;
  });
  assert.equal(broadcasts, 1); assert.equal(backups, 1);
});
test('broadcast failover reuses identical signed bytes, never signs a second action', async () => {
  const raw = '0x1234'; const request = { method: 'eth_sendRawTransaction', params: [raw] };
  const seen = [];
  const rpc = resilientRequest(async a => { seen.push(a); throw networkError(); }, async a => { seen.push(a); return keccak256(raw); });
  assert.equal(await rpc(request), keccak256(raw));
  assert.deepEqual(seen, [request, request]);
});
test('a null receipt at one node is checked against the other node', async () => {
  const receipt = { status: '0x1' };
  const rpc = resilientRequest(async () => null, async () => receipt);
  assert.equal(await rpc({ method: 'eth_getTransactionReceipt', params: ['0x01'] }), receipt);
});
test('an unavailable backup cannot turn a healthy pending receipt into primary failure', async () => {
  const calls = [];
  const rpc = resilientRequest(async ({ method }) => { calls.push('primary'); return method === 'eth_getTransactionReceipt' ? null : '0x10'; }, async () => { calls.push('backup'); throw networkError(); });
  assert.equal(await rpc({ method: 'eth_getTransactionReceipt', params: ['0x01'] }), null);
  assert.equal(await rpc({ method: 'eth_blockNumber' }), '0x10');
  assert.deepEqual(calls, ['primary', 'backup', 'primary']);
});
test('unknown and wallet signing methods never fail over on outage', async () => {
  let backups = 0;
  for (const method of ['eth_sendTransaction', 'personal_sign', 'wallet_sendCalls']) {
    await assert.rejects(resilientRequest(async () => { throw networkError(); }, async () => backups++)({ method }));
  }
  assert.equal(backups, 0);
});
test('viem keeps the signed hash through its real error wrappers', async () => {
  const originalFetch = globalThis.fetch; const calls = [];
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body); calls.push({ url, body });
    throw new TypeError('Failed to fetch');
  };
  try {
    const account = privateKeyToAccount('0x' + '01'.repeat(32)); // disposable fixture only
    const wallet = createWalletClient({ account, chain: baseSepolia, transport: baseSepoliaTransport('https://primary.invalid') });
    const tx = { to: account.address, value: 0n, gas: 21000n, nonce: 0, maxFeePerGas: 1000000n, maxPriorityFeePerGas: 1n, chainId: 84532, type: 'eip1559' };
    const raw = await account.signTransaction(tx);
    await assert.rejects(wallet.sendRawTransaction({ serializedTransaction: raw }), e => submittedTransactionHash(e) === keccak256(raw));
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0].body.params, calls[1].body.params);
    calls.length = 0;
    const reader = createPublicClient({ chain: baseSepolia, transport: baseSepoliaTransport('https://primary.invalid') });
    await assert.rejects(reader.getBlockNumber());
    assert.equal(calls.length, 2);
    assert.equal(new URL(calls[1].url).origin, 'https://sepolia.base.org');
  } finally { globalThis.fetch = originalFetch; }
});

const fixture = privateKeyToAccount('0x' + '02'.repeat(32));
const signed = nonce => fixture.signTransaction({ to: fixture.address, value: 0n, gas: 21000n,
  nonce, maxFeePerGas: 1000000n, maxPriorityFeePerGas: 1n, chainId: 84532, type: 'eip1559' });
const notFound = () => { throw Object.assign(new Error('not found'), { name: 'TransactionReceiptNotFoundError' }); };
test('journal persists before broadcast and prevents a different action until confirmed', async () => {
  const raw = await signed(1), hash = keccak256(raw);
  const rpc = resilientRequest(async () => { assert.equal(pendingTransaction(fixture.address).raw, raw); throw networkError(); }, undefined, { journal: true });
  try {
    await assert.rejects(rpc({ method: 'eth_sendRawTransaction', params: [raw] }));
    await assert.rejects(rpc({ method: 'eth_sendRawTransaction', params: [await signed(2)] }), /Recover the previous/);
    const calls = [];
    assert.equal(await recoverPendingTransaction({ getTransactionReceipt: notFound, getTransactionCount: async () => 1,
      sendRawTransaction: async tx => calls.push(tx) }, fixture.address, hash), null);
    assert.deepEqual(calls, [{ serializedTransaction: raw }]);
    const receipt = { status: 'success', transactionHash: hash };
    assert.equal(await recoverPendingTransaction({ getTransactionReceipt: async () => receipt }, fixture.address, hash), receipt);
    assert.equal(pendingTransaction(fixture.address), null);
  } finally { clearPendingTransaction(fixture.address, hash); }
});
test('a rejected recovery never erases an earlier ambiguous broadcast', async () => {
  const raw = await signed(3), hash = keccak256(raw);
  try {
    await assert.rejects(resilientRequest(async () => { throw networkError(); }, undefined, { journal: true })({ method: 'eth_sendRawTransaction', params: [raw] }));
    await assert.rejects(resilientRequest(async () => { throw new Error('nonce too low'); }, undefined, { journal: true })({ method: 'eth_sendRawTransaction', params: [raw] }));
    assert.equal(pendingTransaction(fixture.address).hash, hash);
    const result = await recoverPendingTransaction({ getTransactionReceipt: notFound, getTransactionCount: async () => 4 }, fixture.address, hash);
    assert.equal(result.status, 'replaced');
    assert.equal(pendingTransaction(fixture.address), null);
  } finally { clearPendingTransaction(fixture.address, hash); }
});
test('RPC failure during recovery never removes the submission guard', async () => {
  const raw = await signed(4), hash = keccak256(raw);
  try {
    await resilientRequest(async () => hash, undefined, { journal: true })({ method: 'eth_sendRawTransaction', params: [raw] });
    await assert.rejects(recoverPendingTransaction({ getTransactionReceipt: async () => { throw networkError(); } }, fixture.address, hash));
    assert.equal(pendingTransaction(fixture.address).hash, hash);
  } finally { clearPendingTransaction(fixture.address, hash); }
});
