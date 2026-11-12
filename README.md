# Velo

**A trading venue and social network for decentralized finance.**

Velo brings market research, on-chain execution and the conversation around a trade into one workspace. Discover an asset, see how other traders are thinking about it, take a position and share it with a record followers can inspect from entry to settlement.

[Open the testnet](https://app.velotrading.live) · [Website](https://velotrading.live) · [Product guide](https://velotrading.live/docs) · [Contact](mailto:info@velotrading.live)

## What you can use today

Velo is live on **Base Sepolia** with mUSDC test collateral. The app combines:

| Area | What it does |
| --- | --- |
| **Trade** | Trade nine Pyth-priced crypto perpetuals using isolated margin, market/limit/stop entries and on-chain take-profit and stop-loss. Market-specific leverage reaches 25×. |
| **Dashboard** | Track live equity, buying power, account balance history, open exposure, realized performance and wallet activity. |
| **Markets** | Explore the top 50 crypto assets, build a watchlist and join discussions directly from coin pages. |
| **Social** | Publish ideas, follow traders, reply in threads, react, repost and share live positions or high-resolution PnL cards. |
| **Profiles and rankings** | Explore a trader’s posts and recorded performance, then follow the people behind the ideas. |
| **Wallet** | Sign in with a wallet, claim test collateral, deposit, withdraw, send and track testnet bridge transfers. |

Tradable markets: **BTC, ETH, SOL, DOGE, PYTH, BNB, XRP, HYPE and STETH**. The market directory also covers assets for research and discussion.

## How it works

[VeloPerps V4](https://sepolia.basescan.org/address/0xE9AEcFbc5814ce3b2dB0107594d80F054e6dB52f#code) validates signed Pyth prices, applies market risk rules and settles trades against a contract-held liquidity pool on Base Sepolia. It accounts for trader collateral, pending-order escrow, pool capital and fees separately. Scheduled keepers handle eligible conditional orders, protective exits and liquidations. Confirmed receipts link executions to account history, notifications and live shares while traders are away.

The React and TypeScript app uses Reown, wagmi and viem for wallet and chain access. Cloudflare serves the app, price gateway and scheduler. Supabase supports sign-in, profiles, conversation, media and indexed records. CoinMarketCap supplies reference data for market discovery.

## Where Velo is going

Velo is building toward a home for decentralized finance: a social network for financial ideas, a venue for executing them and an inspectable record of the outcome. Crypto perpetuals are the first market. The roadmap extends to tokenized assets, equity and commodity exposure, copy trading with allocation limits, and bots with scoped trading permissions. As the social layer grows, Velo aims to make selected public interactions and reputation records portable and verifiable on-chain. [Product vision](VISION.md) · [Engine roadmap](FUTURES.md)

## Develop

Use Node.js 22.12 or newer.

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
```

| Directory | Contents |
| --- | --- |
| `src/` | Product views, UI components and client services |
| `contracts/` | Solidity contracts, deployment manifest and Foundry tests |
| `api/`, `cloudflare/` | API routes, hosting gateway, price services and scheduler |
| `supabase/` | Database migrations and Edge Functions |
| `shared/` | Market registry, routes and shared execution definitions |
| `scripts/`, `tests/` | Build, release, recovery and regression tooling |

Start with the [full product reference](FEATURES.md) or the [current status and pitch brief](docs/FUNDING-READINESS.md). The [documentation index](docs/README.md) links to architecture, execution, contract and operations references.
