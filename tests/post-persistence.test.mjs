import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostWriter } from '../src/services/postPersistence.mjs';
const fields = { author_id: 'author', content: 'A draft', target_profile_id: null };

test('published posts recover the real UUID after a lost insert response', async () => {
  let stored;
  const write = createPostWriter(async row => { stored = row; throw new Error('network'); }, async () => ({ data: stored }), () => 'uuid');
  assert.equal((await write(fields)).data.id, 'uuid');
});
test('an unconfirmed post retries the same UUID and never returns a temporary URL', async () => {
  const ids = []; let available = false;
  const write = createPostWriter(async row => { ids.push(row.id); return available ? { data: row } : {}; }, async () => ({}), () => String(Math.random()));
  await assert.rejects(write(fields), /not be confirmed/);
  available = true;
  await write(fields);
  assert.equal(ids[0], ids[1]);
});
test('mismatched post data cannot be accepted as confirmation', async () => {
  const write = createPostWriter(async () => ({}), async id => ({ data: { ...fields, id, author_id: 'someone-else' } }));
  await assert.rejects(write(fields), /not be confirmed/);
});
