# Reliability update — 16 October 2026

## Close requests

Base Sepolia reads now use PublicNode (or the configured primary RPC) with a bounded fallback to the official `https://sepolia.base.org` endpoint. Each provider gets six seconds. Contract reverts and wallet rejection are not retried against another provider. Signing and transaction submission are never replayed by this transport.

If a locally signed transaction loses its broadcast response, its hash is computed from the exact signed bytes and preserved through viem's nested errors. The pending-transaction guard then checks receipts and prevents another trade from being sent automatically. A persistent provider outage or an unpropagated transaction still requires investigation; a missing receipt is not proof that a transaction failed. This is not an instant-execution or uptime guarantee. Injected-wallet transport remains controlled by that wallet.

## Shared conversations

Shared post/comment pages fetch the complete conversation even when a feed preview is cached. They distinguish loading, request failure with Retry, confirmed absence of a post, and an unavailable reply within an existing post. Late responses from a previous route cannot replace the current route.

Replies use a client-generated UUID and an insert that ignores duplicate IDs. A lost response is reconciled by reading that same UUID. The same in-memory draft retry retains its ID; a full browser reload does not retain that pending draft identity. Unconfirmed replies are not displayed as posted and cannot produce temporary share links. Successful replies are placed in the shared feed cache. Local deletion removes all descendants after database confirmation.

Public feed re-sync uses the anonymous read client, so it does not wait for a private-session refresh lock. Failed comment/like/repost reads cannot silently overwrite a conversation with empty results.

## Database change

`20261016064826_comment_thread_integrity.sql` adds indexes on comment post/date/ID and author, a same-post parent foreign key, a self-parent check, and a trigger preventing changes to comment identity/author/thread. Before migration: three comments, zero cross-post parents, zero self-parents, zero cycles. After migration: all three constraints validated, both new lookup indexes present, trigger installed, comment count still three. No account, email, password, session, or policy cleanup is part of this migration.

The rollback-only two-user SQL fixture could not run through the connector: both attempts returned `Invalid or expired requestState`. Do not count that as a passed integration test. The fixture is retained for a connected staging database.

## Verification and remaining work

101 Node tests passed, including RPC failures through the real viem wrapper, ambiguous reply retries, nested deletion, and shared-page loading/retry/navigation. TypeScript and the Cloudflare production build passed. Tests use mocked RPC/oracle data and consume no live Pyth usage. The existing seven Solidity tests still include three deliberate reproductions of defects in V3.1; those passing reproductions are evidence of defects, not contract approval.

Live signed-wallet/browser/mobile acceptance remains outstanding. Existing cross positions retain their exit paths; new cross margin remains disabled. The V4 isolated-margin candidate is separate from the live contract and must not replace its address until trading/keeper/indexer/UI parity and a legacy exit path have passed acceptance. See the contract migration specification when available. Previously documented authentication, trusted history, dependency, and keeper reliability risks remain open.

Reference: [official Base network endpoints](https://docs.base.org/get-started/connect-to-base).
