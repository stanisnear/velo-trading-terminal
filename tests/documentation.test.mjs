import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import path from 'node:path';
import { V4_TRADING_MARKETS, V4_MAX_LEVERAGE } from '../shared/markets.mjs';
import { publicConfig } from '../supabase/functions/_shared/public-config.js';
import { postPath } from '../shared/socialLinks.mjs';

const read = name => readFile(new URL('../' + name, import.meta.url), 'utf8');
const manifest = JSON.parse(await read('contracts/deployments/base_sepolia.json'));
const markdown = ['README.md', 'VISION.md', 'contracts/README.md',
  ...(await readdir(new URL('../docs/', import.meta.url))).filter(name => name.endsWith('.md')).map(name => 'docs/' + name)];

test('current references agree with the V4 manifest, market allow-list and vision', async () => {
  assert.equal(publicConfig.VITE_VELO_PERPS_V4_ACTIVE, 'true');
  assert.equal(publicConfig.VITE_VELO_PERPS_V4_ADDRESS, manifest.VeloPerpsV4);
  const readme = await read('README.md');
  const contracts = await read('contracts/README.md');
  const architecture = await read('docs/ARCHITECTURE.md');
  const funding = await read('docs/FUNDING-READINESS.md');
  const vision = await read('VISION.md');
  assert.equal(V4_TRADING_MARKETS.length, 9);
  for (const { symbol } of V4_TRADING_MARKETS) {
    for (const text of [readme, contracts, architecture, funding]) assert.ok(text.includes(symbol), `${symbol} is documented`);
    assert.ok(V4_MAX_LEVERAGE[symbol] <= 25);
  }
  for (const text of [readme, contracts, architecture, funding]) assert.ok(text.includes(manifest.VeloPerpsV4));
  assert.match(vision, /venue, the conversation and the track record/);
  assert.match(vision, /0\.10% of requested notional/);
  assert.doesNotMatch(vision, /0\.10% of collateral|0\.10% of the gross payout/);
  assert.match(funding, /Testnet|testnet/);
  assert.match(funding, /founder|Founder/);
  const route = postPath('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002');
  assert.ok(route.includes('/r/'));
  assert.ok(architecture.includes('/p/<post>/r/<reply>'));
});

test('relative documentation links resolve and do not point to retired runbooks', async () => {
  for (const name of markdown) {
    const content = await read(name);
    for (const match of content.matchAll(/\]\(([^\s)]+)\)/g)) {
      const target = match[1].split('#')[0];
      if (!target || /^[a-z]+:/i.test(target)) continue;
      await assert.doesNotReject(access(new URL('../' + path.posix.join(path.posix.dirname(name), target), import.meta.url)), `${name}: ${target}`);
    }
  }
});
