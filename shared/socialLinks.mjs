const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function compactId(id) {
  if (!UUID.test(id)) return null;
  const bytes = id.replaceAll('-', '').match(/../g).map(byte => String.fromCharCode(parseInt(byte, 16))).join('');
  return btoa(bytes).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function expandId(id) {
  if (UUID.test(id)) return id.toLowerCase();
  if (!/^[A-Za-z0-9_-]{22}$/.test(id)) return null;
  try {
    const hex = Array.from(atob(id.replaceAll('-', '+').replaceAll('_', '/') + '=='), byte => byte.charCodeAt(0).toString(16).padStart(2, '0')).join('');
    const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    return compactId(uuid) === id ? uuid : null;
  } catch { return null; }
}

/** @param {string} postId @param {string | null} [commentId] */
export function postPath(postId, commentId = null) {
  const post = compactId(postId);
  const comment = commentId ? compactId(commentId) : null;
  // Optimistic posts cannot be shared until they have a persisted ID.
  if (!post || (commentId && !comment)) return null;
  return `/p/${post}${comment ? `/r/${comment}` : ''}`;
}

export function parsePostPath(path) {
  const match = path.match(/^\/(?:p\/([^/]+)(?:\/r\/([^/]+))?|social\/post\/([^/]+)(?:\/comment\/([^/]+))?)\/?$/);
  if (!match) return null;
  const postId = expandId(match[1] || match[3]);
  const rawComment = match[2] || match[4];
  const commentId = rawComment ? expandId(rawComment) : null;
  return postId && (!rawComment || commentId) ? { postId, commentId } : null;
}
