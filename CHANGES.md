# Build 99 — History, TP/SL & Activity sync fixes

Drop these two files into the repo (overwrite existing):

```
src/App.tsx
src/components/ui/pages/TradeView.tsx
```

Nothing else changed. `vite build` is clean.

---

## What's fixed

### 1. TP / SL on on-chain open (the big one)

**Bug:** the order form was sending `tp` and `sl` to `handleOpenPosition`, but the
on-chain path silently dropped them. The contract's `openPosition()` doesn't
accept triggers as args, so they were never set anywhere — neither on the
position struct nor as synthetic open orders.

**Fix:** after `openPosition` resolves, if `tp` or `sl` were provided we now:
- Fire a follow-up `setTriggers(tradeId, tp, sl)` tx so the contract knows
  about them and the keeper will enforce them.
- Seed synthetic `TAKE_PROFIT` / `STOP_LOSS` rows into local `openOrders` so
  the Open Orders tab shows them immediately. (The contract stores TP/SL on
  the position struct, not as separate orders — so the sync effect won't
  overwrite these local rows.)
- The 5s poll then pulls the new `takeProfit` / `stopLoss` off the position
  struct and the existing sync effect paints them onto `positions[]`, which
  feeds the right-side panel and the Manage Position modal.

On `setTriggers` failure we roll back the synthetic rows and toast the error.

### 2. LIMIT / STOP orders now show instantly in Open Orders

**Bug:** placing a LIMIT or STOP from the order form called
`placeConditionalOrder` but didn't echo into local state. The sync effect from
`veloPerpsTrading.conditionalOrders` only fires when the next refresh tick
pulls the new order off-chain — up to 5s of nothing happening from the user's
perspective.

**Fix:** on `placeConditionalOrder` success, optimistically insert the order
into `openOrders` with the same `velo_ord_<id>` key the sync effect uses. The
sync effect dedupes on that key, so when the poll catches up there's no
duplicate.

### 3. History tab now shows every event

**Bug:** the History tab was filtering by `action === 'CLOSE'`. Users who'd
opened positions but never closed any saw "No trade history" — even when
their Recent Activity showed dozens of OPENs.

**Fix:** History now shows every row in `tradeHistory` (opens, closes,
liquidations). Each row now also gets an action badge (OPEN / CLOSE) and the
secondary line adapts:
- OPEN rows show entry price, notional size, and leverage.
- CLOSE rows show PnL (unchanged).

### 4. OPEN events now persist to Supabase

**Bug:** the codebase had an explicit policy ("OPEN entries are not persisted
to DB — only CLOSE entries go to trade_history table") at three sites. This
meant Recent Activity / History tab were full of OPENs in-memory during the
session, but every OPEN vanished on reload. The old 14 history entries you
saw were old CLOSEs that did get persisted from a previous session.

**Fix:** every `insertTradeHistory` call now also fires on OPEN. Three sites
patched (add-to-existing, flip, new-position). The on-chain OPEN path was
already calling it; the simulated / Orderly paths were not.

Now after reload:
- Recent Activity shows the full history of opens, closes, deposits,
  withdrawals, sends, and receives, time-ordered.
- History tab shows every trade event (open + close + liq), paginated.
- All of it is one round-trip away from Supabase, no in-memory loss.

---

## Verify

1. `npm install && npm run build` — should succeed.
2. Deploy.
3. Connect wallet, open a position with TP set in the form.
   - Toast "Triggers set on-chain · TP $X" should appear after the open toast.
   - Right-side panel of the Manage modal shows TP.
   - Open Orders tab shows a `TAKE_PROFIT` row.
4. Place a LIMIT order. Open Orders tab updates immediately (no 5s wait).
5. Open a market position. Check Dashboard → Recent Activity: row appears.
6. Reload. Check Recent Activity AND TradeView → History tab: row is still
   there (was lost before).
