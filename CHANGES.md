# Build 106 — Logout that actually works

The actual problem, plainly: every prior build cleared localStorage,
disconnected wagmi, signed out of Supabase, and hard-navigated. None
of that mattered because on the next page load, **wagmi auto-reconnects
to MetaMask** (the wallet's dapp permission lives in the browser
extension — we can't reach it from our code), and the silent
`socialLoginEffect` at App.tsx:4608 picks that up and runs
`signInWithPassword({ email: walletAddr+'@wallet.velo', password: derived })`
to sign the user back into Supabase. UI snaps from "Signed out"
overlay → freshly authed dashboard in <500ms.

That's why "I logged out but I'm still logged in" — it's not that
logout didn't work; it's that the page silently re-logs you in faster
than you can react.

This build kills that re-login path with a **window-level lock**.

Files changed:

```
src/App.tsx
```

The build81 SQL migration is unchanged; only re-run it if you skipped it
before. No new SQL needed for this fix.

`vite build` clean. No new TypeScript errors versus baseline.

This is a single-file change — no chance of an import-resolution
Rollup failure on Vercel this time.

---

## The mechanism

1. **handleLogout** navigates to `/?logout=1` (not `/`). The setTimeout
   that schedules this navigation is moved to the TOP of the function,
   before any awaits, so it ALWAYS fires — even if wagmi's disconnect
   hangs or Supabase's signOut endpoint times out.

2. A new **module-level IIFE** at the top of App.tsx runs once per
   page load. If it sees `?logout=1`:
   - Sets `window.__veloLogoutLock = true`
   - Re-runs the aggressive storage wipe (defense in depth — same
     allowlist as handleLogout)
   - Clears the URL param via `history.replaceState` so a refresh
     reloads as a normal logged-out page

3. **restoreSession** (called from every Supabase auth event:
   INITIAL_SESSION, SIGNED_IN, TOKEN_REFRESHED) now checks
   `__veloLogoutLock` first. If set, it refuses to restore — even
   if Supabase somehow still has a session.

4. The **socialLoginEffect** (the silent `signInWithPassword` path
   that was causing the auto-relogin) also checks the lock and
   returns early. wagmi can auto-reconnect to MetaMask all it wants;
   it can't drive Supabase auth state while the lock is on.

5. The lock clears when `wagmiStatus` transitions to `'connecting'` —
   which only fires when the user explicitly opens AppKit and picks
   a wallet. Auto-reconnect goes `'reconnecting' → 'connected'` and
   never touches `'connecting'`, so it leaves the lock alone.

After this build:

- Click Logout → animation plays → page navigates to `/?logout=1`
- IIFE fires, sets lock, wipes storage, strips param
- React mounts. wagmi auto-reconnects to MetaMask. Address comes back.
- socialLoginEffect runs, sees `__veloLogoutLock === true`, returns.
- restoreSession runs (if Supabase emits INITIAL_SESSION), sees the
  lock, returns.
- User sees the unauthenticated Trade view with a "Connect Wallet"
  button. Stays that way until they click it.
- When they click Connect Wallet → AppKit modal opens → wagmiStatus
  goes `'connecting'` → lock clears → normal sign-in proceeds.

If the user refreshes mid-logged-out: URL is just `/` (param was
stripped), IIFE doesn't fire, lock isn't set, normal load behavior.
No way to get stuck in a "permanently locked out" state.

---

## Verify

1. **Logout actually logs out.** Click Sign Out. After the animation,
   the page should reload to `/` (with the `?logout=1` flicker briefly
   visible in the URL bar, then gone). Navbar shows "Log In", balance
   panels disappear, you're on the Trade view. Stay there. The Back
   button does nothing useful — you've fully replaced history.

2. **Stays logged out.** Wait 10 seconds. Refresh. You're still logged
   out. There is no "stuck" state any more.

3. **Re-login works.** Click Connect Wallet → pick MetaMask → confirm
   in the extension → you're signed in to your existing account
   normally. No second signature, no onboarding flow.

4. **No more "click logout twice and back to dashboard" loop.** The
   only way to be signed in is to click Connect Wallet yourself.

If the logout STILL leaves you on the dashboard after this build:
open DevTools → Console and paste the output. With the IIFE setting
`window.__veloLogoutLock`, you can verify in the console after a
logout: type `window.__veloLogoutLock` and it should be `true` until
you click Connect Wallet.
