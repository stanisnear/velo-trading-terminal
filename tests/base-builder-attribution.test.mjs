import test from 'node:test';
import assert from 'node:assert/strict';
import { createWalletClient, custom, decodeFunctionData, encodeFunctionData, parseTransaction } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia, mainnet } from 'viem/chains';
import { Attribution } from 'ox/erc8021';
import { BUILDER_CODE, builderAttribution } from '../src/services/baseBuilderAttribution.mjs';

const abi = [{ type:'function', name:'transfer', stateMutability:'nonpayable', inputs:[{type:'address'},{type:'uint256'}], outputs:[{type:'bool'}] }];
const address = '0x' + '12'.repeat(20);
const hash = '0x' + 'ab'.repeat(32);

test('registered Velo code encodes and round-trips using the official ERC-8021 codec', () => {
  assert.equal(BUILDER_CODE, 'bc_s0k82w2v');
  for (const chain of [8453,84532]) {
    const { dataSuffix } = builderAttribution(chain);
    assert.deepEqual(Attribution.fromData(dataSuffix).codes, [BUILDER_CODE]);
    assert.ok(dataSuffix.endsWith('80218021802180218021802180218021'));
  }
  for (const chain of [undefined,1,10,42161]) assert.deepEqual(builderAttribution(chain), {});
  assert.deepEqual(builderAttribution(84532,''), {});
  assert.throws(() => builderAttribution(8453,'other,code'), /Invalid/);
});

test('injected wallet contract calls append once without changing ABI arguments', async () => {
  let sent;
  const wallet = createWalletClient({ account:address, chain:baseSepolia, transport:custom({
    request:async ({ method,params }) => {
      if (method === 'eth_chainId') return '0x14a34';
      if (method === 'eth_sendTransaction') { sent=params[0]; return hash; }
      throw new Error(method);
    }
  }) });
  await wallet.writeContract({ ...builderAttribution(wallet.chain.id), address, abi, functionName:'transfer', args:[address,123n] });
  const call = encodeFunctionData({ abi, functionName:'transfer', args:[address,123n] });
  assert.equal(sent.data, call + builderAttribution(84532).dataSuffix.slice(2));
  assert.deepEqual(decodeFunctionData({ abi, data:sent.data }).args,[address,123n]);
});

test('local burner signs attributed calldata before raw broadcast and preserves the transaction hash', async () => {
  let raw;
  const wallet = createWalletClient({ account:privateKeyToAccount('0x'+'11'.repeat(32)), chain:baseSepolia, transport:custom({
    request:async ({ method,params }) => {
      if (method === 'eth_sendRawTransaction') { raw=params[0]; return hash; }
      if (method === 'eth_chainId') return '0x14a34';
      throw new Error(method);
    }
  }) });
  await wallet.writeContract({ ...builderAttribution(wallet.chain.id), address, abi, functionName:'transfer', args:[address,123n], nonce:0, gas:100000n, gasPrice:1000000000n });
  const tx = parseTransaction(raw);
  assert.deepEqual(Attribution.fromData(tx.data).codes,[BUILDER_CODE]);
  assert.deepEqual(decodeFunctionData({ abi, data:tx.data }).args,[address,123n]);
  assert.equal(tx.chainId,84532);
});

test('cross-chain sends remain byte-for-byte unchanged outside Base', async () => {
  let sent;
  const wallet = createWalletClient({ account:address, chain:mainnet, transport:custom({
    request:async ({ method,params }) => {
      if (method === 'eth_chainId') return '0x1';
      if (method === 'eth_sendTransaction') { sent=params[0]; return hash; }
      throw new Error(method);
    }
  }) });
  await wallet.writeContract({ ...builderAttribution(wallet.chain.id), address, abi, functionName:'transfer', args:[address,123n] });
  assert.equal(sent.data,encodeFunctionData({ abi, functionName:'transfer', args:[address,123n] }));
});
