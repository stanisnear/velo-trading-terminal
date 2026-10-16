import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicClient, createWalletClient, keccak256 } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { baseSepoliaTransport, resilientRequest, submittedTransactionHash, transactionError } from '../src/services/baseTransport.mjs';

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
test('lost raw broadcast response preserves the exact hash without another submission', async () => {
  let broadcasts = 0, backups = 0; const raw = '0x1234';
  const rpc = resilientRequest(async () => { broadcasts++; throw networkError(); }, async () => backups++);
  await assert.rejects(rpc({ method: 'eth_sendRawTransaction', params: [raw] }), error => {
    const wrapped = new Error('Contract call failed', { cause: new Error('Send failed', { cause: error }) });
    assert.equal(submittedTransactionHash(wrapped), keccak256(raw));
    const safe = transactionError(wrapped);
    assert.equal(safe.txHash, keccak256(raw)); assert.match(safe.message, /Do not submit/);
    return true;
  });
  assert.equal(broadcasts, 1); assert.equal(backups, 0);
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
    assert.equal(calls.length, 1);
    calls.length = 0;
    const reader = createPublicClient({ chain: baseSepolia, transport: baseSepoliaTransport('https://primary.invalid') });
    await assert.rejects(reader.getBlockNumber());
    assert.equal(calls.length, 2);
    assert.equal(new URL(calls[1].url).origin, 'https://sepolia.base.org');
  } finally { globalThis.fetch = originalFetch; }
});
