# Build 103 — Auth/logout reliability + peer-to-peer transfer UX

Files changed:

```
src/App.tsx
src/services/supabaseStore.ts
src/components/AuthModal.tsx
src/components/SettingsModal.tsx
src/components/ui/OrderDetailsModal.tsx
SUPABASE_MIGRATION_BUILD81.sql   (new)
```

`vite build` clean.

You **must apply `SUPABASE_MIGRATION_BUILD81.sql`** in Supabase SQL editor before
this build's send/receive UX works end-to-end. The frontend falls back to
direct inserts if the RPCs aren't present, but those will be rejected by RLS
in production-mode RLS policies — which the migration also tightens.

---

## 1. Logout is now actually a logout

**The bug:** `handleLogout` cleared React state but never cleared the
`velo_session_v1` localStorage snapshot. On next page load `readSessionCache()`
hydrated `user` from stale data **before** Supabase confirmed there was no
session. With two Chrome profiles racing on the same hosted page, the older
profile would render as logged-in for ~1s and ended up displaying a frozen
view of an account that had since been signed out elsewhere. Logout looked
"sometimes broken" because it was: the in-memory state was correct, the on-disk
cache wasn't.

**The fix:** centralised the cache-clear into the `signOut` helper in
`supabaseStore.ts`, called atomically before `supabase.auth.signOut()`. The
helper also drops every active realtime channel so the next session starts on
a clean slate. `handleLogout` now follows a strict order: `intentionalLogoutRef`
→ `clearSessionCache()` → wagmi disconnect → supabase signOut → React state
reset → redirect to Trade.

For belt-and-suspenders, the `SIGNED_OUT` event handler also clears the cache —
covers Supabase-side session expiry and cross-tab `signOut` (one tab logs out,
the other tab's `onAuthStateChange` fires). The AuthModal "Switch to current"
path got the same treatment.

The burner-wallet localStorage entry (`velo_burner_<owner>`) is intentionally
**not** cleared on logout — it's a deterministic sub-account derived from the
owner's signature, so wiping it would force a fresh personal_sign on every
re-login. Closest industry analog is Hyperliquid's API wallet, which behaves
identically.

## 2. Send button — always visible, disabled when balance is 0

**The bug:** in Settings, the Send action was hidden when `veloUsdc <= 0`. With
two browser profiles where one had funds and one didn't, the empty profile
looked like Send was broken — there was no UI affordance to explain *why* it
wasn't there.

**The fix:** `ActBtn` got a `disabled` prop. Send always renders; when
balance is 0 it's greyed out with a tooltip ("Deposit mUSDC to your trading
wallet first"). Matches Binance and Hyperliquid: action lives where you
expect it, the disabled state tells you the precondition. The dashboard
Send button was already always-visible.

## 3. Peer-to-peer transfers — receiver gets notified AND sees the activity

**The bugs:** the original send flow only created a receiver-side notification
when the sender typed a `@username`. Sending by raw 0x address — even to a
Velo user — never notified them. And even when it *did* fire, the receiver's
Recent Activity didn't update until the next focus refetch, so clicking the
notification dumped them on the Dashboard with no matching row to show. To
top it off, the notification handler had no `TRANSFER_SENT`/`TRANSFER_RECEIVED`
case — the click did nothing useful.

**The fixes, layered:**

- **Broadened recipient lookup.** Receiver-side notification + activity row
  now resolve the recipient profile by `handle`, `username`, `wallet_address`,
  or `velo_wallet_address` — any column that could match. A single `.or()`
  query keeps it to one round-trip.
- **Cross-user inserts via SECURITY DEFINER RPCs.** The sender's auth context
  can't, under proper RLS, write a row owned by the recipient. New SQL RPCs
  `create_notification_for_user` and `record_transaction_for_user` accept the
  insert after server-side validation: caller is authenticated, target ≠ self,
  type is on a small allowlist (`TRANSFER_RECEIVED` / `TRANSFER_SENT`),
  amount > 0, tx_hash idempotency (no duplicate RECEIVE rows for the same
  hash). The frontend helpers fall back to a direct insert if the RPCs aren't
  deployed yet (early-dev environments with permissive RLS), so this build
  doesn't hard-break on rollback.
- **Realtime transactions.** New `subscribeUserTransactions` channel + a SQL
  `alter publication supabase_realtime add table public.transactions` so the
  receiver's app sees the RECEIVE row appear in Recent Activity the instant
  the SEND lands. Local dedup by `id` prevents the sender's optimistic row
  from doubling up with the realtime echo of the same row.
- **Notification routing.** `TRANSFER_SENT` / `TRANSFER_RECEIVED` now open
  the `OrderDetailsModal` in `TRANSACTION` mode, with full counterparty + tx
  hash + BaseScan link. If the row isn't in local state yet (realtime race),
  it's fetched directly from Supabase by `tx_hash` and spliced in.
- **Transaction details modal upgrade.** `OrderDetailsModal` was DEPOSIT/
  WITHDRAW only. Now renders four kinds (Deposit / Withdrawal / Sent /
  Received) with the right hero label, direction-aware colors, and a "To" /
  "From" counterparty row showing the @handle or short address. Header pill
  shows the actual transaction type.

## 4. SQL migration — what it does

`SUPABASE_MIGRATION_BUILD81.sql`:

1. Creates `create_notification_for_user(uuid, text, text, text)` —
   SECURITY DEFINER RPC, granted to `authenticated`. Allowlist on `type`,
   message length bounded, blocks self-targeting (use direct insert for
   self).
2. Creates `record_transaction_for_user(uuid, text, numeric, text, text, boolean)` —
   SECURITY DEFINER RPC. Only `RECEIVE` is allowed cross-user. Idempotency
   guard: if a `RECEIVE` with the same `tx_hash` already exists for the
   target, returns early — protects against double-tap and sender retry.
3. Adds `public.transactions` to the `supabase_realtime` publication
   (idempotent — checks `pg_publication_tables` first).
4. Tightens RLS on `notifications` and `transactions` — strict self-only
   insert via the `*_insert_self` policies. Cross-user writes can only come
   through the two RPCs.

Idempotent. Safe to re-run.

---

## Verify

1. **Logout cleanly clears everything.** Log in, open DevTools Application
   tab → localStorage → confirm `velo_session_v1` is present. Click Logout.
   Confirm `velo_session_v1` is gone, the page redirects to Trade, the
   navbar shows "Log In". Refresh — no flash of the previous user.
2. **Two-profile sanity.** Open Chrome profile A and B side-by-side, log in
   as two different accounts. Send mUSDC from A to B by typing B's
   `@handle`. B's notification bell pulses within a second (realtime), the
   Recent Activity row appears at the same time, clicking the notification
   opens the OrderDetailsModal with "From @{A's handle}" and the BaseScan
   link.
3. **Address-only send.** Same as above but type B's raw `0x…` address
   instead of their @handle. B still gets a notification and a RECEIVE row
   (this was broken before — only @handle sends notified).
4. **Send button never just vanishes.** Log in with an account that has 0
   mUSDC in its trading wallet. Open Settings. Send is visible but greyed
   out; hovering shows "Deposit mUSDC to your trading wallet first".
   Deposit mUSDC, reopen Settings — Send is now active.
5. **Notification click for deposits/withdraws** still opens
   OrderDetailsModal (regression check — the new SEND/RECEIVE cases were
   added alongside, not in place of, the existing DEPOSIT/WITHDRAW rendering).
