# Build 100 — Sync fix: rows no longer get clobbered by the refetch

Drop these three files into the repo:

```
src/App.tsx
src/components/ui/pages/TradeView.tsx
src/components/PortfolioChart.tsx
```

`vite build` is clean.

---

## The root cause

Build 99 added the writes (TP/SL on open, OPEN row to history, synthetic
TP/SL rows into Open Orders). But there's an effect that fires on every
visibilitychange + on user.id change that did:

```js
setUser(prev => prev ? { ...prev, tradeHistory: history, transactionHistory: txns } : prev);
```

**That `tradeHistory: history` replaces the array.** A race ensues:

1. You open a position → local state gets the new OPEN row → length 15.
2. `insertTradeHistory` fires (async network round-trip).
3. Anything that triggers a refocus / refetch (tab focus, re-render path)
   runs `refetch()` → fetches from Supabase → **still 14 rows because the
   insert hasn't landed yet** → clobbers local state back to 14.
4. The OPEN row is gone from History.

Close did the same thing. TP setting did the same thing. That's why nothing
appeared in the UI even though the writes were going through.

---

## What's fixed

### 1. Refetch now MERGES instead of clobbering

`tradeHistory` and `transactionHistory` are now reconciled, not overwritten.
The new policy:

- Server rows take precedence on id (canonical UUID).
- For each local row not matched by id, check if a server row covers it
  (same pair + side + action, within 10 seconds). If yes, the server row
  wins and the local placeholder is dropped. If no, the local row is kept
  until a future refetch confirms it.

Result: rows added optimistically (OPEN, CLOSE, deposit, withdraw, send,
receive) stay visible immediately AND survive every subsequent refetch.

### 2. TP/SL on open now paints onto the position instantly

Build 99 fired `setTriggers` after `openPosition` but waited for the next
5s poll to surface the value. Users opened with TP=85, saw `- / -` in the
TP/SL column, assumed it didn't work, and closed the position. Now:

- A `pendingTriggers` ref stores the requested TP/SL by tradeId.
- The position sync effect overlays pending values onto the position so
  the TP/SL column shows immediately.
- After `setTriggers` mines, we force a refresh so the contract-confirmed
  value flows in.
- The sync effect auto-clears the pending entry once the contract returns
  a matching value.

On `setTriggers` failure, we toast the error AND roll back the optimistic
overlay AND clear the synthetic openOrders rows — the user sees the truth.

### 3. Chart console spam fixed

The portfolio AreaSeries was using `oklch(0.68 0.22 295)` — lightweight-
charts v4 doesn't parse modern OKLCH syntax and throws `Failed to parse
color` every frame, hundreds of entries in console. Replaced with the
rgb equivalent `rgb(153, 102, 255)`.

This was the noise you were seeing in the console — not actually breaking
anything but masking real errors.

---

## Supabase — do you need to put something in?

Probably not, IF the schema is already at the latest migration. To verify:

```sql
-- Run in Supabase SQL Editor as project owner
SELECT
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='trade_history' AND column_name='action')
  THEN 'OK' ELSE 'MISSING' END AS trade_history_action,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='trade_history' AND column_name='on_chain')
  THEN 'OK' ELSE 'MISSING' END AS trade_history_on_chain,
  CASE WHEN EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='trade_history' AND cmd='INSERT')
  THEN 'OK' ELSE 'MISSING' END AS trade_history_insert_policy,
  CASE WHEN EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='transactions' AND cmd='INSERT')
  THEN 'OK' ELSE 'MISSING' END AS transactions_insert_policy;
```

All four should return `OK`. If any return `MISSING`:

- Missing columns → run `SUPABASE_SCHEMA.sql` (idempotent — safe to re-run).
- Missing INSERT policies → run `SUPABASE_MIGRATION_RLS_ACTIVITY.sql`.

The in-app error broadcaster already toasts persistence failures with the
postgres error code, so if RLS were silently blocking writes you'd have
seen "Trade history not saved — Row-Level Security blocked the insert".
You didn't, so RLS is likely fine.

---

## Verify after deploy

1. Open a SOL/USD long with TP set. After "Order filled":
   - The position row TP/SL column shows your TP value immediately.
   - "Triggers set on-chain · TP $X" toast appears within a few seconds.
   - Open Orders tab shows a TAKE_PROFIT row.
2. Close the position. History tab gains a new CLOSE row at the top.
3. Reload the page. Both rows survive — they were persisted to Supabase
   and the merge logic doesn't clobber them.
4. Console: no more "Failed to parse color: oklch(...)" spam.
