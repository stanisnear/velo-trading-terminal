-- SUPABASE_MIGRATION_TX_COUNTERPARTY.sql
--
-- Adds the `counterparty` column to the transactions table so that
-- SEND/RECEIVE rows can show "Sent to @alice" / "Received from @bob" in
-- the Recent Activity feed.
--
-- Idempotent — safe to re-run.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS counterparty text;

COMMENT ON COLUMN public.transactions.counterparty IS
  'For SEND/RECEIVE rows: the displayed counterparty label (e.g. "@alice" or "0x123…abcd"). Null for DEPOSIT/WITHDRAW.';
