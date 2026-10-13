// A SHA-256 verifier is safe to deploy publicly for a randomly generated
// 256-bit token. The raw token belongs only in the calling service's secrets.
// An explicit environment secret always overrides the deployed verifier,
// including when empty/invalid, so rotation never accepts a stale fallback.
export async function tokenStatus(actual, expected, verifier, minimum = 32) {
  const hash = async value => new Uint8Array(await crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(value)));
  let target;
  if (expected !== undefined) {
    if (typeof expected !== 'string' || expected.length < minimum || expected.length > 512) return 503;
    target = await hash(expected);
  } else {
    if (!/^[a-f0-9]{64}$/.test(verifier || '')) return 503;
    target = Uint8Array.from(verifier.match(/../g), value => parseInt(value, 16));
  }
  if (typeof actual !== 'string' || actual.length < minimum || actual.length > 512) return 401;
  const supplied = await hash(actual);
  let diff = 0;
  for (let i = 0; i < target.length; i++) diff |= target[i] ^ supplied[i];
  return diff === 0 ? 0 : 401;
}
