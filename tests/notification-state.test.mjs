import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeNotifications } from '../src/services/notificationState.mjs';
test('a stale refresh cannot undo an acknowledged read or duplicate a realtime delivery', () => {
  const old = { id:'one', timestamp:1, read:false, postId:'post', commentId:'reply' };
  const rows = mergeNotifications([old], [old,old], new Set(['one']));
  assert.equal(rows.length,1); assert.equal(rows[0].read,true); assert.equal(rows[0].commentId,'reply');
});
test('server refresh removes stale rows while preserving events delivered during the request', () => {
  const rows=mergeNotifications([{id:'deleted',timestamp:1},{id:'new',timestamp:20}], [{id:'server',timestamp:2}],new Set(),10);
  assert.deepEqual(rows.map(row=>row.id),['new','server']);
  assert.deepEqual(mergeNotifications(rows,[{id:'server',suppressed:true}]).map(row=>row.id),['new']);
  assert.deepEqual(mergeNotifications(rows,[{id:'new',__event:'DELETE'}]).map(row=>row.id),['server']);
});
