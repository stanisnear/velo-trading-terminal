# Migration status — 13 October 2026

**Staged, not cut over. The terminal and live cron execution are not yet verified.**

## Deployed and verified

- Landing remains on Cloudflare Pages. The newer landing upload was cancelled
  at the user's request; this work changes the terminal only.
- Terminal Pages project `velo-trading-terminal` is created and linked to
  `stanisnear/velo-trading-terminal`, branch `codex/cloudflare-migration`.
  Automatic builds are paused; no frontend deployment or variables exist yet.
- Supabase `velo-api` version 2 and `velo-keepers` version 1 are ACTIVE.
  Live unauthenticated checks return 503 because required secrets are absent.
- Cloudflare `velo-keeper-scheduler` is deployed with execution disabled,
  dry-run mode selected, no schedules and no public workers.dev URL.
- Two database migrations are applied: `20261013065815_keeper_runtime_state`
  and `20261013070652_restrict_anonymous_mutations`. Existing user rows were
  not copied, deleted or edited.
- Five private runtime tables support active-item indexing, job deduplication,
  signer leases, pending transaction recovery and sponsor cooldowns.
- The old balance function's NULL authorization bypass is fixed. Anonymous
  access to ten mutating RPCs and two trigger helpers is revoked. Signed-in
  app calls and public profile reads retain their intended access.

## Verification evidence

- 32 Node tests passed for API/gateway behavior, scheduler routing, trigger
  math, bounded scans, exact Pyth fees, receipt statuses, duplicate delivery,
  signer locking, pending recovery and sponsorship cooldowns.
- Three Python tests passed for variable mapping, secret separation,
  multiline preservation and destination validation.
- Both deployment bundles load in Deno 2.2.6. Authentication/disabled paths,
  Node crypto, viem import and the HTML renderer were exercised without
  network calls or wallet transactions.
- Live SQL checks passed for job overlap, duplicate results, signer overlap,
  persisted pending transactions, cooldowns and private RPC permissions.
  Test data was rolled back; runtime tables remain empty.
- Live HTTP probes confirmed the API and all three keeper endpoints reject
  unconfigured calls. No transaction was submitted or cron activated.

## Current blocker

A fresh Vercel check recognizes user `stanisnear` and default team
`team_RDRP3vadkiN3qE9QSGkyvoFD`, but lists zero accessible teams and returns
HTTP 403 for environment variables in `stanisnears-projects`. No authenticated
CLI fallback exists in the assistant session. **No Vercel values have been
exported or transferred.**

The owner can restore team-scoped authorization or run
`migration/configure_services.py` locally. See CONNECT-SERVICES.md.
The helper prompts for unreadable original values and writes production
settings directly to Cloudflare/Supabase without sharing them in chat.
Preview settings remain separate on Vercel and Preview deploys remain off.

## Still required before cutover

1. Import and reconcile every production setting, including original signing
   keys, RPCs, contract addresses and unused CDP settings. Preserve Preview
   configuration separately; do not delete Vercel projects yet.
2. Build on Pages, exercise login/onboarding, sponsorship and API flows,
   validate Supabase redirects and external integrations.
3. Run keepers in dry-run mode; complete historical indexing, inspect active
   backlog and measure actual runtime against free-tier limits.
4. Disable old Vercel cron/sponsor writers, enable the new backend, activate
   the one-minute Cloudflare schedule, and verify all three actual transaction
   paths and successful receipts on Base Sepolia.
5. Switch app.velotrading.live only after those checks. Its DNS currently
   remains the Vercel CNAME, unproxied.

## Limits and open review

Bounded work can take several ticks under backlog; no sub-minute fill guarantee
is made. A complete security review of existing signed-in cross-user RPCs is
still outstanding. Supabase advisors also flag existing public read functions
and disabled leaked-password protection. Private runtime tables intentionally
have RLS with no client policies. None of these checks establishes that the
whole application works flawlessly without live configuration and testing.

See ../CLOUDFLARE.md for the hosting map, updates, monitoring and rollback.
