// Explicit, one-off Base Sepolia verification. Never uses the keeper's private key.
// Run stages separately so the real Cloudflare timer performs the fills.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createPublicClient, createWalletClient, http, parseAbi, decodeEventLog } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { publicConfig } from '../supabase/functions/_shared/public-config.js';
import { POSITION_V3_ABI } from '../supabase/functions/velo-keepers/generated/abi.js';
import { latestPythUpdate } from '../supabase/functions/_shared/pyth.js';
import { normalisePrice } from '../supabase/functions/velo-keepers/math.js';

const stage = process.argv[2];
const dir = process.env.VELO_TEST_SESSION_DIR;
if (process.env.VELO_RUN_TESTNET_CHECK !== 'yes' || !dir || !['prepare','triggers','inspect'].includes(stage)) {
  throw new Error('Requires explicit VELO_RUN_TESTNET_CHECK=yes, a private VELO_TEST_SESSION_DIR and prepare|triggers|inspect.');
}
const read = name => JSON.parse(readFileSync(join(dir, name), 'utf8'));
const publicEnv = read('public-build.json');
const transport = http(publicEnv.VITE_BASE_SEPOLIA_RPC_URL, { timeout: 12000, retryCount: 0 });
const client = createPublicClient({ chain: baseSepolia, transport });
const perps = publicConfig.VITE_VELO_PERPS_V3_ADDRESS;
const usdc = publicConfig.MUSDC_ADDRESS;
const abi = parseAbi([
  'function VERSION() view returns (uint256)',
  'function USDC() view returns (address)',
  'function pairFeedId(uint16) view returns (bytes32)',
  'function pairTradable(uint16) view returns (bool)',
  'function placeConditionalOrder((uint16 pairIndex, bool isLong, uint16 leverage, uint8 marginMode, uint8 triggerKind, uint128 triggerPrice_E18, uint64 collateralUSDC_6, bool reduceOnly, uint16 reduceBps) p) returns (uint256)',
  'function getTraderTrades(address) view returns (uint256[])',
  'function getTraderOrders(address) view returns (uint256[])',
  'function setTriggers(uint256 tradeId, uint128 takeProfit_E18, uint128 stopLoss_E18)',
  'event ConditionalOrderPlaced(uint256 indexed orderId, address indexed trader, uint16 indexed pairIndex, bool isLong, uint8 triggerKind, uint8 marginMode, bool reduceOnly, uint16 reduceBps, uint128 triggerPrice_E18, uint64 collateralUSDC_6, uint16 leverage)',
]);
const tokenAbi = parseAbi(['function mint()', 'function approve(address spender,uint256 amount) returns (bool)', 'function balanceOf(address) view returns (uint256)']);
const stateFile = join(dir, 'testnet-verification-wallet.json');
const serialise = value => JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2);
let state;
const save = () => writeFileSync(stateFile, serialise(state) + '\n', { mode: 0o600 });
const receipt = async hash => {
  const r = await client.waitForTransactionReceipt({ hash, timeout: 45000, pollingInterval: 1500 });
  if (r.status !== 'success') throw new Error('TEST_TRANSACTION_REVERTED');
  return r;
};

