import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { MARKETS } from '../shared/markets.mjs';

const compiled = await build({ entryPoints: ['src/services/pythService.ts'], bundle: true, write: false, format: 'esm', plugins: [{ name: 'fixture', setup(b) {
  b.onResolve({ filter: /^\.\/pythConnection$/ }, () => ({ path: 'connection', namespace: 'fixture' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const fetchPyth = (...args) => globalThis.__tradingFeedFetch(...args);' }));
} }] });
const { fetchPriceUpdate } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const id = MARKETS[0].feed;
const entry = () => ({ id, price: { price: '10000000000', expo: -8, publish_time: Math.floor(Date.now()/1000) } });

test('trading requires the exact requested feed even when the proxy supplies a partial batch', async () => {
  try {
    for (const parsed of [[], [{ ...entry(), id: MARKETS[1].feed }], [{ ...entry(), price: { ...entry().price, price: '0' } }], [{ ...entry(), price: { ...entry().price, publish_time: 0 } }], [{ ...entry(), price: { ...entry().price, publish_time: Date.now()/1000+100 } }]]) {
      globalThis.__tradingFeedFetch = async () => Response.json({ binary: { data: ['1234'] }, parsed });
      await assert.rejects(fetchPriceUpdate(['0x'+id]));
    }
    globalThis.__tradingFeedFetch = async () => Response.json({ binary: { data: ['1234'] }, parsed: [entry()] });
    assert.equal((await fetchPriceUpdate(['0x'+id])).parsedPrice, 100);
    globalThis.__tradingFeedFetch = () => { throw Error('must not call provider'); };
    await assert.rejects(fetchPriceUpdate(['0x'+'f'.repeat(64)]), /not covered/);
  } finally { delete globalThis.__tradingFeedFetch; }
});
