# VeloPerpsV3_1 BaseScan Verification

Contract: `0x41fDb544D7247a5ddc6B4C06F29D09f2b20de907`
Chain: Base Sepolia (84532)
BaseScan URL: https://sepolia.basescan.org/address/0x41fDb544D7247a5ddc6B4C06F29D09f2b20de907#code

## Step 1 — Generate the Standard JSON Input (run from your contracts/ folder)

```bash
cd ~/Downloads/velo/contracts
forge verify-contract \
  --chain-id 84532 \
  --compiler-version 0.8.22 \
  --show-standard-json-input \
  0x41fDb544D7247a5ddc6B4C06F29D09f2b20de907 \
  src/VeloPerpsV3_1.sol:VeloPerpsV3_1 \
  > VeloPerpsV3_1_standard_json.json
```

This outputs the full Standard JSON to a file. It does NOT submit it — it just generates it locally.

## Step 2 — Submit on BaseScan

1. Go to: https://sepolia.basescan.org/address/0x41fDb544D7247a5ddc6B4C06F29D09f2b20de907#code
2. Click **"Verify and Publish"**
3. Select:
   - Compiler Type: **Solidity (Standard-Json-Input)**
   - Compiler Version: **v0.8.22+commit.4fc1097e**
   - Open Source License: **MIT**
4. Click **Continue**
5. Upload the `VeloPerpsV3_1_standard_json.json` file generated in Step 1
6. Click **Verify and Publish**

## Compiler settings (for manual entry if needed)

- Solidity version: `0.8.22`
- Optimizer: **enabled**, runs: **200**
- via-IR: **false**
- EVM version: default (paris)

## Constructor arguments

The contract was deployed with these constructor args (ABI-encoded):

```
USDC (mUSDC):  0x5EFaF3F69b09bC2abF3439bDC0C93bf611026699
PYTH:          0xA2aa501b19aff244D90cc15a4Cf739D2725B5729
Owner:         0x8f8fF5A29760278C7B54D450dA57A13Cd3FD3A8b
```

BaseScan will auto-detect these from the deployment tx. If it asks you to enter them manually, use:

```bash
cast abi-encode "constructor(address,address,address)" \
  0x5EFaF3F69b09bC2abF3439bDC0C93bf611026699 \
  0xA2aa501b19aff244D90cc15a4Cf739D2725B5729 \
  0x8f8fF5A29760278C7B54D450dA57A13Cd3FD3A8b
```
