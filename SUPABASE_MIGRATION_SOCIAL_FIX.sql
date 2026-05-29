-- SUPABASE_MIGRATION_SOCIAL_FIX.sql
--
-- DEFINITIVE fix for Social feed and Leaderboard showing empty when logged in.
--
-- Root cause: the 'authenticated' role is being blocked from reading public
-- tables (profiles, posts, follows, etc.) by either a missing policy or an
-- overly restrictive existing policy scoped only to 'anon'.
--
-- This migration:
--  1. Re-grants SELECT on all social/public tables to anon + authenticated
--  2. Drops any old conflicting read policies and adds a single clean one
--  3. Creates a security-definer RPC `get_public_profiles` that bypasses RLS
--     entirely — this is the nuclear option that guarantees reads work even
--     if future policy changes re-break direct table access
--
-- Safe to run multiple times (idempotent). Run in Supabase SQL editor.

-- ── Step 1: Re-grant SELECT on public tables ──────────────────────────────────
DO $$
DECLARE
  t text;
  public_read_tables text[] := ARRAY[
    'profiles', 'posts', 'likes', 'reposts', 'comments', 'follows',
    'positions', 'trade_history', 'notifications'
  ];
BEGIN
  FOREACH t IN ARRAY public_read_tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
      EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated;', t);
      -- Drop old conflicting read policies first
      EXECUTE format('DROP POLICY IF EXISTS "Public read all roles" ON public.%I;', t);
      EXECUTE format('DROP POLICY IF EXISTS "public_read" ON public.%I;', t);
      EXECUTE format('DROP POLICY IF EXISTS "Allow public read" ON public.%I;', t);
      EXECUTE format('DROP POLICY IF EXISTS "Enable read access for all users" ON public.%I;', t);
      -- Create a clean, explicit all-roles read policy
      EXECUTE format(
        'CREATE POLICY "Public read all roles" ON public.%I FOR SELECT TO anon, authenticated USING (true);',
        t
      );
      RAISE NOTICE 'public read restored: %', t;
    ELSE
      RAISE NOTICE 'skipped (no such table): %', t;
    END IF;
  END LOOP;
END $$;

-- ── Step 2: Security-definer function as guaranteed fallback ──────────────────
-- This function runs as the DB owner (superuser), so RLS does NOT apply.
-- The frontend can call this via supabase.rpc('get_public_profiles', { lim: 100 })
-- if direct table reads keep failing due to RLS drift.
CREATE OR REPLACE FUNCTION public.get_public_profiles(lim integer DEFAULT 100)
RETURNS SETOF public.profiles
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.profiles
  ORDER BY pnl_total DESC NULLS LAST
  LIMIT lim;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_profiles(integer) TO anon, authenticated;

-- ── Step 3: Nudge PostgREST schema cache ─────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ── Verify ───────────────────────────────────────────────────────────────────
-- Run this to confirm policies are in place:
-- SELECT tablename, policyname, roles, cmd FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('profiles','posts','follows','likes','reposts','comments')
--   AND cmd = 'SELECT'
-- ORDER BY tablename;
