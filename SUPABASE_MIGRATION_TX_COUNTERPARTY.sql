-- SUPABASE_MIGRATION_TX_COUNTERPARTY.sql
--
-- Adds the `counterparty` column to the transactions table so that
-- SEND/RECEIVE rows can show "Sent to @alice" / "Received from @bob" in
-- the Recent Activity feed.
--
-- Idempotent — safe to re-run.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS counterparty text;

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_type_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_type_check
  CHECK (type IN ('DEPOSIT','WITHDRAW','SEND','RECEIVE'));

COMMENT ON COLUMN public.transactions.counterparty IS
  'For SEND/RECEIVE rows: the displayed counterparty label (e.g. "@alice" or "0x123…abcd"). Null for DEPOSIT/WITHDRAW.';

-- Supabase/PostgREST can keep serving a stale schema cache after a migration.
-- Trigger a reload so new columns/constraints are visible immediately.
NOTIFY pgrst, 'reload schema';
