import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

await mkdir('audit', { recursive: true });
const folder = await mkdtemp(path.resolve('audit/dialog-test-'));
const output = path.join(folder, 'components.mjs');
await build({
  stdin: { contents: "export { Dialog } from './src/components/ui/Dialog'; export { EditProfileModal } from './src/components/Modals';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', outfile: output,
  external: ['react', 'react-dom', 'react/jsx-runtime', 'lucide-react'],
  plugins: [{ name: 'profile-storage-fixture', setup(b) {
    b.onResolve({ filter: /supabaseStore$/ }, () => ({ path: 'store', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const supabase = {}; export const isConfigured = () => true; export const uploadAvatar = async () => ({}); export const uploadBanner = async () => ({});' }));
  } }],
});
const { Dialog, EditProfileModal } = await import(pathToFileURL(output));

function setup() {
  const dom = new JSDOM('<!doctype html><body><button id="trigger">Edit</button><div id="root"></div></body>', { url: 'https://fixture.invalid', pretendToBeVisual: true });
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  globalThis.HTMLInputElement = dom.window.HTMLInputElement;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // JSDOM does not implement the native top layer. These tests cover lifecycle,
  // cancellation and restoration, not visual stacking or the browser focus trap.
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  const root = createRoot(document.querySelector('#root'));
  return { root, close: async () => { await act(async () => root.unmount()); dom.window.close(); } };
}

test('dialog portals outside the app, labels its heading and restores trigger focus', async () => {
  const f = setup(); let closes = 0;
  try {
    const trigger = document.querySelector('#trigger'); trigger.focus();
    await act(async () => f.root.render(React.createElement(Dialog, { open: true, title: 'Markets', onClose: () => closes++ }, React.createElement('input'))));
    const dialog = document.querySelector('dialog');
    assert.equal(dialog.parentNode, document.body);
    assert.equal(dialog.open, true);
    assert.equal(document.getElementById(dialog.getAttribute('aria-labelledby')).textContent, 'Markets');
    const cancel = new window.Event('cancel', { cancelable: true });
    await act(async () => dialog.dispatchEvent(cancel));
    assert.equal(cancel.defaultPrevented, true); assert.equal(closes, 1);
    await act(async () => f.root.render(React.createElement(Dialog, { open: false, title: 'Markets', onClose: () => {} })));
    assert.equal(document.querySelector('dialog'), null); assert.equal(document.activeElement, trigger);
  } finally { await f.close(); }
});

test('busy dialog prevents Escape, backdrop and close-button dismissal', async () => {
  const f = setup(); let closes = 0;
  try {
    await act(async () => f.root.render(React.createElement(Dialog, { open: true, busy: true, title: 'Saving', onClose: () => closes++ })));
    const dialog = document.querySelector('dialog');
    await act(async () => {
      dialog.dispatchEvent(new window.Event('cancel', { cancelable: true }));
      dialog.dispatchEvent(new window.MouseEvent('click', { bubbles: true, clientX: -20, clientY: -20 }));
      dialog.querySelector('button').click();
    });
    assert.equal(dialog.getAttribute('aria-busy'), 'true');
    assert.equal(closes, 0);
  } finally { await f.close(); }
});

test('profile draft survives same-user refresh and failed save; successful retry closes', async () => {
  const f = setup(); let closes = 0; let saved; let fail = true;
  const onSave = async values => { saved = values; return fail ? { ok: false, error: 'Offline. Please retry.' } : { ok: true }; };
  const render = username => f.root.render(React.createElement(EditProfileModal, { isOpen: true, user: { id: 'fixture', username, bio: 'Draft bio' }, onClose: () => closes++, onSave }));
  try {
    await act(async () => render('original'));
    await act(async () => render('server-refresh'));
    assert.equal(document.querySelector('#edit-profile-username').value, 'original');
    const save = () => [...document.querySelectorAll('button')].find(button => button.textContent === 'Save Changes');
    await act(async () => save().click());
    assert.equal(closes, 0); assert.match(document.querySelector('[role="alert"]').textContent, /Offline/);
    assert.equal(saved.username, 'original'); assert.equal(saved.bio, 'Draft bio');
    fail = false;
    await act(async () => save().click());
    assert.equal(closes, 1);
  } finally { await f.close(); }
});

test.after(async () => { await rm(folder, { recursive: true, force: true }); });
