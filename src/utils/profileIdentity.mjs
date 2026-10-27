// Wallet-auth metadata is a bootstrap identity, never a public username.
export const isWalletPlaceholder = name => typeof name === 'string' && /^@?wallet_[0-9a-f]{40}$/i.test(name);
export function profileDisplayName(profile) {
  if (typeof profile?.username === 'string' && profile.username.trim() && !isWalletPlaceholder(profile.username)) return profile.username;
  if (typeof profile?.handle === 'string' && profile.handle.trim() && !isWalletPlaceholder(profile.handle)) return profile.handle.replace(/^@/, '');
  return 'Trader';
}
// A newer onboarding/profile result always wins over an older session read.
export function createProfileHydrationGate() {
  let revision = 0;
  return { begin: () => ++revision, current: ticket => ticket === revision, invalidate: () => { ++revision; } };
}
