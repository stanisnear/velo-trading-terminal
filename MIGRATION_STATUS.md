# Velo Migration Status

Read this first if you're returning to the project.

## TL;DR

You're migrating from Orderly-based off-chain trading to **your own Solidity
perp engine on Base Sepolia**, with cross-chain mUSDC bridging via LayerZero.

The contracts side is **done**. The frontend rewire is **next**.

## What's in this drop

```
contracts/                    ← NEW — fully written, tested, ready to deploy
├── src/
│   ├── VeloPerps.sol         ← Oracle-priced perp engine. Pyth, BTC + ETH, 25x leverage.
│   ├── VeloMockUSDC.sol      ← ERC-20 + LayerZero V2 OFT. Faucet built in.
│   ├── VeloRegistry.sol      ← Username → address registry. 100% on-chain.
│   ├── interfaces/IPyth.sol
│   └── libraries/PerpsMath.sol
├── script/
│   ├── DeployBaseSepolia.s.sol   ← Drops all 3 on Base Sepolia
│   ├── DeployRemoteUSDC.s.sol    ← Drops USDC OFT on Arb/OP/Eth Sepolia
│   └── WirePeers.s.sol           ← Connects the 4 OFTs together
├── test/VeloPerps.t.sol      ← 9 tests covering open/close/liquidation/fees
├── foundry.toml
└── README.md                 ← Full deploy walkthrough

src/                          ← Frontend — UNCHANGED in this drop
                                  (still wired to Orderly. Rewire next session.)
```

## What I do next, in order

1. **Verify contracts compile and tests pass.** From the project root:
   ```bash
   cd contracts
   # Install Foundry once: curl -L https://foundry.paradigm.xyz | bash && foundryup
   forge install foundry-rs/forge-std
   forge install OpenZeppelin/openzeppelin-contracts
   forge install LayerZero-Labs/devtools
   forge install LayerZero-Labs/layerzero-v2
   forge install pyth-network/pyth-sdk-solidity
   forge install GNSPS/solidity-bytes-utils
   forge test -vvv
   ```
   You should see "9 passed; 0 failed". **If anything fails, stop and paste the
   output back to Claude before deploying.**

2. **Get a deployer wallet + testnet ETH on all four Sepolias.** Use a fresh
   MetaMask account (never your main wallet). Faucets:
   - https://www.alchemy.com/faucets/base-sepolia
   - https://www.alchemy.com/faucets/arbitrum-sepolia
   - https://www.alchemy.com/faucets/optimism-sepolia
   - https://www.alchemy.com/faucets/ethereum-sepolia
   - or the Coinbase CDP all-chain faucet at https://portal.cdp.coinbase.com

3. **Sign up at https://etherscan.io/myapikey for one ETHERSCAN_API_KEY.**
   The Etherscan V2 unified API means one key works for BaseScan, Arbiscan,
   Optimistic Etherscan, and Etherscan. No separate signups needed.

4. **Deploy.** See `contracts/README.md` for the exact commands. ~15 minutes total.

5. **Come back here for the frontend rewire** — Claude will swap the Orderly
   services in `src/services/` for the new VeloPerps wiring, add the bridge
   and username UIs, and update env vars.

## Why split contracts + frontend

The contracts are the load-bearing piece. They need to compile, the math needs
to be right, and they need to be deployed *first* — the frontend needs concrete
addresses to wire into. Doing both in one session has historically produced
lower-quality output on both. Deploy the contracts, verify them on BaseScan,
then we rewire the frontend with confidence.

## What stays untouched right now

- `src/App.tsx`, `src/components/*`, `src/services/*` — the existing app
  continues working as it is. Wagmi config still points wherever it pointed
  before. The Vercel deploy continues building exactly as it did.
- `package.json` — no new npm deps yet (frontend rewire will add a few).
- `index.html`, `vite.config.ts`, `vercel.json` — untouched.

So you can drop this zip into your repo, commit and push to GitHub, and Vercel
will redeploy with the contracts/ folder present but no behavioural change to
the live app. Safe.
