# Velo funding and cohort preparation

Prepared 21 October 2026 from the current [README](../README.md), [VISION](../VISION.md), deployed V4 configuration and [release evidence](RELEASE-2026-10-21.md). This is a facts/checklist document, not an application submission, valuation or promise of funding. Cohort eligibility, benefits and deadlines must be checked when selecting programs.

## Positioning

**One line:** Velo is a trader hub bringing on-chain execution, market discovery and social conversation into one product, starting with crypto perpetuals on Base.

**Short application description:** Traders currently move between an exchange, charts, news and social feeds. Velo brings those workflows together: a trader can discover an asset, discuss an idea, trade it and share the transaction context. A working Base Sepolia prototype combines a nine-market isolated perpetual engine, a top-50 reference market directory, news, profiles, threaded discussions and notifications. The next trust milestone is chain-reconstructed performance, followed by risk-bounded copy trading and strategy automation. Mainnet and broader financial instruments require independent security, liquidity, data and jurisdictional review.

This preserves the long-term ambition in VISION. Do not position Velo as only a contract, a generic chat feed, an existing brokerage, or a finished copy-trading platform.

## Facts that can be supported today

| Claim | Evidence / qualification |
| --- | --- |
| Working product | [Live app](https://app.velotrading.live), [public docs](https://velotrading.live/docs), source and a guided disposable-testnet demo |
| Base execution | Base Sepolia chain 84532, mock USDC only; no mainnet or real-fund claim |
| V4 contract | `0xE9AEcFbc5814ce3b2dB0107594d80F054e6dB52f`, [BaseScan source](https://sepolia.basescan.org/address/0xE9AEcFbc5814ce3b2dB0107594d80F054e6dB52f#code), exact-match Sourcify; unaudited |
| Markets | BTC, ETH, SOL, DOGE, PYTH, BNB, XRP, HYPE, STETH perpetuals; separate top-50 information directory |
| Risk model | Isolated collateral, bounded orders, fresh Pyth prices, segregated ledgers, fully reserved capped gross profit; protocol-owned mock liquidity, no public LP shares |
| Social product | Public posts/profiles, reactions, replies, reposts, follows, mentions/cashtags, post/reply links and asset discussions |
| Execution evidence | Dated open/protection-edit/cancel/close receipts in the release record; automation has a one-minute schedule, not a guaranteed fill SLA |
| Attribution | Registered Base Builder Code `bc_s0k82w2v` integrated into supported Base/Base Sepolia writes. Attribution does not imply a grant, partnership or endorsement |
| Architecture | Cloudflare Pages/Workers and Supabase, local test suites and durable signer/transaction recovery |

## Claims to avoid

- No independently audited, mainnet-ready, risk-free, institutional-grade or flawless claim.
- No real revenue, TVL, trading volume, retention or user-count claim from mock balances, team accounts, acceptance fixtures or illustrative mockups.
- No tamper-proof leaderboard or audited performance claim: profiles still use stored summaries rather than an independent event indexer.
- No live copy trading, autonomous bots, cross margin, partial close, collateral adjustment, stocks, forex or commodities.
- No insured pool, public LP yield, uncapped profit, zero slippage, instant settlement or guaranteed keeper response.
- No confirmed Pyth sponsorship, Base funding or other partnership unless a separate written approval exists. The founder reports that Pyth outreach was sent; a reply/access extension is not established by that fact.

## Team inputs before any application

- Founder/team identities, roles, relevant experience, location, availability and contact details approved for publication.
- Entity/incorporation status, ownership/cap table, any existing commitments and jurisdictional constraints.
- A dated traction export separating external users, team users and automated fixtures. Measure active funded testnet traders, repeat usage, successful confirmed actions and failure/recovery rates with clear denominators.
- User interviews and a focused initial customer segment, including what users do in Velo instead of their existing tools.
- Provider access terms, remaining credits/quotas and a realistic recurring budget for oracle/RPC, database/hosting, monitoring and security review.
- The amount requested, milestone budget, runway assumptions and intended use of funds. No unsupported valuation or return estimate is supplied here.
- A short deck, a two-minute product demo, founder video if requested, and a consistent public contact/press pack. Use genuine current UI; label samples.

No missing founder fact should be invented to make a form look complete.

## Milestone-based case for support

| Milestone | Work | Completion evidence |
| --- | --- | --- |
| Reliable testnet | Measure wallet/onboarding/trading/recovery flows across devices, monitor oracle/RPC/keepers | Repeatable acceptance results, incident log, latency/failure distributions and retained external testers |
| Trustworthy records | Chain indexer, receipt reconciliation, demo/test separation | Rebuilt histories and rankings that match chain events after reorg/retry/restart tests |
| Security foundation | Independent contract review, remaining DB/privacy cleanup, reproducible schema, scoped signing and admin-key controls | Review report/remediations, authorization tests, baseline restore rehearsal and documented custody boundaries |
| Social trading validation | Prototype allocation/slippage/loss limits, permissions and kill switches | Explicitly labeled testnet copy/strategy pilot, adversarial failure tests and user feedback |
| Mainnet decision | Liquidity/risk design, legal review, sustainable data access and operational readiness | Written go/no-go checklist and external review; no launch date assumed |

## Application packet checklist

1. Use this document for product facts, VISION for ambition and the release record for technical evidence.
2. Add verified founder/traction/budget inputs and link the current source commit. Keep confidential material in an access-controlled data room, not the public repo.
3. Recheck the chosen program's official eligibility, application deadline, terms, support and requested materials. Credits are not necessarily unrestricted cash or an endorsement.
4. Tailor the ask to a measurable milestone. Infrastructure/data partners, security reviewers and event-indexing contributors are near-term needs; promised copy-trading revenue is not current traction.
5. Review and approve the final submission with the founder. This update has not submitted applications, signed program terms, sent investor outreach or changed accounts.
