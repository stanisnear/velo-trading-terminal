# Velo product and technical reference

Velo is a trading venue and social network for decentralized finance. The current public app runs on Base Sepolia (chain 84532) and uses mUSDC test collateral. Its core workflow is to discover an asset, discuss an idea, trade it and share the outcome. This document describes the shipped product and its sources of truth. See the [status brief](docs/FUNDING-READINESS.md) for the pitch and [VISION.md](VISION.md) for the long-term direction.

## Navigation and account setup

| Area | What it is for |
| --- | --- |
| Dashboard | Account value, historical balance, exposure, performance, funding and activity. |
| Trade | Price chart, public trading activity, order ticket, open positions, working orders and history. |
| Markets | Top-50 crypto directory, watchlist and coin research. |
| Social | Market discussion, trader discovery and shareable positions. |
| Leaderboard and profiles | Find traders and explore their posts, connections and recorded results. |
| Wallet & Settings | Addresses, funds, recovery, account preferences and sign-out. |
| Admin | Authorized operations for market configuration, risk, fees and liquidity. |

Visitors can browse public markets, the trading chart, feed and profiles. Account actions prompt for sign-in. Header search, also available with **⌘/Ctrl K**, finds pages, traders and assets and distinguishes informational coin pages from tradable pairs. The app adapts its navigation and panels for phones, tablets and desktop. Light/dark themes, keyboard controls, reduced-motion support, local timestamps, rolling numeric values and opt-in interaction sounds carry across the interface. Velo can be installed as a PWA.

Reown connects a compatible wallet. The wallet signs an expiring challenge, which the backend verifies before issuing a Supabase session. A valid session can restore on refresh. Signing out clears the app session and returns to wallet selection. A separate signature derives the dedicated trading wallet used for local order signing. The connected wallet is the account identity, and the trading wallet is the address holding trading funds and positions. The app links the public address to the profile and offers wallet backup and recovery controls. The username registry gives traders a readable identity, with 3–16 lowercase letters, digits or underscores, beginning with a letter. Username changes are rate limited by the registry.

Profiles support a name, avatar, banner and biography. Media uploads are scoped to the owner. Wallet settings provide copy and explorer links for each address, wallet recovery or key export, fund movement, optional contact email and interface preferences. See [key handling and permissions](docs/SECURITY.md).

## Dashboard

| Panel | What it shows and how it works |
| --- | --- |
| **Total equity** | Trading-wallet mUSDC plus refundable pending-order escrow and the estimated payouts of open positions. Open PnL and accrued closing costs can move this estimate as prices change. The equity breakdown explains the components. |
| **Buying power** | Available mUSDC for new orders. Funds already committed to open positions or pending entries are accounted for separately. Market and pool limits also apply to order size. |
| **Account balance chart** | Available mUSDC plus net collateral in open positions and refundable order escrow. It changes with funding, transfers, charged fees and settlements. Open profit and loss are excluded. For example, an open position can raise equity from $2,000 to $8,000 while balance remains near $2,000. Its payout affects balance at settlement. |
| **History controls** | Day, week, month and all-history views use the balance observations and verified checkpoints available for that trading wallet and engine. The chart shows date coverage and a hover/touch readout. An account’s creation date alone does not establish a historical balance. |
| **Open exposure** | Margin in use, unrealized PnL and an allocation breakdown by position. The position table below is the management surface for reviewing positions, editing TP/SL and closing trades. |
| **Performance** | Cumulative realized PnL, period filters, win rate, average settlement, profit factor, drawdown and market breakdown. The calendar groups settlements by day. Select a day or trade to inspect the underlying records. Deposits, withdrawals and open PnL do not enter realized performance. |
| **On-chain account** | Trading-wallet and engine addresses, with copy controls and BaseScan links. |
| **Funding and activity** | Deposit, withdraw, faucet and send shortcuts. The timeline combines funding, transfers and trade events. Settlement payouts are grouped with the close, and activity reports the realized result rather than treating returned margin as a deposit. Cross-chain transfers can appear as pending until delivery. |

Account refreshes read wallet cash, open positions and orders at a single block. A failed read leaves the last confirmed snapshot visible. Stale account state and offline mode prevent trading writes until a successful refresh. Balance observations are scoped to account, wallet, chain and engine, and verified historical checkpoints use archive state at the block of a confirmed event. The keeper reconciles account history while the browser is closed.

## Trade

