# Velo: vision, roadmap and business model

This document is for investors and contributors. It explains where Velo is going, how it can make money, and which ideas are open. The [README](README.md) describes what exists today.

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

- Perpetual futures terminal on Base Sepolia testnet: market, limit and stop entries, take-profit and stop-loss, up to 25x leverage, automated liquidations, Pyth pricing
- Social layer: posts, replies, follows, profiles, notifications, link previews, verified badges
- Top-50 market directory with a discussion thread per asset, a news tab and a leaderboard
- Guided onboarding, faucet and gas sponsorship, testnet bridge routes
- Production-style infrastructure: Cloudflare Pages and Workers, Supabase, a one-minute keeper scheduler with durable transaction handling
- Public contracts and a Foundry test suite

## Roadmap

### Phase 1: make the core trustworthy
- Independent smart-contract review and a redesigned margin and accounting model, before any real funds
- An indexer that reconstructs every trader's history from on-chain events, so profiles, PnL and the leaderboard rest on verifiable results rather than stored profile metrics
- More markets and better order management (partial closes, margin adjustment, cross margin)
- Permission-scoped session keys instead of a browser-held trading key

### Phase 2: social trading
- **Copy trading** with per-follower allocation, slippage limits, loss limits and a clear pause switch
- **Trading bots** that run under scoped permissions, spend limits and kill switches, with transparent public performance
- Trader pages that show verified results next to their posts
- Alerts, watchlists and better discovery

### Phase 3: a hub for all markets
- Classic instruments alongside crypto, such as stocks and commodities, starting with exposure that fits the existing on-chain model
- Richer news, research and discussion, including structured trade ideas that can be followed through to an outcome
- Mainnet launch, gated on Phase 1

## Revenue model

**Today:** trading fees only. The testnet contract charges 0.10% of collateral when a position opens and 0.10% of the gross payout when it closes, accrued to a fee balance the owner can withdraw. On testnet this is not real revenue.

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

Today, traders trade against a single USDC pool inside the contract. Their losses stay in the pool and their gains are paid from it, so the pool carries the risk of net trader profit. The team funds it and there is no public liquidity-provider deposit.

Opening the pool to outside liquidity is a natural next step and an important design problem. Open questions we are working through:

- **Vault design.** Deposit and withdrawal accounting, share pricing, and how to keep a withdrawal from leaving open positions unbacked
- **Risk limits.** Caps on open interest, per-market exposure and skew, so a vault cannot be drained by one directional move
- **Who bears losses.** How profit and loss are shared between vault depositors and any protocol backstop
- **Oracle and liquidation risk.** What happens when prices gap or keepers fall behind

This requires the Phase 1 accounting redesign and an independent audit first. Nothing here should be read as a promise of yield.

## Why we think it can work

- The product already spans trading, social and market data, instead of being a mockup of one of them
- The infrastructure is built to run unattended: scheduled keepers, durable transaction recovery, row-level security, rate limits and tested failure paths
- Verifiable track records are the missing piece for trust in social trading, and an on-chain venue is the right place to build them

## Risks we take seriously

- **Smart-contract risk.** The current contracts are unaudited. Mainnet depends on the Phase 1 redesign and review
- **Regulation.** Leveraged derivatives, copy trading and traditional instruments are regulated differently across jurisdictions, and the design must account for that before launch in any region
- **Counterparty and liquidity risk** as described above
- **Oracle and keeper dependence.** Liquidation and order execution depend on price feeds and scheduled jobs
- **Execution risk.** A broad plan is easy to write and hard to deliver; the sequence above puts trust before reach

## How to get involved

**Contributors.** Good starting areas are indexing and verifiable performance, order-management features, accessibility and onboarding, test coverage for the keeper and settlement paths, and the social experience. Open an issue describing what you would like to work on before starting a large change.

**Investors and partners.** For questions about the business, the plan or a partnership, contact the Velo team directly.

**Security researchers.** Please report vulnerabilities privately to the maintainers rather than through public issues.
