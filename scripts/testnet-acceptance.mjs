// Explicit live opt-in. Creates a disposable testnet identity, never uses a
// user's wallet or prints its private key, session, or authentication response.
import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, createWalletClient, parseAbi } from 'viem';
import { baseSepolia } from 'viem/chains';
import { baseSepoliaTransport } from '../src/services/baseTransport.mjs';
import { publicConfig } from '../supabase/functions/_shared/public-config.js';
import { build } from 'esbuild';
import { MARKETS } from '../shared/markets.mjs';

if (!process.argv.includes('--live-testnet')) throw new Error('Requires --live-testnet; never run against mainnet.');
const testV4 = process.argv.includes('--v4');
const tradePair = process.argv.find(arg => arg.startsWith('--pair='))?.slice(7) || 'SOL-USD';
if (!MARKETS.some(m => m.symbol.replace('/', '-') === tradePair || `${m.symbol}-USD` === tradePair || m.pair === tradePair)) {
  throw new Error(`Unknown acceptance market: ${tradePair}`);
}
const tradeConfig = testV4 ? { ...publicConfig, VITE_VELO_PERPS_V4_ACTIVE: 'true',
  VITE_VELO_PERPS_V4_ADDRESS: '0xE9AEcFbc5814ce3b2dB0107594d80F054e6dB52f' } : publicConfig;
