# Velo Contracts

Solidity contracts for Velo's testnet perp engine.

## Layout

```
contracts/
├── src/
│   ├── VeloPerps.sol           Oracle-priced perp engine (Pyth, BTC/ETH, 25x, USDC).
│   ├── VeloMockUSDC.sol        ERC-20 + LayerZero V2 OFT. Public faucet, cross-chain.
│   ├── VeloRegistry.sol        On-chain username → address registry.
│   ├── interfaces/IPyth.sol    Minimal Pyth interface (subset Velo needs).
│   └── libraries/PerpsMath.sol Pure math: PnL, liquidation, fees.
├── script/
│   ├── DeployBaseSepolia.s.sol  Primary deploy. Drops Perps + USDC + Registry on Base Sepolia.
│   ├── DeployRemoteUSDC.s.sol   USDC-only deploy for Arb/OP/Eth Sepolia.
│   └── WirePeers.s.sol          Wires the four OFTs together via setPeer.
├── test/
│   └── VeloPerps.t.sol          Foundry tests, MockPyth + MockUSDC.
└── foundry.toml
```

## Setup (do this once)

```bash
# Install Foundry if you don't have it
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Verify
forge --version    # should print something like "forge 1.x.x"

# Install contract dependencies (run from contracts/ directory)
cd contracts
forge install foundry-rs/forge-std
forge install OpenZeppelin/openzeppelin-contracts
forge install LayerZero-Labs/devtools
forge install LayerZero-Labs/layerzero-v2
forge install pyth-network/pyth-sdk-solidity
forge install GNSPS/solidity-bytes-utils

# Run tests — proves the contracts compile and math works
forge test -vvv
```

Newer Foundry versions don't auto-commit on `forge install` (the deprecated
`--no-commit` flag was made default and removed). If you see "uncommitted
changes" warnings, just `git add -A && git commit -m "Add contracts"` first.

## Environment (.env in the contracts/ directory)

```bash
PRIVATE_KEY=0x...                        # deployer key — TESTNET ONLY, no real funds

BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
ARB_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
OP_SEPOLIA_RPC_URL=https://sepolia.optimism.io
ETH_SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com

# Etherscan V2 — ONE API key works across BaseScan/Arbiscan/Optimistic Etherscan/Etherscan.
# Sign up once at https://etherscan.io/myapikey
ETHERSCAN_API_KEY=...
```

Never commit `.env`. The repo's `.gitignore` excludes it but double-check.

## Deploy walkthrough

### 1 — Base Sepolia (primary chain)

Deploys VeloPerps + VeloMockUSDC + VeloRegistry, registers BTC + ETH pairs,
seeds 100k mUSDC into the perp pool.

```bash
source .env
forge script script/DeployBaseSepolia.s.sol \
  --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast --verify
```

Addresses end up in `contracts/deployments/base_sepolia.json`.

### 2 — Remote chains (USDC OFT only)

```bash
# Arbitrum Sepolia
LZ_ENDPOINT=0x6EDCE65403992e310A62460808c4b910D972f10f \
CHAIN_SLUG=arbitrum_sepolia \
forge script script/DeployRemoteUSDC.s.sol \
  --rpc-url $ARB_SEPOLIA_RPC_URL --broadcast --verify

# Optimism Sepolia
LZ_ENDPOINT=0x6EDCE65403992e310A62460808c4b910D972f10f \
CHAIN_SLUG=optimism_sepolia \
forge script script/DeployRemoteUSDC.s.sol \
  --rpc-url $OP_SEPOLIA_RPC_URL --broadcast --verify

# Ethereum Sepolia
LZ_ENDPOINT=0x6EDCE65403992e310A62460808c4b910D972f10f \
CHAIN_SLUG=ethereum_sepolia \
forge script script/DeployRemoteUSDC.s.sol \
  --rpc-url $ETH_SEPOLIA_RPC_URL --broadcast --verify
```

### 3 — Wire the four OFTs together

Each OFT needs to know about the others. Run `WirePeers` from each chain, four times.

```bash
# From Base Sepolia → set Arb/OP/Eth as peers:
LOCAL_USDC=$(jq -r .VeloMockUSDC deployments/base_sepolia.json) \
PEER_ARB=$(jq -r .VeloMockUSDC deployments/arbitrum_sepolia.json) \
PEER_OP=$(jq -r .VeloMockUSDC deployments/optimism_sepolia.json) \
PEER_ETH=$(jq -r .VeloMockUSDC deployments/ethereum_sepolia.json) \
forge script script/WirePeers.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast

# From Arb → set Base/OP/Eth:
LOCAL_USDC=$(jq -r .VeloMockUSDC deployments/arbitrum_sepolia.json) \
PEER_BASE=$(jq -r .VeloMockUSDC deployments/base_sepolia.json) \
PEER_OP=$(jq -r .VeloMockUSDC deployments/optimism_sepolia.json) \
PEER_ETH=$(jq -r .VeloMockUSDC deployments/ethereum_sepolia.json) \
forge script script/WirePeers.s.sol --rpc-url $ARB_SEPOLIA_RPC_URL --broadcast

# Repeat from OP and Eth, each setting the other three as peers.
```

After wiring, `usdc.send(...)` works between any two chains.

## Verified on-chain constants

Do not guess these. All verified via official docs at the time of writing:

```
Pyth on Base Sepolia       0xA2aa501b19aff244D90cc15a4Cf739D2725B5729
LayerZero V2 EndpointV2    0x6EDCE65403992e310A62460808c4b910D972f10f
BTC/USD Pyth feed id       0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43
ETH/USD Pyth feed id       0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace
LayerZero EID Base Sepolia 40245
LayerZero EID Arb Sepolia  40231
LayerZero EID OP Sepolia   40232
LayerZero EID Eth Sepolia  40161
```

## Architecture notes

**Oracle-priced (not orderbook) perps for v1.** Real orderbook DEXs (Hyperliquid,
dYdX) have years of headstart and millions in seed liquidity. Oracle-priced
perps (Avantis, GMX, Gains Network) settle PnL against a price feed against a
shared collateral pool — sound model that needs no counterparty matching. The
UI shows a "reference orderbook" sourced from Coinbase spot for user context,
clearly labelled.

**LayerZero V2 OFT for the bridge.** Industry-standard, no relayer infra to run,
security model verified by configurable DVN set. Avantis itself uses LayerZero.
Alternative (running our own message relayer) is months of work for a solo dev.

**Our own MockUSDC instead of Circle's testnet USDC.** Faucet UX. Circle's is
externally rate-limited (20 USDC / 2 hours / address). Ours is one click for
1000 mUSDC, 6h cooldown, 10k max — users can start trading immediately on connect.

## Risk model & known limitations

**This is a v1 / grant-demo contract. NOT audited.**

- **No insurance fund.** Pool can go insolvent if cumulative trader profits
  exceed pool reserves. Acceptable on testnet — funds are mock USDC.
- **No funding rate.** Mark = oracle exactly. Mainnet needs funding to keep
  mark close to spot.
- **Oracle trust.** Pyth is the single source of truth. Mainnet should add a
  secondary oracle (e.g. Chainlink) as a sanity guard.
- **No cross-margin.** Each position isolated.
- **Constant 1% liquidator bounty.** Should adapt to pressure on mainnet.

## License

MIT.
