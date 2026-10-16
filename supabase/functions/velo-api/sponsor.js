import { isAddress, parseEther, formatEther } from 'viem';
import { runtimeEnv } from './env.js';
import { runtimeStore, RuntimeError } from '../_shared/runtime.js';
import { chainClients, withSigner } from '../_shared/signer.js';

export function createSponsor(getEnv = runtimeEnv, deps = {}) {
  return async (req, res) => {
    if (req.method === 'OPTIONS') return res.status(204).end();
    const address = req.body?.burnerAddress;
    if (!address || !isAddress(address)) return res.status(400).json({ error: 'Invalid burnerAddress' });
    if (getEnv('VELO_SPONSOR_ENABLED') !== 'true') return res.status(503).json({ error: 'Sponsor not enabled' });
    try {
      const db = deps.db || runtimeStore(getEnv);
      const clients = deps.clients || chainClients(getEnv, true, true);
      const result = await (deps.withSigner || withSigner)({ db, ...clients }, async send => {
        const balance = await clients.publicClient.getBalance({ address });
        if (balance >= parseEther('0.003')) return { sponsored: false, reason: 'Already funded', existingBalance: formatEther(balance) };
        const rate = await db('sponsor_rate', { address: address.toLowerCase() });
        if (!rate.allowed) throw new RuntimeError('Rate limited — try again in 5 minutes', 429);
        const receipt = await send({ to: address, value: parseEther('0.01') });
        if (receipt.status !== 'success') throw new RuntimeError('Sponsor transaction reverted');
        return { sponsored: true, txHash: receipt.hash, amount: '0.01' };
      });
      return res.status(200).json(result);
    } catch (error) {
      res.setHeader('Retry-After', '5');
      return res.status(error instanceof RuntimeError ? error.status : 503).json({ error: error instanceof RuntimeError ? error.code : 'Sponsor unavailable' });
    }
  };
}
export default createSponsor();
