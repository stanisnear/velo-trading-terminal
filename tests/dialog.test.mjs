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
  stdin: { contents: "export { Dialog } from './src/components/ui/Dialog'; export { EditProfileModal } from './src/components/Modals'; export { AccountChoiceDialog } from './src/components/AccountChoiceDialog'; export { PostReactions, ReactionContext } from './src/components/social/PostReactions'; export { MobileSidebar } from './src/components/Navigation';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', outfile: output,
  external: ['react', 'react-dom', 'react/jsx-runtime', 'lucide-react'],
  plugins: [{ name: 'profile-storage-fixture', setup(b) {
    b.onResolve({ filter: /WalletConnectButton$/ }, () => ({ path: 'wallet', namespace: 'wallet-fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'wallet-fixture' }, () => ({ contents: 'export const WalletConnectButton = () => null;' }));
    b.onResolve({ filter: /supabaseStore$/ }, () => ({ path: 'store', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const supabase = {}; export const isConfigured = () => true; export const uploadAvatar = async () => ({}); export const uploadBanner = async () => ({});' }));
  } }],
});
const { Dialog, EditProfileModal, AccountChoiceDialog, PostReactions, ReactionContext, MobileSidebar } = await import(pathToFileURL(output));

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

test('account chooser never signs in implicitly and allows another account', async () => {
  const f = setup(); let continues = 0; let switches = 0;
  const render = (address, busy = false) => f.root.render(React.createElement(AccountChoiceDialog, {
    open: true, address, busy, onClose() {}, onContinue: () => continues++, onSwitch: () => switches++,
  }));
  const button = text => [...document.querySelectorAll('button')].find(b => b.textContent.includes(text));
  try {
    await act(async () => render('0x1234567890abcdef'));
    assert.equal(continues, 0); assert.equal(switches, 0);
    await act(async () => button('Use a different account').click());
    assert.equal(switches, 1); assert.equal(continues, 0);
    await act(async () => render('0x1234567890abcdef', true));
    await act(async () => button('Continue with connected wallet').click());
    assert.equal(continues, 0);
    await act(async () => render(undefined));
    assert.equal(button('Continue with connected wallet'), undefined);
    await act(async () => button('Choose an account').click());
    assert.equal(switches, 2);
  } finally { await f.close(); }
});

test('reactions require authentication, support removal and recover after failure', async () => {
  const f = setup(); let signIns = 0; let fail = true; const writes = [];
  const post = { id: 'post', reactions: [{ userId: 'me', kind: 'bullish' }] };
  const render = userId => f.root.render(React.createElement(ReactionContext.Provider, {
    value: { userId, requireAuth: () => signIns++, react: async (...args) => {
      writes.push(args); if (fail) throw new Error('Offline');
    } },
  }, React.createElement(PostReactions, { post })));
  try {
    await act(async () => render(undefined));
    await act(async () => document.querySelector('[title="Bullish"]').click());
    assert.equal(signIns, 1); assert.equal(writes.length, 0);
    await act(async () => render('me'));
    assert.equal(document.querySelector('[title="Bullish"]').getAttribute('aria-pressed'), 'true');
    await act(async () => document.querySelector('[title="Bullish"]').click());
    assert.deepEqual(writes[0], ['post', null]);
    assert.match(document.querySelector('[role="alert"]').textContent, /not saved/);
    fail = false;
    await act(async () => document.querySelector('[aria-label="React to this post"]').click());
    await act(async () => document.querySelector('[title="Insightful"]').click());
    assert.deepEqual(writes[1], ['post', 'insightful']);
    assert.equal(document.querySelector('[role="alert"]'), null);
  } finally { await f.close(); }
});

test('navigation drawer is inert when closed, traps focus when open and restores focus on close', async () => {
  const f = setup(); let closes = 0;
  const render = isOpen => f.root.render(React.createElement(MobileSidebar, {
    isOpen, setSidebarOpen: () => closes++, setActiveTab() {}, toggleTheme() {}, theme: 'dark',
  }));
  try {
    const trigger = document.querySelector('#trigger'); trigger.focus();
    await act(async () => render(false));
    const drawer = document.querySelector('[role="dialog"]');
    assert.equal(drawer.hasAttribute('inert'), true);
    assert.equal(drawer.style.visibility, 'hidden');
    assert.equal(drawer.style.boxShadow, 'none');
    await act(async () => render(true));
    assert.equal(drawer.hasAttribute('inert'), false);
    assert.equal(document.activeElement.getAttribute('aria-label'), 'Close navigation');
    assert.equal(document.body.style.overflow, 'hidden');
    const buttons = drawer.querySelectorAll('button'); const last = buttons[buttons.length - 1];
    last.focus();
    await act(async () => last.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })));
    assert.equal(document.activeElement, buttons[0]);
    await act(async () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    assert.equal(closes, 1);
    await act(async () => render(false));
    assert.equal(document.activeElement, trigger);
    assert.equal(document.body.style.overflow, '');
  } finally { await f.close(); }
});

test.after(async () => { await rm(folder, { recursive: true, force: true }); });
test('Tab wraps between dialog controls and skips inert collapsed controls',async()=>{
 const f=setup();try {
  await act(async()=>f.root.render(React.createElement(Dialog,{open:true,title:'Details',onClose:()=>{}},React.createElement('div',null,React.createElement('div',{inert:true},React.createElement('button',null,'Collapsed')),React.createElement('button',{id:'last'},'Done')))));
  const first=document.querySelector('.velo-dialog-close'),last=document.querySelector('#last');
  last.focus();await act(async()=>last.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true})));assert.equal(document.activeElement,first);
  await act(async()=>first.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true})));assert.equal(document.activeElement,last);
 }finally{await f.close();}
});
