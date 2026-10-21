# Velo: vision, roadmap and business model

This document is for investors and contributors. It explains where Velo is going, how it can make money, and which ideas are open. The [README](README.md) describes what exists today.

**Reviewed 21 October 2026.** The V4 testnet release is the current implementation, not the final mainnet risk design. Supporting evidence and the application checklist are in [docs/FUNDING-READINESS.md](docs/FUNDING-READINESS.md).

**Reading guide.** Everything under "Today" is built and running on testnet. Everything else is a plan or an idea. Plans are intentions, not commitments, and none of this is financial advice or an offer of any kind.

## The thesis

People trade where they get information, and they get information from each other. Today those two things live in different products: the venue that holds the money has no community, and the community has no way to act on what it discusses or to prove it was right.

Velo puts the venue, the conversation and the track record in one product. The long-term bet is that this combination is a better front door to markets than any one of them alone, and that it can be extended from crypto to the rest of finance.

## Who we are building for

1. **New entrants** who find crypto confusing. They need guidance, safe defaults and people to learn from, not a wall of order types.
2. **Active traders** who want fast execution, real risk tools and a place to share ideas.
3. **Followers and learners** who mostly read and discuss, and may start copying people they trust.

New entrants bring growth, traders bring volume, and followers bring the audience that makes a trader's reputation worth something. Each group makes the others more valuable.

## Today

- V4 perpetual futures terminal on Base Sepolia testnet: nine crypto markets, isolated market/limit/stop entries, atomic take-profit and stop-loss, market-specific leverage up to 25x, keeper-triggered liquidations and Pyth pricing
- Social layer: posts, threaded replies, reactions, reposts, follows, profiles, notifications, short post/reply links, cashtags and link previews
- Top-50 market directory with a discussion thread per asset, a news tab and a leaderboard
- Guided onboarding, faucet and gas sponsorship, testnet bridge routes
- Production-style infrastructure: Cloudflare Pages and Workers, Supabase, a one-minute keeper scheduler with durable transaction handling
- Public contracts, verified V4 source on BaseScan and Sourcify, and a Foundry test suite. Source verification is not an independent security audit

Active positions and orders come from V4 contract state. Legacy positions have separate exit controls and are not automatically migrated. Public market data and social records are distinct from the settlement oracle and the on-chain ledger. Copy trading, bots and non-crypto trading are not live.

## Roadmap

### Phase 1: make the core trustworthy
- Independent review of V4's segregated ledgers and reserved-profit model, followed by a mainnet-specific risk and liquidity design before any real funds. The testnet accounting replacement is deployed; independent review is not complete
- An indexer that reconstructs every trader's history from on-chain events, so profiles, PnL and the leaderboard rest on verifiable results rather than stored profile metrics
- Validate the nine-market V4 release and improve order management. Partial closes, margin adjustment and cross margin are possible future designs, not promised V4 features; they require new accounting, tests and review
- Permission-scoped session keys instead of a browser-held trading key

### Phase 2: social trading
- **Copy trading** with per-follower allocation, slippage limits, loss limits and a clear pause switch
- **Trading bots** that run under scoped permissions, spend limits and kill switches, with transparent public performance
- Trader pages that show verified results next to their posts
- Richer alerts and discovery, building on the existing watchlist and market directory

### Phase 3: a hub for all markets
- Classic instruments alongside crypto, such as stocks and commodities, starting with exposure that fits the existing on-chain model
- Richer news, research and discussion, including structured trade ideas that can be followed through to an outcome
- Mainnet launch, gated on Phase 1

## Revenue model

**Today:** the V4 contract models trading fees in mock USDC only. Opening costs 0.10% of requested notional (submitted collateral times leverage); the position's fixed notional is then net collateral times leverage. Closing costs 0.10% of that fixed notional, subject to available equity. Borrowing defaults to 0.01% per hour on notional. Keeper-triggered settlement can pay up to 0.05% of notional to the keeper. None of this is real revenue on testnet. The [contract reference](contracts/README.md) and deployed parameters govern the details.

**Streams we are considering.** These are ideas, ordered roughly by how directly they follow from the product:

| Stream | How it would work |
| --- | --- |
| **Trading fees** | The base layer. Fee levels and tiers would be set against volume and market conditions before mainnet |
| **Copy-trading revenue share** | A follower who profits pays a performance share. Part goes to the trader being copied, part to Velo. This aligns traders with the people who follow them |
| **Bot fees** | Fees on strategies run through Velo, split with strategy creators if bots are opened to third parties |
| **Liquidity vault fees** | If a liquidity vault exists, a share of vault profit or of the trading fees it earns |
| **Liquidation and keeper economics** | A small protocol share of liquidation bounties, while keeping bounties high enough that liquidations stay reliable |
| **Premium features** | Optional paid tools such as advanced analytics, alerts or profile features, kept separate from core trading |

We have not published financial projections, and this document does not contain any.

## Liquidity and the counterparty question

Today, V4 uses protocol-owned mock-USDC liquidity, segregated from trader collateral, pending-order escrow and accrued fees. Trader losses increase pool assets and profits are paid from them. Every position reserves its fixed notional as its maximum gross profit; gross profit is capped at one notional, and trader losses are capped at collateral. The owner can withdraw only unreserved liquidity and accrued fees. There are no public LP shares, funding-rate transfers or insurance fund. This is a deliberately bounded testnet model, not an uncapped exchange or a yield product.

Opening the pool to outside liquidity is a natural next step and an important design problem. Open questions we are working through:

- **Vault design.** Deposit and withdrawal accounting, share pricing, and how to keep a withdrawal from leaving open positions unbacked
- **Risk limits.** Caps on open interest, per-market exposure and skew, so a vault cannot be drained by one directional move
- **Who bears losses.** How profit and loss are shared between vault depositors and any protocol backstop
- **Oracle and liquidation risk.** What happens when prices gap or keepers fall behind

An external-liquidity vault requires a separate specification and implementation, adversarial testing and independent review; V4 does not supply one. Nothing here should be read as a promise of yield.

## Why we think it can work

- The product already spans trading, social and market data, instead of being a mockup of one of them
- The infrastructure is built to run unattended: scheduled keepers, durable transaction recovery, row-level security, rate limits and tested failure paths
- Verifiable track records are the missing piece for trust in social trading, and an on-chain venue is the right place to build them

## Risks we take seriously

- **Smart-contract risk.** V4 source is verified but unaudited. Mainnet depends on independent review, a production risk design and the Phase 1 release gates
- **Regulation.** Leveraged derivatives, copy trading and traditional instruments are regulated differently across jurisdictions, and the design must account for that before launch in any region
- **Counterparty and liquidity risk** as described above
- **Oracle and keeper dependence.** Liquidation and order execution depend on price feeds and scheduled jobs
- **Execution risk.** A broad plan is easy to write and hard to deliver; the sequence above puts trust before reach

## How to get involved

**Contributors.** Good starting areas are indexing and verifiable performance, order-management features, accessibility and onboarding, test coverage for the keeper and settlement paths, and the social experience. Open an issue describing what you would like to work on before starting a large change.

**Investors and partners.** For questions about the business, the plan or a partnership, contact the Velo team directly.

For cohort and funding applications, use the [application facts and readiness checklist](docs/FUNDING-READINESS.md). Testnet transactions are evidence of implementation, not users, revenue, TVL or product-market fit. Team details, traction, incorporation, budget and the amount being raised must be supplied and verified before submission.

**Security researchers.** Please report vulnerabilities privately to the maintainers rather than through public issues.
