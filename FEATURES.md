# Velo — Feature Catalog

A complete, audited inventory of what the Velo terminal does today on Base Sepolia. Status legend:

- **Live** — working and deployed.
- **Built — testnet-disabled** — fully implemented; initiation UI intentionally off during the testnet phase.
- **Removed** — intentionally taken out.

---

## 1. Authentication & Identity

| Feature | Status | Notes |
| --- | --- | --- |
| Wallet connect (injected / MetaMask) | Live | via Reown AppKit + wagmi |
| WalletConnect (mobile/QR) | Live | AppKit modal |
| Social / email login (Google, X, Discord, GitHub, email) | Live | AppKit, forced EOA accounts (no ERC-4337) |
| Email + password sign-up / sign-in | Live | Supabase Auth, case-insensitive username uniqueness |
| Silent wallet re-login | Live | Returning wallet users are re-authenticated without a modal; transient failures now retry up to 3× before falling back to the login prompt (fixes the "flaky sign-on") |
| Session restore on reload | Live | Supabase `INITIAL_SESSION` / `getSession` |
| Logout (hard navigation + storage wipe) | Live | logout sentinel prevents silent auto-reconnect re-login |
| Password reset | Live | reset modal |
| Account deletion | Live | `delete_own_auth_user` RPC |

---

## 2. The Velo Trading Wallet (Burner)

| Feature | Status | Notes |
| --- | --- | --- |
| Deterministic derivation from one signature | Live | `keccak256(personal_sign(VELO_DERIVATION_MESSAGE))`, fixed domain, chainId 84532 |
| Local-only private key | Live | stored in localStorage; DB stores only the address |
| Cross-device recovery | Live | explicit re-derivation prompt; verifies derived address matches the on-record address before trusting it |
| Popup-free trading | Live | burner signs locally; no per-order wallet prompt |

---

## 3. Trading & Blockchain

| Feature | Status | Notes |
| --- | --- | --- |
| Market orders | Live | fill at live Pyth price |
| Limit orders | Live | margin deducted on fill |
| Isolated margin | Live | independent positions |
| Cross margin | Live | shared collateral |
| Leverage selection | Live | up to contract max; pre-trade risk class (LOW/MED/HIGH/EXTREME) |
| Take-profit / stop-loss | Live | stored on-chain, keeper-executed |
| TP/SL validated against actual fill price | Live | prevents silent `InvalidTrigger` reverts |
| Add margin / reduce margin | Live | Manage Position modal |
| Partial close | Live | Manage Position modal |
| One-click full market close | Live | dashboard + position row |
| Close All | Live | staggered to respect the per-tx lock |
| Leverage-change modal | Live | distinct explained states |
| On-chain position sync | Live | 5s poll mirrors contract positions into UI, keyed by tradeId |
| Keeper: TP/SL execution | Live | `/api/cron-tp-sl`, every minute |
| Keeper: conditional orders | Live | `/api/cron-conditional-orders` |
| Keeper: liquidations | Live | `/api/cron-liquidate` |
| Contract address hardening | Live | V3.1 hardcoded as fallback; can't silently route to legacy |
| Markets list | Live | 15 display pairs; on-chain pairs registered via Admin (slots 0–5 at deploy, 6+ via panel) |

**Contracts:** VeloPerpsV3.1 `0x41fDb544D7247a5ddc6B4C06F29D09f2b20de907` · mUSDC `0x5EFaF3F69b09bC2abF3439bDC0C93bf611026699` · Pyth `0xA2aa501b19aff244D90cc15a4Cf739D2725B5729`.

---

## 4. Price & Charts

| Feature | Status | Notes |
| --- | --- | --- |
| Pyth live mark price (SSE) | Live | same feed the contract settles on |
| Pyth REST snapshot | Live | initial load |
| Pyth Benchmarks candles | Live | TradingView-compatible OHLC |
| TradingView widget chart | Live | primary trade chart |
| Binance/CoinGecko fallback | Live | keeps prices flowing if Hermes is blocked |
| Portfolio equity chart | Live | `lightweight-charts`; rebuilt once and updated via `setData` (fixes the Dashboard freeze) |

---

## 5. Network Handling

| Feature | Status | Notes |
| --- | --- | --- |
| Base Sepolia as default network | Live | AppKit `defaultNetwork` |
| Auto-switch wrong-network wallets | Live | one prompt per wrong-network state, no spam |
| Actionable wrong-network banner | Live | one-tap "Switch Network" + dismiss |
| Dead-end network modal | Removed (behavioral) | replaced by auto-switch + actionable banner |

---

## 6. Social Layer

| Feature | Status | Notes |
| --- | --- | --- |
| Post (text) | Live | |
| Post (image) | Live | |
| Post (trade signal) | Live | pair/side/leverage/entry metadata |
| Like / unlike | Live | realtime, optimistic |
| Repost / un-repost | Live | realtime |
| Comments — Twitter-style threads | Live | reply to any comment, thread lines, collapse/expand, link previews; realtime, optimistic, temp→DB id reconciliation |
| Comment likes | Live | per-comment hearts; realtime across sessions; notifies the comment author |
| Threaded reply notifications | Live | "replied to your comment" via SECURITY DEFINER RPC |
| `@mention` notifications | Live | posts and comments |
| `$TICKER` cashtags | Live | link to token page |
| Follow / unfollow | Live | server-side count maintenance via RPC |
| Public profiles | Live | bio, banner, posts, reposts, on-chain trades |
| Token pages | Live | price + chart + ticker conversation |
| Single-post permalink view | Live | `/social/post/:id` |
| Profile editing | Live | avatar, banner, bio |
| Post / comment deletion | Live | author-gated |
| Peer-to-peer transfer (Send) | Live | by `@handle` or address; recipient notified + activity row |
| Copy-trading engine | Built — testnet-disabled | the flagship: position mirroring, copy/manual attribution, copier counts, earned-fee fields; initiation UI returns with mainnet |