const fixtureName = process.argv.includes('--fresh-fixture') ? `testnet-acceptance-${Date.now()}.local` : 'testnet-acceptance.local';
const fixturePath = new URL(`../audit/${fixtureName}`, import.meta.url);
await mkdir(new URL('../audit/', import.meta.url), { recursive: true, mode: 0o700 });
let fixture;
try { fixture = JSON.parse(await readFile(fixturePath, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; fixture = { privateKey: generatePrivateKey() }; }
await writeFile(fixturePath, JSON.stringify(fixture), { mode: 0o600 });
await chmod(fixturePath, 0o600);
const account = privateKeyToAccount(fixture.privateKey);
const origin = 'https://app.velotrading.live';
const ts = await import('typescript');
const parsedConfig = ts.parseConfigFileTextToJson('wrangler.pyth.jsonc', await readFile(new URL('../cloudflare/wrangler.pyth.jsonc', import.meta.url), 'utf8'));
if (parsedConfig.error) throw new Error('Invalid public Worker configuration');
const config = parsedConfig.config;
const auth = createClient('https://btgfoekgvyvdflzjfehz.supabase.co', config.vars.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const timed = async (name, fn) => {
  const start = performance.now();
  try { const value = await fn(); console.log(JSON.stringify({ step: name, ok: true, ms: Math.round(performance.now()-start) })); return value; }
  catch (error) { console.log(JSON.stringify({ step: name, ok: false, ms: Math.round(performance.now()-start), error: error.message })); throw error; }
};
const post = async (path, data) => {
  const res = await fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: AbortSignal.timeout(45000) });
  const json = await res.json();
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}: ${json.error || 'request failed'}`);
  return json;
};
console.log(JSON.stringify({ testWallet: account.address, network: 'Base Sepolia', chainId: 84532 }));
const challenge = await timed('wallet challenge', () => post('/api/wallet-auth', { action: 'challenge', address: account.address }));
const signature = await account.signMessage({ message: challenge.message });
const proof = await timed('wallet verification', () => post('/api/wallet-auth', { action: 'verify', address: account.address, id: challenge.id, signature }));
const verified = await auth.auth.verifyOtp({ type: 'email', token_hash: proof.token_hash });
if (verified.error || !verified.data.session) throw new Error(`Test session could not be established: ${verified.error?.code || 'missing_session'} (${verified.error?.status || 0})`);
const session = verified.data.session;
if (process.argv.includes('--markets')) await timed('all 13 entitled crypto feeds', async () => {
  const params = new URLSearchParams({ parsed: 'true', encoding: 'hex' });
  for (const market of MARKETS) params.append('ids[]', market.feed);
  const response = await fetch(`${origin}/api/pyth/v2/updates/price/latest?${params}`, { headers: { Authorization: `Bearer ${session.access_token}` }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Market batch HTTP ${response.status}`);
  const data = await response.json();
  for (const market of MARKETS) {
    const quote = data.parsed?.find(row => row.id.replace(/^0x/, '') === market.feed)?.price;
    if (!quote || Number(quote.price) <= 0 || Math.abs(Date.now()/1000 - quote.publish_time) > 60) throw new Error(`Missing or stale ${market.symbol} feed`);
  }
  if (!data.binary?.data?.length) throw new Error('Missing signed payload');
});
for (const [symbol,id] of Object.entries({ BTC:'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43', SOL:'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d' })) {
  await timed(`live oracle ${symbol}`, async () => {
    const res = await fetch(`${origin}/api/pyth/v2/updates/price/latest?ids[]=${id}&parsed=true&encoding=hex`, { headers: { Authorization: `Bearer ${session.access_token}` }, signal: AbortSignal.timeout(20000) });
    const data = await res.json();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${data.error}`);
    if (!data.binary?.data?.length || data.parsed?.[0]?.id?.replace(/^0x/, '') !== id) throw new Error('Missing or mismatched oracle update');
    if (Date.now()/1000-data.parsed[0].price.publish_time > 30) throw new Error('Stale oracle update');
  }).catch(() => {});
}
if (process.argv.includes('--faucet-transfer')) {
  const client = createPublicClient({ chain: baseSepolia, transport: baseSepoliaTransport() });
  if (await client.getChainId() !== 84532) throw new Error('Wrong network');
  const wallet = createWalletClient({ account, chain: baseSepolia, transport: baseSepoliaTransport() });
  const confirm = async hash => {
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: 45000, pollingInterval: 1000, confirmations: 2 });
    if (receipt.status !== 'success' || receipt.transactionHash !== hash) throw new Error('Transaction not confirmed successfully');
    console.log(JSON.stringify({ confirmedHash: hash }));
  };
  await timed('sponsor testnet gas', async () => {
    const result = await post('/api/sponsor-eth', { burnerAddress: account.address });
    if (result.txHash) await confirm(result.txHash);
    else if (await client.getBalance({ address: account.address }) === 0n) throw new Error('Sponsor returned no funding');
  });
  const abi = parseAbi(['function mint()', 'function transfer(address to,uint256 amount) returns(bool)', 'function balanceOf(address owner) view returns(uint256)']);
  if (process.argv.includes('--register-username')) {
    const compiled = await build({ entryPoints: ['src/services/usernameService.ts'], bundle: true, write: false, platform: 'node', format: 'esm', define: { 'import.meta.env': JSON.stringify(tradeConfig) } });
    const registry = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
    const username = `velo_${account.address.slice(2, 10).toLowerCase()}`;
    await timed('confirmed on-chain username registration', async () => {
      const hash = await registry.ensureUsernameRegistered(client, wallet, username);
      if (hash) console.log(JSON.stringify({ username, confirmedHash: hash }));
      if (await registry.resolveUsername(client, username) !== account.address) throw new Error('Registry recipient mismatch');
      if (await registry.ensureUsernameRegistered(client, wallet, username) !== null) throw new Error('Registration retry was not idempotent');
    });
  }
  if (await client.readContract({ address: publicConfig.MUSDC_ADDRESS, abi, functionName: 'balanceOf', args: [account.address] }) < 20000000n) {
    await timed('faucet mint', async () => confirm(await wallet.writeContract({ address: publicConfig.MUSDC_ADDRESS, abi, functionName: 'mint' })));
  }
  const recipient = privateKeyToAccount(generatePrivateKey()).address;
  await timed('testnet transfer', async () => {
    await confirm(await wallet.writeContract({ address: publicConfig.MUSDC_ADDRESS, abi, functionName: 'transfer', args: [recipient, 1000000n] }));
    const balance = await client.readContract({ address: publicConfig.MUSDC_ADDRESS, abi, functionName: 'balanceOf', args: [recipient] });
    if (balance !== 1000000n) throw new Error('Recipient did not receive exact test amount');
  });
  if (process.argv.includes('--trade')) {
    const compiled = await build({ entryPoints: ['src/services/veloPerpsService.ts'], bundle: true, write: false, platform: 'node', format: 'esm', define: { 'import.meta.env': JSON.stringify(tradeConfig) },
      plugins: [{ name: 'test-session', setup(b) {
        b.onResolve({ filter: /pythConnection$/ }, () => ({ path: 'session', namespace: 'test' }));
        b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const fetchPyth = (...args) => globalThis.__acceptancePyth(...args);' }));
      } }],
    });
    globalThis.__acceptancePyth = (path, options = {}) => fetch(origin + path, { ...options, headers: { ...options.headers, Authorization: `Bearer ${session.access_token}` }, signal: AbortSignal.timeout(20000) });
    const perps = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
    for (const existing of await perps.fetchOpenPositions(client, account.address)) {
      await timed('recover disposable test position', () => perps.closePosition(wallet, client, existing.tradeId, existing.pair));
    }
    let protection = {};
    if (testV4 && process.argv.includes('--with-triggers')) {
      const market = MARKETS.find(m => `${m.symbol}-USD` === tradePair);
      const response = await globalThis.__acceptancePyth(`/api/pyth/v2/updates/price/latest?ids[]=${market.feed}&parsed=true&encoding=hex`);
      if (!response.ok) throw new Error('Unable to price protection test');
      const quote = (await response.json()).parsed[0].price;
      const mark = Number(quote.price) * 10 ** quote.expo;
      protection = { takeProfit: Number((mark * 1.2).toFixed(6)), stopLoss: Number((mark * .8).toFixed(6)) };
    }
    const position = await timed(`open isolated ${tradePair} position`, () => perps.openPosition(wallet, client, { pair: tradePair, isLong: true, collateralUSDC: 10, leverage: 2, marginMode: 'ISOLATED', ...protection }));
    console.log(JSON.stringify({ openedTradeId: position.tradeId.toString(), hash: position.txHash }));
    // V4's minimum hold is enforced on-chain, including for the test wallet.
    if (testV4) await new Promise(resolve => setTimeout(resolve, 2500));
    const livePositions = await perps.fetchOpenPositions(client, account.address);
    if (!livePositions.some(p => p.tradeId === position.tradeId && (!testV4 || p.v4))) throw new Error('Live position or V4 accounting metadata missing');
    if (protection.takeProfit) {
      const active = livePositions.find(p => p.tradeId === position.tradeId);
      if (Math.abs(active.takeProfit - protection.takeProfit) > .000001 || Math.abs(active.stopLoss - protection.stopLoss) > .000001) throw new Error('Atomic protection missing from the opened position');
      console.log(JSON.stringify({ atomicProtectionVerified: true, takeProfit: active.takeProfit, stopLoss: active.stopLoss }));
      await timed('edit and confirm on-chain TP/SL', async () => {
        await perps.setTriggers(wallet, client, position.tradeId, protection.takeProfit * 1.01, protection.stopLoss * .99);
        const updated = (await perps.fetchOpenPositions(client, account.address)).find(p => p.tradeId === position.tradeId);
        if (Math.abs(updated.takeProfit - protection.takeProfit * 1.01) > .000001 || Math.abs(updated.stopLoss - protection.stopLoss * .99) > .000001) throw new Error('Edited protection missing');
      });
    }
    const closed = await timed(`close isolated ${tradePair} position`, () => perps.closePosition(wallet, client, position.tradeId, tradePair));
    console.log(JSON.stringify({ closeReason: closed.reason, hash: closed.txHash }));
    const order = await timed('place distant limit order', () => perps.placeConditionalOrder(wallet, client, { pair: tradePair, isLong: true, leverage: 2, marginMode: 'ISOLATED', triggerKind: 'LIMIT', triggerPrice: 0.001, collateralUSDC: 10, reduceOnly: false }));
    await timed('cancel limit order', () => perps.cancelConditionalOrder(wallet, client, order.orderId));
    if (testV4 && process.argv.includes('--keeper-order')) {
      const executable = await timed('place eligible keeper limit order', () => perps.placeConditionalOrder(wallet, client, { pair: tradePair, isLong: true, leverage: 2, marginMode: 'ISOLATED', triggerKind: 'LIMIT', triggerPrice: position.entryPrice * 1.1, collateralUSDC: 10, reduceOnly: false }));
      console.log(JSON.stringify({ awaitingKeeper: true, orderId: executable.orderId.toString(), pair: tradePair }));
      await timed('keeper executes real test order', async () => {
        const deadline = Date.now() + 180000;
        while (Date.now() < deadline) {
          const positions = await perps.fetchOpenPositions(client, account.address);
          if (positions.length) {
            await new Promise(resolve => setTimeout(resolve, 2500));
            for (const p of positions) await perps.closePosition(wallet, client, p.tradeId, p.pair);
            return;
          }
          await new Promise(resolve => setTimeout(resolve, 4000));
        }
        await perps.cancelConditionalOrder(wallet, client, executable.orderId);
        throw new Error('Keeper did not execute within acceptance window; test order cancelled');
      });
    }
    delete globalThis.__acceptancePyth;
  }
}
await timed('test identity logout', async () => { const { error } = await auth.auth.signOut(); if (error) throw error; });
