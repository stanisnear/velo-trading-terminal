import { encodeFunctionData, isAddress } from 'viem';
import { runtimeStore, RuntimeError, boundedJson, httpsSetting } from '../_shared/runtime.js';
import { chainClients, withSigner } from '../_shared/signer.js';
import { normalisePrice, triggerFor, scanIds } from './math.js';
import { ORDER_ABI, CORE_ABI, POSITION_V3_ABI, POSITION_V2_ABI, PYTH_FEE_ABI } from './generated/abi.js';

const ZERO = '0x0000000000000000000000000000000000000000';
const PYTH_VIEW = [{ type: 'function', name: 'PYTH', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }];

export async function runKeeper(job, input, getEnv, deps = {}) {
  const dryRun = input.dryRun === true;
  if (!dryRun && getEnv('VELO_KEEPERS_ENABLED') !== 'true') throw new RuntimeError('KEEPERS_DISABLED');
  const perps = getEnv('VITE_VELO_PERPS_V3_ADDRESS') || (job !== 'cron-conditional-orders' && getEnv('VITE_VELO_PERPS_V2_ADDRESS'));
  const pyth = getEnv('VITE_PYTH_CONTRACT_ADDRESS') || getEnv('PYTH_CONTRACT_ADDRESS');
  if (!perps || !isAddress(perps) || !pyth || !isAddress(pyth)) throw new RuntimeError('CONTRACTS_NOT_CONFIGURED');
  const hermes = httpsSetting(getEnv('VITE_PYTH_HERMES_URL'), 'HERMES');
  const db = deps.db || runtimeStore(getEnv);
  const clients = deps.clients || chainClients(getEnv, !dryRun);
  const { publicClient } = clients;
  const now = deps.now || Date.now;
  const started = now();
  const scope = `84532:${perps.toLowerCase()}:${job}`;
  // Dry runs get their own IDs but warm the same read-only active-item index.
  const common = { scope, owner: crypto.randomUUID(), runId: `${dryRun ? 'dry:' : ''}${input.runId}` };
  const state = await db('claim_job', common);
  if (state.duplicate) return { ...state.result, duplicate: true };
  if (state.busy) throw new RuntimeError('JOB_BUSY', 409);
  const result = { ok: false, dryRun, job, perps, scanned: 0, active: 0, triggered: 0, executed: [], errors: [] };
  try {
    if (await publicClient.getChainId() !== 84532) throw new RuntimeError('WRONG_CHAIN');
    let version;
    try { version = Number(await publicClient.readContract({ address: perps, abi: CORE_ABI, functionName: 'VERSION' })); }
    catch { version = Number(await publicClient.readContract({ address: perps, abi: CORE_ABI, functionName: 'version' })); }
    if (![2, 3].includes(version) || (job === 'cron-conditional-orders' && version !== 3)) throw new RuntimeError('UNSUPPORTED_CONTRACT_VERSION');
    const actualPyth = await publicClient.readContract({ address: perps, abi: PYTH_VIEW, functionName: 'PYTH' });
    if (actualPyth.toLowerCase() !== pyth.toLowerCase()) throw new RuntimeError('PYTH_CONTRACT_MISMATCH');
    const orderJob = job === 'cron-conditional-orders';
    const countName = orderJob ? 'nextOrderId' : 'nextTradeId';
    const abi = orderJob ? ORDER_ABI : CORE_ABI;
    const itemAbi = orderJob ? ORDER_ABI : version === 3 ? POSITION_V3_ABI : POSITION_V2_ABI;
    const itemName = orderJob ? 'conditionalOrders' : 'getPosition';
    const functionName = orderJob ? 'executeConditionalOrder' : job === 'cron-tp-sl' ? 'closeIfTriggered' : 'liquidate';
    const nextId = Number(await publicClient.readContract({ address: perps, abi, functionName: countName }));
    const threshold = job === 'cron-liquidate' ? BigInt(await publicClient.readContract({ address: perps, abi, functionName: 'LIQUIDATION_THRESHOLD_BPS' })) : 0n;
    const plan = scanIds(state, nextId);
    const observed = new Map(); const open = [];
    for (let i = 0; i < plan.ids.length; i += 8) {
      if (now() - started > 25000) { result.errors.push({ code: 'SCAN_BUDGET_EXHAUSTED' }); break; }
      await Promise.all(plan.ids.slice(i, i + 8).map(async id => {
        try {
          const p = await publicClient.readContract({ address: perps, abi: itemAbi, functionName: itemName, args: [BigInt(id)] });
          const active = !!p && p.owner.toLowerCase() !== ZERO && (!orderJob || p.active);
          observed.set(id, { id, active }); if (active) open.push({ id, position: p });
        } catch { result.errors.push({ id, code: 'ITEM_READ_FAILED' }); }
      }));
    }
    let cursor = state.cursor;
    while (plan.discovery.includes(cursor) && observed.has(cursor)) cursor++;
    await db('save_scan', { ...common, cursor, items: [...observed.values()] });
    result.scanned = observed.size; result.active = open.length;
    result.historicalRemaining = nextId - cursor;
    result.activeQueued = Math.max(0, (state.activeCount || state.active.length) - state.active.length);
    const cache = new Map();
    const priceFor = async pairIndex => {
      const cached = cache.get(pairIndex);
      if (cached && now() - cached.fetchedAt < 15000) return cached;
      const feed = await publicClient.readContract({ address: perps, abi, functionName: 'pairFeedId', args: [pairIndex] });
      const url = new URL(hermes); url.pathname = url.pathname.replace(/\/$/, '') + '/v2/updates/price/latest';
      url.search = ''; url.searchParams.set('ids[]', feed.slice(2)); url.searchParams.set('encoding', 'hex');
      const data = await boundedJson(await (deps.fetch || fetch)(url, { redirect: 'error', signal: AbortSignal.timeout(7000) }));
      const price = data?.parsed?.find(p => p.id.toLowerCase().replace(/^0x/, '') === feed.slice(2).toLowerCase())?.price;
      if (!price || !Number.isSafeInteger(Number(price.publish_time)) || now() / 1000 - Number(price.publish_time) > 45 || Number(price.publish_time) > now() / 1000 + 5) throw new RuntimeError('STALE_PRICE');
      const blobs = data?.binary?.data;
      if (!Array.isArray(blobs) || !blobs.length || blobs.length > 8 || blobs.some(s => typeof s !== 'string' || !/^(?:0x)?(?:[0-9a-fA-F]{2})+$/.test(s))) throw new RuntimeError('INVALID_PRICE_UPDATE');
      const updateData = blobs.map(s => s.startsWith('0x') ? s : `0x${s}`);
      const fee = await publicClient.readContract({ address: pyth, abi: PYTH_FEE_ABI, functionName: 'getUpdateFee', args: [updateData] });
      const out = { mark: normalisePrice(price.price, price.expo), updateData, fee, fetchedAt: now() }; cache.set(pairIndex, out); return out;
    };
    let attempts = 0;
    for (const { id, position } of open.sort((a,b) => a.id-b.id)) {
      if (now() - started > 75000) { result.errors.push({ code: 'RUN_BUDGET_EXHAUSTED' }); break; }
      try {
        if (job === 'cron-tp-sl' && BigInt(position.takeProfit_E18) === 0n && BigInt(position.stopLoss_E18) === 0n) continue;
        const price = await priceFor(Number(position.pairIndex));
        const trigger = triggerFor(job, position, price.mark, threshold);
        if (!trigger) continue;
        result.triggered++;
        if (dryRun) continue;
        if (attempts >= 4) { result.errors.push({ id, code: 'TRANSACTION_BUDGET_EXHAUSTED' }); break; }
        attempts++;
        const receipt = await (deps.withSigner || withSigner)({ db, ...clients }, async send => {
          const fresh = await priceFor(Number(position.pairIndex));
          const args = [BigInt(id), fresh.updateData];
          // The contract remains authoritative, including reduce-only rules and
          // fresh Pyth fees. Recheck under the lock after pending-tx recovery.
          await publicClient.simulateContract({ account: clients.account, address: perps, abi, functionName, args, value: fresh.fee });
          return send({ to: perps, data: encodeFunctionData({ abi, functionName, args }), value: fresh.fee });
        });
        if (receipt.status !== 'success') throw new RuntimeError('TRANSACTION_REVERTED');
        result.executed.push({ id, trigger, hash: receipt.hash });
      } catch (error) {
        result.errors.push({ id, code: error instanceof RuntimeError ? error.code : 'EXECUTION_CHECK_FAILED' });
        // A pending transaction must be resolved before any new one is signed.
        if (error?.code === 'TRANSACTION_PENDING' || error?.code === 'SIGNER_BUSY') break;
      }
    }
    result.ok = result.errors.length === 0;
  } catch (error) {
    result.errors.push({ code: error instanceof RuntimeError ? error.code : 'KEEPER_FAILED' });
  }
  result.durationMs = now() - started;
  result.errors = result.errors.slice(0, 12);
  await db('finish_job', { ...common, result });
  // All fields are counts, public contracts/hashes, or fixed error codes.
  console.log(JSON.stringify({ job, ok: result.ok, dryRun, scanned: result.scanned, executed: result.executed.length, durationMs: result.durationMs }));
  return result;
}
