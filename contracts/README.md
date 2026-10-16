# VELO contracts — Base Sepolia testnet

**15 October 2026: serious V3.1 accounting defects are reproduced. These contracts are not independently audited or approved for real funds.**

| Contract | Active Base Sepolia address / purpose |
| --- | --- |
| VeloPerpsV3_1 | `0x41fDb544D7247a5ddc6B4C06F29D09f2b20de907` — custom oracle-priced pool perpetuals |
| VeloMockUSDC | `0x5EFaF3F69b09bC2abF3439bDC0C93bf611026699` — 6-decimal test token; no real USDC backing |
| VeloRegistry | `0x7e510d615a8afDfaa324F790F3E54e520756ECe2` — wallet/username mapping |
| Pyth | `0xA2aa501b19aff244D90cc15a4Cf739D2725B5729` — signed oracle update verification |

Network: chain ID **84532**. `src/VeloPerpsV3.sol` is older source, not the current V3.1 release. The repository also contains bridge/deployment code; this review did not establish reproducible deployed bytecode or every LayerZero route.

## Known accounting defects

`test/VeloPerpsV31Audit.t.sol` demonstrates:

- A flat cross close creates extra internal balance by crediting already-retained collateral.
- Cross liquidation fails to realize the losing position in the cross balance.
- Adding margin changes profit exposure for an existing trade.

The three tests intentionally **pass when those bugs exist**. Four older V3 tests also pass but do not prove V3.1 safe. The UI blocks new cross opens/orders/deposits, collateral adjustments and reduce-only entries on the known V3.1 address. Direct calls remain possible; no immutable contract patch has been deployed. Partial close, reserves, exposure limits and oracle guards need additional work.

## Run the scoped reproduction suite

Use Solidity 0.8.22, Foundry and the repository's remappings. The review used Foundry 1.7.1, OpenZeppelin v5.0.2 (`dbb6104ce834628e473d2173bbc9d47f81a9eec3`) and forge-std v1.9.7 (`77041d2ce690e692d6e03cc812b57d1ddaa4d505`) in ignored `contracts/lib/` directories. Install these pinned dependencies before running:

```sh
forge test --root contracts --skip script --skip VeloMockUSDC
```

That is a scoped perps suite, not a full token/bridge build. Deployments and `VeloMockUSDC` additionally require the LayerZero dependencies described in `foundry.toml`; they were excluded from this check. Never invoke deployment scripts with a funded signer just to run tests.

## Token and registry behavior

Mock USDC has six decimals, a test faucet and owner minting for test liquidity. The faucet's per-address limits are not sybil resistance, collateral backing or a redeemability promise. Its LayerZero OFT integration needs route-specific send/receive/failure testing.

Registry handles are 3–16 lowercase letters/digits/underscores and begin with a letter. It permits one name per address and a 30-day change interval. Frontend validation now matches these rules. On-chain registration still depends on wallet ownership, name availability, gas and a confirmed transaction.

## Replacement gate

Do not change the production address before a new contract has an explicit accounting/risk specification, conservation/solvency invariants, independent review, verified deployment and migration plan. Preserve legacy close/cancel/withdraw and keeper access for outstanding positions/orders/balances. See [the audit and acceptance plan](../docs/AUDIT-2026-10-15.md).
