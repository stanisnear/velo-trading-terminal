# Velo feature guide

Updated 31 October 2026. Velo connects a trading venue, market research and a trader community. The current release uses mock USDC on Base Sepolia (84532). [VISION.md](VISION.md) describes the broader product direction; this guide describes what the app does today.

## Find your way around

| Area | What it does | Data and limits |
| --- | --- | --- |
| Dashboard | Total equity, range chart, funding actions, compact exposure, performance analysis, account/contract links, positions and recent activity | Equity combines available funds, margin, refundable order escrow and open PnL. Available history determines enabled chart ranges. |
| Trade | Price chart, timeframe/indicator controls, fills, order ticket, positions, protection, history and execution dialogs | Nine enabled V4 markets. Chart/reference data and the contract's execution price are different data products. |
| Markets | Top-50 crypto directory, search, categories, sorting, watchlist and asset pages | CoinMarketCap reference data; inclusion does not imply a tradable perpetual. |
| Coin page | Chart, concise asset background, official links, market statistics, related assets, news and discussion | Publish directly with the coin's $tag attached. The same post appears in Social. |
| Social | Posts, replies, reactions, likes, reposts, follows, tagging, media and position sharing | Supabase-backed conversation, with receipt inspection for linked positions. |
| Profile | Identity, avatar/banner, biography, posts, followers and account activity | Display identity is distinct from the trading-wallet address and on-chain handle registration. |
| Leaderboard | Period-filtered trader rankings and profile discovery | Stored performance summaries; not an independently indexed or audited track record. |
| Admin | Owner-authorized pool, fee, market/risk and operational controls | Permissions and withdrawal restrictions are enforced by V4, not by hiding buttons. |

## Account and wallet

Connect a supported wallet through Reown, then sign an expiring login challenge. The server verifies the signature and restores the matching account. A valid session survives reload; expiry or explicit logout requires authentication again. Logout clears the active session and gives the user a choice of wallet on the next login.

The Velo trading wallet is separate from the connected wallet. A signature over the fixed trading message derives its key; the browser uses that key to sign orders without another external-wallet popup for each order. Repeating the derivation can restore the same trading address on another device. This is a powerful browser-held key, **not a contract-enforced session key with restricted methods, spending caps or expiry**.

Profiles use a readable handle. The registry has separate rules: 3–16 lowercase letters, digits or underscores, beginning with a letter, one handle per address and a 30-day change interval. The registration transaction must confirm before blockchain registration can be treated as complete; a saved social profile alone is not that proof.

Wallet & Settings includes funding, transfer and wallet controls, appearance and optional interface feedback. Interface sounds are opt-in. Credentials and provider keys stay outside the public repository and frontend bundle.

## Trading and protection

- **Markets:** BTC, ETH, SOL, DOGE, PYTH, BNB, XRP, HYPE and STETH. BTC/ETH allow up to 25×, SOL/BNB 20×, XRP 15× and the remaining markets 10×. Runtime enablement and risk limits also apply.
- **Market entry:** a signed Pyth update, execution deadline and adverse-price bound are validated in the opening transaction. The position exists only after a successful receipt.
- **Limit/stop entry:** collateral is escrowed on-chain. Keepers evaluate the condition and submit execution; the contract rechecks the price, bounds, expiry, capital and risk limits. An eligible trigger does not guarantee a fill.
- **TP/SL:** attached atomically at entry or edited later. Confirmed protection appears in Open Orders. Cancelling one leg preserves the other. A trigger closes the position in full.
- **Manual close/liquidation:** a fresh oracle update and contract settlement determine the payout. Liquidation considers remaining equity after settlement costs against maintenance requirements.
- **Recovery:** submitted, confirmed, reverted and unresolved transactions have distinct states. A timeout preserves the transaction reference for reconciliation; it does not prove failure or authorize a duplicate order.

V4 uses isolated collateral and fixed notional, a two-second minimum holding period and a capped profit model. Cross margin, partial close, add/reduce margin, public LP shares and reduce-only entry orders are not implemented. Legacy exits remain separate from new V4 execution.

The chart supports one-second and longer intervals, local time display, indicators and a return-to-live action after historical browsing. Selecting a new timeframe starts at the latest available candle. Historical/reference candles do not guarantee the oracle price or fill available when a transaction executes.

## Funding and account activity

The faucet supplies test collateral, subject to service limits and available sponsored gas. Deposit, withdrawal and send flows distinguish transaction submission from receipt confirmation. Send supports a profile lookup or address; verified recipient activity can be recovered independently of the sender's session. Existing bridge routes are testnet transfers, not four live perpetual venues.

Activity groups the transfer and its higher-level operation. A returned position margin is settlement, not a new external deposit. A closed trade displays realized PnL separately from released collateral. Notifications follow their source actions: reversing a like/reaction removes its associated notice rather than leaving a stale event.

## Equity and performance

**Equity** is account value at a point in time. It includes cash movements and marked open exposure. Durable saved observations and verified account checkpoints provide history across sessions/devices; device observations can supplement it. Historical dates with no observations or recoverable checkpoints do not become invented marked-equity values merely because the profile is older.

**Performance** is realized trading PnL from recorded closes and liquidations, including partial settlements from older engines where present. Its period chart, market breakdown, win rate, average result, profit factor and drawdown exclude deposits, withdrawals and unrealized gains. Empty periods have an explicit empty state. Rankings still depend on stored records pending independent chain reconciliation.

## Conversation and sharing

- @people and $asset suggestions work in post, reply/comment and sharing-note composers, including direct coin-page publishing. Keyboard navigation, caret insertion and escape dismissal use the same input component.
- Posts and replies have addressable short paths: `/p/<post>` and `/p/<post>/r/<reply>`. Profiles use `/profile/<handle>`. Public previews resolve the linked conversation.
- **Position attachment:** a compact position summary, with amounts or return percentage. Click it for opening/settlement time, engine, position ID and available transaction evidence.
- **PnL image:** one clean Velo design, independently selectable light/dark appearance and amount/percentage presentation. High-resolution PNG exports are fixed captures.
- **Live Velo share:** animates current marks and PnL in the post rather than generating a new screenshot each tick. On confirmed settlement it shows the realized result, or preserves the selected capture with a closed-snapshot label.
- **Media viewer:** a bounded full image beside the post, actions and threaded discussion on desktop; a stacked layout on smaller screens.
- Closing a position offers a small Share action in the result flow. It does not force the full sharing studio open.

Amount controls affect presentation. They do not make publicly inspectable blockchain amounts private. See the [sharing guide](docs/SHARING.md) for refresh cadence, settlement evidence and export details.

## Infrastructure and operating model

The React/Vite app and static landing/docs deploy on Cloudflare Pages. Pages routes handle the API gateway; a service-bound Worker protects Pyth credentials. Supabase provides wallet-auth API functions, Postgres, Realtime, Storage and durable operational state. A minute scheduler invokes keepers. Browser transactions and keeper transactions settle on Base Sepolia.

V4 separates pool assets, position collateral, pending-order collateral and accrued fees. The pool reserves each position's notional as its maximum gross-profit liability. The owner can fund the pool and withdraw only available, unreserved liquidity or accrued fees. This is protocol-owned test liquidity, not an open LP yield product. The contract is source-verified; independent security review is still outstanding.

## Further reading

[Execution and accounting](docs/EXECUTION.md) · [Architecture](docs/ARCHITECTURE.md) · [Operations](docs/OPERATIONS.md) · [Future engine decisions](FUTURES.md) · [Public docs](https://velotrading.live/docs)
