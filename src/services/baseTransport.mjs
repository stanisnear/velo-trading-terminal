import { custom, http, keccak256, parseTransaction, recoverTransactionAddress } from 'viem';

// Reads may fail over. Broadcasts may retry only the identical signed bytes:
// the same nonce, signature and hash cannot execute twice.
const READ_METHODS = new Set([
  'eth_chainId', 'eth_blockNumber', 'eth_call', 'eth_estimateGas', 'eth_gasPrice',
  'eth_maxPriorityFeePerGas', 'eth_feeHistory', 'eth_getBalance', 'eth_getCode',
  'eth_getStorageAt', 'eth_getTransactionCount', 'eth_getTransactionReceipt',
  'eth_getTransactionByHash', 'eth_getBlockByNumber', 'eth_getBlockByHash', 'eth_getLogs',
  'eth_fillTransaction',
]);
function causes(error) {
  const seen = new Set(); const result = [];
  for (let e = error; e && !seen.has(e); e = e.cause) { seen.add(e); result.push(e); }
  return result;
}
export function isRpcNetworkError(error) {
  return causes(error).some(e => ['HttpRequestError', 'TimeoutError', 'SocketClosedError', 'WebSocketRequestError'].includes(e.name)
    || (e instanceof TypeError && /fetch|network|load failed/i.test(e.message)));
}
export function submittedTransactionHash(error) {
  return causes(error).find(e => /^0x[0-9a-f]{64}$/i.test(e.txHash || ''))?.txHash || null;
}
export function transactionError(error) {
  const hash = submittedTransactionHash(error);
  if (hash) return Object.assign(new Error(`Transaction ${hash} is awaiting confirmation. Do not submit it again.`), { txHash: hash, cause: error });
  if (isRpcNetworkError(error)) return new Error('Base Sepolia could not be reached. Check your connection and try again. If your wallet already approved a transaction, check its activity first.');
  return error;
}

const journalPrefix = 'velo_tx_journal_84532_';
const memory = new Map();
export function pendingTransaction(address) {
  if (!address) return null;
  const key = journalPrefix + address.toLowerCase();
  try {
    const record = JSON.parse(globalThis.localStorage?.getItem(key) || 'null');
    if (record?.raw && keccak256(record.raw) === record.hash) return record;
  } catch { /* Memory also protects a tab when browser storage is unavailable. */ }
  return memory.get(key) || null;
}
export function clearPendingTransaction(address, hash) {
  if (!address || pendingTransaction(address)?.hash !== hash) return;
  const key = journalPrefix + address.toLowerCase();
  memory.delete(key);
  try { globalThis.localStorage?.removeItem(key); } catch {}
}
async function rememberRaw(raw) {
  const tx = parseTransaction(raw);
  if (tx.chainId !== 84532) throw new Error('Trading transactions must use Base Sepolia.');
  const address = await recoverTransactionAddress({ serializedTransaction: raw });
  const hash = keccak256(raw);
  const existing = pendingTransaction(address);
  if (existing && existing.hash !== hash) {
    throw Object.assign(new Error('Recover the previous transaction before submitting another.'), { txHash: existing.hash });
  }
  const record = existing || { address, hash, raw, nonce: tx.nonce, createdAt: Date.now() };
  const key = journalPrefix + address.toLowerCase();
  memory.set(key, record);
  try { globalThis.localStorage?.setItem(key, JSON.stringify(record)); } catch {}
  return { ...record, isNew: !existing };
}

export async function recoverPendingTransaction(client, address, hash) {
  const record = pendingTransaction(address);
  const target = hash || record?.hash;
  if (!target) return null;
  try {
    const receipt = await client.getTransactionReceipt({ hash: target });
    clearPendingTransaction(address, target);
    return receipt;
  } catch (error) {
    if (isRpcNetworkError(error)) throw error;
    if (error?.name !== 'TransactionReceiptNotFoundError') throw error;
  }
  if (!record || record.hash !== target) return null;
  const latest = await client.getTransactionCount({ address, blockTag: 'latest' });
  if (latest > record.nonce) {
    // A different transaction consumed this nonce. Never report the old action
    // as successful; the caller must refresh the actual contract state.
    clearPendingTransaction(address, target);
    return { status: 'replaced', transactionHash: target };
  }
  await client.sendRawTransaction({ serializedTransaction: record.raw });
  return null;
}

