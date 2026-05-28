# Build 101 — Leverage modal removed, order panel tightened, Close All

Drop these three files into the repo:

```
src/App.tsx
src/components/ui/pages/TradeView.tsx
src/components/ui/pages/Dashboard.tsx
```

`vite build` clean.

---

## 1. No more Increase/Decrease Leverage modal on live mode

The "Increase Leverage?" / "Reduce Leverage" confirmation modal was a relic of
the Orderly netting model — it asked the user to confirm because changing
leverage there re-priced and reallocated the single net position.

VeloPerps doesn't work that way. Each tradeId is its own position, with its
own collateral and leverage. Opening at 20x while a 10x exists just creates
a second position — there's nothing to confirm.

Both the size=0 leverage-only adjustment path (the dropdown) and the
mismatched-leverage modal trigger are now gated behind `!isLiveMode`. The
demo simulator still uses them since its position model is single-netting.

## 2. Order panel spacing fixed

The submit button had `marginTop: 'auto'` which pinned it to the bottom of
the bubble, leaving a void above when content was short (no TP/SL, simple
market order). Removed. The summary block (Est. Liq. Price / Margin Risk /
Free Balance) now gets a touch more breathing room, the submit button sits
naturally after it, and font sizes tick up from 9/10 to 9.5/10.5 for
cleaner readability.

## 3. Close button = instant 100% market close

Previously, clicking Close on a V2 on-chain position opened the Manage modal
at the PARTIAL tab. Now it fires `closePosition` directly — one click flattens
the position at market.

The partial-close UX is still reachable via the Edit/Manage button (the row's
edit icon, or the dashboard's TP/SL edit pencil) which calls
`handleEditPosition` → opens the modal at the chosen tab.

## 4. Close All button

New affordance, two places:

- **Dashboard** — header of "All active positions" panel, next to the "X Open"
  badge. Visible when positions.length > 1.
- **TradeView** — right side of the Positions/Open Orders/History tab bar,
  visible only when on POSITIONS tab with >1 positions.

Both call `handleClosePosition` per position, staggered 550ms apart so the
500ms tx-lock doesn't silently drop the 2nd…Nth calls. Each close goes
through the normal on-chain path.

---

## Verify

1. Open a SOL long at 10x. Change the leverage dropdown to 20x without
   touching size. → Nothing happens (no modal). Demo mode (no wallet) still
   shows the modal since the simulator needs it.
2. Open at 20x while the 10x is still open. → No "Increase Leverage" modal
   — a second position opens at 20x.
3. Look at the right-side order form: no void between Free Balance and
   the LONG/SHORT submit button. Spacing reads cleanly.
4. Click Close on a position row (dashboard or TradeView) → position closes
   at market immediately, no modal.
5. Open 2+ positions → "Close All" button appears in both Dashboard and
   TradeView headers. Click it → all positions close, staggered 550ms apart.
