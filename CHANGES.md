# Build 104 — Bulletproof logout + reliable receiver-side notifications

Files changed:

```
src/App.tsx
```

No SQL changes. The build81 migration is still the only one you need for cross-user transfers.

`vite build` clean. No new TypeScript errors versus baseline.

---

## 1. Logout — hard navigation as the final step

**The bug:** clicking Logout left the UI showing the prior user (velo6, $0.00,
trading wallet still rendered). React state was being set to null, the
session cache was being cleared, but the dashboard kept rendering. Two
contributing race conditions:

  a. `walletDisconnectRef.current?.()` was fire-and-forget. wagmi v2's
     `disconnect` is async; the connector hasn't actually finished tearing
     down when the next line of code runs. There's a window where
     `useAccount().isConnected` is still true after `setUser(null)`.
  b. The SIGNED_OUT handler arms a 1200ms timer to re-evaluate the
     socialLoginEffect (so a fresh wallet connect right after logout still
     opens onboarding). If the wagmi connector is still alive when that
     timer fires — possible thanks to (a) — and the connector's storage
     replay momentarily flips `freshWalletConnectRef.current` true via the
     'connecting' transition, the effect silently signs the user back in
     using the same wallet/Supabase session that supposedly just signed
     out. The user ends up on the dashboard again, often before the
     LOGOUT animation overlay finishes fading.

**The fix:** mirror what Twitter, Binance, and Hyperliquid do — every
logout ends with a hard navigation to the unauthenticated root. After all
the React-state and localStorage clears, we wait 1200ms (long enough for
the LOGOUT overlay to be visibly recognised) and call
`window.location.replace('/')`. The new page tree starts with a clean
module load — no in-flight Promises from the prior session can resurrect
state, the back button can't reach the authed view, and any wagmi
auto-reconnect attempt re-enters from a clean slate.

While we're here:

- `walletDisconnectRef.current?.()` is now awaited if it returns a
  Promise. Closes the race in (a) for any code path that doesn't fall
  through to the hard navigation.
- localStorage cleanup is expanded: any `velo_session*` and
  `velo_pending_deposits*` keys are wiped alongside `velo_session_v1`.
  Burner-wallet entries (`velo_burner_<owner>`) deliberately survive —
  they're deterministic sub-accounts, not session state.

If you still see "stuck on logged-in dashboard after click" after this
build, capture a console log and a screenshot of localStorage at that
moment — the only remaining failure mode would be the navigation itself
being blocked (CSP / sandboxed iframe), and the `try/catch` fallback to
`window.location.href = '/'` handles even that.

## 2. Receiver-side notification + activity row — sequential lookup

**The bug:** transfers were on-chain succeeding, the sender saw their
SEND row, but the receiver got no `TRANSFER_RECEIVED` notification and
no `RECEIVE` activity row. The build103 receiver lookup used a single
`.or()` filter against `profiles` joining handle, username, wallet_address
and velo_wallet_address. PostgREST's `.or()` is a *string-format* filter
and a wallet's full hex address inside a comma-separated `.ilike.<value>`
fragment is a known footgun — it parses inconsistently and silently
returns zero rows when a comma-escape isn't applied to the embedded
value. So `recipientProfile` came back null, the whole "if receiver is a
Velo user" branch was skipped, and the receiver app got nothing.

**The fix:** sequential, one-column-at-a-time lookups. We try in order:

  1. `velo_wallet_address` ILIKE the sent-to address (this is what the
     on-chain transfer actually went to — most-specific match first).
  2. `wallet_address` ILIKE the sent-to address (covers users who haven't
     activated a trading wallet yet).
  3. `handle` ILIKE `<recipientHandle>` (typed `@user` without @).
  4. `handle` ILIKE `@<recipientHandle>` (DB usually stores with @).
  5. `username` ILIKE `<recipientHandle>`.

Stop on first hit. Each attempt logs its own warning if Supabase returns
an error, so the sender's console tells you exactly which column matched
or which one failed.

Errors from the cross-user RPCs (`createNotificationForUser`,
`recordTransactionForUser`) now surface as ERROR toasts on the sender's
screen rather than getting buried in `console.warn`. If the receiver
isn't getting anything, the sender now sees *why*. Same treatment for
the sender's own activity-row insert — if their `recordTransaction`
throws (RLS misconfig, schema mismatch, network blip), they see "Couldn't
save your activity row: \<reason\>" instead of believing the transfer
fully succeeded only to find the row missing on refresh. This also
explains the build103 "activity wiped on refresh" report: the sender's
insert was failing silently. Now it can't.

---

## Verify

1. **Logout actually logs out.** From any tab, click your avatar →
   Logout. The LOGOUT overlay shows for ~1.2s, then the page reloads
   to `/` with the Trade tab visible and the "Log In" button in the
   navbar. Open DevTools → Application → localStorage and confirm
   `velo_session_v1` is gone. Hit Back — you stay on the unauthed
   Trade view (we used `replace`, not `href`).

2. **Receiver actually gets notified.** Same two-profile setup as
   before. Send from A to B. Within ~1s of the on-chain receipt:
   - B's notification bell pulses with a toast "@A sent you $X mUSDC".
   - B's Recent Activity gets a new RECEIVE row.
   - Clicking the notification opens OrderDetailsModal showing "From
     @A" and the BaseScan link.
   If any of these *don't* happen, the SENDER's console will now have
   verbose `[velo] recipient lookup by <col>=<val> failed:` lines
   pinpointing which column failed.

3. **Failed-insert visibility.** If your Supabase RLS / RPC isn't
   configured for the build81 migration, you'll now see ERROR toasts
   on the sender — "Recipient lookup ok but notification insert
   failed: ..." or "Couldn't save your activity row: ...". Previously
   these errors were silent.
