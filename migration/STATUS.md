# Migration status — 13 October 2026, evening

**Backend connected and tested; terminal not yet cut over. Trading cron and
sponsorship remain disabled. No migration transaction has been sent.**

## Deployed

- Landing remains on Cloudflare. The newer landing upload was cancelled at the
  owner's request; this checkpoint changes the terminal only.
- Terminal Pages project `velo-trading-terminal` tracks GitHub branch
  `codex/cloudflare-migration`. Twenty production settings are staged:
  18 public build settings, the backend address and an encrypted gateway token.
  Automatic builds remain paused; there is no terminal frontend deployment.
- Supabase `velo-api` and `velo-keepers` version 4 are ACTIVE. Authenticated
  user/protocol stats return HTTP 200; unauthenticated API calls return 401.
  Protocol stats resolve the active V3.1 contract and its two open positions.
  Google Analytics is unconfigured, and gas sponsorship returns disabled.
- The Cloudflare scheduler now holds a new `CRON_SECRET`. Its enabled switch
  remains false, dry-run switch true, cron list empty and workers.dev disabled.
- The six recovered contract settings are present in Supabase. Four RPCs were
  checked against their expected testnet chain IDs. Private values stayed in
  Supabase; none were returned by the diagnostic or put into Git.
- Temporary `velo-migration-check` is retired: version 3 returns only HTTP 404,
  with no environment access. Its earlier authentication was also time-limited.
- DNS for `app.velotrading.live` still targets Vercel. No DNS cutover occurred.

## Recovered configuration and authentication

See [RECOVERED-SETTINGS.md](RECOVERED-SETTINGS.md). The recovered private key
derives public address `0x8f8fF5A29760278C7B54D450dA57A13Cd3FD3A8b`, which owns
the deployed contracts and previously executed conditional orders, TP/SL and
liquidations. Its observed Base Sepolia balance was about 2.18 testnet ETH;
latest and pending nonce both equalled 197 during recovery. This does not prove
it was also the original gas-sponsorship wallet.

Gateway and scheduler credentials are separate newly generated 256-bit tokens,
stored as Cloudflare secrets. Supabase deployments contain only SHA-256
verifiers. Explicit Supabase `VELO_PROXY_TOKEN` / `CRON_SECRET` values, if set
later, override the corresponding verifier. This avoids another manual secret
copy without embedding raw credentials in source. See SUPABASE.md for rotation.

## Verification evidence

- 38 Node regression tests pass, covering authentication/rotation, Pyth key
  confinement, gateway behavior, schedules, contract versions, trigger math,
  scan bounds, signer coordination and successful-receipt requirements.
- Both exact bundles pass Deno 2.2.6 import/authentication/disabled checks with
  no outbound network or wallet credentials.
- The live V3.1 contract returns VERSION=31. The engine now accepts 31 with
  the V3 struct layouts; regression tests exercise all three jobs.
- Historical indexing is complete: conditional-order cursor 21 and position
  cursors 104. Latest dry runs scan eight recent orders or ten indexed/recent
  positions, with no queued active backlog. No dry run signs a transaction.
- Conditional orders: no active orders, HTTP 200, about 1.1 seconds.
- TP/SL: two active positions with no set triggers, HTTP 200, about 1.7 seconds.
  Neither result proves a fresh price update or a real fill.
- Liquidation: two active positions, HTTP 502, about 1.5 seconds, explicit
  `PYTH_API_KEY_MISSING` for IDs 65 and 90. **This is a failed trading check.**
- Database signer table remains empty. Existing user rows were not moved or
  edited. The previously verified coordination and anonymous-access migrations
  remain applied; runtime tables now contain real dry-run state/results.

## Blocking items

1. **Reown/WalletConnect project ID**: the only missing required frontend
   build variable. Recover the existing public project ID and check its allowed
   app origin. Do not substitute a random ID to make a build pass.
2. **Pyth access**: official documentation says all Hermes users need an API
   key following the 26 August 2026 upgrade. Public requests from this runner
   returned HTTP 403 / Cloudflare 1010; that response alone does not establish
   an authentication failure. The keeper now supports server-only
   `PYTH_API_KEY` and distinguishes missing keys, authentication failures, rate
   limits and upstream outages. Never put this key in a `VITE_` variable.
   The browser's existing REST/SSE/history calls still require a protected
   server integration and end-to-end verification. The documented free trial
   is not perpetual free access; paid plans cover ongoing use. No subscription
   or trial has been activated by this migration.
3. **Gas sponsor**: `VELO_SPONSOR_PRIVATE_KEY` is still missing. Recover the
   original key or explicitly choose a funded testnet sponsor. The recovered
   contract-owner key has not been silently repurposed for sponsorship.

The Vercel connector still lacks team-scoped environment access (403). Its
export supplied placeholders for every app value; it was not a usable backup.
Three CDP variables from the inventory remain unrecovered but have no consumers
in the current source. GA configuration is also absent. Preserve Vercel projects
and settings until the remaining inventory and Preview settings are reconciled.

## Before cutover

Resolve those dependencies; build/test the frontend on Pages; check login,
wallets, API routing, price updates, storage and Supabase redirects. Rerun all
keepers against fresh prices, then coordinate stopping old Vercel writers
before enabling any new signer. Activate the minute schedule only after all
three real execution paths are tested on Base Sepolia. Attach the app domain
and change DNS after the application is ready. Do not claim flawless operation.

Existing signed-in cross-user database RPC authorization still needs a separate
review. Bounded scan/execution work may span multiple ticks under load. Free
hosting quotas and Pyth access are separate constraints.

Pyth reference: https://docs.pyth.network/price-feeds/core/upgrade/preparing
