# Finish the VELO connection

The six recovered contract settings are imported. Cloudflare settings and the
private service connections are staged. The terminal is **not yet live** on
Cloudflare, and new trading cron/sponsorship remain disabled.

No extra Cloudflare, Vercel or Supabase management tokens are needed for the
work already completed. Do not rerun the full import helper with only the
six-setting contracts file; it is not a full original production export.

## Remaining settings

### Reown project ID

Open https://dashboard.reown.com, select your existing VELO project, and copy
its **Project ID**. This is the public value used by
`VITE_WALLETCONNECT_PROJECT_ID`, not a wallet private key. It can be shared with
Codex to finish the Cloudflare build settings. Preserve the existing project
and allow `https://app.velotrading.live` as an application origin. Add the
specific Pages testing origin when testing there, rather than an unrestricted
wildcard.

### Pyth access

Pyth's official upgrade guide requires an API key for Hermes following
26 August 2026: https://docs.pyth.network/price-feeds/core/upgrade/preparing

If you already have a key, save it directly under `PYTH_API_KEY` in
https://supabase.com/dashboard/project/btgfoekgvyvdflzjfehz/functions/secrets
and tell Codex it is saved. Do not put it in a `VITE_` field or paste it into
chat. Backend code now supports that server-only setting.

If you do not have a key, https://pythdata.app offers a free trial, while the
current docs describe paid plans for ongoing use. A trial is not a permanent
free solution. No paid plan has been selected or started. Decide the ongoing
oracle-access approach before relying on the app for trading. Browser
REST/SSE/history calls also need a protected server integration and testing;
adding this backend key alone does not finish the frontend.

### Gas-sponsorship wallet

`VELO_SPONSOR_PRIVATE_KEY` was not in the recovered file. Recover the original
sponsor key and save it directly in the same Supabase Secrets page, or discuss
an explicit replacement wallet with Codex. The recovered `PRIVATE_KEY` is the
contract-owner/previous-keeper key; it has not been silently reused to fund
arbitrary user wallets. Sponsorship remains disabled.

## Final cutover

Codex will finish frontend/backend validation after those dependencies are
resolved. This includes fresh Pyth updates, login and wallet flow, sponsorship,
and all three actual keeper transaction paths on Base Sepolia. Existing Vercel
cron and sponsorship writers must be stopped before the new wallet writers
are enabled. A wallet-signed test order may need approval in your wallet.

Only then enable the Cloudflare minute schedule and switch the app domain.
The full operating guide is [../CLOUDFLARE.md](../CLOUDFLARE.md); current evidence
and limitations are [STATUS.md](STATUS.md).

The old Vercel export contains unreadable placeholders, not a usable backup.
Vercel team-scoped connector access is still unavailable. Preserve both Vercel
projects and Preview settings until the remaining inventory is reconciled.
