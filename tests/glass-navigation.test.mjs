import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

test('navigation lens follows the route and resize without replacing focused controls', async () => {
  await mkdir('audit', { recursive: true });
  const folder = await mkdtemp(path.resolve('audit/glass-nav-'));
  const file = path.join(folder, 'nav.mjs');
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const observers = [];
  globalThis.ResizeObserver = class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  };
  let width = 100;
  for (const [name, getter] of Object.entries({
    offsetWidth: () => width, offsetHeight: () => 40, offsetTop: () => 4,
    offsetLeft() { return this.textContent === 'Social' ? width + 7 : 4; },
  })) Object.defineProperty(dom.window.HTMLElement.prototype, name, { configurable: true, get: getter });
  const root = createRoot(document.querySelector('#root'));
  try {
    await build({ entryPoints: ['src/components/ui/GlassNav.tsx'], outfile: file, bundle: true, format: 'esm', platform: 'node', external: ['react'] });
    const { GlassNav } = await import(pathToFileURL(file));
    const items = ['Trade', 'Social'].map(id => ({ id, label: id, icon: () => null }));
    let selected;
    const render = activeId => React.createElement(GlassNav, { items, activeId, onSelect: id => { selected = id; } });
    await act(async () => root.render(render('Trade')));
    const social = [...document.querySelectorAll('button')].find(b => b.textContent === 'Social');
    social.focus();
    await act(async () => social.click());
    assert.equal(selected, 'Social');
    await act(async () => root.render(render('Social')));
    assert.equal(document.activeElement, social);
    assert.equal(document.querySelector('[aria-current="page"]'), social);
    assert.match(document.querySelector('.velo-nav-lens').style.transform, /107px, 4px/);
    width = 120;
    await act(async () => observers.at(-1).callback());
    assert.match(document.querySelector('.velo-nav-lens').style.transform, /127px, 4px/);
    assert.equal(document.querySelector('.velo-nav-lens').style.width, '120px');
    await act(async () => root.render(render('Unlisted')));
    assert.equal(document.querySelector('[aria-current="page"]'), null);
    assert.equal(document.querySelector('.velo-nav-lens').dataset.ready, 'false');
  } finally {
    await act(async () => root.unmount());
    assert.ok(observers.every(observer => observer.disconnected));
    dom.window.close();
    delete globalThis.ResizeObserver;
    await rm(folder, { recursive: true, force: true });
  }
});
