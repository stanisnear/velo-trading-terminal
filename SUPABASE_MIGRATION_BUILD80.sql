-- ══════════════════════════════════════════════════════════════════
-- VELO BUILD 80 — Wall-delete RLS + admin-controlled verification
-- ══════════════════════════════════════════════════════════════════
-- Idempotent. Safe to run against an existing database. Run this in
-- Supabase → SQL Editor → New Query → Run.
--
-- What this migration does:
--   1. Adds `posts.target_profile_id` if missing (no-op if already there).
--   2. Replaces the posts DELETE policy so wall owners can moderate posts
--      left on their profile, not just authors.
--   3. Adds `profiles.verified_reason` with a CHECK constraint enumerating
--      the supported reasons (VELO_TEAM, FOUNDER, INVESTOR, CONTRIBUTOR,
--      VERIFIED_TESTER, PARTNER).
--   4. Creates a `velo_admins` allowlist table + `admin_set_verification`
--      SECURITY DEFINER RPC so admins can verify users without weakening
--      the existing "Self update" RLS on profiles.
--   5. Reloads the PostgREST schema cache so the new column + RPC are
--      visible to the JS client immediately.
--
-- After running:
--   • Insert YOUR Supabase user id into velo_admins to grant yourself
--     admin powers. Find your id in Supabase → Authentication → Users.
--     Example: INSERT INTO velo_admins(user_id, note)
--              VALUES ('00000000-0000-0000-0000-000000000000', 'Stan');
--   • Then the in-app Admin Panel → Verifications section lets you
--     verify any user from the UI.
-- ══════════════════════════════════════════════════════════════════

-- 1. Wall-post column (idempotent — no-op if already present) ─────────
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS target_profile_id UUID
  REFERENCES public.profiles(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS posts_target_profile_idx ON public.posts(target_profile_id);

-- 2. Wall-delete RLS policy ────────────────────────────────────────────
-- Wall owners (target_profile_id) now get DELETE permission alongside the
-- author. Drop+recreate so the policy switches cleanly from author-only.
DROP POLICY IF EXISTS "Own delete posts"  ON public.posts;
DROP POLICY IF EXISTS "Wall delete posts" ON public.posts;
CREATE POLICY "Own delete posts" ON public.posts FOR DELETE
  USING (auth.uid() = author_id OR auth.uid() = target_profile_id);

-- 3. Verification column on profiles ──────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verified_reason TEXT;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_verified_reason_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_verified_reason_check
  CHECK (verified_reason IS NULL OR verified_reason IN
    ('VELO_TEAM','FOUNDER','INVESTOR','CONTRIBUTOR','VERIFIED_TESTER','PARTNER'));
CREATE INDEX IF NOT EXISTS profiles_verified_reason_idx
  ON public.profiles (verified_reason)
  WHERE verified_reason IS NOT NULL;

-- 4. Admin allowlist + RPC ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.velo_admins (
  user_id    UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  added_at   TIMESTAMPTZ DEFAULT NOW(),
  note       TEXT
);
ALTER TABLE public.velo_admins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read" ON public.velo_admins;
CREATE POLICY "Admins read" ON public.velo_admins FOR SELECT
  USING (auth.uid() IN (SELECT user_id FROM public.velo_admins));

CREATE OR REPLACE FUNCTION public.is_velo_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.velo_admins WHERE user_id = auth.uid());
$$;
GRANT EXECUTE ON FUNCTION public.is_velo_admin() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_verification(
  target_user_id UUID,
  new_reason     TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_velo_admin() THEN
    RAISE EXCEPTION 'Not authorized: caller is not an admin';
  END IF;
  IF new_reason IS NOT NULL AND new_reason NOT IN
    ('VELO_TEAM','FOUNDER','INVESTOR','CONTRIBUTOR','VERIFIED_TESTER','PARTNER') THEN
    RAISE EXCEPTION 'Invalid verification reason: %', new_reason;
  END IF;
  UPDATE public.profiles
     SET verified_reason = new_reason
   WHERE id = target_user_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_set_verification(UUID, TEXT) TO authenticated;

-- 5. Force PostgREST schema reload ────────────────────────────────────
NOTIFY pgrst, 'reload schema';
