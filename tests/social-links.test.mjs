import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { compactId, expandId, postPath, parsePostPath } from '../shared/socialLinks.mjs';

test('short links retain every UUID bit and identify nested replies', () => {
  for (let i = 0; i < 100; i++) {
    const postId = randomUUID(), commentId = randomUUID();
    assert.equal(compactId(postId).length, 22);
    assert.equal(expandId(compactId(postId)), postId);
    assert.deepEqual(parsePostPath(postPath(postId, commentId)), { postId, commentId });
    assert.deepEqual(parsePostPath(`/social/post/${postId}/comment/${commentId}`), { postId, commentId });
    assert.equal(postPath(postId).length, 25);
  }
});
test('malformed, optimistic, truncated and noncanonical IDs do not become share links', () => {
  for (const id of ['temp_123', '', 'abc', '../', 'AAAAAAAAAAAAAAAAAAAAAB']) assert.equal(expandId(id), null);
  assert.equal(postPath('temp_123'), null);
  const id = randomUUID();
  assert.equal(postPath(id, 'bad'), null);
  assert.equal(parsePostPath(postPath(id) + '/extra'), null);
  assert.equal(parsePostPath('/p/not-a-post/r/not-a-reply'), null);
});
