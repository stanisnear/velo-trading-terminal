import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

test('toasts allow time to read, preserve focus, and keep errors visible', async () => {
  const { outputFiles } = await build({
    stdin: {
      contents: `
        import React, { act, useState } from 'react';
        import { createRoot } from 'react-dom/client';
        import { ToastNotification } from './src/components/ui/shared';
        function Fixture() {
          const [notice, setNotice] = useState({ type: 'SUCCESS', message: 'Position opened', detail: 'SOL/USD' });
          return <>
            <button id="reject" onClick={() => setNotice({ type: 'ERROR', message: 'Order rejected' })}>Reject</button>
            <button id="confirm" onClick={() => setNotice({ type: 'SUCCESS', message: 'Position closed' })}>Confirm</button>
            <ToastNotification notification={notice} onClose={() => setNotice(null)} />
          </>;
        }
        window.act = act;
        act(() => createRoot(document.getElementById('root')).render(<Fixture />));
      `,
      resolveDir: process.cwd(),
      loader: 'tsx',
    },
    bundle: true,
    write: false,
  });
  const { window } = new JSDOM('<div id="root"></div>', { runScripts: 'outside-only', url: 'https://fixture.invalid' });
  const timers = new Map();
  let timerId = 0;
  window.setTimeout = (callback, delay) => {
    timers.set(++timerId, { callback, delay });
    return timerId;
  };
  window.clearTimeout = id => timers.delete(id);
  window.IS_REACT_ACT_ENVIRONMENT = true;

  try {
    window.eval(outputFiles[0].text);
    const query = selector => window.document.querySelector(selector);
    const click = selector => window.act(() => query(selector).click());
    const dismissalTimers = () => [...timers.values()].filter(({ delay }) => delay === 4000 || delay === 6000);
    const pointer = type => window.act(() => query('.velo-toast').dispatchEvent(new window.PointerEvent(type, {
      bubbles: true,
      pointerType: 'mouse',
    })));

    assert.equal(dismissalTimers().length, 1);
    pointer('pointerover');
    assert.equal(dismissalTimers().length, 0);
    pointer('pointerout');
    assert.equal(dismissalTimers().length, 1);

    const trigger = query('#confirm');
    window.act(() => {
      trigger.focus();
      query('.velo-toast__close').focus();
    });
    assert.equal(dismissalTimers().length, 0);
    click('.velo-toast__close');
    assert.equal(query('.velo-toast'), null);
    assert.equal(window.document.activeElement, trigger);

    click('#reject');
    assert.equal(query('[role=alert]').textContent, 'Order rejected');
    assert.equal(dismissalTimers().length, 0);
    click('#confirm');
    assert.equal(query('[role=alert]').textContent, '');
    const [timer] = dismissalTimers();
    assert.equal(timer?.delay, 4000);
    window.act(() => timer.callback());
    assert.equal(query('.velo-toast'), null);
  } finally {
    window.close();
  }
});
