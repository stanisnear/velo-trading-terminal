import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const folder = await mkdtemp(path.resolve('audit/live-prices-'));
const file = path.join(folder, 'prices.mjs');
await build({ entryPoints: ['src/services/priceService.ts'], outfile: file, bundle: true, platform: 'node', format: 'esm' });
const { subscribeKlines } = await import(pathToFileURL(file));
test('visible chart receives one-second exchange bars, rejects wrong streams and releases the socket', t => {
  const sockets = []; const listeners = new Set(); const received = [];
  t.mock.method(globalThis, 'setInterval', () => 1);
  t.mock.method(globalThis, 'clearInterval', () => {});
  t.mock.property(globalThis, 'WebSocket', class {
    constructor(url) { this.url = url; sockets.push(this); }
    close() { this.closed = true; this.onclose?.(); }
  });
  const original = globalThis.document;
  globalThis.document = { visibilityState: 'visible', addEventListener: (_, cb) => listeners.add(cb), removeEventListener: (_, cb) => listeners.delete(cb) };
  try {
    const stop = subscribeKlines('SOL/USD', '1s', row => received.push(row));
    assert.match(sockets[0].url, /solusdt@kline_1s$/);
    const send = (time, symbol = 'SOLUSDT') => sockets[0].onmessage({ data: JSON.stringify({ k: { s: symbol, i: '1s', t: time, o: '100', h: '102', l: '99', c: '101', v: '1' } }) });
    send(1000000); send(1001000); send(1002000, 'BTCUSDT');
    assert.deepEqual(received.map(row => row.time), [1000, 1001]);
    assert.equal(received[0].close, 101);
    stop(); assert.equal(sockets[0].closed, true); assert.equal(listeners.size, 0);
  } finally { globalThis.document = original; }
});
test.after(() => rm(folder, { recursive: true, force: true }));
