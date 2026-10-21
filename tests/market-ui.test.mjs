import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { mkdir, mkdtemp, rm, readFile } from 'node:fs/promises';
import ts from 'typescript';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizeMarketCoins } from '../shared/marketDiscovery.mjs';

await mkdir('audit', { recursive: true });
const folder = await mkdtemp(path.resolve('audit/market-ui-'));
const output = path.join(folder, 'components.mjs');
// Exercise the actual coin-page button without loading the wallet-enabled app shell.
const appSource = ts.createSourceFile('App.tsx', await readFile('src/App.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let coinBackButton;
const visit = node => {
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(appSource) === 'button'
    && node.children.some(child => ts.isJsxText(child) && child.text.includes('ALL MARKETS'))) coinBackButton = node.getText(appSource);
  ts.forEachChild(node, visit);
};
visit(appSource);
assert.ok(coinBackButton, 'Coin-page back button exists');
await build({ stdin: { contents: "import React from 'react'; export { MarketsView } from './src/components/ui/pages/MarketsView'; export { TokenInteractiveChart } from './src/components/TokenInteractiveChart'; export const CoinBackButton = ({onClose}) => (" + coinBackButton + ");", resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, platform: 'node', format: 'esm', outfile: output, external: ['react', 'react-dom', 'react/jsx-runtime', 'lucide-react', '@tanstack/react-query'] });
const { MarketsView, TokenInteractiveChart, CoinBackButton } = await import(pathToFileURL(output));
const tick = () => new Promise(resolve => setTimeout(resolve, 20));

function setup(width = 800) {
  const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { url: 'https://fixture.invalid', pretendToBeVisual: true });
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  dom.window.SVGElement.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, width, height: 270, left: 0, top: 0, right: width, bottom: 270 });
  globalThis.ResizeObserver = class { constructor(callback) { this.callback = callback; } observe() { this.callback(); } disconnect() {} };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRoot(document.querySelector('#root'));
  return { client, render: async element => {
    await act(async () => { root.render(React.createElement(QueryClientProvider, { client }, element)); });
    await act(tick);
  }, close: async () => { await act(async () => root.unmount()); client.clear(); dom.window.close(); } };
}

test('All Markets click navigates back without passing a React event as an asset ID', async () => {
  const f = setup(); const calls = [];
  try {
    await f.render(React.createElement(CoinBackButton, { onClose: (...args) => calls.push(args) }));
    await act(async () => document.querySelector('button').click());
    assert.deepEqual(calls, [[]]);
  } finally { await f.close(); }
});

test('top-50 rows navigate by stable asset ID and only registered assets offer Trade', async t => {
  const f = setup(); let navigated; let traded;
  const rows = Array.from({ length: 50 }, (_, i) => ({ id: i === 0 ? 1 : i === 1 ? 3408 : 100000 + i,
    symbol: i === 0 ? 'BTC' : i === 1 ? 'USDC' : `COIN${i}`, name: `Asset ${i}`, cmc_rank: i + 1,
    quote: { USD: { price: 100, percent_change_24h: 1, market_cap: 1000 } } }));
  t.mock.method(globalThis, 'fetch', async () => Response.json({ assets: normalizeMarketCoins(rows), fetchedAt: Date.now() }));
  try {
    await f.render(React.createElement(MarketsView, { marketPrices: {}, marketChanges: {}, watchlist: [], onToggleWatchlist: () => {}, onNavigateToTrade: pair => traded = pair, onNavigateToSocial: id => navigated = id }));
    const items = document.querySelectorAll('.markets-row'); assert.equal(items.length, 50);
    assert.equal(document.querySelectorAll('.markets-row .markets-trade').length, 1);
    await act(async () => items[2].click()); assert.equal(navigated, 'cmc-100002');
    await act(async () => items[0].querySelector('.markets-trade').click()); assert.equal(traded.id, 'BTC/USD');
    assert.match(items[1].textContent, /Info only/);
  } finally { await f.close(); }
});

test('coin chart preserves time gaps, uses non-stretched dimensions and fits mobile tick labels', async t => {
  const f = setup(360);
  const rows = [[1000, 10], [2000, 20], [10000, 15]];
  t.mock.method(globalThis, 'fetch', async () => Response.json({ prices: rows, market_caps: rows.map(([time, value]) => [time, value * 10]), provider: 'CoinMarketCap' }));
  try {
    await f.render(React.createElement(TokenInteractiveChart, { assetId: 'bitcoin', ticker: 'BTC', currentPrice: 15, up: true }));
    const svg = document.querySelector('svg.token-chart-svg'); assert.ok(svg);
    assert.equal(svg.getAttribute('viewBox'), '0 0 360 270');
    const xs = svg.querySelector('polyline').getAttribute('points').split(' ').map(pair => Number(pair.split(',')[0]));
    assert.ok(Math.abs((xs[1] - xs[0]) / (xs[2] - xs[0]) - 1 / 9) < 0.002);
    const labels = [...svg.querySelectorAll('text')].slice(-3);
    assert.equal(labels[0].getAttribute('text-anchor'), 'start');
    assert.equal(labels[2].getAttribute('text-anchor'), 'end');
    const cap = [...document.querySelectorAll('button')].find(button => button.textContent === 'Mkt Cap');
    await act(async () => cap.click()); assert.equal(cap.getAttribute('aria-pressed'), 'true');
    assert.match(document.body.textContent, /\$150\.00/);
  } finally { await f.close(); }
});

test('missing chart history is explicit and never draws invented price samples', async t => {
  const f = setup();
  t.mock.method(globalThis, 'fetch', async () => Response.json({ prices: [], market_caps: [] }));
  try {
    await f.render(React.createElement(TokenInteractiveChart, { assetId: 'bitcoin', ticker: 'BTC', currentPrice: 150, up: true }));
    assert.equal(document.querySelector('svg.token-chart-svg'), null);
    assert.match(document.body.textContent, /unavailable|could not/i);
    assert.ok([...document.querySelectorAll('button')].some(button => button.textContent.includes('Retry')));
  } finally { await f.close(); }
});

test.after(async () => { await rm(folder, { recursive: true, force: true }); });
