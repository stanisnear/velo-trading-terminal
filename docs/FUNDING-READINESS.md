# Velo current status and pitch brief

**Velo is a trading venue and social network for decentralized finance.** It connects the idea behind a trade to an outcome people can inspect on-chain.

[Website](https://velotrading.live) · [Live testnet](https://app.velotrading.live) · [Product guide](https://velotrading.live/docs) · [Contact](mailto:info@velotrading.live)

## Pitch copy

Traders discover ideas in a social feed, research them in separate tools and execute somewhere else. Followers rarely get to see what happened after a trade idea was posted. Velo brings those steps together. Traders can research an asset, discuss it, open a position and share a live attachment that follows the position through settlement. The discussion carries the reasoning, and the blockchain carries the execution record. Velo starts with crypto perpetuals on Base and is building toward a broader DeFi venue for tokenized markets, copy trading and automated strategies.

## What exists today

| Area | Shipped on public testnet |
| --- | --- |
| Trading venue | Nine Pyth-priced perpetuals on Base Sepolia with mUSDC, isolated margin, market/limit/stop entries, position protection and up to 25× leverage by market. |
| Research | Top-50 crypto directory, watchlists, charts, asset profiles, news and coin discussions. |
| Community | Posts, threaded replies, reactions, reposts, follows, notifications and public profiles. Traders can attach live positions and share PnL cards. |
| Account tools | Live equity, balance history without unrealized PnL, realized performance, exposure, activity and wallet funding and transfers. |
| Execution and evidence | Published V4 contract source, signed Pyth prices, contract-held liquidity with separate escrow, and receipt-backed settlements. Scheduled keepers process eligible orders and exits while traders are away. |

Velo’s nine perpetuals are BTC, ETH, SOL, DOGE, PYTH, BNB, XRP, HYPE and STETH. The [deployed V4 engine](https://sepolia.basescan.org/address/0xE9AEcFbc5814ce3b2dB0107594d80F054e6dB52f#code), [product reference](../FEATURES.md) and [execution guide](EXECUTION.md) provide the technical evidence. Base Builder Code `bc_s0k82w2v` attributes supported transactions.

## Founder and stage

| Topic | Current position |
| --- | --- |
| Founder | Stan Banchev, solo founder. [LinkedIn](https://www.linkedin.com/in/stanbanchev/) · [GitHub](https://github.com/stanisnear) |
| Build history | Founder-built over roughly a year at the time of application preparation. |
| Stage | Public testnet, bootstrapped and pre-revenue. |
| Outside funding | None raised, as reported by the founder. |
| Company | Incorporation pending, as reported by the founder. |
| User metrics | External testers, retention and conversion have yet to be measured. Use measured cohort results when available. |
| Commitment | The founder has confirmed availability to commit full-time. |
| Contact | [info@velotrading.live](mailto:info@velotrading.live) |

## Who it serves

**Active traders** get a focused venue and a way to share their reasoning and execution history. **Market researchers and creators** get an audience and a place for structured discussions around an asset. **Followers and new traders** can inspect a position and its outcome alongside the original thesis. **Strategy builders** are a future audience for scoped bot execution and distribution.

## Next milestones

1. **Measure repeat usage.** Bring an external trader cohort through discovery, first trade and first share. Measure activation, return sessions and how often viewers inspect shared positions.
2. **Prepare the venue for production.** Advance independent contract review, liquidity design, execution monitoring and staged market limits. Improve chain indexing coverage so performance can be traced over a trader’s history.
3. **Turn reputation into tools.** Add copy trading with allocation, slippage and loss limits, and bots with revocable permissions. Settle executions on-chain and connect strategy results to the trader’s profile.
4. **Expand the network and markets.** Design portable, verifiable records for selected social interactions. Extend coverage toward tokenized assets, equity exposure and commodities as market access, oracle quality and liquidity support them.

Today’s trading execution and settlements are on-chain. The current social layer uses Supabase. Copy trading, bot execution, tokenized markets and on-chain social records are the next product direction. [Vision](../VISION.md) · [Engine roadmap](../FUTURES.md)

## What funding accelerates

Capital and ecosystem support would accelerate engineering, independent security review, liquidity design and the first external trader cohort. Relevant partners include oracle and RPC providers, wallet and indexing infrastructure, liquidity operators and teams with access to tokenized markets. Trading fees are the initial commercial model. Copy-trading economics, strategy tools and advanced analytics offer expansion paths as usage grows.

**Demo sequence:** Open a coin page, show its discussion, place a testnet trade with protection, share the live position, then open a confirmed settlement and show the realized result in Performance. Use a settled example for the final step so the explanation can focus on the receipt and outcome.
