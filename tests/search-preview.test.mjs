import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

test('quick search routes keyboard choices, excludes informational assets from Trade, and dismisses previews with focus intact', async () => {
  const directory = await mkdtemp(path.resolve('audit/search-preview-'));
  const file = path.join(directory, 'components.mjs');
  await build({ stdin: { contents: "export {QuickSearch} from './src/components/QuickSearch';export {TraderPreview} from './src/components/social/TraderPreview';export {GlassSwitch} from './src/components/ui/GlassSwitch';", resolveDir: process.cwd(), loader: 'tsx' }, outfile: file, bundle: true, platform: 'node', format: 'esm', external: ['react', 'react-dom', 'lucide-react', 'motion/react'], plugins: [{ name: 'offline-data', setup(builder) {
    builder.onResolve({ filter: /services\/marketDiscovery$/ }, () => ({ path: 'markets', namespace: 'fixture' }));
    builder.onResolve({ filter: /services\/interfaceSound$/ }, () => ({ path: 'sound', namespace: 'fixture' }));
    builder.onResolve({ filter: /ui\/shared$/ }, () => ({ path: 'icons', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: name }) => ({ contents: name === 'markets' ? `export const useMarketDiscovery=()=>({socialAssets:[{assetId:'bitcoin',name:'Bitcoin',symbol:'BTC',price:100},{assetId:'tether',name:'Tether',symbol:'USDT',price:1}],isPending:false});export const tradingPairForAsset=asset=>asset.symbol==='BTC'?{id:'BTC-USD',symbol:'BTC'}:null;` : name === 'sound' ? 'export const playInterfaceSound=()=>{};' : 'export const VeloAssetIcon=()=>null;export const formatPrice=number=>String(number);' }));
  } }] });
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement; globalThis.Element = dom.window.Element;
  globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
  globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  dom.window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  const { createRoot } = await import('react-dom/client');
  const { QuickSearch, TraderPreview, GlassSwitch } = await import(pathToFileURL(file));
  const root = createRoot(document.querySelector('#root'));
  const selected = [];
  const person = { id: 'atlas', name: 'Atlas', handle: '@atlas', bio: 'Market notes', followers: [1, 2] };
  let setOpen;
  function Search() {
    const [open, changeOpen] = React.useState(false); setOpen = changeOpen;
    return React.createElement(QuickSearch, { open, setOpen: changeOpen, people: [person], onNavigate: value => selected.push(['page', value]), onAsset: value => selected.push(['asset', value.symbol]), onTrade: value => selected.push(['trade', value.symbol]), onProfile: value => selected.push(['person', value.id]) });
  }
  const key = (element, value, options = {}) => element.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: value, bubbles: true, ...options }));
  const click = element => element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  const category = label => [...document.querySelectorAll('[aria-label="Search category"] button')].find(button => button.textContent === label);
  try {
    await act(async () => root.render(React.createElement(Search)));
    await act(async () => key(document, 'k', { ctrlKey: true }));
    assert.ok(document.querySelector('dialog[open]'));
    assert.equal(document.activeElement, document.querySelector('[role="combobox"]'));
    await act(async () => click(category('Trade')));
    const options = [...document.querySelectorAll('[role="option"]')];
    assert.equal(options.length, 1); assert.match(options[0].textContent, /BTC/); assert.doesNotMatch(options[0].textContent, /USDT/);
    await act(async () => key(document.querySelector('input'), 'Enter'));
    assert.deepEqual(selected.pop(), ['trade', 'BTC']); assert.equal(document.querySelector('dialog'), null);
    await act(async () => setOpen(true));
    const input = document.querySelector('input');
    await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, 'tether'); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
    assert.equal(document.querySelectorAll('[role="option"]').length, 1);
    await act(async () => key(input, 'Enter')); assert.deepEqual(selected.pop(), ['asset', 'USDT']);
    await act(async () => setOpen(true)); await act(async () => click(category('People')));
    await act(async () => key(document.querySelector('input'), 'Enter')); assert.deepEqual(selected.pop(), ['person', 'atlas']);
    const blocker = document.createElement('dialog'); blocker.setAttribute('open', ''); document.body.append(blocker);
    await act(async () => key(document, 'k', { metaKey: true })); assert.equal(document.querySelectorAll('dialog').length, 1, 'shortcut does not steal focus from another modal'); blocker.remove();
    await act(async () => root.render(React.createElement(TraderPreview, { profile: person, onView: () => selected.push(['view']) }, React.createElement('button', null, 'Atlas'))));
    const trigger = document.querySelector('button');
    await act(async () => { trigger.focus(); key(trigger, 'ArrowDown'); });
    assert.ok(document.querySelector('[role="dialog"]')); assert.equal(document.activeElement.textContent, 'View profile');
    await act(async () => key(document.activeElement, 'Escape'));
    assert.equal(document.activeElement, trigger);
    await act(async () => new Promise(resolve => setTimeout(resolve, 250)));
    assert.equal(document.querySelector('[role="dialog"]'), null, 'Escape focus restoration does not reopen the preview');
    const values = [];
    await act(async () => root.render(React.createElement(GlassSwitch, { checked: true, label: 'Live updates', onChange: value => values.push(value) })));
    await act(async () => click(document.querySelector('input'))); assert.deepEqual(values, [false]);
  } finally { await act(async () => root.unmount()); dom.window.close(); await rm(directory, { recursive: true, force: true }); }
});
