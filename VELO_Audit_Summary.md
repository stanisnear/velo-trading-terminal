# Velo — Audit Summary & Product Assessment

_Prepared after a multi-pass code audit and live verification against the production Supabase + realtime backend and Base Sepolia contracts._

---

## 1. What Was Audited

This was a code-level audit plus live testing against your production systems — not a browser click-through of every screen (that's your deploy-and-test loop), and not a Solidity security audit (that's the funded mainnet milestone). Coverage:

**Verified live against production:**
- Database writes + Row-Level Security (real inserts as authenticated users).
- Cross-account realtime delivery — two freshly created accounts; account B received account A's post and comment INSERT events within seconds.
- Comment threading: `parent_id` stores correctly; deleting a parent cascades its replies.
- Comment likes realtime: INSERT **and** DELETE bindings active on production.
- All backend RPCs (`create_notification_for_user`, `record_transaction_for_user`, `adjust_balance`, follow-count helpers, `is_velo_admin`).

**Deep code audit, fixes shipped:**
- Auth / sign-on, session restore, the deterministic burner wallet.
- Trading: open / close / partial-close / add-reduce margin / leverage; TP/SL post-fill validation.
- The three keeper crons (TP/SL, conditional orders, liquidations).
- Network handling, the full social layer, notifications, dashboard, routing, service worker, price resilience.

**Reviewed, not exercised:** the Solidity contracts (security audit territory), `sponsor-eth` (caps + rate-limit look correct), stats endpoints.

---

## 2. Bugs Found & Fixed (this engagement)

| # | Severity | Issue | Fix |
| --- | --- | --- | --- |
| 1 | **High** | Dashboard froze — `PortfolioChart` tore down and rebuilt the entire chart on every price tick (multiple times/sec) | Split into create-once + cheap `setData` updates; memoized chart data |
| 2 | **High** | Mobile "Switch Network" sheet was a dead-end — X didn't resolve it, reappeared on re-login | AppKit `defaultNetwork` + auto-switch to Base Sepolia (once per state) + actionable banner button |
| 3 | **Critical** | Keepers could silently stop — `cron-liquidate` fell back to the **legacy V1 contract** on a missing env var; `cron-tp-sl` / conditional-orders had no fallback (returned green 200 while doing nothing) | All three hardcode the V3.1 address as fallback |
| 4 | **High** | Cross-user notifications (likes/follows/comments/mentions/reposts/wall-posts) used RLS-blocked direct inserts — the real reason the bell stayed empty across accounts | All 7 sites routed through the SECURITY DEFINER RPC |
| 5 | **High** | Flaky sign-on — a transient network blip looked identical to "no account" and bounced returning users to the login modal | Distinguish genuine 400 from transient; retry up to 3× before prompting |
| 6 | **Medium** | Transaction realtime channel silently dropped its reconnect handler (arity mismatch) | Wired `onStatus` + unique channel name |
| 7 | **Medium** | Frontend could route live trades to the old V1 contract if `VITE_VELO_PERPS_V3_ADDRESS` was unset | Hardcoded V3.1 fallback |
| 8 | **Medium** | DB: `admin_set_verification` missing (verify-badge panel silently failed); `velo_admins` had an RLS infinite-recursion (42P17) | Added the function; fixed the recursion; consolidated migration |
| 9 | Low | Dead `.modal-open` CSS class (toggled, never defined) | Added the rule |

---

## 3. Features Restored / Completed

**Twitter-style comments — fully wired (was built but disconnected before this audit).** The `CommentThread` component existed but was imported nowhere, and `addComment` never wrote `parent_id`. Now connected end-to-end:
- Threaded replies with visual thread lines + collapse/expand.
- Per-comment likes (new `comment_likes` table, RLS, realtime INSERT/DELETE).
- `@mention` and `$TICKER` inside comments, exactly as in posts.
- Link previews in comments.
- Reply + like notifications to the right recipient.
- Cascade delete of replies when a parent is removed.
- Verified live against production.

**Copy-trading — correctly repositioned as the flagship.** The engine is built (position mirroring, copy/manual attribution on every position + history row, copier counts, earned-fee accounting). The initiation UI is intentionally staged for mainnet, where copying _provable_ on-chain track records is the core promise. Docs and the leaderboard now reflect this as "built, mainnet-gated" rather than "removed."

---

## 4. Structural Work (App.tsx decomposition)

App.tsx went from **9,848 → 8,734 lines**. Extracted, build-verified leaf modules now live outside the monolith:
- `components/ui/pages/`: `Dashboard`, `TradeView`, `MarketsView`, `LeaderboardView`
- `components/Navigation.tsx` (Navbar + MobileSidebar + MobileBottomNav)
- `components/Modals.tsx` (EditProfile, DeletePostConfirm, UsersList)
- `components/CommentThread.tsx`
- `components/ui/shared.tsx` (atoms + format helpers, deduplicated)

