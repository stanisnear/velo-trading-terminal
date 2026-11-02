# Velo: founder and investment overview

## The opportunity

Traders move between exchanges, charts, news and social feeds to complete one workflow. Velo brings that workflow together: discover an asset, discuss an idea, trade it and share the position with its context attached.

The product combines a perpetual venue with market discovery and a trader community. Live positions connect a market opinion to its outcome, giving followers a way to inspect the trade and continue the conversation after settlement.

## Product in market

The public Base Sepolia release includes:

- Nine perpetual markets: **BTC, ETH, SOL, DOGE, PYTH, BNB, XRP, HYPE and STETH**.
- Isolated market/limit/stop entries, atomic TP/SL and market-specific leverage up to 25×.
- A dashboard with equity history, open exposure and realized-performance analysis.
- A top-50 asset directory, coin-page discussion and news.
- Posts, replies, reactions, reposts, follows, profiles and notifications.
- Compact live positions and high-resolution PnL sharing with transaction context.
- Wallet onboarding, test funds, gas sponsorship and testnet transfers.

[Open Velo](https://app.velotrading.live) · [Website](https://velotrading.live) · [Product guide](https://velotrading.live/docs)

## Founder and stage

| Topic | Current position |
| --- | --- |
| Founder | Stan Banchev, solo founder |
| Background | [LinkedIn](https://www.linkedin.com/in/stanbanchev/) · [GitHub](https://github.com/stanisnear) |
| Development | Nearly a year of founder-led product development |
| Funding | Bootstrapped |
| Commercial stage | Pre-revenue, public testnet |
| Entity | Founder project; incorporation to be established |
| Availability | Full-time commitment available for the next phase |
| Contact | [info@velotrading.live](mailto:info@velotrading.live) |

## Technical foundation

Velo uses React/TypeScript, Cloudflare Pages and Workers, Supabase and signed Pyth execution prices. V4 separates trader collateral, pending-order escrow, protocol liquidity and fees. Each position reserves its maximum gross-profit capacity at entry.

The active Base Sepolia engine is [`0xE9AEcFbc5814ce3b2dB0107594d80F054e6dB52f`](https://sepolia.basescan.org/address/0xE9AEcFbc5814ce3b2dB0107594d80F054e6dB52f#code). Published source, tests and dated execution records support technical due diligence. [Architecture](ARCHITECTURE.md), [execution](EXECUTION.md) and [review status](SECURITY.md) provide the detail.

Base Builder Code `bc_s0k82w2v` attributes supported Velo transactions.

## What investment accelerates

| Workstream | Intended outcome |
| --- | --- |
| Engine review and liquidity design | A reviewed production specification, capital stress tests and a staged launch |
| Indexing and analytics | Complete trader histories and richer performance discovery |
| Trading permissions and automation | Scoped execution for copy trading and strategy tools |
| Product and distribution | External trader testing, feedback, usage measurement and early community development |
| Infrastructure and partnerships | Reliable prices, wallet access, execution monitoring and production operations |

The next commercial milestones are a measured external trader cohort, repeat usage and a production release supported by reviewed execution and liquidity controls.

## Preparing an application

Use a current product demo, the founder introduction and the latest usage measurements. Keep testnet activity separate from external-user, revenue and retention figures. Present upcoming copy trading, automation and market expansion as the roadmap.

[Vision and business model](../VISION.md) · [Full features](../FEATURES.md) · [Engine roadmap](../FUTURES.md)
