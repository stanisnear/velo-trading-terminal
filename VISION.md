# Velo: a home for traders

Velo puts the venue, the conversation and the track record in one product.

Traders already learn from one another. They discover assets through a post, test an idea against a chart, open a position and return to the conversation to explain what happened. Those steps usually span several products. Velo connects them.

The goal is a trader hub where execution, research and community make each other more useful, starting with crypto perpetuals on Base and expanding across financial markets.

## Who we build for

**New traders** need an understandable path from a market idea to a position: clear controls, visible risk and people to learn from.

**Active traders** need a focused workspace: charts, order management, position protection, performance analysis and a way to share their thinking.

**Followers and researchers** need context: who opened a trade, why they opened it, how it progressed and what its outcome was.

These groups strengthen the same community. Traders contribute positions and analysis; readers contribute questions, research and an audience. A useful reputation grows from both the quality of the conversation and the record behind it.

## The product today

The public Base Sepolia release brings together:

- Nine Pyth-priced perpetual markets with isolated margin, market/limit/stop entries, atomic TP/SL and market-specific leverage up to 25×.
- An account dashboard with equity history, exposure, realized performance and settlement analysis.
- A top-50 market directory, asset research, news and direct coin-page discussion.
- Posts, replies, reactions, reposts, follows, profiles and notifications.
- Live position sharing and high-resolution PnL cards, with transaction context and visible settlement outcomes.
- Wallet onboarding, test funds, gas sponsorship, transfers and testnet bridge routes.
- A V4 engine with separate collateral and pool accounting, reserved profit capacity and published contract source.

The [feature guide](FEATURES.md) walks through the experience. The testnet gives Velo a working environment for product feedback and engine development.

## What makes Velo valuable

### Ideas stay connected to positions

A post can carry a live trade. Readers can follow its status, inspect the transaction and return to the same discussion after settlement. That continuity adds context to a market opinion and gives traders a more useful way to share their work.

### Research leads naturally to action

An asset page connects market data, news and discussion. A trader can move from discovery to execution, then share the result without rebuilding the story elsewhere.

### Reputation can travel with the trader

Profiles bring posts and recorded performance together. The next step is a chain-indexed history that makes results easier to inspect across the full life of an account, providing a stronger foundation for discovery, copy trading and strategy tools.

## Product roadmap

### Deepen the trading foundation

Build a durable event indexer, expand performance analytics, improve execution monitoring and develop scoped trading permissions. Independent contract review and liquidity stress testing support the move from testnet to a staged mainnet release.

The engine roadmap develops capital efficiency, funding mechanics and expanded position management. Each workstream has an explicit accounting and execution design; [FUTURES.md](FUTURES.md) describes those choices.

### Connect traders through strategies

Copy trading will let followers choose an allocation, set risk limits and pause a strategy. Strategy automation will add scoped permissions, spend limits and clear controls. Trader pages will connect these tools to a history of positions and the conversation behind them.

### Broaden the market workspace

Richer research, alerts and structured trade ideas extend the discovery experience. Stocks and commodities are the longer-term direction, bringing more of a trader's financial workflow into Velo.

## Business model

Trading fees form the base of the model. V4 currently uses **0.10% of requested notional** at entry and 0.10% of fixed position notional at close, with time-based borrowing. The current deployment uses test collateral; commercial revenue begins with the production business.

As the product develops, potential revenue streams include:

| Stream | Product connection |
| --- | --- |
| Trading fees | Execution volume across supported markets |
| Copy-trading performance share | Shared economics between the trader, followers and Velo |
| Strategy tools | Execution or subscription fees for automation and advanced workflows |
| Premium analytics | Deeper performance, discovery and alerting tools |
| Liquidity services | Fees tied to a separately designed liquidity participation model |

The priority is to align revenue with a useful trading experience and the value created by contributors.

## Liquidity and execution development

V4 uses protocol-owned liquidity alongside separate trader and order escrow. Each position reserves its maximum gross-profit payout, giving the current engine a defined exposure model. The [execution reference](docs/EXECUTION.md) explains the ledgers and settlement math.

The next design phase covers open-interest and skew limits, funding, capital efficiency, withdrawal rules and liquidity participation. These decisions shape how the venue scales and how different participants share its economics.

## Building the next chapter

Velo has been built by **Stan Banchev**, a solo founder, over nearly a year. The business is bootstrapped and pre-revenue. The next phase focuses on external trader feedback, measurable usage, engine development and the team and partnerships needed for production.

Investment and accelerator support would help fund independent security review, engineering, liquidity design and early distribution. Technical and ecosystem partners can contribute price infrastructure, wallet tooling, chain indexing and market access.

For investors, accelerators, partners and contributors: **[info@velotrading.live](mailto:info@velotrading.live)**.

[Open Velo](https://app.velotrading.live) · [Product guide](https://velotrading.live/docs) · [Architecture](docs/ARCHITECTURE.md)
