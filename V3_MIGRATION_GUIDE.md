# Velo V3 Migration Guide (Real On-Chain)

This guide migrates from V2 (`VeloPerpsV2`) to V3 (`VeloPerpsV3`) with:
- isolated + cross margin modes
- on-chain TP/SL
- partial close / reduce-only
- on-chain LIMIT/STOP conditional orders

## 1. Compile and test V3

```bash
cd contracts
forge test --match-contract VeloPerpsV3Test -vv
```

## 2. Deploy V3 on Base Sepolia

```bash
cd contracts
source .env
forge script script/DeployVeloPerpsV3.s.sol \
  --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast --verify
```

Save the deployed address as `VELO_PERPS_V3_ADDRESS`.

## 3. Seed protocol liquidity and user balances

Use owner wallet (same owner that controls mUSDC):

```bash
# seed pool (for isolated payouts)
cast send 0x5EFaF3F69b09bC2abF3439bDC0C93bf611026699 \
  "transfer(address,uint256)" <VELO_PERPS_V3_ADDRESS> <AMOUNT_6DEC> \
  --rpc-url $BASE_SEPOLIA_RPC_URL --private-key $PRIVATE_KEY

# mint mUSDC to test traders for cross deposits / isolated collateral
cast send 0x5EFaF3F69b09bC2abF3439bDC0C93bf611026699 \
  "mintTo(address,uint256)" <TRADER_ADDRESS> <AMOUNT_6DEC> \
  --rpc-url $BASE_SEPOLIA_RPC_URL --private-key $PRIVATE_KEY
```

## 4. Frontend env and routing

Add env:

- `VITE_VELO_PERPS_V3_ADDRESS=<deployed v3>`

Then update frontend service routing to:
- open positions via `openPosition(..., marginMode, ...)`
- place/cancel conditional orders via `placeConditionalOrder` / `cancelConditionalOrder`
- show and execute order state from `getTraderOrders` + `conditionalOrders(orderId)`

## 5. Keeper jobs

Create/extend keepers to:
- call `closeIfTriggered(tradeId, pythUpdateData)` for TP/SL
- call `executeConditionalOrder(orderId, pythUpdateData)` for triggered LIMIT/STOP

## 6. Cutover checklist (must pass)

1. Place market isolated long: appears on-chain + UI.
2. Place TP/SL and edit both: updates on-chain fields.
3. Trigger TP/SL by keeper: closes on-chain, history row has real tx.
4. Partial close 25/50/75/100%: position collateral/size updates correctly.
5. Place LIMIT order and trigger it: opens position on-chain.
6. Place reduce-only STOP and trigger it: reduces existing position only.
7. Cross deposit -> cross open -> cross close -> cross withdraw works end-to-end.

## 7. Safety note

V3 is testnet-grade and unaudited. Before mainnet:
- independent audit
- invariant/fuzz testing
- formal liquidation stress tests
- oracle fallback checks
