# Velo — Executive Brief

**Prepared for grant submission and investor review.**
**Status: live on Base Sepolia testnet · audited build.**

---

## What Velo Is

Velo is a fully on-chain perpetual futures exchange with an integrated social layer. Every trade, every position, every settlement, and every leaderboard entry is backed by a verifiable blockchain transaction. There is no custody, no off-chain matching engine, and no way to fabricate a track record.

Velo is live today on Base Sepolia. Every feature described in this document is working, deployed, and testable in the terminal at [app.velotrading.live](https://app.velotrading.live), with a dedicated marketing site at [velotrading.live](https://velotrading.live).

Velo ships with a complete, distinctive brand identity — the "Obsidian glass" system (a Fraunces serif wordmark, Geist UI type, frosted-glass surfaces, and a restrained violet→blue palette over an obsidian base) — applied consistently across both the marketing site and the trading terminal. The product looks and feels finished, not like a hackathon prototype.

---

## Built by a Trader, for Traders

Most DeFi trading terminals are built by engineers who researched what traders want. Velo was built by someone who knows what a liquidation feels like, what it means when a take-profit fills two dollars off, and why a 2% buffer on a 25× position is a different category of risk than a 15% buffer. The interface reflects that directly: position-table columns carry hover tooltips with precise definitions, the order panel shows a live risk classification (LOW / MEDIUM / HIGH / EXTREME) before submit, and the leverage-change modal has distinct, explained states rather than a generic confirmation prompt.

DeFi trading products consistently fail at the terminal layer — the protocol mechanics are sound, but the interface assumes the user has read the whitepaper. Velo is built on the premise that the interface is part of the product, not a skin on top of it.

---

## The Core Loop

1. **Connect a wallet** (MetaMask, WalletConnect, or social/email login via Reown AppKit). The app trades exclusively on Base Sepolia and will steer a wrong-network wallet back to it automatically.
2. **A Velo Trading Wallet is derived** deterministically from a single signature — a burner key that lives only in the browser, so trading never requires a wallet popup per order.
3. **Fund it** with testnet mUSDC via the faucet, a deposit from the connected wallet, a peer-to-peer transfer from another Velo user, or a cross-chain bridge.
4. **Trade perps** — market and limit orders, isolated or cross margin, leverage up to the contract maximum, with on-chain take-profit and stop-loss triggers executed by keepers.
5. **Share and compete** — post trades to the social feed, follow other traders, and climb a leaderboard ranked purely on verifiable on-chain performance.

---

## What Makes It Defensible

**Provable performance.** Because settlement is on-chain, a trader's PnL and win rate are not self-reported — they are reconstructed from blockchain history. The leaderboard cannot be gamed with fake numbers. This is the structural advantage social-trading platforms built on centralized exchanges can never offer.

**Self-custody with CEX-grade UX.** The deterministic trading wallet means users sign once, then trade with the fluidity of a centralized exchange — no per-order popups — while custody never leaves their control. The burner private key is never sent to a server; the database stores only the public address.

**One oracle, end to end.** The contract settles against the Pyth oracle, and the entire UI — mark price, chart, fill notifications — reads the same Pyth feed. There is no confusing gap between the price you see and the price you fill at. A Binance/CoinGecko fallback keeps prices flowing if the Pyth stream is ever blocked.

**A real product, not a demo.** Two deployed surfaces (marketing + terminal) under one domain, a full PWA with offline shell and installability, a consistent brand system, and an interface designed by someone who trades.

---

## The Social Layer

Velo's social product is a native part of the terminal, not a bolt-on:

- **Feed** — post text, images, and trade signals; like, repost, and comment in real time (live via Supabase Realtime).
- **Mentions & cashtags** — `@handle` mentions notify the mentioned user; `$TICKER` cashtags link to that market's page.
- **Follows** — follow traders; follower/following counts are maintained server-side.
- **Profiles** — public trader profiles with bio, banner, posts, reposts, and on-chain trade history.
- **Token pages** — per-asset pages combining price, an interactive chart, and the social conversation around that ticker.
- **Notifications** — a real-time bell for likes, follows, comments, mentions, transfers received, and trade events (position closed, take-profit/stop-loss hit, liquidation).
- **Peer transfers** — send mUSDC to another user by `@handle` or address; the recipient gets a notification and an activity-feed entry.
- **Leaderboard** — traders ranked by verified on-chain performance.

> Note on scope: copy-trading was deliberately removed in favor of a cleaner social/leaderboard focus. Threaded comment replies and comment-likes are designed in the data model but not yet wired into the UI; comments are currently a flat thread. These are the clearest near-term social additions.

---

## Trading & Blockchain

- **Contract:** VeloPerpsV3.1 on Base Sepolia (`0x41fDb544D7247a5ddc6B4C06F29D09f2b20de907`). The frontend defaults to this address even if its environment variable is unset, so live trades can never silently route to a legacy contract.
- **Settlement currency:** mUSDC (Velo Mock USDC) at `0x5EFaF3F69b09bC2abF3439bDC0C93bf611026699`.
- **Oracle:** Pyth on Base Sepolia (`0xA2aa501b19aff244D90cc15a4Cf739D2725B5729`), read via `parsePriceFeedUpdates`.
- **Order types:** market (fills at live oracle price) and limit; isolated and cross margin; on-chain take-profit / stop-loss.
- **Keepers:** Vercel cron jobs fire every minute to execute triggered TP/SL and liquidations on-chain.
- **Risk safety:** take-profit and stop-loss are validated against the *actual* fill price after a market order mints, so a trigger chosen pre-fill can never silently revert on the wrong side of entry.

---

## Roadmap to Mainnet

1. **Security audit** of the VeloPerps contracts.
2. **Mainnet deployment** on Base.
3. **Liquidity & keeper hardening** for production load.
4. **Social expansion** — threaded replies, comment-likes, and richer profile analytics.

The realistic first funding ask is **$10–25K**, tied directly to the audit and mainnet deployment milestone.

---

## One-Line Summary

Velo is a self-custodial, on-chain perpetual futures exchange with a provable-performance social layer — live on Base Sepolia, built by a trader, and designed to make the interface as serious as the protocol.
