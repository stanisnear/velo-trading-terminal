import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { mkdtemp, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { tradeProps, tradeFixturePlugin } from './fixtures/trade-view.mjs';

const folder = await mkdtemp(path.resolve('audit/trade-ticket-'));
const file = path.join(folder, 'view.mjs');
await build({ entryPoints: ['src/components/ui/pages/TradeView.tsx'], bundle: true, platform: 'node', format: 'esm', outfile: file,
  external: ['react', 'react-dom', 'lucide-react'], plugins: [tradeFixturePlugin], loader: { '.css': 'empty' } });
const { TradeView } = await import(pathToFileURL(file));

test('market, limit and stop share a persistent submit area outside the scrolling fields', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://fixture.invalid' });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.querySelector('#root'));
  const calls = [];
  const props = { ...tradeProps, onOpenPosition: (...args) => calls.push(args) };
  const render = pending => act(async () => root.render(React.createElement(TradeView, { ...props, tradingPending: pending })));
  try {
    await render(false);
    const ticket = document.querySelector('[aria-label="Order ticket"]');
    const body = ticket.querySelector('[aria-label="Order parameters"]');
    const submit = ticket.querySelector('.velo-order-ticket__footer > button');
    assert.ok(submit && !body.contains(submit));
    assert.equal(ticket.querySelectorAll('dt').length, 4, 'all cost and profit-limit disclosures remain');
    for (const type of ['MARKET', 'LIMIT', 'STOP']) {
      const tab = [...ticket.querySelectorAll('button')].find(button => button.textContent === type);
      await act(async () => tab.click());
      assert.equal(ticket.querySelector('.velo-order-ticket__footer > button'), submit);
      assert.equal([...body.querySelectorAll('label')].some(label => label.textContent === 'Price'), type !== 'MARKET');
    }
    await act(async () => [...ticket.querySelectorAll('button')].find(button => button.textContent === 'MARKET').click());
    const leverage = ticket.querySelector('[aria-label="Leverage"]');
    await act(async () => { leverage.value = '5'; leverage.dispatchEvent(new window.Event('change', { bubbles: true })); });
    assert.match(submit.textContent, /5x LONG/);
    await act(async () => submit.click());
    assert.equal(calls.length, 1); assert.equal(calls[0][3], 5);
    await render(true);
    assert.equal(submit.disabled, true); assert.equal(submit.getAttribute('aria-busy'), 'true');
    await render(false);
    assert.equal(submit.disabled, false);
    await act(async () => { window.innerWidth = 390; window.dispatchEvent(new window.Event('resize')); });
    assert.equal(document.querySelector('.velo-trade-rail').firstElementChild, ticket, 'mobile DOM and keyboard order put the ticket before the feed');
    assert.equal(ticket.querySelector('.velo-order-ticket__footer > button'), submit, 'resize preserves the ticket and its draft');
  } finally { await act(async () => root.unmount()); dom.window.close(); }
});
test.after(() => rm(folder, { recursive: true, force: true }));
