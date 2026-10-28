// Concise project summaries keyed by canonical CMC ID, not a mutable ticker.
// Reviewed 2026-10-28; see each primary-source link. Market data stays in the quote.
export const ASSET_PROFILES = {
  "1": {
    "category": "Payments",
    "source": "https://bitcoin.org/en/faq",
    "description": "Bitcoin is a peer-to-peer digital currency launched in 2009. Its proof-of-work network records payments without a central operator, with issuance limited to 21 million BTC."
  },
  "1027": {
    "category": "Smart contracts",
    "source": "https://ethereum.org/en/what-is-ethereum/",
    "description": "Ethereum is a programmable blockchain for smart contracts, financial applications and digital assets. ETH pays transaction fees and is staked by validators to secure its proof-of-stake network."
  },
  "825": {
    "category": "Stablecoin",
    "source": "https://tether.to/en/",
    "description": "USDt is a dollar-referenced stablecoin issued by Tether. It is designed to move dollar-denominated value between wallets, exchanges and applications on multiple blockchains, using issuer-managed reserves."
  },
  "1839": {
    "category": "Layer 1",
    "source": "https://www.bnbchain.org/en/bnb",
    "description": "BNB is the native asset of the BNB Chain ecosystem. It is used for network transaction fees, staking and participation in applications built on the network."
  },
  "52": {
    "category": "Payments",
    "source": "https://xrpl.org/about/what-is-xrp",
    "description": "XRP is the native asset of the XRP Ledger, a blockchain designed for payments and asset transfers. It pays transaction costs and can serve as a bridge between currencies."
  },
  "3408": {
    "category": "Stablecoin",
    "source": "https://www.circle.com/usdc",
    "description": "USDC is a dollar stablecoin issued by Circle. It is designed for payments, transfers and on-chain financial applications, with reserves held in cash and highly liquid dollar-denominated assets."
  },
  "5426": {
    "category": "Layer 1",
    "source": "https://solana.com/learn/what-is-solana",
    "description": "Solana is a proof-of-stake blockchain for smart contracts and consumer applications. SOL pays network fees and can be staked to help secure its validators; Proof of History provides a shared ordering of time."
  },
  "1958": {
    "category": "Layer 1",
    "source": "https://developers.tron.network/docs",
    "description": "TRON is a blockchain for smart contracts, tokens and payments. TRX is its native asset, used for transaction resources, staking and voting for the network’s Super Representatives."
  },
  "1437": {
    "category": "Privacy",
    "source": "https://z.cash/learn/what-is-zcash/",
    "description": "Zcash is a digital currency with optional private, shielded transactions. It uses zero-knowledge proofs to verify payments while allowing shielded senders, recipients and amounts to remain private."
  },
  "32196": {
    "category": "Trading infrastructure",
    "source": "https://hyperliquid.gitbook.io/hyperliquid-docs",
    "description": "Hyperliquid is a layer-one blockchain built around on-chain spot and perpetual trading. HYPE is its native asset, used for staking and gas on its smart-contract environment, HyperEVM."
  },
  "74": {
    "category": "Payments",
    "source": "https://dogecoin.com/dogepedia/articles/what-is-dogecoin/",
    "description": "Dogecoin is a proof-of-work digital currency launched in 2013, recognizable by its Shiba Inu mascot. DOGE is used for payments and tipping and has an ongoing issuance schedule."
  },
  "328": {
    "category": "Privacy",
    "source": "https://www.getmonero.org/get-started/what-is-monero/",
    "description": "Monero is a privacy-focused digital currency. Its protocol is designed to conceal transaction senders, recipients and amounts by default, rather than making privacy an optional account setting."
  },
  "3957": {
    "category": "Exchange token",
    "source": "https://www.bitfinex.com/leo",
    "description": "UNUS SED LEO is a utility token for the iFinex ecosystem, including Bitfinex. Its uses include trading-fee reductions, while the issuer operates a token buyback and burn program."
  },
  "1975": {
    "category": "Oracle",
    "source": "https://chain.link/education-hub/what-is-chainlink",
    "description": "Chainlink connects smart contracts to external data and services through decentralized oracle networks. LINK supports payments for network services and staking within the ecosystem."
  },
  "2010": {
    "category": "Layer 1",
    "source": "https://cardano.org/what-is-cardano/",
    "description": "Cardano is a proof-of-stake blockchain for smart contracts and digital assets. ADA is used for transaction fees, staking and participation in the network’s governance."
  },
  "6535": {
    "category": "Layer 1",
    "source": "https://docs.near.org/",
    "description": "NEAR is a proof-of-stake blockchain that uses sharding to distribute network work. Its native token pays transaction and storage costs and is staked to secure validators."
  },
  "512": {
    "category": "Payments",
    "source": "https://stellar.org/learn/intro-to-stellar",
    "description": "Stellar is a blockchain for payments and issuing digital assets. Its native asset, XLM, pays network fees and supports the minimum balances needed to maintain accounts and ledger entries."
  },
  "1831": {
    "category": "Payments",
    "source": "https://bitcoincash.org/",
    "description": "Bitcoin Cash is a peer-to-peer digital currency created from a Bitcoin network split in 2017. BCH uses proof of work and emphasizes on-chain payments with larger transaction capacity."
  },
  "2": {
    "category": "Payments",
    "source": "https://litecoin.org/",
    "description": "Litecoin is a peer-to-peer digital currency launched in 2011. It uses proof of work and a shorter block interval than Bitcoin, with LTC serving as the network’s payment asset."
  },
  "29470": {
    "category": "Synthetic dollar",
    "source": "https://docs.ethena.fi/",
    "description": "USDe is Ethena’s synthetic dollar. It uses crypto collateral and offsetting derivatives positions to target dollar stability, rather than relying on the same reserve structure as a fiat-backed stablecoin."
  },
  "4943": {
    "category": "Stablecoin",
    "source": "https://makerdao.com/en/whitepaper/",
    "description": "DAI is a dollar-targeting stablecoin created through the Maker protocol. It is issued against collateral and maintained through smart contracts, risk parameters and protocol governance."
  },
  "7083": {
    "category": "DeFi",
    "source": "https://docs.uniswap.org/",
    "description": "Uniswap is a decentralized protocol for exchanging tokens through liquidity pools. UNI is its governance token, used to participate in decisions about the protocol and its treasury."
  },
  "37263": {
    "category": "Infrastructure",
    "source": "https://www.canton.network/global-synchronizer",
    "description": "Canton connects applications that need privacy and control over their data. Canton Coin pays for use of its Global Synchronizer and rewards participants who provide utility to the network."
  },
  "5805": {
    "category": "Layer 1",
    "source": "https://www.avax.network/",
    "description": "Avalanche is a smart-contract platform supporting its C-Chain and custom blockchain networks. AVAX is used for fees and staking within the Avalanche ecosystem."
  },
  "36148": {
    "category": "Stablecoin",
    "source": "https://worldlibertyfinancial.com/usd1",
    "description": "USD1 is World Liberty Financial’s dollar-referenced stablecoin. It is designed for transfers and settlement, with issuer-managed reserves that include dollar deposits and short-term government-backed instruments."
  },
  "20947": {
    "category": "Layer 1",
    "source": "https://docs.sui.io/concepts/sui-overview",
    "description": "Sui is a proof-of-stake blockchain using an object-based data model and the Move programming language. SUI pays for transactions and storage and is staked to secure the network."
  },
  "11419": {
    "category": "Layer 1",
    "source": "https://docs.ton.org/",
    "description": "Gram is the native asset of The Open Network, formerly called Toncoin. It is used for network fees and staking in a blockchain designed for smart contracts, applications and payments."
  },
  "4642": {
    "category": "Distributed ledger",
    "source": "https://hedera.com/learning/what-is-hedera",
    "description": "Hedera is a public distributed ledger using hashgraph consensus. HBAR pays network service fees and supports staking; applications use the network for tokens, smart contracts and timestamped messages."
  },
  "33793": {
    "category": "Stablecoin",
    "source": "https://globaldollar.com/about-usdg",
    "description": "Global Dollar is a dollar-referenced stablecoin issued by Paxos. USDG is designed for payments and on-chain transfers, with reserves intended to support redemption for US dollars."
  },
  "27772": {
    "category": "Stablecoin",
    "source": "https://www.paypal.com/us/digital-wallet/manage-money/crypto/pyusd",
    "description": "PayPal USD is a dollar stablecoin issued by Paxos. PYUSD is designed for digital payments and transfers between supported wallets and applications, with issuer-managed dollar reserves."
  },
  "5176": {
    "category": "Tokenized gold",
    "source": "https://gold.tether.to/",
    "description": "Tether Gold is a token designed to represent ownership of physical gold held in custody. Each XAUt represents one fine troy ounce of gold, with issuer-defined custody and redemption arrangements."
  },
  "22974": {
    "category": "Decentralized compute",
    "source": "https://www.bittensor.com/docs",
    "description": "Bittensor coordinates independent subnets that produce services such as compute, inference and storage. TAO is used for staking and network incentives, with validators evaluating the contributions of participants."
  },
  "5994": {
    "category": "Meme ecosystem",
    "source": "https://shib.io/",
    "description": "Shiba Inu is an Ethereum-based token and community ecosystem. SHIB sits alongside projects such as ShibaSwap and the Shibarium network; it is distinct from Shibarium’s gas token, BONE."
  },
  "3635": {
    "category": "Network token",
    "source": "https://docs.cronos.org/",
    "description": "CRO is the native asset used in the Cronos ecosystem. It supports transaction fees, staking and applications across Cronos networks and also has uses within Crypto.com’s products."
  },
  "30171": {
    "category": "Governance",
    "source": "https://docs.ethena.fi/solution-overview/ena",
    "description": "ENA is the governance token of Ethena, the protocol behind the synthetic dollar USDe. It supports participation in decisions about protocol development, integrations and risk-related parameters."
  },
  "34387": {
    "category": "Stablecoin",
    "source": "https://ripple.com/solutions/stablecoin/",
    "description": "Ripple USD is a dollar-referenced stablecoin issued by Standard Custody, a Ripple subsidiary. RLUSD is designed for payments and settlement with issuer-managed dollar reserves."
  },
  "35491": {
    "category": "Layer 1",
    "source": "https://memecore.com/",
    "description": "MemeCore is a layer-one blockchain focused on meme-token communities and their applications. M is its native asset, used within the network’s transaction and incentive systems."
  },
  "3155": {
    "category": "Interoperability",
    "source": "https://quant.network/",
    "description": "Quant develops infrastructure connecting financial systems and blockchain networks through products such as Overledger. QNT is the utility token associated with access to the Quant ecosystem."
  },
  "3897": {
    "category": "Exchange token",
    "source": "https://www.okx.com/okb",
    "description": "OKB is a utility token in the OKX ecosystem. Its uses include access to ecosystem benefits and fee-related programs, with a token burn mechanism described by OKX."
  },
  "7278": {
    "category": "DeFi",
    "source": "https://aave.com/docs",
    "description": "Aave is a decentralized lending protocol where users supply assets or borrow against collateral. AAVE is its governance token, used to participate in decisions about protocol parameters and development."
  },
  "21159": {
    "category": "Governance",
    "source": "https://docs.ondo.foundation/",
    "description": "ONDO is the governance token of the Ondo DAO. It is associated with Ondo’s ecosystem of tokenized financial products; owning ONDO is distinct from holding a tokenized treasury or other investment product."
  },
  "24478": {
    "category": "Meme token",
    "source": "https://www.pepe.vip/",
    "description": "PEPE is an Ethereum-based meme token inspired by the Pepe the Frog character. It is primarily a community and trading asset rather than a token providing ownership of a financial product."
  },
  "36507": {
    "category": "Platform token",
    "source": "https://pump.fun/",
    "description": "Pump.fun is a Solana-based platform for creating and trading tokens. PUMP is the platform’s ecosystem token and is distinct from the individual tokens launched through its services."
  },
  "36341": {
    "category": "Trading infrastructure",
    "source": "https://docs.asterdex.com/",
    "description": "Aster is a decentralized exchange offering perpetual markets. ASTER is its ecosystem token, used within the platform’s governance and incentive programs."
  },
  "4705": {
    "category": "Tokenized gold",
    "source": "https://www.paxos.com/paxgold",
    "description": "PAX Gold is a gold-backed token issued by Paxos. Each PAXG is designed to represent one fine troy ounce of allocated physical gold held in professional vaults."
  },
  "6636": {
    "category": "Interoperability",
    "source": "https://wiki.polkadot.com/",
    "description": "Polkadot connects specialized blockchains through shared security and interoperability. DOT supports network staking, governance and access to blockspace within the ecosystem."
  },
  "33251": {
    "category": "Governance",
    "source": "https://worldlibertyfinancial.com/",
    "description": "WLFI is the governance token of World Liberty Financial. It enables participation in ecosystem proposals and is separate from USD1, the project’s dollar-referenced stablecoin."
  },
  "27075": {
    "category": "Layer 2",
    "source": "https://docs.mantle.xyz/",
    "description": "Mantle is an Ethereum layer-two network with an EVM-compatible execution environment. MNT is used for transaction fees and governance across the Mantle ecosystem."
  },
  "39120": {
    "category": "Stablecoin",
    "source": "https://u.tech/resources/",
    "description": "United Stables’ U is a dollar-targeting stablecoin designed for transfers, trading and payments. Its issuer describes reserves consisting of cash and other dollar-backed stablecoins."
  },
  "13502": {
    "category": "Identity",
    "source": "https://world.org/worldcoin-token",
    "description": "Worldcoin is the token associated with the World ecosystem and its World ID proof-of-human system. WLD supports ecosystem participation and governance; World ID itself is a separate identity credential."
  },
  "8085": {
    "category": "Liquid staking",
    "source": "https://docs.lido.fi/",
    "description": "stETH represents ether staked through Lido. Its balance reflects staking rewards and penalties, allowing holders to use a token representation of their stake in compatible applications."
  },
  "28177": {
    "category": "Oracle",
    "source": "https://docs.pyth.network/",
    "description": "Pyth distributes financial market prices supplied by first-party data providers. PYTH is its governance token; applications use Pyth’s price feeds to read and verify market information on-chain."
  },
  "3717": {
    "category": "Wrapped asset",
    "source": "https://wbtc.network/",
    "description": "Wrapped Bitcoin is a token representation of bitcoin on compatible smart-contract networks. WBTC uses a custodial backing and mint-and-burn process, rather than being native bitcoin on the Bitcoin network."
  }
};

export function assetProfile(cmcId) {
  const id=Number(cmcId);
  return Number.isSafeInteger(id) && id>0 ? ASSET_PROFILES[String(id)] : undefined;
}
