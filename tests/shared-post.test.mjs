import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const folder = await mkdtemp(path.resolve('audit/shared-post-'));
const outfile = path.join(folder, 'hook.mjs');
await build({ entryPoints: ['src/services/useSharedPost.ts'], bundle: true, platform: 'node', format: 'esm', outfile, external: ['react'], plugins: [{ name: 'store-fixture', setup(b) {
  b.onResolve({ filter: /supabaseStore$/ }, () => ({ path: 'store', namespace: 'fixture' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const fetchPostById = id => globalThis.__sharedPostLookup(id);' }));
} }] });
const { useSharedPost } = await import(pathToFileURL(outfile));
test('shared nested links stay loading, retry errors, and ignore stale navigation responses', async () => {
  const dom = new JSDOM('<div id="root"></div>');
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.querySelector('#root')); const pending = []; let latest, loaded;
  globalThis.__sharedPostLookup = id => new Promise((resolve, reject) => pending.push({ id, resolve, reject }));
  function View({ postId, commentId }) { latest = useSharedPost(postId, commentId, post => { loaded = post; }); return React.createElement('div', {}, latest.status); }
  try {
    await act(async () => root.render(React.createElement(View, { postId: 'one', commentId: 'nested' })));
    assert.equal(document.body.textContent, 'loading');
    await act(async () => pending.shift().reject(new Error('offline'))); assert.equal(latest.status, 'error');
    await act(async () => latest.retry()); assert.equal(latest.status, 'loading');
    await act(async () => pending.shift().resolve({ id: 'one', comments: [{ id: 'nested', parentId: 'parent' }] }));
    assert.equal(latest.status, 'ready'); assert.equal(loaded.comments[0].id, 'nested');
    await act(async () => root.render(React.createElement(View, { postId: 'two', commentId: 'child' })));
    const stale = pending.shift();
    await act(async () => root.render(React.createElement(View, { postId: 'three', commentId: 'child' })));
    await act(async () => stale.resolve(null)); assert.equal(latest.status, 'loading');
    await act(async () => pending.shift().resolve(null)); assert.equal(latest.status, 'missing');
  } finally { await act(async () => root.unmount()); dom.window.close(); }
});
test.after(() => rm(folder, { recursive: true, force: true }));