| Perpetual markets | Maximum leverage |
| --- | ---: |
| BTC, ETH | 25× |
| SOL, BNB | 20× |
| XRP | 15× |
| DOGE, PYTH, HYPE, STETH | 10× |

The market selector uses the V4 registry, and the contract enforces current settings. The chart offers candles, line and area views, a one-second interval and longer timeframes, indicators, position and protection levels, and local time labels. Changing the interval takes you to the latest candle. **Back to live** returns the view to the newest data after panning. Source labels distinguish oracle marks from exchange reference history when applicable. Reference candles help with analysis. The engine accepts a signed Pyth update for execution.

The side panel shows reported fills, volume and order activity. It complements the chart and ticket. V4 executes against an oracle-priced pool, so these views do not represent executable bid/ask depth from a matching engine. Desktop users can resize the activity and order panels. Signed-out users can inspect the market and sign in from the locked account panels.

| Action | What happens |
| --- | --- |
| **Market entry** | Select long/short, margin and leverage. The ticket previews size, fees and liquidation risk. The wallet submits a bounded transaction with a signed Pyth update and optional TP/SL. The engine checks freshness, price bounds, deadlines, risk and liquidity before opening. |
| **Limit entry** | Collateral is reserved on-chain while an order waits for an eligible price. A buy requires a price at or below the limit, and a sell at or above it. |
| **Stop entry** | The order waits for a price at or above the trigger for a buy, or at or below it for a sell. Execution also checks the adverse-price bound. |
| **Take-profit / stop-loss** | Protection can be attached atomically at entry or edited later. The Open Orders tab shows active legs, which can be managed individually. The management dialog previews outcomes with fees and borrowing. |
| **Cancel an entry** | Cancellation releases the pending collateral. Expired requests have an on-chain recovery path. |
| **Review or close** | Details show position ID, entry, mark, size, leverage, margin, liquidation buffer, protection and timing. V4 supports full manual close. Confirmed close details offer an optional share action. |
| **History** | Opens and settlements show market, direction, result and time, with explorer and sharing links where available. Keeper activity and receipt recovery fill gaps when a browser was closed or a client write failed. |

The trade lifecycle distinguishes signing, broadcast and confirmed execution. The app retains a submitted hash and checks its original outcome after a timeout. On-chain state and matching successful receipts determine execution. Pending, rejected and reverted actions each have their own result. Existing positions remain manageable during an entry pause.

### Accounting and settlement

V4 uses isolated margin and fixed notional. At entry, the fee is 0.10% of requested notional. Net collateral is gross margin minus that fee, and fixed notional is net collateral times leverage. The engine applies market spread at execution and reserves pool liquidity for the position’s gross-profit cap of one notional. Gross losses are capped at net collateral.

At close, V4 calculates capped price PnL, subtracts accrued borrowing and the 0.10% closing fee, and applies a bounty on eligible keeper settlements. Borrowing defaults to 0.01% per hour on fixed notional. The contract caps charges by the remaining position equity. Realized PnL is the payout minus the original gross margin, which counts the opening fee once. Equity and the dashboard’s exposure estimate start from the wallet after the fee was paid. The share card uses the net trade result. The contract’s integer arithmetic and confirmed receipt govern final amounts. See the [execution reference](docs/EXECUTION.md) for a worked example.

The scheduler runs conditional-entry, protection and liquidation jobs every minute. Keepers check eligibility and submit a fresh update. The contract checks the rules again at execution. The receipt reconciler records confirmed trade events, updates live shares, creates settlement notifications and saves balance checkpoints. Cursor progress and pending jobs survive outages. Retries preserve the identity of each event across engine, transaction and log. This keeps protection and record recovery independent of an open browser session.

## Funding and wallet activity

- **Faucet:** claim test mUSDC and request sponsored testnet gas where eligible. A pending claim can be checked by its transaction reference.
- **Deposit and withdraw:** move mUSDC between the connected and trading wallets, or use a supported testnet bridge route. The wallet confirms the move and the app records it after chain confirmation.
- **Send:** select a Velo profile or enter an address. The transfer uses the trading wallet and records sender activity. Verified incoming mUSDC events can populate recipient activity independently of the sender’s session.
- **Bridge:** LayerZero OFT routes cover Base, Ethereum, Optimism and Arbitrum Sepolia. Source confirmation and destination delivery are separate states. Trading execution takes place on Base Sepolia.
- **Account activity:** wallet movements and trading outcomes have different classifications. Duplicate reports of a confirmed transfer are consolidated and can retain a known counterparty handle.

