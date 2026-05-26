-- SUPABASE_MIGRATION_RLS_ACTIVITY.sql
--
-- Re-applies the SELECT/INSERT/UPDATE/DELETE policies for trade_history and
-- transactions so the authenticated user can read/write their own activity.
--
-- Why this exists: Stan's testing showed Recent Activity rows appearing live
-- (e.g. "CLOSE SOL/USD LONG · 10x · +$0.06") then DISAPPEARING on refresh,
-- with Win Rate dropping from 100% to 0% and Realized PnL going from $0.06
-- to $0.00. That pattern is the smoking gun for one of:
--
--   (a) RLS INSERT policy on trade_history / transactions is missing or
--       restrictive — the row never landed in the DB. Postgres returns no
--       error to a fire-and-forget client write in some configurations.
--   (b) RLS SELECT policy is missing — the row IS in the DB but the user's
--       JWT can't see it on next session.
--   (c) The `user_id` column doesn't match auth.uid() at write time (less
--       likely given Supabase auth, but happens with some auth-helper bugs).
--
-- This script enforces (a) and (b) idempotently. It's safe to run repeatedly.
-- Drops policies by name then recreates — RLS itself stays ENABLED (which is
-- correct; never disable RLS on a user-data table).
--
-- Run via Supabase SQL Editor as project owner (service role).
--
-- After running, the in-app persistence-error broadcaster (batch 7) will
-- surface any remaining write failures as a visible toast. If a row STILL
-- fails to persist after this migration, the toast tells you the exact
-- Postgres error code so the root cause is no longer guessable.

-- ── trade_history ─────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.trade_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own trade history"   ON public.trade_history;
DROP POLICY IF EXISTS "Users insert own trade history" ON public.trade_history;
DROP POLICY IF EXISTS "Users update own trade history" ON public.trade_history;
DROP POLICY IF EXISTS "Users delete own trade history" ON public.trade_history;

CREATE POLICY "Users read own trade history"
  ON public.trade_history
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own trade history"
  ON public.trade_history
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own trade history"
  ON public.trade_history
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own trade history"
  ON public.trade_history
  FOR DELETE
  USING (auth.uid() = user_id);

-- ── transactions ──────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own transactions"   ON public.transactions;
DROP POLICY IF EXISTS "Users insert own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users update own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users delete own transactions" ON public.transactions;

CREATE POLICY "Users read own transactions"
  ON public.transactions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own transactions"
  ON public.transactions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own transactions"
  ON public.transactions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own transactions"
  ON public.transactions
  FOR DELETE
  USING (auth.uid() = user_id);

-- ── Smoke test ────────────────────────────────────────────────────────────
-- Run these as an authenticated user (Supabase SQL editor → "Run as user").
-- They should each return > 0 if the user has any activity. If they return
-- 0 but the in-memory UI shows rows, RLS SELECT is broken.
--   SELECT count(*) FROM public.trade_history WHERE user_id = auth.uid();
--   SELECT count(*) FROM public.transactions  WHERE user_id = auth.uid();
