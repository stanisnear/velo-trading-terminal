/** One UUID per pending draft, including retries after a lost response. */
export function createCommentWriter(write, read, makeId = () => crypto.randomUUID()) {
  const pending = new Map();
  /** @param {{postId: string, authorId: string, content: string, parentId?: string | null}} input */
  return async ({ postId, authorId, content, parentId = null }) => {
    const key = JSON.stringify([postId, authorId, parentId, content]);
    const id = pending.get(key) || makeId();
    pending.set(key, id);
    const row = { id, post_id: postId, author_id: authorId, content, parent_id: parentId };
    let result;
    try { result = await write(row); } catch { /* The insert may already exist. */ }
    if (!result?.data) {
      try { result = await read(id); } catch { /* Keep the same ID for Retry. */ }
    }
    const saved = result?.data;
    if (!saved || saved.id !== id || saved.post_id !== postId || saved.author_id !== authorId || saved.content !== content || (saved.parent_id || null) !== parentId) {
      throw new Error('Reply could not be confirmed. Your draft is saved here; retry to check or finish the same reply.');
    }
    pending.delete(key);
    return { data: saved, error: null };
  };
}

export function withoutCommentBranch(comments, deletedId) {
  const removed = new Set([deletedId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of comments) if (removed.has(c.parentId) && !removed.has(c.id)) { removed.add(c.id); changed = true; }
  }
  return comments.filter(c => !removed.has(c.id));
}
