# Velo contracts

Solidity contracts for Velo, built and tested with [Foundry](https://book.getfoundry.sh). Deployed on **Base Sepolia (chain ID 84532)** as a testnet. They are **not independently audited** and must not hold real funds.

| Contract | Address (Base Sepolia) | Purpose |
| --- | --- | --- |
| `VeloPerpsV3_1` | `0x41fDb544D7247a5ddc6B4C06F29D09f2b20de907` | Pool-based perpetuals priced by Pyth: positions, conditional orders, take-profit / stop-loss, liquidation |
| `VeloMockUSDC` | `0x5EFaF3F69b09bC2abF3439bDC0C93bf611026699` | 6-decimal test collateral with a faucet, bridgeable with LayerZero OFT. No real USDC backing |
| `VeloRegistry` | `0x7e510d615a8afDfaa324F790F3E54e520756ECe2` | Username to wallet mapping |
| Pyth | `0xA2aa501b19aff244D90cc15a4Cf739D2725B5729` | Signed price-update verification |

All deployed addresses, including earlier versions, are in [`deployments/base_sepolia.json`](deployments/base_sepolia.json). `src/VeloPerpsV3.sol` is the previous version and is kept for reference.

## Protocol parameters (V3.1)

- Maximum leverage 25x, minimum collateral 1 USDC
- Open fee of 0.10% of collateral and close fee of 0.10% of gross payout, accrued to a fee balance only the owner can withdraw
- Liquidation when a position's loss reaches 90% of its collateral, with a 1% bounty to the liquidator
- Prices from Pyth are rejected when older than 60 seconds
- The pool is the contract's USDC balance net of accrued fees. There is no public liquidity-provider deposit
- Order kinds: market, limit and stop, with take-profit and stop-loss on open positions

## Build and test

Requires Solidity 0.8.22, Foundry, [OpenZeppelin Contracts](https://github.com/OpenZeppelin/openzeppelin-contracts) v5.0.2 and [forge-std](https://github.com/foundry-rs/forge-std) v1.9.7 installed into `contracts/lib/` (git-ignored).

```sh
forge test --root contracts --skip script --skip VeloMockUSDC
```

That runs the perpetuals suite. Deploying the token and bridge additionally requires the LayerZero dependencies referenced in `foundry.toml`. Do not run the deployment scripts with a funded signer just to run tests.

## Registry rules

Handles are 3 to 16 lowercase letters, digits or underscores and start with a letter. One name per address, with a 30-day change interval.

## Before mainnet

A mainnet deployment requires a written accounting and risk specification, solvency invariants, independent review, a verified deployment and a migration path for existing positions.