try {
  const [chainId, version, contractUsdc, tradable] = await Promise.all([
    client.getChainId(), client.readContract({ address: perps, abi, functionName: 'VERSION' }),
    client.readContract({ address: perps, abi, functionName: 'USDC' }),
    client.readContract({ address: perps, abi, functionName: 'pairTradable', args: [0] }),
  ]);
  if (chainId !== 84532 || version !== 31n || contractUsdc.toLowerCase() !== usdc.toLowerCase() || !tradable) throw new Error('TESTNET_CONTRACT_GUARD_FAILED');
  if (stage === 'prepare') {
    if (existsSync(stateFile)) throw new Error('TEST_ALREADY_CREATED_DO_NOT_REPEAT');
    state = { purpose: 'velo-cloudflare-migration-testnet-only', chainId, perps, privateKey: generatePrivateKey(), steps: [], createdAt: new Date().toISOString() };
    save();
  } else state = read('testnet-verification-wallet.json');
  if (state.purpose !== 'velo-cloudflare-migration-testnet-only' || state.chainId !== chainId || state.perps !== perps) throw new Error('TEST_STATE_MISMATCH');
  const account = privateKeyToAccount(state.privateKey);
  state.address = account.address;
  const wallet = createWalletClient({ account, chain: baseSepolia, transport });
  const send = async (name, address, callAbi, functionName, args = []) => {
    const { request } = await client.simulateContract({ account, address, abi: callAbi, functionName, args });
    const hash = await wallet.writeContract(request);
    state.steps.push({ name, hash, status: 'submitted' }); save();
    const r = await receipt(hash);
    Object.assign(state.steps.at(-1), { status: r.status, block: r.blockNumber.toString() }); save();
    console.log(JSON.stringify({ name, hash, status: r.status }));
    return r;
  };
  if (stage === 'prepare') {
    const tokens = read('service-tokens.json');
    const response = await fetch('https://btgfoekgvyvdflzjfehz.supabase.co/functions/v1/velo-api/api/sponsor-eth', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Velo-Proxy-Token': tokens.gateway },
      body: JSON.stringify({ burnerAddress: account.address }), redirect: 'manual', signal: AbortSignal.timeout(30000),
    });
    const result = await response.json();
    if (!response.ok || result.sponsored !== true || result.amount !== '0.01') throw new Error('TEST_SPONSOR_FAILED');
    await receipt(result.txHash);
    state.steps.push({ name: 'gas-sponsor', hash: result.txHash, status: 'success', testETH: result.amount }); save();
    console.log(JSON.stringify({ name: 'gas-sponsor', address: account.address, hash: result.txHash, status: 'success' }));
    await send('mock-usdc-faucet', usdc, tokenAbi, 'mint');
    await send('approve-one-mock-usdc', usdc, tokenAbi, 'approve', [perps, 1_000_000n]);
    const feed = await client.readContract({ address: perps, abi, functionName: 'pairFeedId', args: [0] });
    const provider = read('provider-secrets.json');
    const update = await latestPythUpdate(feed, name => name === 'PYTH_API_KEY' ? provider.PYTH_API_KEY : publicConfig[name]);
    const price = update.parsed.find(p => p.id.toLowerCase().replace(/^0x/,'') === feed.slice(2).toLowerCase())?.price;
    if (!price || Math.abs(Date.now()/1000 - price.publish_time) > 45) throw new Error('TEST_PRICE_NOT_FRESH');
    const mark = normalisePrice(price.price, price.expo);
    const r = await send('place-one-mock-usdc-limit', perps, abi, 'placeConditionalOrder', [{ pairIndex: 0, isLong: true, leverage: 1, marginMode: 0, triggerKind: 0, triggerPrice_E18: mark * 105n / 100n, collateralUSDC_6: 1_000_000n, reduceOnly: false, reduceBps: 0 }]);
    for (const log of r.logs) {
      if (log.address.toLowerCase() !== perps.toLowerCase()) continue;
      try { const d = decodeEventLog({ abi, data: log.data, topics: log.topics }); if (d.eventName === 'ConditionalOrderPlaced') state.orderId = d.args.orderId.toString(); } catch {}
    }
    if (!state.orderId) throw new Error('TEST_ORDER_EVENT_MISSING');
    save();
  }
  if (stage === 'triggers') {
    if (state.steps.some(s => s.name === 'set-test-tp-sl')) throw new Error('TEST_TRIGGERS_ALREADY_SENT');
    const trades = await client.readContract({ address: perps, abi, functionName: 'getTraderTrades', args: [account.address] });
    if (trades.length !== 1) throw new Error('EXPECTED_EXACTLY_ONE_TEST_POSITION');
    const p = await client.readContract({ address: perps, abi: POSITION_V3_ABI, functionName: 'getPosition', args: [trades[0]] });
    if (p.owner.toLowerCase() !== account.address.toLowerCase()) throw new Error('TEST_POSITION_OWNER_MISMATCH');
    state.tradeId = trades[0].toString(); save();
    // Tiny valid bracket: the next real price movement should close this test position.
    await send('set-test-tp-sl', perps, abi, 'setTriggers', [trades[0], p.entryPrice_E18 + 10_000_000_000n, p.entryPrice_E18 - 10_000_000_000n]);
  }
  const [orders, trades, balance] = await Promise.all([
    client.readContract({ address: perps, abi, functionName: 'getTraderOrders', args: [account.address] }),
    client.readContract({ address: perps, abi, functionName: 'getTraderTrades', args: [account.address] }),
    client.readContract({ address: usdc, abi: tokenAbi, functionName: 'balanceOf', args: [account.address] }),
  ]);
  state.lastInspection = { at: new Date().toISOString(), orders, trades, mockUsdcBalance: balance }; save();
  const { privateKey, ...publicResult } = state;
  console.log(serialise(publicResult));
} catch (error) {
  console.error(JSON.stringify({ error: error.name, reason: /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'TEST_CHECK_FAILED' }));
  process.exitCode = 1;
}
