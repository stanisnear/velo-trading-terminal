// Reuse a draft UUID after a lost response so Retry cannot publish a duplicate.
const canonical = value => value && typeof value === 'object'
  ? Array.isArray(value) ? value.map(canonical) : Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export function createPostWriter(write, read, makeId = () => crypto.randomUUID()) {
  const pending = new Map();
  return async fields => {
    const key = JSON.stringify(fields);
    const id = pending.get(key) || makeId();
    pending.set(key, id);
    let result;
    try { result = await write({ ...fields, id }); } catch { /* Confirm a possibly committed insert. */ }
    if (!result?.data) {
      try { result = await read(id); } catch { /* Keep the UUID for Retry. */ }
    }
    const saved = result?.data;
    if (!saved || saved.id !== id || Object.entries(fields).some(([field, value]) => JSON.stringify(canonical(saved[field])) !== JSON.stringify(canonical(value)))) {
      throw new Error('Post could not be confirmed. Your draft is still here; retry to check or finish the same post.');
    }
    pending.delete(key);
    return { data: saved, error: null };
  };
}
