export function socialTokenAt(text, start, end = start) {
  if (start !== end) return null;
  const match = text.slice(0, start).match(/(^|[\s([{,:;!?])([@$])([A-Za-z0-9_.-]*)$/);
  if (!match || (match[2] === '@' && /[.-]/.test(match[3]))) return null;
  return { trigger: match[2], query: match[3], start: start - match[3].length - 1, cursor: start };
}

export function insertSocialTag(text, active, token) {
  const tail = text.slice(active.cursor).match(active.trigger === '@' ? /^[A-Za-z0-9_]*/ : /^[A-Za-z0-9_.-]*/)[0];
  const after = text.slice(active.cursor + tail.length);
  const separator = !after || !/^[\s.,!?;:)\]}]/.test(after) ? ' ' : '';
  const before = text.slice(0, active.start);
  return { text: before + token + separator + after, cursor: before.length + token.length + separator.length };
}
