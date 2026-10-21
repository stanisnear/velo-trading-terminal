# Velo documentation

Reviewed 21 October 2026. Velo is a trader hub combining execution, market discovery, news and conversation. The live product uses **Base Sepolia, chain 84532, and mock USDC only**. It is not independently audited or approved for real funds.

## Start here

| Document | Purpose |
| --- | --- |
| [Product README](../README.md) | Current product, features and local development |
| [Vision](../VISION.md) | Audience, long-term direction, roadmap and business hypotheses |
| [Architecture](ARCHITECTURE.md) | Frontend, V4, API, oracle, database and keeper boundaries |
| [Contract reference](../contracts/README.md) | Implemented accounting, risk limits and contract tests |
| [Operations](OPERATIONS.md) | Configuration, deployment, verification, recovery and outstanding operational risks |
| [Release evidence](RELEASE-2026-10-21.md) | Dated test and transaction evidence, with its limits |
| [Funding readiness](FUNDING-READINESS.md) | Application-ready product facts and information still needed from the team |
| [Public product docs](https://velotrading.live/docs) | User-facing behavior and limitations |

The landing repository is [stanisnear/Velo-Landing](https://github.com/stanisnear/Velo-Landing/tree/codex/cloudflare-migration). Its README and `CLOUDFLARE.md` describe that separate static site. The terminal's deployment runbook is [OPERATIONS.md](OPERATIONS.md), not an untracked root `CLOUDFLARE.md` or an old audit attachment.

## Sources of truth

| Topic | Authoritative source |
| --- | --- |
| Deployed addresses | [Base Sepolia manifest](../contracts/deployments/base_sepolia.json), verified against the chain |
| Active engine configuration | [Public configuration](../supabase/functions/_shared/public-config.js) and the actual Pages/Edge Function runtime settings; environment overrides must agree |
| Markets and leverage | [Shared market registry](../shared/markets.mjs) and deployed V4 market configuration |
| Fees and settlement | [VeloPerpsV4.sol](../contracts/src/VeloPerpsV4.sol) and [PerpsMath.sol](../contracts/src/libraries/PerpsMath.sol), not a screenshot estimate |
| Active positions and protection | Confirmed V4 state and transaction events, not database snapshots |
| SQL changes | [Incremental migrations](../supabase/migrations) and hosted migration history; differences are documented in Operations |
| Product ambition | [VISION.md](../VISION.md); plans must not be presented as live features |

## Maintenance rules

- Update README, VISION, contract docs and public docs together when behavior changes. Market changes also require checking homepage previews and both launch-article paths.
- Date verification evidence. A passing build, source verification, a successful scan and a confirmed execution prove different things.
- Keep mock activity separate from genuine adoption, revenue and chain-reconstructed performance.
- Keep old contracts and migrations for decoding and legacy exits. Old design exports, private acceptance fixtures, keys and generated bundles do not belong in tracked source.
- Keep screenshots and illustrative product mockups labeled as samples; they are not evidence of customers, balances or returns.
- Do not publish credentials, private keys, contact exports or application secrets in documentation or cohort attachments.

The Git history preserves earlier descriptions. Current documents supersede the old Vercel deployment, four-market release and V3 fee/accounting descriptions; they do not retroactively repair the legacy contracts.
