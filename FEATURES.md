# The Velo experience

Velo connects market discovery, trading and conversation. This guide follows the product from the first sign-in to the settled trade. The public release runs on Base Sepolia with mUSDC test collateral.

## Your workspace

| Page | What you can do |
| --- | --- |
| Dashboard | Track account equity and buying power, inspect exposure, explore realized performance and manage funds |
| Trade | Read live charts and fills, place market/limit/stop entries and manage positions and TP/SL |
| Markets | Search, filter, sort and watch the top 50 crypto assets |
| Coin pages | Explore prices, asset background, official links, statistics, news and the coin's conversation |
| Social | Publish ideas, follow traders, reply in threads, react, repost and share positions or PnL images |
| Profile | Set a name, avatar, banner and biography; browse posts, followers and recorded activity |
| Leaderboard | Discover traders through period-filtered performance rankings and public profiles |
| Wallet & Settings | Manage wallets, funding, transfers, appearance and optional interaction sounds |
| Admin | Manage authorized pool, fee, market and risk operations |

## Sign in and get started

Connect through Reown and sign the Velo login message to verify wallet ownership. Choose a readable username, personalize your profile and set up your trading wallet. A valid session restores when you refresh; signing out gives you a fresh wallet choice next time.

The trading wallet signs orders locally after setup. Its public address is linked to your account, and wallet settings provide address copying, backup and export controls. The username registry supports 3–16 lowercase letters, numbers or underscores, beginning with a letter, with a 30-day interval between name changes.

Claim mUSDC and sponsored testnet gas from the faucet to begin exploring the trading flow.

## Trading

### Nine perpetual markets

| Markets | Maximum leverage |
| --- | --- |
| BTC, ETH | 25× |
| SOL, BNB | 20× |
| XRP | 15× |
| DOGE, PYTH, HYPE, STETH | 10× |

Each position uses isolated margin. The order ticket brings margin, leverage, position size, liquidation estimate and fees together before submission.

### Order types and protection

- **Market:** enter using the current validated Pyth price, with an execution deadline and price bound.
- **Limit:** choose a maximum buy price or minimum sell price. Collateral is reserved while the order waits.
- **Stop:** enter after the market reaches a chosen trigger, within the order's price bound.
- **Take-profit / stop-loss:** attach protection with the opening transaction or edit it afterward. Linked protection appears in Open Orders; each leg can be managed independently.
- **Close:** settle the full position manually, or through its protection rules. Confirmation updates positions, balances and history together.

The execution flow shows signing, submission and confirmation as distinct stages. Pending transactions retain their reference so the app can reconcile the original submission after a timeout.

### Charts and trading tools

Charts offer one-second and longer intervals, indicators, display styles and local time labels. Timeframe changes begin at the latest candle; **Back to live** returns you after browsing history. Desktop traders can adjust the feed/ticket split with the resize control.

Position details combine entry and mark prices, margin, leverage, PnL, liquidation buffer and timing. The close and protection dialogs include estimated outcomes and interactive controls.

## Your dashboard

**Equity** tracks account value: available funds, pending-order collateral and estimated position payouts. Saved observations follow the account across sessions; verified historical checkpoints extend the available record. Range controls reflect the history available for that account.

**Exposure** summarizes margin in use and open PnL. Open its breakdown for position-level detail, while the main positions table keeps management actions close at hand.

**Performance** explores realized trading PnL over time. Use period filters, the settlement calendar and market breakdown to inspect win rate, average result, profit factor and drawdown. Select a settlement for its recorded result and transaction context.

**Activity** brings confirmed transfers, funding actions and trade outcomes into one timeline. A position close shows its trading result; released margin stays part of settlement.

## Funding and transfers

Deposit, withdraw, claim test funds or send to another trader from the dashboard or wallet settings. Recipient lookup accepts a profile or wallet address. Transfer records include receipt links, and incoming activity can be recovered from confirmed chain events.

LayerZero OFT routes connect Base, Ethereum, Optimism and Arbitrum Sepolia for testnet transfers. The transfer flow tracks source confirmation and destination delivery.

## Discover and discuss markets

The market directory covers the top 50 crypto assets with prices, categories, watchlists and sortable statistics. Each asset page brings together a chart, concise project background, official links, market data, news and discussion.

Write directly from the coin page. Velo adds the coin's $tag and publishes the post to both the asset conversation and the main feed. Replies and reactions work in the same conversation wherever you open it.

## The trader community

- Posts, threaded comments and replies.
- Likes, reactions, reposts and follows.
- Latest, Trending, Following and Signals feed views.
- @people and $asset suggestions across post, reply and sharing-note composers.
- Short post and reply links, with previews for external sharing.
- Public profiles, author previews, avatars, banners and biographies.
- Notifications linked to social actions; removing a like or reaction also removes its associated notice.

Browse public markets, posts and profiles before signing in. Use header search or **⌘/Ctrl K** to jump to a page, trader or asset.

## Two ways to share a trade

### Position attachment

Attach an open position to your post as a compact section. Choose whether to show invested amounts or focus on return percentage. Followers can inspect its market, direction, leverage, entry, current mark and status, then open details for timestamps and transaction links.

The attachment follows the position through settlement, keeping the original idea and its outcome connected.

### PnL image

Create a Clean Velo card in light or dark mode, independently of the app theme. Choose amounts or return percentage, add a note and post, download or share it.

- **Snapshot:** preserve the captured result and time.
- **Live post:** animate current prices and PnL in place, then show the settled result.
- **Captured finish:** follow the open trade, then retain your chosen capture when it closes.

PNG exports use a **2400 × 1600** canvas. Feed previews keep the card's proportions; opening an image shows the post, actions and discussion beside it on desktop and below it on mobile. Exported files remain fixed captures. Blockchain transaction details remain publicly inspectable regardless of the card's amount-display preference.

Closing a position offers a small **Share** action, so sharing remains part of your workflow rather than an interruption.

## Design and access

Velo uses Switzer interface type, Fraunces editorial accents and a consistent glass material across pages and dialogs. Light and dark themes, responsive navigation, keyboard controls, reduced-motion support and optional sound feedback carry through the app. Financial values animate in place as data changes.

The web app is installable as a PWA on desktop and mobile.

## Explore further

[Product vision](VISION.md) · [Sharing guide](docs/SHARING.md) · [Execution and fees](docs/EXECUTION.md) · [Architecture](docs/ARCHITECTURE.md) · [Engine roadmap](FUTURES.md)
