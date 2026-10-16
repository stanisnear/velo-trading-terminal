> Historical migration record. Current status and security limitations: [15 October engineering audit](../docs/AUDIT-2026-10-15.md), [feature matrix](../FEATURES.md) and [operator guide](../CLOUDFLARE.md). Later changes supersede older verification claims.

# Migration status — 14 October 2026

**Cloudflare handover activated. The app domain is active, automatic frontend
updates are enabled, and minute jobs execute on Base Sepolia. Confirmed receipts
cover gas sponsorship, liquidation, a limit-order fill and a take-profit close.
Browser/account checks remain explicitly open.**

## Deployed and connected

- Terminal: https://app.velotrading.live (also velo-trading-terminal.pages.dev).
  Production branch: `codex/cloudflare-migration`. Build:
  `npm run build:cloudflare`, output `dist`. Production pushes deploy
  automatically; Preview builds remain disabled.
- Pages has 21 production settings: 19 public VITE_ values, the backend URL
  and encrypted gateway token. All 16 required public variables in the original
  inventory are present. No wallet/provider private key is in the browser bundle.
- `VELO_PYTH` binds Pages to private Worker `velo-pyth-proxy`. Its provider key
  is encrypted, its workers.dev/preview URLs are disabled, and auth/IP/user/stream
  limits protect narrow feed/history routes. The Supabase anon key is public.
- Supabase `velo-api` and `velo-keepers` are ACTIVE, version 7. Six recovered
  contract secrets plus the owner's Pyth secret are installed. The sponsor key
  matches the imported keeper key; deliberate reuse requires the expected address.
- `velo-keeper-scheduler`: `* * * * *`, enabled=true, dry-run=false, separate
  secret token, no public endpoint. Backend execution and sponsorship are enabled.
  Explicit false secret overrides provide emergency stops.
- `app.velotrading.live` is active in Pages, including domain and certificate
  validation. Its proxied CNAME targets `velo-trading-terminal.pages.dev`.
  The root/www landing and email DNS were not changed. The cancelled newer
  landing upload was not published.
- Temporary `velo-migration-check` remains retired, returning only HTTP 404.

## Verification

- All 53 Node regression checks pass, including authentication, credential
  confinement, response bounds, redirects, SSE parsing, scheduler sequencing,
  contract math, idempotency, signer coordination and bounded transport retries.
- Both exact v7 backend bundles pass Deno 2.2.6 runtime/authentication tests
  without network access or wallet credentials. The explicit emergency-stop
  override is tested even though deployed defaults are now enabled.
- Cloudflare's Git build succeeds. Before cutover, browser verification showed
  the Pages interface and public TradingView/Pyth chart. Public stats returned
  HTTP 200; crawler metadata returned HTML; cron routes were not publicly exposed.
- Private Pyth routes reject missing and invalid sessions. The Worker uses
  manual redirects and rejects forwarding credentials to another origin.
  The supplied provider key retrieves signed Hermes updates and valid OHLC
  candles. Live keepers use fresh Pyth prices and exact on-chain update fees.
- The actual timer passed consecutive dry-run ticks from about 07:26 UTC,
  then live ticks from 12:34 UTC. Cloudflare logs and Supabase run IDs confirm
  scheduled execution. All three jobs report dryRun=false and successful results.
- Historical and active backlogs are clear. Position 65 was liquidated in
  block 48106507; its on-chain owner is now zero.
- A dedicated wallet received 0.01 test ETH through the deployed sponsor API,
  minted mock USDC and placed a 1 mock-USDC / 1x long limit order (ID 21).
  The real timer filled it into position 104. A narrow valid TP/SL bracket was
  set; the next scheduled job closed it via take profit.
- Independent RPC reads verified successful receipts, matching contract events,
  actors and IDs. The test wallet has no open orders/positions. The keeper's
  latest/pending nonces both equal 201 after these checks. No real-money or
  mainnet transaction was used.
- Full public evidence is in LIVE-VERIFICATION.json. The live order test covered
  a long limit order; stop-loss/stop and other trigger combinations have
  regression coverage, not separate live receipts.

| Check | Confirmed Base Sepolia transaction |
| --- | --- |
| Liquidation, position 65 | 0xba977cc4673f9f5da5652988178d1d21c8c71ad8ba5c10346bcc512ea1f575a6 |
| Gas sponsorship, 0.01 test ETH | 0x43176e7d01d07855a36637b8b1167e689cf2192328f6a5ac0495e681b8d4e343 |
| Limit order 21 → position 104 | 0xfe496761ee39e6d2e6d0ee9ef681bfbe8e35a98dc845e7c5fb02ab40c1f8a225 |
| Take profit, position 104 | 0x80f7af014f9912c0c95f06d87f148e03b76ea450cfbdcb30b5e4098ad33c2c39 |

## Vercel handover

Vercel project reads work, but pause/environment operations returned a team-scope
403. The owner confirmed **paused** at 12:30 UTC / 14:30 Europe/Rome.
Before activation, latest and pending wallet nonces both equalled 197 and the
new signer table was empty. Vercel settings are preserved. Keep the old project
paused while the new transaction writers are enabled.

## Remaining checks and limits

Cloudflare reports the custom domain active, but this environment's browser
returned ERR_BLOCKED_BY_CLIENT for it; its HTTP client returned 403. This
prevents a final visual check here and is not proof of failure in the owner's
browser. Real sign-in, wallet authorization, authenticated browser Pyth delivery
and user-owned storage changes still need end-to-end checks on the final origin.
Reown metadata already uses that origin; see CONNECT-SERVICES.md.

Optional GA and unused CDP settings remain unreconciled. Existing signed-in
social/activity RPC authorization has concrete pre-existing gaps, recorded in
KNOWN-ISSUES.md. This is not a complete security audit.

Free hosting has usage limits. Pyth access and Namecheap domain renewal are
separate costs. No paid subscription or model service was activated.

## Recheck at 19:22 Europe/Rome / 17:22 UTC

Supabase v7 remained active. Each job had completed at least 288 live runs since
activation, with no recorded backend failures and no pending signed transaction.
Cloudflare still reported the app domain/certificate active. The two later Velo
rebrand commits were preserved; commit 739396aff5056b18bf9a5e2cb69f98335ae7ba0b
had successfully deployed at 16:35 UTC. This recheck does not close the browser
and signed-in account checks described above.

Cloudflare logs also revealed one TP/SL HTTP 520 at 15:52:36 UTC. It did not
reach the backend; the next minute recovered, so the backend's zero-failure
count alone did not capture this delivery failure. No claim of uninterrupted
delivery is made.

At 17:31:44 UTC the scheduler was updated to retry network failures and HTTP
520–524 once, with the same request/run ID and a one-second delay. Retries share
the 120-second per-job budget; no requests start after scheduled time +270 seconds.
Authentication, redirects, job-busy responses and backend failure results are
not retried. Six added regression checks cover recovery, identical payloads,
retry limits, non-retryable errors and exhausted deadlines. The production
trigger, secrets and enabled execution mode were preserved.
