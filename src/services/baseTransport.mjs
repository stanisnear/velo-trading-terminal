import { custom, http, keccak256 } from 'viem';

// Only reads may move between providers. Signing/submission stays on one
// transport; a lost broadcast response must never cause a fresh transaction.
const READ_METHODS = new Set([
  'eth_chainId', 'eth_blockNumber', 'eth_call', 'eth_estimateGas', 'eth_gasPrice',
  'eth_maxPriorityFeePerGas', 'eth_feeHistory', 'eth_getBalance', 'eth_getCode',
  'eth_getStorageAt', 'eth_getTransactionCount', 'eth_getTransactionReceipt',
  'eth_getTransactionByHash', 'eth_getBlockByNumber', 'eth_getBlockByHash', 'eth_getLogs',
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

// Exported separately so outage, rejection, and ambiguous submission paths are
// exercised without a real wallet, chain transaction, or oracle request.
export function resilientRequest(primary, backup) {
  return async args => {
    try { return await primary(args); }
    catch (error) {
      if (!isRpcNetworkError(error)) throw error;
      if (args.method === 'eth_sendRawTransaction' && args.params?.[0]) {
        throw Object.assign(new Error('Transaction submission response was lost.'), { txHash: keccak256(args.params[0]), cause: error });
      }
      if (backup && READ_METHODS.has(args.method)) return backup(args);
      throw error;
    }
  };
}

export function baseSepoliaTransport(primaryUrl = 'https://base-sepolia-rpc.publicnode.com') {
  return options => {
    const primary = http(primaryUrl, { timeout: 6000, retryCount: 0 })(options);
    const backup = http('https://sepolia.base.org', { timeout: 6000, retryCount: 0 })(options);
    return custom({ request: resilientRequest(primary.request, backup.request) }, { key: 'velo-base', name: 'VELO Base Sepolia', retryCount: 0 })(options);
  };
}