// Only legacy builds lost the signed bytes. An explicit user reset is allowed
// after independent nodes find neither the hash nor queued account nonces.
// This is not cancellation and must never trigger an automatic new order.
export async function checkLegacyTransaction(address, hash, requests) {
  if (pendingTransaction(address)) throw new Error('A signed transaction is recoverable. Check confirmation instead of resetting it.');
  const nodes = requests || [
    http('https://base-sepolia-rpc.publicnode.com', { timeout: 6000, retryCount: 0 })({}).request,
    http('https://sepolia.base.org', { timeout: 6000, retryCount: 0 })({}).request,
  ];
  for (const request of nodes) {
    const receipt = await request({ method: 'eth_getTransactionReceipt', params: [hash] });
    const tx = await request({ method: 'eth_getTransactionByHash', params: [hash] });
    if (receipt || tx) throw new Error('This transaction is known to the network. Wait for confirmation and check its explorer link.');
    const latest = await request({ method: 'eth_getTransactionCount', params: [address, 'latest'] });
    const pending = await request({ method: 'eth_getTransactionCount', params: [address, 'pending'] });
    if (BigInt(latest) !== BigInt(pending)) throw new Error('This wallet still has queued transactions. Resolve them before resetting tracking.');
  }
}

// Exported separately so outage, rejection, and ambiguous submission paths are
// exercised without a real wallet, chain transaction, or oracle request.
export function resilientRequest(primary, backup, { journal = false } = {}) {
  let retryPrimaryAt = 0;
  return async args => {
    const first = backup && Date.now() < retryPrimaryAt ? backup : primary;
    const second = first === primary ? backup : primary;
    const raw = args.method === 'eth_sendRawTransaction' && args.params?.[0];
    const record = raw && journal ? await rememberRaw(raw) : null;
    const hash = raw ? keccak256(raw) : null;
    try {
      const result = await first(args);
      if (result === null && second && ['eth_getTransactionReceipt', 'eth_getTransactionByHash'].includes(args.method)) {
        // A failed secondary lookup does not mean the healthy primary failed.
        // Keep polling the primary instead of switching every read to an outage.
        try { return await second(args); } catch { return null; }
      }
      return result;
    }
    catch (error) {
      if (raw && causes(error).some(e => /already known|known transaction/i.test(e.message || ''))) return hash;
      if (!isRpcNetworkError(error)) {
        // A rejection during recovery cannot invalidate a previously ambiguous
        // broadcast. Only a fresh, definitively rejected attempt can be cleared.
        if (record?.isNew) clearPendingTransaction(record.address, hash);
        throw error;
      }
      if (first === primary) retryPrimaryAt = Date.now() + 30000;
      if (raw) {
        try {
          if (second) return await second(args);
        } catch (backupError) {
          if (causes(backupError).some(e => /already known|known transaction/i.test(e.message || ''))) return hash;
          // Even a definitive rejection at provider B cannot prove provider A
          // did not accept the transaction before losing its response.
        }
        throw Object.assign(new Error('Transaction broadcast is unresolved.'), { txHash: hash, cause: error });
      }
      if (second && READ_METHODS.has(args.method)) return second(args);
      throw error;
    }
  };
}

export function baseSepoliaTransport(primaryUrl = 'https://sepolia.base.org') {
  // Older Pages build settings explicitly pinned this public fallback. Prefer
  // the verified primary without overriding a dedicated operator-supplied RPC.
  if (primaryUrl.replace(/\/$/, '') === 'https://base-sepolia-rpc.publicnode.com') primaryUrl = 'https://sepolia.base.org';
  return options => {
    const primary = http(primaryUrl, { timeout: 6000, retryCount: 0 })(options);
    const backupUrl = new URL(primaryUrl).hostname === 'sepolia.base.org'
      ? 'https://base-sepolia-rpc.publicnode.com' : 'https://sepolia.base.org';
    const backup = http(backupUrl, { timeout: 6000, retryCount: 0 })(options);
    return custom({ request: resilientRequest(primary.request, backup.request, { journal: typeof window !== 'undefined' }) }, { key: 'velo-base', name: 'VELO Base Sepolia', retryCount: 0 })(options);
  };
}
