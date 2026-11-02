# Velo documentation

Velo brings perpetual trading, market discovery and a trader community into one workspace. The public release runs on Base Sepolia with mUSDC test collateral.

## Product

| Guide | What you will find |
| --- | --- |
| [Overview](../README.md) | The product, how it works and how to run it |
| [Features](../FEATURES.md) | Trading, dashboard, research, social and wallet workflows |
| [Public guide](https://velotrading.live/docs) | Getting started and using Velo |
| [Trade sharing](SHARING.md) | Live positions, PnL cards, image exports and conversation |
| [Vision](../VISION.md) | Audience, product direction and business model |
| [Engine roadmap](../FUTURES.md) | Funding, execution models, liquidity and position management |

## Engineering

| Reference | What you will find |
| --- | --- |
| [Architecture](ARCHITECTURE.md) | Frontend, services, data flow and on-chain execution |
| [Execution and accounting](EXECUTION.md) | Order lifecycle, settlement, fee example and pool ledgers |
| [Contracts](../contracts/README.md) | Solidity implementation, deployed markets and Foundry tests |
| [Security](SECURITY.md) | Key handling, review status and deployment considerations |
| [Operations](OPERATIONS.md) | Configuration, deployment, monitoring and recovery |
| [Design system](EXPERIENCE-DESIGN-2026-10-28.md) | Components, typography, motion and accessibility decisions |

The [landing repository](https://github.com/stanisnear/Velo-Landing) contains the website, public guide and product previews. Both repositories publish their current documentation on `main`.

## Maintainer references

Contract addresses live in the [deployment manifest](../contracts/deployments/base_sepolia.json). The [market registry](../shared/markets.mjs) defines supported pairs and leverage limits; [public configuration](../supabase/functions/_shared/public-config.js) supplies the app's deployment defaults. Fee and settlement calculations are implemented in [VeloPerpsV4.sol](../contracts/src/VeloPerpsV4.sol).

Dated release records preserve the checks and transactions for each release. [Application preparation](FUNDING-READINESS.md) brings together founder information, product facts and the investment workstreams.