## Market discovery

The market directory uses cached CoinMarketCap reference data for prices, market caps, volumes, price changes and rankings. Search, categories, sorting and a watchlist help narrow the directory. A Trade action appears for supported perpetuals. Other assets have information and discussion pages.

Each coin page provides chart ranges, price and market-cap views, market statistics, a project description, official links, related markets, news and discussion. A post composed there receives the coin’s `$tag` and appears in the coin discussion and main feed. Replies use the shared comment system.

## Social, profiles and rankings

- **Feed:** Latest, Trending, Following and Signals surface different slices of the conversation. Traders can post market notes, follow authors, reply in threads, like, react and repost. Author previews link to public profiles.
- **Tagging and links:** Shared composers offer `@handle` and `$ticker` suggestions in posts, comments and sharing notes. Posts and replies have short routes such as `/p/<post>` and `/p/<post>/r/<reply>` and can carry external link previews.
- **Profiles:** Profiles bring a bio, avatar, banner, public posts, follower connections and recorded performance into one place. Public profile URLs use `/profile/<handle>`.
- **Leaderboard:** Period-filtered rankings summarize recorded settlement results and link to the traders behind them. A ranking is a view of available history, with realized results distinct from the value of open positions.
- **Notifications:** Social alerts link to the underlying post, reply or profile. The database validates recipient and action for supported social events, and removes or retracts notices when the corresponding action is undone. Transfer and trade alerts have separate types. Notifications are visible to their recipient.

Supabase currently stores social content, relationships and media. Velo’s [vision](VISION.md) describes publishing selected public interaction and reputation records on-chain in a future release.

## Position sharing and PnL cards

**Position attachment.** Select an open position while composing a post. A compact attachment shows the market, direction, leverage, prices and status. Choose amounts or return percentage. The details dialog links the position ID, times and available verified opening or closing receipts. The attachment follows the trade through settlement.

**PnL image.** Create a Clean card in light or dark appearance with amounts or return percentage, add a caption, then post, share or download. PNG exports are 2400 × 1600 and preserve the capture. A Velo post can keep updating its live values and show the settled result, retain a captured result at close, or remain a fixed snapshot from the start. Live values animate in place and the settled state stops updating. The feed preview opens into a viewer with the caption, actions and comments alongside or below the image. Display preferences control the card. Published blockchain transactions remain inspectable. See [sharing behavior and components](docs/SHARING.md).

## Administration and service ownership

The V4 admin view reads pool assets, available liquidity, reserves, escrow, fee balances and per-market activity. Authorized roles can manage entry pause, liquidity and fee withdrawals, market availability and risk settings. The contract validates those roles, preserves reserved profit and trader collateral, and limits edits while a market has open exposure or pending orders. The guardian can pause entries under the contract’s rules. See the [deployment manifest](contracts/deployments/base_sepolia.json) and [operator guide](docs/OPERATIONS.md).

| Source of truth | Where to look |
| --- | --- |
| Supported markets and addresses | `shared/markets.mjs`, `contracts/deployments/base_sepolia.json`, active engine settings |
| Fills, positions, pending escrow and settlement amounts | `contracts/src/VeloPerpsV4.sol`, matching Base Sepolia receipts |
| Live account views and estimates | `src/services/useVeloPerpsTrading.ts`, `src/services/positionValuation.mjs`, `src/components/ui/pages/Dashboard.tsx` |
| Realized analytics and balance history | `src/services/accountPerformance.mjs`, `src/services/equityStore.ts`, verified settlement and balance rows |
| Offline settlement and recovery | `supabase/functions/velo-keepers/`, receipt reconciliation migrations and `cloudflare/keeper-scheduler.js` |
| Social, identity and sharing | `src/services/supabaseStore.ts`, `src/services/walletAuth.ts`, `src/services/sharedPosition.ts`, `src/components/social/` |
| Prices and reference data | Private Pyth Worker and `cloudflare/market-data.js` |
| Website and public docs | [Velo-Landing](https://github.com/stanisnear/Velo-Landing) |

The active engine is the isolated V4 release. Funding rates, matched order-book execution, cross margin, production copy trading, scoped bot execution, tokenized markets and on-chain social attestations belong to the [roadmap](FUTURES.md). For implementation details, use [Architecture](docs/ARCHITECTURE.md), [Execution](docs/EXECUTION.md) and [Operations](docs/OPERATIONS.md).