**Remaining (recommended as a dedicated, test-backed session):** the social-rendering cluster — `PostCard`, `LinkPreviewCard`, `MentionDropdown`, `WallCompose`, `SocialFeed`, `TokenPage`, `ProfileView`/`PublicProfileView`. These share helpers (`renderContentWithMentions`, ticker constants) and are tightly interwoven; extracting them safely means first lifting the shared helpers into a `social/` module. Doing it untested before a grant review would risk regressions — it's the right next step, not a now step. Target after that work: ~4,000 lines of pure orchestration.

---

## 5. Build Health

- `vite build` exits 0 (the acceptance gate).
- `tsc --noEmit`: **84** errors, down from 88 at audit start — all pre-existing viem/wagmi generic-type mismatches that do not affect the build. (The comment wiring actually _removed_ 3 by satisfying the `Comment` type.)
- These 84 are noise that obscures real type errors; a dedicated `tsc` cleanup is worthwhile someday but is not blocking.

---

## 6. Honest Product Assessment

**What Velo gets right — and it's a lot for a solo build:**
- **The core thesis is genuinely defensible.** "Provable performance" — a social/copy-trading layer where track records are reconstructed from chain history, not self-reported — is a real structural advantage over eToro-style platforms on centralized venues. This is the strongest part of the pitch.
- **It's a real product, not a hackathon demo.** Two deployed surfaces, a full PWA, an error boundary, a consistent and distinctive brand system, a deterministic burner wallet that delivers CEX-like UX without custody, one-oracle-end-to-end price integrity with a resilience fallback, and keeper infrastructure that actually executes on-chain.
- **The interface is unusually mature.** Pre-trade risk classification, precise tooltips, honest trigger-vs-fill handling. This is the layer most DeFi products fail, and Velo treats it as first-class.
- **The social layer is now real**, not a stub: posts, threaded comments with likes, mentions, cashtags, follows, profiles, token pages, peer transfers, a verified-performance leaderboard — all realtime.

**What an investor or senior engineer will flag — and you should pre-empt:**
- **Solo-built, unaudited contracts.** This is the single biggest risk and the obvious use of funds. Be explicit: the money is for an audit + a small team, not to discover whether the idea works.
- **The monolith.** 8,700-line App.tsx is a maintainability and hiring liability. The decomposition is underway and the pattern is proven; frame it as in-progress, not ignored.
- **Testnet-only, no real liquidity or users yet.** Provable performance only matters once real traders generate real track records. The path from testnet to a liquid mainnet venue is non-trivial (liquidity provisioning, keeper hardening, oracle costs at volume).
- **Type-checking debt** (the 84 `tsc` errors) — minor, but a sharp reviewer will run `tsc` and notice.
- **Competition is fierce.** Hyperliquid, GMX, dYdX, Drift own on-chain perps; the social/copy angle is the differentiator, and the pitch must lean entirely on it rather than on being "another perps DEX."

**Tech stack verdict:** Modern and appropriate — React 19 / Vite / TypeScript, wagmi v2 / viem, Reown AppKit, Supabase, Pyth, Foundry. Nothing exotic, nothing legacy; a new hire can be productive quickly. The Supabase-for-social + on-chain-for-settlement split is a sensible, pragmatic architecture.

---

## 7. Grant / Pre-Seed Readiness — My Honest Take

**Yes — Velo is ready to raise a small, milestone-tied round, with the right framing.**

It clears the bar that matters for early grants and pre-seed: a working, deployed, demonstrably-functional product with a defensible thesis and a credible, specific use of funds (audit + mainnet + a small team). That is materially stronger than the median grant applicant, which is often a deck and a testnet stub. The "built by a trader, provable performance, eToro-of-crypto" narrative is coherent and the product backs it up.

**Calibrate the ask to the stage.** A **$10–25K builder grant tied to audit + mainnet** is squarely justified by what exists today — pursue Base Builder Grants, CDP Builder Grants, and Builder Rewards now. A larger **pre-seed to hire a dev team** is reachable but will be judged on team and traction as much as product; the realistic framing there is "working testnet product + clear mainnet plan, raising to audit and build the team that takes it live." Don't over-raise against a solo testnet build — a focused grant that funds the audit, plus early mainnet traction, is what unlocks the bigger round on much better terms.

**Before you submit, do these (in order):**
1. Deploy this delta; run the two-account test (comment → reply → like → bell) to confirm the social stack live.
2. Run the consolidated migration (idempotent; `42P13`-safe).
3. Confirm `VITE_VELO_PERPS_V3_ADDRESS` (and the keeper env vars) are set in Vercel — now defensively defaulted, but don't rely on the fallback in production.
4. Get the contracts audited. This is the gate between "promising testnet product" and "thing real money can touch."

**Bottom line:** The idea is good, the execution is real, and the honest gaps (audit, team, the monolith, liquidity) are exactly the things a grant/pre-seed is _supposed_ to fund. Lead with provable performance, be upfront about the audit need, ask for an amount matched to a solo testnet build, and Velo is a credible raise.

_This is engineering and product judgment, not investment advice._
