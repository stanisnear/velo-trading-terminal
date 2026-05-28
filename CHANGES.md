# Build 102 — Full activity sync, TP/SL cleanup, V3.1 docs

Files changed:

```
src/App.tsx
src/components/ui/pages/Dashboard.tsx
README.md
PROJECT_STATUS.md
```

`vite build` clean.

---

## 1. Recent Activity now shows every event — including keeper-driven closes

**The gap:** Recent Activity only showed OPEN rows because on-chain positions
that closed *without a user click* — liquidations, TP/SL fills, keeper closes —
never wrote a CLOSE row. The 5s poll just diffed the position list and silently
dropped vanished positions. So big equity swings from liquidations left no trace
in the feed.

**The fix:** the position sync effect now keeps a snapshot of the previous
poll's on-chain positions (`prevOnChainPositions` ref). Each poll, any position
that disappeared *and* wasn't closed locally (not in `processingIds` /
`ownDeletedPositionIds`) is treated as a keeper close. We synthesize a CLOSE
row — flagged as a liquidation if the mark crossed the liq threshold — write it
to local state AND Supabase, toast the user, and sweep its TP/SL orders. Same
snapshot-diff logic now runs for conditional orders (fill vs cancel detection)
so limit/stop lifecycle events surface too.

Combined with the build-100 merge fix (server rows merge with local optimistic
rows instead of clobbering), the dashboard Recent Activity and TradeView History
now reflect the complete lifecycle: open, close, partial close, liquidation,
TP/SL fill, limit fill/cancel, deposit, withdraw, send, receive.

## 2. TP/SL orders cancel when their position closes

**The gap:** open a position with a TP, close the position, the TP order lingered
in Open Orders.

**The fix:** belt-and-suspenders cleanup. The close path already filtered
`relatedPositionId`, but now the position sync effect also sweeps, every poll,
any synthetic TP/SL row (`ord_tp_*` / `ord_sl_*`) whose related position is no
longer open on-chain. Even if a close path misses cleanup, the next 5s poll
removes the orphan. The keeper-close detection (above) also clears them on the
spot.

## 3. Docs: V3.1 fully documented

The frontend was already pointed at V3.1, but the docs still described V3.
Updated `README.md` and `PROJECT_STATUS.md`:

- **Active contract is now VeloPerpsV3.1** at
  `0x41fDb544D7247a5ddc6B4C06F29D09f2b20de907` (verified on BaseScan, owned by
  the deployer, pre-funded with the mUSDC pool). V3 demoted to "superseded".
- **New "Why V3.1 exists" section** explaining the Pyth stale-price bug and fix:
  V3 used `updatePriceFeeds` + `getPriceNoOlderThan`, which silently no-ops on
  testnet when the cached publishTime is already ahead, returning a stale /
  near-zero price that corrupts entry, liq, and PnL. V3.1 uses
  `parsePriceFeedUpdates` (via the new `_extractPrice` helper) to read the price
  straight from the signed VAA blob — no cache dependency. ABI-identical to V3,
  so no frontend interface changes were needed. `IPyth`→`IPythV2`, VERSION 3→31.
- **Full V3.1 feature reference** — every function (open/close/partialClose/
  liquidate/setTriggers/closeIfTriggered/placeConditionalOrder/cancel/execute/
  increaseCollateral/decreaseCollateral/depositCross/withdrawCross + views),
  the constants the contract enforces, the keeper jobs, and the
  frontend-wiring notes.
- Env var section updated to point `VITE_VELO_PERPS_V3_ADDRESS` at V3.1.
- Supabase `trade_history` section documents the `action` column and the
  merge/diff activity-sync behavior.

---

## Verify

1. Open a position, let it hit TP (or get liquidated). → A CLOSE row appears in
   Recent Activity AND the History tab without you clicking close. Liquidations
   show with the red liquidation toast and negative PnL.
2. Open a position with a TP set → close it manually → the TP order is gone from
   Open Orders immediately (and stays gone after the next poll).
3. Place a limit order → cancel it on-chain or let it fill → you get a toast and
   the order leaves Open Orders.
4. README + PROJECT_STATUS now lead with V3.1 and explain the Pyth fix.
