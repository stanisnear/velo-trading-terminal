import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommentWriter, withoutCommentBranch } from '../src/services/commentPersistence.mjs';
const draft = { postId: 'post', authorId: 'author', content: 'nested reply', parentId: 'parent' };
test('a saved reply survives a lost insert response with its real UUID', async () => {
  let saved;
  const send = createCommentWriter(async row => { saved = row; throw new Error('timeout'); }, async id => ({ data: id === saved.id ? saved : null }), () => 'uuid-one');
  const result = await send(draft); assert.equal(result.data.id, 'uuid-one'); assert.equal(result.data.parent_id, 'parent');
});
test('an ambiguous retry uses the same ID and creates only one reply', async () => {
  let readable = false, allocations = 0; const saved = new Map(), ids = [];
  const send = createCommentWriter(async row => { ids.push(row.id); saved.set(row.id, row); return { data: null }; }, async id => ({ data: readable ? saved.get(id) : null }), () => `id-${++allocations}`);
  await assert.rejects(send(draft), /could not be confirmed/);
  readable = true;
  assert.equal((await send(draft)).data.id, 'id-1'); assert.equal(saved.size, 1); assert.deepEqual(ids, ['id-1', 'id-1']);
});
test('a foreign or mismatched row is never accepted as a confirmed reply', async () => {
  const send = createCommentWriter(async row => ({ data: { ...row, author_id: 'other' } }), async () => ({ data: null }), () => 'one');
  await assert.rejects(send(draft), /could not be confirmed/);
});
test('comment deletion removes every descendant and preserves unrelated branches', () => {
  const rows = [{ id: 'root' }, { id: 'child', parentId: 'root' }, { id: 'grandchild', parentId: 'child' }, { id: 'greatgrandchild', parentId: 'grandchild' }, { id: 'other' }];
  assert.deepEqual(withoutCommentBranch(rows, 'root'), [{ id: 'other' }]);
});
