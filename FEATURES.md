# Feature status — 15 October 2026

Status terms: **implemented** means code exists; **verified** names a specific test; neither means a complete independent audit. The app remains testnet-only.

| Area | Current behavior | Verification / remaining work |
| --- | --- | --- |
| Hosting and domains | Both sites on Cloudflare Pages, Supabase backend, Vercel paused | Successful deployments and configured custom domains; production browser access blocked in this review environment |
| Wallet login | One-use message signature; stable existing Supabase identity | Live new/returning login and replay tests passed; unupgraded legacy credentials still require global retirement |
| Trading wallet | Locally derived EOA, exported/recovered through wallet settings | Plaintext localStorage; no scoped permissions; recovery must be tested per connector |
| Onboarding | Testnet network, username, optional private contact, faucet/gas setup | Username now matches registry rules; complete mobile wallet matrix unverified |
| Market orders | Isolated open/close, local signing, Pyth settlement | Source review and selected historical receipts; all directions/extremes not exhaustively tested |
| Limit/stop entries | On-chain conditions checked by minute keeper | Long limit receipt verified previously; full side/condition/outage matrix still required |
| TP/SL | Separate trigger updates and keeper execution | Historical TP receipt; not an atomic guarantee at entry, fill may gap |
| Liquidation | Keeper checks current V3.1 rules | Receipt verified previously; cross loss accounting defect reproduced |
| Cross margin | Existing implementation has severe accounting defects | New cross opens/orders/deposits blocked in UI for active V3.1; direct contract access remains possible |
| Margin adjustment | Existing formula changes profit exposure with collateral | Add/reduce margin blocked in UI pending corrected contract |
| Reduce-only entries | Current targeting/trigger semantics need redesign | Blocked in UI; planned corrected implementation |
| Partial close | Contract/UI path exists | Original-notional and accounting invariants require stronger tests |
| Dashboard/activity | Balances, positions, history, transfers and performance views | Some records are client-authored; not a canonical financial ledger |
| Incoming peer transfer | New server path checks successful exact-token receipt and deduplicates logs | Unit tests cover token/recipient/amount checks; legacy permissive cross-user RPC retirement pending |
| Faucet and sponsor | Mock USDC and testnet gas provisioning | Past on-chain receipt evidence; stronger global sponsor budget and identity controls needed |
| Bridge | LayerZero OFT code and multi-testnet routes | All route pairs, delayed delivery and recovery not verified; no mainnet bridge claim |
| Charts | Streaming/history adapters, chart tools and indicator controls | Chart control runtime issue fixed; outage/staleness UX and candle quality need browser scenarios |
| Volume/orders panels | Recent reported fills and conditional orders | Informational panels, not executable liquidity or a matching-engine order book |
| Social | Posts, replies, likes, reposts, follows, profiles and mentions | Broad authorization, counters, moderation/spam and browser interaction checks outstanding |
| Notifications | Owner-only reads now enforced | Live ownership check passed; forged cross-user writes still require legacy RPC replacement |
| Contact email | New writes/read API in private schema | Live verified; historical public profile email fields still need cleanup |
| Avatar/profile editing | Upload/edit paths present | Path ownership, replacement policy and protected identity fields pending cutover |
| Leaderboard | Ranks stored profile metrics | Not independently chain-reconstructed or sybil-resistant; do not market as verified returns |
| Session and reconnect | Explicit sign-in, targeted logout, 30-minute inactivity warning/expiry and eight-hour limit | Auth lock, cancellation and expiry tests pass; actual mobile connector matrix outstanding |
| Navigation/modals/PWA | Components, routes, settings, trade/share/funding modals exist | Typecheck/build pass; key-reveal and detail-tooltip rerender tests pass; complete desktop/mobile, keyboard and wallet-state matrix not verified |
| Email alerts | Contact collection exists | Alert delivery is not implemented |
| Copy trading | Planned message only; simulated copy path disabled | Needs execution permissions, allocation, slippage/risk caps and reconciliation |
| Algorithmic trading | Planned | Needs scoped signing, quotas, sandboxing, kill switches and backtesting |
| Equities/commodities/options | Not listed as tradable instruments | Future testnet synthetic simulation requires licensing, calendars and new risk/settlement tests |

Release gates and priorities are in [the audit](docs/AUDIT-2026-10-15.md). This document supersedes older feature lists that implied full verification or mainnet readiness.
