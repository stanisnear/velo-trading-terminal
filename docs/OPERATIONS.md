# Velo operations

This runbook covers the public Base Sepolia deployment. Keep operator keys and provider credentials in their server environments. Use separate release and rollback procedures for frontend, database and contract changes.

## Deployment inventory

| Surface | Service / source | Production destination |
| --- | --- | --- |
| Terminal | Pages `velo-trading-terminal` / `stanisnear/velo-trading-terminal` | `app.velotrading.live` |
| Website/docs/blog | Pages `velo-landing` / `stanisnear/Velo-Landing` | `velotrading.live`, `www.velotrading.live` |
| Public API gateway | `cloudflare/worker.js`, packaged with terminal build | `/api/*`, allow-listed routes only |
| Prices | Worker `velo-pyth-proxy` | Private `VELO_PYTH` service binding |
| Scheduling | Worker `velo-keeper-scheduler` | One-minute cron, exactly one scheduler |
| Backend | Supabase project `btgfoekgvyvdflzjfehz` | `velo-api`, `velo-keepers` Edge Functions |
| Domain | Namecheap registrar, Cloudflare DNS/HTTPS | Public DNS and TLS |

Both Pages projects use **`codex/cloudflare-migration`** as their configured production branch. Keep `main` and the deployment branch in sync. Confirm the configured branch in Pages before releasing.

## Sharing and presentation releases

Use [SHARING.md](SHARING.md) for product semantics and component ownership. A docs or caption-only release does not require new trades, SQL changes, signer access or contract deployment. For app sharing changes, verify preserved drafts; compact versus image format; amount masking in export and details; independent light/dark appearance; live settlement versus frozen capture; unavailable-receipt states; and focus restoration. Exercise publishing/Storage with disposable fixtures only when that path changes.

Keep the app, public guide and landing page aligned on markets, fees and sharing behavior. Use the deployment manifest and archived release evidence when updating these claims.

## Configuration and secrets

| Location | Configuration |
| --- | --- |
| Public frontend | `VITE_*` RPC/bridge/Reown addresses and contract settings. `VITE_VELO_PERPS_V4_ACTIVE=true`, V4 address `0xE9AEcFbc5814ce3b2dB0107594d80F054e6dB52f`. Builder Code defaults to `bc_s0k82w2v` |
| Pages runtime | `VELO_BACKEND_URL`, `VELO_PROXY_TOKEN`, private `VELO_PYTH` binding, server-only `CMC_API_KEY` |
| Pyth Worker | Server-only `PYTH_API_KEY`, reviewed auth/rate-limit bindings |
| Supabase functions / scheduler | Service credentials, gateway/cron authorization, oracle access and signer configuration as required by the function source. These are separate from Pages settings |
| Local development | Ignored `.env.local` for necessary configuration; optional `.env.cmc.local` for local reference-data middleware. Never commit these files |

`supabase/functions/_shared/public-config.js` contains public defaults, not credentials. Hosted settings can override those defaults. Confirm active engine, oracle and market settings across **frontend and keepers**, not just one build. Retain old address variables for explicit legacy exit tooling; an old variable's presence does not make it the active engine.

Do not put signer, provider or service-role secrets in `VITE_*`, screenshots, logs or funding attachments. The public anon key is not a service-role key. Operator/keeper signing keys are server-side; the user's browser trading key is a separate full-key security risk described in [Architecture](ARCHITECTURE.md).

## Local checks

Use the Node version required by the locked dependencies (the UI test suite uses jsdom 27; Node 22.12+ is a suitable supported runtime).

```sh
npm ci
npm run dev -- --host 127.0.0.1 --port 4173
npm run typecheck
npm test
npm run build:cloudflare
```

The Cloudflare build checks required process environment variables; provide the public build settings from `scripts/check-cloudflare-env.mjs` without printing their values. Vite supplies public defaults to source code but is not a full local Cloudflare/Supabase emulator. Configure a reviewed development gateway for authenticated API/price testing rather than putting private service credentials into frontend code. `npm run build:supabase` creates ignored bundles for separate backend deployment; it sends no transactions and applies no migrations.

## Release checklist

1. Read README/VISION and the affected sources. Keep the working tree scoped; preserve contracts, migration history and unrelated changes.
2. For a contract change, run the Foundry suite and regenerate the ABI with `node scripts/generate-v4-abi.mjs`. Check the [manifest](../contracts/deployments/base_sepolia.json), live chain ID/version, oracle/feed IDs, risk caps, owner/guardian and pool reserves. A deployment needs its own source verification and acceptance plan.
3. Run TypeScript, relevant Node tests and the production build. For UI changes, inspect both themes and mobile/desktop, including focus, scroll and reduced motion.
4. Push the intended commit to the configured Pages branch. Confirm the **Cloudflare Pages check for that commit**, then verify the custom domain is serving its actual asset hashes. A saved Git commit alone is not publication.
5. Deploy affected standalone Workers or Supabase functions separately using the current authenticated tooling; consult CLI help before using version-sensitive flags. Avoid deploying unchanged backend code just to publish documentation.
6. Apply reviewed SQL changes separately with backups and explicit migration-history review. A frontend deployment does not apply SQL.
7. Verify a disposable Base Sepolia identity through the changed flow, confirm receipts and leave no test position/order open. No mainnet wallet or real collateral belongs in this test.
8. Record commit, deployment result, test evidence, outstanding limitations and documentation changes. Source verification and tests are not an independent audit.

The explicit opt-in acceptance script is:

```sh
node scripts/testnet-acceptance.mjs --live-testnet --faucet-transfer --trade --v4 --pair=HYPE-USD --with-triggers
```

This signs and sends **testnet** transactions using an ignored disposable fixture in `audit/`, may consume oracle/provider quota, and establishes a test identity. It is not part of `npm test`. Reuse a fixture only within its test workflow; do not attach its key/session to a funding application. Faucet cooldowns may mean an existing fixture does not mint again.

## Recovery and monitoring

- If a transaction is unresolved, use its original hash, receipt and signed-byte recovery path. Do not clear transaction journals or send a replacement action automatically. Network recovery is not proof of execution.
- If login stalls, cancel or switch wallet in the dialog. Approve/reject any still-open provider prompt before retrying. Refreshing or clearing all browser storage is not the primary fix and can destroy trading-wallet recovery material.
- Check scheduler runs, signer state, gas, fresh oracle access and RPC health. `velo_internal.keeper_runs` records scans/executions/errors; a scan that executed nothing may be valid. Never start another scheduler on the same signer as a workaround.
- Verify incoming transfers from successful token events and distinguish collateral settlement from external funding. Retain records for reconciliation rather than deleting duplicates blindly.
- For a bad frontend release, use Pages rollback and revert the source commit. Rollback does not revert SQL, functions, contract state or wallets. Keep V4 routing in a compatible build; never roll back to a legacy-only writer.
- For security/solvency concerns, investigate and use the reviewed entry-pause controls. Pausing new entries must not disable exits/cancellations. Escalate to the owner/guardian; do not improvise liquidity withdrawals.

## Database operations

Contact email belongs in `velo_internal.profile_contacts`, accessed through the account owner’s contact settings RPCs. The public profile compatibility column is constrained to null. Notification and receipt permissions keep recipient records private and verified events protected from browser writes.

The hosted migration history and local filenames have diverged in earlier releases. Compare the hosted schema and migration history before applying changes to another environment. The current folder contains incremental migrations and requires a baseline to rebuild the original schema. The receipt queue and cursor tables track reconciliation progress. Check pending age, failed attempts and duplicate event identity after an indexing release.
