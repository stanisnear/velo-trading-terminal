import { createPublicClient, createWalletClient, keccak256, parseTransaction } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { RuntimeError, httpsSetting } from './runtime.js';
import { baseSepoliaTransport } from '../../../src/services/baseTransport.mjs';

export function chainClients(getEnv, needsSigner = false, sponsorOnly = false) {
  const rpc = httpsSetting(getEnv('VITE_BASE_SEPOLIA_RPC_URL') || getEnv('BASE_SEPOLIA_RPC_URL'), 'RPC');
  const transport = baseSepoliaTransport(rpc.href);
  const publicClient = createPublicClient({ chain: baseSepolia, transport });
  if (!needsSigner) return { publicClient };
  const sponsorKey = getEnv('VELO_SPONSOR_PRIVATE_KEY');
  const confirmedSharedSponsor = sponsorOnly && !sponsorKey && getEnv('VELO_SPONSOR_USE_KEEPER_KEY') === 'true';
  let key = sponsorKey || ((!sponsorOnly || confirmedSharedSponsor) && getEnv('PRIVATE_KEY'));
  if (!key) throw new RuntimeError('SIGNER_NOT_CONFIGURED');
  if (!key.startsWith('0x')) key = `0x${key}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new RuntimeError('INVALID_SIGNER');
  const account = privateKeyToAccount(key);
  if (confirmedSharedSponsor && account.address.toLowerCase() !== getEnv('VELO_SPONSOR_EXPECTED_ADDRESS')?.toLowerCase()) throw new RuntimeError('SPONSOR_WALLET_MISMATCH');
  const walletClient = createWalletClient({ account, chain: baseSepolia, transport });
  return { publicClient, walletClient, account };
}

// The same durable lock covers all keepers AND sponsor-eth. Signed bytes are
// persisted before broadcast so a timeout cannot cause a fresh conflicting nonce.
export async function withSigner({ db, publicClient, walletClient, account }, action) {
  const common = { wallet: account.address.toLowerCase(), owner: crypto.randomUUID() };
  const lease = await db('claim_signer', common);
  if (lease.busy) throw new RuntimeError('SIGNER_BUSY');
  let nonceFloor = 0;
  const confirm = async (hash, raw) => {
    let receipt;
    try { receipt = await publicClient.getTransactionReceipt({ hash }); } catch { /* not mined yet */ }
    if (!receipt) {
      // A confirmed checkpoint proves a reused nonce can never execute. Do not
      // leave that failed intent permanently blocking every future transaction.
      if (lease.lastHash && lease.lastStatus !== 'replaced') {
        const previous = await publicClient.getTransaction({ hash:lease.lastHash });
        if (previous.blockNumber !== null && previous.hash.toLowerCase() !== hash.toLowerCase()
          && previous.nonce === parseTransaction(raw).nonce) {
          await db('clear_tx',{...common,hash,status:'replaced'});
          throw new RuntimeError('TRANSACTION_REPLACED');
        }
      }
      try { await publicClient.sendRawTransaction({ serializedTransaction: raw }); }
      catch { /* could already be accepted; confirm the known hash below */ }
      try { receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 16000, pollingInterval: 1000 }); }
      catch { throw new RuntimeError('TRANSACTION_PENDING'); }
    }
    if (receipt.transactionHash?.toLowerCase() !== hash.toLowerCase()) throw new RuntimeError('TRANSACTION_REPLACED');
    if (!['success', 'reverted'].includes(receipt.status)) throw new RuntimeError('INVALID_RECEIPT');
    await db('clear_tx', { ...common, hash, status: receipt.status });
    return { hash, status: receipt.status };
  };
  try {
    if (await publicClient.getChainId() !== 84532) throw new RuntimeError('WRONG_CHAIN');
    if (lease.pendingHash) {
      const recoveredNonce = parseTransaction(lease.pendingRaw).nonce;
      await confirm(lease.pendingHash, lease.pendingRaw);
      nonceFloor = recoveredNonce + 1;
    }
    if (lease.lastHash && lease.lastStatus !== 'replaced') {
      const previous = await publicClient.getTransaction({hash:lease.lastHash});
      if(previous.blockNumber===null)throw new RuntimeError('CHECKPOINT_NOT_CONFIRMED');
      nonceFloor=Math.max(nonceFloor, previous.nonce+1);
    }
    // The callback must recheck eligibility under this lock, after recovery.
    return await action(async transaction => {
      const [latest, pending] = await Promise.all([
        publicClient.getTransactionCount({ address: account.address, blockTag: 'latest' }),
        publicClient.getTransactionCount({ address: account.address, blockTag: 'pending' }),
      ]);
      if (latest !== pending) throw new RuntimeError('EXTERNAL_PENDING_TRANSACTION');
      if (pending < nonceFloor) throw new RuntimeError('RPC_BEHIND_CONFIRMED_NONCE');
      const request = await walletClient.prepareTransactionRequest({ ...transaction, account, nonce: pending, chain: baseSepolia });
      if(request.nonce!==pending)throw new RuntimeError('PREPARED_NONCE_MISMATCH');
      const raw = await account.signTransaction(request);
      const hash = keccak256(raw);
      await db('record_tx', { ...common, hash, raw });
      // Never return raw signed bytes or private keys to clients/logs.
      const result=await confirm(hash, raw);
      nonceFloor=pending+1;
      return result;
    });
  } finally {
    await db('release_signer', common);
  }
}
