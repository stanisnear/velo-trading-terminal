# Remaining limits and pre-existing issues

These findings distinguish hosting checks from a full application/security audit.
The active contracts and app are on testnets.

- Real login, wallet authorization, user-owned storage changes, gas sponsorship
  and actual order/TP/SL fills require end-to-end checks after the writer handover.
- `record_transaction_for_user` and `create_notification_for_user` are existing
  SECURITY DEFINER RPCs callable by authenticated users. Their live bodies accept
  arbitrary target users and caller-provided activity data without checking the
  underlying action. They do not transfer on-chain funds, but can forge activity
  and notifications. A repair must preserve legitimate transfer/social delivery,
  with server-side action verification, rather than simply disabling that UX.
- Existing increment/decrement follow-count RPCs do not authorize the supplied
  follower ID or recompute counts from the follows table. They need ownership
  checks and idempotent count reconciliation. Anonymous execution is already
  revoked by this migration; signed-in abuse remains possible.
- Profile balances/activity supplied by the client are not authoritative proof
  of on-chain ownership or funds. Do not use them for financial authorization.
- Optional Google Analytics lacks configuration. Three inventoried CDP settings
  have no consumers in the current source and remain unreconciled.
- Vercel pause/environment operations reject this connection with a team-scope
  403. Do not retry unchanged, expose write-only secrets through debugging, or
  remove its projects before configuration reconciliation is complete.
- Public browser checks show an existing development Tailwind CDN warning and
  a WalletConnect metadata-origin warning on pages.dev. The configured wallet
  origin is the final app.velotrading.live domain. Public chart and interface
  rendering were verified; these warnings are not proof of broken login.
- Pyth provider access and hosting quotas need ongoing monitoring. Free hosting
  does not make an external oracle subscription permanently free.
