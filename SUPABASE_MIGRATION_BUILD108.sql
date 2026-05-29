-- SUPABASE_MIGRATION_BUILD108.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Fixes: Recent Activity / history disappears on page refresh.
--
-- Root cause: JWT timing race on page load.
--   1. Session cache loads user instantly with tradeHistory/transactionHistory = []
--   2. The activity refetch fires before Supabase JWT is active
--   3. RLS silently blocks the SELECT (no valid JWT yet) → returns []
--   4. restoreSession finishes but the React effect never re-fires (same user.id)
--
-- Code fixes (App.tsx + supabaseStore.ts) handle the race with authChecked dep
-- and retry logic. This migration ensures the DB side is also clean:
--   1. trade_history RLS — split FOR ALL into explicit per-operation policies
--      (FOR ALL with only USING= technically allows inserts but WITH CHECK is
--      the correct guard for INSERT/UPDATE; some Supabase versions enforce this)
--   2. Verify transactions constraint + RLS are correct (idempotent re-apply)
--   3. Add indexes that speed up the user-scoped SELECT queries on both tables
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. trade_history RLS — explicit per-operation policies ───────────────────

ALTER TABLE public.trade_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own trade history"        ON public.trade_history;
DROP POLICY IF EXISTS "Own trade history read"   ON public.trade_history;
DROP POLICY IF EXISTS "Own trade history write"  ON public.trade_history;
DROP POLICY IF EXISTS "Own trade history modify" ON public.trade_history;
DROP POLICY IF EXISTS "Own trade history delete" ON public.trade_history;

CREATE POLICY "Own trade history read"
  ON public.trade_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Own trade history write"
  ON public.trade_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Own trade history modify"
  ON public.trade_history FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Own trade history delete"
  ON public.trade_history FOR DELETE
  USING (auth.uid() = user_id);


-- ── 2. transactions RLS — re-apply to be safe (idempotent) ──────────────────

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own transactions"              ON public.transactions;
DROP POLICY IF EXISTS "Users read own transactions"   ON public.transactions;
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


-- ── 3. transactions type constraint — ensure all 4 types allowed ─────────────

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_type_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_type_check
    CHECK (type IN ('DEPOSIT', 'WITHDRAW', 'SEND', 'RECEIVE'));


-- ── 4. Performance indexes (idempotent) ──────────────────────────────────────
-- The user-scoped SELECT on page load does:
--   WHERE user_id = $1 ORDER BY created_at DESC
-- A composite index on (user_id, created_at DESC) makes this a fast index scan
-- instead of a sequential scan, which matters as activity rows accumulate.

CREATE INDEX IF NOT EXISTS transactions_user_created_idx
  ON public.transactions (user_id, created_at DESC);

-- trade_history index already exists in SUPABASE_SCHEMA.sql but recreate
-- idempotently in case the DB was initialised from an older snapshot.
CREATE INDEX IF NOT EXISTS trade_history_user_created_idx
  ON public.trade_history (user_id, created_at DESC);


-- ── 5. Realtime — ensure both tables publish INSERT events ───────────────────

ALTER TABLE public.transactions   REPLICA IDENTITY FULL;
ALTER TABLE public.trade_history  REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public' AND tablename = 'transactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public' AND tablename = 'trade_history'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.trade_history;
  END IF;
END $$;


-- ── Smoke tests (run as authenticated user) ───────────────────────────────────
-- SELECT count(*) FROM public.transactions  WHERE user_id = auth.uid();
-- SELECT count(*) FROM public.trade_history WHERE user_id = auth.uid();
