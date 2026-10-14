# Recovered settings

Updated on 14 October 2026. These are verified/reconstructed configuration,
not an assertion that unreadable Vercel values were exported verbatim.

## Supabase server secrets

The owner imported these six existing values directly into Supabase:
`PRIVATE_KEY`, `BASE_SEPOLIA_RPC_URL`, `ARB_SEPOLIA_RPC_URL`,
`OP_SEPOLIA_RPC_URL`, `ETH_SEPOLIA_RPC_URL`, `ETHERSCAN_API_KEY`.
All were present during the authenticated check. Expected RPC chain IDs are
84532, 421614, 11155420 and 11155111 respectively.

Supabase already supplies its URL, anon key and service-role key internally.
No server key is needed in Cloudflare's browser build. Imported Supabase aliases
remain supported if a future reconciliation supplies original Vercel values.

## Public addresses

| Setting | Public value | Evidence |
| --- | --- | --- |
| VITE_VELO_PERPS_ADDRESS | 0x28fE36d4ae72ab0E05fa6edafE1D6e11E9DD6163 | Existing source and deployed contract |
| VITE_VELO_PERPS_V2_ADDRESS | 0x8d4b792137252d79fb3ae953aa619fa57101665f | Deployment history, VERSION=2, owner/PYTH/USDC reads |
| VITE_VELO_PERPS_V3_ADDRESS | 0x41fDb544D7247a5ddc6B4C06F29D09f2b20de907 | Current app default, on-chain VERSION=31 |
| VITE_VELO_PERPS_V3_1_ADDRESS | 0x41fDb544D7247a5ddc6B4C06F29D09f2b20de907 | Same active deployment |
| VITE_VELO_REGISTRY_ADDRESS | 0x7e510d615a8afDfaa324F790F3E54e520756ECe2 | Existing source and deployment history |
| VITE_KEEPER_ADDRESS | 0x8f8fF5A29760278C7B54D450dA57A13Cd3FD3A8b | Recovered key's public address and prior keeper calls |
| PYTH_CONTRACT_ADDRESS / VITE_PYTH_CONTRACT_ADDRESS | 0xA2aa501b19aff244D90cc15a4Cf739D2725B5729 | Active contracts' PYTH() reads |
| MUSDC_ADDRESS / VITE_VELO_USDC_BASE | 0x5EFaF3F69b09bC2abF3439bDC0C93bf611026699 | Active contracts' USDC() reads |
| VITE_VELO_USDC_ARB | 0xEC76fD9182ba15ff193FDBc122013FCa18900290 | Chain 421614, symbol mUSDC, decimals 6 |
| VITE_VELO_USDC_OP | 0xEC76fD9182ba15ff193FDBc122013FCa18900290 | Chain 11155420, symbol mUSDC, decimals 6 |
| VITE_VELO_USDC_ETH | 0x96d0CF69896FE6b5B031D21967f027d95Eb42e9A | Chain 11155111, symbol mUSDC, decimals 6 |

Cloudflare's four VITE_* RPC settings use the source's PublicNode HTTPS
endpoints, verified against their chain IDs. This preserves server RPC
credentials exclusively in Supabase. Public Supabase URL/legacy anon key were
obtained from the connected project; the current frontend expects the legacy
anon format. The recovered V2 address is now available for legacy positions.

`VITE_PYTH_HERMES_URL` remains `https://hermes.pyth.network` for backend
compatibility. Browser requests now use `/api/pyth/`, routed to the private
Cloudflare service. The provider key is never a VITE_ setting.

## Settings resolved on 13–14 October

- Reown Project ID: `18c7b45a3ebfdc8dd646fd5287811413`, from the owner's VELO
  project screenshot, now set in the Pages production build.
- `PYTH_API_KEY`: supplied by the owner, saved directly by them in Supabase,
  and installed as an encrypted Cloudflare Worker secret. Live Hermes signed
  updates and the replacement authenticated history endpoint return HTTP 200.
- Sponsor wallet: the owner's supplied sponsor key derives
  `0x8f8fF5A29760278C7B54D450dA57A13Cd3FD3A8b`, matching imported `PRIVATE_KEY`.
  Explicit shared-key configuration requires this exact address. Sponsorship
  stays disabled until the old writer is stopped.

Optional GA and three unused CDP values remain unrecovered. Preserve the old
Vercel settings for reconciliation. No production-only values were copied into
Preview; preview builds remain disabled. No wallet/provider key, gateway token
or cron token is recorded in this file.
