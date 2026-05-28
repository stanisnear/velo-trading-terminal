-- SUPABASE_MIGRATION_BUILD107.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Fixes two critical issues:
--
--   1. Recent Activity / transaction history disappears on page refresh.
--      Root cause: the transactions table type CHECK constraint on some
--      deployments only allowed DEPOSIT/WITHDRAW, silently rejecting SEND
--      and RECEIVE inserts. Optimistic UI rows appeared live then vanished.
--      Fix: drop + recreate constraint to include all four types.
--
--   2. Send funds fails from other account (receiver never gets activity row).
--      Root cause: record_transaction_for_user and create_notification_for_user
--      are called as Supabase RPC functions, but those functions were never
--      deployed. The direct-insert fallback in supabaseStore.ts is blocked by
--      RLS (auth.uid() ≠ target_user_id). The receiver's RECEIVE row was
--      silently dropped every time.
--      Fix: create both functions as SECURITY DEFINER so they can write rows
--      for any user from any authenticated caller.
--
-- Safe to run multiple times — all DDL is idempotent (IF NOT EXISTS / OR REPLACE).
-- Run via Supabase SQL Editor as project owner (service role).
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Fix the transactions type CHECK constraint ─────────────────────────
--
-- Earlier schema versions may have been created with only DEPOSIT/WITHDRAW.
-- We drop the named constraint and recreate it with all four valid types.
-- If the constraint name differs in your DB, check with:
--   SELECT conname FROM pg_constraint WHERE conrelid = 'public.transactions'::regclass;

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_type_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_type_check
    CHECK (type IN ('DEPOSIT', 'WITHDRAW', 'SEND', 'RECEIVE'));

-- Also ensure the status constraint is correct
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_status_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_status_check
    CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED'));

-- Ensure all needed columns exist (idempotent)
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS on_chain      BOOLEAN DEFAULT FALSE;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS tx_hash       TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS withdraw_nonce BIGINT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS counterparty  TEXT;


-- ── 2. RLS policies — ensure SELECT + INSERT are open for own rows ─────────

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own transactions"             ON public.transactions;
DROP POLICY IF EXISTS "Users read own transactions"  ON public.transactions;
DROP POLICY IF EXISTS "Users insert own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users update own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users delete own transactions" ON public.transactions;

CREATE POLICY "Users read own transactions"
  ON public.transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own transactions"
  ON public.transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own transactions"
  ON public.transactions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own transactions"
  ON public.transactions FOR DELETE
  USING (auth.uid() = user_id);


-- ── 3. Notification RLS — ensure own rows are readable/writable ───────────

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own notifications"              ON public.notifications;
DROP POLICY IF EXISTS "Users read own notifications"   ON public.notifications;
DROP POLICY IF EXISTS "Users insert own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users delete own notifications" ON public.notifications;

CREATE POLICY "Users read own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own notifications"
  ON public.notifications FOR DELETE
  USING (auth.uid() = user_id);


-- ── 4. create_notification_for_user (SECURITY DEFINER) ───────────────────
--
-- Inserts a notification row for ANOTHER user (e.g. the recipient of a
-- peer-to-peer transfer). Standard RLS prevents authenticated users from
-- writing rows where user_id ≠ auth.uid(). SECURITY DEFINER bypasses RLS
-- and runs with the function owner's privileges instead.
--
-- Called by supabaseStore.ts → createNotificationForUser().
-- Falls back to a direct insert if the function doesn't exist (42883).

CREATE OR REPLACE FUNCTION public.create_notification_for_user(
  target_user_id UUID,
  p_type         TEXT,
  p_message      TEXT,
  p_related_id   TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate that the target user actually exists to avoid orphaned rows.
  -- Silently no-op if they don't (e.g. anonymous address with no profile).
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = target_user_id) THEN
    RETURN;
  END IF;

  INSERT INTO public.notifications (user_id, type, message, related_id, read)
  VALUES (target_user_id, p_type, p_message, p_related_id, FALSE);
END;
$$;

-- Grant execute to authenticated users (they are the callers)
GRANT EXECUTE ON FUNCTION public.create_notification_for_user(UUID, TEXT, TEXT, TEXT)
  TO authenticated;


-- ── 5. record_transaction_for_user (SECURITY DEFINER) ────────────────────
--
-- Inserts a transaction row for ANOTHER user (e.g. a RECEIVE row for the
-- recipient of a peer-to-peer send). Same SECURITY DEFINER pattern.
-- SEND/RECEIVE rows never adjust profile.balance — they are activity-feed
-- only. So this function never touches the profiles table.
--
-- Called by supabaseStore.ts → recordTransactionForUser().

CREATE OR REPLACE FUNCTION public.record_transaction_for_user(
  target_user_id UUID,
  p_type         TEXT,
  p_amount       NUMERIC,
  p_tx_hash      TEXT    DEFAULT NULL,
  p_counterparty TEXT    DEFAULT NULL,
  p_on_chain     BOOLEAN DEFAULT TRUE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate type to avoid bad data slipping through the SECURITY DEFINER path.
  IF p_type NOT IN ('DEPOSIT', 'WITHDRAW', 'SEND', 'RECEIVE') THEN
    RAISE EXCEPTION 'Invalid transaction type: %', p_type;
  END IF;

  -- Silently no-op if target user doesn't exist.
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = target_user_id) THEN
    RETURN;
  END IF;

  INSERT INTO public.transactions
    (user_id, type, amount, status, on_chain, tx_hash, counterparty)
  VALUES
    (target_user_id, p_type, p_amount, 'COMPLETED', p_on_chain, p_tx_hash, p_counterparty);
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.record_transaction_for_user(UUID, TEXT, NUMERIC, TEXT, TEXT, BOOLEAN)
  TO authenticated;


-- ── 6. Ensure realtime is enabled for transactions ────────────────────────

ALTER TABLE public.transactions REPLICA IDENTITY FULL;

-- If not already in the realtime publication, add it.
-- Safe to run even if it's already there (DO block prevents the error).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'transactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
  END IF;
END $$;


-- ── Smoke tests (run as authenticated user to verify) ─────────────────────
-- SELECT count(*) FROM public.transactions  WHERE user_id = auth.uid();
-- SELECT count(*) FROM public.notifications WHERE user_id = auth.uid();
-- SELECT public.record_transaction_for_user(auth.uid(), 'RECEIVE', 1.00, NULL, '@smoke-test', TRUE);
-- SELECT count(*) FROM public.transactions WHERE counterparty = '@smoke-test' AND user_id = auth.uid();
-- DELETE FROM public.transactions WHERE counterparty = '@smoke-test';