---

## 7. Leaderboard

| Feature | Status | Notes |
| --- | --- | --- |
| Ranking by verified on-chain performance | Live | not self-reported |
| Podium for top traders | Live | |
| Link-through to profiles | Live | |

---

## 8. Funds

| Feature | Status | Notes |
| --- | --- | --- |
| Testnet faucet (mUSDC) | Live | first-run welcome + on demand |
| Deposit (connected wallet → trading wallet) | Live | |
| Send (peer-to-peer mUSDC) | Live | sequential recipient lookup (avoids `.or()` filter pitfalls) |
| Withdraw (trading wallet → out) | Live | |
| Bridge (cross-chain via LayerZero) | Live | |
| Pending-deposit tracking | Live | persistent pill + activity row, live status |

---

## 9. Notifications & Realtime

| Feature | Status | Notes |
| --- | --- | --- |
| Notification bell | Live | likes, follows, comments, mentions, transfers, trade events |
| Cross-user notifications | Live | via SECURITY DEFINER RPC (bypasses RLS safely) |
| Realtime social feed | Live | posts/likes/reposts/comments, auto-reconnect + re-fetch |
| Realtime notifications channel | Live | per-user, auto-reconnect |
| Realtime transactions channel | Live | per-user; reconnect handler now wired |
| Realtime positions / orders | Live | per-user |
| `REPLICA IDENTITY FULL` on social tables | Live (migration) | so DELETE events carry the old row |

---

## 10. Dashboard

| Feature | Status | Notes |
| --- | --- | --- |
| Total equity + PnL hero | Live | |
| Portfolio equity chart with periods | Live | 1D/1W/1M/1Y/ALL (age-gated) |
| Performance (win rate, realized PnL) | Live | |
| On-chain account card | Live | trading wallet + perps contract BaseScan links |
| Margin & exposure | Live | margin in use, open positions, unrealized PnL, buying power |
| All active positions table | Live | with Close All |
| Recent Activity feed | Live | transactions + trade opens/closes + pending deposits |
| Funds actions | Live | Deposit / Withdraw / Send / Bridge |
| Tab freeze on Dashboard | Fixed | caused by per-tick chart teardown; now stable |

---

## 11. Admin Panel

| Feature | Status | Notes |
| --- | --- | --- |
| Gated to contract owner / `velo_admins` | Live | `is_velo_admin()` |
| On-chain pair registration | Live | register markets beyond the deploy-time slots |
| Verified-badge assignment | Live | `admin_set_verification` (added in the consolidated migration) |

---

## 12. PWA & Platform

| Feature | Status | Notes |
| --- | --- | --- |
| Installable PWA | Live | manifest + icon set |
| Offline-first service worker | Live | same-origin GET only; never caches RPC/extension; always returns a valid navigation Response |
| Install banner | Live | |
| Mobile-responsive layout | Live | dedicated mobile navbar, bottom nav, sidebar |
| Light / dark themes | Live | OKLCH token system; cascades globally |

---

## 13. Design System

| Feature | Status | Notes |
| --- | --- | --- |
| Obsidian-glass brand | Live | Fraunces wordmark, Geist UI, violet→blue over obsidian |
| Token-driven theming | Live | `tokens.css` + `brand.css` |
| Glassmorphism panels | Live | |
| Consistent across landing + terminal | Live | shared brand system |

---

## Audit Fixes Included in the Current Build

1. **Dashboard freeze** — `PortfolioChart` rebuilt the entire chart on every price tick; now creates once and updates via `setData`, with memoized chart data.
2. **Switch-network sheet** — wallets on the wrong chain are auto-switched to Base Sepolia; the banner is actionable; AppKit has a default network.
3. **Flaky sign-on** — silent wallet login now distinguishes transient errors from "no account" and retries before prompting.
4. **Transaction realtime channel** — reconnect handler wired (previously dropped).
5. **Contract routing** — V3.1 address hardcoded as fallback.
6. **Stale leaderboard copy** — "Copy the most profitable traders" → "Ranked by verified on-chain performance."
7. **`modal-open` CSS** — the body class is now backed by a real rule.
8. **Database** — consolidated, idempotent migration adds `admin_set_verification`, fixes the `velo_admins` RLS recursion, and re-asserts RPCs, columns, RLS, and realtime.
9. **Twitter-style comments shipped** — the previously-unwired `CommentThread` system is now fully connected: threaded replies (`parent_id`), comment likes (`comment_likes` table + realtime), reply/like notifications, and cascade delete.
10. **Cross-user notifications hardened** — all 7 social notification sites (follow, like, repost, comment, wall post, 2× mention) now route through the SECURITY DEFINER RPC instead of RLS-blocked direct inserts.

---

## Near-Term Backlog

- Security audit → Base mainnet deployment.
- Re-enable copy-trading initiation UI at mainnet (engine already built).
- Profile analytics expansion.
