# Pending account/social cutover — not applied

`account-social-hardening.pending.sql` is a review artifact, deliberately outside `supabase/migrations`. Do not execute it automatically or include it in routine `db push`.

Automatic approval review rejected the original production action because it clears public emails, disables legacy wallet passwords, removes legacy sessions and changes many social/database policies. Those actions can lock users out or break social features. The owner needs to approve the concrete disruptive cutover; approval does not replace staging tests.

## What is already live

Signature login and per-account upgrade are live. New private contact APIs and owner-only notification reads were applied separately with `20261015003000_contact_api_notification_privacy.sql`. Historical public contact fields and unupgraded legacy credentials remain. The pending file is not evidence that its protections exist in production.

## Proposed impact

| Change | User impact / data treatment |
| --- | --- |
| Disable legacy wallet passwords and invalidate unupgraded sessions | Existing wallet users must sign in again. Wallet funds/keys/contracts are not moved; recovery must work with the owner wallet |
| Require verified wallet claims for application data operations | Older tabs/tokens cannot keep writing; reload/signature login needed |
| Keep contacts privately and clear public email fields | Contact preserved privately; public copy removed, not restored publicly as rollback |
| Protect identity/badge/count columns | User profile edits cannot assign trusted identity/badges or counters |
| Derive notifications/counts from committed social actions | Replaces caller-supplied cross-user RPC messages; follow/reply/mention behavior must be checked against current clients |
| Enforce avatar path ownership/update policy | Users can update their own avatar; cross-user replacement denied |
| Retire unverified received-transaction RPC | New verified receipt endpoint remains; older tabs must refresh |

## Required preflight before execution

1. Take a verified secure database/schema backup and record existing policies, grants and function definitions. Keep personal data and credentials out of GitHub and public reports. Confirm that restore is operational; free hosting is not a backup guarantee.
2. Apply the candidate to an isolated database with synthetic identities representing legacy wallet, upgraded wallet, normal account, admin and two unrelated users. The full candidate has **not** passed this rehearsal yet.
3. Test fresh and returning login, concurrent challenge reuse, wrong signer, smart-account behavior, old-password and old-JWT rejection, identity continuity and recovery after session invalidation.
4. Test post/reply/mention/like/repost/follow/unfollow exactly once, notifications and counters, private contact read/write, avatar create/replace/delete, admin boundaries and receipt-recording. Confirm every restrictive policy composes with existing permissive policies and Realtime.
5. Validate private contact copy counts without logging values. Confirm the updated frontend/backend is deployed and no required client still depends on permissive RPC behavior.
6. Review the diff and test evidence with the owner, then schedule a short account/social maintenance window. Keep trading close/cancel/withdraw access and relevant legacy keepers available.
7. Execute the approved transaction once, validate with two synthetic users, clean up fixtures and monitor login/social failures.

## Recovery boundaries

Rollback must be designed during rehearsal, with original schema definitions available. A frontend rollback does not undo SQL. Do not restore predictable passwords, public contact exposure or arbitrary cross-user writes to resolve an outage. If the new permissions fail, temporarily restrict affected social/account features, retain a secure signature-login path and deploy a narrow correction. Unrecoverable credential deletion is intentional; recovery is wallet signature login, not restoring the vulnerable login mechanism.

This is a proposed operational plan, not a claim that the broad cutover is approved, staged successfully or already deployed.
