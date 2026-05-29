-- SUPABASE_MIGRATION_PUBLIC_READ_FIX.sql
--
-- FIX: Social feed and Leaderboard are empty when logged IN, but populated when
-- logged OUT.
--
-- Root cause: these tables are meant to be world-readable (the leaderboard and
-- social feed show everyone). The deployed DB drifted so the SELECT path works
-- for the `anon` role (logged-out visitors) but not the `authenticated` role
-- (logged-in users) — either the read policy was scoped `TO anon`, or SELECT was
-- revoked from `authenticated`. The same client query (fetchAllProfiles /
-- fetchPosts) then returns rows for anon and nothing for authenticated, which is
-- exactly the observed behaviour.
--
-- This migration restores public read for BOTH roles on every world-readable
-- table by (a) re-granting SELECT to anon + authenticated and (b) adding a
-- permissive, all-roles `USING (true)` SELECT policy. Postgres OR's permissive
-- policies together, so this guarantees read access regardless of any other
-- existing read policy. It does NOT touch INSERT/UPDATE/DELETE policies, so
-- write security (own-rows-only) is unchanged.
--
-- Safe to run multiple times. Run it once in the Supabase SQL editor.

DO $$
DECLARE
  t text;
  public_read_tables text[] := ARRAY[
    'profiles',
    'posts',
    'likes',
    'reposts',
    'comments',
    'follows',
    'positions'
  ];
BEGIN
  FOREACH t IN ARRAY public_read_tables LOOP
    -- Only act on tables that actually exist in this DB.
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

      -- (a) Restore table-level read grant for both roles.
      EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated;', t);

      -- (b) Add a permissive, all-roles read policy. Drop-then-create so re-runs
      --     are clean. The name is intentionally distinct from any legacy policy
      --     so we never depend on knowing the old policy's name.
      EXECUTE format('DROP POLICY IF EXISTS "Public read all roles" ON public.%I;', t);
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

-- PostgREST caches the schema; nudge it so the new policies take effect immediately.
NOTIFY pgrst, 'reload schema';

-- ── Verify (optional) ─────────────────────────────────────────────────────────
-- After running, this should list a "Public read all roles" SELECT policy for
-- each table above, with roles {anon,authenticated}:
--
--   SELECT tablename, policyname, roles, cmd
--   FROM pg_policies
--   WHERE schemaname = 'public'
--     AND tablename IN ('profiles','posts','likes','reposts','comments','follows','positions')
--     AND cmd = 'SELECT'
--   ORDER BY tablename, policyname;
