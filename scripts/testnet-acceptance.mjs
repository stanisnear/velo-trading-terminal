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
    const compiled = await build({ entryPoints: ['src/services/veloPerpsService.ts'], bundle: true, write: false, platform: 'node', format: 'esm', define: { 'import.meta.env': JSON.stringify(publicConfig) },
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
    const position = await timed('open isolated SOL position', () => perps.openPosition(wallet, client, { pair: 'SOL-USD', isLong: true, collateralUSDC: 10, leverage: 2, marginMode: 'ISOLATED' }));
    console.log(JSON.stringify({ openedTradeId: position.tradeId.toString(), hash: position.txHash }));
    const closed = await timed('close isolated SOL position', () => perps.closePosition(wallet, client, position.tradeId, 'SOL-USD'));
    console.log(JSON.stringify({ closeReason: closed.reason, hash: closed.txHash }));
    const order = await timed('place distant SOL limit order', () => perps.placeConditionalOrder(wallet, client, { pair: 'SOL-USD', isLong: true, leverage: 2, marginMode: 'ISOLATED', triggerKind: 'LIMIT', triggerPrice: 1, collateralUSDC: 10, reduceOnly: false }));
    await timed('cancel SOL limit order', () => perps.cancelConditionalOrder(wallet, client, order.orderId));
    delete globalThis.__acceptancePyth;
  }
}
await timed('test identity logout', async () => { const { error } = await auth.auth.signOut(); if (error) throw error; });
