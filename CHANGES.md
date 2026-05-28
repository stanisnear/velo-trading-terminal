# Build 105 — Vercel build fix + aggressive logout cache purge

This is a **complete replacement bundle**. It contains every file touched
in builds 103 + 104 + this one, so it doesn't matter what state your
repo is in — unzip over the top and you're consistent.

Files changed:

```
src/App.tsx
src/services/supabaseStore.ts
src/components/AuthModal.tsx
src/components/SettingsModal.tsx
src/components/ui/OrderDetailsModal.tsx
SUPABASE_MIGRATION_BUILD81.sql
```

`vite build` clean. No new TypeScript errors versus the baseline.

The build81 SQL migration is unchanged; only re-run it if you skipped it.

---

## 1. Vercel build was failing

```
src/App.tsx:80:2  subscribeUserTransactions
```

Build 104 only contained `src/App.tsx` and assumed `supabaseStore.ts`
already had `subscribeUserTransactions`, `recordTransactionForUser`, and
`createNotificationForUser` from build 103. Whatever state your repo was
in didn't have those exports, so Rollup couldn't resolve the import.

Fix: this build ships the full set of files. Unzip and replace; the
import will resolve.

## 2. Logout — aggressive localStorage purge ("remove all cache")

You called it: the only safe logout is one that wipes everything that
isn't an opted-in UI preference. Build 105 inverts the previous approach
— instead of a hand-maintained blocklist (`velo_session*`,
`velo_pending_deposits*`), we now use an **allowlist**: anything in
localStorage that isn't on this short list gets removed on logout.

Kept on logout:

  - `velo_burner_<owner>` — deterministic sub-account; nuking it forces
    a fresh personal_sign on every re-login, which neither Hyperliquid
    nor Lyra do.
  - `orderly_kp_<addr>` — Orderly trading keypair (same rationale as
    burner).
  - `velo_theme` — light/dark UI preference.
  - `velo_fav_markets` — watchlist.

Everything else is wiped, including:

  - All wagmi connector state (`wagmi.*`)
  - All WalletConnect session keys (`wc@*`)
  - All AppKit session keys (`appkit*`)
  - All Supabase auth tokens (`sb-*`)
  - Any other `velo_*` keys that aren't on the allowlist
  - All `walletconnect-*` keys
  - All sessionStorage (entirely cleared via `sessionStorage.clear()`
    — connectors use it for OAuth/WalletConnect round-trips)

Combined with the build 104 hard-navigation (`window.location.replace('/')`
1200ms after the LOGOUT animation starts), the next page tree loads with
no session state of any kind. If you click Logout and it doesn't fully
log you out after this build, the only remaining failure mode is the
browser itself caching the JS bundle (which is an HTTP cache issue, not
a localStorage issue — and the bundle is identical pre/post-login, so
that wouldn't manifest as "still logged in" anyway).

## 3. Receiver-side failures are no longer silent

Build 103's `createNotificationForUser` and `recordTransactionForUser`
helpers swallowed RPC errors with `console.warn`. The sender's try/catch
in App.tsx couldn't see them, so the ERROR toast I added in build 104
never fired. Now both helpers throw on RPC failure, the caller catches,
and the sender sees a precise toast like:

  - "Recipient lookup ok but notification insert failed: ..."
  - "Recipient activity row insert failed: ..."
  - "Couldn't save your activity row: ..."

If the receiver still gets nothing after this build, the sender will know
why within ~1 second. Paste the toast message back if it happens — it'll
be a precise Supabase error code (`42501` = RLS deny, `42883` = function
missing, `23514` = check constraint violation, etc.) that tells us
exactly which knob to turn.

## 4. Activity disappearing on refresh — my theory

You suggested this was related to the SQL migration. Looking again at
build 81: it adds INSERT policies and an RPC, but doesn't change SELECT
policies — those were set up in `SUPABASE_MIGRATION_RLS_ACTIVITY.sql` to
allow `auth.uid() = user_id` reads. Build 81 doesn't disable them.

The more likely culprit is that the sender's own `recordTransaction`
call was silently failing. The previous code path:

  - `recordTransaction()` throws → caught by App.tsx → `console.warn`
  - Sender sees the "Sent" success toast for the *on-chain* transfer
  - DB has no row → next refresh, `fetchTransactions` returns []
  - Activity table is empty

With build 105, that silent failure produces a visible ERROR toast on
the sender ("Couldn't save your activity row: ..."). Try a send and see
if a toast appears. If yes, the toast text tells us which Supabase
constraint is rejecting the insert. If no toast and activity STILL
disappears on refresh, the issue is elsewhere — let me know and I'll
look at it from a different angle.

---

## Verify

1. **Vercel build passes.** Push, Vercel should compile clean.

2. **Logout = clean slate.** Open DevTools → Application → Local Storage,
   note the keys. Click Logout. After the page reloads, recheck Local
   Storage — only `velo_burner_*`, `orderly_kp_*`, `velo_theme`, and
   `velo_fav_markets` should remain. Everything else (wagmi, wc@,
   appkit, sb-, etc) is gone. The navbar shows "Log In". Back button
   stays on logged-out view.

3. **Send between two profiles — failures are loud.** If anything goes
   wrong receiver-side, the sender sees a red toast within ~1 second of
   the on-chain confirmation. Take a screenshot of any such toast.

4. **Recent activity persists across refresh.** Send, see your SEND row
   in Recent Activity, then refresh. The row should still be there. If
   it isn't AND you didn't see any error toast on send, that's a new
   shape of bug — let me know.
